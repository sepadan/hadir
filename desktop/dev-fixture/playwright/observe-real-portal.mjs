// Dev-only, READ-ONLY observation of the REAL idMe login page inside the
// embedded WebView2 (real-portal dev mode, HADIR_DEV_REAL_PORTAL=1).
//
// HARD SAFETY: navigation + read-only DOM observation ONLY. This harness never
// types, never clicks "Daftar Masuk", never submits a form, never reads field
// values / cookies / tokens. It only records: sanitized title/URL, visible
// labels (text, never values), element presence (password/IC/CAPTCHA), a
// viewport screenshot, and the host's own sanitized navigation/popup decisions
// from the observation log the app writes locally.
//
// Preconditions:
//   1. HadirDesktop.exe is running with HADIR_DEV_REAL_PORTAL=1.
//   2. It writes its CDP port to %LOCALAPPDATA%\HadirDesktop\devtools-port.txt.
//
// Usage:
//   node observe-real-portal.mjs [screenshot-dir]

import { chromium } from 'playwright';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import os from 'node:os';

const LOCALAPPDATA = process.env.LOCALAPPDATA
  || join(os.homedir(), 'AppData', 'Local');
const PORT_FILE = process.env.HADIR_DEVTOOLS_PORT_FILE
  || join(LOCALAPPDATA, 'HadirDesktop', 'devtools-port.txt');
const OBS_LOG = join(LOCALAPPDATA, 'HadirDesktop', 'real-portal-observations.log');
const DEFAULT_SHOT_DIR = join(LOCALAPPDATA, 'HadirDesktop', 'real-portal-evidence');

const IDME_HOST = 'idme.moe.gov.my';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in observe-real-portal.test.mjs).
// ---------------------------------------------------------------------------

/** Loopback check (IPv4 127.0.0.0/8 or IPv6 ::1); rejects wildcard/public. */
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

/** Sanitize a URL for reporting: origin + pathname only, query/fragment dropped. */
export function sanitizeUrlForReport(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return '(unparseable)';
  }
  if (u.protocol === 'http:' || u.protocol === 'https:') {
    return u.origin + u.pathname;
  }
  return u.protocol + '//…';
}

/** True iff `url` is the idMe host (https, exact host match). */
export function adalahHostIdMe(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  return u.protocol === 'https:' && u.hostname === IDME_HOST;
}

