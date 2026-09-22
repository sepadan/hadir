// Dev/test-only: drive the embedded WebView2 fixture over CDP (loopback,
// ephemeral profile) using Playwright connectOverCDP. Proves:
//   1. the CDP endpoint really belongs to OUR msedgewebview2.exe process
//      (owned process + command-line fingerprint), not an assumption;
//   2. the OS socket is really bound to loopback (netstat), not a hardcoded
//      string match;
//   3. the production browser-transport adapter
//      (companion/src/moeis/adaptorPlaywright.mjs) can drive a REAL served
//      MOEIS-like page across several distinct fake classes, sequentially,
//      with no state inheritance, WHILE the host window is minimized;
//   4. a non-fixture origin (including the normal fixture `/` and any
//      future settings/SSO page) is REJECTED before any evaluate/click.
//
// Never touches a real portal/profile/credential. Any violated precondition
// ABORTS the run with a distinct non-zero exit code BEFORE driving anything.
//
// Preconditions:
//   1. The dev-debug exe is running with HADIR_DEV_DEBUG=1 (see run below).
//   2. It writes its CDP port to %LOCALAPPDATA%\HadirDesktop\devtools-port.txt.
//
// Usage:
//   HADIR_DEV_DEBUG=1 <HadirDesktop.exe> &   (from a shell, or the wrapper)
//   node drive-fixture.mjs
//   HADIR_SHUTDOWN=1 node drive-fixture.mjs   (also exercises graceful exit)

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import os from 'node:os';

import { buatAdaptorPlaywright } from '../../../companion/src/moeis/adaptorPlaywright.mjs';

const LOCALAPPDATA = process.env.LOCALAPPDATA
  || join(os.homedir(), 'AppData', 'Local');
const PORT_FILE = process.env.HADIR_DEVTOOLS_PORT_FILE
  || join(LOCALAPPDATA, 'HadirDesktop', 'devtools-port.txt');

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ---------------------------------------------------------------------------
// Pure helper functions (also unit-tested in drive-fixture.test.mjs).
// ---------------------------------------------------------------------------

/**
 * True iff `host` is a loopback address (IPv4 127.0.0.0/8 or IPv6 ::1).
 * Rejects wildcard binds (0.0.0.0, ::, *), empty, and any non-loopback IP.
 */
export function adalahAlamatLoopback(host) {
  if (!host) return false;
  let h = String(host).trim();
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  if (h === '') return false;
  if (h === '::1') return true;
  if (h === '::' || h === '0.0.0.0' || h === '*') return false;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const octets = m.slice(1, 5).map(Number);
  if (octets.some((o) => o < 0 || o > 255)) return false;
  return octets[0] === 127;
}

/**
 * Parses `netstat -ano` text, finds the LISTENING row for `port`, and
 * returns { ok, alamat, sebab } based on whether the bound local address is
 * loopback. Rejects wildcard/public binds explicitly (does not merely
 * pattern-match a hardcoded "127.0.0.1" string).
 */
export function semakAlamatLoopback(barisNetstat, port) {
  const baris = String(barisNetstat || '').split(/\r?\n/);
  const portStr = String(port);
  for (const line of baris) {
    if (!/LISTENING/i.test(line)) continue;
    const cols = line.trim().split(/\s+/);
    if (cols.length < 2) continue;
    const local = cols[1];
    const lastColon = local.lastIndexOf(':');
    if (lastColon < 0) continue;
    const host = local.slice(0, lastColon);
    const listedPort = local.slice(lastColon + 1);
    if (listedPort !== portStr) continue;
    if (adalahAlamatLoopback(host)) {
      return { ok: true, alamat: host, sebab: null };
    }
    return { ok: false, alamat: host, sebab: `bound to non-loopback address ${host}` };
  }
  return { ok: false, alamat: null, sebab: `no LISTENING row found for port ${port}` };
}

/**
 * True iff `url` is the exact dev fixture origin: http scheme, loopback
 * host, matching port, and path `/dev` or `/dev/...`.
 */
export function adalahAsalFixtureDev(url, port) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:') return false;
  if (!adalahAlamatLoopback(u.hostname)) return false;
  if (u.port !== String(port)) return false;
  return u.pathname === '/dev' || u.pathname.startsWith('/dev/');
}

/**
 * Genuine "owned process/cmdline" fingerprint for the WebView2 process CDP
 * claims to belong to. NOT the vacuous `Browser.includes('WebView2')`
 * assumption it replaces. `port` is the CDP port this run is targeting — it
 * must appear literally in the command line alongside the isolated dev
 * profile, proving the process is OUR dev-debug WebView2 and not some other
 * msedgewebview2.exe (e.g. the user's normal Edge/WebView2 session).
 */
