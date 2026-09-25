using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Kemas kini dalam aplikasi: bacaan manifest, perbandingan versi, penolakan
/// URL/cincang, muat turun yang disahkan, dan perintah pemasangan. Semua ujian
/// memakai fail sementara / respons HTTP palsu — tiada rangkaian, tiada
/// GitHub, tiada exe sebenar dimuat turun.
/// </summary>
public class KemasKiniDesktopTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "hadir-kemaskini-ujian-" + Guid.NewGuid().ToString("N"));

    public KemasKiniDesktopTests() => Directory.CreateDirectory(_dir);

    public void Dispose()
    {
        try { Directory.Delete(_dir, true); } catch { /* pembersihan sahaja */ }
    }

    private const string ShaSah1 = "0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF";

    private static string Manifest(string versi, string url, string sha, long saiz) =>
        $$"""{"versi":"{{versi}}","url":"{{url}}","sha256":"{{sha}}","saizBait":{{saiz}}}""";

    private static string ManifestBaik(long saiz = 1024) =>
        Manifest("1.0.14", "https://github.com/sepadan/hadir/releases/download/desktop-v1.0.14/HadirDesktop.exe", ShaSah1, saiz);

    // ---------- versi ----------

    [Theory]
    [InlineData("1.0.14", true)]
    [InlineData("0.0.1", true)]
    [InlineData("10.20.30", true)]
    [InlineData("1.0", false)]
    [InlineData("1.0.14.1", false)]
    [InlineData("v1.0.14", false)]
    [InlineData("1.0.x", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void VersiSah_MengikutBentuk(string? nilai, bool dijangka) =>
        Assert.Equal(dijangka, ManifestKemasKini.VersiSah(nilai));

    [Theory]
    [InlineData("1.0.14", "1.0.13", 1)]
    [InlineData("1.0.13", "1.0.14", -1)]
    [InlineData("1.0.13", "1.0.13", 0)]
    [InlineData("2.0.0", "1.99.99", 1)]
    [InlineData("1.10.0", "1.9.0", 1)]
    [InlineData("bukan", "1.0.0", -1)]
    [InlineData("1.0.0", "bukan", 1)]
    public void Banding_Tiga_Bahagian(string kiri, string kanan, int dijangka) =>
        Assert.Equal(Math.Sign(dijangka), Math.Sign(ManifestKemasKini.Banding(kiri, kanan)));

    // ---------- URL ----------

    [Theory]
    [InlineData("https://github.com/sepadan/hadir/releases/download/x/HadirDesktop.exe", true)]
    [InlineData("https://objects.githubusercontent.com/x/y.exe", true)]
    [InlineData("https://release-assets.githubusercontent.com/x/y.exe", true)]
    [InlineData("http://github.com/x/y.exe", false)]                    // bukan HTTPS
    [InlineData("https://evil.example.com/y.exe", false)]
    [InlineData("https://github.com.evil.example/y.exe", false)]
    [InlineData("https://user:pw@github.com/y.exe", false)]             // userinfo
    [InlineData("https://github.com:444/y.exe", false)]                 // port bukan lalai
    [InlineData("https://raw.githubusercontent.com/y.exe", false)]      // bukan hos keluaran
    [InlineData("ftp://github.com/y.exe", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void UrlSah_SenaraiHosDibenarkan(string? url, bool dijangka) =>
        Assert.Equal(dijangka, ManifestKemasKini.UrlSah(url));

    [Theory]
    [InlineData(ShaSah1, true)]
    [InlineData("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", true)]
    [InlineData("0123", false)]
    [InlineData("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcg", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void ShaSah_MengikutBentuk(string? nilai, bool dijangka) =>
        Assert.Equal(dijangka, ManifestKemasKini.ShaSah(nilai));

    // ---------- baca manifest ----------

    [Fact]
    public void Baca_VersiLebihBaharu_MemberiTawaran()
    {
        var t = ManifestKemasKini.Baca(ManifestBaik(2048), "1.0.13", out var sebab);

        Assert.NotNull(t);
        Assert.Equal("1.0.14", t!.Versi);
        Assert.Equal(2048, t.SaizBait);
        Assert.Equal(ShaSah1, t.Sha256);
        Assert.Equal("", sebab);
    }

    [Fact]
    public void Baca_ManifestDenganBom_Diterima()
    {
        // PowerShell 5.1 menulis BOM dengan Set-Content -Encoding utf8. BOM itu
        // bukan JSON yang sah, jadi pembaca mesti membuangnya dahulu.
        var t = ManifestKemasKini.Baca("\uFEFF" + ManifestBaik(), "1.0.13", out var sebab);

        Assert.NotNull(t);
        Assert.Equal("1.0.14", t!.Versi);
        Assert.Equal("", sebab);
    }

    [Fact]
    public void Baca_ManifestYangBenarBenarDiterbitkan_Diterima()
    {
        // Ujian terhadap ARTIFAK sebenar: manifest yang disajikan GitHub Pages
        // mesti sentiasa boleh dihurai oleh pembaca dalam aplikasi.
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null && !File.Exists(Path.Combine(dir.FullName, "publish.ps1"))) dir = dir.Parent;
        Assert.NotNull(dir);

        var laluan = Path.Combine(dir!.FullName, "kemas-kini", "latest.json");
        Assert.True(File.Exists(laluan), "manifest tidak dijumpai: " + laluan);

        var teks = File.ReadAllText(laluan);
        var t = ManifestKemasKini.Baca(teks, "1.0.13", out var sebab);

        Assert.NotNull(t);
        Assert.Equal("", sebab);
        Assert.True(ManifestKemasKini.VersiSah(t!.Versi));
        Assert.True(ManifestKemasKini.UrlSah(t.Url));
        Assert.True(ManifestKemasKini.ShaSah(t.Sha256));
        Assert.InRange(t.SaizBait, 1, ManifestKemasKini.SaizMaksimumBait);
        // Tiada BOM dalam fail yang diterbitkan.
        Assert.DoesNotContain('\uFEFF', teks);
    }

    [Theory]
    [InlineData("1.0.14")]   // sama
    [InlineData("1.0.15")]   // lebih baharu daripada manifest
    [InlineData("2.0.0")]
    public void Baca_BukanLebihBaharu_TiadaTawaran(string versiSemasa)
    {
        var t = ManifestKemasKini.Baca(ManifestBaik(), versiSemasa, out var sebab);

        Assert.Null(t);
        Assert.Equal("sudah versi terkini", sebab);
    }

    [Fact]
    public void Baca_MuatTurunTerlaluBesar_Ditolak()
    {
        var t = ManifestKemasKini.Baca(ManifestBaik(ManifestKemasKini.SaizMaksimumBait + 1), "1.0.13", out var sebab);

        Assert.Null(t);
        Assert.Equal("saiz muat turun di luar had", sebab);
    }

    [Theory]
    [InlineData("0")]
    [InlineData("-1")]
    public void Baca_SaizTidakSah_Ditolak(string saiz)
    {
        var json = $$"""{"versi":"1.0.14","url":"https://github.com/x/y.exe","sha256":"{{ShaSah1}}","saizBait":{{saiz}}}""";
        Assert.Null(ManifestKemasKini.Baca(json, "1.0.13", out _));
    }

    [Fact]
    public void Baca_HosTidakDibenarkan_Ditolak()
    {
        var json = Manifest("1.0.14", "https://evil.example.com/y.exe", ShaSah1, 1024);
        var t = ManifestKemasKini.Baca(json, "1.0.13", out var sebab);

        Assert.Null(t);
        Assert.Equal("URL muat turun tidak dibenarkan", sebab);
    }

    [Fact]
    public void Baca_CincangTidakSah_Ditolak()
    {
        var json = Manifest("1.0.14", "https://github.com/x/y.exe", "bukan-cincang", 1024);
        Assert.Null(ManifestKemasKini.Baca(json, "1.0.13", out var sebab));
        Assert.Equal("cincang SHA256 manifest tidak sah", sebab);
    }

    [Theory]
    [InlineData("bukan json")]
    [InlineData("[]")]
    [InlineData("{}")]
    [InlineData("")]
    [InlineData(null)]
    public void Baca_ManifestRosak_TiadaTawaran(string? json)
    {
        Assert.Null(ManifestKemasKini.Baca(json, "1.0.13", out var sebab));
        Assert.NotEqual("", sebab);
    }

    [Fact]
    public void Baca_TiadaMedan_Ditolak()
    {
        var tanpaUrl = $$"""{"versi":"1.0.14","sha256":"{{ShaSah1}}","saizBait":1024}""";
        var tanpaSaiz = $$"""{"versi":"1.0.14","url":"https://github.com/x/y.exe","sha256":"{{ShaSah1}}"}""";
        var saizTeks = $$"""{"versi":"1.0.14","url":"https://github.com/x/y.exe","sha256":"{{ShaSah1}}","saizBait":"1024"}""";

        Assert.Null(ManifestKemasKini.Baca(tanpaUrl, "1.0.13", out _));
        Assert.Null(ManifestKemasKini.Baca(tanpaSaiz, "1.0.13", out _));
        Assert.Null(ManifestKemasKini.Baca(saizTeks, "1.0.13", out _));
    }

    // ---------- muat turun ----------

    private sealed class ResponsPalsu : HttpMessageHandler
    {
        private readonly byte[] _badan;
        public ResponsPalsu(byte[] badan) => _badan = badan;

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var r = new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(_badan) };
            return Task.FromResult(r);
        }
    }

    private static (byte[] Badan, string Cincang) Kandungan(int saiz)
    {
        var badan = new byte[saiz];
        for (var i = 0; i < saiz; i++) badan[i] = (byte)(i % 251);
        return (badan, Convert.ToHexString(SHA256.HashData(badan)));
    }

    [Fact]
    public async Task MuatTurun_BadanDanCincangSepadan_FailSedia()
    {
        var (badan, cincang) = Kandungan(4096);
        var tawaran = new TawaranKemasKini("1.0.14", "https://github.com/x/y.exe", cincang, badan.Length);
        var klien = new MuatTurunKemasKini(new HttpClient(new ResponsPalsu(badan)));

        var laluan = await klien.MuatTurunAsync(tawaran, _dir);

        Assert.True(File.Exists(laluan));
        Assert.Equal(Path.Combine(_dir, "HadirDesktop-1.0.14.exe"), laluan);
        Assert.Equal(badan.Length, new FileInfo(laluan).Length);
        Assert.Equal(cincang, MuatTurunKemasKini.CincangFail(laluan));
        // Tiada fail separa ditinggalkan.
        Assert.False(File.Exists(laluan + ".part"));
    }

    [Fact]
    public async Task MuatTurun_CincangTidakSepadan_DitolakDanTiadaFail()
    {
        var (badan, _) = Kandungan(2048);
        var tawaran = new TawaranKemasKini("1.0.14", "https://github.com/x/y.exe", ShaSah1, badan.Length);
        var klien = new MuatTurunKemasKini(new HttpClient(new ResponsPalsu(badan)));

        await Assert.ThrowsAsync<IOException>(() => klien.MuatTurunAsync(tawaran, _dir));

        Assert.False(File.Exists(Path.Combine(_dir, "HadirDesktop-1.0.14.exe")));
        Assert.False(File.Exists(Path.Combine(_dir, "HadirDesktop-1.0.14.exe.part")));
    }

    [Fact]
    public async Task MuatTurun_SaizTidakSepadan_DitolakDanTiadaFail()
    {
        var (badan, cincang) = Kandungan(2048);
        var tawaran = new TawaranKemasKini("1.0.14", "https://github.com/x/y.exe", cincang, badan.Length + 1);
        var klien = new MuatTurunKemasKini(new HttpClient(new ResponsPalsu(badan)));

        await Assert.ThrowsAsync<IOException>(() => klien.MuatTurunAsync(tawaran, _dir));

        Assert.False(File.Exists(Path.Combine(_dir, "HadirDesktop-1.0.14.exe")));
        Assert.False(File.Exists(Path.Combine(_dir, "HadirDesktop-1.0.14.exe.part")));
    }

    // ---------- perintah pemasangan ----------

    [Fact]
    public void Perintah_MemanggilUpdatePs1DenganSumber()
    {
        var folder = @"C:\Users\u\AppData\Local\HadirDesktop";
        var fail = Path.Combine(folder, "kemas-kini", "HadirDesktop-1.0.14.exe");

        var hujah = PerintahKemasKini.Hujah(folder, fail);

        Assert.Equal("-NoProfile", hujah[0]);
        Assert.Contains("-ExecutionPolicy", hujah);
        Assert.Contains("Bypass", hujah);
        Assert.Equal(PerintahKemasKini.LaluanSkrip(folder), hujah[Array.IndexOf(hujah, "-File") + 1]);
        Assert.Equal(fail, hujah[Array.IndexOf(hujah, "-Sumber") + 1]);
        // Tiada rahsia, tiada kredensial dalam perintah.
        var penuh = string.Join(" ", hujah);
        Assert.DoesNotContain("rahsia", penuh, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("token", penuh, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Perintah_LaluanSkripDalamFolderPemasangan() =>
        Assert.Equal(
            Path.Combine(@"C:\x\HadirDesktop", "update.ps1"),
            PerintahKemasKini.LaluanSkrip(@"C:\x\HadirDesktop"));
}
