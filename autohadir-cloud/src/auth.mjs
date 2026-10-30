import { AppError, isKnownCode } from './errors.mjs';
import { verifyOwnerTicket, mintSessionCookie, verifySessionCookie, verifyCsrfToken } from './crypto.mjs';
import { decodeUtf8, htmlResponse, jsonResponse } from './http.mjs';

export const COOKIE_NAME = '__Host-autohadir';
export const SESSION_TTL_S = 28800; // 8 jam
const TICKET_RE = /^[A-Za-z0-9_-]{16,1024}\.[A-Za-z0-9_-]{16,128}$/;

export function parseCookies(request) {
  const header = request.headers.get('Cookie');
  const cookies = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const name = part.slice(0, idx).trim();
    if (!Object.hasOwn(cookies, name)) cookies[name] = part.slice(idx + 1).trim();
  }
  return cookies;
}

export async function getSessionFromRequest(request, env) {
  const value = parseCookies(request)[COOKIE_NAME];
  if (!value || value.length > 1024) return null;
  try {
    return await verifySessionCookie(env.OWNER_KEY, value);
  } catch {
    return null;
  }
}

export async function requireOwnerSession(request, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) throw new AppError('unauthorized');
  return session;
}

/** Origin sama-asal TEPAT + token CSRF per-sesi. */
export async function validateStateChangingSecurity(request, env, session) {
  const origin = request.headers.get('Origin');
  if (!origin || origin !== new URL(request.url).origin) throw new AppError('forbidden-origin');
  const csrf = request.headers.get('X-Autohadir-CSRF');
  if (!(await verifyCsrfToken(env.OWNER_KEY, session.nonce, csrf))) throw new AppError('csrf-invalid');
}

function randomHex(bytes) {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function handleAuthExchange(request, env, bodyBytes) {
  const type = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/x-www-form-urlencoded') throw new AppError('unsupported-media-type');
  const params = new URLSearchParams(decodeUtf8(bodyBytes));
  const tickets = params.getAll('ticket');
  if (tickets.length !== 1 || !TICKET_RE.test(tickets[0])) throw new AppError('ticket-malformed');

  let payload;
  try {
    payload = await verifyOwnerTicket(env.OWNER_KEY, tickets[0]);
  } catch (err) {
    if (err instanceof AppError && (err.code === 'ticket-malformed' || err.code === 'ticket-invalid')) {
      throw new AppError(err.code);
    }
    throw new AppError('ticket-invalid');
  }

  // Tuntut nonce secara atomik dalam DO singleton.
  const stub = env.SESSION.get(env.SESSION.idFromName('JBA5054'));
  const claim = await stub.fetch('https://session-do/claim-nonce', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nonce: payload.nonce, exp: payload.exp })
  });
  if (!claim.ok) {
    const data = await claim.json().catch(() => ({}));
    throw new AppError(isKnownCode(data.code) ? data.code : 'internal');
  }

  const now = Math.floor(Date.now() / 1000);
  const cookie = await mintSessionCookie(env.OWNER_KEY, { nonce: randomHex(16), iat: now, exp: now + SESSION_TTL_S });
  const scriptNonce = randomHex(16);
  const html = `<!DOCTYPE html>
<html lang="ms"><head><meta charset="utf-8"><title>Autohadir Cloud</title>
<script nonce="${scriptNonce}">location.replace('/');</script>
</head><body><p>Pengesahan berjaya. Membuka panel…</p></body></html>`;
  return htmlResponse(html, 200, {
    csp: `default-src 'none'; script-src 'nonce-${scriptNonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    extra: { 'Set-Cookie': `${COOKIE_NAME}=${cookie}; Path=/; Max-Age=${SESSION_TTL_S}; HttpOnly; Secure; SameSite=Strict` }
  });
}

export async function handleAuthLogout(request, env) {
  const session = await requireOwnerSession(request, env);
  await validateStateChangingSecurity(request, env, session);
  return jsonResponse({ ok: true }, 200, {
    'Set-Cookie': `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`
  });
}
