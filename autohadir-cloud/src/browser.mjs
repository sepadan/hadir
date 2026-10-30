import { AppError } from './errors.mjs';
import { runCdpCommand, withTimeout, CDP_TIMEOUT_MS } from './cdp.mjs';

export const ALLOWED_DOMAINS = Object.freeze(['idme.moe.gov.my', 'moeispel.moe.gov.my', 'example.com']);
export const BROWSER_KEEPALIVE_MS = 300000; // 5 minit
export const LIVE_VIEW_EXPIRES_MS = 60000;
export const LIVE_VIEW_ORIGIN = 'https://live.browser.run';
export const MAX_SNAPSHOT_BYTES = 3 * 1024 * 1024;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function requireBinding(browser, method) {
  if (!browser || typeof browser[method] !== 'function') throw new AppError('browser-unavailable');
}

/**
 * Panggil acquire sekali. Tidak mencuba semula dan tidak menukar ralat hulu —
 * pemanggil (SchoolSession) menganggap sebarang kegagalan sebagai tidak pasti.
 */
export async function acquireBrowserSession(browser) {
  requireBinding(browser, 'acquire');
  const res = await browser.acquire({
    keepAlive: BROWSER_KEEPALIVE_MS,
    recording: false,
    targets: true,
    guardrails: { allowedDomains: [...ALLOWED_DOMAINS] }
  });
  const sessionId = res && typeof res.sessionId === 'string' && res.sessionId ? res.sessionId : null;
  const page = Array.isArray(res?.targets) ? res.targets.find((t) => t && t.type === 'page' && typeof t.id === 'string') : null;
  return { sessionId, targetId: page ? page.id : null };
}

/** Pulangkan URL jika ia benar-benar https://live.browser.run/ui/...; jika tidak null. */
export function validateLiveViewUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 4096 || !raw.startsWith(`${LIVE_VIEW_ORIGIN}/ui/`)) return null;
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.hostname !== 'live.browser.run' || u.port || u.username || u.password) return null;
  if (!u.pathname.startsWith('/ui/')) return null;
  return raw;
}

/** Sahkan base64 PNG (tandatangan + saiz bait sebenar). Pulangkan base64 atau null. */
export function validatePngBase64(b64) {
  if (typeof b64 !== 'string' || b64.length < 12) return null;
  if (b64.length > Math.ceil(MAX_SNAPSHOT_BYTES / 3) * 4) return null;
  if (b64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  const bytes = (b64.length / 4) * 3 - padding;
  if (bytes > MAX_SNAPSHOT_BYTES) return null;
  let head;
  try {
    head = atob(b64.slice(0, 12));
  } catch {
    return null;
  }
  for (let i = 0; i < PNG_SIGNATURE.length; i++) if (head.charCodeAt(i) !== PNG_SIGNATURE[i]) return null;
  return b64;
}

/**
 * Minta Live View. Untuk readonly, `verified` hanya benar jika respons
 * menggemakan options.guardrails.mode === 'readonly' (bentuk respons REST yang
 * didokumenkan). Binding yang menggugurkan pilihan itu TIDAK disahkan.
 */
export async function requestLiveView(browser, sessionId, targetId, mode) {
  requireBinding(browser, 'getLiveView');
  const opts = { mode: mode === 'manual' ? 'full' : 'tab', expiresInMs: LIVE_VIEW_EXPIRES_MS };
  if (targetId) opts.targetId = targetId;
  if (mode === 'readonly') opts.guardrails = { mode: 'readonly' };
  let res;
  try {
    res = await withTimeout(browser.getLiveView(sessionId, opts), CDP_TIMEOUT_MS);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('liveview-failed');
  }
  const url = validateLiveViewUrl(res?.devtoolsFrontendUrl);
  if (!url) throw new AppError('liveview-url-untrusted');
  const verified = mode === 'readonly' && res?.options?.guardrails?.mode === 'readonly';
  return { url, verified };
}

/** Tangkapan skrin statik (Page.captureScreenshot). Tidak disimpan di mana-mana. */
export async function captureSnapshot(browser, sessionId, targetId) {
  let result;
  try {
    result = await runCdpCommand(browser, sessionId, targetId, 'Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false
    });
  } catch {
    throw new AppError('snapshot-unavailable');
  }
  const b64 = validatePngBase64(result?.data);
  if (!b64) throw new AppError('snapshot-unavailable');
  return `data:image/png;base64,${b64}`;
}
