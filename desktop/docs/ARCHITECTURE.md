# HADIR Desktop — Architecture (design level, iteration 1)

Status: this document describes the intended multi-device architecture. Only
the DEMO desktop shell (this iteration) is implemented. Nothing described
below beyond "iteration 1" is built or deployed.

## Role of the Windows app

The Windows desktop app is the **PC engine server host**: the machine that
physically runs the Node companion engine (`companion/`, loopback
`127.0.0.1:8747`) is the machine a teacher or admin has designated to execute
attendance actions. The desktop app:

- Embeds a WebView2-hosted portal view (not separate popped-out Edge windows)
  so the whole experience stays inside one managed, policy-controlled surface.
- Runs in the system tray so the engine keeps running across portal-window
  close, without requiring the user to keep a browser tab open.
- Owns shared local settings (which engine status source to read, window
  state) — nothing here is shared across machines in this iteration.

The desktop app is a **transport and shell adapter**. It does not reimplement
attendance algorithms, MOEIS submission logic, or idMe auth flows — those
remain exclusively in the Node companion engine. See "Browser transport
adapter" below.

## Topology (target, not yet built)

```
web/phone  -->  HADIR backend (Apps Script)  -->  Windows engine (this PC)
```

- The Windows engine **polls** HADIR backend for pending work; it never
  accepts inbound connections from the internet or LAN.
- HADIR backend never opens an inbound connection to the Windows engine.
- No LAN port is opened by the desktop app or the companion engine for this
  purpose. The engine's existing `127.0.0.1:8747` listener is loopback-only
  and stays that way — it is reachable only by processes on the same
  machine (this desktop app, or a locally-run browser hitting localhost).
- Phones and other desks never talk to `127.0.0.1:8747` directly; they go
  through HADIR backend, which relays to whichever engine instance currently
  holds the active lease (see below).

## Multiple installations

Multiple PCs may each run this desktop app with their own engine instance.
Only **one active executor per idMe account** may act at a time, to avoid
duplicate/conflicting attendance writes.

- **Admin approval**: a new installation must be approved (by an admin,
  server-side) before HADIR backend will route work to it.
- **Primary/standby**: one installation is primary (active); others are
  standby, visible but not dispatched to.
- **Heartbeat + server lease + task leases**: the primary sends a periodic
  heartbeat to HADIR backend to keep its lease; HADIR backend issues
  short-lived task leases per unit of work so a task is never claimed twice.
- **Safe takeover**: if the primary's heartbeat lapses, a standby may take
  over, but only after the server-side lease expires — this must not race an
  in-flight portal session (e.g. mid-submission) on the previous primary.

None of this is implemented yet; the desktop app currently has no networked
identity, no heartbeat, and no lease logic.

## Dispatch and data model (target)

- **Auto/manual dispatch**: routine attendance runs may be auto-dispatched by
  schedule; ad-hoc corrections are manually dispatched by a user action.
- **Saved attendance lives in HADIR**, not on the desktop machine. The
  desktop/engine is a temporary executor, not a data store.
- **Explicit "marked" vs "not-entered"**: the system must distinguish a
  deliberate absence-reason entry from a student simply not yet processed —
  never silently default one into the other.
- **Completeness including absence reason**: a day/class is not "done" until
  every student has either a presence mark or an absence reason.
- **Per-revision idempotency**: each submission carries a revision id so a
  retried or duplicated dispatch cannot double-submit.
- **Delay after edits**: edits made close to a submission boundary get a
  short debounce/delay before dispatch, to absorb corrections.
- **Manual override**: a human can always override an auto-dispatched result
  before it is final.
