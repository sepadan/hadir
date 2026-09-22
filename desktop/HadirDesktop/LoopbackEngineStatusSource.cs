using System;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Threading;
using System.Threading.Tasks;

namespace HadirDesktop;

/// <summary>
/// Read-only, authenticated local client for the Node companion engine.
///
/// Auth model (mirrors companion/src/server.mjs exactly):
///   1. GET {base}/  -> 302 redirect to /?n=&lt;nonce&gt; (no-store). We read the
///      nonce from the Location header WITHOUT following the redirect, and we
///      never log it.
///   2. The redirect target must stay on the SAME loopback origin (host is
///      127.0.0.1 / localhost / ::1 and port matches). Anything else is
///      rejected before any request is made — this is the redirect allowlist.
///   3. GET {base}/api/lokal/status with headers:
///        X-HADIR-Lokal: &lt;nonce&gt;   (timing-safe compared server-side)
///        Origin: &lt;base&gt;             (exact match against the loopback UI origin)
///
/// Outcomes are classified distinctly (never collapsed to a single "not
/// running"): Ok / Offline / Unauthorized / Timeout / Malformed. Never throws
/// to the caller. Read-only: never mutates the engine, never writes settings.
/// </summary>
public sealed class LoopbackEngineStatusSource : IEngineStatusSource, IDisposable
{
    private readonly Uri _baseUri;
    private readonly HttpClient _http;

    public LoopbackEngineStatusSource(string? baseUrl = null, TimeSpan? timeout = null)
    {
        _baseUri = new Uri(baseUrl ?? EngineEndpoints.BaseUrl);
        var handler = new HttpClientHandler
        {
            AllowAutoRedirect = false,
        };
        _http = new HttpClient(handler)
        {
            // Generous default: the engine's /api/lokal/status can take ~20s on a
            // cold start (klaimDisokong probes the HADIR backend before caching).
            // Manual refresh only — the UI stays responsive while awaiting.
            Timeout = timeout ?? TimeSpan.FromSeconds(30),
        };
    }

    public string SourceLabel => DemoLabel.RealSourceLabel;

    public async Task<EngineStatusModel> GetStatusAsync(CancellationToken cancellationToken = default)
    {
        // 1. Nonce handshake.
        string nonce;
        try
        {
            using var handshake = await _http.GetAsync(new Uri(_baseUri, EngineEndpoints.SettingsPath), cancellationToken).ConfigureAwait(false);

            if (handshake.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
            {
                return EngineStatusModel.Unauthorized(SourceLabel);
            }

            var location = handshake.Headers.Location?.ToString();
            if (location is null || !TryGetNonceFromRedirect(_baseUri, location, out nonce))
            {
                // A redirect we can't trust (off-origin) or no nonce at all.
                return EngineStatusModel.Unauthorized(SourceLabel);
            }
        }
        catch (Exception ex) when (IsTimeout(ex, cancellationToken))
        {
            return EngineStatusModel.Timeout(SourceLabel);
        }
        catch (Exception ex) when (IsOffline(ex))
        {
            return EngineStatusModel.Offline(SourceLabel);
        }
        catch (Exception ex) when (IsCancellation(ex, cancellationToken))
        {
            throw;
        }

        // 2. Authenticated read-only status.
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, new Uri(_baseUri, EngineEndpoints.LokalStatusPath));
            request.Headers.Add("X-HADIR-Lokal", nonce);
            request.Headers.Add("Origin", _baseUri.GetLeftPart(UriPartial.Authority));

            using var response = await _http.SendAsync(request, cancellationToken).ConfigureAwait(false);

            if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
            {
                return EngineStatusModel.Unauthorized(SourceLabel);
            }

            if (!response.IsSuccessStatusCode)
            {
                return EngineStatusModel.Offline(SourceLabel);
            }

            var body = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
            return EngineStatusModel.FromJson(body, isSimulated: false, sourceLabel: SourceLabel);
        }
        catch (Exception ex) when (IsTimeout(ex, cancellationToken))
        {
            return EngineStatusModel.Timeout(SourceLabel);
        }
        catch (Exception ex) when (IsOffline(ex))
        {
            return EngineStatusModel.Offline(SourceLabel);
        }
        catch (Exception ex) when (IsCancellation(ex, cancellationToken))
        {
            throw;
        }
    }

    /// <summary>
    /// Pure redirect allowlist check. Extracts the nonce from a Location header
    /// IFF the redirect stays on the same loopback origin (127.0.0.1 /
    /// localhost / ::1 with the same port). Off-origin or non-loopback
    /// redirects return false and expose no nonce. Never throws.
    /// </summary>
    public static bool TryGetNonceFromRedirect(Uri baseUri, string location, out string nonce)
    {
        nonce = string.Empty;

        if (string.IsNullOrWhiteSpace(location))
        {
            return false;
        }

        Uri redirect;
        if (Uri.TryCreate(location, UriKind.Absolute, out var absolute))
        {
            redirect = absolute;
        }
        else if (Uri.TryCreate(baseUri, location, out var relative))
        {
            redirect = relative;
        }
        else
        {
            return false;
        }

        // Same loopback origin only: same scheme, loopback host, same port.
        if (!string.Equals(redirect.Scheme, baseUri.Scheme, StringComparison.OrdinalIgnoreCase)
            || !IsLoopbackHost(redirect.Host)
            || redirect.Port != baseUri.Port)
        {
            return false;
        }

        var candidate = ExtractQueryParam(redirect.Query, "n");
        if (string.IsNullOrEmpty(candidate))
        {
            return false;
        }

        nonce = candidate;
        return true;
    }

    private static string? ExtractQueryParam(string query, string key)
    {
        var q = query.StartsWith('?') ? query[1..] : query;
        foreach (var pair in q.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var idx = pair.IndexOf('=');
            if (idx < 0)
            {
                continue;
            }

            var k = Uri.UnescapeDataString(pair[..idx]);
            if (string.Equals(k, key, StringComparison.Ordinal))
            {
                return Uri.UnescapeDataString(pair[(idx + 1)..]);
            }
        }

        return null;
    }

    private static bool IsLoopbackHost(string host) =>
        string.Equals(host, "127.0.0.1", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(host, "localhost", StringComparison.OrdinalIgnoreCase) ||
        host == "::1" ||
        host == "[::1]";

    private static bool IsTimeout(Exception ex, CancellationToken ct) =>
        ex is TaskCanceledException && !ct.IsCancellationRequested;

    private static bool IsCancellation(Exception ex, CancellationToken ct) =>
        (ex is OperationCanceledException || ex is TaskCanceledException) && ct.IsCancellationRequested;

    private static bool IsOffline(Exception ex) =>
        ex is HttpRequestException hre &&
        hre.InnerException is SocketException { SocketErrorCode: SocketError.ConnectionRefused or SocketError.ConnectionReset or SocketError.HostUnreachable };

    public void Dispose()
    {
        _http.Dispose();
    }
}
