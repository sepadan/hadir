# HADIR Desktop — Implementation Brief (iteration 1)

You are implementing the FIRST working Windows desktop app for the HADIR ecosystem.
This is a **DEMO-mode-first** deliverable. Build a real, launchable, tested artifact —
NOT a stub. Read this brief fully, implement exactly, then report what you built and
what you verified.

## Context (do not re-research; facts already gathered)

- Repo: `C:/Users/seman/ai-team-sepadan/hadir`. You are creating everything under `desktop/`.
- Existing production engine: a Node "companion" (`companion/`) that listens on
  `127.0.0.1:8747` (loopback ONLY), `Origin` allowlist default `['https://sepadan.github.io']`
  (exact match, no wildcards), Bearer token + nonce protections. Its read-only status
  endpoint is `GET /api/status` returning roughly:
  ```json
  { "ok":true, "versi":"...", "pc":"...", "adaRahsiaEnjin":false,
    "giliran":{ "...": "...", "klaimDisokong":false },
    "pasangan":[], "moeis":{ "...":"..." }, "autoMula":{...}, "kalendar":{...} }
  ```
  The desktop app must NOT reimplement attendance algorithms. It wraps the engine
  through an explicit browser-transport/status adapter.
- .NET SDK 8.0.407 is installed (`dotnet`). Target `net8.0-windows`.
- WebView2 Evergreen Runtime 153.0.4234.48 is installed. Use NuGet
  `Microsoft.Web.WebView2` version `1.0.2792.45`.

## Hard constraints (must hold)

1. **DEMO mode, visibly labelled.** Window title + an in-window banner must say
   something like "HADIR Desktop — MOD DEMO". Never ambiguous.
2. **No production activation.** No auto-starts, no MOEIS writes, no idMe login,
   no real attendance writes, no credentials, no tokens, no student PII.
3. **Read-only engine status.** The app may read engine status; it must NOT start,
   stop, restart, or otherwise mutate the engine in this iteration.
