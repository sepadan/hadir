using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Read-only demand probe tests. Two layers:
///   * PURE counting (<see cref="LoopbackKerjaHariIniSource.KiraKerjaBelumSiap"/>)
///     — today's jobs in status menunggu/sedang_dihantar/tersimpan, nothing else;
///   * real HTTP integration against a minimal in-process companion stand-in
///     (HttpListener on a loopback ephemeral port): the SAME nonce handshake as
///     the status source, then `GET /api/lokal/kerja-hari-ini` with the nonce HEADER and NO
///     Origin header, plus every failure classification — never a guess.
/// </summary>
public class KerjaHariIniSourceTests
{
    private const string TestNonce = "0123456789abcdef0123456789abcdef0123456789abcdef";
    private const string HariIni = "2026-09-22";
    private const string Semalam = "2026-09-21";

    private static Func<DateTime> JamTetap(string tarikhIso) =>
        () => DateTime.ParseExact(tarikhIso, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);

    // ---------- pure counting ----------

    private static string Badan(params string[] jobJson) =>
        "{\"ok\":true,\"senarai\":[" + string.Join(",", jobJson) + "]}";

    private static string Job(string status, string tarikhIso) =>
        "{\"id\":\"j1\",\"kelas\":\"4A\",\"tarikhIso\":\"" + tarikhIso + "\",\"status\":\"" + status + "\",\"bilTidakHadir\":3}";

    [Theory]
    [InlineData("menunggu", HariIni, 1)]
    [InlineData("sedang_dihantar", HariIni, 1)]
    [InlineData("tersimpan", HariIni, 1)]
    [InlineData("menunggu", Semalam, 0)]          // yesterday is NOT today's work
    [InlineData("tersimpan", Semalam, 0)]
    [InlineData("disahkan", HariIni, 0)]          // finished -> no demand
    [InlineData("gagal", HariIni, 0)]
    [InlineData("tidak-berubah", HariIni, 0)]
    [InlineData("", HariIni, 0)]
    public void KiraKerjaBelumSiap_StatusDanTarikhSahajaYangDikira(string status, string tarikh, int dijangka)
    {
        Assert.Equal(dijangka, LoopbackKerjaHariIniSource.KiraKerjaBelumSiap(Badan(Job(status, tarikh)), HariIni));
    }

    [Fact]
    public void KiraKerjaBelumSiap_MengiraBeberapaTugasanHariIni()
    {
        var badan = Badan(
            Job("menunggu", HariIni),
            Job("tersimpan", HariIni),
            Job("sedang_dihantar", HariIni),
            Job("disahkan", HariIni),
            Job("menunggu", Semalam));

        Assert.Equal(3, LoopbackKerjaHariIniSource.KiraKerjaBelumSiap(badan, HariIni));
    }

    [Fact]
    public void KiraKerjaBelumSiap_SenaraiKosong_AdalahSifarYangSah()
    {
        Assert.Equal(0, LoopbackKerjaHariIniSource.KiraKerjaBelumSiap("{\"ok\":true,\"senarai\":[]}", HariIni));
        Assert.Equal(0, LoopbackKerjaHariIniSource.KiraKerjaBelumSiap(
            "{\"ok\":true,\"senarai\":[],\"nota\":\"Rahsia enjin belum ditetapkan pada PC ini.\"}", HariIni));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("<html>not json</html>")]
    [InlineData("{\"ok\":true}")]                     // no senarai -> unreadable, NOT zero
    [InlineData("{\"senarai\":\"bukan array\"}")]
    [InlineData("[1,2,3]")]
    [InlineData("{\"ok\":false,\"senarai\":[]}")]     // error envelope -> unknown, NOT "no work"
    [InlineData("{\"ok\":\"true\",\"senarai\":[]}")]  // non-boolean ok -> unknown, NOT "no work"
    [InlineData("{\"senarai\":[]}")]                  // no ok at all -> unknown, NOT "no work"
    public void KiraKerjaBelumSiap_BadanTidakDijangka_PulangkanNull(string badan)
    {
        Assert.Null(LoopbackKerjaHariIniSource.KiraKerjaBelumSiap(badan, HariIni));
    }

