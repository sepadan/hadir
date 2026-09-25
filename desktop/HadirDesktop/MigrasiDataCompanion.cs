using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace HadirDesktop;

/// <summary>
/// Folder data MILIK HADIR Desktop, dan folder lama Companion yang hanya dibaca
/// sekali oleh <see cref="MigrasiDataCompanion"/>.
///
/// Konfigurasi backend (<c>tetapan.json</c> + <c>rahsia.dat</c>) dan kredensial
/// idMe (<c>kredensial.dat</c>) tinggal dalam subfolder <c>enjin</c> sendiri,
/// bukan terus dalam folder pemasangan: kunci icacls (warisan dibuang, akaun
/// semasa sahaja) dikenakan pada subfolder ini sahaja, tidak pada exe atau
/// profil WebView2.
/// </summary>
public static class LaluanDataDesktop
{
    public const string NamaFolderApl = "HadirDesktop";
    public const string NamaSubfolderEnjin = "enjin";

    /// <summary>companion/src/tetapan.mjs <c>NAMA_FOLDER_DATA</c> — sumber migrasi sahaja.</summary>
    public const string NamaFolderLegasiCompanion = "HADIR-MOEIS-Companion";

    private static string LocalAppData() =>
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);

    /// <summary><c>%LOCALAPPDATA%\HadirDesktop\enjin</c>.</summary>
    public static string DirEnjin(string? asas = null) =>
        Path.Combine(asas ?? LocalAppData(), NamaFolderApl, NamaSubfolderEnjin);

    /// <summary><c>%LOCALAPPDATA%\HADIR-MOEIS-Companion</c> — dibaca, tidak pernah ditulis.</summary>
    public static string DirLegasiCompanion(string? asas = null) =>
        Path.Combine(asas ?? LocalAppData(), NamaFolderLegasiCompanion);
}

/// <summary>Keputusan migrasi SATU unit. Tiada nilai rahsia dalam mana-mana keputusan.</summary>
public enum KeputusanMigrasi
{
    /// <summary>Tiada fail Companion untuk dipindahkan. Muktamad.</summary>
    TiadaLegasi,
    /// <summary>Fail Companion disalin bait demi bait dan disahkan. Muktamad.</summary>
    Dipindahkan,
    /// <summary>Desktop sudah memegang data sah sendiri; tiada apa ditimpa. Muktamad.</summary>
    SudahMilikDesktop,
    /// <summary>Rekod migrasi mengatakan unit ini sudah muktamad; tiada semakan semula.</summary>
    SudahSelesai,
    /// <summary>Fail Companion ada tetapi tidak dapat dinyahsulit/dibaca/disahkan. Dicuba semula.</summary>
    LegasiTidakSah,
    /// <summary>Companion menyimpan penanda simpanan separuh jalan. Dicuba semula.</summary>
    LegasiBelumSelesai,
    /// <summary>Desktop ada data yang tidak sah dan bukan milik migrasi; tidak ditimpa.</summary>
    DesktopRosak,
    /// <summary>Rekod migrasi rosak; tiada apa dipindahkan (gagal-tertutup).</summary>
    RekodRosak,
    /// <summary>Ralat I/O atau pengesahan salinan gagal; penanda dikekalkan. Dicuba semula.</summary>
    Ralat,
    /// <summary>
    /// Salinan terdahulu tidak dimuktamadkan dan data Desktop kini tiada/tidak
    /// sah. Ia TIDAK diimport semula secara automatik (pemilik mungkin telah
    /// memadamnya). Pemulihan eksplisit: simpan tetapan/kredensial dalam HADIR
    /// Desktop, kemudian mulakan semula — salinan sah itu dimuktamadkan tanpa
    /// menyalin daripada Companion.
    /// </summary>
    PerluPemulihan,
}

