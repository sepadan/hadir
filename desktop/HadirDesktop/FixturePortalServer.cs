using System;
using System.Net;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace HadirDesktop;

/// <summary>
/// Loopback-only HttpListener serving one static fixture HTML page that
/// looks portal-like but is obviously fake. Proves WebView2 rendering
/// against a local page without touching any real portal/idMe/MOEIS system.
/// </summary>
public sealed class FixturePortalServer : IDisposable
{
    private readonly HttpListener _listener = new();
    private CancellationTokenSource? _cts;
    private Task? _acceptLoop;

    public int Port { get; private set; }

    public string BaseUrl => $"http://127.0.0.1:{Port}/";

    /// <summary>Dev/test fixture page (isolated from the normal demo fixture), used only when the debug transport is enabled.</summary>
    public string DevBaseUrl => $"http://127.0.0.1:{Port}/dev";

    /// <summary>Binds an ephemeral loopback port and starts serving.</summary>
    public void Start()
    {
        Port = GetEphemeralLoopbackPort();
        _listener.Prefixes.Add($"http://127.0.0.1:{Port}/");
        _listener.Start();

        _cts = new CancellationTokenSource();
        _acceptLoop = Task.Run(() => AcceptLoopAsync(_cts.Token));
    }

    private async Task AcceptLoopAsync(CancellationToken token)
    {
        while (!token.IsCancellationRequested && _listener.IsListening)
        {
            HttpListenerContext context;
            try
            {
                context = await _listener.GetContextAsync().ConfigureAwait(false);
            }
            catch (Exception ex) when (ex is HttpListenerException or ObjectDisposedException or InvalidOperationException)
            {
                return;
            }

            _ = Task.Run(() => HandleRequest(context), token);
        }
    }

    private static void HandleRequest(HttpListenerContext context)
    {
        try
        {
            var path = context.Request.Url?.AbsolutePath ?? string.Empty;
            var html = ResolveHtml(path);
            var bytes = Encoding.UTF8.GetBytes(html);
            context.Response.ContentType = "text/html; charset=utf-8";
            context.Response.ContentLength64 = bytes.Length;
            context.Response.OutputStream.Write(bytes, 0, bytes.Length);
        }
        catch (Exception ex) when (ex is HttpListenerException or ObjectDisposedException or InvalidOperationException)
        {
            // Best-effort: client likely disconnected mid-response. Nothing to log that isn't noise.
        }
        finally
        {
            context.Response.Close();
        }
    }

    private static int GetEphemeralLoopbackPort()
    {
        using var probe = new System.Net.Sockets.TcpListener(IPAddress.Loopback, 0);
        probe.Start();
        var port = ((IPEndPoint)probe.LocalEndpoint).Port;
        probe.Stop();
        return port;
    }

    public void Dispose()
    {
        try
        {
            _cts?.Cancel();
            if (_listener.IsListening)
            {
                _listener.Stop();
            }

            _listener.Close();
        }
        catch (ObjectDisposedException)
        {
            // Already disposed; nothing to do.
        }

        _cts?.Dispose();
    }

    private const string FixtureHtml = """
    <!DOCTYPE html>
    <html lang="ms">
    <head>
    <meta charset="utf-8" />
    <title>Portal Palsu (Fixture) — bukan idMe/MOEIS sebenar</title>
    <style>
      body { font-family: Segoe UI, sans-serif; margin: 0; background: #f2f2f2; color: #222; }
      header { background: #7a1f1f; color: #fff; padding: 12px 20px; }
      header .warn { font-size: 12px; font-weight: bold; }
      main { padding: 20px; }
      .kelas-list { background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 12px; margin-bottom: 16px; }
      .kelas-list li { margin: 4px 0; }
      .status-box { background: #fff3cd; border: 1px solid #ffe08a; border-radius: 6px; padding: 12px; }
    </style>
    </head>
    <body>
      <header>
        <div>Portal Palsu (Fixture)</div>
        <div class="warn">AMARAN: bukan idMe/MOEIS sebenar — data rekaan untuk demo sahaja</div>
      </header>
      <main>
        <h2>Senarai Kelas (Rekaan)</h2>
        <ul class="kelas-list">
          <li>1 Cemerlang — Simulasi</li>
          <li>2 Bestari — Simulasi</li>
          <li>3 Gemilang — Simulasi</li>
        </ul>
        <h2>Status (Rekaan)</h2>
        <div class="status-box">
          Kehadiran simulasi: 0 rekod dihantar. Ini bukan sistem pengeluaran.
        </div>
      </main>
    </body>
    </html>
    """;

    /// <summary>Routes a request path to the right fixture HTML: normal fixture, or one of the dev fixture scenarios.</summary>
    private static string ResolveHtml(string path)
    {
        if (string.Equals(path, "/dev", StringComparison.OrdinalIgnoreCase))
        {
            return BuildDevFixtureHtml("kelas-1");
        }

        const string kelasPrefix = "/dev/kelas/";
        if (path.StartsWith(kelasPrefix, StringComparison.OrdinalIgnoreCase))
        {
            var suffix = path[kelasPrefix.Length..];
            var senarioKey = suffix switch
            {
                "1" => "kelas-1",
                "2" => "kelas-2",
                "3" => "kelas-3",
                _ => "kelas-1",
            };
            return BuildDevFixtureHtml(senarioKey);
        }

        return FixtureHtml;
    }

