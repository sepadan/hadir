using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Heartbeat-loop lifecycle tests against a fake degup (no network). Cover the
/// guarantees the loop must uphold: serialization (no overlap), idempotent
/// start/stop, cancel-on-dispose, bounded exponential backoff with reset-on-
/// success, leader/standby reporting, and terminal stop on revoke/disable.
/// </summary>
public class HeartbeatLoopTests
{
    private static readonly Func<TimeSpan, CancellationToken, Task> TungguKekal =
        (_, ct) => Task.Delay(Timeout.InfiniteTimeSpan, ct);

    [Fact]
    public async Task SerializedRequests_NeverOverlap()
    {
        var dalam = 0;
        var puncak = 0;
        var panggilan = 0;
        var tcs = new TaskCompletionSource();

        Task<JawapanDegup> Degup(CancellationToken ct)
        {
            var kini = Interlocked.Increment(ref dalam);
            puncak = Math.Max(puncak, kini);
            Interlocked.Increment(ref panggilan);
            if (panggilan == 1)
            {
                // Hold the first degup open so a (buggy) second request would
                // overlap and push `puncak` to 2.
                return tcs.Task.ContinueWith(_ =>
                {
                    Interlocked.Decrement(ref dalam);
                    return new JawapanDegup { Ok = true, Pemimpin = true, Generasi = 1 };
                });
            }
            Interlocked.Decrement(ref dalam);
            return Task.FromResult(new JawapanDegup { Ok = true, Pemimpin = true, Generasi = 1 });
        }

        var gelung = new HeartbeatLoop(Degup, selang: TimeSpan.FromMilliseconds(5), tunggu: (_, _) => Task.CompletedTask);
        gelung.Start();
        while (Volatile.Read(ref panggilan) == 0) await Task.Delay(5);
        await Task.Delay(150);
        Assert.Equal(1, Volatile.Read(ref puncak));
        Assert.Equal(1, Volatile.Read(ref panggilan));
        tcs.TrySetResult();
        gelung.Dispose();
    }

    [Fact]
    public async Task Start_Idempotent_SingleLoop()
    {
        var panggilan = 0;
        var gelung = new HeartbeatLoop(
            ct =>
            {
                Interlocked.Increment(ref panggilan);
                return Task.FromResult(new JawapanDegup { Ok = true, Pemimpin = true, Generasi = 1 });
            },
            selang: TimeSpan.FromSeconds(1),
            tunggu: TungguKekal);

        gelung.Start();
        gelung.Start(); // must be a no-op
        while (Volatile.Read(ref panggilan) == 0) await Task.Delay(5);
        Assert.Equal(1, Volatile.Read(ref panggilan));
        gelung.Dispose();
    }

    [Fact]
    public async Task Stop_ThenRestart_StartsFreshLoop()
    {
        var panggilan = 0;
        var gelung = new HeartbeatLoop(
            ct =>
            {
                Interlocked.Increment(ref panggilan);
                return Task.FromResult(new JawapanDegup { Ok = true, Pemimpin = true, Generasi = 1 });
            },
            selang: TimeSpan.FromSeconds(1),
            tunggu: TungguKekal);

        gelung.Start();
        while (Volatile.Read(ref panggilan) == 0) await Task.Delay(5);
        gelung.Stop();
        var selepasHenti = Volatile.Read(ref panggilan);
        await Task.Delay(50);
        Assert.Equal(selepasHenti, Volatile.Read(ref panggilan)); // no growth after stop

        gelung.Start();
        while (Volatile.Read(ref panggilan) <= selepasHenti) await Task.Delay(5);
        Assert.True(gelung.Berjalan);
        gelung.Dispose();
    }

    [Fact]
    public async Task Backoff_Doubles_AndIsCapped()
    {
        var rakam = new List<TimeSpan>();
        Task<JawapanDegup> Degup(CancellationToken ct) => throw new InvalidOperationException("rangkaian");

        var gelung = new HeartbeatLoop(
            Degup,
            selang: TimeSpan.FromSeconds(1),
            backoffMaks: TimeSpan.FromSeconds(8),
            tunggu: (t, ct) => { lock (rakam) rakam.Add(t); return Task.Delay(TimeSpan.FromMilliseconds(2), ct); });

        gelung.Start();
        while (true)
        {
            lock (rakam) { if (rakam.Count >= 6) break; }
            await Task.Delay(5);
        }
        gelung.Dispose();

        var enam = rakam.Take(6).Select(t => t.TotalSeconds).ToArray();
        Assert.Equal(new[] { 1.0, 2.0, 4.0, 8.0, 8.0, 8.0 }, enam);
    }

