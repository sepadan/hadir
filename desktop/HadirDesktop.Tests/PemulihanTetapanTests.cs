using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Pemulihan EKSPLISIT fail backend Desktop yang rosak/separa
/// (<see cref="DpapiRahsiaEnjinStore.PulihkanGantiRosak"/>). Folder sementara
/// dan nilai rekaan sahaja; fail sebenar %LOCALAPPDATA% tidak disentuh.
/// </summary>
public class PemulihanTetapanTests : IDisposable
{
    private const string ApiUrl = "https://script.google.com/macros/s/UJIAN-PULIH/exec";
    private const string ApiUrlCompanion = "https://script.google.com/macros/s/UJIAN-COMPANION/exec";

    private readonly string _akar = Path.Combine(Path.GetTempPath(), "hadir-pulih-ujian-" + Guid.NewGuid().ToString("N"));
    private string Desktop => Path.Combine(_akar, "HadirDesktop", "enjin");
    private string Legasi => Path.Combine(_akar, "HADIR-MOEIS-Companion");

    public PemulihanTetapanTests() => Directory.CreateDirectory(Desktop);

    public void Dispose()
    {
        try { Directory.Delete(_akar, recursive: true); } catch { /* best effort */ }
    }

    private static byte[] Dpapi(string json) =>
        ProtectedData.Protect(Encoding.UTF8.GetBytes(json), null, DataProtectionScope.CurrentUser);

    private string F(string nama) => Path.Combine(Desktop, nama);

    private string[] FolderSandaran() => Directory.GetDirectories(Desktop, "sandaran-pemulihan-*");

    // --- fail rosak dipulihkan, sandaran disahkan ---

    [Fact]
    public void TetapanJsonRosak_SimpanBiasaGagal_PemulihanMenggantiDanMengekalkanKlien()
    {
        File.WriteAllText(F("tetapan.json"), "{rosak");
        var rahsiaAsal = Dpapi("{\"rahsiaEnjin\":\"rahsia-lama-rekaan\",\"klien\":[{\"id\":\"k1\"}]}");
        File.WriteAllBytes(F("rahsia.dat"), rahsiaAsal);
        var stor = new DpapiRahsiaEnjinStore(Desktop);

        var ralat = Assert.Throws<InvalidOperationException>(() => stor.Simpan(ApiUrl, "rahsia-baharu-rekaan"));
        Assert.Contains("Pulihkan tetapan rosak", ralat.Message);

        var sandaran = stor.PulihkanGantiRosak(ApiUrl, "rahsia-baharu-rekaan");

        var baca = stor.Baca()!;
        Assert.Equal(ApiUrl, baca.ApiUrl);
        Assert.Equal("rahsia-baharu-rekaan", baca.RahsiaEnjin);
        // Bahagian yang masih boleh dibaca (pasangan klien) dikekalkan.
        var polos = Encoding.UTF8.GetString(ProtectedData.Unprotect(File.ReadAllBytes(F("rahsia.dat")), null, DataProtectionScope.CurrentUser));
        Assert.Equal("k1", JsonDocument.Parse(polos).RootElement.GetProperty("klien")[0].GetProperty("id").GetString());
        // Sandaran = bait asal yang tepat.
        var dir = Path.Combine(Desktop, sandaran);
        Assert.Equal("{rosak", File.ReadAllText(Path.Combine(dir, "tetapan.json")));
        Assert.Equal(rahsiaAsal, File.ReadAllBytes(Path.Combine(dir, "rahsia.dat")));
        Assert.False(File.Exists(F(MigrasiDataCompanion.PenandaStoreBackend)));
        Assert.DoesNotContain("rahsia-baharu-rekaan", sandaran);
    }

    [Fact]
    public void RahsiaDatTidakBolehDinyahsulit_PemulihanMengganti_SandaranMenyimpanBlobAsal()
    {
        File.WriteAllText(F("tetapan.json"), "{\"apiUrl\":\"" + ApiUrl + "\"}");
        var sampah = new byte[] { 9, 8, 7, 6, 5 };
        File.WriteAllBytes(F("rahsia.dat"), sampah);
        var stor = new DpapiRahsiaEnjinStore(Desktop);
        Assert.Throws<InvalidOperationException>(() => stor.Simpan(ApiUrl, ""));

        var sandaran = stor.PulihkanGantiRosak(ApiUrl, "rahsia-baharu-rekaan");

        Assert.Equal("rahsia-baharu-rekaan", stor.Baca()!.RahsiaEnjin);
        Assert.Equal(sampah, File.ReadAllBytes(Path.Combine(Desktop, sandaran, "rahsia.dat")));
    }

