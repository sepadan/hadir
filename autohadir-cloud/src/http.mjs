import { AppError, toSafeError } from './errors.mjs';

export const MAX_BODY_BYTES = 4096;

export const PAGE_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
export const API_CSP = "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/** Pengepala keselamatan untuk SETIAP respons (termasuk ralat dan 404). */
export function applySecurityHeaders(headers, { csp = API_CSP, cache = 'no-store' } = {}) {
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  if (!headers.has('Content-Security-Policy')) headers.set('Content-Security-Policy', csp);
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', cache);
  return headers;
}

export function jsonResponse(data, status = 200, extra = {}) {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', ...extra });
  applySecurityHeaders(headers);
  return new Response(JSON.stringify(data), { status, headers });
}

export function htmlResponse(html, status = 200, { csp = PAGE_CSP, extra = {} } = {}) {
  const headers = new Headers({ 'Content-Type': 'text/html; charset=utf-8', ...extra });
  applySecurityHeaders(headers, { csp });
  return new Response(html, { status, headers });
}

export function errorResponse(err) {
  const { status, ...payload } = toSafeError(err);
  const extra = {};
  if (payload.retryAfterSec) extra['Retry-After'] = String(payload.retryAfterSec);
  if (status === 405) extra.Allow = 'POST';
  return jsonResponse({ ok: false, ...payload }, status, extra);
}

/**
 * Baca badan berdasarkan bait SEBENAR (bukan Content-Length sahaja).
 * Melebihi had → batalkan pembaca dan 413.
 */
export async function readBoundedBody(request, limit = MAX_BODY_BYTES) {
  const declared = request.headers.get('Content-Length');
  if (declared !== null && Number(declared) > limit) {
    try {
      await request.body?.cancel();
    } catch {
      // abaikan
    }
    throw new AppError('payload-too-large');
  }
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        try {
          await reader.cancel();
        } catch {
          // abaikan
        }
        throw new AppError('payload-too-large');
      }
      chunks.push(value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // abaikan
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

const decoder = new TextDecoder('utf-8', { fatal: true });

export function decodeUtf8(bytes) {
  try {
    return decoder.decode(bytes);
  } catch {
    throw new AppError('invalid-request');
  }
}

/**
 * JSON ketat: kosong → {}; mesti objek biasa; kunci di luar senarai → 400.
 * Digunakan di Worker DAN di DO (dua sempadan).
 */
export function parseJsonBody(bytes, allowedFields) {
  const text = decodeUtf8(bytes).trim();
  if (!text) return {};
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new AppError('invalid-json');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError('invalid-request');
  for (const key of Object.keys(value)) if (!allowedFields.includes(key)) throw new AppError('unknown-field');
  const out = {};
  for (const key of allowedFields) if (Object.hasOwn(value, key)) out[key] = value[key];
  return out;
}
