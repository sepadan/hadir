using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace HadirDesktop;

/// <summary>
/// Satu tawaran kemas kini yang dibaca daripada manifest awam. Tiada rahsia di
/// dalamnya: manifest itu diterbitkan bersama keluaran dan boleh dibaca sesiapa.
/// </summary>
public sealed record TawaranKemasKini(string Versi, string Url, string Sha256, long SaizBait);

/// <summary>
/// Pembacaan TULEN manifest kemas kini + perbandingan versi. Semua penolakan
/// eksplisit dan gagal-tertutup: manifest yang rosak, tidak lengkap, atau
/// menunjuk ke hos yang tidak dibenarkan menghasilkan <c>null</c> — bukan
/// tekaan, bukan "mungkin boleh".
/// </summary>
public static class ManifestKemasKini
{
    /// <summary>Had muat turun. Exe terbitan ~160 MB; 400 MB memberi ruang tanpa had infiniti.</summary>
    public const long SaizMaksimumBait = 400L * 1024 * 1024;

    /// <summary>Hos yang dibenarkan untuk URL muat turun (HANYA HTTPS).</summary>
    public static readonly IReadOnlyList<string> HosDibenarkan = new[]
    {
        "github.com",
        "objects.githubusercontent.com",
        "release-assets.githubusercontent.com",
    };

    /// <summary>Nama medan manifest — satu tempat, supaya penulis dan pembaca tidak terpesong.</summary>
    public const string MedanVersi = "versi";
    public const string MedanUrl = "url";
    public const string MedanSha256 = "sha256";
    public const string MedanSaiz = "saizBait";

    /// <summary>
    /// Baca manifest dan pulangkan tawaran HANYA jika ia lebih BAHARU daripada
    /// <paramref name="versiSemasa"/>. Semua sebab penolakan dikembalikan melalui
    /// <paramref name="sebab"/> (teks generik, tiada nilai sensitif).
    /// </summary>
    public static TawaranKemasKini? Baca(string? json, string? versiSemasa, out string sebab)
    {
        sebab = "";
        if (string.IsNullOrWhiteSpace(json))
        {
            sebab = "manifest kosong";
            return null;
        }

        string versi, url, sha;
        long saiz;
        try
        {
            // BOM di hadapan bukan JSON yang sah. Sesetengah penulis menambahnya,
            // jadi ia dibuang dahulu — manifest yang betul tetap tidak menerima
            // sebarang teks lain.
            var bersih = json.TrimStart('\uFEFF').TrimStart();
            using var doc = JsonDocument.Parse(bersih);
            if (doc.RootElement.ValueKind != JsonValueKind.Object)
            {
                sebab = "manifest bukan objek JSON";
                return null;
            }

            var akar = doc.RootElement;
            versi = Teks(akar, MedanVersi);
            url = Teks(akar, MedanUrl);
            sha = Teks(akar, MedanSha256);
            if (!akar.TryGetProperty(MedanSaiz, out var elSaiz) || elSaiz.ValueKind != JsonValueKind.Number ||
                !elSaiz.TryGetInt64(out saiz))
            {
                sebab = "manifest tiada saiz yang sah";
                return null;
            }
        }
        catch (JsonException)
        {
            sebab = "manifest bukan JSON yang sah";
            return null;
        }

        if (!VersiSah(versi))
        {
            sebab = "versi manifest tidak sah";
            return null;
        }
        if (!UrlSah(url))
        {
            sebab = "URL muat turun tidak dibenarkan";
            return null;
        }
        if (!ShaSah(sha))
        {
            sebab = "cincang SHA256 manifest tidak sah";
            return null;
        }
        if (saiz <= 0 || saiz > SaizMaksimumBait)
        {
            sebab = "saiz muat turun di luar had";
            return null;
        }

        if (Banding(versi, versiSemasa) <= 0)
        {
            sebab = "sudah versi terkini";
            return null;
        }

        sebab = "";
        return new TawaranKemasKini(versi, url, sha.ToUpperInvariant(), saiz);
    }

