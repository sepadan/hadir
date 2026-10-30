import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mintOwnerTicket,
  verifyOwnerTicket,
  mintSessionCookie,
  verifySessionCookie,
  deriveCsrfToken,
  verifyCsrfToken,
  validateOwnerKey
} from '../src/crypto.mjs';

const VALID_KEY = '0123456789012345678901234567890123456789'; // 40 chars > 32
const SHORT_KEY = 'short-key-under-32';

describe('Owner Key Validation', () => {
  it('rejects missing or empty key', () => {
    assert.throws(() => validateOwnerKey(null), /Owner key not configured/);
    assert.throws(() => validateOwnerKey(''), /Owner key not configured/);
  });

  it('rejects key shorter than 32 characters', () => {
    assert.throws(() => validateOwnerKey(SHORT_KEY), /Owner key minimum 32 characters/);
  });

  it('accepts key of 32+ characters', () => {
    assert.doesNotThrow(() => validateOwnerKey(VALID_KEY));
  });
});

describe('Owner Launch Ticket', () => {
  it('mints and verifies a valid owner-login ticket', async () => {
    const ticket = await mintOwnerTicket(VALID_KEY, {
      nonce: 'nonce-1234567890abcdef',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 90
    });

    assert.equal(typeof ticket, 'string');
    assert.match(ticket, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

    const verified = await verifyOwnerTicket(VALID_KEY, ticket);
    assert.equal(verified.kind, 'owner-login');
    assert.equal(verified.nonce, 'nonce-1234567890abcdef');
  });

  it('rejects tampered ticket signature', async () => {
    const ticket = await mintOwnerTicket(VALID_KEY, {
      nonce: 'nonce-1234567890abcdef',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 90
    });
    const [payload] = ticket.split('.');
    const fakeSignature = 'bm90LWEtdmFsaWQtc2lnbmF0dXJl';
    await assert.rejects(
      () => verifyOwnerTicket(VALID_KEY, `${payload}.${fakeSignature}`),
      /Invalid ticket signature/
    );
  });

  it('rejects tampered ticket payload', async () => {
    const ticket = await mintOwnerTicket(VALID_KEY, {
      nonce: 'nonce-1234567890abcdef',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 90
    });
    const [, sig] = ticket.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({
      kind: 'owner-login',
      nonce: 'nonce-different-tampered',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 90
    })).toString('base64url');

    await assert.rejects(
      () => verifyOwnerTicket(VALID_KEY, `${tamperedPayload}.${sig}`),
      /Invalid ticket signature/
    );
  });

  it('rejects expired ticket', async () => {
    const now = Math.floor(Date.now() / 1000);
    const ticket = await mintOwnerTicket(VALID_KEY, {
      nonce: 'nonce-1234567890abcdef',
      iat: now - 120,
      exp: now - 10
    });
    await assert.rejects(
      () => verifyOwnerTicket(VALID_KEY, ticket),
      /Ticket expired/
    );
  });

  it('rejects ticket with exp exceeding now + 120', async () => {
    const now = Math.floor(Date.now() / 1000);
    const ticket = await mintOwnerTicket(VALID_KEY, {
      nonce: 'nonce-1234567890abcdef',
      iat: now,
      exp: now + 300 // too long
    });
    await assert.rejects(
      () => verifyOwnerTicket(VALID_KEY, ticket),
      /Ticket expiry exceeds allowed window/
    );
  });

  it('rejects ticket with future iat', async () => {
    const now = Math.floor(Date.now() / 1000);
    const ticket = await mintOwnerTicket(VALID_KEY, {
      nonce: 'nonce-1234567890abcdef',
      iat: now + 60, // future
      exp: now + 100
    });
    await assert.rejects(
      () => verifyOwnerTicket(VALID_KEY, ticket),
      /Ticket issued in the future/
    );
  });

  it('rejects nonce shorter than 16 characters', async () => {
    const now = Math.floor(Date.now() / 1000);
    const ticket = await mintOwnerTicket(VALID_KEY, {
      nonce: 'short-nonce',
      iat: now,
      exp: now + 90
    });
    await assert.rejects(
      () => verifyOwnerTicket(VALID_KEY, ticket),
      /Nonce must be at least 16 characters/
    );
  });

  it('rejects wrong kind (e.g. session token presented as login ticket)', async () => {
    const now = Math.floor(Date.now() / 1000);
    const ticket = await mintSessionCookie(VALID_KEY, {
      nonce: 'nonce-1234567890abcdef',
      iat: now,
      exp: now + 90
    });
    await assert.rejects(
      () => verifyOwnerTicket(VALID_KEY, ticket),
      /Invalid ticket kind/
    );
  });
});

describe('Owner Session Cookie', () => {
  it('mints and verifies valid owner-session cookie', async () => {
    const now = Math.floor(Date.now() / 1000);
    const cookie = await mintSessionCookie(VALID_KEY, {
      nonce: 'session-nonce-1234567890',
      iat: now,
      exp: now + 28800
    });

    const session = await verifySessionCookie(VALID_KEY, cookie);
    assert.equal(session.kind, 'owner-session');
    assert.equal(session.nonce, 'session-nonce-1234567890');
  });

  it('rejects login ticket presented as session cookie', async () => {
    const now = Math.floor(Date.now() / 1000);
    const ticket = await mintOwnerTicket(VALID_KEY, {
      nonce: 'ticket-nonce-1234567890',
      iat: now,
      exp: now + 90
    });
    await assert.rejects(
      () => verifySessionCookie(VALID_KEY, ticket),
      /Invalid session kind/
    );
  });

  it('rejects expired session cookie', async () => {
    const now = Math.floor(Date.now() / 1000);
    const cookie = await mintSessionCookie(VALID_KEY, {
      nonce: 'session-nonce-1234567890',
      iat: now - 30000,
      exp: now - 100
    });
    await assert.rejects(
      () => verifySessionCookie(VALID_KEY, cookie),
      /Session expired/
    );
  });
});

describe('CSRF Token Derivation and Verification', () => {
  it('derives and verifies matching CSRF token for a session nonce', async () => {
    const nonce = 'session-nonce-abcdef123456';
    const csrf = await deriveCsrfToken(VALID_KEY, nonce);
    assert.equal(typeof csrf, 'string');
    assert.ok(csrf.length >= 32);

    const valid = await verifyCsrfToken(VALID_KEY, nonce, csrf);
    assert.equal(valid, true);

    const invalid = await verifyCsrfToken(VALID_KEY, nonce, 'tampered-csrf-token');
    assert.equal(invalid, false);

    const wrongNonce = await verifyCsrfToken(VALID_KEY, 'different-session-nonce', csrf);
    assert.equal(wrongNonce, false);
  });
});