    [Fact]
    public void KiraKerjaBelumSiap_AmplopRalatDenganTugasan_TetapTidakPasti()
    {
        // An error envelope that still carries entries is NOT an answer about
        // the queue: counting it would either invent demand or (worse) zero a
        // real demand signal. Unreadable is the only honest reading.
        var amplop = "{\"ok\":false,\"ralat\":\"Ralat backend\",\"senarai\":[" + Job("menunggu", HariIni) + "]}";
        Assert.Null(LoopbackKerjaHariIniSource.KiraKerjaBelumSiap(amplop, HariIni));

        // The same list under a good envelope still counts, so the guard is not
        // hiding real demand.
        Assert.Equal(1, LoopbackKerjaHariIniSource.KiraKerjaBelumSiap(
            "{\"ok\":true,\"senarai\":[" + Job("menunggu", HariIni) + "]}", HariIni));
    }

    [Fact]
    public void TarikhSama_PerbandinganOrdinalSepuluhAksara()
    {
        // A timestamp ("2026-09-22T08:00:00Z") counts as that day; a short or
        // different value never counts.
        Assert.Equal(1, LoopbackKerjaHariIniSource.KiraKerjaBelumSiap(
            Badan(Job("menunggu", "2026-09-22T08:00:00Z")), HariIni));
        Assert.Equal(0, LoopbackKerjaHariIniSource.KiraKerjaBelumSiap(Badan(Job("menunggu", "2026-9-22")), HariIni));
        Assert.Equal(0, LoopbackKerjaHariIniSource.KiraKerjaBelumSiap(Badan(Job("menunggu", "")), HariIni));
    }

    [Fact]
    public void BacaNota_MengambilNotaEnjinSahaja()
    {
        Assert.Equal("Rahsia enjin belum ditetapkan.",
            LoopbackKerjaHariIniSource.BacaNota("{\"ok\":true,\"senarai\":[],\"nota\":\"Rahsia enjin belum ditetapkan.\"}"));
        Assert.Equal(string.Empty, LoopbackKerjaHariIniSource.BacaNota("{\"ok\":true,\"senarai\":[]}"));
        Assert.Equal(string.Empty, LoopbackKerjaHariIniSource.BacaNota("bukan json"));
    }

    // ---------- HTTP integration ----------

    [Fact]
    public async Task SemakAsync_TugasanMenungguHariIni_AdaKerjaSatu()
    {
        var badan = Badan(Job("menunggu", HariIni), Job("disahkan", HariIni));
        using var server = new FakeKerjaServer(TestNonce, badan, rejectKerja: false);
        using var sumber = new LoopbackKerjaHariIniSource(server.BaseUrl, TimeSpan.FromSeconds(5), JamTetap(HariIni));

        var hasil = await sumber.SemakAsync();

        Assert.True(hasil.AdaKerja);
        Assert.True(hasil.EnjinBolehDicapai);
        Assert.Equal(1, hasil.BilanganKerja);
        Assert.Contains("belum siap", hasil.Sebab);

        // Exactly the handshake and the read-only list — nothing else, and the
        // nonce travels in the HEADER, never in a query string.
        Assert.Equal(new[] { "/", "/api/lokal/kerja-hari-ini" }, server.RequestPaths.ToArray());
        Assert.DoesNotContain(server.RequestPaths, p => p.Contains("?n="));
        Assert.Contains("/api/lokal/kerja-hari-ini", server.AuthorisedKerjaCalls);

        // /api/lokal/kerja-hari-ini is a nonce-only /api/lokal/* route: the nonce
        // header authorises it and NO Origin header is sent.
        Assert.Equal(TestNonce, server.LastKerjaNonceHeader);
        Assert.Equal(string.Empty, server.LastKerjaOriginHeader);
    }

