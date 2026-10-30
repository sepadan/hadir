import { SchoolSession } from './session.mjs';
import { AppError, isKnownCode } from './errors.mjs';
import { validateOwnerKey, deriveCsrfToken } from './crypto.mjs';
import { getSessionFromRequest, requireOwnerSession, validateStateChangingSecurity, handleAuthExchange, handleAuthLogout } from './auth.mjs';
import { applySecurityHeaders, errorResponse, htmlResponse, jsonResponse, parseJsonBody, readBoundedBody } from './http.mjs';
import { renderLockedHtml, renderAuthenticatedHtml, renderNotConfiguredHtml, renderStyleCss, renderAppJs } from './ui.mjs';
import { VERSION } from './version.mjs';

export { SchoolSession };

const BLOCKED_SENDING_PATHS = new Set(['/api/moeis/send', '/api/send', '/api/kehadiran/simpan', '/api/attendance/send']);

// Medan yang dibenarkan bagi setiap tindakan sesi (sempadan pertama; DO menyemak semula).
const SESSION_ACTIONS = Object.freeze({
  start: ['target'],
  navigate: ['target'],
  inspect: [],
  liveview: ['mode', 'manualConsent'],
  close: []
});

function isReadMethod(method) {
  return method === 'GET' || method === 'HEAD';
}

function ownerKeyConfigured(env) {
  try {
    validateOwnerKey(env.OWNER_KEY);
    return true;
  } catch {
    return false;
  }
}

function staticAsset(body, type, method) {
  const headers = new Headers({ 'Content-Type': type });
  applySecurityHeaders(headers, { cache: 'no-cache' });
  return new Response(method === 'HEAD' ? null : body, { status: 200, headers });
}

function sessionStub(env) {
  return env.SESSION.get(env.SESSION.idFromName('JBA5054'));
}

/** Terima respons DO; hanya kod ralat yang dikenali diteruskan. */
async function relayDo(res) {
  let data;
  try {
    data = await res.json();
  } catch {
    throw new AppError('internal');
  }
  if (res.ok && data && typeof data === 'object') return data;
  if (data && isKnownCode(data.code)) {
    throw new AppError(data.code, { status: res.status, retryAfterSec: data.retryAfterSec });
  }
  throw new AppError('internal');
}

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (BLOCKED_SENDING_PATHS.has(path)) throw new AppError('sending-blocked');

  if (path === '/health' && isReadMethod(method)) {
    return jsonResponse({ status: 'ok', version: VERSION, mode: 'cloud-phase1' });
  }
  if (path === '/style.css' && isReadMethod(method)) return staticAsset(renderStyleCss(), 'text/css; charset=utf-8', method);
  if (path === '/app.js' && isReadMethod(method)) return staticAsset(renderAppJs(), 'text/javascript; charset=utf-8', method);

  // Tiada kunci pemilik → terkunci 503 tanpa butiran.
  if (!ownerKeyConfigured(env)) {
    if (path === '/' && isReadMethod(method)) return htmlResponse(renderNotConfiguredHtml(), 503);
    throw new AppError('not-configured');
  }

  const body = method === 'POST' ? await readBoundedBody(request) : new Uint8Array(0);

  if (path === '/auth/exchange') {
    if (method !== 'POST') throw new AppError('method-not-allowed');
    return handleAuthExchange(request, env, body);
  }
  if (path === '/auth/logout') {
    if (method !== 'POST') throw new AppError('method-not-allowed');
    return handleAuthLogout(request, env);
  }

  if (path === '/' && isReadMethod(method)) {
    const session = await getSessionFromRequest(request, env);
    return htmlResponse(session ? renderAuthenticatedHtml() : renderLockedHtml());
  }

  if (path === '/api/status') {
    if (method !== 'GET') throw new AppError('method-not-allowed');
    const session = await requireOwnerSession(request, env);
    const data = await relayDo(await sessionStub(env).fetch('https://session-do/status'));
    const csrf = await deriveCsrfToken(env.OWNER_KEY, session.nonce);
    return jsonResponse({ ...data, csrf, version: VERSION, automaticSending: false });
  }

  if (path.startsWith('/api/session/')) {
    // GET/HEAD tidak pernah memulakan atau mengubah sesi.
    if (method !== 'POST') throw new AppError('method-not-allowed');
    const session = await requireOwnerSession(request, env);
    await validateStateChangingSecurity(request, env, session);
    const action = path.slice('/api/session/'.length);
    if (!Object.hasOwn(SESSION_ACTIONS, action)) throw new AppError('not-found');
    const fields = parseJsonBody(body, SESSION_ACTIONS[action]);
    const data = await relayDo(
      await sessionStub(env).fetch(`https://session-do/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields)
      })
    );
    return jsonResponse(data);
  }

  throw new AppError('not-found');
}

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (err) {
      return errorResponse(err);
    }
  }
};
