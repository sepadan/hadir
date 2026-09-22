using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Endpoint validation + a REAL fake-HTTP lifecycle (enrollment → secret store
/// → heartbeat → admin revoke → terminal stop) against an in-process loopback
/// HADIR backend stand-in. No live endpoint is ever contacted.
/// </summary>
public class DeviceLifecycleTests : IDisposable
{
    private const string KodUjian = "KOD-UJIAN-123";
    private const string TokenAdmin = "TOKEN-ADMIN-UJIAN";

    private readonly string _dir;

    public DeviceLifecycleTests()
    {
        _dir = Path.Combine(Path.GetTempPath(), "hadir-lifecycle-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_dir);
    }

    public void Dispose()
    {
        try { if (Directory.Exists(_dir)) Directory.Delete(_dir, recursive: true); } catch { /* best-effort */ }
    }

    // ---------- Endpoint validator ----------

    [Theory]
    [InlineData("https://script.google.com/macros/s/AKfycb.../exec", true)]
    [InlineData("https://script.googleusercontent.com/macros/echo?x=1", true)]
    [InlineData("http://script.google.com/macros/s/AKfycb.../exec", false)] // http, not https
    [InlineData("http://127.0.0.1:8747/exec", true)]  // loopback for tests
    [InlineData("http://localhost:9999/exec", true)]  // loopback alias
    [InlineData("https://evil.example.com/exec", false)]
    [InlineData("ftp://script.google.com/exec", false)]
    [InlineData("", false)]
    [InlineData("not-a-url", false)]
    public void BolehDaftar_AllowsOnlyAppsScriptOrLoopback(string url, bool expected)
    {
        Assert.Equal(expected, HadirEndpointValidator.BolehDaftar(url));
    }

    [Fact]
    public void BolehDaftar_RejectsEmptyDefaultEndpoint()
    {
        // MainForm wires DemoLabel.HadirBackendApiUrl (empty) by default — the
        // panel must therefore fail closed and never attempt enrollment.
        Assert.False(HadirEndpointValidator.BolehDaftar(DemoLabel.HadirBackendApiUrl));
    }

    // ---------- Fake-HTTP lifecycle ----------

    [Fact]
    public async Task Enrollment_SecretStore_Heartbeat_Revoke_TerminalStop()
    {
        using var server = new FakeHadirBackend(KodUjian, TokenAdmin);
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
        var client = new DeviceRegistrationClient(http, server.BaseUrl);

        var secretStore = new DpapiDeviceSecretStore(Path.Combine(_dir, "device-secret.bin"));
        var identityStore = new JsonDeviceIdentityStore(Path.Combine(_dir, "device-identiti.json"));

        // 1) Enrollment over real HTTP.
        var idPeranti = "pc-e2e-" + Guid.NewGuid().ToString("N");
        var rahsia = "rahsia-e2e-sintetik";
        var rekod = await client.DaftarAsync(KodUjian, idPeranti, "akaun-a", "PC Ujian", rahsia);
        Assert.Equal("aktif", rekod.Status);
        Assert.Equal(idPeranti, rekod.IdPeranti);

        // 2) Secret-store abstraction (DPAPI round-trip), isolated temp file.
        secretStore.Simpan(rahsia);
        identityStore.Simpan(new DeviceIdentity { IdPeranti = idPeranti, Akaun = "akaun-a", Nama = "PC Ujian" });
        Assert.Equal(rahsia, secretStore.Baca());
        Assert.Equal(idPeranti, identityStore.Baca()?.IdPeranti);

        // 3) Heartbeat: degup returns leader.
        var jawapan = await client.DegupAsync(idPeranti, "akaun-a", rahsia);
        Assert.True(jawapan.Pemimpin);

        // 4) Heartbeat loop reports leadership, then admin revokes -> terminal stop.
        string? sebabTerminal = null;
        var terminal = new TaskCompletionSource();
        var gelung = new HeartbeatLoop(
            ct => client.DegupAsync(idPeranti, "akaun-a", rahsia),
            selang: TimeSpan.FromMilliseconds(20),
            backoffMaks: TimeSpan.FromSeconds(1),
            tunggu: (_, ct) => Task.Delay(TimeSpan.FromMilliseconds(5), ct));
        gelung.TamatTerminal += s => { sebabTerminal = s; terminal.TrySetResult(); };
        gelung.Start();

        // Revoke via the admin token (real HTTP), then wait for the loop to die.
        var nyahaktif = await client.NyahaktifPerantiAsync(idPeranti, "akaun-a", TokenAdmin);
        Assert.Equal("nyahaktif", nyahaktif.Status);

        await terminal.Task.WaitAsync(TimeSpan.FromSeconds(5));
        gelung.Dispose();

        Assert.NotNull(sebabTerminal);
        Assert.False(gelung.Berjalan);

        // 5) Post-revoke: a fresh degup must surface the revocation distinctly.
        await Assert.ThrowsAsync<PerantiNyahaktifException>(
            () => client.DegupAsync(idPeranti, "akaun-a", rahsia));
    }

    // ---------- DevicePanel wiring (STA) ----------

    [Fact]
    public void DevicePanel_Wiring_LoadsPersistedIdentity_AndEnablesHeartbeat()
    {
        // WinForms controls must be created on an STA thread.
        var secretLaluan = Path.Combine(_dir, "panel-secret.bin");
        var identitiLaluan = Path.Combine(_dir, "panel-identiti.json");
        var secretStore = new DpapiDeviceSecretStore(secretLaluan);
        var identityStore = new JsonDeviceIdentityStore(identitiLaluan);
        secretStore.Simpan("rahsia-panel-sintetik");
        identityStore.Simpan(new DeviceIdentity { IdPeranti = "pc-panel", Akaun = "akaun-a", Nama = "PC Panel" });

        RunSta(() =>
        {
            using var panel = new DevicePanel(
                new FakeClient(),
                "http://127.0.0.1:8747/exec",
                secretStore,
                identityStore);

            Assert.True(panel.BerdaftarUntukUjian);
            Assert.Equal("pc-panel", panel.IdPerantiUntukUjian);
            Assert.True(panel.DegupButtonUntukUjian.Enabled);
        });
    }

    [Fact]
    public void DevicePanel_Wiring_EmptyEndpoint_NeverEnrolls()
    {
        RunSta(() =>
        {
            using var panel = new DevicePanel(
                new FakeClient(),
                DemoLabel.HadirBackendApiUrl, // empty -> fail closed
                new DpapiDeviceSecretStore(Path.Combine(_dir, "empty-secret.bin")),
                new JsonDeviceIdentityStore(Path.Combine(_dir, "empty-identiti.json")));

            Assert.False(panel.BerdaftarUntukUjian);
            Assert.False(panel.DegupButtonUntukUjian.Enabled);
        });
    }

    private static void RunSta(Action action)
    {
        Exception? ex = null;
        var thread = new Thread(() =>
        {
            try { action(); }
            catch (Exception e) { ex = e; }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join();
        if (ex != null) System.Runtime.ExceptionServices.ExceptionDispatchInfo.Capture(ex).Throw();
    }

    private sealed class FakeClient : IDeviceRegistrationClient
    {
        public Task<PerantiKemampuan> ProbeKeupayaanAsync() => Task.FromResult(PerantiKemampuan.Tersedia);
        public Task<RekodPeranti> DaftarAsync(string kodDaftar, string idPeranti, string akaun, string nama, string rahsia) =>
            Task.FromResult(new RekodPeranti { IdPeranti = idPeranti, Akaun = akaun, Nama = nama, Status = "aktif", Generasi = 1 });
        public Task<JawapanDegup> DegupAsync(string idPeranti, string akaun, string rahsia) =>
            Task.FromResult(new JawapanDegup { Ok = true, Pemimpin = true, Generasi = 1 });
        public Task<JawapanKlaim> KlaimKepimpinanAsync(string idPeranti, string akaun, string rahsia) =>
            Task.FromResult(new JawapanKlaim { Ok = true, Pemimpin = idPeranti, Generasi = 1, LeaseMs = 1 });
        public Task<RekodPeranti> NyahaktifPerantiAsync(string idPeranti, string akaun, string token) =>
            Task.FromResult(new RekodPeranti { IdPeranti = idPeranti, Akaun = akaun, Status = "nyahaktif" });
        public Task<IReadOnlyList<RekodPeranti>> SenaraiPerantiAdminAsync(string akaun, string token) =>
            Task.FromResult<IReadOnlyList<RekodPeranti>>(Array.Empty<RekodPeranti>());
        public Task<IReadOnlyList<StatusAwam>> StatusAwamAsync() =>
            Task.FromResult<IReadOnlyList<StatusAwam>>(Array.Empty<StatusAwam>());
    }

    /// <summary>
    /// In-process loopback stand-in for the HADIR multi-PC RPC surface. Enforces
    /// single-use enrollment code and admin-token auth for revoke, mirroring the
    /// real backend's semantics closely enough to exercise the client end to end.
    /// </summary>
    private sealed class FakeHadirBackend : IDisposable
    {
        private readonly HttpListener _listener = new();
        private readonly object _kunci = new();
        private readonly Dictionary<string, PerantiPalsu> _peranti = new();
        private readonly string _kodDaftar;
        private readonly string _tokenAdmin;
        private bool _kodDiguna;

        public string BaseUrl { get; }

        private sealed class PerantiPalsu
        {
            public string Id = string.Empty, Akaun = string.Empty, Nama = string.Empty, Rahsia = string.Empty;
            public int Generasi = 1;
            public bool Nyahaktif;
            public long DiciptaMs;
        }

        public FakeHadirBackend(string kodDaftar, string tokenAdmin)
        {
            _kodDaftar = kodDaftar;
            _tokenAdmin = tokenAdmin;
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
            try
            {
                using var reader = new StreamReader(ctx.Request.InputStream, Encoding.UTF8);
                var badan = reader.ReadToEnd();
                using var doc = JsonDocument.Parse(badan);
                var root = doc.RootElement;
                var kaedah = root.GetProperty("kaedah").GetString() ?? string.Empty;
                var argumen = root.GetProperty("argumen").EnumerateArray().Select(e => e.GetRawText()).ToArray();

                var jawapan = Dispatch(kaedah, argumen);
                var bait = Encoding.UTF8.GetBytes(jawapan);
                ctx.Response.ContentType = "application/json; charset=utf-8";
                ctx.Response.ContentLength64 = bait.Length;
                ctx.Response.OutputStream.Write(bait, 0, bait.Length);
            }
            catch
            {
                try
                {
                    var bait = Encoding.UTF8.GetBytes("""{"ok":false,"ralat":"permintaan tidak sah"}""");
                    ctx.Response.ContentType = "application/json; charset=utf-8";
                    ctx.Response.ContentLength64 = bait.Length;
                    ctx.Response.OutputStream.Write(bait, 0, bait.Length);
                }
                catch { /* best-effort */ }
            }
            finally
            {
                ctx.Response.Close();
            }
        }

        private string Dispatch(string kaedah, string[] argumen)
        {
            switch (kaedah)
            {
                case "pcTerbitKodDaftar":
                    return argumen.Length >= 3 && Arg(argumen[2]) == _tokenAdmin
                        ? Ok(new { kodDaftar = _kodDaftar, luputMs = DateTimeOffset.UtcNow.AddMinutes(15).ToUnixTimeMilliseconds() })
                        : Gagal("Sesi tamat / akses pentadbir diperlukan.");

                case "pcDaftarPeranti":
                    {
                        var kod = Arg(argumen[0]);
                        var id = Arg(argumen[1]);
                        var akaun = Arg(argumen[2]);
                        var nama = argumen.Length > 3 ? Arg(argumen[3]) : "";
                        var rahsia = argumen.Length > 4 ? Arg(argumen[4]) : "";
                        lock (_kunci)
                        {
                            if (_kodDiguna || kod != _kodDaftar)
                                return Gagal("Kod daftar tidak sah atau sudah digunakan.");
                            _kodDiguna = true;
                            var p = new PerantiPalsu
                            {
                                Id = id, Akaun = akaun, Nama = nama, Rahsia = rahsia,
                                DiciptaMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                            };
                            _peranti[id] = p;
                            return Ok(Rekod(p));
                        }
                    }

                case "pcDegup":
                    {
                        var id = Arg(argumen[0]);
                        var rahsia = argumen.Length > 2 ? Arg(argumen[2]) : "";
                        lock (_kunci)
                        {
                            if (!_peranti.TryGetValue(id, out var p) || p.Rahsia != rahsia)
                                return Gagal("Peranti tidak dikenali.");
                            if (p.Nyahaktif)
                                return Gagal("Peranti dinyahaktifkan.");
                            return Ok(new { ok = true, pemimpin = true, generasi = p.Generasi });
                        }
                    }

                case "pcNyahaktifPeranti":
                    {
                        var id = Arg(argumen[0]);
                        var akaun = Arg(argumen[1]);
                        var token = argumen.Length > 2 ? Arg(argumen[2]) : "";
                        if (token != _tokenAdmin)
                            return Gagal("Sesi tamat / akses pentadbir diperlukan.");
                        lock (_kunci)
                        {
                            if (!_peranti.TryGetValue(id, out var p) || p.Akaun != akaun)
                                return Gagal("Peranti tidak dikenali.");
                            p.Nyahaktif = true;
                            return Ok(Rekod(p));
                        }
                    }

                case "pcStatusAwam":
                    return Ok(Array.Empty<object>());

                default:
                    return Gagal("Fungsi tidak dibenarkan.");
            }
        }

        private static object Rekod(PerantiPalsu p) => new
        {
            idPeranti = p.Id,
            akaun = p.Akaun,
            nama = p.Nama,
            status = p.Nyahaktif ? "nyahaktif" : "aktif",
            generasi = p.Generasi,
            diciptaMs = p.DiciptaMs,
            dilulusMs = p.DiciptaMs,
            lastSeenMs = (long?)null,
            nyahaktifMs = p.Nyahaktif ? (long?)DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() : null,
        };

        private static string Arg(string raw)
        {
            try { return JsonSerializer.Deserialize<string>(raw) ?? string.Empty; }
            catch { return string.Empty; }
        }

        private static string Ok(object hasil) =>
            JsonSerializer.Serialize(new { ok = true, hasil });

        private static string Gagal(string ralat) =>
            JsonSerializer.Serialize(new { ok = false, ralat });

        private static int GetUnusedPort()
        {
            using var probe = new TcpListener(IPAddress.Loopback, 0);
            probe.Start();
            var port = ((IPEndPoint)probe.LocalEndpoint).Port;
            probe.Stop();
            return port;
        }

        public void Dispose()
        {
            try { if (_listener.IsListening) _listener.Stop(); _listener.Close(); } catch { /* already closed */ }
        }
    }
}
