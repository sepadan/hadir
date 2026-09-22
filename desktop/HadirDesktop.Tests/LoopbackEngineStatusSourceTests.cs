using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Real HTTP integration tests for LoopbackEngineStatusSource, driven against a
/// minimal in-process companion stand-in (HttpListener on a loopback ephemeral
/// port). These exercise the actual nonce handshake + X-HADIR-Lokal/Origin auth
/// over the wire — not a mocked HttpClient.
/// </summary>
public class LoopbackEngineStatusSourceTests
{
    private const string TestNonce = "0123456789abcdef0123456789abcdef0123456789abcdef";

    [Fact]
    public async Task GetStatusAsync_CompletesHandshake_AndParsesRealShape()
    {
        using var server = new FakeCompanionServer(nonce: TestNonce, statusBody: LokalStatusBody, rejectStatus: false);
        using var source = new LoopbackEngineStatusSource(server.BaseUrl, TimeSpan.FromSeconds(5));

        var status = await source.GetStatusAsync();

        Assert.Equal(EngineStatusKind.Ok, status.Kind);
        Assert.True(status.Ok);
        Assert.Equal("1.0.0", status.Versi);
        Assert.True(status.AdaRahsiaEnjin);
        Assert.True(status.GiliranAktif);
        Assert.Equal("auto", status.GiliranModMula);
        Assert.Equal(53, status.KalendarBilangan);

        // The client must have sent EXACTLY the handshake (/) and the status
        // call — and passed the nonce via the X-HADIR-Lokal HEADER, not in any
        // query string (which would leak into logs).
        Assert.Equal(new[] { "/", "/api/lokal/status" }, server.RequestPaths.ToArray());
        Assert.Contains("/api/lokal/status", server.AuthorisedStatusCalls);
        Assert.DoesNotContain(server.RequestPaths, p => p.Contains("?n="));
    }

    [Fact]
    public async Task GetStatusAsync_AuthRejected_ReturnsUnauthorized()
    {
        // Server advertises a nonce but rejects every status call (simulates a
        // nonce/Origin mismatch -> 403). The adapter must classify this as
        // Unauthorized, NOT "not running".
        using var server = new FakeCompanionServer(nonce: TestNonce, statusBody: LokalStatusBody, rejectStatus: true);
        using var source = new LoopbackEngineStatusSource(server.BaseUrl, TimeSpan.FromSeconds(5));

        var status = await source.GetStatusAsync();

        Assert.Equal(EngineStatusKind.Unauthorized, status.Kind);
    }

    [Fact]
    public async Task GetStatusAsync_NonJsonBody_ReturnsMalformed()
    {
        using var server = new FakeCompanionServer(nonce: TestNonce, statusBody: "<html>not json</html>", rejectStatus: false);
        using var source = new LoopbackEngineStatusSource(server.BaseUrl, TimeSpan.FromSeconds(5));

        var status = await source.GetStatusAsync();

        Assert.Equal(EngineStatusKind.Malformed, status.Kind);
    }

    [Fact]
    public async Task GetStatusAsync_NoEngine_ReturnsOffline()
    {
        // Point at a loopback port nothing listens on -> connection refused -> Offline.
        var unusedPort = GetUnusedPort();
        using var source = new LoopbackEngineStatusSource($"http://127.0.0.1:{unusedPort}", TimeSpan.FromSeconds(5));

        var status = await source.GetStatusAsync();

        Assert.Equal(EngineStatusKind.Offline, status.Kind);
    }

    [Theory]
    [InlineData("http://evil.example/?n=abc123", false)]           // off-origin host
    [InlineData("https://127.0.0.1:8747/?n=abc123", false)]        // scheme mismatch (https)
    [InlineData("http://127.0.0.1:9999/?n=abc123", false)]         // different port
    [InlineData("http://192.168.1.5:8747/?n=abc123", false)]       // non-loopback IP
    [InlineData("http://localhost:8747/?n=abc123", true)]          // loopback host alias
    [InlineData("/?n=abc123", true)]                               // relative, same origin
    [InlineData("http://127.0.0.1:8747/?n=abc123", true)]          // exact same origin
    public void TryGetNonceFromRedirect_AllowlistsSameLoopbackOriginOnly(string location, bool expected)
    {
        var baseUri = new Uri("http://127.0.0.1:8747");

        var ok = LoopbackEngineStatusSource.TryGetNonceFromRedirect(baseUri, location, out var nonce);

        Assert.Equal(expected, ok);
        if (expected)
        {
            Assert.Equal("abc123", nonce);
        }
        else
        {
            Assert.Equal(string.Empty, nonce);
        }
    }

