using System;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;

namespace HadirDesktop;

/// <summary>
/// Injectable probe for the Evergreen WebView2 runtime. Production implementation
/// calls the SDK's availability API; tests inject a fake so no real runtime is
/// needed.
/// </summary>
public interface IWebView2RuntimeCheck
{
    /// <summary>Returns the installed browser version string, or null when absent.</summary>
    string? VersiTersedia();
}

/// <summary>
/// Production check: <c>CoreWebView2Environment.GetAvailableBrowserVersionString()</c>
/// returns the runtime version or throws when the Evergreen runtime is not
/// installed. Both cases collapse to null — a missing runtime is a warning, not
/// an error.
/// </summary>
public sealed class WebView2RuntimeCheck : IWebView2RuntimeCheck
{
    public string? VersiTersedia()
    {
        try
        {
            var versi = CoreWebView2Environment.GetAvailableBrowserVersionString();
            return string.IsNullOrWhiteSpace(versi) ? null : versi;
        }
        catch
        {
            return null;
        }
    }
}

/// <summary>
/// Startup guard: warns (MessageBox) when the Evergreen runtime is absent but
/// NEVER crashes the app — the tray/status/demand loop keep running even though
/// the embedded portal cannot render. The decision is a pure, testable method;
/// the MessageBox is the only UI touch and is swallowed on failure.
/// </summary>
public sealed class WebView2RuntimeGuard
{
    /// <summary>Official Evergreen runtime download link.</summary>
    public const string MuatTurunUrl = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";

    private readonly IWebView2RuntimeCheck _semak;
    private readonly Action<string> _tunjukAmaran;

    public WebView2RuntimeGuard(IWebView2RuntimeCheck semak, Action<string>? tunjukAmaran = null)
    {
        _semak = semak;
        _tunjukAmaran = tunjukAmaran ?? TunjukMessageBox;
    }

    /// <summary>
    /// Fail-closed: a missing OR misbehaving check (throws) both mean "no runtime".
    /// The guard is the app's defensive boundary and must never crash startup.
    /// </summary>
    public bool RuntimeAda()
    {
        try { return _semak.VersiTersedia() != null; }
        catch { return false; }
    }

    public string? VersiTersedia()
    {
        try { return _semak.VersiTersedia(); }
        catch { return null; }
    }

    /// <summary>User-facing instructions shown when the runtime is missing.</summary>
    public static string TeksAmaran =>
        "WebView2 Runtime (Microsoft Edge WebView2) tidak dijumpai pada PC ini.\n\n" +
        "Portal tertanam tidak akan dapat dipaparkan, tetapi aplikasi HADIR dan " +
        "dulang sistem terus berjalan seperti biasa.\n\n" +
        "Untuk memulihkan portal, muat turun dan pasang runtime daripada:\n" +
        MuatTurunUrl;

    /// <summary>Shows the warning once, only when the runtime is missing. Never throws.</summary>
    public void AmaranJikaTiada()
    {
        if (RuntimeAda()) return;
        _tunjukAmaran(TeksAmaran);
    }

    private static void TunjukMessageBox(string teks)
    {
        try
        {
            MessageBox.Show(teks, "HADIR Desktop", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
        catch
        {
            // Peringatan sahaja; tidak pernah gugurkan aplikasi.
        }
    }
}
