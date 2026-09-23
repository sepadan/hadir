using System;
using System.Globalization;
using System.IO;

namespace HadirDesktop;

/// <summary>
/// Alat PEMBANGUN sahaja: menjalankan SATU kitaran deman/log-masuk secara
/// automatik sebaik borang siap, supaya ujian hidup tidak perlu klik menu
/// dulang setiap kali. Dihidupkan HANYA oleh <c>HADIR_DEV_AUTO_KITARAN</c>
/// (truthy), corak pembacaan env yang SAMA seperti
/// <see cref="RealPortalDevMode"/>.
///
/// MATI (atau tidak ditetapkan) = tingkah laku pengeluaran TIDAK berubah:
/// tiada pemasa, tiada kitaran automatik, tiada fail log ditulis.
///
/// Log diagnostik (<c>%LOCALAPPDATA%/HadirDesktop/dev-kitaran.log</c>) hanya
/// menerima teks keadaan/sebab yang MEMANG sudah dipaparkan pada UI — tiada
/// kredensial, tiada IC, tiada token, tiada URL bertoken. Kegagalan menulis
/// adalah gagal-tertutup: ia tidak pernah menjatuhkan aplikasi.
/// </summary>
public sealed class DevAutoKitaran
{
    public const string EnableEnv = "HADIR_DEV_AUTO_KITARAN";
    public const string NamaFolder = "HadirDesktop";
    public const string NamaFailLog = "dev-kitaran.log";

    private static readonly string[] Truthy = { "1", "true", "ya", "yes", "on" };

    public bool Dihidupkan { get; }

    /// <summary>Laluan fail log; <c>null</c> apabila mod ini MATI.</summary>
    public string? LaluanLog { get; }

    private DevAutoKitaran(bool dihidupkan, string? laluanLog)
    {
        Dihidupkan = dihidupkan;
        LaluanLog = laluanLog;
    }

    /// <summary>
    /// Keputusan TULEN: adakah nilai env ini bermakna "hidupkan"? Trim +
    /// tidak peka huruf besar/kecil. Null/kosong/apa-apa yang lain = MATI.
    /// </summary>
    public static bool PatutAutoKitaran(string? nilai) =>
        !string.IsNullOrWhiteSpace(nilai) &&
        Array.IndexOf(Truthy, nilai.Trim().ToLowerInvariant()) >= 0;

    /// <summary>Kilang tulen (boleh diuji tanpa menyentuh env proses).</summary>
    public static DevAutoKitaran Cipta(bool dihidupkan, string? folderAsas = null)
    {
        if (!dihidupkan) return new DevAutoKitaran(false, null);

        var asas = folderAsas ?? Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        return new DevAutoKitaran(true, Path.Combine(asas, NamaFolder, NamaFailLog));
    }

    public static DevAutoKitaran DariPersekitaran() =>
        Cipta(PatutAutoKitaran(Environment.GetEnvironmentVariable(EnableEnv)));

    /// <summary>
    /// Satu baris bagi satu kitaran tamat. TULEN: masa ISO, keadaan portal,
    /// sebab penuh kitaran, dan hasil aliran penghantaran. Baris baharu dalam
    /// mana-mana medan dikecilkan kepada ruang supaya satu kitaran = satu baris.
    /// </summary>
    public static string BarisKitaran(
        DateTimeOffset masa,
        string? keadaan,
        string? sebabKitaran,
        string? sebabPenghantaran) =>
        masa.ToString("yyyy-MM-ddTHH:mm:sszzz", CultureInfo.InvariantCulture) +
        " keadaan=" + Bersih(keadaan) +
        " sebab=" + Bersih(sebabKitaran) +
        " penghantaran=" + Bersih(sebabPenghantaran);

    /// <summary>Satu baris bagi satu langkah aliran (klaim/hantar/selesai).</summary>
    public static string BarisLangkah(DateTimeOffset masa, string? mesej) =>
        masa.ToString("yyyy-MM-ddTHH:mm:sszzz", CultureInfo.InvariantCulture) +
        " langkah=" + Bersih(mesej);

    private static string Bersih(string? teks)
    {
        if (string.IsNullOrWhiteSpace(teks)) return "-";
        return teks.Replace("\r", " ").Replace("\n", " ").Trim();
    }

    /// <summary>
    /// Tambah satu baris pada log (mencipta folder jika perlu). No-op apabila
    /// mod ini MATI. Gagal-tertutup sepenuhnya: sebarang masalah I/O ditelan —
    /// log pembangun tidak boleh menjatuhkan aplikasi.
    /// </summary>
    public void Tulis(string baris) => TulisKe(LaluanLog, baris);

    /// <summary>Versi statik yang boleh diuji terhadap laluan sementara.</summary>
    public static void TulisKe(string? laluan, string baris)
    {
        if (string.IsNullOrWhiteSpace(laluan)) return;
        try
        {
            var folder = Path.GetDirectoryName(laluan);
            if (!string.IsNullOrEmpty(folder)) Directory.CreateDirectory(folder);
            File.AppendAllText(laluan, baris + Environment.NewLine);
        }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
        catch (NotSupportedException) { }
        catch (ArgumentException) { }
        catch (System.Security.SecurityException) { }
    }
}
