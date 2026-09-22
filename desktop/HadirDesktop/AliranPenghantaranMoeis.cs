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

    private readonly IKerjaPenuhSource _sumber;
    private readonly IPenghantaranMoeis _penghantar;
    private readonly Func<bool> _dihidupkan;
    private readonly Func<DateTime> _jam;
    private readonly Action<string>? _log;
    private readonly bool _sahkan;

    public AliranPenghantaranMoeis(
        IKerjaPenuhSource sumber,
        IPenghantaranMoeis penghantar,
        Func<bool>? dihidupkan = null,
        Func<DateTime>? jam = null,
        Action<string>? log = null,
        bool sahkan = false)
    {
        _sumber = sumber;
        _penghantar = penghantar;
        _dihidupkan = dihidupkan ?? (() => false);   // DEFAULT OFF
        _jam = jam ?? (() => DateTime.Now);
        _log = log;
        _sahkan = sahkan;
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

        var hasil = new List<HasilPenghantaran>();
        var dilangkau = 0;
        var sebabLangkau = new List<string>();

        foreach (var kerja in senarai.Senarai ?? Array.Empty<KerjaPenuh>())
        {
            if (kerja is null) continue;
            if (!kerja.BelumSiap) continue;               // selesai/berjaya/gagal: not ours to send
            if (!kerja.PadaTarikh(hariIni)) continue;     // today only (same rule as the demand probe)

            ct.ThrowIfCancellationRequested();

            var pembinaan = PembinaTugasanPenghantaran.DaripadaKerja(kerja, _sahkan);
            if (!pembinaan.Boleh)
            {
                dilangkau++;
                sebabLangkau.Add(pembinaan.Sebab);
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

    private static bool IsCancellation(Exception ex, CancellationToken ct) =>
        (ex is OperationCanceledException || ex is TaskCanceledException) && ct.IsCancellationRequested;
}