/// <summary>Status satu unit: nama unit, keputusan, dan sebab yang bebas nilai.</summary>
public sealed record StatusMigrasiUnit(string Unit, KeputusanMigrasi Keputusan, string Sebab)
{
    /// <summary>Unit ini tidak akan disemak lagi pada lancaran seterusnya.</summary>
    public bool Muktamad => Keputusan is KeputusanMigrasi.TiadaLegasi or KeputusanMigrasi.Dipindahkan
        or KeputusanMigrasi.SudahMilikDesktop or KeputusanMigrasi.SudahSelesai;
}

public sealed record HasilMigrasi(StatusMigrasiUnit Backend, StatusMigrasiUnit Kredensial)
{
    /// <summary>Satu baris untuk log: nama keputusan sahaja, tiada laluan/URL/rahsia.</summary>
    public string Ringkasan() =>
        "Migrasi data Companion: backend=" + Backend.Keputusan + "; kredensial=" + Kredensial.Keputusan;
}

/// <summary>
/// Migrasi SEKALI, idempoten dan gagal-tertutup daripada folder lama Companion
/// (<c>%LOCALAPPDATA%\HADIR-MOEIS-Companion</c>) ke folder milik Desktop
/// (<see cref="LaluanDataDesktop.DirEnjin"/>).
///
/// Dua unit bebas:
///   * <c>backend</c>    — <c>tetapan.json</c> kemudian <c>rahsia.dat</c> (pasangan);
///   * <c>kredensial</c> — <c>kredensial.dat</c>.
///
/// Peraturan:
///   * Fail disalin BAIT DEMI BAIT. Blob DPAPI CurrentUser (entropi NULL) kekal
///     blob yang sama, jadi tiada nyahsulit-dan-sulit-semula; format tepat dikekalkan.
///   * Sumber mesti sah dahulu (nyahsulit + parse, pada akaun Windows ini) dan
///     salinan disahkan semula sebelum dianggap selesai. Nilai yang dinyahsulit
///     untuk pengesahan tidak disimpan, dilog atau dipulangkan.
///   * Data Desktop yang SAH tidak pernah ditimpa. Data Desktop yang TIDAK sah
///     hanya ditimpa jika penanda migrasi kita sendiri membuktikan ia sisa salinan
///     kita yang terputus; selain itu ia dibiarkan dan dilaporkan.
///   * Fail Companion tidak pernah dipadam, diubah atau dikunci.
///   * Keputusan muktamad direkod dalam <c>migrasi-companion.json</c>, jadi
///     kredensial yang dipadam pemilik dalam Desktop tidak dihidupkan semula
///     daripada salinan Companion pada lancaran seterusnya.
///   * Rekod yang rosak menghentikan migrasi sepenuhnya (tiada tekaan).
/// </summary>
public sealed class MigrasiDataCompanion
{
    public const string NamaRekod = "migrasi-companion.json";
    public const string UnitBackend = "backend";
    public const string UnitKredensial = "kredensial";

    /// <summary>Penanda simpanan separuh jalan milik <see cref="DpapiRahsiaEnjinStore"/>.</summary>
    public const string PenandaStoreBackend = "tetapan-desktop-belum-selesai";

    /// <summary>
    /// Penanda salinan backend yang belum dimuktamadkan. Selagi ia wujud,
    /// <see cref="DpapiRahsiaEnjinStore.Baca"/> memulangkan null (gagal-tertutup).
    /// </summary>
    public const string PenandaMigrasiBackend = "migrasi-" + UnitBackend + ".belum-selesai";

    /// <summary>
    /// Penanda kredensial yang belum dimuktamadkan. Selagi ia wujud,
    /// <see cref="DpapiKredensialIdMeStore"/> melaporkan tiada kredensial (gagal-tertutup).
    /// </summary>
    public const string PenandaMigrasiKredensial = "migrasi-" + UnitKredensial + ".belum-selesai";

    private sealed record Unit(string Nama, string[] Fail, Func<string, bool> SahDi, string? PenandaStore);

    private readonly string _dirLegasi;
    private readonly string _dirDesktop;
    private readonly Action<string> _kunciFolder;
    private readonly Action<string>? _selepasFailDisalin;
    private readonly Action? _sebelumTulisRekod;
    private readonly Action? _sebelumTulisPenandaMuktamad;

