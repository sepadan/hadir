using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace HadirDesktop;

public sealed class MainForm : Form
{
    private readonly AppStateMachine _stateMachine = new();
    private readonly TrayHost _tray;
    private readonly FixturePortalServer _portalServer = new();
    private NavigationGuard _navigationGuard = null!;
    private readonly FixtureEngineStatusSource _fixtureSource = new();
    private readonly LoopbackEngineStatusSource _loopbackSource = new();
    private readonly DevDebugTransport? _devDebug;
    private readonly RealPortalDevMode _realPortal;
    private readonly HttpClient _deviceHttp = new();
    private readonly DevicePanel _devicePanel;
    private readonly string? _observationLogPath;

    // --- idMe credential (shared DPAPI store) + demand-only auto-login ---
    private readonly DpapiKredensialIdMeStore _kredensialStore = new();
    private readonly JsonIdMeLoginSettingsStore _idMeSettingsStore = new();
    private readonly PenolakanKredensialStateStore _penolakanStateStore = new();
    private readonly PenjagaPenolakanKredensial _penjaga;
    private readonly WebView2IdMeLoginDom _loginDom;
    private readonly IdMeLoginManager _loginManager;
    private readonly IdMeLoginDemand _loginDemand;

    private IEngineStatusSource _statusSource;
    private WebView2 _webView = null!;
    private Label _banner = null!;
    private StatusStrip _statusStrip = null!;
    private ToolStripStatusLabel _stateLabel = null!;
    private ToolStripStatusLabel _engineLabel = null!;
    private ToolStripStatusLabel _navLabel = null!;
    private ToolStripButton _refreshButton = null!;
    private ToolStripButton _portalButton = null!;
    private ToolStripDropDownButton _sourceButton = null!;
    private bool _allowClose;

    public MainForm()
    {
        _statusSource = _fixtureSource;
        _realPortal = RealPortalDevMode.FromEnvironment();
        // In real-portal dev mode, widen the allowlist to the exact idMe origin
        // so the real login page can render (read-only). Normal mode keeps the
        // empty allowlist = fixture/loopback only.
        _navigationGuard = new NavigationGuard(_realPortal.AllowedOrigins);

        // idMe auto-login plumbing (default OFF). The credential store is the
        // SAME shared DPAPI file as the companion engine (HADIR-MOEIS-Companion/
        // kredensial.dat). The only auto-retry stop is the owner-configurable
        // consecutive-credential-rejection guard (0 = never stop, default 5);
        // transient failures retry indefinitely with exponential backoff. No
        // hourly/daily ceiling — a needed login is never blocked by earlier
        // probes. Nothing runs until the owner enables it AND a waiting HADIR
        // task is signalled — no timer, no keepalive loop.
        _penjaga = new PenjagaPenolakanKredensial(
            _penolakanStateStore.Baca,
            _penolakanStateStore.Tulis,
            () => _idMeSettingsStore.Baca().MaksPenolakanBerturut);
        _loginDom = new WebView2IdMeLoginDom(() => _webView.CoreWebView2);
        _loginManager = new IdMeLoginManager(
            () => _kredensialStore.Ada(),
            () => IdMeLoginFlow.JalankanAsync(_loginDom, _kredensialStore.Baca(), _idMeSettingsStore.Baca().BenarkanTerusTanpaFrasa),
            _penjaga,
            sesiSah: SesiSahProbeAsync);
        _loginDemand = new IdMeLoginDemand(_idMeSettingsStore, _loginManager, AdaKerjaMenungguAsync);
        _devicePanel = new DevicePanel(
            new DeviceRegistrationClient(_deviceHttp, DemoLabel.HadirBackendApiUrl),
            DemoLabel.HadirBackendApiUrl,
            new DpapiDeviceSecretStore(),
            new JsonDeviceIdentityStore());

        // Developer/test-only debug transport: strictly opt-in, never in normal mode.
        _devDebug = DevDebugTransport.FromEnvironment();

        // Dev-only observation log for the real-portal run (sanitized URLs only).
        _observationLogPath = _realPortal.Enabled
            ? Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "HadirDesktop", "real-portal-observations.log")
            : null;

        Text = _realPortal.Enabled
            ? DemoLabel.WindowTitle + DemoLabel.RealPortalBannerSuffix
            : _devDebug is null ? DemoLabel.WindowTitle : DemoLabel.WindowTitle + DemoLabel.DevDebugBannerSuffix;
        Width = 1100;
        Height = 750;
        StartPosition = FormStartPosition.CenterScreen;

