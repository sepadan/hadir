# WebView2 + Playwright/CDP — feasibility report (dev fixture)

Status: PROVEN for the bounded dev fixture only, with a **genuine** gate (not
a vacuous one — see "What was fixed" below). **WebView2 idMe SSO remains
UNVERIFIED** (never tested against a real idMe/MOEIS origin, per hard
constraint).

## What was fixed (2026-09-22 correction)

An earlier pass of this report claimed a CDP feasibility proof, but the
checker itself was vacuous in two places and never exercised the production
MOEIS adapter:

- The "CDP endpoint reachable" check was `ver['Browser']?.includes('WebView2')
  || true` — a tautology that passed regardless of the actual value.
- The "CDP bound to loopback" check ran a regex over a **hardcoded**
  `127.0.0.1` string, never inspecting the real OS socket.
- The harness only read a marker DOM node and the page title — it never drove
  the production `buatAdaptorPlaywright` (`companion/src/moeis/adaptorPlaywright.mjs`)
  against class-selection DOM the way the real engine does.
- The dev message bridge (`MainForm.CoreWebView2_WebMessageReceived`) honoured
  `minimize`/`hide`/`show`/`shutdown` from **any** page loaded in the
  WebView2, including the real engine settings UI or a future SSO page.

`desktop/dev-fixture/playwright/drive-fixture.mjs` was rewritten to close all
four gaps (see "What is proven now"), and the dev bridge is now origin-gated
(`HadirDesktop/DevFixtureOrigin.cs`, wired into `MainForm.CoreWebView2_WebMessageReceived`
via `IsDevFixtureMessageSource()`).

## What is proven now

A Node Playwright adapter (`playwright.chromium.connectOverCDP`) drives the
**embedded WebView2** inside the HADIR desktop app, against **served MOEIS-like
dev fixture pages** (not any real portal/profile), while the host window is
**minimized** — and the app exits cleanly with no orphan browser processes.

Commands (from `desktop/`):

```
# 1. build
dotnet build
dotnet test

# 2. launch the opt-in dev/debug transport (loopback CDP + ephemeral profile)
HADIR_DEV_DEBUG=1 ./HadirDesktop/bin/Debug/net8.0-windows/HadirDesktop.exe &

# 3. drive the embedded WebView2 fixture (minimize + class-selection + graceful exit)
cd dev-fixture/playwright
node drive-fixture.test.mjs                # pure-function unit tests
HADIR_SHUTDOWN=1 node drive-fixture.mjs    # genuine CDP-driven feasibility gate

# 4. verify normal mode never enables CDP (separate launch, no HADIR_DEV_DEBUG)
../../HadirDesktop/bin/Debug/net8.0-windows/HadirDesktop.exe &
node verify-normal-mode.mjs
```

Result: **29/29 drive checks passed** (`drive-fixture.mjs`, including the
optional graceful-shutdown phase), **19/19 pure unit tests passed**
(`drive-fixture.test.mjs`), and **3/3 normal-mode checks passed**
(`verify-normal-mode.mjs`) on this machine (2026-09-22). Verbatim output is in
`desktop/PROGRESS.md`.

Checks now performed, replacing the vacuous ones:

- **Owned-process fingerprint** (`semakFingerprintWebView2`): the PID owning
  the CDP port is resolved via `netstat -ano`, then independently verified via
  `tasklist` (image name is literally `msedgewebview2.exe`) and
  `Get-CimInstance Win32_Process` (command line carries BOTH
  `--remote-debugging-port=<port>` AND the isolated `webview2-dev-<port>`
  profile). A process that merely *claims* `Browser: WebView2` in
  `/json/version` without this fingerprint is rejected and the run **aborts**
  before touching any page.
- **Real loopback-bind verification** (`semakAlamatLoopback`): parses the
  actual `netstat -ano -p TCP` LISTENING row for the CDP port and rejects
  wildcard/public binds (`0.0.0.0`, `[::]`, `192.168.1.5`, …) — not a regex
  over a hardcoded string. Self-tested against synthetic netstat rows in the
  same run (5 accept/reject cases).
- **Exact dev-fixture origin match** (`adalahAsalFixtureDev`): the CDP page is
  only trusted if its URL is `http`, loopback host, and path `/dev` or
  `/dev/...` — checked before any `evaluate`/`click`. A negative test
  navigates the same WebView2 to the **normal** fixture origin (`/`, same
  host/port, different path) and confirms it is rejected.
