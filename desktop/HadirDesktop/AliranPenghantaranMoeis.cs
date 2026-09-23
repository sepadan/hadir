using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace HadirDesktop;

/// <summary>
/// Result of ONE submission pass. <see cref="Hasil"/> holds the adapter's own
/// structured outcome per attempted task (in the order the adapter was called),
/// so the caller can report exactly what happened without re-deriving it.
/// </summary>
public sealed record HasilHantarKerja(
    string Status,
    string Sebab,
    int BilDicuba,
    int BilDilangkau,
    IReadOnlyList<HasilPenghantaran> Hasil)
{
    /// <summary>True only when at least one task was attempted and every attempt was CONFIRMED.</summary>
    public bool Berjaya => Status == AliranPenghantaranMoeis.StatusDihantar;
}

/// <summary>
/// The submission pass: read HADIR's FULL task list from the engine, build one
/// <see cref="TugasanPenghantaran"/> per unfinished task dated TODAY, and hand
/// each to <see cref="IPenghantaranMoeis"/> in order.
///
/// Gates, in this exact order — nothing is submitted before all of them pass:
///
///   1. OWNER OPT-IN, default OFF. Off (or unreadable — a corrupt settings file
///      may never switch a submission on) = the engine is not even asked and the
///      adapter is never called.
///   2. READ-ONLY full-list probe. An answer that could not be established
///      (engine down, nonce refused, unreadable body) = NO submission: a broken
///      engine is never read as "nothing to send" and never as "here are the
///      students".
///   3. Per task: only unfinished statuses (menunggu/sedang_dihantar/tersimpan)
///      dated today are considered; a task that cannot be built into an honest
///      submission (no students, no id, no category/reason) is SKIPPED, never
///      guessed at and never sent as a blank.
///
/// KLAIM → HANTAR → SELESAI (when a backend client is supplied)
/// -----------------------------------------------------------
/// With an <see cref="IHadirBackendClient"/> the pass owns the whole task
/// lifecycle against the HADIR backend, the way <c>companion/src/giliran.mjs</c>
/// does — no Node engine in the middle:
///
///   a. CLAIM FIRST, ALWAYS. The claim is atomic on the backend (ScriptLock).
///      A refused claim (<c>null</c>) means another engine holds the task:
///      that task is SKIPPED, never submitted. There is no path that submits
///      without holding the claim.
///   b. Build the submission from the CLAIMED payload (the copy the backend
///      re-read under its lock), not from the earlier list snapshot. A task
///      that cannot be built is released again (<c>lepas</c>) so it is not left
///      stranded in <c>sedang_dihantar</c>.
///   c. Submit. Only a CONFIRMED result (post-save re-read proved every
///      student) is reported <c>berjaya</c>.
///   d. <c>tersimpan</c> (the save dialog succeeded but the re-read could not
///      confirm) is reported as <c>tersimpan</c> — NOT released. Releasing it
///      would invite an automatic re-submission of a write that may already be
///      on MOEIS. Same rule as giliran.mjs.
///   e. Every other failure releases the lease so the task returns to
///      <c>menunggu</c> for a later attempt.
///
/// The result report (<c>selesai</c>) is retried up to 3 times because it is an
/// IDEMPOTENT status update, while the MOEIS write it describes is not — the
/// exact reason giliran.mjs retries it (a real 2026-09-18 bug: a confirmed MOEIS
/// write was recorded as failed only because Apps Script answered the report
/// with a 404 HTML page). Claim and release are never retried.
///
/// The pass never throws at the caller (a faulted task in an async void caller
/// would take the app down): an adapter that throws is recorded as a failed
/// attempt. Cancellation is the ONE thing that propagates.
/// </summary>
public sealed class AliranPenghantaranMoeis
{
    public const string StatusDimatikan = "dimatikan";
    public const string StatusEnjinLuarTalian = "enjin-luar-talian";
    public const string StatusTiadaPenghantaran = "tiada-penghantaran";
    public const string StatusDihantar = "dihantar";
    public const string StatusGagal = "gagal";
    /// <summary>A claim cycle was requested but this PC has no stable owner id.</summary>
    public const string StatusTiadaPemilik = "tiada-pemilik";

