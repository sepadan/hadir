using System;
using System.Threading;
using System.Threading.Tasks;

namespace HadirDesktop;

/// <summary>
/// Snapshot of leadership state reported after each successful heartbeat.
/// <c>Pemimpin</c> is true when this device currently holds the account lease
/// (primary); false means standby. Never fabricated: it mirrors the backend's
/// <c>pcDegup</c> answer verbatim.
/// </summary>
public sealed record DegupKeadaan(bool Pemimpin, int Generasi);

/// <summary>
/// Opt-in, manual heartbeat loop for an APPROVED (enrolled) device. It never
/// starts itself — the caller must call <see cref="Start"/> explicitly and may
/// <see cref="Stop"/> at any time (tray hide does NOT start it; app exit does
/// NOT auto-resume it). Guarantees:
/// <list type="bullet">
/// <item>Idempotent <c>Start</c>/<c>Stop</c> — no duplicate concurrent loops.</item>
/// <item>Serialized requests — at most one in-flight degup at a time.</item>
/// <item>Cancel-on-dispose — <see cref="Dispose"/> cancels and stops cleanly.</item>
/// <item>Bounded exponential backoff on transient failure, reset on success.</item>
/// <item>Terminal stop on a revoked/disabled device (never retries a revoked
/// device in a loop).</item>
/// </list>
/// This phase does NOT activate any attendance writer — leadership here is
/// reported, not acted upon.
/// </summary>
public sealed class HeartbeatLoop : IDisposable
{
    private readonly Func<CancellationToken, Task<JawapanDegup>> _degup;
    private readonly TimeSpan _selang;
    private readonly TimeSpan _backoffMaks;
    private readonly Func<TimeSpan, CancellationToken, Task> _tunggu;

    private readonly object _kunci = new();
    private CancellationTokenSource? _cts;
    private Task? _gelung;
    private bool _berjalan;
    private int _generasi;

    /// <summary>Raised after each successful heartbeat with the latest leadership state.</summary>
    public event Action<DegupKeadaan>? KeadaanBerubah;

    /// <summary>Raised when the loop stops permanently because the backend revoked/disabled the device.</summary>
    public event Action<string>? TamatTerminal;

    public HeartbeatLoop(
        Func<CancellationToken, Task<JawapanDegup>> degup,
        TimeSpan? selang = null,
        TimeSpan? backoffMaks = null,
        Func<TimeSpan, CancellationToken, Task>? tunggu = null)
    {
        _degup = degup;
        _selang = selang ?? TimeSpan.FromSeconds(30);
        _backoffMaks = backoffMaks ?? TimeSpan.FromMinutes(5);
        _tunggu = tunggu ?? ((masa, ct) => Task.Delay(masa, ct));
    }

    public bool Berjalan
    {
        get
        {
            lock (_kunci)
            {
                return _berjalan;
            }
        }
    }

    /// <summary>Idempotent start. A second call while running is a no-op.</summary>
    public void Start()
    {
        lock (_kunci)
        {
            if (_berjalan) return;
            _berjalan = true;
            _generasi++;
            var gen = _generasi;
            _cts?.Dispose();
            _cts = new CancellationTokenSource();
            _gelung = JalankanGelungAsync(_cts.Token, gen);
        }
    }

    /// <summary>Idempotent stop. Cancels the current loop; a stopped loop can be restarted.</summary>
    public void Stop()
    {
        lock (_kunci)
        {
            _berjalan = false;
            _cts?.Cancel();
        }
    }

    public void Dispose()
    {
        lock (_kunci)
        {
            _berjalan = false;
            _cts?.Cancel();
            _cts?.Dispose();
            _cts = null;
        }
    }

    private async Task JalankanGelungAsync(CancellationToken ct, int gen)
    {
        try
        {
            var gagalBerturut = 0;
            while (!ct.IsCancellationRequested)
            {
                try
                {
                    var jawapan = await _degup(ct).ConfigureAwait(false);
                    gagalBerturut = 0;
                    KeadaanBerubah?.Invoke(new DegupKeadaan(jawapan.Pemimpin, jawapan.Generasi));
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (PerantiNyahaktifException)
                {
                    TamatTerminal?.Invoke("Peranti dinyahaktifkan oleh pentadbir.");
                    break;
                }
                catch (PerantiDilumpuhkanException)
                {
                    TamatTerminal?.Invoke("Ciri berbilang PC dilumpuhkan.");
                    break;
                }
                catch
                {
                    // Transient failure: back off, but never indefinitely and never overlap.
                    gagalBerturut++;
                }

                var tunggu = HitungTunggu(gagalBerturut);
                try
                {
                    await _tunggu(tunggu, ct).ConfigureAwait(false);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
            }
        }
        finally
        {
            lock (_kunci)
            {
                // Only clear the running flag if this loop is still the current
                // generation (a Stop -> Start can supersede it before it unwinds).
                if (_generasi == gen)
                {
                    _berjalan = false;
                }
            }
        }
    }

    /// <summary>Bounded exponential backoff: interval doubles per consecutive failure, capped.</summary>
    private TimeSpan HitungTunggu(int gagalBerturut)
    {
        if (gagalBerturut <= 0) return _selang;
        var shift = Math.Min(gagalBerturut - 1, 20);
        var ganda = _selang.Ticks << shift;
        return ganda > _backoffMaks.Ticks ? _backoffMaks : TimeSpan.FromTicks(ganda);
    }
}
