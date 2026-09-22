# HADIR Desktop — Phased Plan

## Phase 1 — DEMO desktop app + hardening — DONE

- WinForms host (`net8.0-windows`) with single-instance guard, tray, and an
  `AppStateMachine` (Running / HiddenToTray / Exiting).
- WebView2 embedded view, loopback-only, pointed at a local fixture portal
  server (`FixturePortalServer`) instead of any real portal/idMe origin.
- `NavigationGuard` blocks everything except loopback hosts — no external
  navigation, no browser popouts (`NewWindowRequested` is always blocked and
  the URI is surfaced in the status strip instead).
- `IEngineStatusSource` abstraction with two implementations:
  - `FixtureEngineStatusSource` (default): canned, visibly simulated status.
  - `LoopbackEngineStatusSource`: **authenticated, read-only** local client —
    nonce handshake via `GET /` redirect, `X-HADIR-Lokal` + exact loopback
    `Origin` for `/api/lokal/status`, distinct `Ok/Offline/Unauthorized/
    Timeout/Malformed` outcomes. Never mutates, never logs the nonce.
  - Manual refresh only — no polling loop, no keepalive.
- "Tetapan Tempatan" opens the **real** engine local settings (nonce-gated
  loopback UI) in the embedded WebView2 — read-only from the app's side.
- Visible DEMO banner + window title on every surface.
- xUnit test project (35 tests) covering the state machine, navigation guard,
  status model parsing (real nested shape), fixture status source, single
  instance, and **real HTTP integration** for the status source (nonce
  handshake, auth failure, redirect allowlist, malformed body, offline, no
  credential leakage).
- **Dev/test debug transport (opt-in, loopback-only, ephemeral)** +
  Playwright↔WebView2 drive proof while minimized — see
  `docs/PLAYWRIGHT-CDP-REPORT.md`. idMe SSO remains UNVERIFIED.

Explicitly NOT in Phase 1: any engine control (start/stop/restart), any real
idMe/MOEIS navigation, any network identity for this installation, any
cross-device coordination.

## Phase 2 — Backend device registration + heartbeat + account-lease fencing

In progress — backend device registry + leadership/fencing implemented in
staged code (feature flag `HADIR_PELBAGAI_PC` OFF by default); not deployed;
no production engine control yet.

- Register each desktop installation with HADIR backend (admin-approved).
- Heartbeat from the active (primary) installation to HADIR backend.
- Server-side lease per idMe account so only one installation is ever primary
  for that account at a time.
- Safe takeover logic when a heartbeat lapses (lease expiry, not just
  timeout-on-the-client, to avoid split-brain).
- This phase does not yet dispatch real attendance work — it only proves the
  registration/lease/heartbeat plumbing end to end.

### Scope of this slice

IS implemented (staged, fake/pure-tested only, feature flag OFF by default):
- `hadir-pc/kontrak.mjs` — dependency-free domain module (enrollment codes,
  device registration, heartbeat, leadership claim with monotonic `generasi`
  fencing, takeover-overlap guard against live task leases, sanitized public
  status), tested against fakes in `hadir-pc/tests/`.
- `hadir-pc/kontrak.schema.json` — hand-written JSON Schema shared contract
  reference; validated against the module's own outputs in
  `hadir-pc/tests/skema.test.mjs`.
- `hadir-pc/klien-peranti.mjs` — client-side contract validator (throws on
  shape mismatch), tested with a fake `fetchImpl`, no live HTTP.
- `apps-script/HadirWeb.gs` — mirrored (not imported — Apps Script cannot
  import ESM) backend section implementing the SAME state rules, gated by
  Script Property `HADIR_PELBAGAI_PC` (OFF by default), whitelisted in
  `hadirDoPost_`; structural assertions added to `tests/hadir.test.cjs`.
- `desktop/HadirDesktop/DeviceRegistryModels.cs` + `DeviceCapability.cs` +
  `DeviceRegistrationClient.cs` — tolerant C# contract models + a read-only
  capability probe / RPC client (never auto-retries state-changing calls,
  never logs the device secret), unit- and fake-HTTP-tested.
- `desktop/HadirDesktop/DevicePanel.cs` — a REAL enrollment + status +
  heartbeat panel wired into `MainForm.cs`: enroll with an admin-issued code,
  store the device secret via `DpapiDeviceSecretStore` (DPAPI CurrentUser, no
  plaintext fallback), then an opt-in manual Start/Stop heartbeat. Sends no
  traffic until the operator acts; refuses any non-Apps-Script endpoint
  (`HadirEndpointValidator`).
- `desktop/HadirDesktop/HeartbeatLoop.cs` — opt-in, manual heartbeat loop:
  idempotent Start/Stop (no duplicate loops), serialized single in-flight
  request, cancel-on-dispose, bounded exponential backoff with reset-on-success,
  leader/standby reporting, terminal stop on revoke/disable.
- `desktop/HadirDesktop/DeviceSecretStore.cs` — `IDeviceSecretStore` +
  `DpapiDeviceSecretStore` (DPAPI) and `IDeviceIdentityStore` + JSON identity
  (non-secret). Secret is transient in memory and DPAPI-only on disk.
- An admin-only "Peranti PC" section in `app.js` / `index.html` with real
  buttons: `Terbit Kod Daftar` (single-use, expiring) and `Nyahaktif` per
  active device, gated by `state.token`.
- `tests/hadir-pc-vm.test.cjs` — runs the ACTUAL `apps-script/HadirWeb.gs`
  functions in a Node VM with fake Spreadsheet/Properties/Lock/Auth (atomic
  single-use enrollment, sanitized heartbeat, generation fencing on concurrent
  takeover, flag-OFF disables all writes, public status creates no sheets,
  admin RPC auth) — not just the `hadir-pc` mirror.

NOT implemented (still pending, no code exists for these):
- No live dispatch of attendance/engine work tied to leadership — leadership
  is REPORTED (Pemimpin/Sedia-standby), never acted upon, in this slice.
- No production deploy of the `HADIR_PELBAGAI_PC` flag (stays OFF).
- No AUTO-start heartbeat: the heartbeat loop is always manually started
  (opt-in); it never auto-resumes across tray-hide or app restart.
- No physical portal partition guarantees — Apps Script cannot transactionally
  fence an already-running portal browser (see BLUEPRINT "Had jujur").

## Phase 3 — Revision outbox autosend

Pending. Not started.

- An outbox of pending attendance revisions on the engine side, each with a
  revision id for idempotency.
- Autosend logic that respects "delay after edits" (debounce near submission
  boundaries) and completeness rules (marked vs not-entered, absence reason
  required).
- Manual override path that always wins over an in-flight auto-dispatch.
- Desktop app surfaces outbox status (counts, last-sent) read-only; dispatch
  triggering itself is engine-owned, not reimplemented in the desktop shell.

## Phase 4 — Admin roles + web remote status

Pending. Not started.

- Web-side (HADIR backend / portal) view of which installations are primary
  vs standby, their heartbeat freshness, and outbox depth — status/labels
  only, no PII per [[ARCHITECTURE.md]] notification rules.
- Admin role to approve/revoke installations and force a takeover in an
  emergency (e.g. a PC is being decommissioned).

## Status legend

- **DONE** — implemented and covered by `dotnet test` in this repo.
- **Pending** — designed at the level of `docs/ARCHITECTURE.md`, not started.

See `PROGRESS.md` for exact build/test commands and results for Phase 1.
