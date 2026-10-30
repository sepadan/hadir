import { AppError } from './errors.mjs';
import { ALLOWED_DOMAINS } from './browser.mjs';
import { runCdpCommand, withTimeout, CDP_TIMEOUT_MS } from './cdp.mjs';
import { SAFE_EVALUATE_SCRIPT } from './evaluator.mjs';

export { SAFE_EVALUATE_SCRIPT };

const MOEIS_HOST = 'moeispel.moe.gov.my';
const MAX_SELECTOR_COUNT = 5000;

// Klasifikasi enum tetap: hos tepat + laluan dikenali. Laluan lain tidak dipulangkan.
const KNOWN_PATHS = Object.freeze({
  'idme.moe.gov.my': { '/login': 'idme-login' },
  'moeispel.moe.gov.my': { '/sahsiah/kehadiran/pkhem/tabguru': 'moeis-attendance' },
  'example.com': { '/': 'control' }
});
const HOST_DEFAULT_KIND = Object.freeze({
  'idme.moe.gov.my': 'idme-other',
  'moeispel.moe.gov.my': 'moeis-other',
  'example.com': 'control'
});

export function classifyUrl(raw) {
  if (typeof raw !== 'string' || !raw) return { host: null, pageKind: 'unknown', normalizedUrl: null };
  if (raw === 'about:blank' || raw.startsWith('about:blank#') || raw.startsWith('about:blank?')) {
    return { host: null, pageKind: 'blank', normalizedUrl: 'about:blank' };
  }
  let u;
  try {
    u = new URL(raw);
  } catch {
    return { host: null, pageKind: 'unknown', normalizedUrl: null };
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port || !ALLOWED_DOMAINS.includes(u.hostname)) {
    return { host: null, pageKind: 'disallowed', normalizedUrl: null };
  }
  const host = u.hostname;
  const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : '/';
  const known = KNOWN_PATHS[host][path];
  return {
    host,
    pageKind: known || HOST_DEFAULT_KIND[host],
    normalizedUrl: known ? `https://${host}${path === '/' ? '/' : path}` : `https://${host}/…`
  };
}

/**
 * Pilih halaman untuk diperiksa. Selepas popup SSO, tab MOEIS baharu
 * diutamakan berbanding sasaran idMe yang disimpan. Metadata sasaran tidak
 * menyatakan tab mana yang "aktif", jadi pemilihan dilaporkan secara jujur.
 */
export function selectInspectTarget(targets, savedTargetId) {
  const pages = (Array.isArray(targets) ? targets : [])
    .filter((t) => t && t.type === 'page' && typeof t.id === 'string')
    .map((t) => ({ id: t.id, url: t.url, cls: classifyUrl(t.url) }));
  const allowed = pages.filter((p) => p.cls.pageKind !== 'disallowed' && p.cls.pageKind !== 'unknown');
  const moeis = allowed.filter((p) => p.cls.host === MOEIS_HOST);
  const base = { pageCount: pages.length };
  if (moeis.length) {
    const pick = moeis[moeis.length - 1];
    return { ...base, targetId: pick.id, url: pick.url, selection: 'moeis-tab', ambiguous: moeis.length > 1 };
  }
  const saved = allowed.find((p) => p.id === savedTargetId);
  if (saved) return { ...base, targetId: saved.id, url: saved.url, selection: 'saved', ambiguous: false };
  if (allowed.length) {
    return { ...base, targetId: allowed[0].id, url: allowed[0].url, selection: 'first-allowed', ambiguous: allowed.length > 1 };
  }
  return { ...base, targetId: null, url: null, selection: 'none', ambiguous: pages.length > 0 };
}

/** Senaraikan sasaran sesi sendiri dan pilih halaman. Jika senarai gagal, guna sasaran disimpan (ditanda samar-samar). */
export async function resolveInspectTarget(browser, sessionId, savedTargetId) {
  if (browser?.devtools && typeof browser.devtools.listTargets === 'function') {
    try {
      const targets = await withTimeout(browser.devtools.listTargets(sessionId), CDP_TIMEOUT_MS);
      return selectInspectTarget(targets, savedTargetId);
    } catch {
      // jatuh ke sasaran disimpan
    }
  }
  return { pageCount: null, targetId: savedTargetId || null, url: null, selection: 'saved-unlisted', ambiguous: true };
}

/** Sahkan jenis setiap medan daripada DOM jauh. Medan lain dibuang. */
export function sanitizeEvalResult(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const count = value.moeisAttendanceSelectorCount;
  return {
    href: typeof value.href === 'string' ? value.href : null,
    isIdMeLoginForm: value.isIdMeLoginForm === true,
    isIdMePasswordStep: value.isIdMePasswordStep === true,
    isBlocked: value.isBlocked === true,
    hasCaptchaOrOtp: value.hasCaptchaOrOtp === true,
    moeisAttendanceSelectorCount: Number.isInteger(count) && count >= 0 && count <= MAX_SELECTOR_COUNT ? count : null
  };
}

export async function inspectActivePage(browser, sessionId, savedTargetId, { timeoutMs = CDP_TIMEOUT_MS, now = Date.now } = {}) {
  const sel = await resolveInspectTarget(browser, sessionId, savedTargetId);
  const base = {
    targetSelection: sel.selection,
    pageCount: sel.pageCount,
    inspectedAt: new Date(now()).toISOString()
  };
  if (!sel.targetId) {
    return {
      ...base,
      pageKind: 'none',
      host: null,
      normalizedUrl: null,
      ambiguous: true,
      isIdMeLoginForm: false,
      isIdMePasswordStep: false,
      isBlocked: false,
      hasCaptchaOrOtp: false,
      moeisAttendanceSelectorCount: null
    };
  }
  const result = await runCdpCommand(
    browser,
    sessionId,
    sel.targetId,
    'Runtime.evaluate',
    { expression: SAFE_EVALUATE_SCRIPT, returnByValue: true, awaitPromise: false },
    { timeoutMs }
  );
  if (result?.exceptionDetails) throw new AppError('cdp-failed');
  const clean = sanitizeEvalResult(result?.result?.value);
  if (!clean) throw new AppError('cdp-failed');
  const dom = classifyUrl(clean.href);
  const meta = sel.url ? classifyUrl(sel.url) : null;
  const ambiguous = sel.ambiguous || !meta || meta.host !== dom.host;
  return {
    ...base,
    pageKind: dom.pageKind,
    host: dom.host,
    normalizedUrl: dom.normalizedUrl,
    ambiguous,
    isIdMeLoginForm: clean.isIdMeLoginForm,
    isIdMePasswordStep: clean.isIdMePasswordStep,
    isBlocked: clean.isBlocked,
    hasCaptchaOrOtp: clean.hasCaptchaOrOtp,
    moeisAttendanceSelectorCount: dom.host === MOEIS_HOST ? clean.moeisAttendanceSelectorCount : null
  };
}
