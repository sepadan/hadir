using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace HadirDesktop;

/// <summary>Structured result of a single auto-login attempt (mirrors companion's shape).</summary>
public sealed class HasilLoginAuto
{
    public string Status { get; set; } = "";
    public bool SesiSah { get; set; }
    public bool PerluManusia { get; set; }
    public string Sebab { get; set; } = "";
    public List<string> Bukti { get; } = new();
    public IdMeLoginSafety.KelasLogin Kelas { get; set; } = IdMeLoginSafety.KelasLogin.Transient;
}

/// <summary>DOM operation outcome: <c>Ok</c> + optional reason/status (no values).</summary>
public sealed record KeputusanDom(bool Ok, string Sebab = "", string Status = "");

/// <summary>Direct session-validity probe result (companion's <c>sesiSah()</c>).</summary>
public sealed record SesiProbe(bool Ada, bool Tangguh = false, string Sebab = "");

/// <summary>
/// OTP/CAPTCHA fail-safe observation. idMe has NO real OTP/CAPTCHA — the second
/// page is the SECURITY PHRASE step (<c>id="captcha"</c> canvas + checkbox),
/// which is a NORMAL step, not this. This guard is a RARE fail-safe that only
/// fires on a genuine OTP/2FA field or a reCAPTCHA iframe. When it fires,
/// <see cref="Perincian"/> carries the page URL (query/fragment stripped) plus
/// sanitized element identifiers (tag#id.class — never values) so a false
/// positive is diagnosable instead of a dead stop.
/// </summary>
public sealed record AmatanCaptcha(bool Dikesan, string Perincian = "");

/// <summary>
/// Narrow adapter the auto-login flow drives. The production implementation
/// (<see cref="WebView2IdMeLoginDom"/>) executes these against the embedded
/// WebView2 via <c>ExecuteScriptAsync</c>; tests inject a scripted fake. This is
/// the ONLY surface that touches the DOM; every decision is delegated to
/// <see cref="IdMeLoginSafety"/> so the safety gates stay pure and testable.
/// </summary>
public interface IIdMeLoginDom
{
    Task NavigasiLoginIdMe();
    Task<AmatanCaptcha> SemakCaptchaOtp();
    Task<string?> UrlHalaman();
    Task<KeputusanDom> IsiPenggunaIdMe(string pengguna);
    Task<KeputusanDom> LanjutkanPengesahan();
    Task<string?> BacaKunciKeselamatan();
    Task<bool> TandakanKunciKeselamatan();
    Task<KeputusanDom> IsiKataLaluanIdMe(string kataLaluan);
    Task<KeputusanDom> HantarBorangLogMasuk();
    Task<IdMeLoginSafety.KeputusanSelepasHantar> SahkanSesiSelepasLogin();
}

/// <summary>
/// PURE staged auto-login flow — a faithful C# port of the companion's
/// <c>jalankanLoginAutoTeras</c> (companion/src/moeis/login-auto.mjs), reusing
/// the SAME safety gates (host check before typing, phrase/checkbox handling,
/// OTP/CAPTCHA fail-safe) and the SAME status/evidence strings. No I/O, no
/// WebView2: the <see cref="IIdMeLoginDom"/> adapter is injected. The security
/// phrase step is a NORMAL step (expected-phrase comparison where readable, and
/// the owner's explicit opt-in for an unreadable image) — never "needs human"
/// by default.
/// </summary>
public static class IdMeLoginFlow
{
    private static HasilLoginAuto Buat(string status, bool perluManusia, string sebab, params string[] bukti)
    {
        var h = new HasilLoginAuto { Status = status, PerluManusia = perluManusia, Sebab = sebab };
        h.Bukti.AddRange(bukti);
        return h;
    }

