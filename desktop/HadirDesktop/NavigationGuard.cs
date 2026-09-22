using System;
using System.Collections.Generic;
using System.Linq;

namespace HadirDesktop;

/// <summary>
/// Pure allowlist logic for WebView2 navigation. Only the configured fixture
/// portal origin(s) and generic loopback (127.0.0.1 / localhost / ::1) hosts
/// are allowed. Everything else — including any non-loopback IP or external
/// domain — is blocked. No I/O, no WebView2 types, fully unit-testable.
/// </summary>
public sealed class NavigationGuard
{
    private static readonly string[] LoopbackHosts = { "127.0.0.1", "localhost", "::1" };

    private readonly HashSet<string> _allowedOrigins;

    public NavigationGuard(IEnumerable<string> allowedOrigins)
    {
        _allowedOrigins = new HashSet<string>(allowedOrigins, StringComparer.OrdinalIgnoreCase);
    }

    public bool IsAllowed(Uri? uri)
    {
        if (uri is null || !uri.IsAbsoluteUri)
        {
            return false;
        }

        if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
        {
            return false;
        }

        if (LoopbackHosts.Contains(uri.Host, StringComparer.OrdinalIgnoreCase))
        {
            return true;
        }

        var origin = $"{uri.Scheme}://{uri.Authority}";
        return _allowedOrigins.Contains(origin);
    }
}
