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
            var raw = await wv.ExecuteScriptAsync(
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

    public async Task<IdMeLoginSafety.KeputusanSelepasHantar> SahkanSesiSelepasLogin()
    {
        await NavigateAsync(IdMeLoginEndpoints.KehadiranUrl);

        var amatanJson = await EvalStringAsync(
            "(function(){" +
            "var borangLogin=!!(document.querySelector('#check_log')||document.querySelector('#password')||document.querySelector('input[type=password], input[name*=\"kata\" i], input[name*=pass i], input[placeholder*=\"KAD PENGENALAN\" i], input[name*=\"pengenalan\" i]'));" +
            "var teksBadan=(document.body&&document.body.innerText)||'';" +
            "var dashboardIdMe=!!(document.querySelector('a[href*=\"list_aplikasi\"]')||document.querySelector('.breadcrumb, [class*=\"breadcrumb\"]')||/\\b(Aplikasi|Laporan|Dashboard|Pengurusan)\\b/i.test(teksBadan));" +
            "var kredensialDitolak=borangLogin&&new RegExp(" + JsonSerializer.Serialize(IdMeLoginSafety.REGEX_PENOLAKAN_KREDENSIAL) + ",'i').test(teksBadan);" +
            "return JSON.stringify({borangLogin:borangLogin,dashboardIdMe:dashboardIdMe,kredensialDitolak:kredensialDitolak,adaKehadiran:!!document.querySelector('#kehadiran')});})()");

        var hos = "";
        var urlAkhir = await UrlHalaman();
        if (Uri.TryCreate(urlAkhir, UriKind.Absolute, out var u)) hos = u.Host.ToLowerInvariant();

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
