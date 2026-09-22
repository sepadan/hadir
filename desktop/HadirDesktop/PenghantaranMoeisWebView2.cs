using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Web.WebView2.Core;

namespace HadirDesktop;

/// <summary>
/// The MOEIS attendance selectors, in ONE place, copied verbatim from
/// <c>companion/src/moeis/adaptorPlaywright.mjs</c> — plus the pure JavaScript
/// builders the WebView2 adapter feeds to <c>ExecuteScriptAsync</c>.
///
/// Kept pure and separate so the selectors can be asserted by unit tests without
/// a browser: a typo here is a silent no-op against the real portal, which is
/// exactly the class of bug tests must catch.
///
/// NOTE on <c>:visible</c>: <c>.sweet-alert:visible button.simpan</c> is a
/// jQuery/Playwright pseudo-class and is NOT valid for
/// <c>document.querySelector</c>. The scripts below reproduce it explicitly
/// (skip dialogs whose <c>offsetParent</c> is null or whose computed display is
/// none) rather than silently clicking a hidden dialog's button.
/// </summary>
public static class SkripMoeis
{
    public const string SelektorTabHarian = "a[data-target=\"#kehadiranharian\"]";
    public const string SelektorSenaraiMurid = "#kehadiran input.case-hadir";
    public const string SelektorKemaskini = "#kemaskiniKehadiran";
    public const string SelektorTarikh = "#tkh_HH";
    public const string SelektorSelSebab = "td.sebabthadir";
    public const string SelektorKategori = ".selectkategori";
    public const string SelektorSebab = ".selectsebab";
    public const string SelektorDialog = ".sweet-alert";
    public const string SelektorSimpan = ".sweet-alert:visible button.simpan";
    public const string SelektorSimpanSahkan = ".sweet-alert:visible button.simpansah";
    public const string SelektorTajukDialog = ".sweet-alert h2";
    public const string TeksBerjaya = "Berjaya.";

    /// <summary>
    /// MOEIS student ids are opaque tokens from <c>data-idpelajar</c>. Anything
    /// outside this set would have to be spliced into a CSS attribute selector,
    /// so it is refused instead of being escaped-and-hoped.
    /// </summary>
    public static bool IdSelamat(string? id)
    {
        if (string.IsNullOrEmpty(id)) return false;
        foreach (var c in id!)
        {
            var ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '_';
            if (!ok) return false;
        }
        return true;
    }

    /// <summary>The per-student checkbox selector: <c>#kehadiran input.case-hadir[data-idpelajar="ID"]</c>.</summary>
    public static string SelektorMurid(string id) =>
        SelektorSenaraiMurid + "[data-idpelajar=\"" + id + "\"]";

    private static string Lit(string s) => JsonSerializer.Serialize(s);

    /// <summary>JS that resolves a student's row <c>td.sebabthadir</c> into <c>td</c>.</summary>
    private static string JsSelSebab(string id) =>
        "var cb=document.querySelector(" + Lit(SelektorMurid(id)) + ");" +
        "var tr=cb&&cb.closest('tr');" +
        "var td=tr&&tr.querySelector(" + Lit(SelektorSelSebab) + ");";

    public static string KlikTabHarian() =>
        "(function(){var a=document.querySelector(" + Lit(SelektorTabHarian) + ");if(!a)return false;a.click();return true;})()";

    public static string KemaskiniKelihatan() =>
        "(function(){var el=document.querySelector(" + Lit(SelektorKemaskini) + ");" +
        "return !!(el&&el.offsetParent!==null);})()";

    public static string BacaTarikh() =>
        "(function(){var el=document.querySelector(" + Lit(SelektorTarikh) + ");return el?String(el.value||''):null;})()";

    public static string TetapkanTarikh(string paparan) =>
        "(function(){var el=document.querySelector(" + Lit(SelektorTarikh) + ");if(!el)return false;" +
        "el.value=" + Lit(paparan) + ";" +
        "el.dispatchEvent(new Event('input',{bubbles:true}));" +
        "el.dispatchEvent(new Event('change',{bubbles:true}));" +
        "if(window.jQuery)window.jQuery(el).trigger('change');return true;})()";

