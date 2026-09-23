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
    /// Keadaan halaman pada PERMULAAN cubaan (selepas navigasi ke
    /// <c>/login</c>): halaman itu meminta kredensial, ia papan pemuka bagi sesi
    /// yang SUDAH sah, atau ia tidak jelas.
    /// </summary>
    public enum KeadaanMasuk { BorangLogin, SesiSah, TidakJelas }

    /// <summary>
    /// Penanda OBJEKTIF yang dibaca dari halaman permulaan. Tiada nilai, tiada
    /// teks halaman — boolean sahaja. Lalai (semua <c>false</c>) bermakna
    /// <see cref="KeadaanMasuk.TidakJelas"/>: gagal-tertutup.
    ///
    /// <para><b>AdaMedanIc / AdaMedanKataLaluan</b> — halaman MEMINTA kredensial
    /// (penanda kuat). <b>AdaMedanTeksUmum</b> ialah sandaran LEMAH yang sepadan
    /// dengan pemilih terakhir <c>IsiPenggunaIdMe</c>, supaya halaman yang dulu
    /// boleh diisi tidak tiba-tiba menjadi "tidak jelas".
    /// <b>AdaPautanSenaraiAplikasi</b> — anchor <c>a[href*="list_aplikasi"]</c>,
    /// iaitu papan pemuka idMe selepas log masuk.</para>
    /// </summary>
    public sealed record AmatanMasuk(
        bool AdaMedanIc = false,
        bool AdaMedanKataLaluan = false,
        bool AdaMedanTeksUmum = false,
        bool AdaPautanSenaraiAplikasi = false);

    /// <summary>
    /// Laluan yang HANYA wujud selepas log masuk idMe. Diambil terus daripada
    /// jejak navigasi hidup 23/09/2026: <c>/login → /home</c> apabila profil
    /// WebView2 sudah memegang sesi idMe yang sah.
    /// </summary>
    private static readonly IReadOnlySet<string> LALUAN_PAPAN_PEMUKA =
        new HashSet<string>(StringComparer.Ordinal) { "/home", "/list_aplikasi" };

    /// <summary>
    /// PEPIJAT BLOK (hidup, 23/09/2026): apabila profil WebView2 sudah mempunyai
    /// sesi idMe yang sah, idMe melencongkan <c>/login</c> ke <c>/home</c>.
    /// Borang IC tidak pernah muncul, jadi aliran membaca "medan IC tiada" dan
    /// mengulang tanpa henti. Fungsi ini memberi jawapan ketiga: sesi yang SUDAH
    /// sah dikenali sebagai sah, bukan sebagai kegagalan.
    ///
    /// <para>Pagar KEKAL: sesi hanya boleh diakui pada HTTPS + hos idMe/MOEIS
    /// yang dibenarkan (tiada userinfo, port lalai). Halaman yang bukan borang
    /// dan bukan papan pemuka kekal <see cref="KeadaanMasuk.TidakJelas"/>
    /// (transient), dan pengesahan sebenar sesi MOEIS tetap bergantung pada
    /// <c>#kehadiran</c> di hulu — fungsi ini tidak pernah membuktikannya.</para>
    /// </summary>
    public static KeadaanMasuk TentukanKeadaanMasuk(string? url, AmatanMasuk? amatan)
    {
        if (amatan == null) return KeadaanMasuk.TidakJelas;

        if (!Uri.TryCreate(url, UriKind.Absolute, out var u)) return KeadaanMasuk.TidakJelas;
        if (u.Scheme != Uri.UriSchemeHttps) return KeadaanMasuk.TidakJelas;
        if (!string.IsNullOrEmpty(u.UserInfo)) return KeadaanMasuk.TidakJelas;
        if (!u.IsDefaultPort) return KeadaanMasuk.TidakJelas;

        var hos = u.Host.ToLowerInvariant();
        if (hos != HOS_IDME_SAH && hos != HOS_MOEIS_SAH) return KeadaanMasuk.TidakJelas;

        // 1) Halaman yang MEMINTA kredensial menang dahulu: kalau medan IC atau
        //    kata laluan ada, ini borang — teruskan aliran menaip yang biasa.
        if (amatan.AdaMedanIc || amatan.AdaMedanKataLaluan) return KeadaanMasuk.BorangLogin;

        // 2) Bukti sesi: pautan senarai aplikasi, atau laluan papan pemuka.
        if (amatan.AdaPautanSenaraiAplikasi) return KeadaanMasuk.SesiSah;
        if (LALUAN_PAPAN_PEMUKA.Contains(NormalLaluan(u.AbsolutePath))) return KeadaanMasuk.SesiSah;

        // 3) Sandaran lemah — kekalkan tingkah laku lama bagi halaman borang yang
        //    hanya mempunyai satu medan teks generik.
        if (amatan.AdaMedanTeksUmum) return KeadaanMasuk.BorangLogin;

        return KeadaanMasuk.TidakJelas;
    }

    private static string NormalLaluan(string? laluan)
    {
        var l = (laluan ?? "").Trim().ToLowerInvariant();
        if (l.Length > 1 && l.EndsWith("/", StringComparison.Ordinal)) l = l.TrimEnd('/');
        return l;
    }

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
