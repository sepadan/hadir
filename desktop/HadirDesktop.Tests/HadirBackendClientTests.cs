using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Real HTTP tests for <see cref="HadirBackendClient"/> against an in-process
/// fake HADIR backend (HttpListener on a loopback ephemeral port). Nothing here
/// touches the real Apps Script deployment, and no real engine secret is used.
/// </summary>
public class HadirBackendClientTests
{
    private const string Rahsia = "rahsia-enjin-ujian-000111222";

    private static HadirBackendClient Klien(FakeBackendJob server, string? rahsia = null) =>
        new(new HttpClient(), server.BaseUrl, rahsia ?? Rahsia, TimeSpan.FromSeconds(5));

    // ---------- wire shape ----------

    [Fact]
    public async Task Senarai_MenghantarBentukWayarYangBetul()
    {
        using var server = new FakeBackendJob(_ => (true, "[]", ""));
        await Klien(server).SenaraiAsync();

        var p = Assert.Single(server.Permintaan);
        Assert.Equal("POST", p.Kaedah);
        Assert.Equal("hadir", p.Mode);
        Assert.Equal("moeisJobSenarai", p.KaedahRpc);
        // ['', rahsia] — empty admin-token slot, then the engine secret.
        Assert.Equal(2, p.Argumen.Count);
        Assert.Equal("", p.Argumen[0].GetString());
        Assert.Equal(Rahsia, p.Argumen[1].GetString());
    }

