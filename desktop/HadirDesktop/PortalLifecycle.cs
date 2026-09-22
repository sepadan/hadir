using System;
using System.Threading;
using System.Threading.Tasks;

namespace HadirDesktop;

/// <summary>
/// The five states the portal lifecycle can be in. This is the honest status of
/// the PC app with respect to the idMe/MOEIS portal:
///
///   * <see cref="Diam"/> — nothing to do: no unfinished HADIR task today (or
///     the feature is off / the owner has not opted in). NO navigation, NO
///     session probe, NO login.
///   * <see cref="AdaKerja"/> — at least one unfinished task TODAY; the portal
///     has been opened (or the session is already valid) and work is available.
///     There is deliberately no separate "session valid" state: the login
///     manager probes the session as pre-flight, which never consumes budget.
///   * <see cref="SedangLogin"/> — a demand-only login attempt is in flight.
///   * <see cref="PerluTindakanManusia"/> — automatic retries have STOPPED and
///     only a human can continue (consecutive explicit credential rejections
///     reached the owner's threshold, unreadable/mismatched security phrase, or
///     a genuine OTP/2FA step). "Cuba lagi" clears it.
///   * <see cref="EnjinLuarTalian"/> — demand could NOT be established (engine
///     not running, nonce rejected, unreadable body). Treated exactly like
///     "no work" for activity purposes: nothing is opened and nothing is typed.
/// </summary>
public enum KeadaanPortal
{
    Diam,
    AdaKerja,
    SedangLogin,
    PerluTindakanManusia,
    EnjinLuarTalian,
}

/// <summary>Pure text mapping for the five states (window strip + tray tooltip).</summary>
public static class LabelKeadaanPortal
{
    /// <summary>WinForms caps NotifyIcon.Text at 63 characters (a longer string throws).</summary>
    public const int MaksNotaDulang = 63;

    public static string Teks(KeadaanPortal keadaan) => keadaan switch
    {
        KeadaanPortal.AdaKerja => "ada-kerja",
        KeadaanPortal.SedangLogin => "sedang-login",
        KeadaanPortal.PerluTindakanManusia => "perlu-tindakan-manusia",
        KeadaanPortal.EnjinLuarTalian => "enjin-luar-talian",
        _ => "diam",
    };

    public static string Ayat(KeadaanPortal keadaan) => keadaan switch
    {
        KeadaanPortal.AdaKerja => "Ada tugasan HADIR belum siap hari ini; portal dibuka.",
        KeadaanPortal.SedangLogin => "Sedang log masuk idMe automatik.",
        KeadaanPortal.PerluTindakanManusia => "Perlu tindakan manusia sebelum cubaan automatik diteruskan.",
        KeadaanPortal.EnjinLuarTalian => "Enjin tempatan tidak dapat dihubungi; deman tidak dapat dipastikan.",
        _ => "Diam — tiada tugasan belum siap hari ini; tiada portal dibuka, tiada log masuk.",
    };

    /// <summary>Tray tooltip, truncated to the WinForms limit (never throws).</summary>
    public static string UntukDulang(KeadaanPortal keadaan)
    {
        var teks = "HADIR Desktop — " + Teks(keadaan);
        return teks.Length <= MaksNotaDulang ? teks : teks[..MaksNotaDulang];
    }

    /// <summary>Menu row: state plus the reason (reason truncated, never a credential).</summary>
    public static string UntukMenu(KeadaanPortal keadaan, string? sebab, int maks = 90)
    {
        var teks = "Keadaan portal: " + Teks(keadaan);
        if (string.IsNullOrWhiteSpace(sebab)) return teks;
        teks += " — " + sebab.Trim();
        return teks.Length <= maks ? teks : teks[..maks] + "…";
    }
}

/// <summary>
/// DEMAND-ONLY portal lifecycle. This is the ONLY place that decides whether the
/// embedded WebView2 is pointed at the portal at all, and it decides it from a
/// single ordered gate:
///
///   1. owner opt-in switch (default OFF) — off = diam, and not even the engine
///      is asked;
///   2. the engine's read-only demand probe (<see cref="IKerjaHariIniSource"/>)
///      — unreachable/unreadable = <see cref="KeadaanPortal.EnjinLuarTalian"/>
///      with ZERO portal activity; no unfinished task today =
///      <see cref="KeadaanPortal.Diam"/> with ZERO portal activity (no
///      navigation, no session probe, no login);
///   3. only then: open the portal, log in (the login manager owns the retry
///      policy and the session pre-flight), and report the outcome.
///
/// There is no timer and no keepalive anywhere: a run happens only when a
/// caller asks for one (tray action, or a later auto-send phase signalling a
/// waiting task). Single-flight: overlapping calls join the run in progress.
/// </summary>
public sealed class PortalLifecycle
{
    private readonly object _gate = new();
    private readonly IKerjaHariIniSource _sumber;
    private readonly Func<bool> _dihidupkan;
    private readonly Func<CancellationToken, Task> _bukaPortal;
    private readonly Func<CancellationToken, Task<HasilLoginAuto>> _cubaLogin;
    private readonly Func<bool>? _diblok;
    private readonly Func<CancellationToken, Task<string?>>? _selepasLoginSah;
    private readonly Action<KeadaanPortal, string>? _lapor;

