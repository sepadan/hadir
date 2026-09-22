# HADIR Desktop — Progress (iteration 2 / Phase 1 hardening)

## Desktop talks DIRECTLY to the HADIR backend: KLAIM → HANTAR → SELESAI (2026-09-23, default OFF)

First step towards retiring the Node engine: the desktop app can now own a task
end to end against Apps Script itself — no companion in the middle. Built,
unit-tested against fakes, and NOT wired into `MainForm` (a normal run still
produces zero backend traffic).

### `HadirDesktop/HadirBackendClient.cs` (new)

Faithful port of `companion/src/klien-hadir.mjs`:

- POST `{mode:'hadir', kaedah, argumen}` with `Content-Type:
  text/plain;charset=utf-8` and a BROWSER `User-Agent` (mandatory — without it
  Apps Script answers `/exec` with a 404 redirect whose body is not JSON);
  reply is `{ok:true,hasil}` / `{ok:false,ralat}`.
- `moeisJobSenarai(['', rahsia])`, `moeisJobKlaim([id, pemilik, mod, rahsia])`,
  `moeisJobLepas([id, pemilik, rahsia])`,
  `moeisJobSelesai([id, keputusan, mesej, bilHadirSelepas, pemilik, rahsia])`.
- Retry policy ported exactly: ONLY the read (`senarai`) is retried (3
  attempts). Claim / release / complete are NEVER retried blindly.
- `ModKlaim { Biasa, CubaSemula, Verifikasi }` preserves all THREE wire values
  (`false` / `true` / `"verifikasi"`) — the `!!` trap called out in the
  reference file cannot occur.
- Student records are REBUILT from an allowlist (`id/nama/kategori/sebab`), so
  an `ic` on the backend record has nowhere to land.
- `BackendKerjaPenuhSource` exposes the backend list through the existing
  `IKerjaPenuhSource` seam; a failed read is `TidakPasti`, never an empty list.
- The engine secret only ever lives in the request body: never logged, never in
  an exception message, never in a URL.

### `HadirDesktop/RahsiaEnjinStore.cs` (new)

Reads the companion's OWN stored config so the desktop can take its place:

- `rahsia.dat` — DPAPI CurrentUser, NULL entropy (the SAME pattern already
  proven compatible by `KredensialIdMeStore`); only `rahsiaEnjin` is taken out
  of the decrypted `{rahsiaEnjin, klien:[...]}` blob.
- `tetapan.json` — `apiUrl`, validated by a faithful port of `sahkanApiUrl`
  (HTTPS, no userinfo, host must be `script.google.com` /
  `script.googleusercontent.com`) so a tampered settings file can never
  redirect the engine secret to another host.
- FAIL CLOSED everywhere: missing/corrupt file, empty secret, or invalid
  `apiUrl` → `null` → no submission. `Status()` returns BOOLEANS only.
- `PemilikTugasanStore` gives the claim owner id, STABLE across restarts
  (enrollment device id, else a persisted random local id). The backend lets
  the SAME owner re-claim its own `sedang_dihantar` task immediately while a
  different owner waits out a 15-minute lease, so a per-run id would strand
  this PC's own interrupted task.

### `HadirDesktop/AliranPenghantaranMoeis.cs` — the cycle

When an `IHadirBackendClient` + owner id are supplied (both optional; absent =
the previous pure-submission behaviour, unchanged):

1. CLAIM FIRST, always. A refused claim (`null`) means another engine holds the
   task: SKIPPED, never submitted. There is no path that submits unclaimed.
2. Build from the CLAIMED payload (re-read by the backend under its ScriptLock),
   not from the earlier list snapshot.
3. Submit. Only a CONFIRMED result (`Berjaya`, i.e. the post-save re-read proved
   every student) is reported `berjaya`.
4. `tersimpan` is reported as `tersimpan` and NOT released — releasing would
   queue an automatic re-submission of a write that may already be on MOEIS
   (same rule as `giliran.mjs`).
5. Any other failure releases the lease; a claimed task that cannot be built
   honestly is released too (never a stranded `sedang_dihantar`).
6. `selesai` is retried up to 3 times (idempotent status update — the reason
   giliran.mjs does it, after the real 18 Sep 2026 bug where a confirmed MOEIS
   write was recorded as failed only because Apps Script answered the report
   with a 404 HTML page). The MOEIS write itself is never repeated.
7. No stable owner id → `tiada-pemilik`: no claim, no submission.
8. `bilHadirSelepas` is sent as `''`, not `0`: this adapter proves each student
   individually but never reads MOEIS's own present-count, and an invented
   number is worse than none.

### Tests

```
dotnet build desktop/HadirDesktop.sln              # Build succeeded, 0 Error(s)
dotnet test  desktop/HadirDesktop.sln --no-restore # Passed! 376 / Failed: 0
```

376 passed / 0 failed (was 313; **+63**):

- `HadirBackendClientTests` (24) — real HTTP against an in-process
  `HttpListener` fake: wire shape/headers/UA, argument order per RPC,
  `'verifikasi'` stays a string, `senarai` retried 3×, claim/release/complete
  attempted EXACTLY once, `hasil:null` = refused claim (not an error), non-JSON
  body → `Balasan bukan JSON (status 404)` without echoing the body, `ic`
  dropped, secret never in path/query.
- `RahsiaEnjinStoreTests` (22) — DPAPI round-trip in an isolated temp dir,
  corrupt blob / missing file / empty secret / corrupt settings → `null`,
  `apiUrl` host allowlist, status never exposes a value, owner id stable across
  a simulated restart.
- `KitaranPenghantaranTests` (17) — ordered trace `senarai → klaim → hantar →
  selesai`; `selesai` only after a confirmed submission; failure → `lepas`;
  adapter throw → `lepas`; `tersimpan` → report without release; refused or
  throwing claim → zero submissions; empty list → zero claims; finished /
  not-today tasks → zero claims; report failure retried 3× without release;
  default OFF → backend never touched.

### Verified vs unverified

- VERIFIED: build + 376 tests, all against fakes. No real backend/Apps Script
  call, no real claim, no real submission, no real engine secret used.
- UNVERIFIED (live): the client has never spoken to the real HADIR deployment
  from this app; the DPAPI read of the real `rahsia.dat` was NOT exercised here
  (only synthetic blobs written by the test itself, in a temp dir).
