using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace HadirDesktop;

/// <summary>
/// One student the TASK says is absent, with the MANDATORY absence category and
/// reason. MOEIS refuses an absence without both, so a task that is missing
/// either is rejected BEFORE the portal is touched (same rule as the companion's
/// <c>push.mjs</c>: "kategori/sebab wajib ... SEBELUM membuka pelayar").
/// </summary>
public sealed record MuridTidakHadir(string Id, string Kategori, string Sebab)
{
    /// <summary>
    /// Optional HADIR-side name. Carried so a later slice can resolve the
    /// MOEIS page row the SAME way the companion engine does (name matching
    /// against <c>data-namapelajar</c>/<c>data-idpelajar</c>) when the task
    /// record does not carry a page id. It is never sent to MOEIS by itself and
    /// is never part of a selector.
    /// </summary>
    public string Nama { get; init; } = "";
}

/// <summary>
/// Outcome of building a submission task from a full HADIR record.
/// <see cref="Tugasan"/> null with a reason = submit NOTHING (fail closed):
/// the desktop never invents a student, never invents a category/reason, and
/// never submits an empty or unidentifiable absence list.
/// </summary>
public sealed record PembinaanTugasan(TugasanPenghantaran? Tugasan, string Sebab)
{
    public bool Boleh => Tugasan is not null;
}

/// <summary>
/// PURE bridge from a full HADIR task record (<see cref="KerjaPenuh"/>, read
/// through the engine's allowlisted <c>/api/lokal/kerja-penuh</c> route) to a
/// <see cref="TugasanPenghantaran"/>. Every refusal is explicit; nothing is
/// guessed and nothing is filled in on the portal's behalf.
/// </summary>
public static class PembinaTugasanPenghantaran
{
    public static PembinaanTugasan DaripadaKerja(KerjaPenuh kerja, bool sahkan = false)
    {
        if (kerja is null) return new(null, "Tiada rekod kerja; tiada penghantaran.");

        var kelas = (kerja.Kelas ?? "").Trim();
        if (kelas.Length == 0) return new(null, "Rekod kerja tiada kelas; tiada penghantaran.");

        var tarikh = (kerja.TarikhIso ?? "").Trim();

        var murid = kerja.Murid ?? Array.Empty<MuridKerjaPenuh>();
        if (murid.Count == 0)
        {
            // An empty absence list is NEVER a submission: it would tell MOEIS
            // "everyone present" — a fact the task does not assert.
            return new(null, "Tugasan " + kelas + " tiada murid tidak hadir; tiada penghantaran (kehadiran TIDAK direka).");
        }

        var senarai = new List<MuridTidakHadir>(murid.Count);
        foreach (var m in murid)
        {
            var nama = (m.Nama ?? "").Trim();
            var id = (m.Id ?? "").Trim();
            if (id.Length == 0)
            {
                // HADIR's task record carries only the student's NAME (the
                // engine matches on it and reads data-idpelajar from the page).
                // Without a page id the flow would have to GUESS a selector, so
                // it refuses instead — name-based resolution is the next slice.
                return new(null,
                    "Tugasan " + kelas + ": id murid MOEIS tidak disertakan oleh enjin HADIR" +
                    (nama.Length > 0 ? " (murid: " + nama + ")" : "") +
                    "; padanan mengikut nama belum dilaksanakan — tiada penghantaran.");
            }

            var kategori = (m.Kategori ?? "").Trim();
            var sebab = (m.Sebab ?? "").Trim();
            if (kategori.Length == 0 || sebab.Length == 0)
            {
                return new(null, "Tugasan " + kelas + ": murid " + id + " tiada kategori/sebab wajib MOEIS; tiada penghantaran.");
            }

            senarai.Add(new MuridTidakHadir(id, kategori, sebab) { Nama = nama });
        }

        return new(new TugasanPenghantaran
        {
            Kelas = kelas,
            Tahun = null,
            TarikhIso = tarikh.Length == 0 ? null : tarikh,
            TidakHadir = senarai,
            Sahkan = sahkan,
        }, "Tugasan " + kelas + " (" + senarai.Count + " murid tidak hadir) sedia untuk dihantar.");
    }
}

/// <summary>
/// A single submission task: ONE class, ONE date, and the students HADIR says
/// are absent. Everything sent to MOEIS comes from here — the adapter never
/// invents a presence/absence for a student the task does not mention.
/// </summary>
public sealed class TugasanPenghantaran
{
    /// <summary>Class label as HADIR stores it (e.g. "PRASEKOLAH").</summary>
    public string Kelas { get; init; } = "";

