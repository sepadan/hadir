import { AppError } from './errors.mjs';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function validateOwnerKey(key) {
  if (!key || typeof key !== 'string') {
    throw new AppError('not-configured', { status: 503, message: 'Owner key not configured' });
  }
  if (key.length < 32) {
    throw new AppError('not-configured', { status: 503, message: 'Owner key minimum 32 characters' });
  }
}

export function base64UrlEncode(bytes) {
  let base64;
  if (typeof Buffer !== 'undefined') {
    base64 = Buffer.from(bytes).toString('base64');
  } else {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    base64 = btoa(binary);
  }
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  } else {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}

async function getHmacKey(rawKey) {
  validateOwnerKey(rawKey);
  const keyBytes = textEncoder.encode(rawKey);
  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function hmacSign(keyStr, dataStr) {
  const key = await getHmacKey(keyStr);
  const dataBytes = textEncoder.encode(dataStr);
  const sigBuffer = await crypto.subtle.sign('HMAC', key, dataBytes);
  return base64UrlEncode(new Uint8Array(sigBuffer));
}

export async function hmacVerify(keyStr, dataStr, sigBase64Url) {
  const key = await getHmacKey(keyStr);
  const dataBytes = textEncoder.encode(dataStr);
  let sigBytes;
  try {
    sigBytes = base64UrlDecode(sigBase64Url);
  } catch {
    return false;
  }
  return crypto.subtle.verify('HMAC', key, sigBytes, dataBytes);
}

export async function mintOwnerTicket(ownerKey, payload) {
  validateOwnerKey(ownerKey);
  const fullPayload = {
    kind: 'owner-login',
    nonce: payload.nonce,
    iat: payload.iat || Math.floor(Date.now() / 1000),
    exp: payload.exp || Math.floor(Date.now() / 1000) + 90
  };
  const payloadStr = base64UrlEncode(textEncoder.encode(JSON.stringify(fullPayload)));
  const sig = await hmacSign(ownerKey, payloadStr);
  return `${payloadStr}.${sig}`;
}

export async function verifyOwnerTicket(ownerKey, ticketStr) {
  validateOwnerKey(ownerKey);
  if (typeof ticketStr !== 'string' || !ticketStr.includes('.')) {
    throw new AppError('ticket-malformed', { status: 400, message: 'Invalid ticket format' });
  }
  const parts = ticketStr.split('.');
  if (parts.length !== 2) {
    throw new AppError('ticket-malformed', { status: 400, message: 'Invalid ticket format' });
  }
  const [payloadStr, sigStr] = parts;

  const validSig = await hmacVerify(ownerKey, payloadStr, sigStr);
  if (!validSig) {
    throw new AppError('ticket-invalid', { status: 401, message: 'Invalid ticket signature' });
  }

  let payload;
  try {
    const jsonStr = textDecoder.decode(base64UrlDecode(payloadStr));
    payload = JSON.parse(jsonStr);
  } catch {
    throw new AppError('ticket-malformed', { status: 400, message: 'Malformed ticket payload' });
  }

  if (!payload || typeof payload !== 'object' || payload.kind !== 'owner-login') {
    throw new AppError('ticket-invalid', { status: 401, message: 'Invalid ticket kind' });
  }

  if (typeof payload.nonce !== 'string' || payload.nonce.length < 16) {
    throw new AppError('ticket-malformed', { status: 400, message: 'Nonce must be at least 16 characters' });
  }

  if (!Number.isInteger(payload.iat) || !Number.isInteger(payload.exp) || payload.exp <= payload.iat) {
    throw new AppError('ticket-malformed', { status: 400, message: 'Ticket iat/exp must be integers' });
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.iat > now + 5) {
    throw new AppError('ticket-invalid', { status: 401, message: 'Ticket issued in the future' });
  }

  if (payload.exp < now) {
    throw new AppError('ticket-invalid', { status: 401, message: 'Ticket expired' });
  }

  if (payload.exp > now + 120) {
    throw new AppError('ticket-invalid', { status: 401, message: 'Ticket expiry exceeds allowed window (max 120s)' });
  }

  return payload;
}

export async function mintSessionCookie(ownerKey, payload) {
  validateOwnerKey(ownerKey);
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    kind: 'owner-session',
    nonce: payload.nonce,
    iat: payload.iat || now,
    exp: payload.exp || now + 28800
  };
  const payloadStr = base64UrlEncode(textEncoder.encode(JSON.stringify(fullPayload)));
  const sig = await hmacSign(ownerKey, payloadStr);
  return `${payloadStr}.${sig}`;
}

export async function verifySessionCookie(ownerKey, cookieStr) {
  validateOwnerKey(ownerKey);
  if (typeof cookieStr !== 'string' || !cookieStr.includes('.')) {
    throw new AppError('unauthorized', { status: 401, message: 'Invalid session cookie format' });
  }
  const parts = cookieStr.split('.');
  if (parts.length !== 2) {
    throw new AppError('unauthorized', { status: 401, message: 'Invalid session cookie format' });
  }
  const [payloadStr, sigStr] = parts;

  const validSig = await hmacVerify(ownerKey, payloadStr, sigStr);
  if (!validSig) {
    throw new AppError('unauthorized', { status: 401, message: 'Invalid session signature' });
  }

  let payload;
  try {
    const jsonStr = textDecoder.decode(base64UrlDecode(payloadStr));
    payload = JSON.parse(jsonStr);
  } catch {
    throw new AppError('unauthorized', { status: 401, message: 'Malformed session payload' });
  }

  if (!payload || typeof payload !== 'object' || payload.kind !== 'owner-session') {
    throw new AppError('unauthorized', { status: 401, message: 'Invalid session kind' });
  }

  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(payload.exp) || payload.exp < now) {
    throw new AppError('unauthorized', { status: 401, message: 'Session expired' });
  }
  if (
    typeof payload.nonce !== 'string' || payload.nonce.length < 16 ||
    !Number.isInteger(payload.iat) || payload.iat > now + 5 || payload.exp - payload.iat > 28800
  ) {
    throw new AppError('unauthorized', { status: 401, message: 'Malformed session payload' });
  }

  return payload;
}

export async function deriveCsrfToken(ownerKey, sessionNonce) {
  validateOwnerKey(ownerKey);
  return hmacSign(ownerKey, `csrf:${sessionNonce}`);
}

export async function verifyCsrfToken(ownerKey, sessionNonce, providedCsrf) {
  if (!providedCsrf || typeof providedCsrf !== 'string') return false;
  try {
    const expected = await deriveCsrfToken(ownerKey, sessionNonce);
    // Constant time comparison
    if (expected.length !== providedCsrf.length) return false;
    let match = 0;
    for (let i = 0; i < expected.length; i++) {
      match |= expected.charCodeAt(i) ^ providedCsrf.charCodeAt(i);
    }
    return match === 0;
  } catch {
    return false;
  }
}