    public static async Task<HasilLoginAuto> JalankanAsync(
        IIdMeLoginDom dom, KredensialIdMe? kredensial, bool benarkanTerusTanpaFrasa, CancellationToken ct = default)
    {
        var kunciDijangka = (kredensial?.KunciKeselamatan ?? "").Trim();
        var pengguna = (kredensial?.Pengguna ?? "").Trim();
        var kataLaluan = kredensial?.KataLaluan ?? "";

        if (pengguna.Length == 0 || kataLaluan.Length == 0 || kunciDijangka.Length == 0)
        {
            return Buat("tiada-kredensial", true,
                "Kredensial idMe tidak lengkap; log masuk automatik dibatalkan.", "kredensial-tidak-lengkap");
        }

        // 1. Navigate to the idMe login page.
        await dom.NavigasiLoginIdMe();
        ct.ThrowIfCancellationRequested();

        // 2. OTP/CAPTCHA fail-safe BEFORE typing anything (rare — see AmatanCaptcha).
        var captchaAwal = await dom.SemakCaptchaOtp();
        if (captchaAwal.Dikesan)
        {
            return Buat("perlu-manusia", true,
                "Halangan CAPTCHA/OTP dikesan sebelum log masuk (luar biasa untuk idMe — tiada kredensial ditaip). " + captchaAwal.Perincian,
                "captcha-otp-sebelum-menaip");
        }

        // 3. Strict host check (HTTPS + exact idme.moe.gov.my) BEFORE typing —
        //    anti-phishing. Never type on an unverified host.
        var urlSemasa = await dom.UrlHalaman();
        var sah = IdMeLoginSafety.SahkanHos(urlSemasa);
        if (!sah.Ok)
        {
            // Host/HTTPS mismatch is TRANSIENT under the owner's final policy:
            // never type, but retry the navigation. Anti-phishing holds because
            // no credential is ever typed before this check passes.
            return Buat("hos-tidak-sah", false, sah.Sebab + " Tiada kredensial ditaip; akan cuba semula.", "hos-tidak-sah");
        }

        // 4. Fill IC (user) ONLY — idMe needs it first to show the phrase.
        var isiIc = await dom.IsiPenggunaIdMe(pengguna);
        if (!isiIc.Ok)
        {
            return Buat("halaman-tidak-sedia", false,
                isiIc.Sebab.Length > 0 ? isiIc.Sebab : "Medan IC tidak muncul pada halaman log masuk idMe (halaman belum sedia); akan cuba semula.",
                "medan-ic-tiada");
        }

        // 5. Advance to the phrase/verification page (a NORMAL step).
        var lanjut = await dom.LanjutkanPengesahan();
        if (!lanjut.Ok)
        {
            return Buat("halaman-tidak-sedia", false,
                lanjut.Sebab.Length > 0 ? lanjut.Sebab : "Tidak dapat meneruskan ke halaman pengesahan idMe selepas mengisi IC (halaman belum sedia); akan cuba semula.",
                "lanjut-pengesahan-gagal");
        }

        // 6-7. Phrase decision — three honest statuses (never confuse
        //      "unreadable" with "mismatch"):
        //        unreadable + opt-in OFF -> 'kunci-tiada' ABORT (owner chose manual)
        //        unreadable + opt-in ON  -> continue (modTanpaFrasa)
        //        read but different      -> 'kunci-tidak-padan' ABORT regardless
        var kunciSebenar = await dom.BacaKunciKeselamatan();
        var frasaTidakDapatDibaca = string.IsNullOrEmpty(kunciSebenar);
        var modTanpaFrasa = false;
        if (frasaTidakDapatDibaca)
        {
            if (!benarkanTerusTanpaFrasa)
            {
                return Buat("kunci-tiada", true,
                    "Frasa \"Kata Kunci Keselamatan\" tidak dapat dibaca sebagai teks (imej/canvas); log masuk manual diperlukan (atau hidupkan suis benarkanTerusTanpaFrasa).",
                    "kunci-tiada");
            }
            modTanpaFrasa = true;
        }
        else if (!string.Equals(kunciSebenar, kunciDijangka, StringComparison.Ordinal))
        {
            return Buat("kunci-tidak-padan", true,
                "Frasa \"Kata Kunci Keselamatan\" idMe pada halaman tidak padan dengan yang disimpan. Kemungkinan halaman pancingan; tiada kotak semak ditekan, tiada kata laluan ditaip.",
                "kunci-tidak-padan");
        }

        // 8. Tick the security checkbox (reveals the hidden password field) —
        //    a NORMAL step, not "needs human".
        var kotakDitanda = await dom.TandakanKunciKeselamatan();
        if (!kotakDitanda)
        {
            return Buat("halaman-tidak-sedia", false,
                "Kotak semak \"Ya, ini adalah Kata Kunci Keselamatan saya.\" tidak dapat ditanda atau medan kata laluan tidak didedahkan (halaman belum sedia); akan cuba semula.",
                "kotak-pengesahan-gagal");
        }

        // 9. Fill password — ONLY now (phrase matched + checkbox ticked).
        var isiKataLaluan = await dom.IsiKataLaluanIdMe(kataLaluan);
        if (!isiKataLaluan.Ok)
        {
            return Buat("halaman-tidak-sedia", false,
                isiKataLaluan.Sebab.Length > 0 ? isiKataLaluan.Sebab : "Medan kata laluan tidak dapat diisi pada halaman pengesahan idMe (halaman belum sedia); akan cuba semula.",
                "medan-kata-laluan-tiada");
        }

        // 10. Submit ("Daftar Masuk").
        var hantar = await dom.HantarBorangLogMasuk();
        if (!hantar.Ok)
        {
            return Buat("halaman-tidak-sedia", false,
                hantar.Sebab.Length > 0 ? hantar.Sebab : "Tidak dapat menghantar borang log masuk idMe (butang \"Daftar Masuk\" tidak ditemui); akan cuba semula.",
                "butang-hantar-tiada");
        }

        // 11. Genuine human step (OTP/2FA) after submit: never bypass.
        var captchaAkhir = await dom.SemakCaptchaOtp();
        if (captchaAkhir.Dikesan)
        {
            return Buat("perlu-manusia", true,
                "Langkah manusia (OTP/2FA) dikesan selepas hantar; tidak dipintas. " + captchaAkhir.Perincian,
                "otp-selepas-hantar");
        }

        // 12. Verify the resulting session — three honest outcomes. Anything that
        //     is NOT an explicit credential rejection (including an ambiguous
        //     session) falls through to RETRY upstream, never a permanent stop.
        var sesi = await dom.SahkanSesiSelepasLogin();
        if (sesi.Status == "sesi-sah")
        {
            if (modTanpaFrasa)
            {
                var h = Buat("kunci-tiada-dibenarkan", false,
                    "Frasa \"Kata Kunci Keselamatan\" tidak dapat dibaca (imej/canvas) tetapi suis benarkanTerusTanpaFrasa HIDUP — log masuk diteruskan selepas semakan HTTPS + hos idMe dan kotak semak pengesahan ditanda; sesi kini sah.",
                    "kunci-tiada-dibenarkan", "sesi-sah");
                h.SesiSah = true;
                return h;
            }
            var ok = Buat("sesi-sah", false, "Log masuk idMe automatik berjaya.", "sesi-sah");
            ok.SesiSah = true;
            return ok;
        }
        if (sesi.Status == "kredensial-ditolak")
        {
            return Buat("kredensial-ditolak", true,
                sesi.Sebab.Length > 0 ? sesi.Sebab : "idMe menolak kredensial yang ditaip selepas hantar.",
                "kredensial-ditolak");
        }
        return Buat("sesi-tidak-dapat-disahkan", false,
            sesi.Sebab.Length > 0 ? sesi.Sebab : "Sesi tidak dapat disahkan selepas hantar; bukan bukti kredensial ditolak; akan cuba semula.",
            "sesi-tidak-dapat-disahkan");
    }
}

