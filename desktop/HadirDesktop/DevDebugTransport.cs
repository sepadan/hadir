using System;
using System.IO;
using System.Net;
using System.Net.Sockets;

namespace HadirDesktop;

/// <summary>
/// Bounded, developer/test-only debug transport for driving the embedded
/// WebView2 via Playwright/CDP. This is the ONLY path that ever enables
/// Chromium remote debugging, and it is strictly opt-in via environment
/// variables:
///
///   HADIR_DEV_DEBUG=1            enable the debug transport
///   HADIR_DEV_DEBUG_PORT=<n>     optional fixed loopback port (default: random)
///
/// When enabled:
///   - `--remote-debugging-port=<port>` is added to the WebView2 browser
///     arguments. WebView2 binds remote debugging to loopback only (we never
///     pass `--remote-debugging-address`), so the CDP endpoint is never on a
///     LAN/public interface.
///   - A SEPARATE ephemeral user-data profile folder is used (never the normal
///     demo profile, never the real portal profile, never real credentials).
///   - The chosen port is written to a well-known local file so a Playwright
///     test harness can discover it without scanning.
///
/// In normal app mode (no env vars) this returns null and NO debug listener
/// exists — matching the hard constraint that CDP stays disabled outside
/// scoped developer builds.
/// </summary>
public sealed class DevDebugTransport
{
    public const string EnableEnv = "HADIR_DEV_DEBUG";
    public const string PortEnv = "HADIR_DEV_DEBUG_PORT";

    private static readonly string[] Truthy = { "1", "true", "yes", "on" };

    public int Port { get; }
    public string UserDataFolder { get; }
    public string AdditionalBrowserArguments { get; }
    public string PortFile { get; }

    private DevDebugTransport(int port, string userDataFolder, string portFile)
    {
        Port = port;
        UserDataFolder = userDataFolder;
        PortFile = portFile;
        AdditionalBrowserArguments = $"--remote-debugging-port={port}";
    }

    /// <summary>
    /// Builds the debug transport if (and only if) HADIR_DEV_DEBUG is set to a
    /// truthy value. Returns null in normal app mode. Writes the port file so
    /// a test harness can discover the CDP endpoint.
    /// </summary>
    public static DevDebugTransport? FromEnvironment(string? baseUserDataFolder = null)
    {
        var enable = Environment.GetEnvironmentVariable(EnableEnv);
        if (string.IsNullOrWhiteSpace(enable) || Array.IndexOf(Truthy, enable.Trim().ToLowerInvariant()) < 0)
        {
            return null;
        }

        var port = ResolvePort();
        var localAppData = baseUserDataFolder
            ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "HadirDesktop");
        // Isolated, ephemeral, never the normal demo/portal profile.
        var userDataFolder = Path.Combine(localAppData, $"webview2-dev-{port}");
        var portFile = Path.Combine(localAppData, "devtools-port.txt");

        Directory.CreateDirectory(userDataFolder);
        File.WriteAllText(portFile, port.ToString());

        return new DevDebugTransport(port, userDataFolder, portFile);
    }

    private static int ResolvePort()
    {
        var raw = Environment.GetEnvironmentVariable(PortEnv);
        if (int.TryParse(raw, out var fixedPort) && fixedPort is >= 1 and <= 65535)
        {
            return fixedPort;
        }

        return GetEphemeralLoopbackPort();
    }

    private static int GetEphemeralLoopbackPort()
    {
        using var probe = new TcpListener(IPAddress.Loopback, 0);
        probe.Start();
        var port = ((IPEndPoint)probe.LocalEndpoint).Port;
        probe.Stop();
        return port;
    }
}