    [Fact]
    public async Task SemakAsync_SenaraiKosong_TiadaKerjaTetapiEnjinBolehDicapai()
    {
        using var server = new FakeKerjaServer(TestNonce, "{\"ok\":true,\"senarai\":[]}", rejectKerja: false);
        using var sumber = new LoopbackKerjaHariIniSource(server.BaseUrl, TimeSpan.FromSeconds(5), JamTetap(HariIni));

        var hasil = await sumber.SemakAsync();

        Assert.False(hasil.AdaKerja);
        Assert.True(hasil.EnjinBolehDicapai);      // "no work" and "no engine" are DIFFERENT answers
        Assert.Equal(0, hasil.BilanganKerja);
        Assert.Contains("Tiada tugasan MOEIS belum siap", hasil.Sebab);
    }

    [Fact]
    public async Task SemakAsync_TugasanSemalamSahaja_TiadaKerja()
    {
        using var server = new FakeKerjaServer(TestNonce, Badan(Job("menunggu", Semalam)), rejectKerja: false);
        using var sumber = new LoopbackKerjaHariIniSource(server.BaseUrl, TimeSpan.FromSeconds(5), JamTetap(HariIni));

        var hasil = await sumber.SemakAsync();

        Assert.False(hasil.AdaKerja);
        Assert.True(hasil.EnjinBolehDicapai);
    }

    [Fact]
    public async Task SemakAsync_EnjinMenolakKerja_TidakPastiBukanAdaKerja()
    {
        using var server = new FakeKerjaServer(TestNonce, Badan(Job("menunggu", HariIni)), rejectKerja: true);
        using var sumber = new LoopbackKerjaHariIniSource(server.BaseUrl, TimeSpan.FromSeconds(5), JamTetap(HariIni));

        var hasil = await sumber.SemakAsync();

        Assert.False(hasil.AdaKerja);
        Assert.False(hasil.EnjinBolehDicapai);     // never guessed as "ada kerja"
        Assert.Contains("401/403", hasil.Sebab);
    }

    [Fact]
    public async Task SemakAsync_BadanTidakDibaca_TidakPasti()
    {
        using var server = new FakeKerjaServer(TestNonce, "<html>login page</html>", rejectKerja: false);
        using var sumber = new LoopbackKerjaHariIniSource(server.BaseUrl, TimeSpan.FromSeconds(5), JamTetap(HariIni));

        var hasil = await sumber.SemakAsync();

        Assert.False(hasil.AdaKerja);
        Assert.False(hasil.EnjinBolehDicapai);
        Assert.Contains("tidak dapat dibaca", hasil.Sebab);
    }

    [Fact]
    public async Task SemakAsync_EnjinTiada_TidakPastiTanpaLontaran()
    {
        var unusedPort = GetUnusedPort();
        using var sumber = new LoopbackKerjaHariIniSource($"http://127.0.0.1:{unusedPort}", TimeSpan.FromSeconds(5), JamTetap(HariIni));

        var hasil = await sumber.SemakAsync();

        Assert.False(hasil.AdaKerja);
        Assert.False(hasil.EnjinBolehDicapai);
        Assert.Contains("tidak berjalan", hasil.Sebab);
    }

    [Fact]
    public async Task SemakAsync_EnjinRalatDalaman_TidakPastiBukanAdaKerja()
    {
        using var server = new FakeKerjaServer(TestNonce, Badan(Job("menunggu", HariIni)), rejectKerja: false, statusKerja: 500);
        using var sumber = new LoopbackKerjaHariIniSource(server.BaseUrl, TimeSpan.FromSeconds(5), JamTetap(HariIni));

        var hasil = await sumber.SemakAsync();

        Assert.False(hasil.AdaKerja);
        Assert.False(hasil.EnjinBolehDicapai);
        Assert.Contains("HTTP 500", hasil.Sebab);
    }

    [Fact]
    public async Task SemakAsync_AmplopRalatDenganTugasan_TidakPasti()
    {
        // HTTP 200 with `ok:false` (an error envelope that still lists a today
        // job) must never be read as work — nor as "no work".
        var badan = "{\"ok\":false,\"ralat\":\"Ralat backend\",\"senarai\":[" + Job("menunggu", HariIni) + "]}";
        using var server = new FakeKerjaServer(TestNonce, badan, rejectKerja: false);
        using var sumber = new LoopbackKerjaHariIniSource(server.BaseUrl, TimeSpan.FromSeconds(5), JamTetap(HariIni));

        var hasil = await sumber.SemakAsync();

        Assert.False(hasil.AdaKerja);
        Assert.False(hasil.EnjinBolehDicapai);
        Assert.Contains("tidak dapat dibaca", hasil.Sebab);
    }