- NOT DONE (deliberately out of this slice's scope): `MainForm` still builds
  `AliranPenghantaranMoeis` with the loopback `LoopbackKerjaPenuhSource` and NO
  backend client, so the app performs zero backend traffic. Wiring the store +
  client into `MainForm` is the next step.

## Demand seam wired to the engine + portal lifecycle states (2026-09-22, default OFF)

The placeholder demand seam is gone: the app now KNOWS whether HADIR has an
unfinished MOEIS task TODAY, and the embedded WebView2 is pointed at the portal
ONLY when that answer is provably yes. Same slice also exposes the portal state
in the tray and gives the rejection guard a visible "Cuba lagi".

### Demand probe (read-only)

- `HadirDesktop/KerjaHariIni.cs` (new) — `PermintaanKerja(AdaKerja,
  EnjinBolehDicapai, Sebab, BilanganKerja)` + `IKerjaHariIniSource` +
  `LoopbackKerjaHariIniSource`. Uses the SAME authenticated loopback path as
  `LoopbackEngineStatusSource`: `GET {base}/` and the nonce is taken from the
  302 `Location` through the SAME redirect allowlist
  (`TryGetNonceFromRedirect`; nonce never logged, never in a returned string),
  then `GET /api/kerja` with header `X-HADIR-Lokal: <nonce>` and **no Origin**
  — `/api/kerja` is not one of the companion's `/api/lokal/*` routes, so the
  loopback UI Origin is not an allowed Origin for it; the nonce header alone
  authorises it (companion/src/server.mjs). GET only — never mutates, never
  reads/writes the engine secret, never pairs.
- Counting rule: an entry counts only when its `status` is exactly one of
  `menunggu` / `sedang_dihantar` / `tersimpan` AND its `tarikhIso` (first 10
  chars, ordinal) equals the PC's local `yyyy-MM-dd` today.
- Honest failure taxonomy — three distinct answers, never a guess:
  * `AdaKerja=true` — at least one today job is unfinished;
  * `AdaKerja=false, EnjinBolehDicapai=true` — engine answered, nothing to send;
  * `EnjinBolehDicapai=false` — demand NOT established (engine not running,
  401/403 on handshake or list, non-201/4xx, unreadable body, timeout). This
  can never be read as "ada kerja" and never as a harmless "no work".
- The date comparison uses the PC's own date. A clock/timezone mismatch degrades
  to "no demand" (no portal activity) — documented, fail-safe direction only.

### Portal lifecycle (`HadirDesktop/PortalLifecycle.cs`, new)

`KeadaanPortal { Diam, AdaKerja, SedangLogin, PerluTindakanManusia,
EnjinLuarTalian }` decided by ONE ordered gate per cycle, single-flight:

1. owner opt-in (`LoginAuto`, default OFF) — off = `diam`, engine not even asked;
2. demand probe — unreachable/unreadable = `enjin-luar-talian`, zero portal
   activity; no unfinished task today = `diam`, zero portal activity (no
   navigation, no session probe, no login);
3. tripped rejection guard = `perlu-tindakan-manusia` BEFORE the portal is
   touched (nothing to gain by opening it);
4. only then: open the portal (`AdaKerja`) → `SedangLogin` → login manager
   (which owns the session pre-flight, the indefinite backoff retry, and the
   credential-rejection guard) → success = `AdaKerja` (work still waiting),
   `PerluManusia` = `perlu-tindakan-manusia`, transient = `AdaKerja` (retrying).

`LabelKeadaanPortal` maps the five states to text for the tray row, the tray
tooltip (truncated to the WinForms 63-char `NotifyIcon.Text` limit so a long
status line can never throw) and the status strip.

### Wiring

- `HadirDesktop/MainForm.cs` — `AdaKerjaMenungguAsync()` (the ONE demand seam,
  previously hardcoded `false`) now awaits the real loopback probe and returns
  true only for `EnjinBolehDicapai && AdaKerja`; the tray's "Log masuk idMe
  (atas permintaan)" runs ONE lifecycle cycle; `OpenPortalDemandAsync` navigates
  the embedded WebView2 to the MOEIS attendance URL only from the lifecycle and
  only when the navigation allowlist already permits it; the status strip shows
  the portal state; `CubaLagiPortalAsync` clears the guard and re-runs one
  cycle; the new `HttpClient` is disposed in `FormClosing`.
- `HadirDesktop/TrayHost.cs` — a disabled status row (`Keadaan portal: …`) plus
  a "Cuba lagi (kosongkan penolakan)" menu item; `SetPortalKeadaan` updates the
  row and the tooltip on state changes only (no polling, no timer anywhere).
- `HadirDesktop/IdMeLoginFlow.cs` — added
  `IdMeLoginDemand.CubaAutoDenganPermintaanAsync(bool adaKerja, ct)` so the
  already-probed demand is reused instead of probing the engine twice (the
  opt-in switch is still applied inside it).
- `HadirDesktop/EngineEndpoints.cs` — `KerjaPath = "/api/kerja"`.

### Bug found and fixed while testing (both single-flight owners)

A cycle whose awaits ALL complete synchronously finished inside the call itself,
so the `finally` that clears `_dalamPenerbangan` ran BEFORE the entry point had
stored the task — leaving a stale completed task that silently turned every
LATER cycle/attempt into a no-op. Fixed with `await Task.Yield()` before any
work in `PortalLifecycle.TerasAsync` and `IdMeLoginManager.TerasAsync`.
Regression test: `IdMeLoginManagerTests.DuaCubaanBerturutan_…`.

### Tests

`dotnet build desktop/HadirDesktop.sln` → **Build succeeded, 0 Warning(s),
0 Error(s)**. `dotnet test desktop/HadirDesktop.sln --no-restore` →
**249 passed / 0 failed** (was 189; +60). New: `PortalLifecycleTests` (23) —
empty queue = zero portal/login/session activity, one waiting task = exactly one
login attempt (and a session-valid pre-flight that submits nothing), engine
offline = `enjin-luar-talian` with zero activity, tripped guard = stop until
`Cuba lagi` (and 0 = never stop), single-flight, state labels/tooltip limits;
`KerjaHariIniSourceTests` (36) — pure counting rules (status + today only,
unexpected body = `null`, never zero) and real HTTP integration against an
in-process companion stand-in (paths called, nonce in the HEADER, NO Origin,
401/403, unreadable body, no engine, handshake failure, cancellation, nonce
never leaked, HTTP 500/`ok:false`/timeout → never "ada kerja").

### Review pass (MiMo, 2026-09-22) — fixes folded into this slice

Independent review of the same diff; findings fixed in-place and the counts
above reflect them:
- SEDARGAH — a silent `catch` on the demand-probe path could swallow a real
  failure; changed to a throwing path covered by a test.
- BLUEPRINT.md previously claimed a stale count (237); corrected to 249 with
  per-class counts re-measured via `dotnet test --list-tests`.
- RENDAH (cosmetic, reported only) — tray label `&` mnemonic; `FormClosing`
  hiding to tray keeps the cycle alive (intended design).
- Open owner decisions: navigation-allowlist strictness vs real-portal mode,
  and confirming that an unverifiable post-submit counts as "transient" (retry
  without a ceiling). Neither is a bug; both are owner policy.

### Verified vs unverified

- VERIFIED: build + 249 tests, all fakes; no engine, no idMe/MOEIS, no
  credential value, no pairing, no engine secret anywhere in this slice.
- UNVERIFIED (live): `GET /api/kerja` has never been exercised against the real
  companion engine from this app (the path/Origin rule is taken from
  server.mjs, and the parent confirmed the auth shape), and the portal-opening /
  login path has never been run end to end — `LoginAuto` stays OFF by default,
  so a normal run performs zero portal activity.

### Live test caught a real bug — demand seam auth was wrong (2026-09-22)

A live read-only probe against the REAL engine showed `/api/kerja` returns
**401 "Token tidak sah"** without a Bearer token — that route sits behind the
companion's Bearer-admin gate, not the nonce gate. The demand seam as first
committed would therefore never see work. Fixed: the companion now serves a
nonce-only read-only route `/api/lokal/kerja-hari-ini` (returns the same
`kerjaSenaraiDisensor` list, no engine secret), and the desktop source calls
it. Live-verified: `GET /api/lokal/kerja-hari-ini` → 200 with a sanitized
20-item list. Companion +4 tests (`kerja-hari-ini-lokal.test.mjs`).

## Shared idMe credential + demand-only auto-login in embedded WebView2 (2026-09-22, default OFF)

Owner goal: fully automatic — app stores the idMe password locally (DPAPI),
logs in automatically ONLY when there is unfinished attendance to submit, keeps
the portal in the tray with no separate Edge popup, zero portal/login activity
when the queue is empty.

### What was built (all default OFF, fixture-tested, no production writes)

- `HadirDesktop/KredensialIdMeStore.cs` — reads/writes the SAME `kredensial.dat`
  as the companion engine (DPAPI CurrentUser, null entropy, JSON
  `{pengguna,kataLaluan,kunciKeselamatan}`). No plaintext fallback.
- `HadirDesktop/IdMeLoginSafety.cs` — pure safety gates (HTTPS+exact-host check,
  phrase decision, session classification, narrow credential-rejection regex,
  OTP/CAPTCHA evidence set).
- `HadirDesktop/IdMeLoginFlow.cs` — pure staged flow (port of
  `jalankanLoginAutoTeras`) + `IdMeLoginManager` (single-flight, indefinite
  exponential-backoff retry for transient, the ONE rejection guard) +
  `IdMeLoginDemand` (demand-only trigger: waiting-HADIR-task is the only signal).
- `HadirDesktop/PenjagaPenolakanKredensial.cs` — consecutive CREDENTIAL-rejection
  guard (default 5, 0 = never stop, one-click "Cuba lagi"), app-owned JSON state.
- `HadirDesktop/IdMeLoginWebView2.cs` — production DOM bridge over
  `CoreWebView2.ExecuteScriptAsync` (types IC/password only after every gate;
  OTP/CAPTCHA fail-safe returns sanitized URL+element diagnostic). NOT live-verified.
- `HadirDesktop/IdMeSettingsDialog.cs` — "Akaun idMe" settings (masked entry,
  "Simpan pada PC ini", "Padam kredensial", status shows only masked user;
  rejection-guard N + "Cuba lagi").
- `HadirDesktop/IdMeLoginSettings.cs` — non-secret opt-in switches (LoginAuto OFF,
  BenarkanTerusTanpaFrasa OFF, MaksPenolakanBerturut = 5).
- `HadirDesktop/MainForm.cs` / `TrayHost.cs` / `DemoLabel.cs` — tray "Akaun idMe…"
  + "Cuba log masuk" wiring; navigation allowlist widens to idMe/MOEIS origins
  ONLY when the owner enables auto-login. No timer, no keepalive loop.

### Owner policy (final, supersedes the earlier 6/hour + 24/day ceiling)

- NO hourly/daily ceiling. Pre-flight/session checks never consume budget; only
  an actual credential submission counts.
- Only an EXPLICIT "wrong password / wrong IC" rejection advances the guard;
  everything else (network/timeout/host/page-not-ready/busy/ambiguous/session/
  server) retries INDEFINITELY with exponential backoff.
- Guard is owner-configurable (0 = never stop, default 5) + one-click "Cuba lagi".
- OTP/CAPTCHA still stops for the owner; security-phrase/checkbox is a normal step.

### DPAPI compatibility (verified WITHOUT printing the value)

A throwaway .NET 8 probe (`%LOCALAPPDATA%/Temp/hadir-dpapi-probe`, not in repo)
read the real companion blob via `ProtectedData.Unprotect(bytes, null,
CurrentUser)`: `boleh-nyahsulit=True`, `json-sah=True`, all 3 fields present,
masked user `8***`, `keputusan=SERASI`. The blob formats ARE compatible — the
owner does NOT need to re-type the password; the shared store works as-is.

### Tests

`dotnet test` (desktop): **189 passed / 0 failed** (was 99). New suites:
`KredensialIdMeStoreTests`, `IdMeLoginSafetyTests`, `PenjagaPenolakanKredensialTests`,
`IdMeLoginManagerTests` (pre-flight no-budget, transient backoff retry, rejection
guard at 5, "Cuba lagi"), `IdMeLoginFlowTests` (staged flow vs scripted fake DOM:
wrong-host no typing, phrase-mismatch abort, checkbox-fail no password,
OTP stop, success), `IdMeLoginDemandTests` (zero activity when queue empty).

### Not done (out of scope for this phase, parent gate pending)

- Real live idMe/MOEIS login (hard boundary: no production writes).
- Portal lifecycle (tray hide/close on idle) and auto-send — later phases.
- Waiting-task detection is a seam (`AdaKerjaMenungguAsync()` returns false until
  the auto-send phase wires the real HADIR-record watcher).
  *SUPERSEDED (later the same day)*: the seam is now wired to the real engine
  (`LoopbackKerjaHariIniSource`, `GET /api/kerja`) and the portal lifecycle owns
  the "open the portal only when there is work" decision — see the section at
  the top of this file.
- No commit yet — awaiting the parent gate.


## Real idMe login inside embedded WebView2 — LIVE observation (2026-09-22)

Decisive gate for replacing the Edge popup with an embedded portal: does the
REAL idMe login page render and drive inside the embedded WebView2? Proven LIVE
on this machine (read-only: navigation + DOM observation only, no credentials,
no submit), behind an explicit default-OFF dev flag.

### Code (default OFF, fixture default preserved)

- `HadirDesktop/RealPortalDevMode.cs` (new) — explicit dev mode gated by
  `HADIR_DEV_REAL_PORTAL=1` (truthy only). When OFF: `AllowedOrigins` is empty,
  so the NavigationGuard keeps the fixture/loopback-only allowlist exactly as
  before. When ON: allowlist widens to the single origin
  `https://idme.moe.gov.my` and the app navigates to the real `/login` page
  instead of the fixture.
- `HadirDesktop/RealPortalObservation.cs` (new) — pure URL sanitizer for the
  dev-only observation log: keeps `scheme://authority/path`, strips query and
  fragment, and collapses any non-http(s) scheme (`data:`, `javascript:`,
  `about:`) to its scheme name so embedded payloads never leak.
- `HadirDesktop/DevDebugTransport.cs` — `FromEnvironment` now also enables the
  SAME ephemeral loopback CDP transport (random port, isolated
  `webview2-dev-<port>` profile, port file) when `HADIR_DEV_REAL_PORTAL=1` is
  set, so the production Playwright adapter can attach in that mode. Normal
  mode (neither flag) still returns null — verified.
- `HadirDesktop/MainForm.cs` — real-portal mode navigates to
  `https://idme.moe.gov.my/login`; banner/title gain a REAL-PORTAL suffix; a
  sanitized observation log (`%LOCALAPPDATA%\HadirDesktop\real-portal-observations.log`)
  records every `navigation-starting` and `new-window-requested` decision.
  `NewWindowRequested` still always blocks OS popups (`e.Handled = true`).

### LIVE result (this machine, 2026-09-22, .NET SDK 8.0.407, Node 24.19.0)

Ran `HADIR_DEV_REAL_PORTAL=1` exe + `node observe-real-portal.mjs` (9/9 checks):

- **Page renders.** WebView2 reached `https://idme.moe.gov.my/login`, title
  `Sistem Pengurusan IDentiti (idMe)`, body shows the normal login UI
  (`Daftar Masuk`, `Daftar Baru`, `Lupa Kata Laluan`, announcement banner).
  Screenshot: `%LOCALAPPDATA%\HadirDesktop\real-portal-evidence\real-portal-*.png`.
- **Normal login form (two-step).** Initial `/login` page carries ONLY the IC
  field (`name="ic"`, placeholder `Nombor Kad Pengenalan / Passport`) plus a
  hidden CSRF `_token` (value never read). No password field yet — correct:
  idMe shows the password + security phrase only on `/loginverification` after
  the IC is submitted (which this harness never does). No CAPTCHA/OTP detected
  on the initial page.
- **No popups / SSO windows / external browser.** Zero `new-window-requested`
  events during load; NavigationGuard blocked nothing on the idMe flow. The
  observation log recorded only `navigation-starting allowed=True
  https://idme.moe.gov.my/login`.
- **Playwright `connectOverCDP` attaches and reads the DOM.** Title, URL,
  IC-field presence, "Daftar Masuk" presence, body text — all read back
  concretely over the ephemeral loopback CDP endpoint.
- **Fingerprint.** UA is plain desktop Edge `Edg/153.0.0.0` (no
  `WebView2`/`EdgA` marker), so no embedded-webview signal in the UA string.
  CDP bound loopback-only (0 processes with `--remote-debugging-address`).
- **Normal mode unaffected.** `verify-normal-mode.mjs` on a normal launch: 3/3
  pass — fixture default, 0 CDP, port file absent.

### Still UNPROVEN (must NOT be assumed)

- The full login + SSO redirect chain past the first `/login` page: nothing was
  submitted, so the `/loginverification` password/security-phrase step, any SSO
  redirect to other hosts, and any anti-bot/CAPTCHA challenge triggered ON
  SUBMIT were not observed. A real credential login inside the app requires a
  human — out of scope here by design.
- Cookie/session persistence tied to the isolated `webview2-dev-<port>` profile
  (never used a real credential, so nothing persisted).

### Tests

- `HadirDesktop.Tests/RealPortalDevModeTests.cs` (new) — flag gating, origin
  allowlist, default-OFF behavior.
- `HadirDesktop.Tests/RealPortalObservationTests.cs` (new) — URL sanitizer
  (query/fragment strip, non-http collapse, placeholders).
- `HadirDesktop.Tests/DevDebugTransportGatingTests.cs` (new) — no flags ⇒ null
  transport (no CDP).
- `dev-fixture/playwright/observe-real-portal.test.mjs` (new) — 6 pure tests.

```
dotnet build desktop/HadirDesktop.sln   # 0 warnings, 0 errors
dotnet test  desktop/HadirDesktop.sln   # Passed! 123 (was 99, +24)
node --test dev-fixture/playwright/observe-real-portal.test.mjs   # 6/6
```

## Genuine WebView2/CDP feasibility gate correction (2026-09-22)

The previous "Playwright↔WebView2 feasibility proven" entry below rested on a
vacuous checker: two of its assertions were a tautology (`x || true`) and a
regex over a hardcoded string, and it only read a marker DOM node/page title —
never the production MOEIS adapter. This iteration replaced the checker and
closed a real gap in the dev message bridge. See
`docs/PLAYWRIGHT-CDP-REPORT.md` ("What was fixed") for the full writeup.

Changes:

- `HadirDesktop/DevFixtureOrigin.cs` (new) — pure origin predicate; wired into
  `MainForm.CoreWebView2_WebMessageReceived` so the dev bridge only honours
  messages from the exact dev-fixture origin, never the real settings UI or a
  future SSO page. Unit-tested: `HadirDesktop.Tests/DevFixtureOriginTests.cs`
  (12 cases).
- `HadirDesktop/FixturePortalServer.cs` — dev fixture now serves 3 distinct
  MOEIS-like class-picker scenarios (`/dev/kelas/1..3`, plus `/dev` defaulting
  to scenario 1), mirroring `companion/tests/adaptor-playwright.test.mjs` /
  `pekerja-batch-adaptor-sebenar.test.mjs` fixture shape exactly, so the
  production adapter can be exercised against a served page.
- `dev-fixture/playwright/drive-fixture.mjs` — full rewrite: genuine
  owned-process/cmdline fingerprint (`semakFingerprintWebView2`, via
  `netstat`+`tasklist`+`Get-CimInstance`), real loopback-bind verification
  (`semakAlamatLoopback`, via `netstat -ano -p TCP`), exact dev-fixture origin
  matching (`adalahAsalFixtureDev`) with a negative test against the normal
  fixture origin, and driving the production
  `companion/src/moeis/adaptorPlaywright.mjs` (`pilihKelas`,
  `bacaRingkasanKelas`) against all 3 scenarios sequentially while the host
  window stays minimized, asserting the 3 reads are mutually distinct.
- `dev-fixture/playwright/drive-fixture.test.mjs` (new) — 19 pure-function
  unit tests for the 4 exported helpers above.
- `dev-fixture/playwright/verify-normal-mode.mjs` (new) — external proof that
  a normal-mode launch (no `HADIR_DEV_DEBUG`) never carries
  `--remote-debugging-port` on any `msedgewebview2.exe`, and that
  `devtools-port.txt` is absent or predates the launch.

### Results (this machine, 2026-09-22, .NET SDK 8.0.407, Node 24.19.0)

```
dotnet build   # 0 warnings, 0 errors
dotnet test    # Passed! Failed: 0, Passed: 47, Skipped: 0, Total: 47
```

`node drive-fixture.test.mjs` (pure unit tests, no app running):

```
ℹ tests 19
ℹ pass 19
ℹ fail 0
```

`HADIR_SHUTDOWN=1 node drive-fixture.mjs` (dev-debug exe running,
`HADIR_DEV_DEBUG=1`):

```
PASS  CDP endpoint reachable and reports a Browser string  -> browser=Edg/153.0.4234.48 product=undefined
PASS  Listener socket verified bound to loopback (netstat)  -> alamat=127.0.0.1
PASS  Owning PID for CDP port resolved via netstat  -> pid=27440
PASS  Owning process fingerprints as our isolated msedgewebview2.exe (image + dev profile + port in cmdline)  -> imej=msedgewebview2.exe devProfilePresent=true portInCmdline=true
PASS  WebView2 exposes at least one page over CDP  -> 1 page(s)
PASS  Located a page whose origin is the exact dev fixture (/dev)  -> http://127.0.0.1:50602/dev
PASS  Dev fixture landed on default scenario (kelas-1)  -> kelas-1
PASS  Fixture marker reads DEV-FIXTURE-OK  -> DEV-FIXTURE-OK
PASS  Host confirmed minimized (host-state echoed back)  -> host-state:Minimized
PASS  Navigated to /dev/kelas/1  -> http://127.0.0.1:50602/dev/kelas/1
PASS  Scenario marker matches /dev/kelas/1  -> kelas-1
PASS  pilihKelas('PRASEKOLAH') selects 'PRASEKOLAH BIJAK'  -> {"ok":true,"mentah":"PRASEKOLAH BIJAK","cara":"awalan","padan":"PRASEKOLAH BIJAK"}
PASS  bacaRingkasanKelas('PRASEKOLAH', 'PRASEKOLAH') reads 19/19  -> {"hadir":19,"jumlah":19,"status":"BELUM DIHANTAR","kelasPadan":"PRASEKOLAH BIJAK"}
PASS  Navigated to /dev/kelas/2  -> http://127.0.0.1:50602/dev/kelas/2
PASS  Scenario marker matches /dev/kelas/2  -> kelas-2
PASS  pilihKelas('TAHUN EMPAT') selects 'TAHUN EMPAT CERGAS'  -> {"ok":true,"mentah":"TAHUN EMPAT CERGAS","cara":"awalan","padan":"TAHUN EMPAT CERGAS"}
PASS  bacaRingkasanKelas('TAHUN EMPAT', 'TAHUN EMPAT') reads 25/28  -> {"hadir":25,"jumlah":28,"status":"BELUM DIHANTAR","kelasPadan":"TAHUN EMPAT CERGAS"}
PASS  Navigated to /dev/kelas/3  -> http://127.0.0.1:50602/dev/kelas/3
PASS  Scenario marker matches /dev/kelas/3  -> kelas-3
PASS  pilihKelas('TAHUN LIMA') selects 'TAHUN LIMA GEMILANG'  -> {"ok":true,"mentah":"TAHUN LIMA GEMILANG","cara":"awalan","padan":"TAHUN LIMA GEMILANG"}
PASS  bacaRingkasanKelas('TAHUN LIMA', 'TAHUN LIMA') reads 12/15  -> {"hadir":12,"jumlah":15,"status":"BELUM DIHANTAR","kelasPadan":"TAHUN LIMA GEMILANG"}
PASS  Each of the 3 scenario reads is DISTINCT (no state inheritance)  -> PRASEKOLAH BIJAK | TAHUN EMPAT CERGAS | TAHUN LIMA GEMILANG
PASS  Negative test: normal fixture origin (/) is REJECTED as a dev-fixture target  -> http://127.0.0.1:50602/
PASS  Returned to the dev fixture after the negative test  -> http://127.0.0.1:50602/dev
PASS  Self-test: wildcard/public binds are rejected by semakAlamatLoopback  -> 0.0.0.0:50601, 192.168.1.5:50601, [::]:50601
PASS  Self-test: loopback binds are accepted by semakAlamatLoopback  -> 127.0.0.1:50601, [::1]:50601
PASS  Host restored to Normal  -> host-state:Normal

--- summary ---
27/27 checks passed
Shutdown requested (dev-only).
PASS  No HadirDesktop.exe process remains after shutdown
PASS  No orphan msedgewebview2.exe with our dev profile remains

--- summary ---
29/29 checks passed
```

`node verify-normal-mode.mjs` (separate launch, no `HADIR_DEV_DEBUG`):

```
HADIR normal-mode CDP absence verification
PASS  HADIR_DEV_DEBUG is not set in this environment
PASS  No msedgewebview2.exe under the normal profile has --remote-debugging-port  -> normalProfileProcesses=6 withCdp=0
PASS  devtools-port.txt is absent or predates this normal-mode launch  -> mtime=2026-09-22T07:04:59.010Z ageMs=49945

--- summary ---
3/3 checks passed
```

Post-run scoped process check (PowerShell, filtered to processes whose
command line references `HadirDesktop`): 0 matching `msedgewebview2.exe`
processes remained after the normal-mode session was killed — the many other
`msedgewebview2.exe` processes observed on this machine belong to the user's
own unrelated browser/Edge usage and were left untouched.

### Limitations on this machine

- The intermediate FAIL observed while iterating (an earlier fixture markup
  bug — a duplicate `id="dev-senario"` element where a `<meta>` shadowed the
  intended `<span>`, so `textContent` read the empty meta) was caught and
  fixed by this same drive run before the final green pass above — left in as
  evidence the harness is not vacuous (it actually failed on a real bug).
- WebView2 idMe SSO remains genuinely unverified — this correction only
  strengthens the dev-fixture gate; it does not touch or attempt real
  idMe/MOEIS navigation (hard constraint).

## Implemented this iteration (2026-09-22)

- **Authenticated read-only status integration.** `LoopbackEngineStatusSource`
  now performs the real nonce handshake (`GET /` → `302 /?n=<nonce>`), reads the
  nonce from the `Location` header without following or logging it, validates
  the redirect stays on the **same loopback origin** (scheme+host+port), then
  calls `GET /api/lokal/status` with `X-HADIR-Lokal: <nonce>` + exact loopback
  `Origin`. Outcomes are classified distinctly: `Ok / Offline / Unauthorized /
  Timeout / Malformed` (never collapsed to one "not running").
- **Accurate model parsing.** `EngineStatusModel` parses the real nested shape —
  `rahsiaEnjinAda`/`adaRahsiaEnjin`, `giliran.aktif/modMula/sedangProses`,
  `autoMula.bermula`, `kalendar.bilangan/amaran`, `moeis.sesiAda`, `pasangan`
  count — tolerantly (missing fields default, malformed JSON → `Malformed`).
- **Settings opens the REAL engine settings.** The "Tetapan Tempatan" tray item
  now navigates the embedded WebView2 to the engine's protected loopback
  settings UI (`http://127.0.0.1:8747/`, nonce-gated by the companion) — no more
  unrelated fake dialog. Read-only from our side: we navigate, never write
  settings, never restart, never control the engine. A "Portal Fixture" button
  returns to the demo fixture; a status-strip dropdown switches the source
  (simulasi vs enjin sebenar).
- **Dev/test debug transport (opt-in).** `DevDebugTransport` enables
  `--remote-debugging-port` on a random loopback port + an isolated ephemeral
  `webview2-dev-<port>` profile **only** when `HADIR_DEV_DEBUG=1`. Normal mode
  never passes it (verified). See `docs/PLAYWRIGHT-CDP-REPORT.md`.
- **Playwright↔WebView2 feasibility proven.** Node Playwright
  `connectOverCDP` drove the embedded WebView2 dev fixture while the host window
  was minimized; graceful exit left no orphan `msedgewebview2.exe` processes.
  9/9 drive checks passed. WebView2 idMe SSO remains **UNVERIFIED**.

## Build / test commands and results (run from `desktop/`)

```
dotnet build   # 0 warnings, 0 errors
dotnet test    # 35 passed, 0 failed
```

Both run against .NET SDK 8.0.407 on Windows (2026-09-22).

## Live read-only status smoke (real engine, via the new adapter)

`dev-fixture/verify` console harness (references the built DLL, read-only):

```
dotnet run -c Debug   # prints booleans/counts only — never nonce/PII
```

Observed against the running companion (`127.0.0.1:8747`):
`kind=Ok ok=True versi=1.0.0 pc=Flex5 adaRahsiaEnjin=True giliranAktif=True
modMula=auto sedangProses=True autoMulaBermula=True kalendarBilangan=53
kalendarAmaran=False moeisSesiAda=True`. No PII, no secrets.

## Iteration 1 — DEMO desktop app (DONE)

---

## Implemented (iteration 1)

- `HadirDesktop.sln` with `HadirDesktop` (WinForms, `net8.0-windows`) and
  `HadirDesktop.Tests` (xUnit, `net8.0-windows`) projects.
- `Program.cs` — single-instance via named `Mutex`
  (`Global\HadirDesktop.SingleInstance`), second launch signals the first
  instance via a named `EventWaitHandle` and exits without opening a window.
- `SingleInstance.cs` — mutex + signal wrapper, disposable.
- `AppStateMachine.cs` — pure `Running` / `HiddenToTray` / `Exiting` state
  machine, no UI dependencies.
- `TrayHost.cs` — `NotifyIcon` + context menu (Tunjuk / Tetapan Tempatan /
  Keluar), one-time "still running" balloon tip.
- `MainForm.cs` — WinForms host: DEMO banner, embedded `WebView2` (dedicated
  user-data folder under `%LOCALAPPDATA%\HadirDesktop\webview2-demo`),
  status strip (app state, engine status + source label, manual refresh
  button, nav-blocked notice), close-to-tray wiring, minimal local settings
  dialog to switch the engine status source (fixture vs loopback).
- `EngineStatusModel.cs` — immutable record, tolerant `System.Text.Json`
  parsing of a representative `/api/status` shape; never throws on
  missing/malformed input.
- `IEngineStatusSource.cs` / `FixtureEngineStatusSource.cs` /
  `LoopbackEngineStatusSource.cs` — simulated default + best-effort,
  read-only, short-timeout loopback GET with no polling.
- `NavigationGuard.cs` — pure allowlist: any `127.0.0.1` / `localhost` /
  `::1` origin plus an explicit configured origin list; blocks everything
  else (external domains, `about:`/non-http(s) schemes, non-loopback IPs,
  `null`).
- `FixturePortalServer.cs` — `HttpListener` bound to `127.0.0.1` on an
  ephemeral port, serves one static "Portal Palsu (Fixture)" HTML page,
  disposed on app exit.
- `DemoLabel.cs` — single source of truth for all DEMO-mode labels (window
  title, banner, tray strings, source labels, fixture portal title).
- `docs/ARCHITECTURE.md`, `docs/PLAN.md` — multi-device design and phased plan.
- Test suite: `SingleInstanceTests`, `AppStateMachineTests`,
  `NavigationGuardTests`, `EngineStatusModelTests`,
  `FixtureEngineStatusSourceTests` — 21 tests total.

## Build / test commands and results (run from `desktop/`)

```
dotnet build
```
→ Build succeeded. 0 Warning(s), 0 Error(s).
Output: `desktop/HadirDesktop/bin/Debug/net8.0-windows/HadirDesktop.exe`

```
dotnet test
```
→ Passed! Failed: 0, Passed: 21, Skipped: 0, Total: 21.

Both commands were run against a clean checkout of `desktop/` on
2026-09-22, .NET SDK 8.0.407, on Windows.

## Runtime verification (performed 2026-09-22, after Claude delegation)

The exe was actually launched and exercised on a live desktop session (not just
`dotnet build`/`dotnet test`). Evidence captured:

- **Launch**: `HadirDesktop.exe` starts and stays resident (PID observed,
  ~56 MB — WebView2 process tree initialized, not a blank/stub).
- **Window title**: `HADIR Desktop — MOD DEMO` (visible in the title bar).
- **Embedded WebView2 renders the fixture portal**: accessibility-tree capture
  of the live window shows a `Document` node titled
  `Portal Palsu (Fixture) — bukan idMe/MOEIS sebenar`, with body text
  `AMARAN: bukan idMe/MOEIS sebenar — data rekaan untuk demo sahaja` and
  `Kehadiran simulasi: 0 rekod dihantar. Ini bukan sistem pengeluaran.` — the
  fixture page is genuinely rendered inside the WebView2 control, not blank.
- **Single instance**: a second `HadirDesktop.exe` launch exited immediately
  (exit code 0); `tasklist` shows exactly 1 `HadirDesktop.exe` process.
- **Close-X → tray**: clicking the window Close button kept the process alive
  (still resident afterward) — hide-to-tray semantics confirmed; real Exit is
  only via the tray menu (source-verified in `MainForm.MainForm_FormClosing`).
- **Navigation allowlist / DEMO isolation**: the DEMO build never loads the
  real idMe/MOEIS origin; only loopback + explicit fixture origin are allowed.

Screenshot (for the record, viewable by the parent if desired):
`C:\Users\seman\AppData\Local\hermes\cache\images\computer_use_5b3e0657d76c44d4a9e86eb8708c3a1c.png`

This closes the previously-flagged "interactive/visual verification not
performed" gap for the DEMO shell's core behaviors.

## Pending (not built in this iteration)

- Everything in Phase 2–4 of `docs/PLAN.md`: backend device registration,
  heartbeat, account-lease fencing, revision outbox autosend, admin
  roles/web remote status.
- Real idMe/MOEIS navigation and WebView2 SSO compatibility — intentionally
  unproven per constraint; see `docs/ARCHITECTURE.md`.
- Any engine control (start/stop/restart) — this iteration is read-only
  status only, by design (hard constraint 3 in the implementation brief).
- Persistent logging to `%LOCALAPPDATA%\HadirDesktop\logs\` — not wired up;
  no file logging was added (see "Deviations").
- Application icon — tray/window use `SystemIcons.Application` (stock icon);
  no custom HADIR icon was provided.

## Known blockers

- None for Phase 1's own scope. Build and tests are green on this machine,
  and runtime launch/single-instance/close-to-tray are verified (above).
- WebView2 Evergreen Runtime is required at runtime (installed,
  153.0.4234.48). Target PCs need the Evergreen Runtime (or Edge Stable),
  .NET 8 Desktop Runtime, and the built output — see `docs/PLAN.md`.

## Deviations from the brief

- **File logging not implemented**: the brief says "if convenient, or just
  `Trace`". No file sink was added under `%LOCALAPPDATA%\HadirDesktop\logs\`;
  the app relies on `System.Diagnostics.Trace` conventions if wired up later.
  Deliberate scope cut, not an oversight.
- **`SettingsDialog` is a nested private class inside `MainForm.cs`**,
  not a separate file — the brief's file list under `desktop/HadirDesktop/`
  does not name a settings-dialog file, and the "Tetapan Tempatan" menu item
  needed to do something real (toggle fixture vs. loopback status source)
  rather than being a dead stub.
- **Interactive/visual verification was performed after the initial automated
  pass** (see "Runtime verification" above); the original pass was
  `dotnet build`/`dotnet test` only. The state machine, navigation guard, and
  status parsing remain unit-tested; the WinForms wiring in
  `MainForm.cs`/`Program.cs`/`TrayHost.cs` is covered by the runtime check
  above rather than by xUnit (WinForms UI is not practical to unit-test).

## Multi-PC staged slice (device registry + leadership/fencing) (2026-09-22)

Implements the C# desktop side + the admin web section of the staged
"berbilang PC" (multi-PC) slice whose pure domain module
(`hadir-pc/kontrak.mjs`), JSON schema, client validator, and Apps Script
mirror already existed. Feature flag `HADIR_PELBAGAI_PC` stays OFF by
default; nothing here is deployed and no production engine is controlled.

New files:

- `desktop/HadirDesktop/DeviceRegistryModels.cs` — tolerant `System.Text.Json`
  DTOs for the shared contract shapes (`RekodPeranti`, `JawapanDegup`,
  `JawapanKlaim`, `StatusAwam`, `KodDaftar`) plus array parsers for
  `SenaraiPerantiAdmin` / `pcStatusAwam`, mirroring `EngineStatusModel`'s
  tolerant style (missing/wrong-typed fields fall back to null/defaults,
  never throw). No property ever carries the device secret/hash.
- `desktop/HadirDesktop/DeviceCapability.cs` — `PerantiKemampuan` enum
  (`TiadaSokongan` / `Dilumpuhkan` / `Tersedia`) + `PerantiKeadaanRangkaian`.
- `desktop/HadirDesktop/DeviceRegistrationClient.cs` — RPC client for the
  backend's multi-PC section (`pcDaftarPeranti`, `pcDegup`,
  `pcKlaimKepimpinan`, `pcSenaraiPerantiAdmin`, `pcStatusAwam`), same wire
  convention as `hadir-pc/klien-peranti.mjs` (`{mode:'hadir', kaedah,
  argumen}`, browser User-Agent). `ProbeKeupayaanAsync()` is the only call
  that is ever safe to invoke speculatively; every other method is a real
  RPC and none are called automatically. A `!ok` response containing
  "dilumpuhkan" throws a distinct `PerantiDilumpuhkanException`; unknown
  method / network failure during the probe reports `TiadaSokongan` — never
  fabricated success. No auto-retry on state-changing calls. The secret is
  passed straight into the request body and never logged.
- `desktop/HadirDesktop/DevicePanel.cs` — read-only "Pendaftaran PC" WinForms
  panel wired into `MainForm.cs` (bottom of the status area). Shows exactly
  one of "Tiada sokongan pelayan" / "Ciri dilumpuhkan" / "Tersedia", with a
  DEMO label. The probe only runs when the admin clicks the button — no
  automatic heartbeat/registration traffic. `MainForm.cs`'s backend URL
  (`DemoLabel.HadirBackendApiUrl`) is intentionally an empty string in this
  public repo (see root `CLAUDE.md` rule 2); the panel honestly reports
  "tiada sokongan pelayan" until a real deployment URL is configured.
- `desktop/HadirDesktop.Tests/DeviceRegistryModelsTests.cs` (17 tests) — valid
  shapes, missing fields, wrong types, malformed/non-array JSON; asserts no
  property on `RekodPeranti` ever exposes the secret hash.
- `desktop/HadirDesktop.Tests/DeviceRegistrationClientTests.cs` (7 tests) — a
  real in-process `FakeHadirBackend` (`HttpListener` on a loopback ephemeral
  port, dispatches on `kaedah`), asserting `Tersedia` on `ok:true`,
  `TiadaSokongan` on "Fungsi tidak dibenarkan." and on no server listening,
  `PerantiDilumpuhkanException` on "Ciri berbilang PC dilumpuhkan." (for
  `DegupAsync`/`KlaimKepimpinanAsync`), a generic exception for every other
  failure reason, successful `DaftarAsync` parsing, and that the device
  secret never appears in any recorded request path/query.
- `app.js` / `index.html` — minimal admin-only "Peranti PC" section: calls
  `pcStatusAwam` (public) always, and `pcSenaraiPerantiAdmin` per discovered
  `akaun` only when an admin token is present; renders opaque device
  ids/timestamps + a `kelaskanKeadaanPeranti`-style label
  (`tidak_diketahui`/`luar_talian`/`luput`/`aktif`, ported inline from
  `hadir-pc/kontrak.mjs`); shows "Peranti PC belum didayakan" when the
  backend doesn't yet know the RPC. No serial/account/PII/secret rendered,
  no "PC online" claim. Traffic only fires when the admin opens the pane
  (`bukaPane('devicePcPane')` → `muatPerantiPc()`), never on page load.

### Results (this machine, 2026-09-22, .NET SDK 8.0.407, Node 24.19.0)

```
dotnet test desktop/HadirDesktop.sln
# Passed! Failed: 0, Passed: 71, Skipped: 0, Total: 71
```

(71 = the 47 pre-existing tests + 24 new: 17 in `DeviceRegistryModelsTests`,
7 in `DeviceRegistrationClientTests`.)

```
node tests/hadir.test.cjs
# all 23 structural/behavioural checks pass (includes prior sessions' multi-PC backend section checks)
```

```
node --test hadir-pc/tests/*.test.mjs
# tests 33, pass 33, fail 0
```

### Honest limits (unchanged from the domain module's own notes)

- Apps Script cannot transactionally fence the physical portal browser: an
  old, still-active browser session must notice lost leadership and stop new
  writes on its own — the backend cannot force it to stop mid-request.
- A write already in flight when a lease is lost is uncertain, not rolled
  back — the reconciliation model is "read-first" (re-check the account
  generasi/leader before trusting a write succeeded), not a distributed
  transaction.
- No network-partition guarantees are made or implied anywhere in this slice.
- The desktop client's capability probe only proves "the backend answered
  `pcStatusAwam` with `ok:true` at this moment" — it is not a guarantee the
  feature stays enabled for any subsequent call.

### What is DESIGN-ONLY vs IMPLEMENTED (this slice)

IMPLEMENTED and test-covered (end-to-end, not probe-only):

- Admin UI in `app.js`/`index.html` (`Peranti PC` pane): real **Terbit Kod
  Daftar** (single-use, expiring) and **Nyahaktif** buttons, gated by
  `state.token`.
- Desktop enrollment + DPAPI + heartbeat: `DevicePanel`
  (real enrollment UI), `DpapiDeviceSecretStore` (DPAPI CurrentUser, no
  plaintext fallback), `HeartbeatLoop` (opt-in manual Start/Stop, serialized,
  bounded backoff, terminal stop on revoke), `HadirEndpointValidator`
  (Apps-Script-or-loopback only).
- Backend VM tests: `tests/hadir-pc-vm.test.cjs` (29 cases) against the ACTUAL
  `apps-script/HadirWeb.gs` in a Node VM (atomic single-use enrollment, lock
  before reread+consume, sanitized heartbeat, generation fencing on concurrent
  takeover, flag-OFF disables all writes, public status creates no sheets,
  admin RPC auth).

DESIGN-ONLY / not implemented (unchanged, honestly):

- Production deployment of `HADIR_PELBAGAI_PC=1` and a real
  `HadirBackendApiUrl` (both stay empty/OFF).
- Any AUTO-start heartbeat — the loop is always manually started (opt-in) and
  never auto-resumes across tray-hide or restart.
- Any dispatch of real attendance/engine work gated on leadership — leadership
  is REPORTED (Pemimpin/Sedia-standby), never acted upon, in this slice.
- Physical portal partition guarantees — see "Honest limits" above.

### Results (this machine, 2026-09-22, .NET SDK 8.0.407, Node 24.19.0)

```text
dotnet test HadirDesktop.Tests/HadirDesktop.Tests.csproj
# Passed: 99  Failed: 0  Skipped: 0  Total: 99   (was 71; +28 new)

node --test tests/hadir-pc-vm.test.cjs
# tests 29, pass 29, fail 0

node tests/hadir.test.cjs
# all checks pass (incl. +8 structural assertions for the new admin UI)

node --test hadir-pc/tests/*.test.mjs
# tests 33, pass 33, fail 0   (baseline unchanged)

# Debug exe:
#   desktop/HadirDesktop/bin/Debug/net8.0-windows/HadirDesktop.exe
```