    /// <summary>Adakah URL muat turun dibenarkan: HTTPS pada hos keluaran yang dipanggil?</summary>
    public static bool UrlSah(string? nilai)
    {
        if (string.IsNullOrWhiteSpace(nilai)) return false;
        if (!Uri.TryCreate(nilai, UriKind.Absolute, out var u)) return false;
        if (u.Scheme != Uri.UriSchemeHttps) return false;
        if (!string.IsNullOrEmpty(u.UserInfo)) return false;
        if (!u.IsDefaultPort) return false;
        foreach (var hos in HosDibenarkan)
        {
            if (string.Equals(u.Host, hos, StringComparison.OrdinalIgnoreCase)) return true;
        }
        return false;
    }

    /// <summary>Versi mesti berbentuk <c>major.minor.patch</c> (digit sahaja).</summary>
    public static bool VersiSah(string? nilai)
    {
        var (ok, _) = BacaTiga(nilai);
        return ok;
    }

    /// <summary>Cincang SHA256: tepat 64 aksara heksadesimal.</summary>
    public static bool ShaSah(string? nilai)
    {
        if (string.IsNullOrWhiteSpace(nilai) || nilai.Length != 64) return false;
        foreach (var c in nilai)
        {
            var heks = (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
            if (!heks) return false;
        }
        return true;
    }

    /// <summary>
    /// Banding dua versi <c>major.minor.patch</c>. Bentuk yang tidak sah dianggap
    /// LEBIH KECIL, jadi manifest yang rosak tidak pernah kelihatan lebih baharu.
    /// </summary>
    public static int Banding(string? kiri, string? kanan)
    {
        var (okKiri, kiriTiga) = BacaTiga(kiri);
        var (okKanan, kananTiga) = BacaTiga(kanan);
        if (!okKiri && !okKanan) return 0;
        if (!okKiri) return -1;
        if (!okKanan) return 1;

        for (var i = 0; i < 3; i++)
        {
            var cmp = kiriTiga[i].CompareTo(kananTiga[i]);
            if (cmp != 0) return cmp;
        }
        return 0;
    }

    private static (bool Ok, int[] Tiga) BacaTiga(string? nilai)
    {
        var kosong = new[] { 0, 0, 0 };
        if (string.IsNullOrWhiteSpace(nilai)) return (false, kosong);

        var bahagian = nilai.Trim().Split('.');
        if (bahagian.Length != 3) return (false, kosong);

        var tiga = new int[3];
        for (var i = 0; i < 3; i++)
        {
            var b = bahagian[i];
            if (b.Length == 0 || b.Length > 6) return (false, kosong);
            foreach (var c in b)
            {
                if (c < '0' || c > '9') return (false, kosong);
            }
            if (!int.TryParse(b, NumberStyles.None, CultureInfo.InvariantCulture, out tiga[i])) return (false, kosong);
        }
        return (true, tiga);
    }

    private static string Teks(JsonElement akar, string nama) =>
        akar.TryGetProperty(nama, out var el) && el.ValueKind == JsonValueKind.String
            ? (el.GetString() ?? "").Trim()
            : "";
}

/// <summary>
/// Muat turun sebenar: tulis ke fail sementara, sahkan PANJANG dan SHA256,
/// kemudian barulah namakannya sebagai fail sedia-pakai. Fail yang tidak
/// disahkan dibuang — tiada exe yang tidak disahkan pernah kekal di cakera.
/// </summary>
public sealed class MuatTurunKemasKini
{
    private readonly HttpClient _http;

    public MuatTurunKemasKini(HttpClient? http = null)
    {
        _http = http ?? new HttpClient { Timeout = TimeSpan.FromMinutes(5) };
    }

    /// <summary>Laluan fail sedia-pakai bagi satu versi dalam folder kemas kini.</summary>
    public static string LaluanSedia(string folder, string versi) =>
        Path.Combine(folder, "HadirDesktop-" + versi + ".exe");

