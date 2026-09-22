using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Text;
using System.Threading.Tasks;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Real HTTP tests for DeviceRegistrationClient against an in-process fake
/// HADIR backend (HttpListener on a loopback ephemeral port), mirroring the
/// style of LoopbackEngineStatusSourceTests: a genuine POST over the wire,
/// not a mocked HttpClient.
/// </summary>
public class DeviceRegistrationClientTests
{
    [Fact]
    public async Task ProbeKeupayaanAsync_BackendOk_ReturnsTersedia()
    {
        using var server = new FakeHadirBackend(kaedah => (true, "[]", string.Empty));
        var client = new DeviceRegistrationClient(new HttpClient(), server.BaseUrl);

        var kemampuan = await client.ProbeKeupayaanAsync();

        Assert.Equal(PerantiKemampuan.Tersedia, kemampuan);
    }

    [Fact]
    public async Task ProbeKeupayaanAsync_UnknownMethod_ReturnsTiadaSokongan()
    {
        using var server = new FakeHadirBackend(kaedah => (false, "null", "Fungsi tidak dibenarkan."));
        var client = new DeviceRegistrationClient(new HttpClient(), server.BaseUrl);

        var kemampuan = await client.ProbeKeupayaanAsync();

        Assert.Equal(PerantiKemampuan.TiadaSokongan, kemampuan);
    }

    [Fact]
    public async Task ProbeKeupayaanAsync_NoServer_ReturnsTiadaSokongan()
    {
        var unusedPort = GetUnusedPort();
        var client = new DeviceRegistrationClient(new HttpClient(), $"http://127.0.0.1:{unusedPort}/");

        var kemampuan = await client.ProbeKeupayaanAsync();

        Assert.Equal(PerantiKemampuan.TiadaSokongan, kemampuan);
    }

    [Fact]
    public async Task DegupAsync_FeatureDisabled_ThrowsDistinctDilumpuhkanException()
    {
        using var server = new FakeHadirBackend(kaedah => (false, "null", "Ciri berbilang PC dilumpuhkan."));
        var client = new DeviceRegistrationClient(new HttpClient(), server.BaseUrl);

        await Assert.ThrowsAsync<PerantiDilumpuhkanException>(
            () => client.DegupAsync("peranti-1", "akaun-a", "rahsia-sulit"));
    }

    [Fact]
    public async Task KlaimKepimpinanAsync_FeatureDisabled_ThrowsDistinctDilumpuhkanException()
    {
        using var server = new FakeHadirBackend(kaedah => (false, "null", "Ciri berbilang PC dilumpuhkan."));
        var client = new DeviceRegistrationClient(new HttpClient(), server.BaseUrl);

        await Assert.ThrowsAsync<PerantiDilumpuhkanException>(
            () => client.KlaimKepimpinanAsync("peranti-1", "akaun-a", "rahsia-sulit"));
    }

    [Fact]
    public async Task KlaimKepimpinanAsync_OtherFailure_ThrowsGenericException_NotDilumpuhkan()
    {
        using var server = new FakeHadirBackend(kaedah => (false, "null", "Pemimpin aktif lain memegang lease."));
        var client = new DeviceRegistrationClient(new HttpClient(), server.BaseUrl);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            () => client.KlaimKepimpinanAsync("peranti-1", "akaun-a", "rahsia-sulit"));
        Assert.Contains("lease", ex.Message);
    }

    [Fact]
    public async Task DaftarAsync_Success_ParsesRekodPeranti()
    {
        using var server = new FakeHadirBackend(kaedah => (true, """
        {
          "idPeranti": "peranti-1", "akaun": "akaun-a", "nama": "PC Guru", "status": "aktif",
          "generasi": 1, "diciptaMs": 1000, "dilulusMs": 1000, "lastSeenMs": null, "nyahaktifMs": null
        }
        """, string.Empty));
        var client = new DeviceRegistrationClient(new HttpClient(), server.BaseUrl);

        var rekod = await client.DaftarAsync("kod-daftar", "peranti-1", "akaun-a", "PC Guru", "rahsia-sulit");

        Assert.Equal("peranti-1", rekod.IdPeranti);
        Assert.Equal("aktif", rekod.Status);
    }

    [Fact]
    public async Task SecretNeverAppearsInRecordedRequestPathsOrQuery()
    {
        using var server = new FakeHadirBackend(kaedah => (true, """{ "ok": true, "pemimpin": false, "generasi": 1 }""", string.Empty));
        var client = new DeviceRegistrationClient(new HttpClient(), server.BaseUrl);
        const string rahsiaSulit = "rahsia-sangat-sulit-000111222";
        await client.DegupAsync("peranti-1", "akaun-a", rahsiaSulit);

        Assert.All(server.RequestPaths, p => Assert.DoesNotContain(rahsiaSulit, p));
    }

    private static int GetUnusedPort()
    {
        using var probe = new TcpListener(IPAddress.Loopback, 0);
        probe.Start();
        var port = ((IPEndPoint)probe.LocalEndpoint).Port;
        probe.Stop();
        return port;
    }

    /// <summary>
    /// Minimal in-process fake for the HADIR RPC surface: reads
    /// {mode:'hadir', kaedah, argumen}, hands `kaedah` to the supplied
    /// responder, and replies with the canned {ok, hasil}/{ok:false, ralat}.
    /// The secret, if present in `argumen`, is NEVER placed into the URL —
    /// requests are POST bodies only — but we still record request paths so
    /// tests can assert nothing leaked into the URL/query.
    /// </summary>
    private sealed class FakeHadirBackend : IDisposable
    {
        private readonly HttpListener _listener = new();
        private readonly Func<string, (bool ok, string hasilJson, string ralat)> _responder;
        private readonly object _gate = new();
        private readonly List<string> _requestPaths = new();

        public string BaseUrl { get; }
        public string[] RequestPaths { get { lock (_gate) return _requestPaths.ToArray(); } }

        public FakeHadirBackend(Func<string, (bool, string, string)> responder)
        {
            _responder = responder;
            var port = GetUnusedPort();
            BaseUrl = $"http://127.0.0.1:{port}/";
            _listener.Prefixes.Add(BaseUrl);
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
            lock (_gate) _requestPaths.Add(ctx.Request.Url!.PathAndQuery);
            try
            {
                using var reader = new StreamReader(ctx.Request.InputStream, Encoding.UTF8);
                var body = reader.ReadToEnd();
                using var doc = System.Text.Json.JsonDocument.Parse(body);
                var kaedah = doc.RootElement.TryGetProperty("kaedah", out var k) ? k.GetString() ?? string.Empty : string.Empty;

                var (ok, hasilJson, ralat) = _responder(kaedah);
                var balasan = ok
                    ? $$"""{"ok":true,"hasil":{{hasilJson}}}"""
                    : $$"""{"ok":false,"ralat":{{System.Text.Json.JsonSerializer.Serialize(ralat)}}}""";

                var bytes = Encoding.UTF8.GetBytes(balasan);
                ctx.Response.ContentType = "application/json; charset=utf-8";
                ctx.Response.ContentLength64 = bytes.Length;
                ctx.Response.OutputStream.Write(bytes, 0, bytes.Length);
                ctx.Response.Close();
            }
            catch
            {
                try { ctx.Response.StatusCode = 500; ctx.Response.Close(); } catch { /* best effort */ }
            }
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
