using System.Net;
using System.Text;
using System.Text.Json;
using System.Diagnostics;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

public class ConnectionCodeTests
{
    private const string Url = "https://script.google.com/macros/s/SYNTHETIC_DEPLOYMENT/exec";
    private static string Code(string url = Url) => "HC1." + Convert.ToBase64String(
        Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new[] { url, new string('a', 64) }))).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    [Fact]
    public void Decode_ValidatesEndpointAndDoesNotExposeCode()
    {
        var value = KodSambungan.Baca(Code());
        Assert.Equal(Url, value.ApiUrl);
        Assert.DoesNotContain(new string('a', 64), value.ToString());
        Assert.Throws<InvalidOperationException>(() => KodSambungan.Baca(Code() + "="));
    }

    [Theory]
    [InlineData("https://script.google.com.evil.test/macros/s/a/exec")]
    [InlineData("https://script.google.com/macros/s/a/exec?x=1")]
    [InlineData("https://script.google.com/macros/s/a/exec#x")]
    [InlineData("https://u@script.google.com/macros/s/a/exec")]
    [InlineData("https://script.google.com/macros/s/a/%65xec")]
    [InlineData("https://script.googleusercontent.com/macros/echo")]
    public void Decode_RejectsUnsafeUrls(string url) => Assert.Throws<InvalidOperationException>(() => KodSambungan.Baca(Code(url)));

    private static SambunganDesktopClient TestClient(HttpClient http) => new(http, new[] { Url }, (_, _) => Task.FromResult(false));

    private sealed class FakeHandler(Func<HttpRequestMessage, Task<HttpResponseMessage>> send) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct) => send(r);
    }

    [Fact]
    public async Task Redirect_OnlyOneGoogleEchoGet_NoCredentialReplay()
    {
        int calls = 0;
        using var http = new HttpClient(new AppsScriptHttpHandler(new FakeHandler(async r =>
        {
            calls++;
            if (calls == 1)
            {
                Assert.Equal(HttpMethod.Post, r.Method);
                Assert.Contains("synthetic-secret", await r.Content!.ReadAsStringAsync());
                return new HttpResponseMessage(HttpStatusCode.Found) { Headers = { Location = new Uri("https://script.googleusercontent.com/macros/echo?user_content_key=synthetic&lib=synthetic") } };
            }
            Assert.Equal(HttpMethod.Get, r.Method); Assert.Null(r.Content);
            Assert.Null(r.Headers.Authorization);
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{}") };
        })));
        using var result = await http.PostAsync(Url, new StringContent("synthetic-secret"));
        Assert.Equal(HttpStatusCode.OK, result.StatusCode); Assert.Equal(2, calls);
    }

    [Theory]
    [InlineData("https://evil.test/macros/echo?user_content_key=x&lib=y", 302)]
    [InlineData("http://script.googleusercontent.com/macros/echo?user_content_key=x&lib=y", 302)]
    [InlineData("https://script.googleusercontent.com/other?user_content_key=x&lib=y", 302)]
    [InlineData("https://u@script.googleusercontent.com/macros/echo?user_content_key=x&lib=y", 302)]
    [InlineData("https://script.googleusercontent.com/macros/echo?user_content_key=x&lib=y#x", 302)]
    [InlineData("https://script.googleusercontent.com/macros/echo?user_content_key=x&lib=y", 307)]
    public async Task Redirect_RefusesOtherDestinationAndPostPreservingRedirect(string location, int status)
    {
        int calls = 0;
        using var http = new HttpClient(new AppsScriptHttpHandler(new FakeHandler(r =>
        {
            calls++;
            return Task.FromResult(new HttpResponseMessage((HttpStatusCode)status) { Headers = { Location = new Uri(location) } });
        })));
        await Assert.ThrowsAsync<HttpRequestException>(() => http.PostAsync(Url, new StringContent("secret")));
        Assert.Equal(1, calls);
    }

    [Fact]
    public async Task Exchange_StoresOnlyDpapiToken_PreservesLegacyAndIdMe_OnFailure()
    {
        var dir = Path.Combine(Path.GetTempPath(), "hadir-connection-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try
        {
            var store = new DpapiRahsiaEnjinStore(dir);
            store.Simpan(Url, "synthetic-legacy");
            File.WriteAllText(Path.Combine(dir, "kredensial.dat"), "synthetic-idme-untouched");
            var id = new string('b', 32); var token = "HD1." + id + "." + new string('c', 64);
            using var http = new HttpClient(new FakeHandler(async r =>
            {
                Assert.Equal(Url, r.RequestUri!.AbsoluteUri);
                var body = await r.Content!.ReadAsStringAsync();
                Assert.Contains("moeisSambungTukar", body); Assert.DoesNotContain("synthetic-legacy", body);
                return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(new { ok = true, hasil = new { idPeranti = id, tokenPeranti = token } })) };
            }));
            Assert.Equal(id, await TestClient(http).SambungAsync(Code(), store, sahkanPenggantian: true, capDiluluskan: store.CapSimpanan()));
            Assert.Equal(token, store.Baca()!.RahsiaEnjin);
            Assert.DoesNotContain(token, store.Baca()!.ToString());
            Assert.DoesNotContain(token, File.ReadAllText(Path.Combine(dir, "tetapan.json")));
            Assert.False(File.ReadAllBytes(Path.Combine(dir, "rahsia.dat")).AsSpan().IndexOf(Encoding.UTF8.GetBytes(token)) >= 0);
            Assert.Equal("synthetic-idme-untouched", File.ReadAllText(Path.Combine(dir, "kredensial.dat")));
            var before = File.ReadAllBytes(Path.Combine(dir, "rahsia.dat"));
            using var bad = new HttpClient(new FakeHandler(r => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{\"ok\":false,\"ralat\":\"synthetic-secret-do-not-echo\"}") })));
            var e = await Assert.ThrowsAsync<InvalidOperationException>(() => TestClient(bad).SambungAsync(Code(), store, sahkanPenggantian: true, capDiluluskan: store.CapSimpanan()));
            Assert.DoesNotContain("synthetic-secret", e.ToString());
            Assert.Equal(before, File.ReadAllBytes(Path.Combine(dir, "rahsia.dat")));
        }
        finally { Directory.Delete(dir, true); }
    }

    private sealed class NodeRpcHandler : HttpMessageHandler
    {
        private readonly Process _worker;
        private readonly SemaphoreSlim _serial = new(1);
        public NodeRpcHandler()
        {
            var root = new DirectoryInfo(Environment.CurrentDirectory);
            while (root is not null && !File.Exists(Path.Combine(root.FullName, "apps-script", "HadirWeb.gs"))) root = root.Parent;
            Assert.NotNull(root);
            var psi = new ProcessStartInfo("node") { WorkingDirectory = root!.FullName, UseShellExecute = false,
                RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true };
            psi.ArgumentList.Add(Path.Combine(root.FullName, "tests", "fixtures", "connection-backend.cjs"));
            _worker = Process.Start(psi)!;
        }
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct)
        {
            Assert.Equal(Url, r.RequestUri!.AbsoluteUri);
            await _serial.WaitAsync(ct);
            try
            {
                await _worker.StandardInput.WriteLineAsync(await r.Content!.ReadAsStringAsync(ct));
                await _worker.StandardInput.FlushAsync(ct);
                var line = await _worker.StandardOutput.ReadLineAsync(ct);
                Assert.NotNull(line);
                return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(line!) };
            }
            finally { _serial.Release(); }
        }
        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _worker.StandardInput.Close();
                if (!_worker.WaitForExit(3000)) _worker.Kill(entireProcessTree: true);
                _worker.Dispose(); _serial.Dispose();
            }
            base.Dispose(disposing);
        }
    }

    [Fact]
    public async Task EndToEnd_RealGasDispatcherToDesktopDpapiAndJobRpc_NoNetworkOrPortal()
    {
        var dir = Path.Combine(Path.GetTempPath(), "hadir-e2e-synthetic-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try
        {
            using var http = new HttpClient(new NodeRpcHandler());
            async Task<JsonElement> Rpc(string method, params object[] args)
            {
                using var r = await http.PostAsync(Url, new StringContent(JsonSerializer.Serialize(new { mode = "hadir", kaedah = method, argumen = args })));
                using var d = JsonDocument.Parse(await r.Content.ReadAsStringAsync());
                Assert.True(d.RootElement.GetProperty("ok").GetBoolean());
                return d.RootElement.GetProperty("hasil").Clone();
            }
            var generated = await Rpc("moeisSambungJana", "synthetic-admin");
            var store = new DpapiRahsiaEnjinStore(dir);
            var id = await TestClient(http).SambungAsync(generated.GetProperty("kod").GetString()!, store, sahkanPenggantian: true, capDiluluskan: store.CapSimpanan());
            var config = store.Baca()!;
            Assert.Equal(id, KodSambungan.IdDaripadaToken(config.RahsiaEnjin));
            var jobs = new HadirBackendClient(http, config.ApiUrl, config.RahsiaEnjin);
            Assert.Single(await jobs.SenaraiAsync());
            var claim = await jobs.KlaimAsync("synthetic-job", "legacy-local-owner", ModKlaim.Biasa);
            Assert.NotNull(claim);
            await jobs.LepasAsync("synthetic-job", "legacy-local-owner");
            Assert.NotNull(await jobs.KlaimAsync("synthetic-job", "legacy-local-owner", ModKlaim.Biasa));
            await jobs.SelesaiAsync("synthetic-job", "gagal", "synthetic fixture only", null, "legacy-local-owner");
            await Assert.ThrowsAsync<InvalidOperationException>(() => TestClient(http).SambungAsync(generated.GetProperty("kod").GetString()!, store, sahkanPenggantian: true, capDiluluskan: store.CapSimpanan()));
            Assert.Equal(config, store.Baca());
            await Rpc("moeisSambungBatal", "peranti", id, "synthetic-admin");
            await Assert.ThrowsAsync<HadirBackendException>(() => jobs.SenaraiAsync());
            await Assert.ThrowsAsync<HadirBackendException>(() => jobs.KlaimAsync("synthetic-job", "legacy-local-owner", ModKlaim.Biasa));
            Assert.Single(await new HadirBackendClient(http, Url, "synthetic-legacy").SenaraiAsync());
        }
        finally { Directory.Delete(dir, true); }
    }

    [Theory]
    [InlineData(true,false)]
    [InlineData(false,false)]
    [InlineData(false,true)]
    public async Task RevokedTokenRePairsSamePcThroughRealDispatcherAndDpapi(bool revoke, bool unreachable)
    {
        var dir = Path.Combine(Path.GetTempPath(), "hadir-repair-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(dir);
        try
        {
            using var http = new HttpClient(new NodeRpcHandler());
            async Task<JsonElement> Rpc(string method, params object[] args)
            {
                using var r = await http.PostAsync(Url, new StringContent(JsonSerializer.Serialize(new { mode="hadir",kaedah=method,argumen=args })));
                using var d = JsonDocument.Parse(await r.Content.ReadAsStringAsync());
                Assert.True(d.RootElement.GetProperty("ok").GetBoolean()); return d.RootElement.GetProperty("hasil").Clone();
            }
            var store=new DpapiRahsiaEnjinStore(dir);
            var old=await TestClient(http).SambungAsync((await Rpc("moeisSambungJana","synthetic-admin")).GetProperty("kod").GetString()!,store);
            var other=(await Rpc("moeisSambungTukar",(await Rpc("moeisSambungJana","synthetic-admin")).GetProperty("kod").GetString()!));
            await Rpc("moeisJobKlaim","synthetic-job",other.GetProperty("idPeranti").GetString()!,false,other.GetProperty("tokenPeranti").GetString()!);
            if(revoke) await Rpc("moeisSambungBatal","peranti",old,"synthetic-admin");
            var oldToken=store.Baca()!.RahsiaEnjin;
            File.WriteAllText(Path.Combine(dir,"kredensial.dat"),"synthetic-idme-unchanged");
            var code=(await Rpc("moeisSambungJana","synthetic-admin")).GetProperty("kod").GetString()!;
            var client=new SambunganDesktopClient(http,new[]{Url},async(t,ct)=>
            {
                if(unreachable) throw new IOException("synthetic-network-uncertain");
                return await SambunganDesktopClient.SemakKerjaAktifAsync(t,http,ct);
            });
            var next=await client.SambungAsync(code,store,sahkanPenggantian:true,capDiluluskan:store.CapSimpanan(),sahkanSemakanTidakPasti:unreachable);
            Assert.NotEqual(old,next);
            await Assert.ThrowsAsync<HadirBackendException>(()=>new HadirBackendClient(http,Url,oldToken).SenaraiAsync());
            Assert.Single(await new HadirBackendClient(http,Url,store.Baca()!.RahsiaEnjin).SenaraiAsync());
            Assert.Equal("synthetic-idme-unchanged",File.ReadAllText(Path.Combine(dir,"kredensial.dat")));
        }
        finally { Directory.Delete(dir,true); }
    }

    [Fact]
    public void SettingsLayout_OneMaskedCode_NoManualSecret_OffscreenOnly()
    {
        Exception? failure = null;
        var t = new Thread(() =>
        {
            var dir = Path.Combine(Path.GetTempPath(), "hadir-layout-synthetic-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(dir);
            try
            {
                using var dialog = new EngineSettingsDialog(new DpapiRahsiaEnjinStore(dir));
                dialog.StartPosition = System.Windows.Forms.FormStartPosition.Manual;
                dialog.Location = new System.Drawing.Point(-20000, -20000);
                dialog.Show(); System.Windows.Forms.Application.DoEvents(); dialog.PerformLayout();
                var boxes = dialog.Controls.Find("kodSambungan", true);
                var code = Assert.IsType<System.Windows.Forms.TextBox>(Assert.Single(boxes));
                Assert.True(code.UseSystemPasswordChar);
                Assert.True(code.Width > 400);
                Assert.True(code.Bounds.Right <= code.Parent!.ClientSize.Width);
                Assert.True(code.Bounds.Bottom <= code.Parent!.ClientSize.Height);
                Assert.DoesNotContain("URL API", string.Join(" ", dialog.Controls.Cast<System.Windows.Forms.Control>().Select(c => c.Text)));
                using var bitmap = new System.Drawing.Bitmap(dialog.Width, dialog.Height);
                dialog.DrawToBitmap(bitmap, new System.Drawing.Rectangle(System.Drawing.Point.Empty, dialog.Size));
                var output = Path.Combine(AppContext.BaseDirectory, "connection-settings-layout.png");
                bitmap.Save(output);
            }
            catch (Exception ex) { failure = ex; }
            finally { Directory.Delete(dir, true); }
        });
        t.SetApartmentState(ApartmentState.STA); t.Start(); Assert.True(t.Join(TimeSpan.FromSeconds(10)));
        if (failure is not null) throw failure;
    }

    [Fact]
    public async Task CorruptionRefusesBeforeExchange_ExplicitRecoveryBacksUpAndLeavesIdMeAlone()
    {
        var dir = Path.Combine(Path.GetTempPath(), "hadir-recovery-synthetic-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try
        {
            File.WriteAllText(Path.Combine(dir, "tetapan.json"), "{synthetic-corrupt");
            File.WriteAllText(Path.Combine(dir, "kredensial.dat"), "synthetic-idme-unchanged");
            var id = new string('e', 32); var token = "HD1." + id + "." + new string('f', 64);
            int calls = 0;
            using var http = new HttpClient(new FakeHandler(r =>
            {
                calls++;
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(new { ok = true, hasil = new { idPeranti = id, tokenPeranti = token } })) });
            }));
            var store = new DpapiRahsiaEnjinStore(dir);
            await Assert.ThrowsAsync<InvalidOperationException>(() => TestClient(http).SambungAsync(Code(), store, sahkanPenggantian: true, capDiluluskan: store.CapSimpanan()));
            Assert.Equal(0, calls); Assert.Null(store.Baca());
            Assert.Equal(id, await TestClient(http).SambungAsync(Code(), store, pulihkan: true, sahkanPenggantian: true, capDiluluskan: store.CapSimpanan()));
            Assert.Equal(token, store.Baca()!.RahsiaEnjin);
            var backup = Assert.Single(Directory.GetDirectories(dir, "sandaran-pemulihan-*"));
            Assert.Equal("{synthetic-corrupt", File.ReadAllText(Path.Combine(backup, "tetapan.json")));
            Assert.Equal("synthetic-idme-unchanged", File.ReadAllText(Path.Combine(dir, "kredensial.dat")));
        }
        finally { Directory.Delete(dir, true); }
    }

    [Theory]
    [InlineData("{\"rahsiaEnjin\":\"HD1.invalid\"}")]
    [InlineData("{\"rahsiaEnjin\":\"synthetic-a\",\"rahsiaEnjin\":\"synthetic-b\"}")]
    public void CorruptTokenBlobNeverFallsBackToLegacy(string json) => Assert.Null(DpapiRahsiaEnjinStore.AmbilRahsiaEnjin(json));

    [Fact]
    public async Task UntrustedDeploymentNeverSendsOrReplacesEvenWithConfirmation()
    {
        var dir = Path.Combine(Path.GetTempPath(), "hadir-pin-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try
        {
            var store = new DpapiRahsiaEnjinStore(dir); store.Simpan(Url, "synthetic-legacy");
            int calls = 0;
            using var http = new HttpClient(new FakeHandler(r => { calls++; throw new Exception("must not send"); }));
            await Assert.ThrowsAsync<InvalidOperationException>(() => new SambunganDesktopClient(http).SambungAsync(
                Code("https://script.google.com/macros/s/ROGUE_DEPLOYMENT/exec"), store,
                sahkanPenggantian: true, capDiluluskan: store.CapSimpanan()));
            Assert.Equal(0, calls); Assert.Equal("synthetic-legacy", store.Baca()!.RahsiaEnjin);
        }
        finally { Directory.Delete(dir, true); }
    }

    [Fact]
    public void WrappedCodeWhitespaceIsNormalizedWithoutRelaxingEndpointValidation()
    {
        var code = Code();
        Assert.Equal(Url, KodSambungan.Baca(" \r\n" + code[..20] + "\t\r\n" + code[20..] + " ").ApiUrl);
    }

    [Theory]
    [InlineData(System.Windows.Forms.CloseReason.UserClosing, true)]
    [InlineData(System.Windows.Forms.CloseReason.WindowsShutDown, false)]
    [InlineData(System.Windows.Forms.CloseReason.ApplicationExitCall, false)]
    public void BusyDialogOnlyDefersUserClose(System.Windows.Forms.CloseReason reason, bool expected)
        => Assert.Equal(expected, EngineSettingsDialog.TangguhTutup(true, reason));

    [Fact]
    public async Task TrustedReplacementRequiresExplicitConsentAndMatchingDiskSnapshot()
    {
        var dir = Path.Combine(Path.GetTempPath(), "hadir-consent-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try
        {
            var store = new DpapiRahsiaEnjinStore(dir); store.Simpan(Url, "synthetic-old");
            int calls = 0;
            using var http = new HttpClient(new FakeHandler(r => { calls++; throw new Exception("must not send"); }));
            var other = "https://script.google.com/macros/s/TRUSTED_SECOND_DEPLOYMENT/exec";
            var client = new SambunganDesktopClient(http, new[] { Url, other }, (_, _) => Task.FromResult(false));
            Assert.Equal(other, client.SahkanSasaran(Code(other), store));
            await Assert.ThrowsAsync<InvalidOperationException>(() => client.SambungAsync(Code(other), store));
            await Assert.ThrowsAsync<InvalidOperationException>(() => client.SambungAsync(Code(other), store, sahkanPenggantian: true, capDiluluskan: "stale"));
            Assert.Equal(0, calls); Assert.Equal(Url, store.Baca()!.ApiUrl);
        }
        finally { Directory.Delete(dir, true); }
    }

    [Fact]
    public async Task ActiveJobsOrUncertainProbeBlockReplacementBeforeCodeBurn()
    {
        var dir = Path.Combine(Path.GetTempPath(), "hadir-active-job-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try
        {
            var store = new DpapiRahsiaEnjinStore(dir); store.Simpan(Url, "synthetic-old"); int calls = 0;
            using var http = new HttpClient(new FakeHandler(r => { calls++; throw new Exception("must not send"); }));
            foreach (var probe in new Func<TetapanBackendEnjin, CancellationToken, Task<bool>>[] {
                (_, _) => Task.FromResult(true), (_, _) => throw new IOException("synthetic-secret-error") })
            {
                var client = new SambunganDesktopClient(http, new[] { Url }, probe);
                var e = await Assert.ThrowsAsync<InvalidOperationException>(() => client.SambungAsync(Code(), store,
                    sahkanPenggantian: true, capDiluluskan: store.CapSimpanan()));
                Assert.Contains("belum ditebus", e.Message); Assert.DoesNotContain("synthetic-secret", e.ToString());
            }
            Assert.Equal(0, calls); Assert.Equal("synthetic-old", store.Baca()!.RahsiaEnjin);
        }
        finally { Directory.Delete(dir, true); }
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task UnreachableOldBackendRequiresSeparateRecoveryConsentAndStillUsesBackendGuard(bool confirm)
    {
        var dir=Path.Combine(Path.GetTempPath(),"hadir-uncertain-"+Guid.NewGuid().ToString("N")); Directory.CreateDirectory(dir);
        try
        {
            var store=new DpapiRahsiaEnjinStore(dir); var old="HD1."+new string('d',32)+"."+new string('e',64);
            store.Simpan(Url,old); int calls=0;
            using var http=new HttpClient(new FakeHandler(async r=>
            {
                calls++; using var body=JsonDocument.Parse(await r.Content!.ReadAsStringAsync());
                var args=body.RootElement.GetProperty("argumen"); Assert.True(args[1].GetBoolean()); Assert.Equal(new string('d',32),args[2].GetString());
                return new HttpResponseMessage(HttpStatusCode.OK){Content=new StringContent("{\"ok\":false,\"ralat\":\"[SAMBUNG_ACTIVE_JOB]\"}")};
            }));
            var client=new SambunganDesktopClient(http,new[]{Url},(_,_)=>throw new IOException("synthetic-secret"));
            var e=await Assert.ThrowsAsync<InvalidOperationException>(()=>client.SambungAsync(Code(),store,
                sahkanPenggantian:true,capDiluluskan:store.CapSimpanan(),sahkanSemakanTidakPasti:confirm));
            Assert.Equal(confirm?1:0,calls); Assert.Equal(old,store.Baca()!.RahsiaEnjin); Assert.DoesNotContain("synthetic-secret",e.ToString());
            Assert.Contains("belum ditebus",e.Message);
        }
        finally { Directory.Delete(dir,true); }
    }

    [Theory]
    [InlineData("Akses enjin MOEIS ditolak.",true)]
    [InlineData("Rahsia enjin MOEIS belum ditetapkan.",true)]
    [InlineData("Daftar sambungan tidak dapat dibaca; akses ditolak.",false)]
    [InlineData("unknown rejection",false)]
    public async Task OnlyDefiniteCredentialRejectionIsClassifiedAsDeadCredential(string reason,bool expected)
    {
        using var http=new HttpClient(new FakeHandler(_=>Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK){Content=new StringContent(JsonSerializer.Serialize(new{ok=false,ralat=reason}))})));
        var e=await Assert.ThrowsAsync<HadirBackendException>(()=>new HadirBackendClient(http,Url,"synthetic-old").SenaraiAsync());
        Assert.Equal(expected,e.AuthDitolak);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task TrialProtectionAndWriteFailureNeverBurnsCode_NormalOrRestore(bool restore)
    {
        var dir = Path.Combine(Path.GetTempPath(), "hadir-preflight-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try
        {
            var store = new DpapiRahsiaEnjinStore(dir, () => throw new IOException("synthetic-sensitive-failure"), ujianPreflight: true);
            int calls = 0;
            using var http = new HttpClient(new FakeHandler(r => { calls++; throw new Exception("must not send"); }));
            var e = await Assert.ThrowsAsync<InvalidOperationException>(() => TestClient(http).SambungAsync(Code(), store, restore));
            Assert.Contains("belum ditebus", e.Message); Assert.DoesNotContain("synthetic-sensitive", e.ToString());
            Assert.Equal(0, calls); Assert.Empty(Directory.GetFiles(dir));
        }
        finally { Directory.Delete(dir, true); }
    }

    [Fact]
    public void PairedJobErrorsKeepSafeUsefulReasonsButNeverEchoArbitraryText()
    {
        Assert.Equal("Tugasan tidak ditemui.", HadirBackendClient.PenolakanPerantiSelamat("Tugasan tidak ditemui."));
        Assert.Equal("Keputusan tugasan tidak sah.", HadirBackendClient.PenolakanPerantiSelamat("Keputusan tugasan tidak sah."));
        Assert.DoesNotContain("synthetic-secret", HadirBackendClient.PenolakanPerantiSelamat("synthetic-secret: arbitrary response"));
        Assert.DoesNotContain("synthetic-secret", RalatSambunganSelamat.DaripadaBackend("[SAMBUNG_RATE] synthetic-secret"));
        Assert.Contains("seminit", RalatSambunganSelamat.DaripadaBackend("[SAMBUNG_RATE] synthetic-secret"));
    }

    [Fact]
    public async Task TrustedEndpointChangeSucceedsOnlyAfterConsentAndOldJobCheck()
    {
        var dir = Path.Combine(Path.GetTempPath(), "hadir-trusted-change-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(dir);
        try
        {
            var store = new DpapiRahsiaEnjinStore(dir); store.Simpan(Url, "synthetic-old");
            var other = "https://script.google.com/macros/s/TRUSTED_SECOND_DEPLOYMENT/exec";
            var id = new string('b', 32); var token = "HD1." + id + "." + new string('c', 64); int checkedOld = 0;
            using var http = new HttpClient(new FakeHandler(r =>
            {
                Assert.Equal(1, checkedOld); Assert.Equal(other, r.RequestUri!.OriginalString);
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(new { ok=true, hasil=new {idPeranti=id,tokenPeranti=token} })) });
            }));
            var client = new SambunganDesktopClient(http, new[] { other }, (t, _) =>
            { Assert.Equal(Url, t.ApiUrl); checkedOld++; return Task.FromResult(false); });
            Assert.Equal(id, await client.SambungAsync(Code(other), store, sahkanPenggantian:true, capDiluluskan:store.CapSimpanan()));
            Assert.Equal(other, store.Baca()!.ApiUrl);
        }
        finally { Directory.Delete(dir,true); }
    }

    [Fact]
    public async Task DiskChangedDuringExchangeIsNeverSilentlyOverwritten()
    {
        var dir = Path.Combine(Path.GetTempPath(), "hadir-disk-change-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(dir);
        try
        {
            var store = new DpapiRahsiaEnjinStore(dir); store.Simpan(Url,"synthetic-old");
            var id = new string('b',32); var token="HD1."+id+"."+new string('c',64);
            using var http = new HttpClient(new FakeHandler(r =>
            {
                store.Simpan(Url,"synthetic-owner-change");
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content=new StringContent(JsonSerializer.Serialize(new {ok=true,hasil=new{idPeranti=id,tokenPeranti=token}})) });
            }));
            await Assert.ThrowsAsync<InvalidOperationException>(()=>TestClient(http).SambungAsync(Code(),store,sahkanPenggantian:true,capDiluluskan:store.CapSimpanan()));
            Assert.Equal("synthetic-owner-change",store.Baca()!.RahsiaEnjin);
        }
        finally { Directory.Delete(dir,true); }
    }

    [Fact]
    public void RuntimeTransportAndSettingsGateRemainExplicitlyWired()
    {
        var root=new DirectoryInfo(Environment.CurrentDirectory);
        while(root is not null && !File.Exists(Path.Combine(root.FullName,"apps-script","HadirWeb.gs"))) root=root.Parent;
        Assert.NotNull(root);
        var main=File.ReadAllText(Path.Combine(root!.FullName,"desktop","HadirDesktop","MainForm.cs"));
        Assert.Contains("private readonly HttpClient _deviceHttp = new();",main);
        Assert.DoesNotContain("_deviceHttp = AppsScriptHttpHandler",main);
        Assert.Contains("_pagarBackend.AdaKlaimAktif",main); Assert.Contains("if (_tetapanBackendDibuka || _kitaranBackendSedangJalan) return;",main);
        var dialog=File.ReadAllText(Path.Combine(root.FullName,"desktop","HadirDesktop","EngineSettingsDialog.cs"));
        Assert.Contains("new LegacyConnectionDialog(_store)",dialog);
        Assert.Contains("Sahkan penggantian sambungan",dialog);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task ActualUnwritableDestinationBlocksNormalAndRestoreBeforeExchange(bool restore)
    {
        var dir=Path.Combine(Path.GetTempPath(),"hadir-path-block-"+Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.Combine(dir,"rahsia.dat"));
        try
        {
            var store=new DpapiRahsiaEnjinStore(dir); int calls=0;
            using var http=new HttpClient(new FakeHandler(r=>{calls++; throw new Exception("must not send");}));
            var error=await Assert.ThrowsAsync<InvalidOperationException>(()=>TestClient(http).SambungAsync(Code(),store,restore,
                sahkanPenggantian:true,capDiluluskan:store.CapSimpanan()));
            Assert.Contains("belum ditebus",error.Message); Assert.Equal(0,calls);
            Assert.True(Directory.Exists(Path.Combine(dir,"rahsia.dat"))); Assert.False(File.Exists(Path.Combine(dir,"tetapan.json")));
        }
        finally { Directory.Delete(dir,true); }
    }

    [Fact]
    public async Task RuntimeHeldClaimsBlockReplacementUntilReleased()
    {
        var source=new PagarKonfigurasiBackendTests.StorPalsu { Tetapan=new TetapanBackendEnjin(Url,"synthetic-secret") };
        var jobs=new PagarKonfigurasiBackendTests.KlienPalsu();
        var gate=new PagarKonfigurasiBackend(source,true,(_,_)=>jobs);
        Assert.False(gate.AdaKlaimAktif);
        Assert.NotNull(await gate.Klien!.KlaimAsync("synthetic-job","synthetic-owner",ModKlaim.Biasa));
        Assert.True(gate.AdaKlaimAktif);
        await gate.Klien.LepasAsync("synthetic-job","synthetic-owner"); Assert.False(gate.AdaKlaimAktif);
    }
}
