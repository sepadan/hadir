using System;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace HadirDesktop;

/// <summary>Keputusan satu tindakan persaraan/pemulihan. Teks bebas nilai sahaja.</summary>
public sealed record HasilPersaraan(bool Berjaya, string Mesej);

/// <summary>
/// Persaraan autostart Companion lama yang EKSPLISIT, berperingkat dan boleh
/// diundur. Ia hanya berjalan apabila pemilik menekan butang dalam dialog
/// "Tetapan Tempatan" — tidak pernah semasa lancar, pasang atau kemas kini.
///
/// Apa yang ia lakukan:
///   1. Menolak jika konfigurasi backend Desktop belum sah (gagal-tertutup:
///      Companion tidak dimatikan sebelum Desktop boleh mengambil alih).
///   2. Menyandarkan nilai Run <c>HADIRMoeisCompanion</c> (arahan node +
///      laluan skrip, bukan rahsia) ke fail milik Desktop, dan membaca semula
///      sandaran itu sebelum meneruskan.
///   3. Barulah memadam nilai Run itu.
///
/// Apa yang ia TIDAK lakukan: menghentikan proses Companion yang sedang berjalan,
/// memadam folder pemasangan/data Companion, menyentuh kredensial, atau
/// menyentuh nilai Run <c>HadirDesktop</c>. <see cref="Pulihkan"/> menulis semula
/// nilai asal daripada sandaran.
/// </summary>
public sealed class PersaraanAutostartCompanion
{
    /// <summary>companion/src/autostart-windows.mjs <c>NAMA_ENTRI_AUTOSTART</c>.</summary>
    public const string NamaNilaiRun = "HADIRMoeisCompanion";

    public const string NamaFailSandaran = "companion-autostart-sandaran.json";

    private readonly IRegistryRunKey _kunci;
    private readonly string _laluanSandaran;
    private readonly Func<bool> _desktopSedia;

    /// <param name="desktopSedia">
    /// Benar hanya apabila konfigurasi backend Desktop sendiri boleh dibaca dan sah
    /// (<see cref="IRahsiaEnjinStore.Baca"/> bukan null).
    /// </param>
    public PersaraanAutostartCompanion(IRegistryRunKey kunci, string dirDesktop, Func<bool> desktopSedia)
    {
        _kunci = kunci;
        _laluanSandaran = Path.Combine(dirDesktop, NamaFailSandaran);
        _desktopSedia = desktopSedia;
    }

    public bool AutostartAda()
    {
        try { return _kunci.Baca(NamaNilaiRun) is not null; }
        catch { return false; }
    }

    public bool SandaranAda() => BacaSandaran() is not null;

    /// <summary>Teks status untuk dialog; tiada laluan atau arahan dipaparkan.</summary>
    public string TeksStatus()
    {
        if (AutostartAda()) return "Autostart Companion lama: MASIH HIDUP (ia boleh membuka Microsoft Edge sendiri).";
        return SandaranAda()
            ? "Autostart Companion lama: dimatikan oleh HADIR Desktop (boleh dipulihkan)."
            : "Autostart Companion lama: tiada.";
    }

    /// <summary>
    /// Sandaran PERTAMA tidak pernah ditimpa. Jika sandaran sah sudah wujud dan
    /// nilai Run semasa berbeza daripadanya, tiada apa diubah. Nilai Run dibaca
    /// semula SEJURUS sebelum dipadam dan disahkan tiada selepasnya.
    ///
    /// Had OS: Windows Registry tiada operasi banding-dan-padam atomik. Proses
    /// lain yang menulis nilai itu di antara bacaan terakhir dan
    /// <c>DeleteValue</c> masih boleh kehilangan tulisannya. Tetingkap itu
    /// dikecilkan, bukan dihapuskan.
    /// </summary>
    public HasilPersaraan Hentikan()
    {
        try
        {
            if (!_desktopSedia())
            {
                return new HasilPersaraan(false,
                    "HADIR Desktop belum mengambil alih (klien backend aktif, konfigurasi semasa dan migrasi mesti sah); Companion tidak dimatikan.");
            }

            var nilai = _kunci.Baca(NamaNilaiRun);
            if (nilai is null)
            {
                return new HasilPersaraan(true, "Autostart Companion lama sudah tiada; tiada apa diubah.");
            }

            var sandaran = BacaSandaran();
            if (sandaran is null && File.Exists(_laluanSandaran))
            {
                // Fail sandaran wujud tetapi tidak sah: jangan timpa bukti asal.
                return new HasilPersaraan(false,
                    "Fail sandaran autostart sedia ada tidak dapat dibaca; tiada apa diubah.");
            }

            if (sandaran is not null)
            {
                // Sandaran asal DIKEKALKAN. Hanya nilai yang sama dengannya boleh dipadam.
                if (!string.Equals(sandaran, nilai, StringComparison.Ordinal))
                {
                    return new HasilPersaraan(false,
                        "Entri autostart Companion berbeza daripada sandaran asal; tiada apa diubah dan sandaran dikekalkan.");
                }
            }
            else
            {
                Directory.CreateDirectory(Path.GetDirectoryName(_laluanSandaran)!);
                var obj = new JsonObject { ["versi"] = 1, ["nama"] = NamaNilaiRun, ["nilai"] = nilai };
                // timpa: false — fail yang muncul serentak tidak ditimpa.
                TulisAtomik(_laluanSandaran, Encoding.UTF8.GetBytes(obj.ToJsonString()), timpa: false);

                // Sandaran mesti boleh dibaca semula dengan nilai yang SAMA sebelum
                // apa-apa dipadam — jika tidak, pemulihan tidak dijamin.
                if (!string.Equals(BacaSandaran(), nilai, StringComparison.Ordinal))
                {
                    return new HasilPersaraan(false, "Sandaran autostart tidak dapat disahkan; Companion tidak dimatikan.");
                }
            }

            // Baca semula SEJURUS sebelum padam: nilai yang bertukar sejak bacaan
            // pertama tiada sandaran yang sepadan, jadi ia tidak dipadam.
            if (!string.Equals(_kunci.Baca(NamaNilaiRun), nilai, StringComparison.Ordinal))
            {
                return new HasilPersaraan(false,
                    "Entri autostart Companion berubah semasa operasi; tidak dipadam dan sandaran dikekalkan.");
            }

            _kunci.Padam(NamaNilaiRun);
            if (_kunci.Baca(NamaNilaiRun) is not null)
            {
                return new HasilPersaraan(false,
                    "Entri autostart Companion masih wujud selepas dipadam; sandaran dikekalkan.");
            }

            return new HasilPersaraan(true,
                "Autostart Companion lama dimatikan (sandaran disimpan). Companion yang sedang berjalan " +
                "tidak dihentikan — log keluar/mula semula Windows atau tutup proses itu secara manual.");
        }
        catch (Exception ex)
        {
            return new HasilPersaraan(false, "Gagal mematikan autostart Companion (" + ex.GetType().Name + ").");
        }
    }

