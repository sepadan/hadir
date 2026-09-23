namespace HadirDesktop;

/// <summary>
/// Self-contained, embedded offline page shown INSIDE the WebView2 when the
/// local settings engine (companion, loopback 127.0.0.1:8747) is not running.
/// Rendered via <c>CoreWebView2.NavigateToString</c> so it can never open an
/// OS browser window and never fetches an external asset. It contains no
/// http(s) URL, no anchor, no <c>target="_blank"</c>, no script and no form —
/// it cannot navigate the WebView away, and it cannot launch Edge. Pure string
/// builder, fully unit-testable.
/// </summary>
public static class EngineSettingsOfflinePage
{
    /// <summary>Title marker so tests (and humans) can recognise this page.</summary>
    public const string Tajuk = "Tetapan tempatan tidak tersedia";

    public static string Html(string sebab)
    {
        var sebabSelamat = EscapeHtml(sebab ?? string.Empty);
        return "<!doctype html><html lang=\"ms\"><head><meta charset=\"utf-8\">" +
               "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
               "<title>" + Tajuk + "</title>" +
               "<style>" +
               "body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;" +
               "background:#eef5fa;color:#14213d;font:16px/1.55 system-ui,sans-serif;text-align:center}" +
               "main{max-width:440px;background:#fff;padding:34px 28px;border-radius:26px;" +
               "box-shadow:0 18px 50px #16334f24}" +
               "h1{font-size:1.4rem;margin:0 0 10px}" +
               "p{color:#64748b;margin:0 0 14px}" +
               "code{background:#eef2f7;border-radius:6px;padding:2px 8px;font-size:.92em}" +
               "</style></head><body><main>" +
               "<h1>" + Tajuk + "</h1>" +
               "<p>Enjin tetapan tempatan (Companion HADIR) tidak berjalan pada <code>127.0.0.1:8747</code>.</p>" +
               "<p>Mulakan Companion HADIR, kemudian pilih semula <strong>Tetapan Tempatan</strong> dari menu dulang.</p>" +
               "<p>" + sebabSelamat + "</p>" +
               "</main></body></html>";
    }

    /// <summary>
    /// Minimal HTML-escaping for &amp; &lt; &gt; &quot; — enough to keep the
    /// engine's reason text inert (it may contain arbitrary characters).
    /// </summary>
    public static string EscapeHtml(string s) =>
        s.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace("\"", "&quot;");
}