    /// <summary>Report attempts, mirroring giliran.mjs <c>laporHasil</c>.</summary>
    private const int CubaanLapor = 3;

    private readonly IKerjaPenuhSource _sumber;
    private readonly IPenghantaranMoeis _penghantar;
    private readonly Func<bool> _dihidupkan;
    private readonly Func<DateTime> _jam;
    private readonly Action<string>? _log;
    private readonly bool _sahkan;
    private readonly IHadirBackendClient? _backend;
    private readonly Func<string> _pemilik;

    public AliranPenghantaranMoeis(
        IKerjaPenuhSource sumber,
        IPenghantaranMoeis penghantar,
        Func<bool>? dihidupkan = null,
        Func<DateTime>? jam = null,
        Action<string>? log = null,
        bool sahkan = false,
        IHadirBackendClient? backend = null,
        Func<string>? pemilik = null)
    {
        _sumber = sumber;
        _penghantar = penghantar;
        _dihidupkan = dihidupkan ?? (() => false);   // DEFAULT OFF
        _jam = jam ?? (() => DateTime.Now);
        _log = log;
        _sahkan = sahkan;
        _backend = backend;
        _pemilik = pemilik ?? (() => "");
    }

    public async Task<HasilHantarKerja> JalankanAsync(CancellationToken ct = default)
    {
        // 1. Owner opt-in. Default OFF, and unreadable counts as OFF.
        bool dihidupkan;
        try { dihidupkan = _dihidupkan(); }
        catch { dihidupkan = false; }

        if (!dihidupkan)
        {
            return new HasilHantarKerja(StatusDimatikan,
                "Penghantaran MOEIS automatik dimatikan (lalai) — enjin tidak ditanya, tiada penghantaran dibuat.",
                0, 0, Array.Empty<HasilPenghantaran>());
        }

        // 2. Read-only full-list probe. A throwing source (contract violation)
        //    is "not established", never "nothing to send".
        SenaraiKerjaPenuh senarai;
        try
        {
            senarai = await _sumber.SemakAsync(ct).ConfigureAwait(false);
        }
        catch (Exception ex) when (IsCancellation(ex, ct))
        {
            throw;
        }
        catch (Exception ex)
        {
            return new HasilHantarKerja(StatusEnjinLuarTalian,
                "Ralat tidak dijangka semasa membaca senarai penuh (" + ex.GetType().Name + "); tiada penghantaran dibuat.",
                0, 0, Array.Empty<HasilPenghantaran>());
        }

        if (senarai is null || !senarai.EnjinBolehDicapai)
        {
            var sebab = senarai is null
                ? "Senarai penuh tidak dapat dibaca; tiada penghantaran dibuat."
                : senarai.Sebab + " Tiada penghantaran dibuat.";
            return new HasilHantarKerja(StatusEnjinLuarTalian, sebab, 0, 0, Array.Empty<HasilPenghantaran>());
        }

        var hariIni = _jam().ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);

        // 2b. Owner id for the claim cycle. Resolved ONCE, before anything is
        //     claimed: without a stable owner id no claim may be made, and
        //     without a claim nothing may be submitted.
        var pemilik = "";
        if (_backend is not null)
        {
            try { pemilik = (_pemilik() ?? "").Trim(); }
            catch { pemilik = ""; }

            if (pemilik.Length == 0)
            {
                return new HasilHantarKerja(StatusTiadaPemilik,
                    "Tiada id pemilik stabil untuk klaim tugasan pada PC ini; tiada klaim dan tiada penghantaran dibuat.",
                    0, 0, Array.Empty<HasilPenghantaran>());
            }
        }

        var hasil = new List<HasilPenghantaran>();
        var dilangkau = 0;
        var sebabLangkau = new List<string>();