    [Fact]
    public async Task Senarai_MenghantarContentTypeTeksBiasaDanUserAgentPelayar()
    {
        using var server = new FakeBackendJob(_ => (true, "[]", ""));
        await Klien(server).SenaraiAsync();

        var p = Assert.Single(server.Permintaan);
        // text/plain — an Apps Script Web App rejects a JSON preflight.
        Assert.StartsWith("text/plain", p.ContentType, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("utf-8", p.ContentType, StringComparison.OrdinalIgnoreCase);
        // Browser UA is MANDATORY: without it Apps Script answers /exec with a
        // 404 redirect whose body is not JSON.
        Assert.Contains("Mozilla/5.0", p.UserAgent);
        Assert.DoesNotContain("HadirDesktop", p.UserAgent);
    }

    [Fact]
    public async Task Rahsia_TidakPernahDalamLaluanAtauQuery()
    {
        using var server = new FakeBackendJob(_ => (true, "null", ""));
        var klien = Klien(server);
        await klien.LepasAsync("job-1", "pc-1");

        Assert.All(server.Permintaan, p => Assert.DoesNotContain(Rahsia, p.LaluanDanQuery));
    }

    // ---------- senarai ----------

    [Fact]
    public async Task Senarai_MembacaMedanTugasanDanMurid()
    {
        using var server = new FakeBackendJob(_ => (true, """
        [{"id":"job-1","tarikhIso":"2026-09-23","kelas":"PRASEKOLAH","status":"menunggu","mesej":"",
          "kelasMoeisId":"K1","murid":[{"id":"m1","nama":"AISYAH","kategori":"SAKIT","sebab":"DEMAM"}]}]
        """, ""));

        var senarai = await Klien(server).SenaraiAsync();

        var kerja = Assert.Single(senarai);
        Assert.Equal("job-1", kerja.Id);
        Assert.Equal("PRASEKOLAH", kerja.Kelas);
        Assert.Equal("2026-09-23", kerja.TarikhIso);
        Assert.Equal("menunggu", kerja.Status);
        Assert.Equal("K1", kerja.KelasMoeisId);
        var murid = Assert.Single(kerja.Murid);
        Assert.Equal("AISYAH", murid.Nama);
        Assert.Equal("SAKIT", murid.Kategori);
        Assert.Equal("DEMAM", murid.Sebab);
    }

    [Fact]
    public async Task Senarai_MembuangIcDaripadaRekodMurid()
    {
        using var server = new FakeBackendJob(_ => (true, """
        [{"id":"job-1","kelas":"PRASEKOLAH","status":"menunggu",
          "murid":[{"id":"m1","nama":"AISYAH","kategori":"SAKIT","sebab":"DEMAM","ic":"010203040506"}]}]
        """, ""));

        var senarai = await Klien(server).SenaraiAsync();

        var murid = Assert.Single(Assert.Single(senarai).Murid);
        // The allowlist rebuild means the IC has nowhere to land at all.
        Assert.Equal("m1", murid.Id);
        Assert.DoesNotContain("010203040506", murid.Id + murid.Nama + murid.Kategori + murid.Sebab);
    }

    [Fact]
    public async Task Senarai_KosongAdalahSenaraiKosong()
    {
        using var server = new FakeBackendJob(_ => (true, "[]", ""));
        Assert.Empty(await Klien(server).SenaraiAsync());
    }

    [Fact]
    public void BacaSenarai_BukanTatasusunan_Melontar_BukanSenaraiKosong()
    {
        // "unreadable" must never be presented to the caller as "no work".
        Assert.Throws<HadirBackendException>(() => HadirBackendClient.BacaSenarai("null"));
        Assert.Throws<HadirBackendException>(() => HadirBackendClient.BacaSenarai("{\"a\":1}"));
        Assert.Throws<HadirBackendException>(() => HadirBackendClient.BacaSenarai("bukan-json"));
    }

    [Fact]
    public async Task Senarai_DicubaSemula3Kali_LaluanBaca()
    {
        var bil = 0;
        using var server = new FakeBackendJob(_ =>
        {
            bil++;
            return bil < 3 ? (false, "null", "Ralat sementara.") : (true, "[]", "");
        });

        var senarai = await Klien(server).SenaraiAsync();

        Assert.Empty(senarai);
        Assert.Equal(3, server.Permintaan.Count);
    }

    [Fact]
    public async Task Senarai_GagalSelepas3Cubaan_Melontar()
    {
        using var server = new FakeBackendJob(_ => (false, "null", "Rahsia enjin tidak sah."));

        var ex = await Assert.ThrowsAsync<HadirBackendException>(() => Klien(server).SenaraiAsync());

        Assert.Equal(3, server.Permintaan.Count);
        Assert.Contains("Rahsia enjin tidak sah.", ex.Message);
    }

    // ---------- klaim ----------

    [Fact]
    public async Task Klaim_MenghantarArgumenMengikutTertib()
    {
        using var server = new FakeBackendJob(_ => (true, """{"id":"job-1","kelas":"PRASEKOLAH"}""", ""));
        await Klien(server).KlaimAsync("job-1", "pc-1", ModKlaim.Biasa);

        var p = Assert.Single(server.Permintaan);
        Assert.Equal("moeisJobKlaim", p.KaedahRpc);
        Assert.Equal(4, p.Argumen.Count);
        Assert.Equal("job-1", p.Argumen[0].GetString());
        Assert.Equal("pc-1", p.Argumen[1].GetString());
        Assert.Equal(JsonValueKind.False, p.Argumen[2].ValueKind);
        Assert.Equal(Rahsia, p.Argumen[3].GetString());
    }

    [Fact]
    public async Task Klaim_ModCubaSemula_MenghantarBooleanBenar()
    {
        using var server = new FakeBackendJob(_ => (true, """{"id":"job-1"}""", ""));
        await Klien(server).KlaimAsync("job-1", "pc-1", ModKlaim.CubaSemula);

        Assert.Equal(JsonValueKind.True, Assert.Single(server.Permintaan).Argumen[2].ValueKind);
    }

    [Fact]
    public async Task Klaim_ModVerifikasi_MenghantarRentetan_BukanBoolean()
    {
        // The `!!` trap called out in klien-hadir.mjs: 'verifikasi' must NOT be
        // coerced into `true` (read-only claim vs failed-task retry claim).
        using var server = new FakeBackendJob(_ => (true, """{"id":"job-1"}""", ""));
        await Klien(server).KlaimAsync("job-1", "pc-1", ModKlaim.Verifikasi);

        var arg = Assert.Single(server.Permintaan).Argumen[2];
        Assert.Equal(JsonValueKind.String, arg.ValueKind);
        Assert.Equal("verifikasi", arg.GetString());
    }

    [Fact]
    public async Task Klaim_HasilNull_PulangNull_BukanRalat()
    {
        using var server = new FakeBackendJob(_ => (true, "null", ""));

        Assert.Null(await Klien(server).KlaimAsync("job-1", "pc-1", ModKlaim.Biasa));
    }

    [Fact]
    public async Task Klaim_Berjaya_MembacaMuridDanKelas()
    {
        using var server = new FakeBackendJob(_ => (true, """
        {"id":"job-1","tarikhIso":"2026-09-23","kelas":"PRASEKOLAH","kelasMoeisId":"K1",
         "murid":[{"id":"","nama":"AISYAH","kategori":"SAKIT","sebab":"DEMAM","ic":"010203040506"}]}
        """, ""));

        var klaim = await Klien(server).KlaimAsync("job-1", "pc-1", ModKlaim.Biasa);

        Assert.NotNull(klaim);
        Assert.Equal("job-1", klaim!.Id);
        Assert.Equal("PRASEKOLAH", klaim.Kelas);
        Assert.Equal("2026-09-23", klaim.TarikhIso);
        var murid = Assert.Single(klaim.Murid);
        Assert.Equal("AISYAH", murid.Nama);
        Assert.DoesNotContain("010203040506", murid.Id + murid.Nama);
    }

    [Fact]
    public void BacaKlaim_ObjekTanpaId_Melontar()
    {
        Assert.Throws<HadirBackendException>(() => HadirBackendClient.BacaKlaim("""{"kelas":"PRASEKOLAH"}"""));
    }

    [Fact]
    public async Task Klaim_TIDAKDicubaSemula()
    {
        using var server = new FakeBackendJob(_ => (false, "null", "Tugasan tidak ditemui."));

        await Assert.ThrowsAsync<HadirBackendException>(() => Klien(server).KlaimAsync("job-1", "pc-1", ModKlaim.Biasa));

        Assert.Single(server.Permintaan);   // exactly ONE attempt
    }

    // ---------- lepas / selesai ----------

    [Fact]
    public async Task Lepas_MenghantarArgumenDanTIDAKDicubaSemula()
    {
        using var server = new FakeBackendJob(_ => (false, "null", "Hanya pemilik tugasan boleh melepaskannya."));

        await Assert.ThrowsAsync<HadirBackendException>(() => Klien(server).LepasAsync("job-1", "pc-1"));

        var p = Assert.Single(server.Permintaan);
        Assert.Equal("moeisJobLepas", p.KaedahRpc);
        Assert.Equal(3, p.Argumen.Count);
        Assert.Equal("job-1", p.Argumen[0].GetString());
        Assert.Equal("pc-1", p.Argumen[1].GetString());
        Assert.Equal(Rahsia, p.Argumen[2].GetString());
    }

    [Fact]
    public async Task Selesai_MenghantarArgumenMengikutTertib()
    {
        using var server = new FakeBackendJob(_ => (true, """{"ok":true}""", ""));
        await Klien(server).SelesaiAsync("job-1", "berjaya", "Pengesahan berjaya.", 19, "pc-1");

        var p = Assert.Single(server.Permintaan);
        Assert.Equal("moeisJobSelesai", p.KaedahRpc);
        Assert.Equal(6, p.Argumen.Count);
        Assert.Equal("job-1", p.Argumen[0].GetString());
        Assert.Equal("berjaya", p.Argumen[1].GetString());
        Assert.Equal("Pengesahan berjaya.", p.Argumen[2].GetString());
        Assert.Equal(19, p.Argumen[3].GetInt32());
        Assert.Equal("pc-1", p.Argumen[4].GetString());
        Assert.Equal(Rahsia, p.Argumen[5].GetString());
    }

    [Fact]
    public async Task Selesai_BilHadirTidakDiketahui_MenghantarRentetanKosong_Bukan0()
    {
        using var server = new FakeBackendJob(_ => (true, """{"ok":true}""", ""));
        await Klien(server).SelesaiAsync("job-1", "gagal", "Sebab.", null, "pc-1");

        var arg = Assert.Single(server.Permintaan).Argumen[3];
        Assert.Equal(JsonValueKind.String, arg.ValueKind);
        Assert.Equal("", arg.GetString());
    }

    [Fact]
    public async Task Selesai_TIDAKDicubaSemula()
    {
        using var server = new FakeBackendJob(_ => (false, "null", "Status tugasan tidak sepadan."));

        await Assert.ThrowsAsync<HadirBackendException>(
            () => Klien(server).SelesaiAsync("job-1", "berjaya", "m", null, "pc-1"));

        Assert.Single(server.Permintaan);
    }

    // ---------- failure taxonomy ----------

    [Fact]
    public async Task BalasanBukanJson_MelontarDenganStatusSahaja()
    {
        using var server = new FakeBackendJob(_ => (true, "null", ""), balasanMentah: ("<html>404</html>", 404));

        var ex = await Assert.ThrowsAsync<HadirBackendException>(
            () => Klien(server).KlaimAsync("job-1", "pc-1", ModKlaim.Biasa));

        Assert.Contains("Balasan bukan JSON (status 404)", ex.Message);
        Assert.DoesNotContain("<html>", ex.Message);
    }

    [Fact]
    public async Task TiadaPelayan_MelontarHadirBackendException()
    {
        var port = PortTidakDigunakan();
        var klien = new HadirBackendClient(new HttpClient(), $"http://127.0.0.1:{port}/", Rahsia, TimeSpan.FromSeconds(2));

        var ex = await Assert.ThrowsAsync<HadirBackendException>(() => klien.LepasAsync("job-1", "pc-1"));
        Assert.DoesNotContain(Rahsia, ex.Message);
    }

    // ---------- BackendKerjaPenuhSource ----------

    [Fact]
    public async Task BackendKerjaPenuhSource_Berjaya_MemulangkanSenarai()
    {
        using var server = new FakeBackendJob(_ => (true, """[{"id":"job-1","kelas":"A","status":"menunggu"}]""", ""));
        var sumber = new BackendKerjaPenuhSource(Klien(server));

        var jawapan = await sumber.SemakAsync();

        Assert.True(jawapan.EnjinBolehDicapai);
        Assert.Single(jawapan.Senarai);
    }

    [Fact]
    public async Task BackendKerjaPenuhSource_Gagal_TidakPasti_BukanSenaraiKosong()
    {
        using var server = new FakeBackendJob(_ => (false, "null", "Rahsia enjin tidak sah."));
        var sumber = new BackendKerjaPenuhSource(Klien(server));

        var jawapan = await sumber.SemakAsync();

        Assert.False(jawapan.EnjinBolehDicapai);
        Assert.Empty(jawapan.Senarai);
    }

    private static int PortTidakDigunakan()
    {
        using var probe = new TcpListener(IPAddress.Loopback, 0);
        probe.Start();
        var port = ((IPEndPoint)probe.LocalEndpoint).Port;
        probe.Stop();
        return port;
    }

    /// <summary>One recorded request, decomposed for assertions.</summary>
    internal sealed record PermintaanDirakam(
        string Kaedah,
        string LaluanDanQuery,
        string ContentType,
        string UserAgent,
        string Mode,
        string KaedahRpc,
        IReadOnlyList<JsonElement> Argumen);

    /// <summary>
    /// In-process fake of the HADIR job RPC surface. Records every request
    /// (method, headers, decoded arguments) and answers with the canned
    /// {ok,hasil} / {ok:false,ralat} envelope, or a raw non-JSON body.
    /// </summary>
    internal sealed class FakeBackendJob : IDisposable
    {
        private readonly HttpListener _listener = new();
        private readonly Func<string, (bool ok, string hasilJson, string ralat)> _jawab;
        private readonly (string badan, int status)? _mentah;
        private readonly object _gate = new();
        private readonly List<PermintaanDirakam> _permintaan = new();

        public string BaseUrl { get; }

        public IReadOnlyList<PermintaanDirakam> Permintaan
        {
            get { lock (_gate) return _permintaan.ToArray(); }
        }

        public FakeBackendJob(
            Func<string, (bool, string, string)> jawab,
            (string badan, int status)? balasanMentah = null)
        {
            _jawab = jawab;
            _mentah = balasanMentah;
            var port = PortTidakDigunakan();
            BaseUrl = $"http://127.0.0.1:{port}/";
            _listener.Prefixes.Add(BaseUrl);
            _listener.Start();
            _ = Task.Run(GelungTerima);
        }

        private async Task GelungTerima()
        {
            while (_listener.IsListening)
            {
                HttpListenerContext ctx;
                try { ctx = await _listener.GetContextAsync(); }
                catch { return; }
                Layan(ctx);
            }
        }

        private void Layan(HttpListenerContext ctx)
        {
            try
            {
                using var reader = new StreamReader(ctx.Request.InputStream, Encoding.UTF8);
                var badan = reader.ReadToEnd();
                using var doc = JsonDocument.Parse(badan);

                var mode = doc.RootElement.TryGetProperty("mode", out var m) ? m.GetString() ?? "" : "";
                var kaedah = doc.RootElement.TryGetProperty("kaedah", out var k) ? k.GetString() ?? "" : "";
                var argumen = new List<JsonElement>();
                if (doc.RootElement.TryGetProperty("argumen", out var a) && a.ValueKind == JsonValueKind.Array)
                {
                    foreach (var el in a.EnumerateArray()) argumen.Add(el.Clone());
                }

                lock (_gate)
                {
                    _permintaan.Add(new PermintaanDirakam(
                        ctx.Request.HttpMethod,
                        ctx.Request.Url!.PathAndQuery,
                        ctx.Request.ContentType ?? "",
                        ctx.Request.UserAgent ?? "",
                        mode, kaedah, argumen));
                }

                string balasan;
                var status = 200;
                if (_mentah is not null)
                {
                    balasan = _mentah.Value.badan;
                    status = _mentah.Value.status;
                }
                else
                {
                    var (ok, hasilJson, ralat) = _jawab(kaedah);
                    balasan = ok
                        ? $$"""{"ok":true,"hasil":{{hasilJson}}}"""
                        : $$"""{"ok":false,"ralat":{{JsonSerializer.Serialize(ralat)}}}""";
                }

                var bytes = Encoding.UTF8.GetBytes(balasan);
                ctx.Response.StatusCode = status;
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