    private Task<KeadaanPortal>? _dalamPenerbangan;
    private KeadaanPortal _keadaan = KeadaanPortal.Diam;
    private string _sebab = LabelKeadaanPortal.Ayat(KeadaanPortal.Diam);
    private int _bilanganKerja;

    public PortalLifecycle(
        IKerjaHariIniSource sumber,
        Func<bool> dihidupkan,
        Func<CancellationToken, Task> bukaPortal,
        Func<CancellationToken, Task<HasilLoginAuto>> cubaLogin,
        Func<bool>? diblok = null,
        Func<CancellationToken, Task<string?>>? selepasLoginSah = null,
        Action<KeadaanPortal, string>? lapor = null)
    {
        _sumber = sumber;
        _dihidupkan = dihidupkan;
        _bukaPortal = bukaPortal;
        _cubaLogin = cubaLogin;
        _diblok = diblok;
        _selepasLoginSah = selepasLoginSah;
        _lapor = lapor;
    }

    public KeadaanPortal Keadaan
    {
        get { lock (_gate) return _keadaan; }
    }

    public string Sebab
    {
        get { lock (_gate) return _sebab; }
    }

    public int BilanganKerja
    {
        get { lock (_gate) return _bilanganKerja; }
    }

    /// <summary>Raised after every state change (tray/status refresh).</summary>
    public event EventHandler? KeadaanBerubah;

    /// <summary>One demand-only cycle. Single-flight; never runs two cycles at once.</summary>
    public Task<KeadaanPortal> PeriksaDanJalankanAsync(CancellationToken ct = default)
    {
        lock (_gate)
        {
            if (_dalamPenerbangan != null) return _dalamPenerbangan;
            _dalamPenerbangan = TerasAsync(ct);
        }
        return _dalamPenerbangan;
    }

    private async Task<KeadaanPortal> TerasAsync(CancellationToken ct)
    {
        try
        {
            // ALWAYS yield before doing any work. Without this, a cycle whose
            // awaits all complete synchronously (an engine answer already in
            // hand, fakes in tests) finishes inside this very call, so the
            // `finally` below would clear `_dalamPenerbangan` BEFORE
            // PeriksaDanJalankanAsync has stored the task — leaving a stale
            // completed task that makes every later cycle a no-op.
            await Task.Yield();
            return await TerasDalamanAsync(ct).ConfigureAwait(false);
        }
        finally
        {
            lock (_gate) _dalamPenerbangan = null;
        }
    }