        foreach (var kerja in senarai.Senarai ?? Array.Empty<KerjaPenuh>())
        {
            if (kerja is null) continue;
            if (!kerja.BelumSiap) continue;               // selesai/berjaya/gagal: not ours to send
            if (!kerja.PadaTarikh(hariIni)) continue;     // today only (same rule as the demand probe)

            ct.ThrowIfCancellationRequested();

            // ---- KLAIM (atomic, on the backend, before ANY portal action). ----
            var sumberKerja = kerja;
            var memegangKlaim = false;
            if (_backend is not null)
            {
                TugasanDiklaim? klaim;
                try
                {
                    klaim = await _backend.KlaimAsync(kerja.Id, pemilik, ModKlaim.Biasa, ct).ConfigureAwait(false);
                }
                catch (Exception ex) when (IsCancellation(ex, ct))
                {
                    throw;
                }
                catch (Exception ex)
                {
                    // A failed claim is NOT a licence to submit, and we hold no
                    // lease to release. Skip the task; it stays claimable later.
                    dilangkau++;
                    sebabLangkau.Add("Klaim tugasan gagal (" + ex.GetType().Name + "); tiada penghantaran bagi tugasan ini.");
                    // Hanya id tugasan — tiada murid, tiada rahsia enjin.
                    _log?.Invoke("KLAIM_RALAT: id=" + kerja.Id + " ralat=" + ex.GetType().Name);
                    continue;
                }

                if (klaim is null)
                {
                    // Refused: another engine holds it, or the status forbids it.
                    dilangkau++;
                    sebabLangkau.Add("Klaim ditolak (tugasan dipegang enjin lain atau status tidak layak); tiada penghantaran bagi tugasan ini.");
                    _log?.Invoke("KLAIM_DITOLAK: id=" + kerja.Id);
                    continue;
                }

                memegangKlaim = true;
                _log?.Invoke("KLAIM_OK: id=" + kerja.Id);
                // Build from the payload the backend re-read UNDER ITS LOCK.
                sumberKerja = kerja with
                {
                    Kelas = string.IsNullOrWhiteSpace(klaim.Kelas) ? kerja.Kelas : klaim.Kelas,
                    TarikhIso = string.IsNullOrWhiteSpace(klaim.TarikhIso) ? kerja.TarikhIso : klaim.TarikhIso,
                    KelasMoeisId = string.IsNullOrWhiteSpace(klaim.KelasMoeisId) ? kerja.KelasMoeisId : klaim.KelasMoeisId,
                    Murid = klaim.Murid.Count > 0 ? klaim.Murid : kerja.Murid,
                };
            }

            var pembinaan = PembinaTugasanPenghantaran.DaripadaKerja(sumberKerja, _sahkan);
            if (!pembinaan.Boleh)
            {
                dilangkau++;
                sebabLangkau.Add(pembinaan.Sebab);
                // Never strand a claimed task in 'sedang_dihantar'.
                if (memegangKlaim) await LepasSenyapAsync(kerja.Id, pemilik, ct).ConfigureAwait(false);
                continue;
            }

            var tugasan = pembinaan.Tugasan!;
            var kelas = (tugasan.Kelas ?? "").Trim();
            // Only the class label is logged — never a student name or id.
            _log?.Invoke("PENGHANTARAN_MULA: kelas=" + kelas);

            HasilPenghantaran satu;
            try
            {
                satu = await _penghantar.HantarAsync(tugasan, ct).ConfigureAwait(false);
            }
            catch (Exception ex) when (IsCancellation(ex, ct))
            {
                throw;
            }
            catch (Exception ex)
            {
                satu = new HasilPenghantaran
                {
                    Status = "ralat-adaptor",
                    Berjaya = false,
                    Sebab = "Adaptor penghantaran melontar (" + ex.GetType().Name + "); keputusan tidak dapat dipastikan.",
                    Kelas = kelas,
                    TarikhIso = tugasan.TarikhIso,
                };
            }

            hasil.Add(satu);
            _log?.Invoke("PENGHANTARAN_TAMAT: kelas=" + kelas + " status=" + satu.Status);

            // ---- SELESAI / LEPAS. Only reached while holding the claim. ----
            if (memegangKlaim)
            {
                if (satu.Berjaya)
                {
                    // 'berjaya' requires the post-save re-read to have CONFIRMED
                    // every student (HasilPenghantaran.Berjaya == "disahkan").
                    // bilHadirSelepas is null: this adapter proves each student
                    // individually but never reads MOEIS's own present-count, and
                    // an invented number is worse than none ('' on the wire).
                    await LaporAsync(kerja.Id, "berjaya", satu.Sebab, pemilik, ct).ConfigureAwait(false);
                }
                else if (satu.Status == "tersimpan")
                {
                    // Saved but unverified: record it, do NOT release. Releasing
                    // would queue an automatic re-submission of a write that may
                    // already be on MOEIS (port of giliran.mjs).
                    await LaporAsync(kerja.Id, "tersimpan", satu.Sebab, pemilik, ct).ConfigureAwait(false);
                }
                else
                {
                    await LepasSenyapAsync(kerja.Id, pemilik, ct).ConfigureAwait(false);
                }
            }
        }