    /// <summary>Read a <c>&lt;select&gt;</c>'s options as JSON — matching happens in C#.</summary>
    public static string BacaPilihan(string selektor) =>
        "(function(){var el=document.querySelector(" + Lit(selektor) + ");if(!el||!el.options)return null;" +
        "return JSON.stringify(Array.prototype.map.call(el.options,function(o){" +
        "return {nilai:String(o.value||''),teks:String(o.textContent||'').trim()};}));})()";

    public static string TetapkanPilihan(string selektor, string nilai) =>
        "(function(){var el=document.querySelector(" + Lit(selektor) + ");if(!el)return false;" +
        "el.value=" + Lit(nilai) + ";if(String(el.value)!==" + Lit(nilai) + ")return false;" +
        "el.dispatchEvent(new Event('change',{bubbles:true}));" +
        "if(window.jQuery)window.jQuery(el).trigger('change');return true;})()";

    public static string BacaSenaraiMurid() =>
        "(function(){return JSON.stringify(Array.prototype.map.call(" +
        "document.querySelectorAll(" + Lit(SelektorSenaraiMurid) + ")," +
        "function(cb){return {id:String(cb.getAttribute('data-idpelajar')||''),nama:String(cb.getAttribute('data-namapelajar')||''),hadir:!!cb.checked};}));})()";

    /// <summary>
    /// Click the student's checkbox so the row becomes ABSENT. Idempotent by
    /// design: a student MOEIS already shows as absent is never clicked again
    /// (the flow skips them, and this script refuses to toggle an unticked box).
    /// </summary>
    public static string TandaTidakHadir(string id) =>
        "(function(){var cb=document.querySelector(" + Lit(SelektorMurid(id)) + ");if(!cb)return false;" +
        "if(!cb.checked)return true;cb.click();return !cb.checked;})()";

    public static string PemilihSebabAda(string id) =>
        "(function(){" + JsSelSebab(id) +
        "return !!(td&&td.querySelector(" + Lit(SelektorKategori) + "));})()";

    public static string BacaPilihanBaris(string id, string selektorDalamBaris) =>
        "(function(){" + JsSelSebab(id) +
        "var el=td&&td.querySelector(" + Lit(selektorDalamBaris) + ");if(!el||!el.options)return null;" +
        "return JSON.stringify(Array.prototype.map.call(el.options,function(o){" +
        "return {nilai:String(o.value||''),teks:String(o.textContent||'').trim()};}));})()";

    public static string TetapkanPilihanBaris(string id, string selektorDalamBaris, string nilai) =>
        "(function(){" + JsSelSebab(id) +
        "var el=td&&td.querySelector(" + Lit(selektorDalamBaris) + ");if(!el)return false;" +
        "el.value=" + Lit(nilai) + ";if(String(el.value)!==" + Lit(nilai) + ")return false;" +
        "el.dispatchEvent(new Event('change',{bubbles:true}));" +
        "if(window.jQuery)window.jQuery(el).trigger('change');return true;})()";

    public static string BacaSebabMurid(string id) =>
        "(function(){" + JsSelSebab(id) + "if(!td)return null;" +
        "var elK=td.querySelector(" + Lit(SelektorKategori) + ");" +
        "var elS=td.querySelector(" + Lit(SelektorSebab) + ");" +
        "function pilih(el){if(!el||!el.options)return {nilai:'',teks:''};" +
        "var o=Array.prototype.filter.call(el.options,function(x){return x.value===el.value;})[0];" +
        "return o?{nilai:String(o.value||''),teks:String(o.textContent||'').trim()}:{nilai:'',teks:''};}" +
        "var k=pilih(elK);var s=pilih(elS);" +
        "return JSON.stringify({kategoriNilai:k.nilai,kategoriTeks:k.teks,sebabNilai:s.nilai,sebabTeks:s.teks});})()";

    public static string TekanKemaskini() =>
        "(function(){var el=document.querySelector(" + Lit(SelektorKemaskini) + ");if(!el)return false;el.click();return true;})()";

