using System;

namespace HadirDesktop;

/// <summary>
/// Explicit, default-OFF developer mode that points the embedded WebView2 at the
/// REAL idMe login page (https://idme.moe.gov.my/login) instead of the local
/// fixture. Enabled only by HADIR_DEV_REAL_PORTAL=1 (truthy). In this mode ONLY:
///   - the NavigationGuard allowlist is widened to the exact idMe origin so the
///     real login page can render (read-only: navigation + DOM observation only,
///     never credentials, never submit);
///   - the ephemeral loopback CDP debug transport (DevDebugTransport) is enabled
///     so a Playwright harness can attach via connectOverCDP.
/// Normal/conservative builds (no env var) keep the fixture default and never
/// pass a remote-debugging flag.
/// </summary>
public sealed class RealPortalDevMode
{
    public const string EnableEnv = "HADIR_DEV_REAL_PORTAL";
    public const string LoginUrl = "https://idme.moe.gov.my/login";
    public const string IdMeOrigin = "https://idme.moe.gov.my";

    private static readonly string[] Truthy = { "1", "true", "yes", "on" };

    public bool Enabled { get; }
    public string[] AllowedOrigins { get; }

    private RealPortalDevMode(bool enabled, string[] allowedOrigins)
    {
        Enabled = enabled;
        AllowedOrigins = allowedOrigins;
    }

    /// <summary>Truthiness of the env flag; case-insensitive, trimmed.</summary>
    public static bool IsTruthy(string? raw) =>
        !string.IsNullOrWhiteSpace(raw) && Array.IndexOf(Truthy, raw.Trim().ToLowerInvariant()) >= 0;

    /// <summary>Pure factory (testable without touching process env).</summary>
    public static RealPortalDevMode Create(bool enabled) =>
        enabled ? new RealPortalDevMode(true, new[] { IdMeOrigin }) : new RealPortalDevMode(false, Array.Empty<string>());

    public static RealPortalDevMode FromEnvironment() =>
        Create(IsTruthy(Environment.GetEnvironmentVariable(EnableEnv)));
}