    /// <summary>
    /// Muat turun dan sahkan. Mengembalikan laluan fail yang SUDAH disahkan,
    /// atau melontar jika muat turun/cincang tidak sepadan.
    /// </summary>
    public async Task<string> MuatTurunAsync(TawaranKemasKini tawaran, string folder, CancellationToken ct = default)
    {
        Directory.CreateDirectory(folder);
        var sedia = LaluanSedia(folder, tawaran.Versi);
        var separa = sedia + ".part";
        if (File.Exists(separa)) File.Delete(separa);

        using (var respons = await _http.GetAsync(tawaran.Url, HttpCompletionOption.ResponseHeadersRead, ct)
                   .ConfigureAwait(false))
        {
            respons.EnsureSuccessStatusCode();
            await using var masuk = await respons.Content.ReadAsStreamAsync(ct).ConfigureAwait(false);
            await using var keluar = File.Create(separa);
            await masuk.CopyToAsync(keluar, 81920, ct).ConfigureAwait(false);
        }

        var panjang = new FileInfo(separa).Length;
        if (panjang != tawaran.SaizBait)
        {
            File.Delete(separa);
            throw new IOException("Saiz muat turun tidak sepadan (" + panjang + " lawan " + tawaran.SaizBait + ").");
        }

        var cincang = CincangFail(separa);
        if (!string.Equals(cincang, tawaran.Sha256, StringComparison.OrdinalIgnoreCase))
        {
            File.Delete(separa);
            throw new IOException("Cincang SHA256 muat turun tidak sepadan.");
        }

        if (File.Exists(sedia)) File.Delete(sedia);
        File.Move(separa, sedia);
        return sedia;
    }

    /// <summary>Cincang SHA256 fail sebagai teks heksadesimal huruf besar.</summary>
    public static string CincangFail(string laluan)
    {
        using var strim = File.OpenRead(laluan);
        using var sha = SHA256.Create();
        return Convert.ToHexString(sha.ComputeHash(strim));
    }
}

/// <summary>
/// Sumber manifest kemas kini. Alamatnya TETAP (GitHub Pages repo awam yang
/// sama seperti PWA) dan tiada cara menukarnya dari persekitaran: pemilik PC
/// tidak boleh diarahkan ke hos lain tanpa mengubah kod. Muat turunnya sendiri
/// tetap disemak oleh <see cref="ManifestKemasKini.UrlSah"/> dan cincangnya
/// disahkan dua kali (app + skrip pemasangan).
/// </summary>
public static class SumberKemasKini
{
    public const string AlamatManifest = "https://sepadan.github.io/hadir/desktop/kemas-kini/latest.json";

    /// <summary>Baca teks manifest; null apabila rangkaian/gelung gagal (tiada pengecualian keluar).</summary>
    public static async Task<string?> BacaManifestAsync(HttpClient http, CancellationToken ct = default)
    {
        using var respons = await http.GetAsync(AlamatManifest, ct).ConfigureAwait(false);
        if (!respons.IsSuccessStatusCode) return null;
        return await respons.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
    }
}

/// <summary>
/// Perintah pemasangan kemas kini. Ia SENGAJA hanya menyediakan hujah untuk
/// <c>update.ps1</c> yang sudah terbukti (hentikan → sandaran → salin → sahkan
/// SHA256 → lancar semula): tiada logik tukar-fail yang diduplikasi dalam C#,
/// dan tiada rahsia disentuh.
/// </summary>
public static class PerintahKemasKini
{
    public const string NamaSkrip = "update.ps1";

    /// <summary>Skrip update.ps1 yang dipasang dalam folder pemasangan.</summary>
    public static string LaluanSkrip(string folderPasang) => Path.Combine(folderPasang, NamaSkrip);

    /// <summary>Hujah untuk <c>powershell.exe</c> (folder kerja dikendalikan pemanggil).</summary>
    public static string[] Hujah(string folderPasang, string failExeBaharu) => new[]
    {
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", LaluanSkrip(folderPasang),
        "-Sumber", failExeBaharu,
    };

    /// <summary>Perintah yang dipaparkan kepada pemilik (untuk rujukan manual).</summary>
    public static string PerintahPenuh(string folderPasang, string failExeBaharu) =>
        "powershell " + string.Join(" ", Array.ConvertAll(Hujah(folderPasang, failExeBaharu), Petik));

    private static string Petik(string arg) =>
        arg.Contains(' ', StringComparison.Ordinal) ? "\"" + arg + "\"" : arg;
}
