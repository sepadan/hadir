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
}
