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
    /// <param name="pagarSebelumSimpan">
    /// Pagar konfigurasi yang dibawa bersama tugasan dan disemak SEJURUS sebelum
    /// butang Simpan / Simpan &amp; Sahkan ditekan (lihat
    /// <see cref="TugasanPenghantaran.PagarSebelumSimpan"/>).
    /// </param>
    public static PembinaanTugasan DaripadaKerja(KerjaPenuh kerja, bool sahkan = false, Func<string?>? pagarSebelumSimpan = null)
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
            if (id.Length == 0 && nama.Length == 0)
            {
                // A student with neither a page id nor a name cannot be
                // identified on the MOEIS page — refuse rather than guess.
                return new(null,
                    "Tugasan " + kelas + ": murid tanpa id dan tanpa nama; tiada penghantaran.");
            }

            var kategori = (m.Kategori ?? "").Trim();
            var sebab = (m.Sebab ?? "").Trim();
            if (kategori.Length == 0 || sebab.Length == 0)
            {
                var label = id.Length > 0 ? id : nama;
                return new(null, "Tugasan " + kelas + ": murid " + label + " tiada kategori/sebab wajib MOEIS; tiada penghantaran.");
            }

            // A name-only student (the real HADIR record carries no page id) is
            // carried through; PenghantaranMoeisFlow resolves the page id by
            // normalised name against data-namapelajar, exactly like push.mjs.
            senarai.Add(new MuridTidakHadir(id, kategori, sebab) { Nama = nama });
        }

        return new(new TugasanPenghantaran
        {
            Kelas = kelas,
            // HADIR tiada medan tahun berasingan: ia diterbitkan daripada nama
            // kelas oleh KelasTahunMoeis di dalam aliran penghantaran.
            Tahun = null,
            TarikhIso = tarikh.Length == 0 ? null : tarikh,
            TidakHadir = senarai,
            Sahkan = sahkan,
            PagarSebelumSimpan = pagarSebelumSimpan,
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

    /// <summary>
    /// Optional year/"tahun" label. When null the flow DERIVES it from
    /// <see cref="Kelas"/> (<see cref="KelasTahunMoeis"/>): "1 BIJAK" → year
    /// "TAHUN SATU" + class "BIJAK". A label given here wins and is used as-is.
    /// </summary>
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

    /// <summary>
    /// Pagar gagal-tertutup yang disemak SEJURUS sebelum butang Simpan /
    /// Simpan &amp; Sahkan ditekan — selepas borang disediakan, iaitu tempoh
    /// panjang yang konfigurasi boleh bertukar. <c>null</c> daripada pagar =
    /// dibenarkan; teks = sebab penolakan; pagar yang melontar juga menolak.
    /// Tiada pagar (<c>null</c>) = tiada semakan tambahan (ujian/penggunaan lama).
    /// Klik yang SUDAH berlaku tidak boleh ditarik balik.
    /// </summary>
    public Func<string?>? PagarSebelumSimpan { get; init; }
}

/// <summary>What the mandatory post-save re-read could actually prove.</summary>
public sealed record VerifikasiPenghantaran(
    bool Tarikh = false,
    bool Kelas = false,
    bool Murid = false,
    bool KategoriSebab = false,
    // Bendera pengesahan PELAYAN. Dua keadaan sahaja membenarkan `true`:
    // (a) tugasan tidak pernah meminta pengesahan (`Sahkan == false`) — tiada
    // apa-apa untuk dibuktikan; atau (b) `#statusBadge` dibaca SELEPAS muat
    // semula dan berbunyi "TELAH DISAHKAN". Data yang padan TIDAK mencukupi:
    // menekan "Simpan & Sahkan" boleh menyimpan baris dengan sempurna sambil
    // pelayan menolak pengesahan — persis keadaan yang dilaporkan pengguna
    // 23 Sep ("sudah terisi tetapi tak disahkan").
    bool PengesahanPelayan = true)
{
    public bool Semua => Tarikh && Kelas && Murid && KategoriSebab && PengesahanPelayan;
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

/// <summary>
/// A student row on the MOEIS page: <c>data-idpelajar</c>, the student's
/// <c>data-namapelajar</c> (the join key HADIR's name-only records are matched
/// on), and whether the box is ticked (present).
/// </summary>
public sealed record BarisMurid(string Id, string Nama, bool Hadir);

/// <summary>
/// Student-name normalisation — a faithful port of <c>normNama</c> in
/// <c>companion/src/moeis/push.mjs</c>:
///
///   String(s||'').toUpperCase().replace(/[^A-Z ]/g,' ').replace(/\s+/g,' ').trim()
///
/// i.e. uppercase, then every character that is NOT A-Z or a space becomes a
/// space (digits, punctuation AND accented letters), runs of spaces collapse to
/// one, and the edges are trimmed. This is deliberately DIFFERENT from
/// <see cref="PadananDropdown.Norm"/> (which keeps digits and drops spaces): a
/// name is matched on its letters, and an accent is NOT bridged to its ASCII
/// base — "ÉLIANA" and "ELIANA" do not match, so a difference fails honestly
/// instead of guessing.
/// </summary>
public static class PadananNama
{
    public static string Norm(string? s)
    {
        if (string.IsNullOrEmpty(s)) return "";
        var sb = new StringBuilder(s.Length);
        foreach (var c in s.ToUpperInvariant())
        {
            sb.Append((c >= 'A' && c <= 'Z') || c == ' ' ? c : ' ');
        }
        // Collapse runs of the space character (the pass above already turned
        // every other whitespace, digit, punctuation and accent into ' ') and
        // trim the edges.
        var collapsed = new StringBuilder(sb.Length);
        var dalamRuang = false;
        for (var i = 0; i < sb.Length; i++)
        {
            var c = sb[i];
            if (c == ' ')
            {
                if (!dalamRuang) { collapsed.Append(' '); dalamRuang = true; }
            }
            else
            {
                collapsed.Append(c);
                dalamRuang = false;
            }
        }
        return collapsed.ToString().Trim();
    }
}

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
    /// <returns>
    /// Klasifikasi NAVIGASI itu sendiri (sama bentuk dengan <c>MuatSemula</c>).
    /// Kaedah seam tidak melontar — keputusan gagal/tamat masa dibawa balik
    /// supaya aliran boleh menilainya SEBELUM membaca DOM.
    /// </returns>
    Task<HasilMuat> NavigasiHarian();
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

    /// <summary>
    /// <c>#statusBadge</c> pada halaman harian MOEIS = "TELAH DISAHKAN".
    /// Badge ini mencerminkan bendera pelayan (<c>rekodSahHadirBulanan</c>),
    /// bukan kosmetik: "MENUNGGU PENGESAHAN" bermaksud data wujud tetapi
    /// tiada siapa menekan "Simpan & Sahkan".
    /// </summary>
    Task<bool> StatusBadgeDisahkan();
    Task<bool> DialogBerjayaKelihatan();
    /// <summary>
    /// Reload halaman selepas simpan dan TUNGGU <c>NavigationCompleted</c>
    /// sebenar (bersempadan dengan had masa). Pulangan mengklasifikasikan
    /// hasilnya: <see cref="HasilMuat.Selesai"/> sahaja bermakna dokumen
    /// baharu sudah commit dan DOM boleh dibaca semula; <c>Gagal</c> dan
    /// <c>TamatMasa</c> bermakna halaman TIDAK DAPAT dibaca semula — ia bukan
    /// kejayaan dan tidak pernah dilabel sebegitu. Tiada tulisan, tiada
    /// ulangan hantar.
    /// </summary>
    Task<HasilMuat> MuatSemula();
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
///      <c>Berjaya</c>; when the task asked to CONFIRM, that re-read must also
///      find <c>#statusBadge</c> = "TELAH DISAHKAN" — correct rows prove the
///      data, not the server's confirmation flag.
/// </summary>
public static class PenghantaranMoeisFlow
{
    /// <summary>Pagar konfigurasi menolak sejurus sebelum klik simpan; tiada tulisan portal.</summary>
    public const string StatusDisekatPagar = "disekat-pagar";

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

    /// <summary>Same key the duplicate check groups on: page id when carried, else normalised name.</summary>
    private static string KunciMurid(MuridTidakHadir m) =>
        !string.IsNullOrWhiteSpace(m.Id) ? m.Id.Trim() : PadananNama.Norm(m.Nama);

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

        // Every task student must be identifiable (a page id OR a name) and carry
        // the mandatory category+reason. A name-only student is the normal HADIR
        // shape — the page id is resolved later against data-namapelajar.
        var kekurangan = senarai
            .Where(m => m == null ||
                (string.IsNullOrWhiteSpace(m.Id) && string.IsNullOrWhiteSpace(m.Nama)) ||
                string.IsNullOrWhiteSpace(m.Kategori) || string.IsNullOrWhiteSpace(m.Sebab))
            .Count();
        if (kekurangan > 0)
        {
            return Buat(tugasan, "kategori-sebab-tiada",
                $"{kekurangan} murid dalam tugasan tiada id/nama/kategori/sebab; MOEIS mewajibkan kategori dan sebab bagi setiap murid tidak hadir.",
                "kategori-sebab-tiada");
        }

        // Duplicates: by page id when one is carried, else by normalised name.
        var pendua = senarai.GroupBy(KunciMurid, StringComparer.Ordinal).Where(g => g.Count() > 1).Select(g => g.Key).ToList();
        if (pendua.Count > 0)
        {
            // Two entries for one student may disagree on category/reason. Stop
            // honestly instead of picking one — a duplicate is never submitted.
            return Buat(tugasan, "pendua-id",
                $"{pendua.Count} murid berulang dalam tugasan; pendua tidak dihantar.", "pendua-id");
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

        try
        {
            // ---- 2. Open the page and put it in the task's context. ----
            // Navigasi gagal/tamat masa = halaman TIDAK diketahui → berhenti
            // SEKARANG dengan status jujur (BUKAN terus membaca — itu punca
            // "tidak-berubah" palsu 16:01/16:10: bacaan mendarat pada DOM lama).
            var nav = await dom.NavigasiHarian();
            ct.ThrowIfCancellationRequested();
            if (nav != HasilMuat.Selesai)
            {
                var sebabNav = nav == HasilMuat.TamatMasa
                    ? "Navigasi ke halaman kehadiran MOEIS tamat masa."
                    : "Navigasi ke halaman kehadiran MOEIS gagal.";
                return Buat(tugasan, "halaman-tidak-sedia",
                    sebabNav + " Halaman tidak dibaca, tiada apa-apa disimpan.",
                    nav == HasilMuat.TamatMasa ? "navigasi-tamat-masa" : "navigasi-gagal");
            }

            var sedia = await SediakanHalamanAsync(dom, tugasan, kelas, paparanTarikh, ct);
            if (sedia.Gagal != null) return sedia.Gagal;

            var muridAwal = sedia.Murid;
            var indeks = muridAwal.ToDictionary(m => m.Id, m => m, StringComparer.Ordinal);

            // Name index (data-namapelajar) for HADIR's name-only records. A
            // normalised name that maps to MORE than one page row is ambiguous —
            // refuse rather than silently pick one (the companion's Map silently
            // keeps the last, which we treat as a bug worth failing on).
            var indeksNama = new Dictionary<string, List<BarisMurid>>(StringComparer.Ordinal);
            foreach (var b in muridAwal)
            {
                var k = PadananNama.Norm(b.Nama);
                if (k.Length == 0) continue;
                if (!indeksNama.TryGetValue(k, out var l)) indeksNama[k] = l = new List<BarisMurid>();
                l.Add(b);
            }

            // Resolve every task student to a page id: by id when one is carried,
            // else by normalised name (port of push.mjs petaDijangka/idx).
            var dijangka = new Dictionary<string, MuridTidakHadir>(StringComparer.Ordinal);
            foreach (var m in senarai)
            {
                string id;
                if (!string.IsNullOrWhiteSpace(m.Id))
                {
                    id = m.Id.Trim();
                    if (!indeks.ContainsKey(id))
                    {
                        var h = Buat(tugasan, "id-tidak-dijumpai",
                            $"id murid {id} dalam tugasan tidak wujud pada senarai MOEIS kelas ini; tiada apa-apa disimpan.",
                            "id-tidak-dijumpai");
                        h.BilMurid = muridAwal.Count;
                        return h;
                    }
                }
                else
                {
                    var k = PadananNama.Norm(m.Nama);
                    if (!indeksNama.TryGetValue(k, out var calon) || calon.Count == 0)
                    {
                        var h = Buat(tugasan, "nama-tidak-padan",
                            $"Nama tidak padan dengan MOEIS: {m.Nama.Trim()}; tiada apa-apa disimpan.",
                            "nama-tidak-padan");
                        h.BilMurid = muridAwal.Count;
                        return h;
                    }
                    if (calon.Count > 1)
                    {
                        var h = Buat(tugasan, "nama-ambigu",
                            $"Nama \"{m.Nama.Trim()}\" padan dengan {calon.Count} murid MOEIS (ambigu) — BERHENTI, tidak meneka.",
                            "nama-ambigu");
                        h.BilMurid = muridAwal.Count;
                        return h;
                    }
                    id = calon[0].Id;
                }
                dijangka[id] = m;
            }

            // ---- Conflict: MOEIS already shows a student absent who is NOT in
            // the task. That is an absence the task does not assert — stop,
            // never send, never restore. (Port of push.mjs konflikList; the
            // desktop has no --paksa, so this is always a hard stop.) ----
            var idTidakHadir = new HashSet<string>(dijangka.Keys, StringComparer.Ordinal);
            var konflik = muridAwal.Where(b => !b.Hadir && !idTidakHadir.Contains(b.Id)).ToList();
            if (konflik.Count > 0)
            {
                var h = Buat(tugasan, "konflik",
                    $"MOEIS sudah menanda {konflik.Count} murid tidak hadir yang tiada dalam HADIR; tiada apa-apa disimpan.",
                    "konflik");
                h.BilMurid = muridAwal.Count;
                return h;
            }

            // ---- 3. Only students MOEIS still shows as PRESENT get marked. ----
            var perluTanda = dijangka.Keys.Where(id => indeks[id].Hadir).ToList();
            var sudahTidakHadir = dijangka.Keys.Where(id => !indeks[id].Hadir).ToList();
            // After the conflict gate, every student MOEIS already had absent IS
            // in the task, so they are expected to stay absent through the
            // re-read; we never restore anyone to present.
            var praTidakHadir = muridAwal.Where(m => !m.Hadir).Select(m => m.Id).ToHashSet(StringComparer.Ordinal);

            // Verify all pre-existing absences before a no-op success or any save.
            if (sudahTidakHadir.Count > 0 &&
                !await SemakKategoriSebabSediaAdaAsync(dom, dijangka, sudahTidakHadir))
            {
                var h = Buat(tugasan, "kategori-sebab-tidak-padan",
                    "Kategori/sebab sedia ada tidak dapat disahkan bagi sekurang-kurangnya seorang murid. " +
                    "Tiada apa-apa disimpan dan tiada pengesahan dihantar.",
                    "kategori-sebab-tidak-padan");
                h.BilMurid = muridAwal.Count;
                h.BilDilangkau = sudahTidakHadir.Count;
                return h;
            }

            // Sahkan-saun (1.0.8): data tiada perubahan TETAPI rekod MOEIS
            // belum disahkan — badge "MENUNGGU PENGESAHAN", iaitu keadaan
            // selepas seseorang menekan "Simpan" tanpa "Sahkan" (persis laporan
            // pengguna 23 Sep: "sudah terisi tetapi tak disahkan"). Bila tugasan
            // meminta pengesahan JANGAN potong di sini: jatuh ke langkah 5
            // (kemaskini -> dialog -> "Simpan & Sahkan"). Langkah 4 ialah gelung
            // atas senarai KOSONG, jadi ALIRAN INI tidak mengubah satu pun
            // nilai borang — tetapi jangan silap: langkah 5 tetap menghantar
            // SELURUH borang sedia ada, jadi semakan di atas dahulu membuktikan
            // borang itu memang sepadan dengan tugasan sebelum ia dikunci.
            var perluSahkan = tugasan.Sahkan && !(await dom.StatusBadgeDisahkan());
            if (perluTanda.Count == 0 && !perluSahkan)
            {
                // Nothing to change → nothing is saved. Not a failure, but not a
                // submission either: never press save just to press it. The reload
                // result is deliberately ignored; success rests on the fresh
                // category/reason check above, not on this reload.
                _ = await dom.MuatSemula();
                var h = Buat(tugasan, "tidak-berubah",
                    "MOEIS sudah menanda setiap murid dalam tugasan sebagai tidak hadir; tiada perubahan dihantar.",
                    "tidak-berubah");
                // Keadaan YANG DIINGINI SAH telah disahkan: kategori/sebab
                // sedia ada telah dibaca dan dipadankan; perluTanda dikira
                // daripada jadual portal HIDUP (langkah 3) selepas pagar
                // konflik — jadi setiap murid yang dijangkakan memang tidak
                // hadir di MOEIS. Inilah pengesahan, bukan kegagalan. Tanpa
                // ini Berjaya kekal false dan laluan pelaporan jatuh ke
                // LepasSenyapAsync — tugasan dibebaskan tanpa rekod dan
                // diulang setiap kitaran selamanya (diperhatikan 2 BIJAK,
                // 14:07/14:15/14:21).
                h.Berjaya = true;
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

            // Pagar konfigurasi TERAKHIR, sejurus sebelum tulisan sebenar. Borang
            // mungkin mengambil masa lama untuk disediakan; konfigurasi yang
            // ditarik/bertukar dalam tempoh itu bermakna TIADA klik simpan.
            if (tugasan.PagarSebelumSimpan is not null)
            {
                string? tolak;
                try { tolak = tugasan.PagarSebelumSimpan(); }
                catch (Exception ex) { tolak = "Pagar konfigurasi gagal (" + ex.GetType().Name + ")."; }
                if (tolak is not null)
                {
                    var h = Buat(tugasan, StatusDisekatPagar,
                        tolak + " Butang \"" + tindakan + "\" TIDAK ditekan; tiada tulisan portal.", "disekat-pagar");
                    h.BilMurid = muridAwal.Count;
                    h.BilPerubahan = 0;
                    h.BilDilangkau = sudahTidakHadir.Count;
                    return h;
                }
            }

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

            // Dua sebab berbeza untuk TIDAK mendapat 'disahkan', dan operator
            // perlu membezakannya: data tidak dapat dibuktikan, ATAU data
            // terbukti betul tetapi bendera pengesahan pelayan tidak bertukar.
            var sebabTidakSah = !semak.Verifikasi.PengesahanPelayan
                ? "Dialog simpan berjaya dan data padan, tetapi #statusBadge MOEIS masih bukan \"TELAH DISAHKAN\" "
                  + "selepas muat semula; pengesahan pelayan TIDAK terbukti."
                : "Dialog simpan berjaya tetapi baca semula tidak mengesahkan setiap murid; tidak dikira berjaya.";
            var buktiTidakSah = !semak.Verifikasi.PengesahanPelayan ? "pengesahan-pelayan-tiada" : "tersimpan";

            var hasil = Buat(tugasan,
                semak.Verifikasi.Semua ? "disahkan" : "tersimpan",
                semak.Verifikasi.Semua
                    ? "Pengesahan selepas muat semula berjaya."
                    : sebabTidakSah,
                semak.Verifikasi.Semua ? "disahkan" : buktiTidakSah);
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

    /// <summary>
    /// Read-only verification of every pre-existing absence. Missing, unreadable,
    /// or mismatching category/reason fails closed without exposing row values.
    /// </summary>
    private static async Task<bool> SemakKategoriSebabSediaAdaAsync(
        IDomMoeis dom, IReadOnlyDictionary<string, MuridTidakHadir> dijangka, IEnumerable<string> id)
    {
        foreach (var i in id)
        {
            if (!dijangka.TryGetValue(i, out var m)) return false;
            try
            {
                var pada = await dom.BacaSebabMurid(i);
                if (pada == null ||
                    !PadananDropdown.Padan(pada.KategoriNilai, pada.KategoriTeks, m.Kategori) ||
                    !PadananDropdown.Padan(pada.SebabNilai, pada.SebabTeks, m.Sebab))
                    return false;
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch
            {
                return false;
            }
        }
        return true;
    }
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

        // MOEIS memisahkan tahun dan kelas kepada DUA dropdown, tetapi HADIR
        // menyimpan satu label ("1 BIJAK"). Terbitkan pasangan itu di sini —
        // fungsi TULEN, jadi laluan pertama dan baca semula sentiasa sepakat.
        // Tugasan yang sudah membawa Tahun sendiri tidak disentuh.
        var tahunDipakai = (tugasan.Tahun ?? "").Trim();
        var kelasDipakai = kelas;
        if (tahunDipakai.Length == 0)
        {
            var terbitan = KelasTahunMoeis.Terbitkan(kelas);
            if (!terbitan.Ok)
            {
                keadaan.Gagal = Buat(tugasan, "kelas-tidak-dipilih", terbitan.Sebab, "tahun-tidak-diterbit");
                return keadaan;
            }
            tahunDipakai = terbitan.Tahun;
            kelasDipakai = terbitan.Kelas;
        }

        if (tahunDipakai.Length > 0)
        {
            var padananTahun = PadananDropdown.Pilih(await dom.BacaPilihanDropdown(SelektorTahun), tahunDipakai);
            if (!padananTahun.Ok)
            {
                keadaan.Gagal = Buat(tugasan, "kelas-tidak-dipilih",
                    SebabPadanan("tahun", tahunDipakai, padananTahun) + ".", "tahun-tidak-dipilih");
                return keadaan;
            }
            if (!await dom.PilihNilaiDropdown(SelektorTahun, padananTahun.Nilai))
            {
                keadaan.Gagal = Buat(tugasan, "kelas-tidak-dipilih",
                    "Tahun tidak dapat ditetapkan pada halaman MOEIS.", "tahun-tidak-dipilih");
                return keadaan;
            }
        }

        var padananKelas = PadananDropdown.Pilih(await dom.BacaPilihanDropdown(SelektorKelas), kelasDipakai);
        if (!padananKelas.Ok)
        {
            keadaan.Gagal = Buat(tugasan, "kelas-tidak-dipilih",
                SebabPadanan("kelas", kelasDipakai, padananKelas) + ".", "kelas-tidak-dipilih");
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
    ///
    /// <para>
    /// The reload itself must FIRST be classified. If the page could not be
    /// loaded again — navigation failed, or no <c>NavigationCompleted</c>
    /// within the deadline — the DOM may still hold the pre-save document
    /// (the exact 23 Sep 2026 "1 BIJAK" false positive), so nothing is read
    /// and the result is <c>tersimpan</c>, never <c>disahkan</c>.
    /// </para>
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

        var muat = await dom.MuatSemula();
        ct.ThrowIfCancellationRequested();
        if (muat != HasilMuat.Selesai)
        {
            // Classifiable surface, not a silent success: the page was NOT read
            // back, so the claim stops at "saved". BilMurid stays null — no
            // student count was ever verified.
            var sebab = muat == HasilMuat.TamatMasa
                ? "navigasi tamat masa (tiada NavigationCompleted dalam had masa)"
                : "navigasi gagal";
            hasil.Gagal = Buat(tugasan, "tersimpan",
                "Dialog simpan berjaya tetapi halaman tidak dapat dimuat semula untuk dibaca semula ("
                    + sebab + "); pengesahan TIDAK dipastikan.",
                muat == HasilMuat.TamatMasa ? "muat-semula-tamat-masa" : "muat-semula-gagal");
            return hasil;
        }

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

        // Bendera PELAYAN, dibaca daripada dokumen yang baru dimuat semula.
        // Baris yang betul membuktikan data sahaja; ia TIDAK membuktikan MOEIS
        // menerima pengesahan. Hanya tugasan yang meminta pengesahan membaca
        // badge — `Sahkan == false` tidak menyentuh DOM ini langsung.
        var pengesahanPelayan = true;
        if (tugasan.Sahkan)
        {
            pengesahanPelayan = await dom.StatusBadgeDisahkan();
        }

        hasil.Verifikasi = new VerifikasiPenghantaran(
            Tarikh: sedia.TarikhSah,
            Kelas: true, // SediakanHalamanAsync already failed hard on a bad class
            Murid: identitiPadan,
            KategoriSebab: kategoriSebabPadan,
            PengesahanPelayan: pengesahanPelayan);
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