    public MigrasiDataCompanion()
        : this(LaluanDataDesktop.DirLegasiCompanion(), LaluanDataDesktop.DirEnjin())
    {
    }

    /// <param name="kunciFolder">
    /// Kunci ACL folder Desktop selepas ia dicipta. Lalai: kunci icacls yang sama
    /// seperti <see cref="DpapiKredensialIdMeStore"/>. Ujian memberi no-op.
    /// </param>
    public MigrasiDataCompanion(string dirLegasi, string dirDesktop, Action<string>? kunciFolder = null)
    {
        _dirLegasi = dirLegasi;
        _dirDesktop = dirDesktop;
        _kunciFolder = kunciFolder ?? DpapiKredensialIdMeStore.KunciFolder;
    }

    /// <summary>
    /// Test seam: simulasi terputus selepas SATU fail disalin, atau kegagalan
    /// sejurus sebelum rekod tahan lama ditulis.
    /// </summary>
    internal MigrasiDataCompanion(string dirLegasi, string dirDesktop, Action<string> kunciFolder,
        Action<string>? selepasFailDisalin, Action? sebelumTulisRekod = null, Action? sebelumTulisPenandaMuktamad = null)
        : this(dirLegasi, dirDesktop, kunciFolder)
    {
        _selepasFailDisalin = selepasFailDisalin;
        _sebelumTulisRekod = sebelumTulisRekod;
        _sebelumTulisPenandaMuktamad = sebelumTulisPenandaMuktamad;
    }

    private static readonly Unit Backend = new(
        UnitBackend,
        new[] { "tetapan.json", "rahsia.dat" },   // rahsia TERAKHIR: salinan separa = tiada rahsia = gagal-tertutup
        // Pengesahan salinan mengabaikan penanda migrasi kita sendiri; runtime
        // (Baca) tidak — pasangan yang belum dimuktamadkan tidak pernah aktif.
        dir => new DpapiRahsiaEnjinStore(dir).BacaPasangan() is not null,
        PenandaStoreBackend);

    private static readonly Unit Kredensial = new(
        UnitKredensial,
        new[] { "kredensial.dat" },
        // Pengesahan salinan mengabaikan penanda migrasi; runtime (Baca/Ada) tidak.
        dir => KredensialSah(new DpapiKredensialIdMeStore(Path.Combine(dir, "kredensial.dat")).BacaTanpaPenandaMigrasi()),
        null);

    /// <summary>
    /// Kredensial LENGKAP sahaja: pengguna, kata laluan DAN frasa kunci
    /// keselamatan (log masuk ditolak tanpa frasa). Kredensial separa kekal
    /// tidak muktamad dan dicuba semula; ia tidak pernah direkod sebagai selesai.
    /// </summary>
    internal static bool KredensialSah(KredensialIdMe? k) =>
        k is not null && !string.IsNullOrWhiteSpace(k.Pengguna) && !string.IsNullOrEmpty(k.KataLaluan)
        && !string.IsNullOrWhiteSpace(k.KunciKeselamatan);

    public string LaluanRekod => Path.Combine(_dirDesktop, NamaRekod);

    /// <summary>Kandungan penanda semasa salinan sedang berjalan (salinan separa boleh diulang).</summary>
    private const string TahapMenyalin = "menyalin";

    /// <summary>
    /// Awalan kandungan penanda apabila keputusan unit sudah muktamad TETAPI rekod
    /// tahan lama belum disahkan. Dalam tahap ini tiada lagi salinan daripada
    /// Companion — hanya rekod yang ditunggu — jadi data yang dipadam pemilik
    /// tidak diimport semula.
    /// </summary>
    private const string AwalanTahapMuktamad = "muktamad:";

    private static string LaluanPenanda(string dirDesktop, string unit) =>
        Path.Combine(dirDesktop, "migrasi-" + unit + ".belum-selesai");

