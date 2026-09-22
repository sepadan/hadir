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

- **Shared DPAPI credential** (`KredensialIdMeStore`) reads/writes the SAME
  `kredensial.dat` as the companion engine (DPAPI CurrentUser, null entropy) —
  verified read-only compatible with the companion's real blob, no re-typing.
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

## Browser transport adapter

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