    private async Task<KeadaanPortal> TerasDalamanAsync(CancellationToken ct)
    {
        // 1. Owner opt-in. Off = diam, and the engine is not even asked. An
        //    unreadable switch (corrupt settings file) counts as OFF: the
        //    default is OFF, so a failure may never turn the feature on.
        bool dihidupkan;
        try { dihidupkan = _dihidupkan(); }
        catch { dihidupkan = false; }

        if (!dihidupkan)
        {
            Set(KeadaanPortal.Diam, "Log masuk idMe automatik dimatikan (lalai) — tiada portal dibuka.", 0);
            return Keadaan;
        }

        // 2. Demand probe — the ONE signal. Never guessed. A probe that throws
        //    (a source that does not honour the no-throw contract) is demand
        //    NOT ESTABLISHED, exactly like an offline engine — never "ada
        //    kerja", and never a faulted task escaping into the caller's
        //    `async void` event handler, which would take the app down.
        PermintaanKerja kerja;
        try
        {
            kerja = await _sumber.SemakAsync(ct).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ralat)
        {
            Set(KeadaanPortal.EnjinLuarTalian,
                "Ralat tidak dijangka semasa menyemak deman (" + ralat.GetType().Name +
                "); deman tidak dapat dipastikan. Tiada portal dibuka, tiada probe sesi, tiada log masuk dicuba.", 0);
            return Keadaan;
        }

        if (!kerja.EnjinBolehDicapai)
        {
            Set(KeadaanPortal.EnjinLuarTalian,
                kerja.Sebab + " Tiada portal dibuka, tiada probe sesi, tiada log masuk dicuba.", 0);
            return Keadaan;
        }

        if (!kerja.AdaKerja)
        {
            Set(KeadaanPortal.Diam,
                kerja.Sebab + " Tiada portal dibuka, tiada probe sesi, tiada log masuk dicuba.", 0);
            return Keadaan;
        }

        Set(KeadaanPortal.AdaKerja, kerja.Sebab, kerja.BilanganKerja);

        // A tripped consecutive-rejection guard stops the cycle BEFORE the
        // portal is touched — opening it could gain nothing. The owner's
        // one-click "Cuba lagi" clears the guard and re-enables the flow.
        bool diblok;
        try { diblok = _diblok != null && _diblok(); }
        catch { diblok = true; }   // an unreadable guard stops the cycle: nothing typed

        if (diblok)
        {
            Set(KeadaanPortal.PerluTindakanManusia,
                "Penolakan kredensial berturut-turut dicapai; cubaan automatik dihentikan sehingga \"Cuba lagi\". Tiada portal dibuka, tiada kredensial ditaip.",
                kerja.BilanganKerja);
            return Keadaan;
        }

        // 3. Only now is the portal touched — and only because there is work.
        //    A failure to open it (WebView2 not ready, window torn down, the
        //    allowlist refusing) leaves the work waiting and is retried on the
        //    next cycle; it must NOT fault the task, and NOTHING is typed.
        try
        {
            await _bukaPortal(ct).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ralat)
        {
            Set(KeadaanPortal.AdaKerja,
                "Portal tidak dapat dibuka (" + ralat.GetType().Name +
                "); tiada log masuk dicuba. Tugasan belum siap kekal menunggu.", kerja.BilanganKerja);
            return Keadaan;
        }

        Set(KeadaanPortal.SedangLogin, "Portal dibuka untuk " + kerja.BilanganKerja + " tugasan belum siap; log masuk automatik bermula.",
            kerja.BilanganKerja);

        HasilLoginAuto hasil;
        try
        {
            hasil = await _cubaLogin(ct).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ralat)
        {
            Set(KeadaanPortal.AdaKerja,
                "Ralat teknikal semasa log masuk automatik (" + ralat.GetType().Name + "); bukan penolakan kredensial — akan cuba semula.",
                kerja.BilanganKerja);
            return Keadaan;
        }

        if (hasil.SesiSah || hasil.Status == "sesi-sah")
        {
            // A VALID session is the ONLY trigger for the submission pass: the
            // pass reads HADIR's full task list and builds/calls the MOEIS
            // adapter. It is opt-in and default OFF inside the pass itself, so a
            // successful login with the pass disabled changes nothing.
            var notaHantar = await SelepasLoginSahAsync(ct).ConfigureAwait(false);
            Set(KeadaanPortal.AdaKerja,
                "Sesi idMe sah. Tugasan belum siap masih menunggu penghantaran."
                + (string.IsNullOrWhiteSpace(notaHantar) ? "" : " " + notaHantar),
                kerja.BilanganKerja);
        }
        else if (hasil.PerluManusia)
        {
            Set(KeadaanPortal.PerluTindakanManusia,
                hasil.Sebab.Length > 0
                    ? hasil.Sebab
                    : "Log masuk automatik memerlukan tindakan manusia; cubaan automatik berhenti sehingga \"Cuba lagi\".",
                kerja.BilanganKerja);
        }
        else
        {
            // Transient (or feature switched off mid-flight): work remains
            // waiting, retries are the login manager's job (indefinite backoff).
            Set(KeadaanPortal.AdaKerja,
                hasil.Sebab.Length > 0 ? hasil.Sebab : "Cubaan log masuk sementara gagal; akan cuba semula dengan backoff.",
                kerja.BilanganKerja);
        }

        return Keadaan;
    }

    private async Task<string> SelepasLoginSahAsync(CancellationToken ct)
    {
        if (_selepasLoginSah == null) return "";
        try
        {
            var nota = await _selepasLoginSah(ct).ConfigureAwait(false);
            return string.IsNullOrWhiteSpace(nota) ? "" : nota;
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch
        {
            // The submission pass is best-effort after a valid session; a
            // failure there must never flip the already-valid session state.
            return "(penghantaran: ralat)";
        }
    }

    private void Set(KeadaanPortal keadaan, string sebab, int bilanganKerja)
    {
        bool berubah;
        lock (_gate)
        {
            berubah = _keadaan != keadaan || !string.Equals(_sebab, sebab, StringComparison.Ordinal);
            _keadaan = keadaan;
            _sebab = sebab;
            _bilanganKerja = bilanganKerja;
        }

        try
        {
            _lapor?.Invoke(keadaan, sebab);
        }
        catch
        {
            // Reporting is best-effort; a UI hiccup must never abort a cycle.
        }

        if (berubah)
        {
            try
            {
                KeadaanBerubah?.Invoke(this, EventArgs.Empty);
            }
            catch
            {
                // Same as above.
            }
        }
    }
}
