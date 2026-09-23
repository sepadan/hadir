using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// The retry policy of <see cref="HadirBackendClient"/> against a FAKE
/// <see cref="HttpMessageHandler"/> — no socket, no Apps Script, no real
/// network and a throwaway secret. It proves, per the 2026-09-23 live bug
/// (a single 20 s timeout killed a whole cycle):
///
///   (a) a TIMEOUT on the read call is retried (2 s backoff) and can succeed;
///   (b) an HTML body (Apps Script's 404/403 blocking page) is retried;
///   (c) state-changing calls (klaim / lepas / selesai) are NEVER retried —
///       not even when the failure is classified temporary;
///   (d) the failure reasons are three DISTINCT sentences: "backend sibuk
///       (masa tamat)" vs "backend balas bukan-JSON" vs "backend tolak".
///
/// Plus the fixed facts: default timeout 60 s, backoff ladder 2 s / 6 s / 15 s,
/// maximum 3 read attempts, ok:false never retried, and no secret, IC, token
/// or response body ever inside a message.
/// </summary>
public class HadirBackendClientCubaSemulaTests
{
    private const string Rahsia = "rahsia-enjin-ujian-000111222";
    private const string ApiUrl = "https://script.google.com/macros/d/CONTOH/exec";
    /// <summary>A valid success envelope with an empty task list: {ok:true,hasil:[]}.</summary>
    private const string BerjayaKosong = "{\"ok\":true,\"hasil\":[]}";

    /// <summary>Scripted handler: answers per ATTEMPT (1-based). No network.</summary>
    private sealed class HandlerPalsu : HttpMessageHandler
    {
        private readonly Func<int, CancellationToken, Task<HttpResponseMessage>> _jawab;
        private int _bil;

        public HandlerPalsu(Func<int, CancellationToken, Task<HttpResponseMessage>> jawab) => _jawab = jawab;