- **Notifications without PII**: any cross-device notification (e.g. "engine
  X is now primary") carries status/labels only, never student names or IDs.
- **Demand-only browser activity**: the embedded browser should not sit idle
  logged in or polling for its own sake — no idle keepalive sessions, no
  background login. Navigation happens because a specific task demands it.

## WebView2 / idMe SSO compatibility

**UNPROVEN until tested live.** WebView2 (Chromium-based Edge) is expected to
be broadly compatible with idMe's SSO flow, but this has not been verified
against the real idMe login in this iteration — the DEMO build never loads
the real idMe origin at all (see `NavigationGuard`). Before any production
use, this must be tested explicitly, including:

- Whether idMe's SSO redirect chain works inside a WebView2 top-level
  navigation (no iframe — see hard constraint 5 in the implementation brief).
- Whether any anti-automation / device-binding checks idMe performs treat a
  WebView2-embedded session differently from a normal Edge/Chrome tab.
- Cookie/session persistence behavior tied to the dedicated WebView2
  user-data folder.

### Shared idMe credential + demand-only auto-login (added, default OFF)

As of 2026-09-22 the shell has a staged, default-OFF path for exactly this:

- **DPAPI credential** (`KredensialIdMeStore`) uses the companion's
  `kredensial.dat` format (DPAPI CurrentUser, null entropy). The file is now
  Desktop-owned (`%LOCALAPPDATA%\HadirDesktop\enjin\kredensial.dat`);
  an existing companion blob is carried over once by byte copy (see
  "Desktop-owned data" below), so no re-typing.
- **Masked owner entry** (`IdMeSettingsDialog`): the owner types the password
  into the app's own masked field; the value is never printed/logged/committed.
- **Demand-only auto-login** (`IdMeLoginFlow` + `IdMeLoginManager` +
  `IdMeLoginDemand` + `WebView2IdMeLoginDom`): the ONLY trigger is a waiting
  HADIR task (unfinished attendance); with an empty queue there is zero
  portal/login activity and no timer/keepalive. Reuses the same safety gates
  (HTTPS+host before typing, phrase/checkbox, OTP/CAPTCHA stop). The only
  auto-retry stop is a consecutive-credential-rejection guard (default 5,
  0 = never stop, one-click clear).
- All OFF by default; fixture-tested only; no live idMe/MOEIS writes yet.

## Security barrier: CDP / remote debugging

Chromium's remote-debugging protocol (CDP), if exposed
(`--remote-debugging-port`), gives **full programmatic control** over the
embedded browser — including reading cookies/session tokens and injecting
input. This is a supply-chain-grade risk for anything that touches a real
idMe session.

- Normal app mode never passes `--remote-debugging-port` (verified — no
  `remote-debugging-port` appears in the WebView2 process command line).
- A bounded, opt-in `DevDebugTransport` exists for developer/test builds only:
  enabled by `HADIR_DEV_DEBUG=1`, it adds `--remote-debugging-port=<random>`
  on loopback only (never `--remote-debugging-address`), uses an isolated
  ephemeral `webview2-dev-<port>` profile, and writes the port to a local
  marker file for a test harness to discover.
- Playwright `connectOverCDP` was proven able to drive the embedded WebView2
  dev fixture while minimized (see `docs/PLAYWRIGHT-CDP-REPORT.md`). This does
  NOT verify idMe SSO compatibility — that remains a separate, explicit test
  against the real idMe origin before any production use.

## Desktop-owned data and Companion retirement (1.0.13)

- **Data dir.** Backend config (`tetapan.json` + DPAPI `rahsia.dat`) and the
  idMe credential (`kredensial.dat`) live in `%LOCALAPPDATA%\HadirDesktop\enjin\`
  (`LaluanDataDesktop.DirEnjin`). Runtime never reads
  `%LOCALAPPDATA%\HADIR-MOEIS-Companion\`.
- **One-time migration** (`MigrasiDataCompanion`, first thing in the `MainForm`
  constructor): per unit (`backend`, `kredensial`), a byte copy is made only when
  the companion source decrypts and validates on this Windows account and
  Desktop has no valid data of its own. Valid Desktop data is never overwritten;
  invalid Desktop data is overwritten only when Desktop's own
  `migrasi-<unit>.belum-selesai` marker shows it is left over from an
  interrupted copy. The copy is validated again before the marker is removed.
  Final outcomes go to `migrasi-companion.json`, so a later deletion in Desktop
  is not undone by copying from the companion again. A corrupt record stops the
  migration. Companion files are never deleted or modified. Only outcome names
  are logged.
- **Migration gate at runtime.** While `migrasi-backend.belum-selesai` exists,
  `DpapiRahsiaEnjinStore.Baca()` returns null even if the copied pair is
  valid, and `MainForm` builds no client unless the backend migration is final.
  A credential counts as valid only with user, password AND security phrase.
- **Active-config gate.** The backend client is built once, through
  `PagarKonfigurasiBackend`. The gate re-reads the Desktop config (SHA-256
  fingerprint, in memory only) at three points: when each client method
  starts; inside `HadirBackendClient` immediately before EVERY
  `HttpClient.SendAsync`, including each retry after the 2 s/6 s wait; and
  immediately before each MOEIS portal write (`pagarSebelumPortal`). If the
  config was removed, corrupted or changed, the gate refuses with a
  non-temporary `HadirBackendException`: no bytes are sent, no retry happens,
  no portal write starts, and a claim already held is released.
  Release/complete for a task claimed through this gate (and not yet
  released) are still allowed, so a MOEIS write that already happened is
  recorded rather than repeated. A held claim never allows a new portal
  write. Limit: an HTTP request or portal write already in progress cannot
  be recalled; revocation takes effect at the next check and is not atomic.
- **Durable migration finality.** A unit becomes final only after
  `migrasi-companion.json` is written and read back with the same value. The
  unit's marker is first set to `muktamad:<outcome>`, then the record is
  written and verified, and only then is the marker removed. If the record
  fails, the result is `Ralat` and the marker stays. Both stores then report
  no data, and `MainForm` also requires `Kredensial.Muktamad` before giving a
  credential to `IdMeLoginManager`. A `muktamad:*` marker only completes the
  record on the next run and never copies again. A leftover marker next to
  an existing record is cleaned up without importing. A `menyalin` marker (a
  copy that was never finalized) never allows a recopy. Valid Desktop data is
  finalized as it is. Missing or invalid Desktop data yields `PerluPemulihan`
  (fail-closed), because an interrupted copy cannot be told apart from a
  completed copy the owner has since deleted. Recovery: the owner saves
  settings or the credential in Desktop and restarts. For CORRUPT Desktop
  backend files (unparseable `tetapan.json`, undecryptable `rahsia.dat`, or an
  interrupted-save marker), normal Save refuses. The explicit "Pulihkan
  tetapan rosak" button (`PulihkanGantiRosak`) needs a full valid URL and a
  freshly entered secret. It backs up existing files to
  `sandaran-pemulihan-*` and verifies the backup bytes. It then writes the
  save marker, replaces both files atomically, reads them back, and only
  then removes the marker. It never reads the Companion and never touches
  the migration marker, so the current process builds no client; a restart
  finalizes the Desktop data.
- **Final pre-save gate.** The same config gate travels on
  `TugasanPenghantaran.PagarSebelumSimpan` into `PenghantaranMoeisFlow` and is
  re-checked immediately before the Save / Save & Confirm click. A refusal or
  exception gives `disekat-pagar`: no click, no portal write, and the claim is
  released.
- **Report failure recovery.** If all three `moeisJobSelesai` attempts fail
  after a MOEIS write, the pass reports `laporan-gagal`
  (`BilLaporanGagal`, a `LAPOR_GAGAL` log line) and retains the claim. On
  the next cycle the same owner can reclaim it, then the production flow
  reads MOEIS again before any write or report. No outcome is cached or
  replayed. A failed page/read check produces no success report and no Save;
  the claim is released for a later attempt.
  For every pre-existing absent student, category and reason must be readable
  and match the current task; a confirmed badge alone cannot justify
  `tidak-berubah`. If all rows match and the badge is confirmed, the fresh
  result is `tidak-berubah` without Save. A missing or mismatching value
  stops before Save and confirmation. A recreated task with the same ID also
  gets this fresh check. If MOEIS changed or a `tersimpan` write was never
  confirmed, another Save & Confirm is possible only after the normal
  conflict checks, form checks and post-save re-read. This avoids duplicate
  writes when the current portal state already matches.
- **No loopback at runtime.** Demand and the full list come only from
  `BackendKerjaHariIniSource` / `BackendKerjaPenuhSource`. With no valid config,
  `TiadaBackendSource` reports "no backend" and nothing is claimed or sent.
  The `Loopback*` classes remain for tests and `dev-fixture/verify` only.
- **Backend URL compatibility.** The shared validator used by Save, recovery,
  status/read and migration import accepts only a full deployed Web App URL:
  `https://script.google.com/macros/s/<id>/exec` with a non-empty safe ID,
  default HTTPS port, and no userinfo, query, fragment or extra path. The
  Companion default and migration fixtures use this form. The redirect form
  `script.googleusercontent.com/macros/echo` is not a base endpoint.
- **Embedded browser only.** `NewWindowRequested` is always handled (no pop-out),
  `LaunchingExternalUriScheme` is always cancelled, and the navigation guard is
  unchanged. The only process Desktop starts is `icacls.exe` (no shell).
- **Companion retirement** (`PersaraanAutostartCompanion`) happens only when
  the owner clicks a button in Tetapan Tempatan. It is allowed only when
  `DesktopBolehAmbilAlih` holds: an active backend client exists, the current
  config matches its fingerprint, and both migration units are final. It
  backs up the `HADIRMoeisCompanion` Run value ONCE to
  `enjin\companion-autostart-sandaran.json` and never overwrites that first
  backup. If a valid backup exists and the current value differs, or if the
  backup file is unreadable, nothing changes. It re-reads the Run value
  immediately before deleting, refuses if it changed, and confirms the value
  is gone before reporting success. The Registry has no atomic
  compare-and-delete, so a write by another process between the last read and
  `DeleteValue` can still be lost; this narrows that window but does not
  close it. "Pulihkan" refuses to overwrite a different existing
  value, and it deletes the backup only after the written value reads back
  identical. Any failure keeps the backup. It never stops the running
  companion process, deletes its install/data, or touches the `HadirDesktop`
  Run value. The companion's own `autostart-mati` / `autostart-hidup` commands
  are equivalent manual steps.

## Browser transport adapter (historical — superseded)

> Superseded: since 1.0.9 the desktop runs idMe login and MOEIS submission
> itself, and it no longer has any runtime loopback dependency (see above).

The desktop app's job, both now and in later phases, is to **drive** the
existing Node engine's business rules — never to reimplement them:

- Attendance logic, MOEIS write rules, and idMe auth all continue to live in
  `companion/`.
- The desktop app talks to the engine over the existing loopback HTTP API
  (`IEngineStatusSource` in this iteration is read-only; later phases would
  add a similarly explicit, narrow adapter for dispatch — not a rewrite).
  If/when the desktop app needs to trigger engine actions, that goes through
  a small, explicit adapter interface (mirroring `IEngineStatusSource`), not
  ad-hoc calls scattered through the UI layer.
- This keeps a single source of truth for attendance rules in one codebase
  (the Node companion), with the desktop app as a thin, replaceable shell.