- **Production adapter driven against served MOEIS-like fixtures**: 3
  sequential fake classes (`/dev/kelas/1..3`, served by
  `FixturePortalServer.BuildDevFixtureHtml`, mirroring
  `companion/tests/adaptor-playwright.test.mjs` /
  `pekerja-batch-adaptor-sebenar.test.mjs` exactly) are each driven with a
  **fresh** `buatAdaptorPlaywright(page)` while the host window stays
  minimized: `pilihKelas(...)` and `bacaRingkasanKelas(...)` are asserted
  against the known-correct class/hadir/jumlah for that scenario, and all 3
  reads are asserted **mutually distinct** (no state inheritance across the
  shared page/context).
- **Origin-gated dev bridge**: `DevFixtureOrigin.IsDevFixture` (unit-tested,
  12 cases) is the single enforcement point in
  `MainForm.CoreWebView2_WebMessageReceived` — the handler returns
  immediately if the current WebView2 source is not the exact dev-fixture
  origin, so a real settings/SSO page loaded in the same WebView2 can never
  drive the host window.
- **External normal-mode verification** (`verify-normal-mode.mjs`): run
  against a **separate** normal-mode launch (no `HADIR_DEV_DEBUG`) — confirms
  no `msedgewebview2.exe` under the normal profile carries
  `--remote-debugging-port`, and that `devtools-port.txt` is absent or
  predates the normal launch. Never prints raw command lines (PII risk) —
  only counts/booleans.
- **Clean graceful shutdown**: a dev-only `shutdown` message (already
  origin-gated) triggers exit; afterwards no `HadirDesktop.exe` and no
  `msedgewebview2.exe` carrying our `webview2-dev-<port>` profile remain.

## How the debug transport is bounded (security)

- **Opt-in only**: enabled iff `HADIR_DEV_DEBUG=1`. In normal app mode
  `DevDebugTransport.FromEnvironment()` returns `null` and **no**
  `--remote-debugging-port` is ever passed (verified: normal-mode launch shows
  zero `remote-debugging-port` in the WebView2 process command line and no port
  file is written).
- **Loopback only**: only `--remote-debugging-port=<port>` is passed;
  `--remote-debugging-address` is **never** passed, so the CDP endpoint never
  leaves 127.0.0.1.
- **Ephemeral + isolated**: a random loopback port and a dedicated
  `webview2-dev-<port>` user-data folder — never the normal demo profile, never
  the real portal profile, never real credentials.
- The chosen port is written to `%LOCALAPPDATA%\HadirDesktop\devtools-port.txt`
  (a non-secret port number) so the test harness can discover it without
  scanning.
- **Origin-gated message bridge**: even when the debug transport is active,
  `MainForm.CoreWebView2_WebMessageReceived` only honours messages from the
  exact dev-fixture origin (`DevFixtureOrigin.IsDevFixture`). Loading the real
  engine settings UI or any other origin in the same WebView2 cannot drive the
  host window (minimize/hide/show/shutdown).

## Unsupported / risky Playwright↔CDP behaviours (do NOT rely on)

- **No idMe SSO verification.** The dev fixture is a local static page. Nothing
  here proves idMe's redirect chain, device-binding, or anti-automation checks
  accept a WebView2-embedded session. That must be tested separately against
  the real idMe origin before production.
- **Single default context.** WebView2 exposes one browser context; Playwright's
  `context` API and multi-context isolation do not map onto it. Do not assume
  `browser.newContext()` semantics.
- **No cookie/session API guarantees.** WebView2's cookie store is tied to its
  user-data folder, not to Playwright's cookie jar. Treat any cookie/credential
  reading as supply-chain-sensitive and out of scope here.
- **CDP is a full-control surface.** Any code that can reach the CDP port can
  read cookies/session tokens and inject input. For production this is why the
  transport stays strictly opt-in, loopback-only, and off in normal builds.

## Secure production approach

- Keep CDP **disabled** in normal builds (current behaviour). If ever needed for
  diagnostics, use exactly this opt-in, loopback-only, ephemeral-profile
  mechanism — never a fixed public port, never `--remote-debugging-address`.
- The desktop app remains a **transport/shell adapter**: attendance rules, MOEIS
  writes and idMe auth stay in the Node companion. The desktop app drives the
  engine over its loopback API, never by scraping the portal DOM directly.
- Any future automation that must run against the real portal goes through a
  narrowly scoped, engine-owned adapter (mirroring `IEngineStatusSource`), not
  ad-hoc Playwright scripts.