        public int BilPanggilan => Volatile.Read(ref _bil);

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var n = Interlocked.Increment(ref _bil);
            return _jawab(n, cancellationToken);
        }
    }

    /// <summary>Records backoff waits instead of actually waiting.</summary>
    private sealed class Rakam
    {
        public List<TimeSpan> Jeda { get; } = new();

        public Task Tunggu(TimeSpan jeda, CancellationToken ct)
        {
            Jeda.Add(jeda);
            return Task.CompletedTask;
        }
    }

    private static HttpResponseMessage Json(HttpStatusCode status, string badan) => new(status)
    {
        Content = new StringContent(badan, Encoding.UTF8, "application/json"),
    };

    private static HttpResponseMessage Html(HttpStatusCode status) => new(status)
    {
        Content = new StringContent("<html><body>404 Not Found</body></html>", Encoding.UTF8, "text/html"),
    };

    private static (HadirBackendClient klien, Rakam rakam) Klien(HandlerPalsu handler, TimeSpan? tamatMasa = null)
    {
        var rakam = new Rakam();
        var klien = new HadirBackendClient(
            new HttpClient(handler), ApiUrl, Rahsia,
            tamatMasa ?? TimeSpan.FromSeconds(2),
            tunggu: rakam.Tunggu);
        return (klien, rakam);
    }

    // ---------- had masa lalai & jadual jeda (tugasan 1) ----------

    [Fact]
    public void Pemalar_60s_Jadual2_6_15_Maks3()
    {
        Assert.Equal(TimeSpan.FromSeconds(60), HadirBackendClient.TamatMasaLalai);
        Assert.Equal(
            new[] { TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(6), TimeSpan.FromSeconds(15) },
            HadirBackendClient.JedaCubaSemulaLalai);
        Assert.Equal(3, HadirBackendClient.CubaanBacaLalai);
    }

    // ---------- (a) masa tamat -> cuba semula -> berjaya ----------

    [Fact]
    public async Task MasaTamat_DicubaSemula_DanBerjaya()
    {
        // Attempt 1 stalls past the per-call budget (300 ms) — a REAL timeout
        // through the client's own CancellationTokenSource; attempt 2 answers.
        var handler = new HandlerPalsu(async (n, ct) =>
        {
            if (n == 1) await Task.Delay(TimeSpan.FromSeconds(60), ct);
            return Json(HttpStatusCode.OK, BerjayaKosong);
        });
        var (klien, rakam) = Klien(handler, tamatMasa: TimeSpan.FromMilliseconds(300));

        var senarai = await klien.SenaraiAsync();

        Assert.Empty(senarai);
        Assert.Equal(2, handler.BilPanggilan);
        // Exactly one backoff, exactly the FIRST rung of the ladder.
        Assert.Equal(new[] { TimeSpan.FromSeconds(2) }, rakam.Jeda);
    }

    // ---------- (b) HTML 404 -> cuba semula ----------

    [Fact]
    public async Task Html404_DicubaSemula_DanBerjaya()
    {
        var handler = new HandlerPalsu((n, _) => Task.FromResult(
            n == 1 ? Html(HttpStatusCode.NotFound) : Json(HttpStatusCode.OK, BerjayaKosong)));
        var (klien, rakam) = Klien(handler);

        var senarai = await klien.SenaraiAsync();

        Assert.Empty(senarai);
        Assert.Equal(2, handler.BilPanggilan);
        Assert.Equal(new[] { TimeSpan.FromSeconds(2) }, rakam.Jeda);
    }

    [Fact]
    public async Task Status5xx_DicubaSemula_DanBerjaya()
    {
        var handler = new HandlerPalsu((n, _) => Task.FromResult(
            n == 1 ? Html(HttpStatusCode.ServiceUnavailable) : Json(HttpStatusCode.OK, BerjayaKosong)));
        var (klien, rakam) = Klien(handler);

        var senarai = await klien.SenaraiAsync();

        Assert.Empty(senarai);
        Assert.Equal(2, handler.BilPanggilan);
        Assert.Equal(new[] { TimeSpan.FromSeconds(2) }, rakam.Jeda);
    }

    [Fact]
    public async Task MasaTamatBerterusan_Maks3Cubaan_Jeda2sDan6s()
    {
        var handler = new HandlerPalsu(async (_, ct) =>
        {
            await Task.Delay(TimeSpan.FromSeconds(60), ct);
            return Json(HttpStatusCode.OK, BerjayaKosong);
        });
        var (klien, rakam) = Klien(handler, tamatMasa: TimeSpan.FromMilliseconds(200));

        var ex = await Assert.ThrowsAsync<HadirBackendException>(() => klien.SenaraiAsync());

        Assert.Equal(3, handler.BilPanggilan);                       // maksimum 3 percubaan
        Assert.Equal(new[] { TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(6) }, rakam.Jeda);
        Assert.Contains("backend sibuk (masa tamat)", ex.Message);
        Assert.True(ex.Sementara);
    }

    // ---------- (c) panggilan UBAH tidak pernah dicuba semula ----------

    [Fact]
    public async Task Klaim_Html404_TidakDicubaSemula()
    {
        var handler = new HandlerPalsu((_, _) => Task.FromResult(Html(HttpStatusCode.NotFound)));
        var (klien, rakam) = Klien(handler);

        await Assert.ThrowsAsync<HadirBackendException>(
            () => klien.KlaimAsync("job-1", "pc-1", ModKlaim.Biasa));

        Assert.Equal(1, handler.BilPanggilan);
        Assert.Empty(rakam.Jeda);
    }

    [Fact]
    public async Task Lepas_Html404_TidakDicubaSemula()
    {
        var handler = new HandlerPalsu((_, _) => Task.FromResult(Html(HttpStatusCode.NotFound)));
        var (klien, rakam) = Klien(handler);

        await Assert.ThrowsAsync<HadirBackendException>(() => klien.LepasAsync("job-1", "pc-1"));

        Assert.Equal(1, handler.BilPanggilan);
        Assert.Empty(rakam.Jeda);
    }

    [Fact]
    public async Task Selesai_Html404_TidakDicubaSemula()
    {
        var handler = new HandlerPalsu((_, _) => Task.FromResult(Html(HttpStatusCode.NotFound)));
        var (klien, rakam) = Klien(handler);

        await Assert.ThrowsAsync<HadirBackendException>(
            () => klien.SelesaiAsync("job-1", "berjaya", "", 12, "pc-1"));

        Assert.Equal(1, handler.BilPanggilan);
        Assert.Empty(rakam.Jeda);
    }

    [Fact]
    public async Task Selesai_MasaTamat_TetapTidakDicubaSemula()
    {
        // The KEY case: a timeout IS classified temporary, yet a write call
        // must never loop — only the baca-tulen gate earns a retry.
        var handler = new HandlerPalsu(async (_, ct) =>
        {
            await Task.Delay(TimeSpan.FromSeconds(60), ct);
            return Json(HttpStatusCode.OK, BerjayaKosong);
        });
        var (klien, rakam) = Klien(handler, tamatMasa: TimeSpan.FromMilliseconds(200));

        var ex = await Assert.ThrowsAsync<HadirBackendException>(
            () => klien.SelesaiAsync("job-1", "berjaya", "", 12, "pc-1"));

        Assert.Equal(1, handler.BilPanggilan);
        Assert.Empty(rakam.Jeda);
        Assert.True(ex.Sementara);   // classified temporary — but a write: never retried
    }

    // ---------- (d) sebab berbeza dan jelas ----------

    [Fact]
    public async Task SebabTigaJenis_BezaDanBetul_TanpaRahsiaAtauBadan()
    {
        // 1. timeout
        var handlerTimeout = new HandlerPalsu((_, _) =>
            throw new TaskCanceledException());
        var (klienTimeout, _) = Klien(handlerTimeout);
        var exTimeout = await Assert.ThrowsAsync<HadirBackendException>(() => klienTimeout.SenaraiAsync());

        // 2. HTML 404 (always)
        var handlerHtml = new HandlerPalsu((_, _) => Task.FromResult(Html(HttpStatusCode.NotFound)));
        var (klienHtml, _) = Klien(handlerHtml);
        var exHtml = await Assert.ThrowsAsync<HadirBackendException>(() => klienHtml.SenaraiAsync());

        // 3. backend tolak (ok:false — a JSON rejection)
        var handlerTolak = new HandlerPalsu((_, _) => Task.FromResult(
            Json(HttpStatusCode.OK, "{\"ok\":false,\"ralat\":\"Rahsia enjin tidak sah.\"}")));
        var (klienTolak, _) = Klien(handlerTolak);
        var exTolak = await Assert.ThrowsAsync<HadirBackendException>(() => klienTolak.SenaraiAsync());

        // Distinct labels, each saying exactly what happened.
        Assert.Contains("backend sibuk (masa tamat)", exTimeout.Message);
        Assert.Contains("backend balas bukan-JSON (status 404)", exHtml.Message);
        Assert.Contains("backend tolak: Rahsia enjin tidak sah.", exTolak.Message);

        Assert.NotEqual(exTimeout.Message, exHtml.Message);
        Assert.NotEqual(exTimeout.Message, exTolak.Message);
        Assert.NotEqual(exHtml.Message, exTolak.Message);

        // Temporary vs final classification drives the retry gate.
        Assert.True(exTimeout.Sementara);
        Assert.True(exHtml.Sementara);
        Assert.False(exTolak.Sementara);

        // Secrets and bodies never enter a message (rahsia, HTML, raw body).
        foreach (var mesej in new[] { exTimeout.Message, exHtml.Message, exTolak.Message })
        {
            Assert.DoesNotContain(Rahsia, mesej);
            Assert.DoesNotContain("<html", mesej, StringComparison.OrdinalIgnoreCase);
        }

        // The rejection was attempted EXACTLY once; the two temporary reads
        // burned their full allowance of 3 attempts.
        Assert.Equal(1, handlerTolak.BilPanggilan);
        Assert.Equal(3, handlerTimeout.BilPanggilan);
        Assert.Equal(3, handlerHtml.BilPanggilan);
    }

    // ---------- baca-tulen sahaja: tolak tidak dicuba semula ----------

    [Fact]
    public async Task Senarai_BackendTolak_TidakDicubaSemula()
    {
        var handler = new HandlerPalsu((_, _) => Task.FromResult(
            Json(HttpStatusCode.OK, "{\"ok\":false,\"ralat\":\"Tugasan tidak ditemui.\"}")));
        var (klien, rakam) = Klien(handler);

        var ex = await Assert.ThrowsAsync<HadirBackendException>(() => klien.SenaraiAsync());

        Assert.Equal(1, handler.BilPanggilan);
        Assert.Empty(rakam.Jeda);
        Assert.Contains("backend tolak: Tugasan tidak ditemui.", ex.Message);
        Assert.False(ex.Sementara);
    }
}