    /// <summary>Optional year/"tahun" label; when null the year dropdown is left alone.</summary>
    public string? Tahun { get; init; }

    /// <summary>Optional <c>yyyy-MM-dd</c>. When null the page's own date is used as-is and reported.</summary>
    public string? TarikhIso { get; init; }

    /// <summary>The absent students. An empty list is NEVER submitted.</summary>
    public IReadOnlyList<MuridTidakHadir> TidakHadir { get; init; } = Array.Empty<MuridTidakHadir>();

    /// <summary>
    /// false = <c>.sweet-alert:visible button.simpan</c> (save only);
    /// true  = <c>.sweet-alert:visible button.simpansah</c> (save AND confirm).
    /// Mirrors <c>tekanSimpan(adapter, { sahkan })</c> in the companion — the two
    /// buttons are alternatives on the SAME dialog, never both.
    /// </summary>
    public bool Sahkan { get; init; }
}

/// <summary>What the mandatory post-save re-read could actually prove.</summary>
public sealed record VerifikasiPenghantaran(
    bool Tarikh = false,
    bool Kelas = false,
    bool Murid = false,
    bool KategoriSebab = false)
{
    public bool Semua => Tarikh && Kelas && Murid && KategoriSebab;
}

/// <summary>
/// Structured outcome. <see cref="Berjaya"/> is true for exactly ONE status —
/// <c>disahkan</c> — which requires the post-save re-read to have confirmed
/// every marked student. A save dialog that said "Berjaya." is NOT enough.
/// </summary>
public sealed class HasilPenghantaran
{
    public string Status { get; set; } = "gagal";
    public bool Berjaya { get; set; }
    public string Sebab { get; set; } = "";
    public string Kelas { get; set; } = "";
    public string? TarikhIso { get; set; }
    /// <summary>Total students read off the page (null when never read).</summary>
    public int? BilMurid { get; set; }
    /// <summary>Students this run actually toggled to absent.</summary>
    public int BilPerubahan { get; set; }
    /// <summary>Task students MOEIS already had as absent — deliberately NOT re-sent.</summary>
    public int BilDilangkau { get; set; }
    /// <summary><c>tiada</c> / <c>simpan</c> / <c>simpansah</c>.</summary>
    public string TindakanSimpan { get; set; } = "tiada";
    public VerifikasiPenghantaran Verifikasi { get; set; } = new();
    public List<string> Bukti { get; } = new();
}

/// <summary>One <c>&lt;option&gt;</c> as read off the page.</summary>
public sealed record PilihanDropdown(string Nilai, string Teks);

/// <summary>Outcome of matching a HADIR label against the page's options.</summary>
public sealed record KeputusanPadanan(
    bool Ok,
    string Nilai = "",
    string Teks = "",
    string Cara = "",
    string Sebab = "",
    int BilanganCalon = 0);

/// <summary>The category/reason currently selected on a student's row.</summary>
public sealed record SebabMurid(string KategoriNilai, string KategoriTeks, string SebabNilai, string SebabTeks);

/// <summary>A student row: the <c>data-idpelajar</c> and whether the box is ticked (present).</summary>
public sealed record BarisMurid(string Id, bool Hadir);