    [Fact]
    public async Task GetStatusAsync_NeverLeaksNonceIntoReturnedModel()
    {
        using var server = new FakeCompanionServer(nonce: TestNonce, statusBody: LokalStatusBody, rejectStatus: false);
        using var source = new LoopbackEngineStatusSource(server.BaseUrl, TimeSpan.FromSeconds(5));

        var status = await source.GetStatusAsync();

        var surfaces = new[]
        {
            status.SourceLabel, status.Versi, status.Pc, status.Catatan ?? string.Empty,
            status.GiliranModMula,
        };

        Assert.All(surfaces, s => Assert.DoesNotContain(TestNonce, s));
        Assert.DoesNotContain(TestNonce, source.SourceLabel);
    }

    private const string LokalStatusBody = """
    {
      "ok": true, "versi": "1.0.0", "pc": "PC-TEST", "rahsiaEnjinAda": true,
      "giliran": { "aktif": true, "sedangProses": false, "modMula": "auto", "klaimDisokong": true },
      "autoMula": { "bermula": true },
      "kalendar": { "bilangan": 53, "amaran": false },
      "moeis": { "sesiAda": true }
    }
    """;

    private static int GetUnusedPort()
    {
        using var probe = new TcpListener(IPAddress.Loopback, 0);
        probe.Start();
        var port = ((IPEndPoint)probe.LocalEndpoint).Port;
        probe.Stop();
        return port;
    }

    /// <summary>Minimal loopback stand-in for the companion's nonce-gated endpoints.</summary>
    private sealed class FakeCompanionServer : IDisposable
    {
        private readonly HttpListener _listener = new();
        private readonly string _nonce;
        private readonly string _statusBody;
        private readonly bool _rejectStatus;
        private readonly object _gate = new();
        private readonly List<string> _requestPaths = new();
        private readonly List<string> _authorisedStatusCalls = new();

        public string BaseUrl { get; }

        public string[] RequestPaths { get { lock (_gate) return _requestPaths.ToArray(); } }
        public string[] AuthorisedStatusCalls { get { lock (_gate) return _authorisedStatusCalls.ToArray(); } }

        public FakeCompanionServer(string nonce, string statusBody, bool rejectStatus)
        {
            _nonce = nonce;
            _statusBody = statusBody;
            _rejectStatus = rejectStatus;

            var port = GetUnusedPort();
            BaseUrl = $"http://127.0.0.1:{port}";
            _listener.Prefixes.Add($"{BaseUrl}/");
            _listener.Start();
            _ = Task.Run(AcceptLoop);
        }

        private async Task AcceptLoop()
        {
            while (_listener.IsListening)
            {
                HttpListenerContext ctx;
                try { ctx = await _listener.GetContextAsync(); }
                catch { return; }
                _ = Task.Run(() => Handle(ctx));
            }
        }

        private void Handle(HttpListenerContext ctx)
        {
            var path = ctx.Request.Url!.AbsolutePath;
            var query = ctx.Request.Url.Query;
            lock (_gate)
            {
                _requestPaths.Add(path);
            }

            try
            {
                if (path == "/" && ctx.Request.HttpMethod == "GET")
                {
                    // Nonce handshake: 302 to /?n=<nonce> (never logged by client).
                    ctx.Response.StatusCode = 302;
                    ctx.Response.Headers["Location"] = $"/?n={_nonce}";
                    ctx.Response.Headers["Cache-Control"] = "no-store";
                    ctx.Response.Close();
                    return;
                }

                if (path == "/api/lokal/status" && ctx.Request.HttpMethod == "GET")
                {
                    var nonceHeader = ctx.Request.Headers["X-HADIR-Lokal"];
                    var origin = ctx.Request.Headers["Origin"];
                    var nonceOk = string.Equals(nonceHeader, _nonce, StringComparison.Ordinal);
                    var originOk = string.Equals(origin, BaseUrl, StringComparison.OrdinalIgnoreCase);

                    if (_rejectStatus || !nonceOk || !originOk)
                    {
                        ctx.Response.StatusCode = 403;
                        ctx.Response.Close();
                        return;
                    }

                    lock (_gate) _authorisedStatusCalls.Add(path);
                    var bytes = Encoding.UTF8.GetBytes(_statusBody);
                    ctx.Response.ContentType = "application/json; charset=utf-8";
                    ctx.Response.ContentLength64 = bytes.Length;
                    ctx.Response.OutputStream.Write(bytes, 0, bytes.Length);
                    ctx.Response.Close();
                    return;
                }

                ctx.Response.StatusCode = 404;
                ctx.Response.Close();
            }
            catch { /* best effort */ }
        }

        public void Dispose()
        {
            try
            {
                if (_listener.IsListening) _listener.Stop();
                _listener.Close();
            }
            catch { /* already closed */ }
        }
    }
}
