import { AppError } from './errors.mjs';
import { TARGET_URLS } from './targets.mjs';
import { SAFE_EVALUATE_SCRIPT } from './evaluator.mjs';
import { validPortalCall, PORTAL_FUNCTION } from './flow-dom.mjs';

export const CDP_TIMEOUT_MS = 10000;

// Arahan tetap sahaja. Tiada CDP/JS/URL arbitrari daripada pengguna.
export const ALLOWED_CDP_METHODS = Object.freeze(['Page.navigate', 'Runtime.evaluate', 'Page.captureScreenshot', 'Runtime.callFunctionOn']);

function assertAllowedCommand(method, params) {
  const p = params || {};
  const ok =
    (method === 'Page.navigate' && TARGET_URLS.has(p.url)) ||
    (method === 'Runtime.evaluate' && p.expression === SAFE_EVALUATE_SCRIPT) ||
    (method === 'Runtime.evaluate' && p.expression === 'globalThis' && p.returnByValue === false) ||
    (method === 'Runtime.callFunctionOn' && validPortalCall(p)) ||
    (method === 'Page.captureScreenshot' && p.format === 'png');
  if (!ok) throw new AppError('cdp-method-denied');
}

/** Promise.race dengan pemasa yang sentiasa dibersihkan. */
export function withTimeout(promise, ms, code = 'cdp-timeout') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new AppError(code)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function sendCommand(socket, method, params, timeoutMs, id = 1) {
  return new Promise((resolve, reject) => {
    let timer = null;
    const cleanup = () => {
      clearTimeout(timer);
      socket.removeEventListener('message', onMessage);
      socket.removeEventListener('close', onClose);
      socket.removeEventListener('error', onClose);
    };
    const fail = (code) => {
      cleanup();
      reject(new AppError(code));
    };
    const onClose = () => fail('cdp-failed');
    const onMessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(typeof event.data === 'string' ? event.data : '');
      } catch {
        return; // bukan JSON / bukan jawapan kita
      }
      if (!msg || msg.id !== id) return;
      cleanup();
      // Mesej ralat CDP tidak dipulangkan (mungkin mengandungi data halaman).
      if (msg.error) reject(new AppError('cdp-failed'));
      else resolve(msg.result ?? {});
    };
    socket.addEventListener('message', onMessage);
    socket.addEventListener('close', onClose);
    socket.addEventListener('error', onClose);
    timer = setTimeout(() => fail('cdp-timeout'), timeoutMs);
    try {
      socket.send(JSON.stringify({ id, method, params }));
    } catch {
      fail('cdp-failed');
    }
  });
}

/**
 * Jalankan SATU arahan CDP tetap pada sasaran sesi milik sendiri, kemudian
 * tutup soket. Semua laluan ralat membersihkan pendengar dan soket.
 */
export async function runCdpCommand(browser, sessionId, targetId, method, params, { timeoutMs = CDP_TIMEOUT_MS, beforeSend = null } = {}) {
  assertAllowedCommand(method, params);
  return withCdpConnection(browser, sessionId, targetId, timeoutMs, async socket => {
    if (beforeSend) await beforeSend();
    return sendCommand(socket, method, params, timeoutMs);
  });
}

/** Exact fixed function + validated arguments. Remote object handles are scoped
 * to this single connection and are never persisted or sent on a second socket. */
export async function runPortalAction(browser, sessionId, targetId, action, account = null, { timeoutMs = CDP_TIMEOUT_MS, beforeSend = null } = {}) {
  const params = { objectId: 'pending', functionDeclaration: PORTAL_FUNCTION,
    arguments: [{ value: action }, { value: account }], returnByValue: true, awaitPromise: false };
  assertAllowedCommand('Runtime.callFunctionOn', params);
  return withCdpConnection(browser, sessionId, targetId, timeoutMs, async socket => {
    const global = await sendCommand(socket, 'Runtime.evaluate', { expression: 'globalThis', returnByValue: false }, timeoutMs, 1);
    const objectId = global?.result?.objectId;
    if (global?.exceptionDetails || typeof objectId !== 'string' || !objectId || objectId.length > 256) throw new AppError('cdp-failed');
    params.objectId = objectId;
    assertAllowedCommand('Runtime.callFunctionOn', params);
    if (beforeSend) await beforeSend();
    return sendCommand(socket, 'Runtime.callFunctionOn', params, timeoutMs, 2);
  });
}

async function withCdpConnection(browser, sessionId, targetId, timeoutMs, fn) {
  if (!browser || typeof browser.connectSession !== 'function') throw new AppError('browser-unavailable');
  let socket = null;
  try {
    const opts = targetId ? { targetId } : undefined;
    const connection = await withTimeout(browser.connectSession(sessionId, opts), timeoutMs);
    const upgrade = await withTimeout(
      connection.webSocket.fetch('https://browser-binding.invalid', { headers: { Upgrade: 'websocket' } }),
      timeoutMs
    );
    socket = upgrade && upgrade.webSocket;
    if (!socket) throw new AppError('cdp-failed');
    socket.accept();
    return await fn(socket);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('cdp-failed');
  } finally {
    if (socket) {
      try {
        socket.close();
      } catch {
        // abaikan
      }
    }
  }
}