export function semakFingerprintWebView2(versiJson, port, imejProses, barisPerintah) {
  const browserOk = !!(versiJson && typeof versiJson.Browser === 'string' && versiJson.Browser.length > 0);
  const imejOk = typeof imejProses === 'string' && imejProses.toLowerCase() === 'msedgewebview2.exe';
  const cmd = String(barisPerintah || '');
  const cmdOk = cmd.includes(`--remote-debugging-port=${port}`) && /webview2-dev-\d+/i.test(cmd);
  return browserOk && imejOk && cmdOk;
}

/**
 * Extracts the port from a URL that LOOKS like a loopback dev-fixture URL
 * (http, loopback host, /dev-prefixed path), without assuming any particular
 * port number in advance. Used only to discover the FixturePortalServer's
 * (independently ephemeral) HTTP port from the page WebView2 actually
 * exposes — never to relax the strict `adalahAsalFixtureDev` check itself,
 * which is always re-applied with the extracted port before trusting a page.
 */
function extractLoopbackDevPort(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:') return null;
  if (!adalahAlamatLoopback(u.hostname)) return null;
  if (!(u.pathname === '/dev' || u.pathname.startsWith('/dev/'))) return null;
  return u.port;
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail ?? '' });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
}

function abort(code, reason) {
  console.error(`ABORT (exit ${code}): ${reason}`);
  printSummary();
  process.exit(code);
}

function printSummary() {
  console.log('\n--- summary ---');
  const failed = results.filter((r) => !r.ok);
  console.log(`${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log('FAILED:', failed.map((f) => f.name).join('; '));
  }
}

async function readPort(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const raw = readFileSync(PORT_FILE, 'utf8').trim();
      const port = Number.parseInt(raw, 10);
      if (Number.isInteger(port) && port > 0 && port < 65536) return port;
    } catch {
      /* not written yet */
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for port file: ${PORT_FILE}`);
}

async function waitForDevtools(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return await res.json();
      lastErr = `HTTP ${res.status}`;
    } catch (e) {
      lastErr = String(e && e.message || e);
    }
    await sleep(250);
  }
  throw new Error(`DevTools endpoint never ready on 127.0.0.1:${port}: ${lastErr}`);
}

function run(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => resolve({ code, stdout: out, stderr: err }));
    child.on('error', () => resolve({ code: -1, stdout: out, stderr: err }));
  });
}

async function findListeningPidForPort(port) {
  const { stdout } = await run('netstat', ['-ano', '-p', 'TCP']);
  const check = semakAlamatLoopback(stdout, port);
  if (!check.ok) return { check, pid: null };

  const portStr = String(port);
  for (const line of stdout.split(/\r?\n/)) {
    if (!/LISTENING/i.test(line)) continue;
    const cols = line.trim().split(/\s+/);
    if (cols.length < 5) continue;
    const local = cols[1];
    const lastColon = local.lastIndexOf(':');
    if (lastColon < 0) continue;
    if (local.slice(lastColon + 1) !== portStr) continue;
    const pid = cols[cols.length - 1];
    return { check, pid };
  }
  return { check, pid: null };
}

async function getImageName(pid) {
  const { stdout } = await run('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV']);
  const lines = stdout.split(/\r?\n/).filter((l) => l.trim().length > 0);
  // First data line (after the CSV header) looks like: "msedgewebview2.exe","1234",...
  for (const line of lines) {
    const m = line.match(/^"([^"]+)"/);
    if (m && /\.exe$/i.test(m[1])) return m[1];
  }
  return null;
}

async function getCommandLine(pid) {
  const { stdout } = await run('powershell', [
    '-NoProfile', '-Command',
    `(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine`,
  ]);
  return stdout.trim();
}