/// <summary>
/// Attempt manager. AUTO-RETRY POLICY (owner, final): only an EXPLICIT
/// "wrong password / wrong IC" rejection may pause automatic retries (via
/// <see cref="PenjagaPenolakanKredensial"/>, owner-configurable, one-click
/// "Cuba lagi"). EVERYTHING else — network error, timeout, host/HTTPS
/// mismatch, page not ready, busy profile, ambiguous session state, server
/// error — is retried INDEFINITELY with exponential backoff (capped, never a
/// tight loop) and never counts as a rejection. Pre-flight/session checks
/// never consume any budget. Never holds a credential value.
/// </summary>
public sealed class IdMeLoginManager
{
    private readonly object _gate = new();
    private readonly Func<bool> _adaKredensial;
    private readonly Func<Task<HasilLoginAuto>> _jalankan;
    private readonly PenjagaPenolakanKredensial _penjaga;
    private readonly Func<Task<SesiProbe>>? _sesiSah;
    private readonly int _jedaAsasMs;
    private readonly int _jedaMaksMs;
    private readonly Action<string, string>? _tulisLog;

    private Task<HasilLoginAuto>? _dalamPenerbangan;

    public IdMeLoginManager(
        Func<bool> adaKredensial,
        Func<Task<HasilLoginAuto>> jalankan,
        PenjagaPenolakanKredensial penjaga,
        Func<Task<SesiProbe>>? sesiSah = null,
        int jedaAsasMs = 5000,
        int jedaMaksMs = 60000,
        Action<string, string>? tulisLog = null)
    {
        _adaKredensial = adaKredensial;
        _jalankan = jalankan;
        _penjaga = penjaga;
        _sesiSah = sesiSah;
        _jedaAsasMs = jedaAsasMs;
        _jedaMaksMs = jedaMaksMs;
        _tulisLog = tulisLog;
    }

    private static HasilLoginAuto Buat(string status, bool perluManusia, string sebab, string bukti, IdMeLoginSafety.KelasLogin kelas)
    {
        var h = new HasilLoginAuto { Status = status, PerluManusia = perluManusia, Sebab = sebab, Kelas = kelas };
        h.Bukti.Add(bukti);
        return h;
    }

