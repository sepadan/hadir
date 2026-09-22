using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace HadirDesktop;

/// <summary>
/// PURE safety gates for idMe auto-login — a faithful C# port of the companion
/// engine's pure functions so the Windows app reuses the SAME semantics and
/// constants (not a re-derived variant):
///
///   * <c>sahkanHos</c> — companion/src/moeis/sesi.mjs (HTTPS + exact host +
///     no userinfo + default port, fail-closed);
///   * <c>SUMBER_REGEX_PENOLAKAN_KREDENSIAL</c> — companion/src/moeis/sesi.mjs
///     (strict explicit credential-rejection phrases ONLY; never generic
///     "login failed" that could be a transient/session-expired page);
///   * <c>tentukanStatusSelepasHantar</c> — companion/src/moeis/sesi.mjs
///     (post-submit session classification);
///   * the phrase decision + <c>klasifikasiHasilLogin</c> —
///     companion/src/moeis/login-auto.mjs.
///
/// No I/O, no WebView2, fully unit-testable. All decisions here FAIL CLOSED.
/// </summary>
public static class IdMeLoginSafety
{
    public const string HOS_IDME_SAH = "idme.moe.gov.my";
    public const string HOS_MOEIS_SAH = "moeispel.moe.gov.my";

    /// <summary>
    /// Strict explicit credential-rejection phrases only. This set is
    /// INTENTIONALLY narrow: it matches only text that literally names the
    /// password or IC number as wrong/incorrect. Generic phrases ("log masuk
    /// gagal", "invalid login") are deliberately EXCLUDED because they also
    /// also appear for expired sessions / network errors / half-loaded pages and
    /// would count a FALSE strike against the consecutive-rejection guard.
    /// </summary>
    public const string REGEX_PENOLAKAN_KREDENSIAL =
        "(kata laluan (tidak betul|salah)" +
        "|no\\.?\\s*kad pengenalan[^.\\n]{0,40}(salah|tidak betul)" +
        "|(password|no\\.? kp) (tidak betul|salah|is incorrect|does not match)" +
        "|incorrect password|wrong password|invalid password)";

    /// <summary>
    /// Evidence strings that mean a human must intervene (STOP, not retry) —
    /// deliberately NARROW under the owner's final policy ("kata laluan tidak
    /// akan salah"): only a genuine OTP/CAPTCHA, an unreadable security phrase
    /// without the owner's opt-in, a MISMATCHED phrase (anti-phishing), or an
    /// incomplete credential stop the retry loop. Everything else — host/HTTPS
    /// mismatch, page not ready, missing field/button, busy profile, ambiguous
    /// session, network/server error — is TRANSIENT and must be retried
    /// indefinitely (never a strike, never a permanent stop).
    /// </summary>
    public static readonly IReadOnlySet<string> BuktiPerluManusia = new HashSet<string>(StringComparer.Ordinal)
    {
        "captcha-otp-sebelum-menaip", "otp-selepas-hantar",
        "kunci-tiada", "kunci-tidak-padan",
        "kredensial-tidak-lengkap",
    };

    public sealed record KeputusanHos(bool Ok, string Sebab, string Hos);

    public enum KeputusanFrasa { Padan, Tiada, TiadaDibenarkan, TidakPadan }

    public sealed record KeputusanSelepasHantar(string Status, string Hos, string Sebab);

    public enum KelasLogin { Berjaya, PenolakanKredensial, PerluManusia, Transient }

    /// <summary>
    /// Anti-phishing host validation: HTTPS required, EXACT host
    /// <c>idme.moe.gov.my</c> (no subdomain trickery like
    /// <c>idme.moe.gov.my.evil.com</c>), no userinfo, default port only.
    /// Fail-closed on any doubt.
    /// </summary>
    public static KeputusanHos SahkanHos(string? urlString)
    {
        if (!Uri.TryCreate(urlString, UriKind.Absolute, out var u))
        {
            return new KeputusanHos(false, "URL tidak sah.", "");
        }

        if (u.Scheme != Uri.UriSchemeHttps)
        {
            return new KeputusanHos(false, "Protokol mesti HTTPS (dapat " + u.Scheme + ").", "");
        }

        if (!string.IsNullOrEmpty(u.UserInfo))
        {
            return new KeputusanHos(false, "URL mengandungi maklumat pengguna (userinfo) — ditolak, corak biasa URL pancingan.", "");
        }

        var hos = u.Host.ToLowerInvariant();
        if (hos != HOS_IDME_SAH)
        {
            return new KeputusanHos(false, "Hos bukan " + HOS_IDME_SAH + " (dapat " + hos + ").", hos);
        }

        if (!u.IsDefaultPort)
        {
            return new KeputusanHos(false, "Port bukan lalai (443): " + u.Port, hos);
        }

        return new KeputusanHos(true, "", hos);
    }