    [Fact]
    public async Task SemakAsync_EnjinTerlaluLama_TidakPastiTanpaLontaran()
    {
        // The engine answers far too late: a timeout is "tidak dapat dipastikan",
        // never "ada kerja", and never a thrown task (the tray's cycle runs in an
        // `async void` handler).
        using var server = new FakeKerjaServer(TestNonce, Badan(Job("menunggu", HariIni)), rejectKerja: false, delayKerjaMs: 3000);
        using var sumber = new LoopbackKerjaHariIniSource(server.BaseUrl, TimeSpan.FromMilliseconds(400), JamTetap(HariIni));

        var hasil = await sumber.SemakAsync();

        Assert.False(hasil.AdaKerja);
        Assert.False(hasil.EnjinBolehDicapai);
        Assert.Contains("Masa tamat", hasil.Sebab);
    }

    [Fact]
    public async Task SemakAsync_HandshakeGagal_TidakHantarPermintaanKerja()
    {
        // The handshake never yields a usable nonce (no redirect at all): the
        // client must stop there and never ask for the job list.
        using var server = new FakeKerjaServer(TestNonce, Badan(Job("menunggu", HariIni)), rejectKerja: false, handshakeOk: false);
        using var sumber = new LoopbackKerjaHariIniSource(server.BaseUrl, TimeSpan.FromSeconds(5), JamTetap(HariIni));

        var hasil = await sumber.SemakAsync();

        Assert.False(hasil.AdaKerja);
        Assert.False(hasil.EnjinBolehDicapai);
        Assert.DoesNotContain("/api/lokal/kerja-hari-ini", server.RequestPaths);
    }

    [Fact]
    public async Task SemakAsync_NonceTidakPernahBocorDalamHasil()
    {
        using var server = new FakeKerjaServer(TestNonce, Badan(Job("menunggu", HariIni)), rejectKerja: false);
        using var sumber = new LoopbackKerjaHariIniSource(server.BaseUrl, TimeSpan.FromSeconds(5), JamTetap(HariIni));

        var hasil = await sumber.SemakAsync();

        Assert.True(hasil.AdaKerja);
        Assert.DoesNotContain(TestNonce, hasil.Sebab);
        Assert.DoesNotContain(TestNonce, sumber.TarikhHariIni());
    }

    [Fact]
    public async Task SemakAsync_SambunganDiputuskan_TidakPastiTanpaLontaran()
    {
        // A connection torn down mid-answer raises an HttpRequestException whose
        // inner cause is NOT one of the classified socket errors. The contract
        // is the same regardless: uncertain, never "ada kerja", and never a
        // thrown task (which would fault the tray's async void handler).
        using var server = new FakeKerjaServer(TestNonce, Badan(Job("menunggu", HariIni)), rejectKerja: false, abortKerja: true);
        using var sumber = new LoopbackKerjaHariIniSource(server.BaseUrl, TimeSpan.FromSeconds(5), JamTetap(HariIni));

        var hasil = await sumber.SemakAsync();

        Assert.False(hasil.AdaKerja);
        Assert.False(hasil.EnjinBolehDicapai);
        Assert.DoesNotContain(TestNonce, hasil.Sebab);
    }

