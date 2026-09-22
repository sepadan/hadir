namespace HadirDesktop;

/// <summary>
/// Central, pure constants for DEMO-mode labelling. Every user-visible surface
/// (window title, banner, status strip, fixture portal) must use these so the
/// app can never appear ambiguous about being a non-production demo.
/// </summary>
public static class DemoLabel
{
    public const string WindowTitle = "HADIR Desktop — MOD DEMO";
    public const string BannerText = "MOD DEMO — bukan sistem pengeluaran. Tiada tulisan MOEIS, tiada log masuk idMe sebenar.";
    public const string SimulatedSourceLabel = "simulasi";
    public const string RealSourceLabel = "enjin sebenar 127.0.0.1:8747";
    public const string FixturePortalTitle = "Portal Palsu (Fixture) — bukan idMe/MOEIS sebenar";
    public const string TrayBalloonTitle = "HADIR Desktop";
    public const string TrayBalloonText = "Masih berjalan dalam dulang sistem.";
    public const string TrayShow = "Tunjuk";
    public const string TrayOpenSettings = "Tetapan Tempatan";
    public const string TrayExit = "Keluar";

    /// <summary>Loopback URL of the engine's protected local settings UI (nonce-gated).</summary>
    public const string EngineSettingsUrl = EngineEndpoints.BaseUrl + EngineEndpoints.SettingsPath;

    /// <summary>Label shown when the dev/test debug transport is active (never in normal mode).</summary>
    public const string DevDebugBannerSuffix = " — MOD DEV-DEBUG (CDP loopback sahaja)";

    /// <summary>
    /// HADIR backend Apps Script Web App URL for the multi-PC device registry
    /// RPCs. Intentionally EMPTY: this repo is public (see CLAUDE.md) and no
    /// production URL is committed here. An empty URL makes every
    /// <see cref="DeviceRegistrationClient"/> call fail fast and locally
    /// (invalid URI) rather than silently pointing at a guessed endpoint —
    /// the probe panel then honestly reports "tiada sokongan pelayan".
    /// </summary>
    public const string HadirBackendApiUrl = "";
}
