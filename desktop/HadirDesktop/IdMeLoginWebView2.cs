using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Web.WebView2.Core;

namespace HadirDesktop;

/// <summary>
/// Hard-coded idMe/MOEIS endpoints for the demand-only auto-login. These are
/// the SAME origins as <c>RealPortalDevMode</c> plus the MOEIS attendance URL
/// used to verify the resulting session (mirrors
/// <c>companion/src/moeis/adaptorPlaywright.mjs</c>). No secrets here.
/// </summary>
public static class IdMeLoginEndpoints
{
    public const string IdMeOrigin = "https://idme.moe.gov.my";
    public const string MoeisOrigin = "https://moeispel.moe.gov.my";
    public const string LoginUrl = "https://idme.moe.gov.my/login";
    public const string KehadiranUrl = "https://moeispel.moe.gov.my/sahsiah/kehadiran/pkhem/tabguru";
}

/// <summary>
/// Production <see cref="IIdMeLoginDom"/> over the embedded WebView2, driven via
/// <c>CoreWebView2.ExecuteScriptAsync</c>. This is the ONLY place the app's own
/// code touches the idMe DOM to TYPE the credential; every decision that gates
/// whether it is safe to type lives in <see cref="IdMeLoginSafety"/> / the pure
/// flow, and this class types nothing until those gates have passed.
///
/// SECURITY:
///   * Values typed (IC/password) are embedded into the script as JSON-encoded
///     string literals and are NEVER written to any log/status/UI surface.
///   * Host + HTTPS are verified by the pure flow BEFORE any fill call.
///   * NOT YET verified against the live idMe portal (same posture as the
///     companion's "BELUM disahkan hidup" — live verification is a later,
///     owner-attended step after the parent gate).
/// </summary>
public sealed class WebView2IdMeLoginDom : IIdMeLoginDom
{
    private readonly Func<CoreWebView2?> _getWebView;
    private readonly int _masaSediaMs;
    private readonly int _jedaPollMs;
    private readonly int _masaMuatMs;

    public WebView2IdMeLoginDom(Func<CoreWebView2?> getWebView, int masaSediaMs = 15000, int jedaPollMs = 250, int masaMuatMs = 4000)
    {
        _getWebView = getWebView;
        _masaSediaMs = masaSediaMs;
        _jedaPollMs = jedaPollMs;
        _masaMuatMs = masaMuatMs;
    }

    private static async Task Delay(int ms, CancellationToken ct = default)
    {
        try { await Task.Delay(ms, ct); } catch (OperationCanceledException) { }
    }

    private async Task<string?> EvalStringAsync(string js)
    {
        var wv = _getWebView();
        if (wv == null) return null;
        try
        {
            var raw = await wv.ExecuteScriptAsync(js);
            if (string.IsNullOrEmpty(raw) || raw == "null" || raw == "undefined") return null;
            return JsonSerializer.Deserialize<string>(raw);
        }
        catch
        {
            return null;
        }
    }

    private async Task<bool> EvalBoolAsync(string js)
    {
        var wv = _getWebView();
        if (wv == null) return false;
        try
        {
            var raw = await wv.ExecuteScriptAsync(js);
            return raw == "true";
        }
        catch
        {
            return false;
        }
    }

    private Task NavigateAsync(string url)
    {
        var wv = _getWebView();
        try { wv?.Navigate(url); } catch { /* navigation can fail transiently */ }
        return Delay(_masaMuatMs);
    }

    public async Task NavigasiLoginIdMe()
    {
        await NavigateAsync(IdMeLoginEndpoints.LoginUrl);
    }

