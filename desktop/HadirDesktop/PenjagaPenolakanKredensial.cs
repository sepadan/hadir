using System;
using System.IO;
using System.Text;
using System.Text.Json;

namespace HadirDesktop;

/// <summary>
/// Consecutive CREDENTIAL-REJECTION guard — the ONE and only auto-retry stop.
///
/// Owner policy (final): the password is never wrong on its own; if login
/// fails and it is NOT an explicit "wrong password / wrong IC" rejection, it is
/// a server/network/transient problem and must be retried indefinitely. Only an
/// EXPLICIT rejection message from the idMe page may advance this counter, and
/// only this counter may pause automatic retries (owner-configurable, 0 = never
/// stop, default 5), with a one-click "Cuba lagi" that clears it immediately.
///
/// SECURITY POSTURE:
///   * There is NO hourly window and NO daily ceiling — those were removed so a
///     genuinely needed login is never blocked by earlier probes/checks.
///   * Pre-flight/session checks NEVER touch this counter; only an actual
///     credential submission that is EXPLICITLY rejected does.
///   * Detection is UNVERIFIED against live idMe, so a miss falls through to
///     RETRY (never a permanent stop) and a false hit is recoverable via
///     <see cref="CubaLagi"/>.
/// </summary>
public sealed class PenjagaPenolakanKredensial
{
    public const int LALAI_MAKS_PENOLAKAN = 5;

    /// <summary>Persisted state: ONLY the consecutive-rejection counter (no credentials).</summary>
    public sealed class Keadaan
    {
        public int PenolakanBerturut { get; set; }
    }

    public sealed record RingkasanPenolakan(int PenolakanBerturut, int MaksPenolakan, bool Diblok, string? Sebab);

    private readonly Func<Keadaan?> _baca;
    private readonly Action<Keadaan> _tulis;
    private readonly Func<int> _maksPenolakan;

    public PenjagaPenolakanKredensial(
        Func<Keadaan?> baca,
        Action<Keadaan> tulis,
        Func<int>? maksPenolakan = null)
    {
        _baca = baca;
        _tulis = tulis;
        _maksPenolakan = maksPenolakan ?? (() => LALAI_MAKS_PENOLAKAN);
    }

    private int Maks() => Math.Max(0, _maksPenolakan());

    // Fail-open: a corrupt/unreadable counter is treated as ZERO (never blocks a
    // needed login); the next write heals the file. A detection miss is far less
    // harmful than blocking a genuinely needed login — that is the whole point.
    private Keadaan BacaSelamat()
    {
        Keadaan? k;
        try { k = _baca(); } catch { k = null; }
        return new Keadaan { PenolakanBerturut = Math.Max(0, k?.PenolakanBerturut ?? 0) };
    }

    /// <summary>True only when the counter has reached a non-zero owner threshold.</summary>
    public bool Diblok()
    {
        var maks = Maks();
        return maks > 0 && BacaSelamat().PenolakanBerturut >= maks;
    }

    /// <summary>An EXPLICIT credential rejection: increment (and cap).</summary>
    public void CatatPenolakan()
    {
        var maks = Maks();
        var n = BacaSelamat().PenolakanBerturut;
        var baru = maks > 0 ? Math.Min(n + 1, maks) : n + 1;
        _tulis(new Keadaan { PenolakanBerturut = baru });
    }

    /// <summary>A successful login (or any non-rejection): reset to zero.</summary>
    public void CatatKejayaan() => _tulis(new Keadaan { PenolakanBerturut = 0 });

    /// <summary>One-click "Cuba lagi": clear the counter immediately, no manual login needed.</summary>
    public void CubaLagi() => _tulis(new Keadaan { PenolakanBerturut = 0 });

    public int BilPenolakan() => BacaSelamat().PenolakanBerturut;

    public RingkasanPenolakan StatusRingkas()
    {
        var maks = Maks();
        var n = BacaSelamat().PenolakanBerturut;
        var diblok = maks > 0 && n >= maks;
        return new RingkasanPenolakan(
            n, maks, diblok,
            diblok
                ? $"Kata laluan ditolak {n} kali berturut-turut; cubaan automatik dihentikan. Tekan \"Cuba lagi\" untuk kosongkan."
                : null);
    }
}

/// <summary>
/// JSON persistence for the rejection guard state. Plain JSON is safe — only a
/// counter, no credential. Stored under
/// <c>LocalApplicationData/HadirDesktop/penolakan-kredensial.json</c>. Missing
/// file reads as null (zero); corrupt JSON THROWS so the guard fails OPEN to
/// zero rather than inventing a block.
/// </summary>
public sealed class PenolakanKredensialStateStore
{
    private readonly string _laluan;

    public PenolakanKredensialStateStore() : this(LaluanLalai())
    {
    }

    public PenolakanKredensialStateStore(string laluan)
    {
        _laluan = laluan;
    }

    private static string LaluanLalai() => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "HadirDesktop", "penolakan-kredensial.json");

    public PenjagaPenolakanKredensial.Keadaan? Baca()
    {
        if (!File.Exists(_laluan)) return null;
        // Corrupt => throw; PenjagaPenolakanKredensial catches and fails OPEN (0).
        return JsonSerializer.Deserialize<PenjagaPenolakanKredensial.Keadaan>(File.ReadAllText(_laluan, Encoding.UTF8));
    }

    public void Tulis(PenjagaPenolakanKredensial.Keadaan keadaan)
    {
        var direktori = Path.GetDirectoryName(_laluan);
        if (!string.IsNullOrEmpty(direktori)) Directory.CreateDirectory(direktori);
        File.WriteAllText(_laluan, JsonSerializer.Serialize(keadaan), Encoding.UTF8);
    }
}