    /// <summary>Single-flight + indefinite transient retry with exponential backoff.</summary>
    public Task<HasilLoginAuto> CubaDenganCubaSemulaAsync(CancellationToken ct = default)
    {
        Task<HasilLoginAuto> penerbangan;
        lock (_gate)
        {
            if (_dalamPenerbangan != null) return _dalamPenerbangan;
            _dalamPenerbangan = TerasAsync(ct);
            penerbangan = _dalamPenerbangan;
        }
        // Return the LOCAL capture, never the field: the task's own `finally`
        // clears `_dalamPenerbangan` when it completes, and a very fast (all
        // scripted callbacks already done) attempt can complete on the thread
        // pool BETWEEN the unlock and this return — re-reading the field here
        // would then return null and NRE at the caller's `await`.
        return penerbangan;
    }

    private async Task<HasilLoginAuto> TerasAsync(CancellationToken ct)
    {
        try
        {
            // ALWAYS yield before doing any work: a fully synchronous attempt
            // (all scripted callbacks already completed) would otherwise finish
            // inside this call and clear `_dalamPenerbangan` BEFORE
            // CubaDenganCubaSemulaAsync stores the task, leaving a stale
            // completed task that silently disables every later attempt.
            await Task.Yield();
            return await CubaDenganCubaSemulaTerasAsync(ct);
        }
        finally
        {
            lock (_gate) _dalamPenerbangan = null;
        }
    }

    private async Task<HasilLoginAuto> CubaDenganCubaSemulaTerasAsync(CancellationToken ct)
    {
        var percubaan = 0;
        while (true)
        {
            ct.ThrowIfCancellationRequested();
            var hasil = await CubaSekaliAsync();

            // Only genuine TRANSIENT failures are retried (indefinitely, with
            // backoff). Success, needs-human, credential rejection all stop here.
            if (hasil.Kelas != IdMeLoginSafety.KelasLogin.Transient)
            {
                return hasil;
            }

            // Exponential backoff, capped — never a tight retry loop.
            var eksponen = Math.Min(percubaan, 20);
            var jeda = Math.Min((long)_jedaAsasMs * (1L << eksponen), (long)_jedaMaksMs);
            percubaan++;
            try
            {
                await Task.Delay((int)Math.Min(jeda, int.MaxValue), ct);
            }
            catch (OperationCanceledException)
            {
                ct.ThrowIfCancellationRequested();
            }
        }
    }

    /// <summary>One attempt: pre-flight + guard + a single credential submission.</summary>
    public async Task<HasilLoginAuto> CubaSekaliAsync()
    {
        // 1. Direct session probe (pre-flight, NEVER consumes any budget).
        if (_sesiSah != null)
        {
            SesiProbe? probe = null;
            try { probe = await _sesiSah(); } catch { probe = null; }
            if (probe != null && probe.Ada)
            {
                return Buat("sesi-sah", false, "Sesi idMe sudah sah (probe langsung); tiada log masuk diperlukan.", "sesi-sah", IdMeLoginSafety.KelasLogin.Berjaya);
            }
            if (probe != null && probe.Tangguh)
            {
                return Buat("langkau", false,
                    probe.Sebab.Length > 0 ? probe.Sebab : "Profil sibuk; cuba semula kemudian.",
                    "langkau", IdMeLoginSafety.KelasLogin.Transient);
            }
        }

        // 2. The ONLY auto-retry stop: N consecutive explicit credential rejections.
        if (_penjaga.Diblok())
        {
            var s = _penjaga.StatusRingkas();
            return Buat("disekat-penolakan", true, s.Sebab ?? "Penolakan kredensial berturut-turut dicapai.", "disekat-penolakan", IdMeLoginSafety.KelasLogin.PerluManusia);
        }

        // 3. Credential existence (pre-flight, no budget).
        var ada = false;
        try { ada = _adaKredensial(); } catch { ada = false; }
        if (!ada)
        {
            return Buat("tiada-kredensial", true, "Kredensial idMe belum disimpan pada PC ini.", "tiada-kredensial", IdMeLoginSafety.KelasLogin.PerluManusia);
        }

        // 4. Submission — the ONLY thing that may advance the rejection counter.
        HasilLoginAuto hasil;
        try
        {
            hasil = await _jalankan();
        }
        catch (Exception ralat)
        {
            hasil = Buat("gagal", false,
                ralat.Message.Length > 0 ? ralat.Message : "Ralat teknikal semasa log masuk automatik.",
                "ralat-teknikal", IdMeLoginSafety.KelasLogin.Transient);
        }

        var kelas = IdMeLoginSafety.KlasifikasiHasilLogin(hasil.Status, hasil.SesiSah, hasil.Bukti);
        if (kelas == IdMeLoginSafety.KelasLogin.Berjaya) _penjaga.CatatKejayaan();
        else if (kelas == IdMeLoginSafety.KelasLogin.PenolakanKredensial) _penjaga.CatatPenolakan();
        // transient / perlu-manusia never touch the counter.

        hasil.Kelas = kelas;
        if (kelas == IdMeLoginSafety.KelasLogin.Transient || kelas == IdMeLoginSafety.KelasLogin.Berjaya) hasil.PerluManusia = false;
        else if (kelas == IdMeLoginSafety.KelasLogin.PenolakanKredensial || kelas == IdMeLoginSafety.KelasLogin.PerluManusia) hasil.PerluManusia = true;

        _tulisLog?.Invoke(hasil.Status, hasil.Sebab);
        return hasil;
    }