    private sealed record SenarioMoeis(string[] KelasOpsyen, string Tahun, string Kelas, string Status, string HadirJumlah);

    // Scenario data mirrors companion/tests/adaptor-playwright.test.mjs
    // (htmlPemilihMoeis) and pekerja-batch-adaptor-sebenar.test.mjs exactly,
    // so the production adaptor (buatAdaptorPlaywright) can be exercised
    // against a served page with the same shape the companion tests use.
    private static readonly System.Collections.Generic.Dictionary<string, SenarioMoeis> Senario = new()
    {
        ["kelas-1"] = new(new[] { "PRASEKOLAH BIJAK" }, "PRASEKOLAH", "PRASEKOLAH BIJAK", "BELUM DIHANTAR", "19/19"),
        ["kelas-2"] = new(new[] { "TAHUN EMPAT CERGAS" }, "TAHUN EMPAT", "TAHUN EMPAT CERGAS", "BELUM DIHANTAR", "25/28"),
        ["kelas-3"] = new(new[] { "TAHUN LIMA GEMILANG" }, "TAHUN LIMA", "TAHUN LIMA GEMILANG", "BELUM DIHANTAR", "12/15"),
    };

    // Dev/test-only fixture page. Isolated from the normal demo fixture and
    // from any real portal/profile. Serves a MOEIS-like class picker (year +
    // class dropdowns + summary table) so the production Playwright adapter
    // (companion/src/moeis/adaptorPlaywright.mjs) can be driven against a
    // REAL served page, plus the same postMessage bridge (minimize/hide/
    // show/shutdown) as the base dev fixture.
    private static string BuildDevFixtureHtml(string senarioKey)
    {
        var senario = Senario[senarioKey];
        var kelasOpsyen = string.Join(string.Empty, Array.ConvertAll(senario.KelasOpsyen,
            o => $"<option value=\"{o}\">{o}</option>"));
        var barisRingkasan = $"<tr><td>1</td><td>{senario.Tahun}</td><td>{senario.Kelas}</td><td>{senario.Status}</td><td>{senario.HadirJumlah}</td></tr>";

        return $$"""
        <!DOCTYPE html>
        <html lang="ms">
        <head>
        <meta charset="utf-8" />
        <title>Portal Palsu (Fixture DEV) — CDP/Playwright ujian</title>
        <style>
          body { font-family: Segoe UI, sans-serif; margin: 0; background: #eef3f0; color: #222; }
          header { background: #14532d; color: #fff; padding: 12px 20px; }
          main { padding: 20px; }
          button { margin: 4px 8px 4px 0; padding: 8px 14px; font-size: 14px; }
          #dev-marker { font-weight: bold; color: #14532d; }
        </style>
        </head>
        <body>
          <header>
            <div>Portal Palsu (Fixture DEV)</div>
            <div>Khusus ujian automasi CDP/Playwright — bukan portal/idMe sebenar.</div>
          </header>
          <main>
            <p id="dev-marker">DEV-FIXTURE-OK</p>
            <span id="dev-senario" data-senario="{{senarioKey}}">{{senarioKey}}</span>
            <p id="state">Keadaan tetingkap: tidak diketahui.</p>
            <p id="host-state">host-state: (belum disahkan)</p>
            <button id="btn-minimize">Minimize</button>
            <button id="btn-hide">Hide ke dulang</button>
            <button id="btn-show">Show</button>
            <button id="btn-shutdown">Shutdown (keluar bersih)</button>
            <select id="txtThnting"><option value="">Pilih</option><option value="PRA">PRASEKOLAH</option><option value="T4">TAHUN EMPAT</option><option value="T5">TAHUN LIMA</option></select>
            <select id="txtNamakelas"><option value="">Pilih</option>{{kelasOpsyen}}</select>
            <table><tbody>{{barisRingkasan}}</tbody></table>
          </main>
          <script>
            function send(m) { if (window.chrome && window.chrome.webview) window.chrome.webview.postMessage(m); }
            document.getElementById('btn-minimize').onclick = function () { document.getElementById('state').textContent = 'Keadaan tetingkap: minimized'; send('minimize'); };
            document.getElementById('btn-hide').onclick = function () { document.getElementById('state').textContent = 'Keadaan tetingkap: hidden'; send('hide'); };
            document.getElementById('btn-show').onclick = function () { document.getElementById('state').textContent = 'Keadaan tetingkap: shown'; send('show'); };
            document.getElementById('btn-shutdown').onclick = function () { send('shutdown'); };
            if (window.chrome && window.chrome.webview) {
              window.chrome.webview.addEventListener('message', function (ev) {
                var data = typeof ev.data === 'string' ? ev.data : JSON.stringify(ev.data);
                if (data.indexOf('host-state:') === 0) {
                  document.getElementById('host-state').textContent = data;
                }
              });
            }
          </script>
        </body>
        </html>
        """;
    }
}