    /// <summary>Explicit <c>:visible</c> emulation over <c>.sweet-alert</c>.</summary>
    private static string JsDialogKelihatan =>
        "function kelihatan(el){if(!el)return false;if(el.offsetParent===null)return false;" +
        "var g=window.getComputedStyle?window.getComputedStyle(el):null;" +
        "if(g&&(g.display==='none'||g.visibility==='hidden'))return false;return true;}" +
        "var dialog=Array.prototype.filter.call(document.querySelectorAll(" + Lit(SelektorDialog) + "),kelihatan);";

    public static string DialogSimpanKelihatan() =>
        "(function(){" + JsDialogKelihatan +
        "for(var i=0;i<dialog.length;i++){if(dialog[i].querySelector('button.simpan'))return true;}return false;})()";

    public static string KlikButangDialog(string kelasButang) =>
        "(function(){" + JsDialogKelihatan +
        "for(var i=0;i<dialog.length;i++){var b=dialog[i].querySelector('button." + kelasButang + "');" +
        "if(b&&!b.disabled){b.click();return true;}}return false;})()";

    public static string DialogBerjayaKelihatan() =>
        "(function(){var h=document.querySelectorAll(" + Lit(SelektorTajukDialog) + ");" +
        "for(var i=0;i<h.length;i++){if(String(h[i].textContent||'').trim()===" + Lit(TeksBerjaya) + ")return true;}" +
        "return false;})()";
}

/// <summary>
/// Production <see cref="IDomMoeis"/> over the embedded WebView2, driven by
/// <c>CoreWebView2.ExecuteScriptAsync</c> — the same pattern as
/// <see cref="WebView2IdMeLoginDom"/>. It holds NO policy: every decision about
/// what to mark and whether a submission is proven lives in
/// <see cref="PenghantaranMoeisFlow"/>.
///
/// NOT verified against the live MOEIS portal (same posture as the companion's
/// "BELUM disahkan hidup"): live verification is an owner-attended step.
/// </summary>
public sealed class WebView2DomMoeis : IDomMoeis
{
    private readonly Func<CoreWebView2?> _getWebView;
    private readonly int _masaSediaMs;
    private readonly int _jedaPollMs;
    private readonly int _masaMuatMs;
    private readonly int _jedaSelepasPilihMs;

    public WebView2DomMoeis(
        Func<CoreWebView2?> getWebView,
        int masaSediaMs = 15000,
        int jedaPollMs = 250,
        int masaMuatMs = 4000,
        int jedaSelepasPilihMs = 2500)
    {
        _getWebView = getWebView;
        _masaSediaMs = masaSediaMs;
        _jedaPollMs = jedaPollMs;
        _masaMuatMs = masaMuatMs;
        _jedaSelepasPilihMs = jedaSelepasPilihMs;
    }

    private static async Task Delay(int ms)
    {
        try { await Task.Delay(ms); } catch (OperationCanceledException) { }
    }

    private async Task<string?> EvalRawAsync(string js)
    {
        var wv = _getWebView();
        if (wv == null) return null;
        try
        {
            var raw = await wv.ExecuteScriptAsync(js);
            if (string.IsNullOrEmpty(raw) || raw == "null" || raw == "undefined") return null;
            return raw;
        }
        catch
        {
            return null;
        }
    }

    private async Task<bool> EvalBoolAsync(string js) => await EvalRawAsync(js) == "true";

    private async Task<string?> EvalStringAsync(string js)
    {
        var raw = await EvalRawAsync(js);
        if (raw == null) return null;
        try { return JsonSerializer.Deserialize<string>(raw); } catch { return null; }
    }

    /// <summary>Poll a boolean script until true or the readiness budget runs out.</summary>
    private async Task<bool> TungguBenarAsync(string js)
    {
        var mula = Environment.TickCount64;
        while (true)
        {
            if (await EvalBoolAsync(js)) return true;
            if (Environment.TickCount64 - mula >= _masaSediaMs) return false;
            await Delay(_jedaPollMs);
        }
    }