/// <summary>
/// MOEIS dropdown label matching — a faithful port of <c>pilihDropdown</c> in
/// <c>companion/src/moeis/adaptorPlaywright.mjs</c>. EXACT first; only if there
/// is no exact hit does an UNAMBIGUOUS prefix match count (live example: HADIR
/// stores "PRASEKOLAH", MOEIS shows "PRASEKOLAH BIJAK"). Two or more candidates
/// = STOP. Never guess a class, a category or a reason.
/// </summary>
public static class PadananDropdown
{
    /// <summary>Same normalisation as the companion: uppercase, then drop every non <c>[A-Z0-9]</c>.</summary>
    public static string Norm(string? x)
    {
        if (string.IsNullOrEmpty(x)) return "";
        var sb = new StringBuilder(x!.Length);
        foreach (var c in x!.ToUpperInvariant())
        {
            if ((c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')) sb.Append(c);
        }
        return sb.ToString();
    }

    public static KeputusanPadanan Pilih(IReadOnlyList<PilihanDropdown>? opsyen, string? label)
    {
        var sasaran = Norm(label);
        if (sasaran.Length == 0) return new KeputusanPadanan(false, Sebab: "label-kosong");

        var senarai = (opsyen ?? (IReadOnlyList<PilihanDropdown>)Array.Empty<PilihanDropdown>())
            .Where(o => o != null && Norm(o.Teks).Length > 0)
            .ToList();

        // 1. EXACT on the visible text.
        var cara = "tepat";
        var calon = senarai.Where(o => Norm(o.Teks) == sasaran).ToList();

        // 2. EXACT on the option value (the companion's category matcher checks
        //    `o.value` before `o.textContent`; keeping it in the EXACT stage
        //    means an exact value can never lose to a prefix on some other row).
        if (calon.Count == 0)
        {
            cara = "tepat-nilai";
            calon = senarai.Where(o => Norm(o.Nilai) == sasaran).ToList();
        }

        // 3. Only now: UNAMBIGUOUS prefix.
        if (calon.Count == 0)
        {
            cara = "awalan";
            calon = senarai.Where(o => Norm(o.Teks).StartsWith(sasaran, StringComparison.Ordinal)).ToList();
        }

        if (calon.Count != 1)
        {
            return new KeputusanPadanan(false,
                Sebab: calon.Count > 1 ? "padanan-ambigu" : "tiada-pilihan",
                BilanganCalon: calon.Count);
        }

        var opt = calon[0];
        // The companion refuses an option with an empty value (the "-- pilih --"
        // placeholder) even when the text matched.
        if (string.IsNullOrEmpty(opt.Nilai)) return new KeputusanPadanan(false, Sebab: "nilai-kosong");

        return new KeputusanPadanan(true, opt.Nilai, opt.Teks.Trim(), cara);
    }

    /// <summary>
    /// Read-back comparison for the post-save re-read: the page may show the
    /// matched option (value + text) rather than the HADIR label verbatim, so a
    /// row counts as matching when EITHER side matches exactly, or the page text
    /// starts with the HADIR label (the same prefix rule that selected it).
    /// </summary>
    public static bool Padan(string? nilaiPada, string? teksPada, string? label)
    {
        var sasaran = Norm(label);
        if (sasaran.Length == 0) return false;
        var nilai = Norm(nilaiPada);
        var teks = Norm(teksPada);
        if (nilai == sasaran || teks == sasaran) return true;
        return teks.Length > 0 && teks.StartsWith(sasaran, StringComparison.Ordinal);
    }
}

/// <summary>
/// The narrow DOM surface the submission flow drives. The production
/// implementation (<see cref="WebView2DomMoeis"/>) runs each operation through
/// <c>CoreWebView2.ExecuteScriptAsync</c>; tests inject an in-memory stub. Every
/// DECISION (what to mark, whether the dropdown match is unambiguous, whether
/// the re-read proved the submission) lives in <see cref="PenghantaranMoeisFlow"/>
/// so it stays pure and testable.
/// </summary>
public interface IDomMoeis
{
    Task NavigasiHarian();
    Task<bool> KlikTabHarian();
    Task<bool> TungguKemaskiniKelihatan();
    Task<string?> BacaTarikhInput();
    Task TetapkanTarikhInput(string paparanDdMmYyyy);
    Task<IReadOnlyList<PilihanDropdown>> BacaPilihanDropdown(string selektor);
    Task<bool> PilihNilaiDropdown(string selektor, string nilai);
    Task<IReadOnlyList<BarisMurid>> BacaSenaraiMurid();
    /// <summary>Click a student's <c>input.case-hadir</c> so the row becomes ABSENT.</summary>
    Task<bool> TandaTidakHadir(string id);
    /// <summary>Wait for <c>td.sebabthadir .selectkategori</c> to appear on that row.</summary>
    Task<bool> TungguPemilihSebab(string id);
    Task<IReadOnlyList<PilihanDropdown>> BacaPilihanKategori(string id);
    Task<bool> PilihKategori(string id, string nilai);
    Task<IReadOnlyList<PilihanDropdown>> BacaPilihanSebab(string id);
    Task<bool> PilihSebab(string id, string nilai);
    Task<SebabMurid?> BacaSebabMurid(string id);
    Task TekanKemaskini();
    Task<bool> DialogSimpanKelihatan();
    Task<bool> KlikSimpan();
    Task<bool> KlikSimpanSahkan();
    Task<bool> DialogBerjayaKelihatan();
    Task MuatSemula();
}

/// <summary>The one entry point the rest of the app uses to submit attendance.</summary>
public interface IPenghantaranMoeis
{
    Task<HasilPenghantaran> HantarAsync(TugasanPenghantaran tugasan, CancellationToken ct = default);
}

/// <summary>
/// PURE MOEIS submission flow, ported from <c>companion/src/moeis/push.mjs</c> +
/// <c>halaman.mjs</c> (selectors and matching rules from
/// <c>adaptorPlaywright.mjs</c>). The order is the point:
///
///   1. validate the TASK (ids + mandatory category/reason + no duplicates)
///      BEFORE any portal call;
///   2. open the daily tab, set+verify the date, select year/class;
///   3. read the student list and mark ONLY task students MOEIS still shows as
///      present — a student MOEIS already has as absent is NEVER re-sent;
///   4. fill category AND reason on every marked row and READ THEM BACK before
///      touching the save button — an unfilled row aborts without saving;
///   5. save (<c>.simpan</c>) or save+confirm (<c>.simpansah</c>), require the
///      "Berjaya." dialog;
///   6. MANDATORY re-read (reload + re-open + re-select, READ ONLY — never a
///      second submit). Only a re-read that confirms every student counts as
///      <c>Berjaya</c>.
/// </summary>
public static class PenghantaranMoeisFlow
{
    public const string SelektorKelas = "#txtNamakelas";
    public const string SelektorTahun = "#txtThnting";

    private static HasilPenghantaran Buat(TugasanPenghantaran t, string status, string sebab, params string[] bukti)
    {
        var h = new HasilPenghantaran
        {
            Status = status,
            Berjaya = false,
            Sebab = sebab,
            Kelas = (t.Kelas ?? "").Trim(),
            TarikhIso = t.TarikhIso,
        };
        h.Bukti.AddRange(bukti);
        return h;
    }

    /// <summary>Port of <c>formatTarikhPaparan</c>: yyyy-MM-dd → dd/MM/yyyy.</summary>
    public static string? FormatTarikhPaparan(string? tarikhIso)
    {
        var s = (tarikhIso ?? "").Trim();
        if (s.Length != 10) return null;
        if (s[4] != '-' || s[7] != '-') return null;
        for (var i = 0; i < s.Length; i++)
        {
            if (i == 4 || i == 7) continue;
            if (s[i] < '0' || s[i] > '9') return null;
        }
        return s.Substring(8, 2) + "/" + s.Substring(5, 2) + "/" + s.Substring(0, 4);
    }

    public static async Task<HasilPenghantaran> JalankanAsync(
        IDomMoeis dom, TugasanPenghantaran tugasan, CancellationToken ct = default)
    {
        if (dom == null) throw new ArgumentNullException(nameof(dom));
        if (tugasan == null) throw new ArgumentNullException(nameof(tugasan));

        // ---- 1. Task validation. Nothing below here has touched the portal. ----
        var kelas = (tugasan.Kelas ?? "").Trim();
        if (kelas.Length == 0)
        {
            return Buat(tugasan, "tugasan-tidak-sah", "Tugasan tiada nama kelas; tiada apa-apa dihantar.", "kelas-kosong");
        }

        var senarai = tugasan.TidakHadir ?? Array.Empty<MuridTidakHadir>();
        if (senarai.Count == 0)
        {
            // Never press save on an empty task: this adapter only submits what
            // the task carries, and an empty task carries no attendance at all.
            return Buat(tugasan, "tugasan-kosong",
                "Tugasan tidak membawa seorang pun murid tidak hadir; tiada apa-apa untuk dihantar.", "tugasan-kosong");
        }

        var kekurangan = senarai
            .Where(m => m == null || string.IsNullOrWhiteSpace(m.Id) || string.IsNullOrWhiteSpace(m.Kategori) || string.IsNullOrWhiteSpace(m.Sebab))
            .Count();
        if (kekurangan > 0)
        {
            return Buat(tugasan, "kategori-sebab-tiada",
                $"{kekurangan} murid dalam tugasan tiada id/kategori/sebab; MOEIS mewajibkan kategori dan sebab bagi setiap murid tidak hadir.",
                "kategori-sebab-tiada");
        }

        var pendua = senarai.GroupBy(m => m.Id.Trim(), StringComparer.Ordinal).Where(g => g.Count() > 1).Select(g => g.Key).ToList();
        if (pendua.Count > 0)
        {
            // Two entries for one student may disagree on category/reason. Stop
            // honestly instead of picking one — a duplicate is never submitted.
            return Buat(tugasan, "pendua-id",
                $"{pendua.Count} id murid berulang dalam tugasan; pendua tidak dihantar.", "pendua-id");
        }

        string? paparanTarikh = null;
        if (!string.IsNullOrWhiteSpace(tugasan.TarikhIso))
        {
            paparanTarikh = FormatTarikhPaparan(tugasan.TarikhIso);
            if (paparanTarikh == null)
            {
                return Buat(tugasan, "tugasan-tidak-sah",
                    "TarikhIso mesti berformat YYYY-MM-DD; tiada apa-apa dihantar.", "tarikh-tidak-sah");
            }
        }

        var dijangka = senarai.ToDictionary(m => m.Id.Trim(), m => m, StringComparer.Ordinal);

        try
        {
            // ---- 2. Open the page and put it in the task's context. ----
            await dom.NavigasiHarian();
            ct.ThrowIfCancellationRequested();

            var sedia = await SediakanHalamanAsync(dom, tugasan, kelas, paparanTarikh, ct);
            if (sedia.Gagal != null) return sedia.Gagal;

            var muridAwal = sedia.Murid;
            var indeks = muridAwal.ToDictionary(m => m.Id, m => m, StringComparer.Ordinal);

            var tiada = dijangka.Keys.Where(id => !indeks.ContainsKey(id)).ToList();
            if (tiada.Count > 0)
            {
                var h = Buat(tugasan, "id-tidak-dijumpai",
                    $"{tiada.Count} id murid dalam tugasan tidak wujud pada senarai MOEIS kelas ini; tiada apa-apa disimpan.",
                    "id-tidak-dijumpai");
                h.BilMurid = muridAwal.Count;
                return h;
            }

            // ---- 3. Only students MOEIS still shows as PRESENT get marked. ----
            var perluTanda = dijangka.Keys.Where(id => indeks[id].Hadir).ToList();
            var sudahTidakHadir = dijangka.Keys.Where(id => !indeks[id].Hadir).ToList();
            // Everything MOEIS already had absent (task or not) is expected to
            // stay absent through the re-read; we never restore anyone to present.
            var praTidakHadir = muridAwal.Where(m => !m.Hadir).Select(m => m.Id).ToHashSet(StringComparer.Ordinal);

            if (perluTanda.Count == 0)
            {
                // Nothing to change → nothing is saved. Not a failure, but not a
                // submission either: never press save just to press it.
                await dom.MuatSemula();
                var h = Buat(tugasan, "tidak-berubah",
                    "MOEIS sudah menanda setiap murid dalam tugasan sebagai tidak hadir; tiada perubahan dihantar.",
                    "tidak-berubah");
                h.BilMurid = muridAwal.Count;
                h.BilDilangkau = sudahTidakHadir.Count;
                return h;
            }

            // ---- 4. Mark + fill category AND reason (both mandatory). ----
            foreach (var id in perluTanda)
            {
                ct.ThrowIfCancellationRequested();
                var m = dijangka[id];

                if (!await dom.TandaTidakHadir(id))
                {
                    return GagalIsi(tugasan, muridAwal.Count, id, "kotak kehadiran tidak dapat ditanda");
                }
                if (!await dom.TungguPemilihSebab(id))
                {
                    return GagalIsi(tugasan, muridAwal.Count, id, "pemilih kategori tidak muncul");
                }

                var padananKategori = PadananDropdown.Pilih(await dom.BacaPilihanKategori(id), m.Kategori);
                if (!padananKategori.Ok)
                {
                    return GagalIsi(tugasan, muridAwal.Count, id, SebabPadanan("kategori", m.Kategori, padananKategori));
                }
                if (!await dom.PilihKategori(id, padananKategori.Nilai))
                {
                    return GagalIsi(tugasan, muridAwal.Count, id, "kategori tidak dapat ditetapkan");
                }

                var padananSebab = PadananDropdown.Pilih(await dom.BacaPilihanSebab(id), m.Sebab);
                if (!padananSebab.Ok)
                {
                    return GagalIsi(tugasan, muridAwal.Count, id, SebabPadanan("sebab", m.Sebab, padananSebab));
                }
                if (!await dom.PilihSebab(id, padananSebab.Nilai))
                {
                    return GagalIsi(tugasan, muridAwal.Count, id, "sebab tidak dapat ditetapkan");
                }
            }

            // ---- 4b. Read the form back BEFORE the save button is touched. ----
            foreach (var id in perluTanda)
            {
                var pada = await dom.BacaSebabMurid(id);
                if (pada == null || string.IsNullOrEmpty(pada.KategoriNilai) || string.IsNullOrEmpty(pada.SebabNilai))
                {
                    return GagalIsi(tugasan, muridAwal.Count, id,
                        "kategori/sebab masih kosong selepas diisi; borang TIDAK disimpan");
                }
            }

            // ---- 5. Save (or save+confirm). ----
            await dom.TekanKemaskini();
            if (!await dom.DialogSimpanKelihatan())
            {
                var h = Buat(tugasan, "gagal-dialog",
                    "Dialog simpan tidak muncul selepas tekan kemaskini; tiada apa-apa disimpan.", "dialog-simpan-tiada");
                h.BilMurid = muridAwal.Count;
                h.BilPerubahan = 0;
                h.BilDilangkau = sudahTidakHadir.Count;
                return h;
            }

            var tindakan = tugasan.Sahkan ? "simpansah" : "simpan";
            var diklik = tugasan.Sahkan ? await dom.KlikSimpanSahkan() : await dom.KlikSimpan();
            if (!diklik)
            {
                var h = Buat(tugasan, "gagal-dialog",
                    $"Butang \"{tindakan}\" pada dialog simpan tidak dapat ditekan.", "butang-simpan-gagal");
                h.BilMurid = muridAwal.Count;
                h.BilDilangkau = sudahTidakHadir.Count;
                return h;
            }

            if (!await dom.DialogBerjayaKelihatan())
            {
                var h = Buat(tugasan, "gagal-dialog",
                    "Dialog simpan tidak menunjukkan \"Berjaya.\"; penghantaran tidak boleh dikira berjaya.", "dialog-berjaya-tiada");
                h.BilMurid = muridAwal.Count;
                h.BilPerubahan = perluTanda.Count;
                h.BilDilangkau = sudahTidakHadir.Count;
                h.TindakanSimpan = tindakan;
                return h;
            }

            // ---- 6. MANDATORY re-read. READ ONLY — never a second submit. ----
            var semak = await SahkanSelepasMuatSemulaAsync(dom, tugasan, kelas, paparanTarikh, dijangka, praTidakHadir, ct);
            if (semak.Gagal != null)
            {
                semak.Gagal.BilPerubahan = perluTanda.Count;
                semak.Gagal.BilDilangkau = sudahTidakHadir.Count;
                semak.Gagal.TindakanSimpan = tindakan;
                return semak.Gagal;
            }

            var hasil = Buat(tugasan,
                semak.Verifikasi.Semua ? "disahkan" : "tersimpan",
                semak.Verifikasi.Semua
                    ? "Pengesahan selepas muat semula berjaya."
                    : "Dialog simpan berjaya tetapi baca semula tidak mengesahkan setiap murid; tidak dikira berjaya.",
                semak.Verifikasi.Semua ? "disahkan" : "tersimpan");
            hasil.Berjaya = semak.Verifikasi.Semua;
            hasil.BilMurid = semak.BilMurid;
            hasil.BilPerubahan = perluTanda.Count;
            hasil.BilDilangkau = sudahTidakHadir.Count;
            hasil.TindakanSimpan = tindakan;
            hasil.Verifikasi = semak.Verifikasi;
            return hasil;
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ralat)
        {
            return Buat(tugasan, "gagal",
                "Ralat teknikal semasa penghantaran MOEIS: " + (ralat.Message.Length > 0 ? ralat.Message : ralat.GetType().Name),
                "ralat-teknikal");
        }
    }

    private static string SebabPadanan(string apa, string label, KeputusanPadanan k) => k.Sebab switch
    {
        "padanan-ambigu" => $"{apa} \"{label}\" padan dengan {k.BilanganCalon} pilihan MOEIS (ambigu) — BERHENTI, tidak meneka",
        "tiada-pilihan" => $"{apa} tidak dijumpai dalam senarai MOEIS: {label}",
        "nilai-kosong" => $"{apa} \"{label}\" padan dengan pilihan kosong MOEIS",
        _ => $"{apa} tidak dapat dipadankan: {label}",
    };

    private static HasilPenghantaran GagalIsi(TugasanPenghantaran t, int bilMurid, string id, string sebab)
    {
        // The form may be half-filled at this point, but NOTHING was saved: the
        // save button is only reached after every row is filled and read back.
        var h = Buat(t, "gagal-isi",
            $"Gagal mengisi murid (id {id}): {sebab}. Borang TIDAK disimpan.", "gagal-isi");
        h.BilMurid = bilMurid;
        return h;
    }

    private sealed class KeadaanHalaman
    {
        public HasilPenghantaran? Gagal;
        public IReadOnlyList<BarisMurid> Murid = Array.Empty<BarisMurid>();
        public bool TarikhSah;
    }

    /// <summary>
    /// Port of <c>bukaTabDanTetapkanTarikh</c> + <c>pilihKonteksDanStabil</c>:
    /// open the daily tab, set+verify the date, select year/class, read the list.
    /// Run from scratch on the first read AND again after the reload — no page
    /// state is assumed to survive a reload.
    /// </summary>
    private static async Task<KeadaanHalaman> SediakanHalamanAsync(
        IDomMoeis dom, TugasanPenghantaran tugasan, string kelas, string? paparanTarikh, CancellationToken ct)
    {
        var keadaan = new KeadaanHalaman();

        if (!await dom.KlikTabHarian())
        {
            keadaan.Gagal = Buat(tugasan, "halaman-tidak-sedia",
                "Tab Kehadiran Harian tidak dapat dibuka pada halaman MOEIS.", "tab-harian-gagal");
            return keadaan;
        }
        if (!await dom.TungguKemaskiniKelihatan())
        {
            keadaan.Gagal = Buat(tugasan, "halaman-tidak-sedia",
                "Borang kemas kini kehadiran tidak kelihatan selepas tab harian dibuka.", "borang-tidak-sedia");
            return keadaan;
        }
        ct.ThrowIfCancellationRequested();

        if (paparanTarikh != null)
        {
            var semasa = await dom.BacaTarikhInput();
            if (!string.Equals(semasa, paparanTarikh, StringComparison.Ordinal))
            {
                await dom.TetapkanTarikhInput(paparanTarikh);
            }
            var selepas = await dom.BacaTarikhInput();
            if (!string.Equals(selepas, paparanTarikh, StringComparison.Ordinal))
            {
                keadaan.Gagal = Buat(tugasan, "halaman-tidak-sedia",
                    $"Tarikh borang MOEIS tidak sepadan: dijangka {paparanTarikh}, dapat {selepas ?? "(tiada)"}.",
                    "tarikh-tidak-sepadan");
                return keadaan;
            }
            keadaan.TarikhSah = true;
        }
        else
        {
            // No date in the task: use the page's own date as-is. Nothing was
            // set, so nothing about the date can be claimed as verified.
            keadaan.TarikhSah = true;
        }

        if (!string.IsNullOrWhiteSpace(tugasan.Tahun))
        {
            var padananTahun = PadananDropdown.Pilih(await dom.BacaPilihanDropdown(SelektorTahun), tugasan.Tahun);
            if (!padananTahun.Ok)
            {
                keadaan.Gagal = Buat(tugasan, "kelas-tidak-dipilih",
                    SebabPadanan("tahun", tugasan.Tahun!, padananTahun) + ".", "tahun-tidak-dipilih");
                return keadaan;
            }
            if (!await dom.PilihNilaiDropdown(SelektorTahun, padananTahun.Nilai))
            {
                keadaan.Gagal = Buat(tugasan, "kelas-tidak-dipilih",
                    "Tahun tidak dapat ditetapkan pada halaman MOEIS.", "tahun-tidak-dipilih");
                return keadaan;
            }
        }

        var padananKelas = PadananDropdown.Pilih(await dom.BacaPilihanDropdown(SelektorKelas), kelas);
        if (!padananKelas.Ok)
        {
            keadaan.Gagal = Buat(tugasan, "kelas-tidak-dipilih",
                SebabPadanan("kelas", kelas, padananKelas) + ".", "kelas-tidak-dipilih");
            return keadaan;
        }
        if (!await dom.PilihNilaiDropdown(SelektorKelas, padananKelas.Nilai))
        {
            keadaan.Gagal = Buat(tugasan, "kelas-tidak-dipilih",
                "Kelas tidak dapat ditetapkan pada halaman MOEIS.", "kelas-tidak-dipilih");
            return keadaan;
        }

        var murid = await dom.BacaSenaraiMurid() ?? Array.Empty<BarisMurid>();
        if (murid.Count == 0)
        {
            keadaan.Gagal = Buat(tugasan, "halaman-tidak-sedia",
                "Senarai murid MOEIS kosong selepas kelas dipilih (halaman belum sedia).", "senarai-kosong");
            return keadaan;
        }
        keadaan.Murid = murid;
        return keadaan;
    }

    private sealed class KeadaanSemakan
    {
        public HasilPenghantaran? Gagal;
        public VerifikasiPenghantaran Verifikasi = new();
        public int? BilMurid;
    }

    /// <summary>
    /// Port of <c>sahkanSelepasMuatSemula</c>. Reload, rebuild the context from
    /// scratch, then PROVE the submission: every task student is absent, their
    /// category+reason read back as the task asked, and no student became absent
    /// that was not already absent before. Read-only — this never re-submits.
    /// </summary>
    private static async Task<KeadaanSemakan> SahkanSelepasMuatSemulaAsync(
        IDomMoeis dom,
        TugasanPenghantaran tugasan,
        string kelas,
        string? paparanTarikh,
        IReadOnlyDictionary<string, MuridTidakHadir> dijangka,
        HashSet<string> praTidakHadir,
        CancellationToken ct)
    {
        var hasil = new KeadaanSemakan();

        await dom.MuatSemula();
        ct.ThrowIfCancellationRequested();

        var sedia = await SediakanHalamanAsync(dom, tugasan, kelas, paparanTarikh, ct);
        if (sedia.Gagal != null)
        {
            // The save dialog said "Berjaya." but we could not re-read the page:
            // that is 'tersimpan', never 'disahkan'.
            sedia.Gagal.Status = "tersimpan";
            sedia.Gagal.Sebab = "Dialog simpan berjaya tetapi halaman tidak dapat dibaca semula: " + sedia.Gagal.Sebab;
            hasil.Gagal = sedia.Gagal;
            return hasil;
        }

        var murid = sedia.Murid;
        hasil.BilMurid = murid.Count;

        var tidakHadirSebenar = murid.Where(m => !m.Hadir).Select(m => m.Id).ToHashSet(StringComparer.Ordinal);
        var sepatutnya = new HashSet<string>(praTidakHadir, StringComparer.Ordinal);
        foreach (var id in dijangka.Keys) sepatutnya.Add(id);

        var semuaTugasanTidakHadir = dijangka.Keys.All(tidakHadirSebenar.Contains);
        var tiadaKetidakhadiranTambahan = tidakHadirSebenar.All(sepatutnya.Contains);
        var identitiPadan = semuaTugasanTidakHadir && tiadaKetidakhadiranTambahan;

        var kategoriSebabPadan = identitiPadan;
        if (identitiPadan)
        {
            foreach (var kv in dijangka)
            {
                var pada = await dom.BacaSebabMurid(kv.Key);
                if (pada == null)
                {
                    kategoriSebabPadan = false;
                    break;
                }
                var kategoriPadan = PadananDropdown.Padan(pada.KategoriNilai, pada.KategoriTeks, kv.Value.Kategori);
                var sebabPadan = PadananDropdown.Padan(pada.SebabNilai, pada.SebabTeks, kv.Value.Sebab);
                if (!kategoriPadan || !sebabPadan)
                {
                    kategoriSebabPadan = false;
                    break;
                }
            }
        }

        hasil.Verifikasi = new VerifikasiPenghantaran(
            Tarikh: sedia.TarikhSah,
            Kelas: true, // SediakanHalamanAsync already failed hard on a bad class
            Murid: identitiPadan,
            KategoriSebab: kategoriSebabPadan);
        return hasil;
    }
}

/// <summary>
/// The composed adapter: a <see cref="IDomMoeis"/> driven by the pure flow. The
/// production wiring passes <see cref="WebView2DomMoeis"/>; tests pass a stub.
/// </summary>
public sealed class PenghantaranMoeis : IPenghantaranMoeis
{
    private readonly IDomMoeis _dom;

    public PenghantaranMoeis(IDomMoeis dom)
    {
        _dom = dom ?? throw new ArgumentNullException(nameof(dom));
    }

    public Task<HasilPenghantaran> HantarAsync(TugasanPenghantaran tugasan, CancellationToken ct = default)
        => PenghantaranMoeisFlow.JalankanAsync(_dom, tugasan, ct);
}