    /// <summary>Is this URL the exact idMe host (HTTPS + exact host)?</summary>
    public static bool AdalahHosIdMe(string? url) => SahkanHos(url).Ok;

    /// <summary>
    /// Security-phrase decision. An unreadable phrase (image-only / not found)
    /// is NEVER assumed to match; it is reported as "tiada" unless the owner
    /// explicitly opted into continuing without a phrase (opt-in, default OFF).
    /// </summary>
    public static KeputusanFrasa SemakFrasa(string? kunciSebenar, string kunciDijangka, bool benarkanTerusTanpaFrasa)
    {
        if (string.IsNullOrEmpty(kunciSebenar))
        {
            return benarkanTerusTanpaFrasa ? KeputusanFrasa.TiadaDibenarkan : KeputusanFrasa.Tiada;
        }

        return string.Equals(kunciSebenar, kunciDijangka, StringComparison.Ordinal)
            ? KeputusanFrasa.Padan
            : KeputusanFrasa.TidakPadan;
    }

    /// <summary>Faithful port of <c>tentukanStatusSelepasHantar</c> (sesi.mjs).</summary>
    public static KeputusanSelepasHantar TentukanStatusSelepasHantar(
        string hos, bool borangLogin, bool dashboardIdMe, bool adaKehadiran, bool kredensialDitolak)
    {
        // 1) MOEIS host handled EXCLUSIVELY via #kehadiran.
        if (hos == HOS_MOEIS_SAH)
        {
            return adaKehadiran
                ? new KeputusanSelepasHantar("sesi-sah", hos, "")
                : new KeputusanSelepasHantar("sesi-tamat", hos, "Hos MOEIS dicapai tetapi elemen #kehadiran tiada.");
        }

        // 2) Explicit credential rejection FIRST, so a real rejection is never
        //    misread as a merely unverifiable session.
        if (kredensialDitolak)
        {
            return new KeputusanSelepasHantar("kredensial-ditolak", hos,
                "idMe memaparkan penolakan kredensial eksplisit (kata laluan/IC salah) selepas hantar.");
        }

        // 3) idMe dashboard: exact host + login form gone + dashboard markers.
        if (hos == HOS_IDME_SAH && !borangLogin && dashboardIdMe)
        {
            return new KeputusanSelepasHantar("sesi-sah", hos, "");
        }

        // 4) Unverifiable — reason names what was actually found.
        if (borangLogin)
        {
            return new KeputusanSelepasHantar("sesi-tamat", hos,
                "Selepas hantar, borang log masuk idMe (#check_log/#password) masih dipaparkan — log masuk belum berjaya.");
        }

        return new KeputusanSelepasHantar("sesi-tamat", hos,
            "Selepas hantar, hos ialah " + (string.IsNullOrEmpty(hos) ? "(tiada)" : hos) +
            " tanpa borang log masuk mahupun papan pemuka idMe/MOEIS dikesan — log masuk tidak dapat disahkan.");
    }

    /// <summary>
    /// Classify a raw login result for the rate-limiter / caller. A session that
    /// cannot be verified (transient) is deliberately NOT a credential strike.
    /// </summary>
    public static KelasLogin KlasifikasiHasilLogin(string? status, bool sesiSah, IEnumerable<string>? bukti)
    {
        if (status == "sesi-sah" || sesiSah || status == "kunci-tiada-dibenarkan")
        {
            return KelasLogin.Berjaya;
        }

        var b = bukti?.ToList() ?? new List<string>();
        if (status == "kredensial-ditolak" || b.Contains("kredensial-ditolak"))
        {
            return KelasLogin.PenolakanKredensial;
        }

        if (status == "perlu-manusia" || b.Any(BuktiPerluManusia.Contains))
        {
            return KelasLogin.PerluManusia;
        }

        return KelasLogin.Transient;
    }

    /// <summary>Explicit credential rejection heuristic against page body text.</summary>
    public static bool AdakahKredensialDitolak(string? teksBadan)
    {
        if (string.IsNullOrEmpty(teksBadan)) return false;
        return Regex.IsMatch(teksBadan, REGEX_PENOLAKAN_KREDENSIAL, RegexOptions.IgnoreCase);
    }
}