    /// <summary>
    /// Tidak pernah melontar: setiap kegagalan menjadi keputusan bebas nilai.
    ///
    /// Keputusan muktamad HANYA selepas rekod <c>migrasi-companion.json</c> ditulis
    /// dan dibaca semula dengan nilai yang sama. Susunan: (1) penanda unit ditukar
    /// ke tahap "muktamad:&lt;keputusan&gt;"; (2) rekod ditulis dan disahkan;
    /// (3) barulah penanda dibuang. Kegagalan pada (1) atau (2) memulangkan
    /// <see cref="KeputusanMigrasi.Ralat"/> (tidak muktamad) dan mengekalkan penanda,
    /// jadi stor gagal-tertutup. Terputus selepas (2) sebelum (3) dibersihkan pada
    /// lancaran seterusnya tanpa import semula.
    /// </summary>
    public HasilMigrasi Jalankan()
    {
        Dictionary<string, string> rekod;
        try
        {
            rekod = BacaRekod();
        }
        catch
        {
            const string sebab = "Rekod migrasi Desktop rosak; tiada fail Companion dipindahkan.";
            return new HasilMigrasi(
                new StatusMigrasiUnit(UnitBackend, KeputusanMigrasi.RekodRosak, sebab),
                new StatusMigrasiUnit(UnitKredensial, KeputusanMigrasi.RekodRosak, sebab));
        }

        var hasil = new[] { JalankanUnit(Backend, rekod), JalankanUnit(Kredensial, rekod) };
        var calon = hasil.Where(s => s.Muktamad && s.Keputusan != KeputusanMigrasi.SudahSelesai).ToArray();
        if (calon.Length == 0) return new HasilMigrasi(hasil[0], hasil[1]);

        try
        {
            Directory.CreateDirectory(_dirDesktop);
            // (1) Niat tahan lama: unit ini tidak akan disalin lagi.
            _sebelumTulisPenandaMuktamad?.Invoke();
            foreach (var s in calon)
                TulisAtomik(LaluanPenanda(_dirDesktop, s.Unit),
                    Encoding.ASCII.GetBytes(AwalanTahapMuktamad + s.Keputusan), timpa: true);

            // (2) Rekod, kemudian baca semula dan bandingkan.
            _sebelumTulisRekod?.Invoke();
            foreach (var s in calon) rekod[s.Unit] = s.Keputusan.ToString();
            TulisRekod(rekod);
            var semula = BacaRekod();
            foreach (var s in calon)
            {
                if (!semula.TryGetValue(s.Unit, out var k) || k != s.Keputusan.ToString())
                    throw new IOException("rekod tidak sepadan selepas dibaca semula");
            }
        }
        catch (Exception ex)
        {
            // Tiada kemuktamadan tanpa rekod tahan lama. Penanda dikekalkan:
            // stor backend dan kredensial kekal gagal-tertutup.
            var sebab = "Keputusan migrasi tidak dapat direkod (" + ex.GetType().Name +
                "); data tidak digunakan dan rekod dicuba semula pada lancaran seterusnya.";
            for (var i = 0; i < hasil.Length; i++)
            {
                if (calon.Contains(hasil[i])) hasil[i] = hasil[i] with { Keputusan = KeputusanMigrasi.Ralat, Sebab = sebab };
            }
            return new HasilMigrasi(hasil[0], hasil[1]);
        }

        // (3) Rekod sah: penanda boleh dibuang. Kegagalan di sini tidak
        // mengubah kemuktamadan — lancaran seterusnya membersihkannya.
        foreach (var s in calon) TryPadam(LaluanPenanda(_dirDesktop, s.Unit));
        return new HasilMigrasi(hasil[0], hasil[1]);
    }