4. **No LAN ports opened.** Everything loopback only (`127.0.0.1`). Web/phone reach
   the engine via HADIR backend, never via an open LAN port (document, don't build).
5. **Never embed idMe login in an iframe.** WebView2 top-level navigation only;
   new-window policy must respect origin transitions; external links require user
   approval (in DEMO, block + notify, never auto-open).
6. **No CDP/remote-debug exposed.** No `--remote-debugging-port` in DEMO build.
7. **No PII/credentials in logs.** Keep log output to status/booleans/labels.
8. **Single desktop instance.** Second launch must not spawn a second app.

## Project layout to create

```
desktop/
  HadirDesktop.sln
  HadirDesktop/
    HadirDesktop.csproj
    Program.cs                 # entry: single-instance + tray host + Application.Run
    SingleInstance.cs          # named Mutex + optional EventWaitHandle signal
    AppStateMachine.cs         # pure state machine (Running/HiddenToTray/Exiting)
    TrayHost.cs                # NotifyIcon + context menu (Show, Open Settings, Exit)
    MainForm.cs                # WinForms host embedding WebView2 + status strip
    EngineStatusModel.cs       # immutable DTO parsed from engine status JSON
    IEngineStatusSource.cs     # abstraction
    FixtureEngineStatusSource.cs   # DEMO: canned simulated status (labelled simulated)
    LoopbackEngineStatusSource.cs  # real read-only GET http://127.0.0.1:8747/api/status
    NavigationGuard.cs         # allowlist pure logic (IsAllowed(Uri) -> bool)
    FixturePortalServer.cs     # loopback HttpListener serving fake portal HTML (labelled)
    DemoLabel.cs               # constant demo labels (pure)
  HadirDesktop.Tests/
    HadirDesktop.Tests.csproj  # xUnit, references HadirDesktop
    SingleInstanceTests.cs
    AppStateMachineTests.cs
    NavigationGuardTests.cs
    EngineStatusModelTests.cs
    FixtureEngineStatusSourceTests.cs
  docs/
    ARCHITECTURE.md            # multi-device architecture (see below)
    PLAN.md                    # phased implementation plan (see below)
  PROGRESS.md                  # durable progress: implemented vs pending vs blockers
```

## Behavior spec

### Single instance
- Named mutex (e.g. `Global\HadirDesktop.SingleInstance`). If already held, signal the
  existing instance (optional named `EventWaitHandle`) and exit the new process cleanly.
- Keep the mutex held for process lifetime (GC.KeepAlive or a static field).

### State machine (`AppStateMachine`, pure + unit-testable)
States: `Running`, `HiddenToTray`, `Exiting`. Transitions:
- `OnCloseRequested()` (user clicks X): Running→HiddenToTray (hide window, keep running);
  HiddenToTray→HiddenToTray (idempotent).
- `OnShowRequested()`: HiddenToTray→Running.
- `OnExitRequested()`: any→Exiting.
Expose current state; throw/assert on invalid transitions (or return bool).

### Tray
- `NotifyIcon`, context menu: **Tunjuk/Show**, **Tetapan Tempatan/Open Settings**,
  **Keluar/Exit**.
- Close-X → hide to tray + (first time only) balloon tip "Masih berjalan dalam dulang
  sistem." Then a real **Exit** (from tray) disposes tray icon and closes cleanly.
- `Application.SetHighDpiMode` + `ApplicationConfiguration.Initialize()` as appropriate
  for WinForms on net8.

### MainForm + WebView2
- Embed WebView2 filling the form.
- `CoreWebView2Environment` with a dedicated user-data folder:
  `%LOCALAPPDATA%\HadirDesktop\webview2-demo`.
- Navigation guard: intercept `NavigationStarting` and `NewWindowRequested`. Allow only
  the fixture portal origin and `127.0.0.1`/`localhost` loopback. Anything else →
  cancel + show a non-blocking status message (do NOT open a browser).
- Load the fixture portal (served by `FixturePortalServer` on a loopback port) as the
  default page, proving the embedded browser works against a fake portal fixture.
- A visible **DEMO** banner + a status strip showing: app state, engine status
  (from `IEngineStatusSource`), and a clearly labelled source ("simulasi" vs "enjin
  sebenar 127.0.0.1:8747").

### Engine status source
- `FixtureEngineStatusSource` (default, DEMO): returns a simulated
  `EngineStatusModel` whose values are visibly non-production (e.g. `ok:true`,
  `adaRahsiaEnjin:false`, `giliran:{...}` with a note it is simulated).
- `LoopbackEngineStatusSource`: best-effort `GET http://127.0.0.1:8747/api/status`,
  short timeout, graceful when engine not running (return a "not running" status,
  never throw to UI). Read-only.
- A status-refresh button (manual) re-reads via the active source. No polling loops,
  no keepalive.

### Fixture portal
- `FixturePortalServer` (HttpListener bound to `127.0.0.1`, ephemeral port) serves one
  HTML page clearly titled "Portal Palsu (Fixture) — bukan idMe/MOEIS sebenar". It
  should look enough like a portal (a fake header, a fake "kelas" list, a fake status
  box) to prove WebView2 rendering + local integration, but MUST be obviously fake.
- Stop/dispose the listener on app exit.

### Logging
- Minimal, to a local file under `%LOCALAPPDATA%\HadirDesktop\logs\` if convenient, or
  just `Trace`. No PII, no tokens, no URLs with secrets.

## Tests (xUnit) — must pass

- `SingleInstanceTests`: acquiring the same mutex name twice → second fails.
- `AppStateMachineTests`: X→tray, tray→show, exit from any, idempotent X, invalid
  transition behavior.
- `NavigationGuardTests`: allows fixture/loopback origin; blocks `https://evil.example`,
  blocks `about:blank`, blocks non-loopback IP.
- `EngineStatusModelTests`: parses a representative `/api/status` JSON into the model
  without throwing; missing fields are tolerated.
- `FixtureEngineStatusSourceTests`: returns simulated status; flags it simulated.

## Docs to write (concise but real)

### `docs/ARCHITECTURE.md`
Cover the multi-device model at design level (do NOT implement/deploy backend):
- Windows app = PC engine server host; WebView2 embedded portal (not separate Edge
  popups); tray keeps running; shared local settings.
- Topology: `web/phone → HADIR backend (Apps Script) → Windows engine` (no open LAN
  ports). The Windows engine polls HADIR; HADIR never opens inbound LAN.
- Multiple installations: admin approval; ONE active executor per idMe account;
  primary/standby; heartbeat + server lease + task leases; safe takeover that does not
  race portal sessions.
- Auto/manual dispatch; saved attendance in HADIR; explicit "marked" vs "not-entered";
  completeness incl. absence reason; per-revision idempotency; delay after edits;
  manual override; notifications without PII; demand-only browser activity (no idle
  login/keepalive).
- WebView2 SSO compatibility = UNPROVEN until tested live; label it so.
- Security barrier: CDP/remote-debug is sensitive; document the barrier required
  before production (lifecycle/port restrictions, no unauthenticated public debug).
- Browser transport adapter: preserve the existing Node engine business rules; the
  desktop app drives them via a transport adapter, never reimplements attendance logic.

### `docs/PLAN.md`
Phased plan: (1) demo app (this iteration), (2) backend device registration +
heartbeat + account-lease fencing, (3) revision outbox autosend, (4) admin roles +
web remote status. Mark what is done vs pending.

### `PROGRESS.md`
Durable state so the next phase continues without re-audit: implemented, pending,
known blockers, build/test commands + exact results.

## Do NOT do
- Do NOT modify anything outside `desktop/` (preserve `companion/`, `app.js`, etc.).
- Do NOT `git commit`/`git push` (parent gates that).
- Do NOT touch real student data, credentials, or the live portal.
- Do NOT enable autostart, spawn the engine, or open LAN ports.

## Deliverable
After implementing: run `dotnet build` and `dotnet test`, and report the exact
executable path (`desktop/HadirDesktop/bin/Debug/net8.0-windows/HadirDesktop.exe`),
build output, test results, and any deviations. Be honest about what is not built or
not verified.