    public async Task<AmatanCaptcha> SemakCaptchaOtp()
    {
        var wv = _getWebView();
        if (wv == null) return new AmatanCaptcha(false);
        try
        {
            // NOTE: this deliberately does NOT match the idMe security-phrase
            // canvas (id="captcha") — that is a NORMAL step. Only a real OTP/2FA
            // field or a reCAPTCHA iframe trips this fail-safe.
            //
            // The script returns a JS STRING, so the result must go through
            // EvalStringAsync (ExecuteScriptAsync hands back the JSON ENCODING of
            // the result — a JSON-encoded string, not the object itself). Parsing
            // the raw result directly made this whole guard unreachable: every
            // page classified as JsonValueKind.String and returned "no CAPTCHA",
            // i.e. an OTP/2FA challenge could never stop the flow.
            var raw = await EvalStringAsync(
                "(function(){var padanan=[];var url=location.href;document.querySelectorAll('.g-recaptcha, iframe[src*=\"recaptcha\"], input[name*=\"otp\" i], input[autocomplete=\"one-time-code\"]').forEach(function(el){var cls=el.className;if(cls&&cls.baseVal!==undefined)cls=cls.baseVal;padanan.push((el.tagName||'').toLowerCase()+'#'+(el.id||'')+'.'+String(cls||''));});return JSON.stringify({url:url,padanan:padanan.slice(0,8)});})()");
            if (string.IsNullOrEmpty(raw) || raw == "null") return new AmatanCaptcha(false);
            using var doc = JsonDocument.Parse(raw);
            if (doc.RootElement.ValueKind != JsonValueKind.Object) return new AmatanCaptcha(false);
            var url = "";
            var padanan = new List<string>();
            if (doc.RootElement.TryGetProperty("url", out var u) && u.ValueKind == JsonValueKind.String) url = u.GetString() ?? "";
            if (doc.RootElement.TryGetProperty("padanan", out var p) && p.ValueKind == JsonValueKind.Array)
            {
                foreach (var e in p.EnumerateArray())
                {
                    if (e.ValueKind == JsonValueKind.String) padanan.Add(e.GetString() ?? "");
                }
            }
            if (padanan.Count == 0) return new AmatanCaptcha(false);
            var perincian = "Dikesan pada " + SanitizeUrl(url) + " — elemen: " + string.Join(", ", padanan) + ".";
            return new AmatanCaptcha(true, perincian);
        }
        catch
        {
            return new AmatanCaptcha(false);
        }
    }

    private static string SanitizeUrl(string url)
    {
        if (Uri.TryCreate(url, UriKind.Absolute, out var u))
        {
            // Strip query + fragment so no token is ever echoed into a status line.
            return u.Scheme + "://" + u.Authority + u.AbsolutePath;
        }
        return "(url tidak diketahui)";
    }

    public Task<string?> UrlHalaman() => EvalStringAsync("location.href");