    /// <summary>
    /// Menulis semula nilai Run asal. Sandaran dipadam HANYA selepas nilai Run
    /// dibaca semula dan SAMA dengan sandaran. Nilai lain yang sudah wujud tidak
    /// ditimpa, dan sandaran dikekalkan pada setiap kegagalan.
    /// </summary>
    public HasilPersaraan Pulihkan()
    {
        try
        {
            var nilai = BacaSandaran();
            if (nilai is null)
            {
                return new HasilPersaraan(false, "Tiada sandaran autostart Companion yang sah; tiada apa dipulihkan.");
            }

            var sedia = _kunci.Baca(NamaNilaiRun);
            if (sedia is not null && !string.Equals(sedia, nilai, StringComparison.Ordinal))
            {
                return new HasilPersaraan(false,
                    "Entri autostart Companion lain sudah wujud; ia tidak ditimpa dan sandaran dikekalkan.");
            }

            if (sedia is null) _kunci.Tulis(NamaNilaiRun, nilai);
            if (!string.Equals(_kunci.Baca(NamaNilaiRun), nilai, StringComparison.Ordinal))
            {
                return new HasilPersaraan(false,
                    "Entri autostart Companion tidak dapat disahkan selepas ditulis; sandaran dikekalkan.");
            }

            File.Delete(_laluanSandaran);
            return new HasilPersaraan(true,
                "Autostart Companion lama dipulihkan; ia akan bermula pada log masuk Windows seterusnya.");
        }
        catch (Exception ex)
        {
            return new HasilPersaraan(false,
                "Gagal memulihkan autostart Companion (" + ex.GetType().Name + "); sandaran dikekalkan.");
        }
    }

    /// <summary>
    /// Syarat runtime untuk membenarkan persaraan: klien backend AKTIF wujud,
    /// konfigurasi cakera semasa sama cap jari dengannya, DAN kedua-dua unit
    /// migrasi muktamad. Konfigurasi yang baru disimpan tetapi belum dimuatkan
    /// oleh klien aktif TIDAK mencukupi.
    /// </summary>
    public static bool DesktopBolehAmbilAlih(HasilMigrasi migrasi, PagarKonfigurasiBackend pagar) =>
        migrasi.Backend.Muktamad && migrasi.Kredensial.Muktamad && pagar.Semak().Sah;

    private string? BacaSandaran()
    {
        try
        {
            if (!File.Exists(_laluanSandaran)) return null;
            using var doc = JsonDocument.Parse(File.ReadAllText(_laluanSandaran, Encoding.UTF8));
            var akar = doc.RootElement;
            if (akar.ValueKind != JsonValueKind.Object) return null;
            if (!akar.TryGetProperty("nama", out var nama) || nama.GetString() != NamaNilaiRun) return null;
            if (!akar.TryGetProperty("nilai", out var nilai) || nilai.ValueKind != JsonValueKind.String) return null;
            var teks = nilai.GetString();
            return string.IsNullOrWhiteSpace(teks) ? null : teks;
        }
        catch
        {
            return null;
        }
    }

    private static void TulisAtomik(string laluan, byte[] bytes, bool timpa)
    {
        var sementara = laluan + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            File.WriteAllBytes(sementara, bytes);
            File.Move(sementara, laluan, overwrite: timpa);
        }
        finally
        {
            if (File.Exists(sementara)) File.Delete(sementara);
        }
    }
}