    [Fact]
    public async Task Backoff_ResetsOnSuccess()
    {
        var rakam = new List<TimeSpan>();
        var panggilan = 0;

        // Deterministic: fail the FIRST 3 calls, then succeed. No shared mutable
        // bool read across threads (that made the previous version flaky — the
        // loop thread could observe a stale value and record a 4th failure).
        Task<JawapanDegup> Degup(CancellationToken ct)
        {
            var n = Interlocked.Increment(ref panggilan);
            if (n <= 3) throw new InvalidOperationException("rangkaian");
            return Task.FromResult(new JawapanDegup { Ok = true, Pemimpin = true, Generasi = 1 });
        }

        var gelung = new HeartbeatLoop(
            Degup,
            selang: TimeSpan.FromSeconds(1),
            backoffMaks: TimeSpan.FromSeconds(8),
            tunggu: (t, ct) => { lock (rakam) rakam.Add(t); return Task.Delay(TimeSpan.FromMilliseconds(2), ct); });

        gelung.Start();
        while (true)
        {
            lock (rakam) { if (rakam.Count >= 4) break; }
            await Task.Delay(5);
        }
        gelung.Dispose();

        // Failures recorded 1s, 2s, 4s (growing), then success resets to 1s.
        var empat = rakam.Take(4).Select(t => t.TotalSeconds).ToArray();
        Assert.Equal(new[] { 1.0, 2.0, 4.0, 1.0 }, empat);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Status_ReportsLeaderOrStandby(bool pemimpin)
    {
        var status = new List<DegupKeadaan>();
        var gelung = new HeartbeatLoop(
            ct => Task.FromResult(new JawapanDegup { Ok = true, Pemimpin = pemimpin, Generasi = 3 }),
            selang: TimeSpan.FromSeconds(1),
            tunggu: TungguKekal);
        gelung.KeadaanBerubah += s => { lock (status) status.Add(s); };

        gelung.Start();
        while (true) { lock (status) { if (status.Count >= 1) break; } await Task.Delay(5); }
        gelung.Dispose();

        Assert.Single(status);
        Assert.Equal(pemimpin, status[0].Pemimpin);
        Assert.Equal(3, status[0].Generasi);
    }

    [Fact]
    public async Task RevokedDevice_TerminatesLoop_NoRetry()
    {
        var panggilan = 0;
        string? sebab = null;
        var tcs = new TaskCompletionSource();

        Task<JawapanDegup> Degup(CancellationToken ct)
        {
            Interlocked.Increment(ref panggilan);
            throw new PerantiNyahaktifException("Peranti dinyahaktifkan.");
        }

        var gelung = new HeartbeatLoop(Degup, selang: TimeSpan.FromSeconds(1), tunggu: (_, _) => Task.CompletedTask);
        gelung.TamatTerminal += s => { sebab = s; tcs.TrySetResult(); };

        gelung.Start();
        await tcs.Task.WaitAsync(TimeSpan.FromSeconds(3));
        gelung.Dispose();

        Assert.NotNull(sebab);
        Assert.Equal(1, Volatile.Read(ref panggilan));
        Assert.False(gelung.Berjalan);
    }

    [Fact]
    public async Task DisabledFeature_TerminatesLoop_NoRetry()
    {
        var panggilan = 0;
        string? sebab = null;
        var tcs = new TaskCompletionSource();

        Task<JawapanDegup> Degup(CancellationToken ct)
        {
            Interlocked.Increment(ref panggilan);
            throw new PerantiDilumpuhkanException("Ciri berbilang PC dilumpuhkan.");
        }

        var gelung = new HeartbeatLoop(Degup, selang: TimeSpan.FromSeconds(1), tunggu: (_, _) => Task.CompletedTask);
        gelung.TamatTerminal += s => { sebab = s; tcs.TrySetResult(); };

        gelung.Start();
        await tcs.Task.WaitAsync(TimeSpan.FromSeconds(3));
        gelung.Dispose();

        Assert.NotNull(sebab);
        Assert.Equal(1, Volatile.Read(ref panggilan));
    }

    [Fact]
    public async Task Dispose_StopsLoop_NoFurtherCalls()
    {
        var panggilan = 0;
        var gelung = new HeartbeatLoop(
            ct =>
            {
                Interlocked.Increment(ref panggilan);
                return Task.FromResult(new JawapanDegup { Ok = true, Pemimpin = true, Generasi = 1 });
            },
            selang: TimeSpan.FromSeconds(1),
            tunggu: TungguKekal);

        gelung.Start();
        while (Volatile.Read(ref panggilan) == 0) await Task.Delay(5);
        gelung.Dispose();
        var selepasDispose = Volatile.Read(ref panggilan);
        await Task.Delay(50);
        Assert.Equal(selepasDispose, Volatile.Read(ref panggilan));
        Assert.False(gelung.Berjalan);
    }
}
