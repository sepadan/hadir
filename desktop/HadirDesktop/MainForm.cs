using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Threading;
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
    // Alat PEMBANGUN sahaja: satu kitaran automatik + log diagnostik. MATI
    // secara lalai; tiada kesan langsung pada pengeluaran.
    private readonly DevAutoKitaran _devAutoKitaran;
    private bool _devKitaranSudahJalan;
    /// <summary>Sebab aliran penghantaran terakhir dalam kitaran ini (untuk log pembangun).</summary>
    private string? _sebabPenghantaranTerakhir;
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
    // Read-only demand probe + demand-only portal lifecycle (default OFF).
    // Backend-direct when the engine secret is readable, loopback only as a
    // fallback — so the desktop needs no companion engine.
    private readonly IKerjaHariIniSource _kerjaHariIni;
    private readonly PortalLifecycle _lifecycle;

    // Submission pass: full task list source + WebView2 adapter + opt-in pass.
    private readonly LoopbackKerjaPenuhSource _kerjaPenuh = new();
    private readonly DpapiRahsiaEnjinStore _rahsiaStore = new();
    private readonly PemilikTugasanStore _pemilikStore = new();
    private readonly HadirBackendClient? _backendClient;
    private readonly PenghantaranMoeisWebView2 _penghantarMoeis;
    private readonly AliranPenghantaranMoeis _aliranPenghantaran;

    /// <summary>
    /// Cancels an in-flight demand cycle on real shutdown. The login manager
    /// retries a TRANSIENT failure indefinitely on purpose (owner policy), and a
    /// cycle holds the lifecycle's single-flight slot for as long as it runs —
    /// so without a token a closing window would leave a retry loop (and its
    /// credential submissions) running until the process exits. Cancellation is
    /// observed BETWEEN attempts: the DOM waits inside one attempt are not
    /// cancellable, so a stuck attempt finishes before the cycle ends.
    /// </summary>
    private readonly CancellationTokenSource _cycleCts = new();

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
    private KeadaanPortal _keadaanPortal = KeadaanPortal.Diam;

    /// <summary>
    /// The thread this form was constructed on — the UI thread. Needed because
    /// <see cref="Control.InvokeRequired"/> answers <c>false</c> from ANY thread
    /// before the handle exists, so it alone cannot tell "on the UI thread" from
    /// "on a thread-pool continuation of the demand probe".
    /// </summary>
    private readonly int _uiThreadId = Environment.CurrentManagedThreadId;

    public MainForm()
    {
        _statusSource = _fixtureSource;
        _realPortal = RealPortalDevMode.FromEnvironment();
        _devAutoKitaran = DevAutoKitaran.DariPersekitaran();
        // Bina penjaga navigasi DARI TETAPAN TERSIMPAN semasa mula, bukan hanya
        // selepas dialog "Akaun idMe" ditutup. Tanpa ini, PC yang restart dengan
        // LoginAuto sudah HIDUP tidak dibenarkan navigasi ke origin idMe/MOEIS
        // sampai seseorang membuka dialog itu — auto-login tersekat senyap.
        // (`_idMeSettingsStore` ialah pengawal medan, jadi ia sudah sedia di sini.)
        RebuildNavigationGuard();

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

        // Submission pass: built AFTER the login pieces so the WebView2 lambda
        // (deferred) can reference _webView, and wired as the lifecycle's
        // "after a valid session" hook. DEFAULT OFF — the owner opts in from the
        // tray ("Hantar ke MOEIS (automatik)"), and the answer is re-read from
        // the stored settings on EVERY cycle, so it survives a restart and a
        // corrupt/missing settings file reads back as OFF.
        // Claim->submit->complete talks STRAIGHT to the Apps Script backend
        // (engine-independent) using the shared engine secret via DPAPI.
        // Fail-closed: no readable secret/URL = no backend = no claim, no send.
        var tetapanBackend = _rahsiaStore.Baca();
        if (tetapanBackend != null)
        {
            _backendClient = new HadirBackendClient(_deviceHttp, tetapanBackend.ApiUrl, tetapanBackend.RahsiaEnjin);
        }
        // Demand probe also backend-direct when the secret is readable; loopback
        // is only a fallback for a PC that has no engine secret configured yet.
        _kerjaHariIni = _backendClient != null
            ? new BackendKerjaHariIniSource(_backendClient)
            : new LoopbackKerjaHariIniSource();
        // Adaptor MOEIS mesti menyentuh WebView2 di BENANG UI. Membungkus
        // panggilan JalankanAsync di bawah dengan PadaUiAsync tidak mencukupi:
        // aliran menunggu I/O backend sebenar dengan ConfigureAwait(false), jadi
        // kesinambungan yang akhirnya memanggil adaptor berjalan di benang
        // kolam. Marshaller diberi kepada adaptor supaya SETIAP sentuhan
        // CoreWebView2 dihantar semula ke benang UI, bukan hanya titik masuk.
        _penghantarMoeis = new PenghantaranMoeisWebView2(() => _webView.CoreWebView2, new MarshalUiBorang(this));
        _aliranPenghantaran = new AliranPenghantaranMoeis(
            _backendClient != null ? new BackendKerjaPenuhSource(_backendClient) : _kerjaPenuh,
            _penghantarMoeis,
            dihidupkan: () => _idMeSettingsStore.Baca().HantarAuto,
            // Log langkah klaim/hantar/selesai — HANYA dalam mod pembangun.
            log: _devAutoKitaran.Dihidupkan ? LogLangkahDev : null,
            backend: _backendClient,
            pemilik: () => _pemilikStore.Dapatkan());

        // Demand-only portal lifecycle: the ONLY decider of whether the embedded
        // WebView2 is ever pointed at the portal. Gate order: owner opt-in
        // (default OFF) -> read-only engine demand probe -> rejection guard ->
        // open portal -> login. An empty queue or an unreachable engine means
        // ZERO portal activity (no navigation, no session probe, no login).
        _lifecycle = new PortalLifecycle(
            _kerjaHariIni,
            () => _idMeSettingsStore.Baca().LoginAuto,
            OpenPortalDemandAsync,
            // The login drives the embedded WebView2 DOM, so it MUST run on the
            // UI thread — the lifecycle reaches here on a thread-pool
            // continuation (see PadaUiAsync).
            ct => PadaUiAsync(() => _loginDemand.CubaAutoDenganPermintaanAsync(adaKerja: true, ct)),
            diblok: () => _penjaga.Diblok(),
            selepasLoginSah: ct => PadaUiAsync(async () =>
            {
                var hasilAliran = await _aliranPenghantaran.JalankanAsync(ct);
                _sebabPenghantaranTerakhir = hasilAliran.Sebab;
                return hasilAliran.Sebab;
            }),
            lapor: LaporKeadaanPortal);
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

        var tajuk = DemoLabel.TajukTetingkapDenganVersi();
        Text = _realPortal.Enabled
            ? tajuk + DemoLabel.RealPortalBannerSuffix
            : _devDebug is null ? tajuk : tajuk + DemoLabel.DevDebugBannerSuffix;
        Width = 1100;
        Height = 750;
        StartPosition = FormStartPosition.CenterScreen;

        _tray = new TrayHost(
            SystemIcons.Application,
            new AutostartManager(new RegistryRunKey()),
            hantarAutoBaca: () => _idMeSettingsStore.Baca().HantarAuto,
            hantarAutoTulis: HantarAutoTetapkan);
        _tray.ShowRequested += (_, _) => ShowFromTray();
        _tray.OpenSettingsRequested += (_, _) => OpenEngineSettings();
        _tray.IdMeSettingsRequested += (_, _) => OpenIdMeSettings();
        _tray.LoginAutoRequested += async (_, _) => await CubaLoginAutoAtasPermintaanAsync();
        _tray.CubaLagiRequested += async (_, _) => await CubaLagiPortalAsync();
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
        // Satu baris versi setiap lancaran — supaya "binaan mana yang berjalan"
        // boleh dijawab selepas kejadian. Penulis yang SAMA seperti log
        // pembangun (gagal-tertutup; tiada data pengguna dalam baris ini).
        DevAutoKitaran.TulisKe(
            VersiAplikasi.LaluanLog(),
            VersiAplikasi.BarisLog(DateTimeOffset.Now, VersiAplikasi.Versi));

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

        // Borang siap DAN WebView2 bersedia — barulah kitaran pembangun (jika
        // dihidupkan) dijalankan. Sekali sahaja, tiada pemasa.
        await KitaranAutoDevAsync();
    }

    /// <summary>
    /// Alat PEMBANGUN sahaja (<c>HADIR_DEV_AUTO_KITARAN</c>): jalankan SATU
    /// kitaran deman/log-masuk sebaik borang siap, supaya ujian hidup tidak
    /// perlu klik menu dulang. MATI = tiada apa-apa berlaku di sini.
    /// Kitaran itu sendiri ialah laluan pengeluaran yang SAMA
    /// (<see cref="CubaLoginAutoAtasPermintaanAsync"/>) — semua penjaga
    /// (opt-in pemilik, deman, pagar penolakan) kekal terpakai.
    /// </summary>
    private async Task KitaranAutoDevAsync()
    {
        if (!_devAutoKitaran.Dihidupkan || _devKitaranSudahJalan) return;
        _devKitaranSudahJalan = true;

        _sebabPenghantaranTerakhir = null;
        await CubaLoginAutoAtasPermintaanAsync();

        _devAutoKitaran.Tulis(DevAutoKitaran.BarisKitaran(
            DateTimeOffset.Now,
            LabelKeadaanPortal.Teks(_lifecycle.Keadaan),
            _lifecycle.Sebab,
            _sebabPenghantaranTerakhir));
    }

    /// <summary>
    /// Log satu langkah aliran penghantaran (klaim/hantar/selesai). Mesej
    /// datang daripada <see cref="AliranPenghantaranMoeis"/> dan hanya membawa
    /// id tugasan / nama kelas / status — tiada kredensial, IC, token atau URL.
    /// </summary>
    private void LogLangkahDev(string mesej) =>
        _devAutoKitaran.Tulis(DevAutoKitaran.BarisLangkah(DateTimeOffset.Now, mesej));

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
    /// Menyimpan togol "Hantar ke MOEIS (automatik)" dari dulang. Tetapan lain
    /// dibaca semula dahulu supaya hanya medan ini berubah (dialog "Akaun idMe"
    /// mungkin telah menulis medan lain). Bebas daripada <c>LoginAuto</c>: log
    /// masuk dahulu, hantar hanya apabila togol ini hidup.
    /// </summary>
    private void HantarAutoTetapkan(bool hidup)
    {
        var tetapan = _idMeSettingsStore.Baca();
        tetapan.HantarAuto = hidup;
        _idMeSettingsStore.Simpan(tetapan);
    }

    /// <summary>
    /// Senarai origin allowlist navigasi — fungsi TULEN (tiada WinForms, tiada
    /// I/O) supaya ia boleh diuji tanpa message-loop. Origin mod portal-sebenar
    /// sentiasa dikekalkan; origin idMe/MOEIS ditambah HANYA apabila pemilik
    /// menghidupkan auto-login. Selain itu semuanya kekal disekat (loopback
    /// dibenarkan oleh <see cref="NavigationGuard"/> sendiri).
    /// </summary>
    public static List<string> OriginsNavigasi(bool realPortalEnabled, IEnumerable<string> realPortalOrigins, bool loginAuto)
    {
        var origins = new List<string>();
        if (realPortalEnabled && realPortalOrigins != null)
        {
            origins.AddRange(realPortalOrigins);
        }
        if (loginAuto)
        {
            origins.Add(IdMeLoginEndpoints.IdMeOrigin);
            origins.Add(IdMeLoginEndpoints.MoeisOrigin);
        }
        return origins;
    }

    /// <summary>
    /// Rebuilds the navigation allowlist from the real-portal dev mode origins
    /// PLUS the idMe/MOEIS origins when (and only when) the owner has enabled
    /// the auto-login feature. Everything else stays blocked. Dipanggil semasa
    /// mula DAN selepas dialog "Akaun idMe" ditutup.
    /// </summary>
    private void RebuildNavigationGuard()
    {
        _navigationGuard = new NavigationGuard(OriginsNavigasi(
            _realPortal.Enabled,
            _realPortal.AllowedOrigins,
            _idMeSettingsStore.Baca().LoginAuto));
    }

    /// <summary>
    /// Demand-only auto-login entry point (tray "Log masuk idMe (atas
    /// permintaan)" and, later, the auto-send phase). It runs ONE portal
    /// lifecycle cycle: owner opt-in -> read-only engine demand probe -> open
    /// the portal ONLY if there is unfinished work today -> login. With no
    /// waiting work (or an unreachable engine) it performs ZERO portal
    /// activity. Never run on a timer/keepalive.
    /// </summary>
    public async Task CubaLoginAutoAtasPermintaanAsync()
    {
        try
        {
            var keadaan = await _lifecycle.PeriksaDanJalankanAsync(_cycleCts.Token);
            SetNavLabel($"Portal: {LabelKeadaanPortal.Teks(keadaan)} — {_lifecycle.Sebab}");
        }
        catch (OperationCanceledException)
        {
            // Real shutdown cancelled the cycle mid-retry. This runs from an
            // `async void` tray handler, so an escaping exception would take the
            // app down on exit instead of just stopping the retry loop.
            SetNavLabel("Portal: kitaran dibatalkan (aplikasi sedang ditutup).");
        }
    }

    /// <summary>
    /// Runs <paramref name="kerja"/> on the UI thread and awaits it there.
    ///
    /// The lifecycle's demand probe is real network I/O awaited with
    /// ConfigureAwait(false), so every continuation after it — opening the
    /// portal, driving the login DOM — resumes on a THREAD-POOL thread. WebView2
    /// is thread-affine: <c>CoreWebView2.Navigate</c> throws off the UI thread,
    /// and <see cref="WebView2IdMeLoginDom"/> swallows its own exceptions, so an
    /// off-thread login would degrade into an endless "halaman belum sedia"
    /// transient retry loop instead of failing visibly. Everything that touches
    /// WebView2 or WinForms therefore goes through here.
    /// </summary>
    private Task<T> PadaUiAsync<T>(Func<Task<T>> kerja)
    {
        if (Environment.CurrentManagedThreadId == _uiThreadId) return kerja();   // already on the UI thread

        if (!IsHandleCreated)
        {
            // Off the UI thread with no handle to marshal through: refuse rather
            // than touch WebView2/WinForms from here. PortalLifecycle turns this
            // into a visible "ralat teknikal" and retries, instead of an
            // invisible cross-thread failure.
            return Task.FromException<T>(new InvalidOperationException(
                "Tetingkap HADIR belum sedia (tiada handle); tindakan portal tidak dijalankan dari benang lain."));
        }

        var tcs = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
        try
        {
            BeginInvoke(new Action(async () =>
            {
                try { tcs.TrySetResult(await kerja()); }
                catch (OperationCanceledException) { tcs.TrySetCanceled(); }
                catch (Exception ralat) { tcs.TrySetException(ralat); }
            }));
        }
        catch (InvalidOperationException ralat)
        {
            // Handle torn down during exit.
            tcs.TrySetException(ralat);
        }

        return tcs.Task;
    }

    private async Task PadaUiAsync(Func<Task> kerja) =>
        await PadaUiAsync<bool>(async () => { await kerja(); return true; });

    /// <summary>
    /// <see cref="IMarshalUi"/> borang ini: satu-satunya jambatan yang diberi
    /// kepada modul yang menyentuh WebView2 (adaptor MOEIS). Ia hanya
    /// menghantar semula ke <see cref="PadaUiAsync{T}"/>, jadi peraturan benang
    /// kekal di SATU tempat.
    /// </summary>
    private sealed class MarshalUiBorang : IMarshalUi
    {
        private readonly MainForm _borang;

        public MarshalUiBorang(MainForm borang) => _borang = borang;

        public Task<T> JalankanAsync<T>(Func<Task<T>> kerja) => _borang.PadaUiAsync(kerja);
    }

    /// <summary>Status-strip text from any thread (text only, never a credential).</summary>
    private void SetNavLabel(string teks)
    {
        if (Environment.CurrentManagedThreadId == _uiThreadId)
        {
            _navLabel.Text = teks;
            return;
        }

        if (!IsHandleCreated) return;   // cannot marshal; the next cycle refreshes it

        try { BeginInvoke(new Action(() => _navLabel.Text = teks)); }
        catch (InvalidOperationException) { /* handle torn down during exit */ }
    }

    /// <summary>
    /// One-click "Cuba lagi": clears the consecutive-credential-rejection guard
    /// immediately (the guard is the ONLY auto-retry stop) and runs one more
    /// demand-only cycle. Clearing is not a login attempt by itself.
    /// </summary>
    public async Task CubaLagiPortalAsync()
    {
        _loginManager.CubaLagi();
        SetNavLabel("Pagar penolakan dikosongkan; menjalankan semakan deman semula…");
        await CubaLoginAutoAtasPermintaanAsync();
    }

    /// <summary>
    /// Opens the MOEIS attendance portal in the embedded WebView2. Called ONLY
    /// from <see cref="PortalLifecycle"/> and only after the owner opt-in AND a
    /// positive demand probe — the navigation allowlist still has the last word
    /// (MOEIS/idMe origins are permitted only in the real-portal run mode; see
    /// <see cref="RealPortalDevMode"/>).
    ///
    /// A portal that could NOT actually be opened is reported by THROWING, never
    /// by a silent return. <see cref="PortalLifecycle"/> reads a normal return as
    /// "opened" and would otherwise go on to the login stage — and, because a
    /// transient failure is retried indefinitely, retry that stage forever
    /// against a page this method never navigated to. Throwing instead makes the
    /// cycle report "Portal tidak dapat dibuka" with NOTHING typed, which is
    /// exactly what the caller is built to handle.
    ///
    /// Navigation only: this method types nothing, submits nothing, and is never
    /// invoked when the queue is empty. Marshalled to the UI thread because the
    /// lifecycle calls it from a thread-pool continuation (see
    /// <see cref="PadaUiAsync{T}"/>).
    /// </summary>
    private Task OpenPortalDemandAsync(CancellationToken ct) => PadaUiAsync(() =>
    {
        var wv = _webView.CoreWebView2;
        if (wv is null)
        {
            _navLabel.Text = "Portal tidak dibuka: WebView2 belum siap.";
            throw new InvalidOperationException("WebView2 belum siap (CoreWebView2 belum tersedia).");
        }

        var url = IdMeLoginEndpoints.KehadiranUrl;
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || !_navigationGuard.IsAllowed(uri))
        {
            _navLabel.Text = "Portal MOEIS disekat oleh allowlist navigasi — tiada kredensial ditaip.";
            throw new InvalidOperationException("Portal MOEIS disekat oleh allowlist navigasi.");
        }

        _navLabel.Text = "Ada kerja hari ini — membuka portal MOEIS (baca sahaja sehingga log masuk).";
        wv.Navigate(url);
        return Task.CompletedTask;
    });

    /// <summary>
    /// Reflects a lifecycle state change on the UI thread: window status strip,
    /// tray tooltip and the tray status row. Text only — never a credential.
    /// </summary>
    private void LaporKeadaanPortal(KeadaanPortal keadaan, string sebab)
    {
        void Terapkan()
        {
            _keadaanPortal = keadaan;
            UpdateStateLabel();
            _tray.SetPortalKeadaan(keadaan, sebab);
            _navLabel.Text = $"Portal: {LabelKeadaanPortal.Teks(keadaan)} — {sebab}";
        }

        if (Environment.CurrentManagedThreadId == _uiThreadId)
        {
            Terapkan();
            return;
        }

        // Off the UI thread (the lifecycle reports from a thread-pool
        // continuation): NotifyIcon.Text and the status strip must not be
        // touched from here. Without a handle there is nothing to marshal
        // through, so the update is dropped — the lifecycle keeps the
        // authoritative state and the next cycle refreshes the UI.
        if (!IsHandleCreated) return;

        try
        {
            BeginInvoke(Terapkan);
        }
        catch (InvalidOperationException)
        {
            // Handle torn down during exit; the status is not worth crashing over.
        }
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
    /// Waiting-HADIR-task probe — the ONE and only demand signal, now WIRED to
    /// the real engine: a read-only, nonce-authenticated `GET /api/kerja` for
    /// today's jobs in status menunggu / sedang_dihantar / tersimpan. Answered
    /// false — with the reason recorded in the lifecycle state — whenever the
    /// answer is not provably positive (no job, engine not running, nonce
    /// rejected, unreadable body). Never guesses "ada kerja"; never navigates,
    /// never probes a session, never logs in.
    /// </summary>
    private async Task<bool> AdaKerjaMenungguAsync()
    {
        var kerja = await _kerjaHariIni.SemakAsync();
        SetNavLabel("Deman: " + kerja.Sebab);
        return kerja.EnjinBolehDicapai && kerja.AdaKerja;
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
            // Stop any in-flight demand cycle (and the login manager's indefinite
            // transient retry loop) BEFORE the WebView2/HttpClient it drives are
            // torn down. Cancel only — the CTS is deliberately not disposed, so a
            // Task.Delay registration racing shutdown can never see a disposed
            // source; the process is exiting anyway.
            try { _cycleCts.Cancel(); }
            catch (ObjectDisposedException) { /* already cancelled */ }

            _devicePanel.Dispose();
            _portalServer.Dispose();
            _loopbackSource.Dispose();
            (_kerjaHariIni as IDisposable)?.Dispose();
            _kerjaPenuh.Dispose();
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
        _stateLabel.Text = $"Keadaan: {_stateMachine.State} · portal: {LabelKeadaanPortal.Teks(_keadaanPortal)}";
    }
}