        if (hasil.Count == 0)
        {
            var sebab = dilangkau > 0
                ? dilangkau + " tugasan belum siap dilangkau (tiada penghantaran sah dibina): " + string.Join(" ", sebabLangkau)
                : "Tiada tugasan belum siap untuk " + hariIni + "; tiada penghantaran dibuat.";
            return new HasilHantarKerja(StatusTiadaPenghantaran, sebab, 0, dilangkau, hasil);
        }

        var berjayaSemua = true;
        foreach (var h in hasil) if (!h.Berjaya) { berjayaSemua = false; break; }

        var ringkasan = hasil.Count + " tugasan dihantar (" + hasil.Count + " dicuba, " + dilangkau + " dilangkau); " +
                        (berjayaSemua ? "semua disahkan." : "sekurang-kurangnya satu tidak disahkan — semak bukti.");

        return new HasilHantarKerja(
            berjayaSemua ? StatusDihantar : StatusGagal,
            ringkasan,
            hasil.Count,
            dilangkau,
            hasil);
    }

    /// <summary>
    /// Release the lease without recording a result, best effort (port of
    /// giliran.mjs <c>klien.lepas(...).catch(() =&gt; {})</c>). A failed release
    /// is not fatal: the backend lease expires on its own, and this PC holds the
    /// same owner id next time so it can re-claim immediately. Only the task id
    /// is logged — never a student, never the owner secret.
    /// </summary>
    private async Task LepasSenyapAsync(string id, string pemilik, CancellationToken ct)
    {
        if (_backend is null) return;
        try
        {
            await _backend.LepasAsync(id, pemilik, ct).ConfigureAwait(false);
        }
        catch (Exception ex) when (IsCancellation(ex, ct))
        {
            throw;
        }
        catch (Exception ex)
        {
            _log?.Invoke("LEPAS_GAGAL: id=" + id + " ralat=" + ex.GetType().Name);
        }
    }

    /// <summary>
    /// Record the outcome, retried up to <see cref="CubaanLapor"/> times. This
    /// is the ONE state-changing call that may be retried: it is an idempotent
    /// status update keyed by task id, unlike the MOEIS write it describes,
    /// which is never repeated. Port of giliran.mjs <c>laporHasil</c>.
    /// </summary>
    private async Task<bool> LaporAsync(string id, string keputusan, string mesej, string pemilik, CancellationToken ct)
    {
        if (_backend is null) return false;

        for (var cubaan = 1; cubaan <= CubaanLapor; cubaan++)
        {
            try
            {
                await _backend.SelesaiAsync(id, keputusan, mesej, null, pemilik, ct).ConfigureAwait(false);
                // Id + keputusan sahaja; mesej TIDAK dilog (ia datang dari adaptor).
                _log?.Invoke("SELESAI_OK: id=" + id + " keputusan=" + keputusan);
                return true;
            }
            catch (Exception ex) when (IsCancellation(ex, ct))
            {
                throw;
            }
            catch (Exception ex)
            {
                if (cubaan == CubaanLapor)
                {
                    // The MOEIS write itself is unaffected; only HADIR's record
                    // of it failed. Do NOT release — a release would invite a
                    // duplicate submission of a write that already happened.
                    _log?.Invoke("LAPOR_GAGAL: id=" + id + " keputusan=" + keputusan + " ralat=" + ex.GetType().Name);
                }
            }
        }

        return false;
    }

    private static bool IsCancellation(Exception ex, CancellationToken ct) =>
        (ex is OperationCanceledException || ex is TaskCanceledException) && ct.IsCancellationRequested;
}