    [Fact]
    public void PenandaSimpananTerputus_DenganFailSepara_DipulihkanDanPenandaDibuang()
    {
        File.WriteAllText(F("tetapan.json"), "{\"apiUrl\":\"" + ApiUrl + "\"}");
        File.WriteAllText(F(MigrasiDataCompanion.PenandaStoreBackend), "pending");
        var stor = new DpapiRahsiaEnjinStore(Desktop);
        Assert.Null(stor.Baca());

        var sandaran = stor.PulihkanGantiRosak(ApiUrl, "rahsia-baharu-rekaan");

        Assert.False(File.Exists(F(MigrasiDataCompanion.PenandaStoreBackend)));
        Assert.Equal("rahsia-baharu-rekaan", stor.Baca()!.RahsiaEnjin);
        Assert.Equal("pending", File.ReadAllText(Path.Combine(Desktop, sandaran, MigrasiDataCompanion.PenandaStoreBackend)));
    }

    // --- input wajib: URL penuh + rahsia yang dimasukkan semula ---

    [Theory]
    [InlineData(ApiUrl, "")]
    [InlineData(ApiUrl, "   ")]
    [InlineData("http://script.google.com/macros/s/X/exec", "rahsia-rekaan")]
    [InlineData("https://contoh.invalid/exec", "rahsia-rekaan")]
    [InlineData("https://script.google.com/", "rahsia-rekaan")]
    [InlineData("", "rahsia-rekaan")]
    public void InputTidakSah_TiadaFailDisentuh_TiadaSandaran(string url, string rahsia)
    {
        File.WriteAllText(F("tetapan.json"), "{rosak");
        File.WriteAllBytes(F("rahsia.dat"), new byte[] { 1, 2, 3 });

        Assert.Throws<InvalidOperationException>(() => new DpapiRahsiaEnjinStore(Desktop).PulihkanGantiRosak(url, rahsia));

        Assert.Equal("{rosak", File.ReadAllText(F("tetapan.json")));
        Assert.Equal(new byte[] { 1, 2, 3 }, File.ReadAllBytes(F("rahsia.dat")));
        Assert.Empty(FolderSandaran());
        Assert.False(File.Exists(F(MigrasiDataCompanion.PenandaStoreBackend)));
    }

    // --- kegagalan semasa pemulihan kekal selamat ---

    [Fact]
    public void GagalSebelumPenggantianPertama_FailLamaUtuh_PenandaBaharuDibuang_SandaranAda()
    {
        File.WriteAllText(F("tetapan.json"), "{rosak");
        File.WriteAllBytes(F("rahsia.dat"), new byte[] { 1, 2, 3 });
        var stor = new DpapiRahsiaEnjinStore(Desktop, () => throw new IOException("simulasi"));

        Assert.Throws<IOException>(() => stor.PulihkanGantiRosak(ApiUrl, "rahsia-baharu-rekaan"));

        Assert.Equal("{rosak", File.ReadAllText(F("tetapan.json")));
        Assert.Equal(new byte[] { 1, 2, 3 }, File.ReadAllBytes(F("rahsia.dat")));
        Assert.False(File.Exists(F(MigrasiDataCompanion.PenandaStoreBackend)));
        Assert.Equal("{rosak", File.ReadAllText(Path.Combine(Assert.Single(FolderSandaran()), "tetapan.json")));
        Assert.Null(new DpapiRahsiaEnjinStore(Desktop).Baca());
    }

    [Fact]
    public void GagalSelepasTetapanDitulis_PenandaDikekal_GagalTertutup_SandaranUtuh()
    {
        File.WriteAllText(F("tetapan.json"), "{rosak");
        File.WriteAllBytes(F("rahsia.dat"), new byte[] { 1, 2, 3 });
        FileStream? kunci = null;
        var stor = new DpapiRahsiaEnjinStore(Desktop,
            () => kunci = File.Open(F("rahsia.dat"), FileMode.Open, FileAccess.ReadWrite, FileShare.None));

        try { Assert.Throws<UnauthorizedAccessException>(() => stor.PulihkanGantiRosak(ApiUrl, "rahsia-baharu-rekaan")); }
        finally { kunci?.Dispose(); }

        Assert.True(File.Exists(F(MigrasiDataCompanion.PenandaStoreBackend)));
        Assert.Null(new DpapiRahsiaEnjinStore(Desktop).Baca());
        Assert.Equal(new byte[] { 1, 2, 3 }, File.ReadAllBytes(Path.Combine(Assert.Single(FolderSandaran()), "rahsia.dat")));
    }

