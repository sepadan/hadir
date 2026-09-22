namespace HadirDesktop;

/// <summary>
/// Loopback endpoint constants for the Node companion engine. The engine
/// listens on 127.0.0.1:8747 only. These are shared by the status source and
/// the "open settings" navigation so there is a single source of truth.
/// </summary>
public static class EngineEndpoints
{
    /// <summary>Loopback base URL of the local companion engine.</summary>
    public const string BaseUrl = "http://127.0.0.1:8747";

    /// <summary>Root path — the engine 302-redirects this to its local settings UI (nonce-bearing).</summary>
    public const string SettingsPath = "/";

    /// <summary>Read-only local status endpoint (requires X-HADIR-Lokal nonce + exact loopback Origin).</summary>
    public const string LokalStatusPath = "/api/lokal/status";

    /// <summary>
    /// Read-only list of HADIR MOEIS attendance jobs, nonce-only. It is a
    /// <c>/api/lokal/*</c> route (added for the trusted local desktop app), so
    /// it is authorised by the X-HADIR-Lokal nonce HEADER and carries no Origin.
    /// GET only — never mutates, never returns the engine secret.
    /// </summary>
    public const string KerjaPath = "/api/lokal/kerja-hari-ini";
}
