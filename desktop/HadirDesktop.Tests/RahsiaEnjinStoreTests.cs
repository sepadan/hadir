using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Tests for the read-only engine-config store. Every test works in an isolated
/// temp directory — the real companion files under
/// %LOCALAPPDATA%\HADIR-MOEIS-Companion\ are never read or written, and no real
/// engine secret appears anywhere in this file.
/// </summary>
public class RahsiaEnjinStoreTests : IDisposable
{
    private const string ApiUrlSah = "https://script.google.com/macros/s/UJIAN-BUKAN-SEBENAR/exec";

    private readonly string _dir;

    public RahsiaEnjinStoreTests()
    {
        _dir = Path.Combine(Path.GetTempPath(), "hadir-rahsia-ujian-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_dir);
    }

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ }
    }

    private void TulisRahsia(string json)
    {
        // Same DPAPI shape the companion writes: CurrentUser, NULL entropy.
        var dilindungi = ProtectedData.Protect(Encoding.UTF8.GetBytes(json), null, DataProtectionScope.CurrentUser);
        File.WriteAllBytes(Path.Combine(_dir, "rahsia.dat"), dilindungi);
    }

    private void TulisTetapan(string json) => File.WriteAllText(Path.Combine(_dir, "tetapan.json"), json, Encoding.UTF8);

    // ---------- happy path ----------

    [Fact]
    public void Baca_RahsiaDanApiUrlSah_MemulangkanKedua()
    {
        TulisRahsia("""{"rahsiaEnjin":"rahsia-ujian-123","klien":[{"id":"a"}]}""");
        TulisTetapan($$"""{"apiUrl":"{{ApiUrlSah}}","label":"Flex5"}""");

        var tetapan = new DpapiRahsiaEnjinStore(_dir).Baca();

        Assert.NotNull(tetapan);
        Assert.Equal("rahsia-ujian-123", tetapan!.RahsiaEnjin);
        Assert.Equal(ApiUrlSah, tetapan.ApiUrl);
    }

    [Fact]
    public void Status_SediaApabilaKeduaDuaAda_DanTidakPernahMendedahkanNilai()
    {
        TulisRahsia("""{"rahsiaEnjin":"rahsia-ujian-123"}""");
        TulisTetapan($$"""{"apiUrl":"{{ApiUrlSah}}"}""");

        var status = new DpapiRahsiaEnjinStore(_dir).Status();

        Assert.True(status.Sedia);
        Assert.True(status.FailRahsiaAda);
        Assert.True(status.RahsiaBolehDibaca);
        Assert.True(status.ApiUrlSah);
        Assert.DoesNotContain("rahsia-ujian-123", status.Sebab);
        Assert.DoesNotContain(ApiUrlSah, status.Sebab);
    }

    // ---------- fail closed ----------

    [Fact]
    public void Baca_TiadaFailRahsia_MemulangkanNull()
    {
        TulisTetapan($$"""{"apiUrl":"{{ApiUrlSah}}"}""");
        Assert.Null(new DpapiRahsiaEnjinStore(_dir).Baca());
    }

    [Fact]
    public void Baca_TiadaFailTetapan_MemulangkanNull()
    {
        TulisRahsia("""{"rahsiaEnjin":"rahsia-ujian-123"}""");
        Assert.Null(new DpapiRahsiaEnjinStore(_dir).Baca());
    }

    [Fact]
    public void Baca_FailRahsiaRosak_MemulangkanNull_TiadaTekaan()
    {
        File.WriteAllBytes(Path.Combine(_dir, "rahsia.dat"), new byte[] { 1, 2, 3, 4, 5 });
        TulisTetapan($$"""{"apiUrl":"{{ApiUrlSah}}"}""");

        var stor = new DpapiRahsiaEnjinStore(_dir);

        Assert.Null(stor.Baca());
        var status = stor.Status();
        Assert.True(status.FailRahsiaAda);
        Assert.False(status.RahsiaBolehDibaca);
        Assert.False(status.Sedia);
    }

    [Fact]
    public void Baca_RahsiaEnjinKosongAtauTiada_MemulangkanNull()
    {
        TulisTetapan($$"""{"apiUrl":"{{ApiUrlSah}}"}""");

        TulisRahsia("""{"rahsiaEnjin":""}""");
        Assert.Null(new DpapiRahsiaEnjinStore(_dir).Baca());

        TulisRahsia("""{"klien":[]}""");
        Assert.Null(new DpapiRahsiaEnjinStore(_dir).Baca());
    }

    [Fact]
    public void Baca_TetapanRosak_MemulangkanNull()
    {
        TulisRahsia("""{"rahsiaEnjin":"rahsia-ujian-123"}""");
        TulisTetapan("bukan json");
        Assert.Null(new DpapiRahsiaEnjinStore(_dir).Baca());
    }

    // ---------- pure readers ----------

    [Fact]
    public void AmbilRahsiaEnjin_HanyaMedanRahsiaEnjin()
    {
        Assert.Equal("abc", DpapiRahsiaEnjinStore.AmbilRahsiaEnjin("""{"rahsiaEnjin":"abc","klien":[1,2]}"""));
        Assert.Null(DpapiRahsiaEnjinStore.AmbilRahsiaEnjin("""{"rahsiaEnjin":123}"""));
        Assert.Null(DpapiRahsiaEnjinStore.AmbilRahsiaEnjin("[]"));
        Assert.Null(DpapiRahsiaEnjinStore.AmbilRahsiaEnjin("bukan json"));
        Assert.Null(DpapiRahsiaEnjinStore.AmbilRahsiaEnjin(""));
    }

    [Theory]
    // Allowlisted Apps Script hosts only, HTTPS only, no userinfo — a faithful
    // port of sahkanApiUrl: a tampered apiUrl must never receive the secret.
    [InlineData("https://script.google.com/macros/s/X/exec", true)]
    [InlineData("https://script.googleusercontent.com/macros/echo", true)]
    [InlineData("http://script.google.com/macros/s/X/exec", false)]
    [InlineData("https://evil.example.com/macros/s/X/exec", false)]
    [InlineData("https://script.google.com.evil.example/exec", false)]
    [InlineData("https://user:pw@script.google.com/exec", false)]
    [InlineData("http://127.0.0.1:8747/", false)]
    [InlineData("", false)]
    [InlineData("bukan-url", false)]
    public void SahkanApiUrl_MengikutSenaraiPutih(string url, bool dijangka)
    {
        Assert.Equal(dijangka, DpapiRahsiaEnjinStore.SahkanApiUrl(url));
    }

    [Fact]
    public void AmbilApiUrl_HosTidakDibenarkan_MemulangkanNull()
    {
        Assert.Null(DpapiRahsiaEnjinStore.AmbilApiUrl("""{"apiUrl":"https://evil.example.com/exec"}"""));
        Assert.Equal("https://script.google.com/exec",
            DpapiRahsiaEnjinStore.AmbilApiUrl("""{"apiUrl":"https://script.google.com/exec"}"""));
    }

    // ---------- owner id ----------

    [Fact]
    public void PemilikTugasan_MenggunakanIdPerantiApabilaBerdaftar()
    {
        var stor = new PemilikTugasanStore(
            new FakeIdentityStore(new DeviceIdentity { IdPeranti = "peranti-abc", Akaun = "akaun-a" }),
            Path.Combine(_dir, "id-pemilik.json"));

        Assert.Equal("peranti-abc", stor.Dapatkan());
    }

    [Fact]
    public void PemilikTugasan_TanpaPendaftaran_MenciptaIdStabilYangBertahan()
    {
        var laluan = Path.Combine(_dir, "id-pemilik.json");
        var pertama = new PemilikTugasanStore(new FakeIdentityStore(null), laluan).Dapatkan();

        Assert.NotEqual("", pertama);
        // A NEW store instance (i.e. a restart) must read back the SAME id —
        // a per-run id would strand this PC's own task behind a 15-minute lease.
        Assert.Equal(pertama, new PemilikTugasanStore(new FakeIdentityStore(null), laluan).Dapatkan());
    }

    [Fact]
    public void PemilikTugasan_FailRosak_DitulisSemula_TetapiTetapStabilSelepasnya()
    {
        var laluan = Path.Combine(_dir, "id-pemilik.json");
        File.WriteAllText(laluan, "bukan json", Encoding.UTF8);

        var pertama = new PemilikTugasanStore(new FakeIdentityStore(null), laluan).Dapatkan();
        Assert.NotEqual("", pertama);
        Assert.Equal(pertama, new PemilikTugasanStore(new FakeIdentityStore(null), laluan).Dapatkan());
    }

    [Fact]
    public void BacaId_PembacaTulen()
    {
        Assert.Equal("pc-1", PemilikTugasanStore.BacaId("""{"idPemilik":"pc-1"}"""));
        Assert.Null(PemilikTugasanStore.BacaId("""{"idPemilik":"  "}"""));
        Assert.Null(PemilikTugasanStore.BacaId("""{"idPemilik":5}"""));
        Assert.Null(PemilikTugasanStore.BacaId("bukan json"));
    }

    private sealed class FakeIdentityStore : IDeviceIdentityStore
    {
        private readonly DeviceIdentity? _identiti;
        public FakeIdentityStore(DeviceIdentity? identiti) => _identiti = identiti;
        public DeviceIdentity? Baca() => _identiti;
        public void Simpan(DeviceIdentity identiti) => throw new NotSupportedException();
        public void Padam() => throw new NotSupportedException();
    }
}