    /// <summary>
    /// Tahap penanda unit: tiada; salinan separa (<see cref="TahapMenyalin"/> atau
    /// kandungan tidak dikenali); atau keputusan muktamad yang menunggu rekod.
    /// </summary>
    private static (bool Ada, KeputusanMigrasi? Muktamad) BacaTahap(string laluan)
    {
        if (!File.Exists(laluan)) return (false, null);
        var teks = File.ReadAllText(laluan, Encoding.ASCII).Trim();
        if (teks.StartsWith(AwalanTahapMuktamad, StringComparison.Ordinal)
            && Enum.TryParse<KeputusanMigrasi>(teks[AwalanTahapMuktamad.Length..], out var k)
            && k is KeputusanMigrasi.Dipindahkan or KeputusanMigrasi.SudahMilikDesktop or KeputusanMigrasi.TiadaLegasi)
        {
            return (true, k);
        }
        return (true, null);
    }

    private StatusMigrasiUnit JalankanUnit(Unit unit, IReadOnlyDictionary<string, string> rekod)
    {
        var penandaMigrasi = LaluanPenanda(_dirDesktop, unit.Nama);
        if (rekod.ContainsKey(unit.Nama))
        {
            // Terputus selepas rekod ditulis tetapi sebelum penanda dibuang:
            // rekod tahan lama menang, sisa penanda dibersihkan, tiada import.
            TryPadam(penandaMigrasi);
            return Status(unit, KeputusanMigrasi.SudahSelesai, "Migrasi sudah selesai sebelum ini; Desktop memiliki data ini.");
        }

        try
        {
            var (adaPenanda, muktamadTertunda) = BacaTahap(penandaMigrasi);
            if (muktamadTertunda is KeputusanMigrasi k)
            {
                // Keputusan sudah dibuat; hanya rekod yang belum tahan lama.
                // Tiada salinan semula walaupun data Desktop kini tiada.
                return Status(unit, k, "Keputusan migrasi terdahulu dimuktamadkan tanpa salinan semula.");
            }

            var penandaKita = adaPenanda;

            if (unit.PenandaStore is not null && File.Exists(Path.Combine(_dirDesktop, unit.PenandaStore)))
            {
                return Status(unit, KeputusanMigrasi.DesktopRosak,
                    "Simpanan tetapan Desktop belum selesai; tidak ditimpa daripada Companion.");
            }

            if (unit.SahDi(_dirDesktop))
            {
                if (penandaKita)
                {
                    // Salinan penuh sebelum ini terputus sebelum dimuktamadkan.
                    // Penanda kekal sehingga rekod tahan lama disahkan (Jalankan).
                    return Status(unit, KeputusanMigrasi.Dipindahkan, "Salinan terdahulu disahkan dan dimuktamadkan.");
                }
                return Status(unit, KeputusanMigrasi.SudahMilikDesktop, "Desktop sudah memegang data sah; tiada apa ditimpa.");
            }

            if (penandaKita)
            {
                // Penanda salinan separa + data Desktop tiada/tidak sah. Ini
                // mungkin salinan yang terputus, ATAU salinan lengkap yang
                // penanda muktamadnya gagal ditulis lalu dipadam pemilik —
                // kedua-duanya tidak dapat dibezakan. GAGAL-TERTUTUP: tiada
                // import automatik daripada Companion. Penanda dikekalkan, jadi
                // stor kekal tanpa data sehingga pemulihan eksplisit.
                return Status(unit, KeputusanMigrasi.PerluPemulihan,
                    "Migrasi terdahulu tidak dimuktamadkan dan data Desktop tiada/tidak sah; tiada import semula automatik. " +
                    "Simpan tetapan/kredensial dalam HADIR Desktop dan mulakan semula.");
            }

            var adaFailDesktop = unit.Fail.Any(f => File.Exists(Path.Combine(_dirDesktop, f)));
            if (adaFailDesktop)
            {
                return Status(unit, KeputusanMigrasi.DesktopRosak,
                    "Fail Desktop sedia ada tidak sah dan bukan sisa migrasi; tidak ditimpa.");
            }

            if (unit.PenandaStore is not null && File.Exists(Path.Combine(_dirLegasi, unit.PenandaStore)))
            {
                return Status(unit, KeputusanMigrasi.LegasiBelumSelesai,
                    "Tetapan Companion ditinggalkan separuh jalan; isi semula dalam HADIR Desktop.");
            }

            if (!unit.Fail.Any(f => File.Exists(Path.Combine(_dirLegasi, f))))
            {
                return Status(unit, KeputusanMigrasi.TiadaLegasi, "Tiada data Companion untuk dipindahkan.");
            }

            if (!unit.SahDi(_dirLegasi))
            {
                return Status(unit, KeputusanMigrasi.LegasiTidakSah,
                    "Data Companion tidak lengkap atau tidak dapat dibaca/disahkan pada akaun Windows ini; tiada apa disalin.");
            }

            Directory.CreateDirectory(_dirDesktop);
            _kunciFolder(_dirDesktop);
            File.WriteAllText(penandaMigrasi, TahapMenyalin, Encoding.ASCII);
            var adaDisalin = false;
            try
            {
                foreach (var nama in unit.Fail)
                {
                    var sumber = Path.Combine(_dirLegasi, nama);
                    if (!File.Exists(sumber)) continue;
                    // Tidak pernah menimpa: salinan hanya bermula apabila Desktop
                    // tiada fail unit ini dan tiada penanda lama. Fail yang muncul
                    // serentak menang.
                    TulisAtomik(Path.Combine(_dirDesktop, nama), File.ReadAllBytes(sumber), timpa: false);
                    adaDisalin = true;
                    _selepasFailDisalin?.Invoke(nama);
                }
            }
            catch
            {
                if (!adaDisalin) TryPadam(penandaMigrasi);
                throw;
            }

            if (!unit.SahDi(_dirDesktop))
            {
                return Status(unit, KeputusanMigrasi.Ralat,
                    "Salinan tidak dapat disahkan; penanda dikekalkan dan Desktop gagal-tertutup.");
            }

            // Penanda TIDAK dibuang di sini: kemuktamadan bergantung pada rekod
            // tahan lama yang ditulis oleh Jalankan.
            return Status(unit, KeputusanMigrasi.Dipindahkan, "Data Companion disalin ke folder Desktop dan disahkan.");
        }
        catch (Exception ex)
        {
            // Jenis sahaja: mesej pengecualian I/O boleh memuatkan laluan.
            return Status(unit, KeputusanMigrasi.Ralat,
                "Migrasi gagal (" + ex.GetType().Name + "); dicuba semula pada lancaran seterusnya.");
        }
    }