    /// <summary>
    /// Penanda objektif halaman permulaan — boolean sahaja, tiada nilai dan
    /// tiada teks halaman. PEMERHATIAN sahaja: tiada medan diisi, tiada kotak
    /// ditanda, tiada borang dihantar.
    ///
    /// Pemilih medan IC/kata laluan SENGAJA sepadan dengan yang digunakan oleh
    /// <see cref="IsiPenggunaIdMe"/> / <see cref="IsiKataLaluanIdMe"/> (termasuk
    /// syarat "aktif dan kelihatan"), supaya halaman yang memang boleh diisi
    /// tidak pernah tersalah baca sebagai papan pemuka. Gagal-tertutup: apa-apa
    /// ralat memulangkan semua <c>false</c> (= tidak jelas = transient).
    /// </summary>
    public async Task<IdMeLoginSafety.AmatanMasuk> AmatiHalamanMasuk()
    {
        var json = await EvalStringAsync(
            "(function(){" +
            "function nampak(sel){var ls=document.querySelectorAll(sel);for(var i=0;i<ls.length;i++){var el=ls[i];if(!el.disabled&&el.offsetParent!==null)return true;}return false;}" +
            "return JSON.stringify({" +
            "ic:nampak('input[placeholder*=\"KAD PENGENALAN\" i],input[placeholder*=\"pengenalan\" i],input[name*=\"pengenalan\" i],input[name*=\"ic\" i],input[name=\"username\"]')," +
            "kataLaluan:nampak('input[type=\"password\"]')," +
            "teks:nampak('input[type=\"text\"]')," +
            "aplikasi:!!document.querySelector('a[href*=\"list_aplikasi\"]')" +
            "});})()");

        if (string.IsNullOrEmpty(json)) return new IdMeLoginSafety.AmatanMasuk();
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Object) return new IdMeLoginSafety.AmatanMasuk();
            return new IdMeLoginSafety.AmatanMasuk(
                Benar(doc.RootElement, "ic"),
                Benar(doc.RootElement, "kataLaluan"),
                Benar(doc.RootElement, "teks"),
                Benar(doc.RootElement, "aplikasi"));
        }
        catch
        {
            return new IdMeLoginSafety.AmatanMasuk();
        }
    }

    private static bool Benar(JsonElement objek, string nama) =>
        objek.TryGetProperty(nama, out var v) && v.ValueKind == JsonValueKind.True;

    public async Task<KeputusanDom> IsiPenggunaIdMe(string pengguna)
    {
        var nilai = JsonSerializer.Serialize(pengguna);
        var ok = await EvalBoolAsync(
            "(function(){" +
            "var sels=['input[placeholder*=\"KAD PENGENALAN\" i]','input[placeholder*=\"pengenalan\" i]','input[name*=\"pengenalan\" i]','input[name*=\"ic\" i]','input[name=\"username\"]','input[type=\"text\"]'];" +
            "for(var i=0;i<sels.length;i++){var el=document.querySelector(sels[i]);if(el&&!el.disabled&&el.offsetParent!==null){el.value=" + nilai + ";el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true;}}" +
            "return false;})()");
        return ok
            ? new KeputusanDom(true)
            : new KeputusanDom(false, "Medan IC (KAD PENGENALAN) tidak muncul pada halaman log masuk idMe.");
    }

    public async Task<KeputusanDom> LanjutkanPengesahan()
    {
        var diklik = await EvalBoolAsync(
            "(function(){" +
            "var bts=['Seterusnya','Teruskan','Continue','Next'];" +
            "var cand=Array.from(document.querySelectorAll('button, input[type=submit]'));" +
            "for(var i=0;i<cand.length;i++){var b=cand[i];if(b.disabled||b.offsetParent===null)continue;var t=(b.innerText||b.value||'').trim();for(var j=0;j<bts.length;j++){if(t.indexOf(bts[j])>=0){b.click();return true;}}}" +
            "for(var k=0;k<cand.length;k++){var b2=cand[k];if(!b2.disabled&&b2.offsetParent!==null&&b2.type==='submit'){b2.click();return true;}}" +
            "return false;})()");
        if (!diklik)
        {
            return new KeputusanDom(false, "Butang lanjut/seterusnya tidak muncul pada halaman IC idMe.");
        }

        // Poll until the /loginverification page (or phrase/checkbox) appears.
        var mula = Environment.TickCount64;
        while (Environment.TickCount64 - mula < _masaSediaMs)
        {
            var jumpa = await EvalBoolAsync(
                "/\\/loginverification/i.test(location.pathname)||!!document.querySelector('input[type=checkbox]')||/kata kunci keselamatan/i.test(document.body?(document.body.textContent||''):'')");
            if (jumpa) return new KeputusanDom(true);
            await Delay(_jedaPollMs);
        }
        return new KeputusanDom(false, "Halaman pengesahan idMe tidak muncul selepas mengisi IC.");
    }

    public async Task<string?> BacaKunciKeselamatan()
    {
        var mula = Environment.TickCount64;
        while (Environment.TickCount64 - mula < _masaSediaMs)
        {
            var frasa = await EvalStringAsync(
                "(function(){" +
                "var petunjuk=/kunci keselamatan|security phrase|security key|frasa keselamatan/i;" +
                "var kotak=document.querySelector('.security-phrase, .kunci-keselamatan, .kata-kunci-box');" +
                "if(kotak){var t=(kotak.textContent||'').trim();if(t&&!petunjuk.test(t))return t;}" +
                "var calon=Array.from(document.querySelectorAll('body *')).filter(function(el){var t=(el.textContent||'').trim();return el.children.length===0&&t.length>0&&t.length<=80&&petunjuk.test(t);});" +
                "for(var i=0;i<calon.length;i++){var label=calon[i];var kf=label.nextElementSibling;if(!kf||kf.tagName==='INPUT'||kf.tagName==='LABEL')continue;var tf=(kf.textContent||'').trim();if(tf&&!petunjuk.test(tf))return tf;}" +
                "return null;})()");
            if (frasa != null) return frasa;
            await Delay(_jedaPollMs);
        }
        return null;
    }

    public Task<bool> TandakanKunciKeselamatan() => EvalBoolAsync(
        "(function(){" +
        "var sels=['input#check_log[type=\"checkbox\"]','input[name=\"check\"][type=\"checkbox\"]'];" +
        "var kotak=null;for(var i=0;i<sels.length;i++){var c=document.querySelector(sels[i]);if(c){kotak=c;break;}}" +
        "if(!kotak){var lbl=Array.from(document.querySelectorAll('label')).find(function(l){return /kata kunci keselamatan/i.test(l.textContent||'');});if(lbl){kotak=lbl.querySelector('input[type=checkbox]')||(lbl.htmlFor&&document.getElementById(lbl.htmlFor))||(lbl.closest('div')&&lbl.closest('div').querySelector('input[type=checkbox]'));}}" +
        "if(!kotak)return false;" +
        "if(!kotak.checked){kotak.click();}" +
        "var pwd=document.querySelector('input[type=password]');" +
        "return !!(pwd&&!pwd.disabled&&pwd.offsetParent!==null);})()");

    public async Task<KeputusanDom> IsiKataLaluanIdMe(string kataLaluan)
    {
        var nilai = JsonSerializer.Serialize(kataLaluan);
        var ok = await EvalBoolAsync(
            "(function(){" +
            "var sels=['input[type=\"password\"]','input[name*=\"kata\" i]','input[name=\"password\"]'];" +
            "for(var i=0;i<sels.length;i++){var el=document.querySelector(sels[i]);if(el&&!el.disabled&&el.offsetParent!==null){el.value=" + nilai + ";el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true;}}" +
            "return false;})()");
        return ok
            ? new KeputusanDom(true)
            : new KeputusanDom(false, "Medan kata laluan tidak muncul pada halaman pengesahan idMe.");
    }

    public Task<KeputusanDom> HantarBorangLogMasuk() => EvalBoolThenAsync(
        "(function(){" +
        "var cand=Array.from(document.querySelectorAll('button, input[type=submit]'));" +
        "for(var i=0;i<cand.length;i++){var b=cand[i];if(b.disabled||b.offsetParent===null)continue;var t=(b.innerText||b.value||'').trim();if(/Daftar Masuk|btn-login/i.test(t)||b.type==='submit'||b.classList.contains('btn-login')){b.click();return true;}}" +
        "return false;})()",
        "Tiada butang \"Daftar Masuk\" yang aktif dan kelihatan pada halaman pengesahan idMe.");

    private async Task<KeputusanDom> EvalBoolThenAsync(string js, string sebabGagal)
    {
        var ok = await EvalBoolAsync(js);
        return ok ? new KeputusanDom(true) : new KeputusanDom(false, sebabGagal);
    }

    /// <summary>
    /// Classify the page the browser is ALREADY on. This deliberately does NOT
    /// navigate anywhere.
    ///
    /// It used to navigate straight to <see cref="IdMeLoginEndpoints.KehadiranUrl"/>
    /// — that was the BLOCKING BUG (live, 2026-09-23): idMe accepted the
    /// credential, but MOEIS had no session of its own yet, so the attendance URL
    /// redirected to <c>idme.moe.gov.my/login</c> and the app re-logged-in
    /// forever. The idMe -> MOEIS SSO handoff ("pilih aplikasi") is now an
    /// explicit step in <see cref="IdMeLoginFlow"/>, and this method's only job is
    /// to answer honestly about where we actually are.
    /// </summary>
    public async Task<IdMeLoginSafety.KeputusanSelepasHantar> SahkanSesiSelepasLogin()
    {
        // Give the post-submit navigation time to land, then poll until the page
        // is DECISIVE (session valid / credential explicitly rejected). An
        // indecisive page after the deadline stays indecisive — reported as-is,
        // never upgraded to "valid".
        await Delay(_masaMuatMs);

        var mula = Environment.TickCount64;
        IdMeLoginSafety.KeputusanSelepasHantar akhir;
        while (true)
        {
            akhir = await AmatiSesiAsync();
            if (akhir.Status != "sesi-tamat") return akhir;
            if (Environment.TickCount64 - mula >= _masaSediaMs) return akhir;
            await Delay(_jedaPollMs);
        }
    }

    /// <summary>
    /// SSO handoff, part 1: open idMe's application list and read its anchors.
    /// NAVIGATION only — nothing is typed, clicked or submitted. Selectors are
    /// taken from the companion's live-used <c>aplikasi.mjs</c>; the real
    /// <c>list_aplikasi</c> DOM is BELUM DISAHKAN HIDUP from this app.
    /// </summary>
    public async Task<IReadOnlyList<PautanAplikasi>> SenaraiAplikasiIdMe()
    {
        await NavigateAsync(AplikasiIdMe.UrlSenaraiAplikasi);

        // `a.href` (the resolved property, not the raw attribute) so a relative
        // href is absolutised by the browser BEFORE the host allowlist decides.
        const string js =
            "(function(){return JSON.stringify(Array.from(document.querySelectorAll('a')).map(function(a){" +
            "return {teks:(a.innerText||a.textContent||'').replace(/\\s+/g,' ').trim(),href:a.href||''};}).slice(0,400));})()";

        var mula = Environment.TickCount64;
        IReadOnlyList<PautanAplikasi> senarai;
        while (true)
        {
            senarai = AplikasiIdMe.HuraiSenarai(await EvalStringAsync(js));
            // Stop as soon as a usable MOEIS link exists — the dashboard shell can
            // render its anchors before the application tiles arrive.
            if (AplikasiIdMe.PilihPautanAplikasiMoeis(senarai) != null) return senarai;
            if (Environment.TickCount64 - mula >= _masaSediaMs) return senarai;
            await Delay(_jedaPollMs);
        }
    }

    /// <summary>
    /// SSO handoff, part 2: ikut pautan aplikasi MOEIS SEKALI, beri masa
    /// rantaian pengalihan mereda, kemudian navigasi TERUS ke halaman kehadiran
    /// dan sahkan di situ. NAVIGASI sahaja. Href disahkan semula di sini supaya
    /// kaedah ini tidak pernah bergantung pada pemanggilnya sudah berbuat
    /// demikian.
    ///
    /// <para>PEPIJAT BLOK (hidup, 23/09/2026): titik akhir SSO MOEIS membalas
    /// <c>302</c> ke <c>http://moeispel.moe.gov.my/</c> — HTTP tidak selamat —
    /// dan pagar navigasi menyekatnya. Pagar itu BETUL dan kekal. Versi lama
    /// mensyaratkan tetingkap utama berada pada hos MOEIS sejurus selepas
    /// mengikut pautan, jadi sekatan yang betul itu dilaporkan sebagai handoff
    /// gagal. Kini keputusan bergantung pada SESI (halaman kehadiran boleh
    /// dibuka pada hos MOEIS), bukan pada URL penghubung — lihat
    /// <see cref="AplikasiIdMe.HandoffBerjaya"/>.</para>
    /// </summary>
    public async Task<KeputusanHandoff> IkutPautanAplikasiMoeis(string href)
    {
        if (!AplikasiIdMe.PautanMoeisSah(href))
        {
            return new KeputusanHandoff(false, "",
                "Pautan aplikasi bukan HTTPS " + IdMeLoginSafety.HOS_MOEIS_SAH + " tepat; tiada navigasi dilakukan.");
        }

        // SEKALI sahaja: token SSO (`token_idms=`) adalah sekali guna, dan kuki
        // sesi MOEIS sudah ditetapkan oleh respons HTTPS yang pertama.
        await NavigateAsync(href);
        var hosPenghubung = HosDari(await UrlHalaman());

        // Tunggu sekejap supaya rantaian pengalihan (termasuk lompatan HTTP yang
        // disekat pagar) selesai sebelum navigasi seterusnya.
        await Delay(_masaMuatMs);

        // Sesi, bukan URL penghubung, yang menentukan.
        await NavigateAsync(IdMeLoginEndpoints.KehadiranUrl);
        var hosKehadiran = await TungguHosAsync(IdMeLoginSafety.HOS_MOEIS_SAH);

        if (!AplikasiIdMe.HandoffBerjaya(hosPenghubung, hosKehadiran))
        {
            return new KeputusanHandoff(false, hosKehadiran,
                "Halaman kehadiran MOEIS melencong keluar ke " + (hosKehadiran.Length > 0 ? hosKehadiran : "(tiada)") +
                " selepas aplikasi MOEIS dilancarkan dari portal idMe — sesi MOEIS tidak terbentuk.");
        }

        return new KeputusanHandoff(true, hosKehadiran);
    }

    /// <summary>Poll the current host until it matches, bounded. Returns the LAST host seen.</summary>
    private async Task<string> TungguHosAsync(string hosDijangka)
    {
        var mula = Environment.TickCount64;
        var hos = "";
        while (true)
        {
            hos = HosDari(await UrlHalaman());
            if (hos == hosDijangka) return hos;
            if (Environment.TickCount64 - mula >= _masaSediaMs) return hos;
            await Delay(_jedaPollMs);
        }
    }

    private static string HosDari(string? url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var u) ? u.Host.ToLowerInvariant() : "";

    private async Task<IdMeLoginSafety.KeputusanSelepasHantar> AmatiSesiAsync()
    {
        var amatanJson = await EvalStringAsync(
            "(function(){" +
            "var borangLogin=!!(document.querySelector('#check_log')||document.querySelector('#password')||document.querySelector('input[type=password], input[name*=\"kata\" i], input[name*=pass i], input[placeholder*=\"KAD PENGENALAN\" i], input[name*=\"pengenalan\" i]'));" +
            "var teksBadan=(document.body&&document.body.innerText)||'';" +
            "var dashboardIdMe=!!(document.querySelector('a[href*=\"list_aplikasi\"]')||document.querySelector('.breadcrumb, [class*=\"breadcrumb\"]')||/\\b(Aplikasi|Laporan|Dashboard|Pengurusan)\\b/i.test(teksBadan));" +
            "var kredensialDitolak=borangLogin&&new RegExp(" + JsonSerializer.Serialize(IdMeLoginSafety.REGEX_PENOLAKAN_KREDENSIAL) + ",'i').test(teksBadan);" +
            "return JSON.stringify({borangLogin:borangLogin,dashboardIdMe:dashboardIdMe,kredensialDitolak:kredensialDitolak,adaKehadiran:!!document.querySelector('#kehadiran')});})()");

        var hos = HosDari(await UrlHalaman());

        var borangLogin = false;
        var dashboardIdMe = false;
        var kredensialDitolak = false;
        var adaKehadiran = false;
        if (!string.IsNullOrEmpty(amatanJson))
        {
            try
            {
                using var doc = JsonDocument.Parse(amatanJson);
                if (doc.RootElement.ValueKind == JsonValueKind.Object)
                {
                    borangLogin = doc.RootElement.TryGetProperty("borangLogin", out var a) && a.ValueKind == JsonValueKind.True;
                    dashboardIdMe = doc.RootElement.TryGetProperty("dashboardIdMe", out var b) && b.ValueKind == JsonValueKind.True;
                    kredensialDitolak = doc.RootElement.TryGetProperty("kredensialDitolak", out var c) && c.ValueKind == JsonValueKind.True;
                    adaKehadiran = doc.RootElement.TryGetProperty("adaKehadiran", out var d) && d.ValueKind == JsonValueKind.True;
                }
            }
            catch { /* fail-closed: all false */ }
        }

        return IdMeLoginSafety.TentukanStatusSelepasHantar(hos, borangLogin, dashboardIdMe, adaKehadiran, kredensialDitolak);
    }
}