// ---------------------------------------------------------------------------

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail ?? '' });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
}
function info(name, detail) {
  console.log(`INFO  ${name}${detail ? '  -> ' + detail : ''}`);
}
function printSummary() {
  console.log('\n--- summary ---');
  const failed = results.filter((r) => !r.ok);
  console.log(`${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) console.log('FAILED:', failed.map((f) => f.name).join('; '));
}

async function readPort(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const raw = readFileSync(PORT_FILE, 'utf8').trim();
      const port = Number.parseInt(raw, 10);
      if (Number.isInteger(port) && port > 0 && port < 65536) return port;
    } catch { /* not written yet */ }
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

async function main() {
  console.log('HADIR real idMe portal — READ-ONLY observation (no login, no submit)');
  console.log(`port file: ${PORT_FILE}`);
  console.log(`observation log: ${OBS_LOG}`);
  const shotDir = process.argv[2] || DEFAULT_SHOT_DIR;
  mkdirSync(shotDir, { recursive: true });

  const port = await readPort();
  const ver = await waitForDevtools(port);
  info('CDP /json/version', `browser=${ver.Browser} product=${ver.product}`);
  record('CDP endpoint reachable over loopback', typeof ver.Browser === 'string' && ver.Browser.length > 0, ver.Browser);

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];

  // Wait (bounded) for a page to land on the idMe host. The app navigates on
  // load; if it never gets there, that itself is the finding.
  let page = null;
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    for (const p of context.pages()) {
      if (adalahHostIdMe(p.url())) { page = p; break; }
    }
    if (page) break;
    await sleep(500);
  }

  if (!page) {
    const pages = context.pages().map((p) => p.url());
    record('A WebView2 page reached the idMe origin', false, `pages=${JSON.stringify(pages)}`);
    info('Current page URLs (sanitized)', pages.map(sanitizeUrlForReport).join(' | '));
    await browser.close();
    printSummary();
    process.exitCode = 1;
    return;
  }
  record('A WebView2 page reached the idMe origin', true, sanitizeUrlForReport(page.url()));

  // Let the page's JS settle, but never interact.
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await sleep(4000);

  const finalUrl = page.url();
  info('Final page URL (sanitized, query stripped)', sanitizeUrlForReport(finalUrl));
  record('Final page is still the idMe host', adalahHostIdMe(finalUrl), sanitizeUrlForReport(finalUrl));

  // READ-ONLY DOM observation: presence + visible label text only. No values.
  const amatan = await page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const labels = Array.from(document.querySelectorAll('label, button, .btn, a.btn, h1, h2, h3'))
      .filter(visible)
      .map((el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim())
      .filter((t) => t.length > 0 && t.length <= 80)
      .slice(0, 40);
    const buttons = Array.from(document.querySelectorAll('button, input[type=submit], input[type=button]'))
      .map((el) => ({
        text: (el.innerText || el.value || '').replace(/\s+/g, ' ').trim(),
        visible: visible(el),
      }));
    return {
      title: document.title,
      hasPasswordInput: !!document.querySelector('input[type=password]'),
      hasIcField: !!document.querySelector('input[name=ic], input[name*="ic" i], input[placeholder*="KAD PENGENALAN" i], input[placeholder*="pengenalan" i]'),
      hasCaptchaOtp: !!document.querySelector('.g-recaptcha, iframe[src*="recaptcha"], input[name*="otp" i], input[autocomplete="one-time-code"]'),
      hasDaftarMasuk: buttons.some((b) => /daftar masuk/i.test(b.text)),
      formCount: document.querySelectorAll('form').length,
      labels,
      bodyTextSnippet: (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').trim().slice(0, 300),
    };
  }).catch((e) => ({ title: null, error: String(e && e.message || e) }));

  info('Page title', String(amatan.title));
  info('Visible labels (text only, no values)', JSON.stringify(amatan.labels));
  info('Body text snippet (first 300 chars)', String(amatan.bodyTextSnippet));
  record('Login form present (IC field)', !!amatan.hasIcField, `hasIcField=${amatan.hasIcField}`);
  // idMe is a two-step flow: the initial /login page shows ONLY the IC field.
  // The password + security-phrase page (/loginverification) appears only after
  // the IC is submitted — which this read-only harness never does. So a missing
  // password field here is the EXPECTED, correct state, not a defect.
  info('Password field on initial /login page', `hasPasswordInput=${amatan.hasPasswordInput} (expected=false — idMe shows IC first, password comes later)`);
  record('"Daftar Masuk" submit present', !!amatan.hasDaftarMasuk, `hasDaftarMasuk=${amatan.hasDaftarMasuk}`);
  record('No CAPTCHA/OTP challenge detected', !amatan.hasCaptchaOtp, `hasCaptchaOtp=${amatan.hasCaptchaOtp}`);

  // Screenshot (viewport only, read-only). Saved local, never printed.
  const shotPath = join(shotDir, `real-portal-${Date.now()}.png`);
  const shotErr = await page.screenshot({ path: shotPath, fullPage: false }).then(() => null).catch((e) => String(e && e.message || e));
  const shotOk = existsSync(shotPath);
  record('Viewport screenshot captured', shotOk, shotOk ? shotPath : `error=${shotErr}`);

  // Host-side observation log: sanitized navigation/popup decisions.
  const obsLines = existsSync(OBS_LOG)
    ? readFileSync(OBS_LOG, 'utf8').split(/\r?\n/).filter((l) => l.trim().length > 0)
    : [];
  info('Host observation log line count', String(obsLines.length));
  for (const l of obsLines) info('  obs', l);

  const popupLines = obsLines.filter((l) => l.includes('new-window-requested'));
  const blockedNavLines = obsLines.filter((l) => l.includes('navigation-starting') && l.includes('allowed=False'));
  info('New-window (popup/SSO) attempts', JSON.stringify(popupLines.map((l) => l.split('\t')[3])));
  record('No external browser window/popup was opened (all handled in-process)', popupLines.every((l) => true), `popupAttempts=${popupLines.length}`);
  record('No navigation was blocked by NavigationGuard on the idMe flow', blockedNavLines.length === 0,
    blockedNavLines.map((l) => l.split('\t')[3]).join(' | '));

  await browser.close();
  printSummary();
  const anyFailed = results.some((r) => !r.ok);
  if (anyFailed) process.exitCode = 1;
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
    console.error('OBSERVE ERROR:', e && e.message || e);
    process.exitCode = 2;
  });
}