    [Fact]
    public async Task SemakAsync_MenghormatiPembatalan()
    {
        using var server = new FakeKerjaServer(TestNonce, Badan(Job("menunggu", HariIni)), rejectKerja: false);
        using var sumber = new LoopbackKerjaHariIniSource(server.BaseUrl, TimeSpan.FromSeconds(5), JamTetap(HariIni));
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => sumber.SemakAsync(cts.Token));
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
    /// Minimal loopback stand-in for the companion's nonce handshake + read-only
    /// job list. Records exactly which paths were called, whether the nonce
    /// header authorised the job list, and whether an Origin header was sent.
    /// </summary>
    private sealed class FakeKerjaServer : IDisposable
    {
        private readonly HttpListener _listener = new();
        private readonly string _nonce;
        private readonly string _kerjaBody;
        private readonly bool _rejectKerja;
        private readonly bool _handshakeOk;
        private readonly bool _abortKerja;
        private readonly int _statusKerja;
        private readonly int _delayKerjaMs;
        private readonly object _gate = new();
        private readonly List<string> _requestPaths = new();
        private readonly List<string> _authorisedKerjaCalls = new();

        public string BaseUrl { get; }
        public string LastKerjaNonceHeader { get; private set; } = "";
        public string LastKerjaOriginHeader { get; private set; } = "";

        public string[] RequestPaths { get { lock (_gate) return _requestPaths.ToArray(); } }
        public string[] AuthorisedKerjaCalls { get { lock (_gate) return _authorisedKerjaCalls.ToArray(); } }

        public FakeKerjaServer(
            string nonce, string kerjaBody, bool rejectKerja, bool handshakeOk = true,
            bool abortKerja = false, int statusKerja = 200, int delayKerjaMs = 0)
        {
            _nonce = nonce;
            _kerjaBody = kerjaBody;
            _rejectKerja = rejectKerja;
            _handshakeOk = handshakeOk;
            _abortKerja = abortKerja;
            _statusKerja = statusKerja;
            _delayKerjaMs = delayKerjaMs;

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
            lock (_gate) _requestPaths.Add(path);

            try
            {
                if (path == "/" && ctx.Request.HttpMethod == "GET")
                {
                    if (!_handshakeOk)
                    {
                        // No nonce handed out: this probe must stop here.
                        ctx.Response.StatusCode = 200;
                        ctx.Response.Headers["Cache-Control"] = "no-store";
                        ctx.Response.Close();
                        return;
                    }

                    ctx.Response.StatusCode = 302;
                    ctx.Response.Headers["Location"] = $"/?n={_nonce}";
                    ctx.Response.Headers["Cache-Control"] = "no-store";
                    ctx.Response.Close();
                    return;
                }

                if (path == "/api/lokal/kerja-hari-ini" && ctx.Request.HttpMethod == "GET")
                {
                    var nonceHeader = ctx.Request.Headers["X-HADIR-Lokal"] ?? "";
                    var originHeader = ctx.Request.Headers["Origin"] ?? "";
                    LastKerjaNonceHeader = nonceHeader;
                    LastKerjaOriginHeader = originHeader;

                    // Companion semantics (server.mjs): a request WITHOUT Origin is
                    // accepted iff X-HADIR-Lokal matches; the loopback UI Origin is
                    // NOT an allowed Origin for this non-`/api/lokal/*` route.
                    if (_abortKerja)
                    {
                        // Promise a body, then tear the connection down.
                        ctx.Response.StatusCode = 200;
                        ctx.Response.ContentType = "application/json; charset=utf-8";
                        ctx.Response.ContentLength64 = 4096;
                        ctx.Response.OutputStream.Write(new byte[] { (byte)'{' }, 0, 1);
                        ctx.Response.Abort();
                        return;
                    }

                    var authorised = string.Equals(nonceHeader, _nonce, StringComparison.Ordinal);
                    if (_rejectKerja || !authorised)
                    {
                        ctx.Response.StatusCode = 403;
                        ctx.Response.Close();
                        return;
                    }

                    lock (_gate) _authorisedKerjaCalls.Add(path);

                    // Answer late / with an error status when the test asks for it.
                    if (_delayKerjaMs > 0) Thread.Sleep(_delayKerjaMs);
                    if (_statusKerja != 200)
                    {
                        ctx.Response.StatusCode = _statusKerja;
                        ctx.Response.ContentType = "application/json; charset=utf-8";
                        ctx.Response.Close();
                        return;
                    }

                    var bytes = Encoding.UTF8.GetBytes(_kerjaBody);
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