    private async Task<IReadOnlyList<PilihanDropdown>> BacaPilihanAsync(string js)
    {
        var json = await EvalStringAsync(js);
        if (string.IsNullOrEmpty(json)) return Array.Empty<PilihanDropdown>();
        var senarai = new List<PilihanDropdown>();
        try
        {
            using var doc = JsonDocument.Parse(json!);
            if (doc.RootElement.ValueKind != JsonValueKind.Array) return Array.Empty<PilihanDropdown>();
            foreach (var e in doc.RootElement.EnumerateArray())
            {
                if (e.ValueKind != JsonValueKind.Object) continue;
                var nilai = e.TryGetProperty("nilai", out var n) && n.ValueKind == JsonValueKind.String ? n.GetString() ?? "" : "";
                var teks = e.TryGetProperty("teks", out var t) && t.ValueKind == JsonValueKind.String ? t.GetString() ?? "" : "";
                senarai.Add(new PilihanDropdown(nilai, teks));
            }
        }
        catch
        {
            return Array.Empty<PilihanDropdown>();
        }
        return senarai;
    }

    public async Task NavigasiHarian()
    {
        var wv = _getWebView();
        try { wv?.Navigate(IdMeLoginEndpoints.KehadiranUrl); } catch { /* transient navigation failure */ }
        await Delay(_masaMuatMs);
    }

    public Task<bool> KlikTabHarian() => EvalBoolAsync(SkripMoeis.KlikTabHarian());

    public Task<bool> TungguKemaskiniKelihatan() => TungguBenarAsync(SkripMoeis.KemaskiniKelihatan());

    public Task<string?> BacaTarikhInput() => EvalStringAsync(SkripMoeis.BacaTarikh());

    public async Task TetapkanTarikhInput(string paparanDdMmYyyy)
    {
        await EvalBoolAsync(SkripMoeis.TetapkanTarikh(paparanDdMmYyyy));
        // MOEIS reloads the table on a date change; give it the same settle time
        // the companion adapter allows.
        await Delay(_masaMuatMs);
    }

    public Task<IReadOnlyList<PilihanDropdown>> BacaPilihanDropdown(string selektor) =>
        BacaPilihanAsync(SkripMoeis.BacaPilihan(selektor));

    public async Task<bool> PilihNilaiDropdown(string selektor, string nilai)
    {
        var ok = await EvalBoolAsync(SkripMoeis.TetapkanPilihan(selektor, nilai));
        if (ok) await Delay(_masaMuatMs);
        return ok;
    }

    public async Task<IReadOnlyList<BarisMurid>> BacaSenaraiMurid()
    {
        var json = await EvalStringAsync(SkripMoeis.BacaSenaraiMurid());
        if (string.IsNullOrEmpty(json)) return Array.Empty<BarisMurid>();
        var senarai = new List<BarisMurid>();
        try
        {
            using var doc = JsonDocument.Parse(json!);
            if (doc.RootElement.ValueKind != JsonValueKind.Array) return Array.Empty<BarisMurid>();
            foreach (var e in doc.RootElement.EnumerateArray())
            {
                if (e.ValueKind != JsonValueKind.Object) continue;
                var id = e.TryGetProperty("id", out var i) && i.ValueKind == JsonValueKind.String ? i.GetString() ?? "" : "";
                var nama = e.TryGetProperty("nama", out var n) && n.ValueKind == JsonValueKind.String ? n.GetString() ?? "" : "";
                var hadir = e.TryGetProperty("hadir", out var h) && h.ValueKind == JsonValueKind.True;
                if (id.Length > 0) senarai.Add(new BarisMurid(id, nama, hadir));
            }
        }
        catch
        {
            return Array.Empty<BarisMurid>();
        }
        return senarai;
    }

    public Task<bool> TandaTidakHadir(string id) =>
        SkripMoeis.IdSelamat(id)
            ? EvalBoolAsync(SkripMoeis.TandaTidakHadir(id))
            : Task.FromResult(false);

    public Task<bool> TungguPemilihSebab(string id) =>
        SkripMoeis.IdSelamat(id)
            ? TungguBenarAsync(SkripMoeis.PemilihSebabAda(id))
            : Task.FromResult(false);