    public int BilPenolakan() => _penjaga.BilPenolakan();

    public PenjagaPenolakanKredensial.RingkasanPenolakan StatusPenolakan() => _penjaga.StatusRingkas();

    /// <summary>One-click "Cuba lagi": clear the rejection counter immediately.</summary>
    public void CubaLagi() => _penjaga.CubaLagi();
}

/// <summary>
/// Demand-only orchestrator. Auto-login is driven STRICTLY by a waiting HADIR
/// task (new/unfinished attendance to submit): with an empty queue the app
/// performs NO login, NO portal navigation, and NO session probe — zero
/// idMe/MOEIS activity. There is deliberately NO timer/keepalive anywhere in
/// this class or the app: it only runs when a later phase (auto-send) signals a
/// waiting task. Feature is default-OFF.
/// </summary>
public sealed class IdMeLoginDemand
{
    private readonly IIdMeLoginSettingsStore _tetapan;
    private readonly IdMeLoginManager _pengurus;
    private readonly Func<Task<bool>> _adaKerjaMenunggu;

    public IdMeLoginDemand(
        IIdMeLoginSettingsStore tetapan,
        IdMeLoginManager pengurus,
        Func<Task<bool>> adaKerjaMenunggu)
    {
        _tetapan = tetapan;
        _pengurus = pengurus;
        _adaKerjaMenunggu = adaKerjaMenunggu;
    }

    /// <summary>
    /// One demand-only attempt. Order matters and is the whole point:
    ///   1. loginAuto switch (default OFF) — off = do nothing;
    ///   2. a waiting HADIR task — none = do nothing (no portal poke at all);
    ///   3. otherwise delegate to the manager (session probe → rejection guard →
    ///      credential → submission, with indefinite transient retry).
    /// </summary>
    public async Task<HasilLoginAuto> CubaAutoAsync(CancellationToken ct = default)
    {
        var t = _tetapan.Baca();
        if (!t.LoginAuto)
        {
            return new HasilLoginAuto { Status = "dilangkau", PerluManusia = false, Sebab = "Log masuk idMe automatik dimatikan (lalai)." };
        }

        // Zero-activity guarantee: with no waiting attendance, never log in,
        // never open the portal, never touch idMe/MOEIS — not even a session probe.
        if (!await _adaKerjaMenunggu())
        {
            return new HasilLoginAuto { Status = "tiada-kerja", PerluManusia = false, Sebab = "Tiada kehadiran belum siap untuk dihantar; tiada log masuk, tiada portal dibuka." };
        }

        return await _pengurus.CubaDenganCubaSemulaAsync(ct);
    }

    /// <summary>
    /// The SAME flow when the caller has ALREADY established demand itself
    /// (<see cref="PortalLifecycle"/> probes the engine once per cycle): the
    /// switch gate is applied here too, but the engine is not asked twice.
    /// Callers MUST have probed read-only demand and must pass exactly what the
    /// probe returned — never a guess.
    /// </summary>
    public async Task<HasilLoginAuto> CubaAutoDenganPermintaanAsync(bool adaKerja, CancellationToken ct = default)
    {
        var t = _tetapan.Baca();
        if (!t.LoginAuto)
        {
            return new HasilLoginAuto { Status = "dilangkau", PerluManusia = false, Sebab = "Log masuk idMe automatik dimatikan (lalai)." };
        }

        if (!adaKerja)
        {
            return new HasilLoginAuto { Status = "tiada-kerja", PerluManusia = false, Sebab = "Tiada kehadiran belum siap untuk dihantar; tiada log masuk, tiada portal dibuka." };
        }

        return await _pengurus.CubaDenganCubaSemulaAsync(ct);
    }
}