        _tray = new TrayHost(SystemIcons.Application);
        _tray.ShowRequested += (_, _) => ShowFromTray();
        _tray.OpenSettingsRequested += (_, _) => OpenEngineSettings();
        _tray.IdMeSettingsRequested += (_, _) => OpenIdMeSettings();
        _tray.LoginAutoRequested += async (_, _) => await CubaLoginAutoAtasPermintaanAsync();
        _tray.ExitRequested += (_, _) => ExitForReal();

        BuildLayout();

        Load += MainForm_Load;
        FormClosing += MainForm_FormClosing;
    }

    private void BuildLayout()
    {
        _banner = new Label
        {
            Dock = DockStyle.Top,
            Height = 32,
            BackColor = System.Drawing.Color.Firebrick,
            ForeColor = System.Drawing.Color.White,
            TextAlign = System.Drawing.ContentAlignment.MiddleCenter,
            Font = new System.Drawing.Font(Font, System.Drawing.FontStyle.Bold),
            Text = DemoLabel.BannerText + (_realPortal.Enabled
                ? DemoLabel.RealPortalBannerSuffix
                : _devDebug is null ? string.Empty : DemoLabel.DevDebugBannerSuffix),
        };

        _webView = new WebView2
        {
            Dock = DockStyle.Fill,
        };

        _stateLabel = new ToolStripStatusLabel { Text = "Keadaan: -" };
        _engineLabel = new ToolStripStatusLabel { Text = "Enjin: -" };
        _navLabel = new ToolStripStatusLabel { Text = string.Empty, Spring = true, TextAlign = System.Drawing.ContentAlignment.MiddleRight };

        _refreshButton = new ToolStripButton { Text = "Segar semula status" };
        _refreshButton.Click += async (_, _) => await RefreshEngineStatusAsync();

        _portalButton = new ToolStripButton { Text = "Portal Fixture" };
        _portalButton.Click += (_, _) => NavigateToFixture();

        _sourceButton = new ToolStripDropDownButton { Text = "Sumber: " + CurrentSourceName() };
        _sourceButton.DropDownItems.Add(SourceItem(DemoLabel.SimulatedSourceLabel, _fixtureSource));
        _sourceButton.DropDownItems.Add(SourceItem(DemoLabel.RealSourceLabel, _loopbackSource));

        _statusStrip = new StatusStrip();
        _statusStrip.Items.Add(_refreshButton);
        _statusStrip.Items.Add(_portalButton);
        _statusStrip.Items.Add(new ToolStripSeparator());
        _statusStrip.Items.Add(_sourceButton);
        _statusStrip.Items.Add(new ToolStripSeparator());
        _statusStrip.Items.Add(_stateLabel);
        _statusStrip.Items.Add(new ToolStripSeparator());
        _statusStrip.Items.Add(_engineLabel);
        _statusStrip.Items.Add(_navLabel);

        Controls.Add(_webView);
        Controls.Add(_banner);
        Controls.Add(_statusStrip);
        Controls.Add(_devicePanel);

        UpdateStateLabel();
    }

    private ToolStripMenuItem SourceItem(string label, IEngineStatusSource source)
    {
        var item = new ToolStripMenuItem(label);
        item.Click += async (_, _) =>
        {
            _statusSource = source;
            _sourceButton.Text = "Sumber: " + CurrentSourceName();
            await RefreshEngineStatusAsync();
        };
        return item;
    }

    private string CurrentSourceName() =>
        ReferenceEquals(_statusSource, _loopbackSource) ? DemoLabel.RealSourceLabel : DemoLabel.SimulatedSourceLabel;

    private async void MainForm_Load(object? sender, EventArgs e)
    {
        _portalServer.Start();

        var userDataFolder = _devDebug?.UserDataFolder
            ?? Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "HadirDesktop", "webview2-demo");
        Directory.CreateDirectory(userDataFolder);

        var options = new CoreWebView2EnvironmentOptions();
        if (_devDebug is not null)
        {
            options.AdditionalBrowserArguments = _devDebug.AdditionalBrowserArguments;
        }

        var env = await CoreWebView2Environment.CreateAsync(userDataFolder: userDataFolder, options: options);
        await _webView.EnsureCoreWebView2Async(env);

        _webView.CoreWebView2.NavigationStarting += CoreWebView2_NavigationStarting;
        _webView.CoreWebView2.NewWindowRequested += CoreWebView2_NewWindowRequested;
        _webView.CoreWebView2.WebMessageReceived += CoreWebView2_WebMessageReceived;

        NavigateToFixture();

        await RefreshEngineStatusAsync();
    }

    private void NavigateToFixture()
    {
        if (_webView.CoreWebView2 is null)
        {
            return;
        }

        // Real-portal dev mode loads the real idMe login page instead of the
        // fixture. Read-only: navigation only, never credentials, never submit.
        if (_realPortal.Enabled)
        {
            _webView.CoreWebView2.Navigate(DemoLabel.RealPortalLoginUrl);
            return;
        }

        var url = _devDebug is null ? _portalServer.BaseUrl : _portalServer.DevBaseUrl;
        _webView.CoreWebView2.Navigate(url);
    }

    private void CoreWebView2_NavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
    {
        if (!Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri) || !_navigationGuard.IsAllowed(uri))
        {
            e.Cancel = true;
            ShowNavBlocked(e.Uri);
            LogObservation("navigation-starting", e.Uri, allowed: false);
        }
        else
        {
            LogObservation("navigation-starting", e.Uri, allowed: true);
        }
    }

    private void CoreWebView2_NewWindowRequested(object? sender, CoreWebView2NewWindowRequestedEventArgs e)
    {
        // DEMO policy: never open a real OS browser window; block and notify.
        e.Handled = true;
        var allowed = Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri) && _navigationGuard.IsAllowed(uri);
        if (!allowed)
        {
            ShowNavBlocked(e.Uri);
        }
        // New-window (popup/SSO) attempts are always blocked (no OS window) even
        // when the origin is on the allowlist; record the exact URL and decision.
        LogObservation("new-window-requested", e.Uri, allowed);
    }

    /// <summary>
    /// Dev-only: appends one sanitized line (no query/fragment, no values) to the
    /// local observation log during a real-portal run. No-op in normal mode.
    /// </summary>
    private void LogObservation(string kind, string? uri, bool allowed)
    {
        if (_observationLogPath is null) return;
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_observationLogPath)!);
            File.AppendAllText(_observationLogPath, RealPortalObservation.FormatLine(kind, uri, allowed) + Environment.NewLine);
        }
        catch (IOException)
        {
            // Observation is best-effort; never let it affect navigation.
        }
        catch (UnauthorizedAccessException)
        {
            // Same as above.
        }
    }

    private bool IsDevFixtureMessageSource() =>
        _devDebug is not null
        && DevFixtureOrigin.IsDevFixture(_webView.CoreWebView2?.Source, _portalServer.DevBaseUrl);

    private void CoreWebView2_WebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        // Minimal, safe host bridge used by the dev fixture to prove the
        // embedded WebView2 stays live while minimized/hidden (drive test).
        // Origin-gated: only the exact dev fixture page can drive the host
        // window — never the real settings UI, a future SSO page, or any
        // other origin that happens to be loaded in this WebView2.
        if (!IsDevFixtureMessageSource()) return;

        var message = e.TryGetWebMessageAsString();
        switch (message)
        {
            case "minimize":
                WindowState = FormWindowState.Minimized;
                ConfirmHostState();
                break;
            case "hide":
                _stateMachine.OnCloseRequested();
                Hide();
                _tray.ShowFirstHideBalloonIfNeeded();
                UpdateStateLabel();
                ConfirmHostState();
                break;
            case "show":
                ShowFromTray();
                ConfirmHostState();
                break;
            case "shutdown":
                // Dev/test-only graceful exit path (never honoured in normal mode).
                if (_devDebug is not null)
                {
                    ExitForReal();
                }
                break;
        }
    }

    /// <summary>
    /// Reports the ACTUAL host window state back into the (dev) page so a test
    /// harness can assert the window really minimized/hid — not merely that the
    /// click handler fired. Only meaningful for the dev fixture; the normal
    /// fixture page ignores it.
    /// </summary>
    private void ConfirmHostState()
    {
        try
        {
            var state = Visible ? WindowState.ToString() : "Hidden";
            _webView.CoreWebView2?.PostWebMessageAsJson($"\"host-state:{state}\"");
        }
        catch (InvalidOperationException)
        {
            // WebView2 torn down during exit; nothing to confirm.
        }
    }

    private void ShowNavBlocked(string uri)
    {
        _navLabel.Text = $"Navigasi disekat: {uri}";
    }

    private async System.Threading.Tasks.Task RefreshEngineStatusAsync()
    {
        var status = await _statusSource.GetStatusAsync();
        var kind = status.IsSimulated ? DemoLabel.SimulatedSourceLabel : status.SourceLabel;
        var detail = status.Kind == EngineStatusKind.Ok
            ? $"ok={status.Ok} versi={status.Versi} giliran={(status.GiliranAktif ? "aktif" : "pasif")}"
            : status.Catatan;
        _engineLabel.Text = $"Enjin ({kind}): {detail}";
    }

    /// <summary>
    /// Opens the engine's REAL protected local settings UI (nonce-gated, served
    /// from the companion's loopback origin) in the embedded WebView2. Read-only
    /// from this app's side: we only navigate; we never write settings, never
    /// restart, and never control the engine.
    /// </summary>
    private void OpenEngineSettings()
    {
        ShowFromTray();

        if (_webView.CoreWebView2 is null)
        {
            _navLabel.Text = "Enjin belum tersedia (WebView2 belum siap).";
            return;
        }

        if (!_navigationGuard.IsAllowed(new Uri(DemoLabel.EngineSettingsUrl)))
        {
            _navLabel.Text = "URL tetapan enjin disekat oleh allowlist.";
            return;
        }

        _navLabel.Text = "Membuka tetapan tempatan enjin (baca sahaja)…";
        _webView.CoreWebView2.Navigate(DemoLabel.EngineSettingsUrl);
    }

    /// <summary>
    /// Opens the "Akaun idMe" settings dialog (masked credential entry + opt-in
    /// auto-login switches + rejection-guard control). After it closes, the
    /// navigation allowlist is recomputed so enabling auto-login widens it to
    /// the exact idMe/MOEIS origins (and disabling narrows it back).
    /// </summary>
    private void OpenIdMeSettings()
    {
        ShowFromTray();
        using var dialog = new IdMeSettingsDialog(_kredensialStore, _idMeSettingsStore, _loginManager);
        dialog.ShowDialog(this);
        RebuildNavigationGuard();
    }

    /// <summary>
    /// Rebuilds the navigation allowlist from the real-portal dev mode origins
    /// PLUS the idMe/MOEIS origins when (and only when) the owner has enabled
    /// the auto-login feature. Everything else stays blocked.
    /// </summary>
    private void RebuildNavigationGuard()
    {
        var origins = new List<string>(_realPortal.AllowedOrigins);
        if (_idMeSettingsStore.Baca().LoginAuto)
        {
            origins.Add(IdMeLoginEndpoints.IdMeOrigin);
            origins.Add(IdMeLoginEndpoints.MoeisOrigin);
        }
        _navigationGuard = new NavigationGuard(origins);
    }

    /// <summary>
    /// Demand-only auto-login entry point (tray "Cuba log masuk" and, later,
    /// the auto-send phase). Gated by the waiting-task check inside
    /// <see cref="IdMeLoginDemand"/>: with no unfinished attendance it does
    /// nothing at all. Never run on a timer/keepalive.
    /// </summary>
    public async Task CubaLoginAutoAtasPermintaanAsync()
    {
        var hasil = await _loginDemand.CubaAutoAsync();
        _navLabel.Text = $"Login idMe auto: {hasil.Status} — {hasil.Sebab}";
    }

    /// <summary>
    /// Direct session probe for the manager (pre-flight, never consumes any
    /// budget, never navigates, never polls in the background): true only when
    /// the embedded portal is currently on a MOEIS host (already logged in).
    /// </summary>
    private Task<SesiProbe> SesiSahProbeAsync()
    {
        var wv = _webView.CoreWebView2;
        if (wv == null) return Task.FromResult(new SesiProbe(false));
        try
        {
            var sah = Uri.TryCreate(wv.Source, UriKind.Absolute, out var u)
                && u.Host.Equals("moeispel.moe.gov.my", StringComparison.OrdinalIgnoreCase);
            return Task.FromResult(new SesiProbe(sah));
        }
        catch
        {
            return Task.FromResult(new SesiProbe(false));
        }
    }

    /// <summary>
    /// Waiting-HADIR-task probe — the ONE and only demand signal. Wired in the
    /// future auto-send phase (which watches today's HADIR records for
    /// unfinished attendance). Until then: no known waiting work => no login,
    /// no portal open, zero idMe/MOEIS activity.
    /// </summary>
    private Task<bool> AdaKerjaMenungguAsync()
    {
        return Task.FromResult(false);
    }

    /// <summary>Called (marshalled to UI thread) when a second launch signals this instance.</summary>
    public void BringToFrontFromSecondLaunch() => ShowFromTray();

    private void ShowFromTray()
    {
        _stateMachine.OnShowRequested();
        Show();
        WindowState = FormWindowState.Normal;
        Activate();
        UpdateStateLabel();
    }

    private void ExitForReal()
    {
        _stateMachine.OnExitRequested();
        _allowClose = true;
        Close();
    }

    private void MainForm_FormClosing(object? sender, FormClosingEventArgs e)
    {
        if (_allowClose || e.CloseReason != CloseReason.UserClosing)
        {
            _devicePanel.Dispose();
            _portalServer.Dispose();
            _loopbackSource.Dispose();
            _deviceHttp.Dispose();
            _tray.Dispose();
            return;
        }

        e.Cancel = true;
        _stateMachine.OnCloseRequested();
        Hide();
        _tray.ShowFirstHideBalloonIfNeeded();
        UpdateStateLabel();
    }

    private void UpdateStateLabel()
    {
        _stateLabel.Text = $"Keadaan: {_stateMachine.State}";
    }
}