    public Task<IReadOnlyList<PilihanDropdown>> BacaPilihanKategori(string id) =>
        SkripMoeis.IdSelamat(id)
            ? BacaPilihanAsync(SkripMoeis.BacaPilihanBaris(id, SkripMoeis.SelektorKategori))
            : Task.FromResult<IReadOnlyList<PilihanDropdown>>(Array.Empty<PilihanDropdown>());

    public async Task<bool> PilihKategori(string id, string nilai)
    {
        if (!SkripMoeis.IdSelamat(id)) return false;
        var ok = await EvalBoolAsync(SkripMoeis.TetapkanPilihanBaris(id, SkripMoeis.SelektorKategori, nilai));
        // MOEIS repopulates `.selectsebab` from the chosen category — wait before
        // reading the reason options (companion waits 2.5s here).
        if (ok) await Delay(_jedaSelepasPilihMs);
        return ok;
    }

    public Task<IReadOnlyList<PilihanDropdown>> BacaPilihanSebab(string id) =>
        SkripMoeis.IdSelamat(id)
            ? BacaPilihanAsync(SkripMoeis.BacaPilihanBaris(id, SkripMoeis.SelektorSebab))
            : Task.FromResult<IReadOnlyList<PilihanDropdown>>(Array.Empty<PilihanDropdown>());

    public Task<bool> PilihSebab(string id, string nilai) =>
        SkripMoeis.IdSelamat(id)
            ? EvalBoolAsync(SkripMoeis.TetapkanPilihanBaris(id, SkripMoeis.SelektorSebab, nilai))
            : Task.FromResult(false);

    public async Task<SebabMurid?> BacaSebabMurid(string id)
    {
        if (!SkripMoeis.IdSelamat(id)) return null;
        var json = await EvalStringAsync(SkripMoeis.BacaSebabMurid(id));
        if (string.IsNullOrEmpty(json)) return null;
        try
        {
            using var doc = JsonDocument.Parse(json!);
            if (doc.RootElement.ValueKind != JsonValueKind.Object) return null;
            string Ambil(string nama) =>
                doc.RootElement.TryGetProperty(nama, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
            return new SebabMurid(Ambil("kategoriNilai"), Ambil("kategoriTeks"), Ambil("sebabNilai"), Ambil("sebabTeks"));
        }
        catch
        {
            return null;
        }
    }

    public async Task TekanKemaskini()
    {
        await EvalBoolAsync(SkripMoeis.TekanKemaskini());
        await Delay(_masaMuatMs);
    }

    public Task<bool> DialogSimpanKelihatan() => TungguBenarAsync(SkripMoeis.DialogSimpanKelihatan());

    public Task<bool> KlikSimpan() => EvalBoolAsync(SkripMoeis.KlikButangDialog("simpan"));

    public Task<bool> KlikSimpanSahkan() => EvalBoolAsync(SkripMoeis.KlikButangDialog("simpansah"));

    public Task<bool> DialogBerjayaKelihatan() => TungguBenarAsync(SkripMoeis.DialogBerjayaKelihatan());

    public async Task MuatSemula()
    {
        var wv = _getWebView();
        try { wv?.Reload(); } catch { /* transient reload failure */ }
        await Delay(_masaMuatMs);
    }
}

/// <summary>
/// Convenience composition for the app: the pure flow over the live WebView2
/// DOM. Nothing constructs this automatically — the adapter runs only when a
/// caller hands it a task (feature stays default OFF).
/// </summary>
public sealed class PenghantaranMoeisWebView2 : IPenghantaranMoeis
{
    private readonly PenghantaranMoeis _teras;

    public PenghantaranMoeisWebView2(Func<CoreWebView2?> getWebView)
        : this(new WebView2DomMoeis(getWebView))
    {
    }

    public PenghantaranMoeisWebView2(IDomMoeis dom)
    {
        _teras = new PenghantaranMoeis(dom);
    }

    public Task<HasilPenghantaran> HantarAsync(TugasanPenghantaran tugasan, CancellationToken ct = default)
        => _teras.HantarAsync(tugasan, ct);
}
