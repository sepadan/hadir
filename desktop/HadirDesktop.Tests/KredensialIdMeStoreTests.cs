using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Shared-DPAPI idMe credential store tests. Every test writes to an isolated
/// temporary file with a SYNTHETIC credential — never the real per-user vault
/// (<c>HADIR-MOEIS-Companion/kredensial.dat</c>), which must stay untouched.
/// </summary>
public class KredensialIdMeStoreTests : IDisposable
{
    private readonly string _dir;
    private readonly string _laluan;

    public KredensialIdMeStoreTests()
    {
        _dir = Path.Combine(Path.GetTempPath(), "hadir-kred-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_dir);
        _laluan = Path.Combine(_dir, "kredensial.dat");
    }

    public void Dispose()
    {
        try { if (Directory.Exists(_dir)) Directory.Delete(_dir, recursive: true); } catch { /* best-effort */ }
    }

    private static KredensialIdMe Sintetik() => new()
    {
        Pengguna = "881234567890",
        KataLaluan = "kata-laluan-sintetik-1",
        KunciKeselamatan = "BUNGA RAYA",
    };

    [Fact]
    public void SimpanKemudianBaca_Berjaya()
    {
        var kedai = new DpapiKredensialIdMeStore(_laluan);
        kedai.Simpan("881234567890", "kata-laluan-sintetik-1", "BUNGA RAYA");

        var k = kedai.Baca();
        Assert.NotNull(k);
        Assert.Equal("881234567890", k!.Pengguna);
        Assert.Equal("kata-laluan-sintetik-1", k.KataLaluan);
        Assert.Equal("BUNGA RAYA", k.KunciKeselamatan);
    }

    [Fact]
    public void Status_MenyamarPengguna_TidakMendedahNilai()
    {
        var kedai = new DpapiKredensialIdMeStore(_laluan);
        kedai.Simpan("881234567890", "kata-laluan-sintetik-1", "BUNGA RAYA");

        var s = kedai.Status();
        Assert.True(s.Ada);
        Assert.False(s.Rosak);
        Assert.Equal("8***", s.PenggunaSamar);
        Assert.True(s.KunciAda);
        // The status text must never contain the full user or password.
        Assert.DoesNotContain("881234567890", s.PenggunaSamar);
    }

    [Fact]
    public void GumpalRosak_StatusRosak_TanpaNilai()
    {
        File.WriteAllBytes(_laluan, new byte[] { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 });
        var kedai = new DpapiKredensialIdMeStore(_laluan);

        var s = kedai.Status();
        Assert.True(s.Ada);
        Assert.True(s.Rosak);
        Assert.Equal("", s.PenggunaSamar);
    }

    [Fact]
    public void KataLaluanTidakDisimpanSebagaiTeksBiasa()
    {
        var kedai = new DpapiKredensialIdMeStore(_laluan);
        kedai.Simpan("881234567890", "kata-laluan-sintetik-1", "BUNGA RAYA");

        var baitAtasCakera = File.ReadAllBytes(_laluan);
        var teks = Encoding.UTF8.GetString(baitAtasCakera);
        Assert.DoesNotContain("kata-laluan-sintetik-1", teks);
        Assert.DoesNotContain("BUNGA RAYA", teks);
    }

    [Fact]
    public void FormatKongsi_DpapiNullEntropi_CamelCase_SerasiCompanion()
    {
        var kedai = new DpapiKredensialIdMeStore(_laluan);
        kedai.Simpan("881234567890", "kata-laluan-sintetik-1", "BUNGA RAYA");

        // Decrypt the raw blob exactly as the companion engine does: DPAPI
        // CurrentUser with NULL optional entropy (PowerShell `$null`), then JSON.
        var dilindungi = File.ReadAllBytes(_laluan);
        var mentah = ProtectedData.Unprotect(dilindungi, null, DataProtectionScope.CurrentUser);
        using var doc = JsonDocument.Parse(Encoding.UTF8.GetString(mentah));
        var root = doc.RootElement;

        Assert.True(root.TryGetProperty("pengguna", out _));
        Assert.True(root.TryGetProperty("kataLaluan", out _));
        Assert.True(root.TryGetProperty("kunciKeselamatan", out _));
        Assert.Equal("881234567890", root.GetProperty("pengguna").GetString());
        Assert.Equal("kata-laluan-sintetik-1", root.GetProperty("kataLaluan").GetString());
    }

    [Fact]
    public void Ada_TanpaNyahsulit()
    {
        var kedai = new DpapiKredensialIdMeStore(_laluan);
        Assert.False(kedai.Ada());

        kedai.Simpan("881234567890", "kata-laluan-sintetik-1", "BUNGA RAYA");
        Assert.True(kedai.Ada());
    }

    [Fact]
    public void Padam_Menghapus()
    {
        var kedai = new DpapiKredensialIdMeStore(_laluan);
        kedai.Simpan("881234567890", "kata-laluan-sintetik-1", "BUNGA RAYA");
        kedai.Padam();
        Assert.Null(kedai.Baca());
        Assert.False(kedai.Ada());
    }

    [Theory]
    [InlineData("", "pw", "phrase")]
    [InlineData("881234567890", "", "phrase")]
    [InlineData("881234567890", "pw", "")]
    public void Simpan_MedanKosong_Melontar(string pengguna, string kataLaluan, string kunci)
    {
        var kedai = new DpapiKredensialIdMeStore(_laluan);
        Assert.Throws<ArgumentException>(() => kedai.Simpan(pengguna, kataLaluan, kunci));
        Assert.False(kedai.Ada());
    }
}