    private static StatusMigrasiUnit Status(Unit unit, KeputusanMigrasi k, string sebab) => new(unit.Nama, k, sebab);

    private Dictionary<string, string> BacaRekod()
    {
        var hasil = new Dictionary<string, string>(StringComparer.Ordinal);
        if (!File.Exists(LaluanRekod)) return hasil;

        using var doc = JsonDocument.Parse(File.ReadAllText(LaluanRekod, Encoding.UTF8));
        if (doc.RootElement.ValueKind != JsonValueKind.Object) throw new JsonException();
        foreach (var unit in new[] { UnitBackend, UnitKredensial })
        {
            if (!doc.RootElement.TryGetProperty(unit, out var el)) continue;
            if (el.ValueKind != JsonValueKind.String) throw new JsonException();
            if (!Enum.TryParse<KeputusanMigrasi>(el.GetString(), out var k)) throw new JsonException();
            if (!new StatusMigrasiUnit(unit, k, "").Muktamad) throw new JsonException();
            hasil[unit] = k.ToString();
        }
        return hasil;
    }

    private void TulisRekod(IReadOnlyDictionary<string, string> rekod)
    {
        var obj = new JsonObject { ["versi"] = 1 };
        foreach (var (unit, keputusan) in rekod) obj[unit] = keputusan;
        Directory.CreateDirectory(_dirDesktop);
        TulisAtomik(LaluanRekod, Encoding.UTF8.GetBytes(obj.ToJsonString()), timpa: true);
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

    private static void TryPadam(string laluan)
    {
        try { File.Delete(laluan); } catch { /* penanda kekal = gagal-tertutup */ }
    }
}