    [Fact]
    public void PenandaSimpananSediaAda_GagalSebelumPenggantian_PenandaKekal()
    {
        File.WriteAllText(F("tetapan.json"), "{rosak");
        File.WriteAllText(F(MigrasiDataCompanion.PenandaStoreBackend), "pending");
        var stor = new DpapiRahsiaEnjinStore(Desktop, () => throw new IOException("simulasi"));

        Assert.Throws<IOException>(() => stor.PulihkanGantiRosak(ApiUrl, "rahsia-baharu-rekaan"));

        Assert.True(File.Exists(F(MigrasiDataCompanion.PenandaStoreBackend)));
        Assert.Null(stor.Baca());
    }

    // --- PerluPemulihan: tiada import Companion, tiada klien dalam proses ini ---

    [Fact]
    public void PerluPemulihan_DenganFailRosak_PemulihanTidakMembinaKlien_LancaranSeterusnyaMemuktamadkanDataDesktop()
    {
        // Companion masih memegang konfigurasi SAH yang lain — ia tidak boleh diimport.
        Directory.CreateDirectory(Legasi);
        File.WriteAllText(Path.Combine(Legasi, "tetapan.json"), "{\"apiUrl\":\"" + ApiUrlCompanion + "\"}");
        File.WriteAllBytes(Path.Combine(Legasi, "rahsia.dat"), Dpapi("{\"rahsiaEnjin\":\"rahsia-companion-rekaan\"}"));
        // Desktop: salinan tidak dimuktamadkan + fail rosak.
        File.WriteAllText(F("tetapan.json"), "{rosak");
        File.WriteAllBytes(F("rahsia.dat"), new byte[] { 4, 4, 4 });
        File.WriteAllText(F(MigrasiDataCompanion.PenandaMigrasiBackend), "menyalin");
        var migrasi = new MigrasiDataCompanion(Legasi, Desktop, _ => { });

        var pertama = migrasi.Jalankan();
        Assert.Equal(KeputusanMigrasi.PerluPemulihan, pertama.Backend.Keputusan);
        var stor = new DpapiRahsiaEnjinStore(Desktop);
        Assert.Throws<InvalidOperationException>(() => stor.Simpan(ApiUrl, "rahsia-pemilik-rekaan"));   // laluan biasa tersekat

        stor.PulihkanGantiRosak(ApiUrl, "rahsia-pemilik-rekaan");

        // Proses semasa: penanda migrasi kekal → Baca null → TIADA klien, walaupun pemanggil tersilap.
        Assert.True(File.Exists(F(MigrasiDataCompanion.PenandaMigrasiBackend)));
        Assert.Null(stor.Baca());
        var dibina = 0;
        foreach (var muktamad in new[] { pertama.Backend.Muktamad, true })
        {
            Assert.Null(new PagarKonfigurasiBackend(stor, muktamad,
                (_, _) => { dibina++; return new PagarKonfigurasiBackendTests.KlienPalsu(); }).Klien);
        }
        Assert.Equal(0, dibina);

        // Lancaran seterusnya: data Desktop yang sah dimuktamadkan — BUKAN diimport dari Companion.
        var kedua = migrasi.Jalankan();
        Assert.Equal(KeputusanMigrasi.Dipindahkan, kedua.Backend.Keputusan);
        var aktif = stor.Baca()!;
        Assert.Equal(ApiUrl, aktif.ApiUrl);
        Assert.Equal("rahsia-pemilik-rekaan", aktif.RahsiaEnjin);
        Assert.NotNull(new PagarKonfigurasiBackend(stor, kedua.Backend.Muktamad,
            (_, _) => new PagarKonfigurasiBackendTests.KlienPalsu()).Klien);
        // Companion tidak disentuh.
        Assert.Equal("{\"apiUrl\":\"" + ApiUrlCompanion + "\"}", File.ReadAllText(Path.Combine(Legasi, "tetapan.json")));
    }

    [Fact]
    public void KodPemulihan_TidakMerujukFolderCompanion()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null && !File.Exists(Path.Combine(dir.FullName, "publish.ps1"))) dir = dir.Parent;
        Assert.NotNull(dir);
        foreach (var fail in new[] { "RahsiaEnjinStore.cs", "EngineSettingsDialog.cs" })
        {
            var kod = string.Join("\n", File.ReadAllLines(Path.Combine(dir!.FullName, "HadirDesktop", fail))
                .Where(b => !b.TrimStart().StartsWith("//", StringComparison.Ordinal)));
            Assert.DoesNotContain("DirLegasiCompanion", kod);
            Assert.DoesNotContain("new MigrasiDataCompanion(", kod);
            Assert.DoesNotContain("HADIR-MOEIS-Companion", kod);
        }
    }
}