async function main() {
  console.log('HADIR WebView2 CDP drive test (dev fixture only, genuine gate)');
  console.log(`port file: ${PORT_FILE}`);

  // --- Step 1-2: port file + /json/version ---
  const port = await readPort();
  const ver = await waitForDevtools(port);
  record('CDP endpoint reachable and reports a Browser string', typeof ver.Browser === 'string' && ver.Browser.length > 0,
    `browser=${ver.Browser} product=${ver.product}`);

  // --- Step 3: netstat loopback verification (replaces vacuous line-73 regex) ---
  const { check: loopbackCheck, pid } = await findListeningPidForPort(port);
  record('Listener socket verified bound to loopback (netstat)', loopbackCheck.ok,
    loopbackCheck.ok ? `alamat=${loopbackCheck.alamat}` : loopbackCheck.sebab);
  if (!loopbackCheck.ok) {
    abort(10, `listener for port ${port} is not loopback-bound: ${loopbackCheck.sebab}`);
  }
  if (!pid) {
    record('Owning PID for CDP port resolved via netstat', false, 'no PID column found');
    abort(11, `could not resolve owning PID for port ${port} from netstat output`);
  }
  record('Owning PID for CDP port resolved via netstat', true, `pid=${pid}`);

  // --- Step 4: process image + command-line fingerprint (replaces vacuous line-69 tautology) ---
  const imej = await getImageName(pid);
  const cmdLine = await getCommandLine(pid);
  const fp = semakFingerprintWebView2(ver, port, imej, cmdLine);
  record('Owning process fingerprints as our isolated msedgewebview2.exe (image + dev profile + port in cmdline)', fp,
    `imej=${imej} devProfilePresent=${/webview2-dev-\d+/i.test(cmdLine || '')} portInCmdline=${(cmdLine || '').includes(`--remote-debugging-port=${port}`)}`);
  if (!fp) {
    abort(12, 'CDP-owning process failed the msedgewebview2.exe / dev-profile / port fingerprint check');
  }

  // --- Step 5: connect and locate the EXACT dev fixture page ---
  // NOTE: the CDP debug port (`port`, from devtools-port.txt) and the
  // FixturePortalServer's HTTP port are two INDEPENDENT ephemeral ports —
  // there is no port file for the latter. We discover it from the actual
  // page URL WebView2 exposes, then treat it as ground truth for every
  // subsequent same-origin check (steps 8/9/11) — a page that later drifts
  // to a different port would fail those checks.
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  const pages = context.pages();
  record('WebView2 exposes at least one page over CDP', pages.length >= 1, `${pages.length} page(s)`);

  let page = null;
  let fixturePort = null;
  for (const p of pages) {
    const candidatePort = extractLoopbackDevPort(p.url());
    if (candidatePort !== null && adalahAsalFixtureDev(p.url(), candidatePort)) {
      page = p;
      fixturePort = candidatePort;
      break;
    }
  }
  record('Located a page whose origin is the exact dev fixture (/dev)', !!page,
    page ? page.url() : `no match among: ${pages.map((p) => p.url()).join(', ')}`);
  if (!page) {
    await browser.close();
    abort(13, 'no page matched the exact dev fixture origin; refusing to evaluate/click anything');
  }

  await page.waitForLoadState('domcontentloaded').catch(() => {});

  // --- Step 6: scenario marker ---
  const senario = await page.textContent('#dev-senario').catch(() => null);
  record('Dev fixture landed on default scenario (kelas-1)', senario === 'kelas-1', String(senario));

  const marker = await page.textContent('#dev-marker').catch(() => null);
  record('Fixture marker reads DEV-FIXTURE-OK', marker === 'DEV-FIXTURE-OK', String(marker));

  // --- Step 7: minimize ---
  await page.click('#btn-minimize');
  await sleep(700);
  const hostState = await page.textContent('#host-state').catch(() => null);
  record('Host confirmed minimized (host-state echoed back)', hostState === 'host-state:Minimized', String(hostState));

  // --- Step 8: drive the PRODUCTION adapter across 3 sequential classes while minimized ---
  const skenarios = [
    { path: '/dev/kelas/1', cari: 'PRASEKOLAH', padan: 'PRASEKOLAH BIJAK', tahun: 'PRASEKOLAH', kelas: 'PRASEKOLAH', hadir: 19, jumlah: 19 },
    { path: '/dev/kelas/2', cari: 'TAHUN EMPAT', padan: 'TAHUN EMPAT CERGAS', tahun: 'TAHUN EMPAT', kelas: 'TAHUN EMPAT', hadir: 25, jumlah: 28 },
    { path: '/dev/kelas/3', cari: 'TAHUN LIMA', padan: 'TAHUN LIMA GEMILANG', tahun: 'TAHUN LIMA', kelas: 'TAHUN LIMA', hadir: 12, jumlah: 15 },
  ];

  const baseUrl = new URL(page.url());
  const rekod = [];
  for (const s of skenarios) {
    const targetUrl = `${baseUrl.protocol}//${baseUrl.host}${s.path}`;
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch((e) => {
      record(`Navigated to ${s.path}`, false, String(e && e.message || e));
    });
    record(`Navigated to ${s.path}`, adalahAsalFixtureDev(page.url(), fixturePort), page.url());

    const senarioMarker = await page.textContent('#dev-senario').catch(() => null);
    record(`Scenario marker matches ${s.path}`, senarioMarker === `kelas-${s.path.slice(-1)}`, String(senarioMarker));

    // Fresh adapter per scenario — proves no state inheritance across a shared page/context.
    const adapter = buatAdaptorPlaywright(page);
    const hasilKelas = await adapter.pilihKelas(s.cari);
    record(`pilihKelas('${s.cari}') selects '${s.padan}'`, hasilKelas && hasilKelas.ok === true && hasilKelas.padan === s.padan,
      JSON.stringify(hasilKelas));

    const ringkasan = await adapter.bacaRingkasanKelas(s.tahun, s.kelas);
    const ringkasanOk = ringkasan && ringkasan.kelasPadan === s.padan && ringkasan.hadir === s.hadir && ringkasan.jumlah === s.jumlah;
    record(`bacaRingkasanKelas('${s.tahun}', '${s.kelas}') reads ${s.hadir}/${s.jumlah}`, ringkasanOk, JSON.stringify(ringkasan));

    rekod.push({ path: s.path, hasilKelas, ringkasan });
  }

  const semuaBerbeza = new Set(rekod.map((r) => JSON.stringify(r.ringkasan))).size === rekod.length;
  record('Each of the 3 scenario reads is DISTINCT (no state inheritance)', semuaBerbeza, rekod.map((r) => r.ringkasan && r.ringkasan.kelasPadan).join(' | '));

  // --- Step 9: negative test — nonfixture target abort (against the REAL WebView2) ---
  const nonfixtureUrl = `${baseUrl.protocol}//${baseUrl.host}/`;
  await page.goto(nonfixtureUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  const nonfixtureRejected = !adalahAsalFixtureDev(page.url(), fixturePort);
  record('Negative test: normal fixture origin (/) is REJECTED as a dev-fixture target', nonfixtureRejected, page.url());

  // Navigate back to /dev so the remaining bridge checks (show) target the dev fixture again.
  await page.goto(`${baseUrl.protocol}//${baseUrl.host}/dev`, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  record('Returned to the dev fixture after the negative test', adalahAsalFixtureDev(page.url(), fixturePort), page.url());

  // --- Step 10: negative test — listener/public rejection, pure self-test ---
  const fakeRows = (addr) => `  TCP    ${addr}    0.0.0.0:0    LISTENING    1234`;
  const rejectCases = ['0.0.0.0', '192.168.1.5', '[::]'].map((h) => `${h}:${port}`);
  const acceptCases = ['127.0.0.1', '[::1]'].map((h) => `${h}:${port}`);
  const rejectOk = rejectCases.every((addr) => semakAlamatLoopback(fakeRows(addr), port).ok === false);
  record('Self-test: wildcard/public binds are rejected by semakAlamatLoopback', rejectOk, rejectCases.join(', '));
  const acceptOk = acceptCases.every((addr) => semakAlamatLoopback(fakeRows(addr), port).ok === true);
  record('Self-test: loopback binds are accepted by semakAlamatLoopback', acceptOk, acceptCases.join(', '));

  // --- Step 11: show again ---
  await page.click('#btn-show');
  await sleep(700);
  const hostStateAfterShow = await page.textContent('#host-state').catch(() => null);
  record('Host restored to Normal', hostStateAfterShow === 'host-state:Normal', String(hostStateAfterShow));

  await browser.close();
  printSummary();
  const anyFailed = results.some((r) => !r.ok);
  if (anyFailed) process.exitCode = 1;

  // --- Step 12: optional graceful shutdown ---
  if (process.env.HADIR_SHUTDOWN === '1') {
    const b2 = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const pagesAfter = b2.contexts()[0].pages();
    const p2 = pagesAfter.find((p) => adalahAsalFixtureDev(p.url(), fixturePort)) || pagesAfter[0];
    await p2.click('#btn-shutdown').catch(() => {});
    await sleep(2500);
    try { await b2.close(); } catch { /* already gone */ }
    console.log('Shutdown requested (dev-only).');

    // --- Step 13: scoped process verification ---
    const remainingHadir = await run('tasklist', ['/FI', 'IMAGENAME eq HadirDesktop.exe', '/FO', 'CSV']);
    const hadirGone = !/HadirDesktop\.exe/i.test(remainingHadir.stdout);
    record('No HadirDesktop.exe process remains after shutdown', hadirGone, '');

    const { stdout: webviewJson } = await run('powershell', [
      '-NoProfile', '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name='msedgewebview2.exe'\" | Select-Object CommandLine | ConvertTo-Json -Compress",
    ]);
    const orphanDevWebview = new RegExp(`webview2-dev-${port}\\b`, 'i').test(webviewJson || '');
    record('No orphan msedgewebview2.exe with our dev profile remains', !orphanDevWebview, '');

    printSummary();
    if (!hadirGone || orphanDevWebview) process.exitCode = 1;
  }
}

const isMain = (() => {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isMain) {
  main().catch((e) => {
    console.error('DRIVE TEST ERROR:', e && e.message || e);
    process.exitCode = 2;
  });
}
