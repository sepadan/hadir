import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.mjs';
import { SchoolSession } from '../src/session.mjs';
import { mintOwnerTicket, mintSessionCookie, deriveCsrfToken } from '../src/crypto.mjs';
import { FakeClock, FakeStorage, FakeBrowser } from './helpers/fakes.mjs';

const VALID_KEY = 'fixture-owner-key-0123456789abcdef0123456789abcdef'; // rekaan ujian sahaja
const ORIGIN = 'https://autohadir-skpr-cloud.example.workers.dev';

function createEnv(overrides = {}) {
  const clock = new FakeClock(Date.now());
  const storage = new FakeStorage();
  const browser = new FakeBrowser();
  let instance = null;
  const ctx = { storage, waitUntil() {} };
  const env = {
    OWNER_KEY: VALID_KEY,
    BROWSER: browser,
    SESSION: {
      idFromName(name) {
        assert.equal(name, 'JBA5054');
        return { name };
      },
      get() {
        return {
          fetch: async (url, init) => {
            if (!instance) instance = new SchoolSession(ctx, env, { now: clock.now });
            return instance.fetch(new Request(url, init));
          }
        };
      }
    },
    ...overrides
  };
  return { env, clock, storage, browser, evict: () => (instance = null) };
}

async function ownerHeaders(extra = {}) {
  const nonce = 'fixture-session-nonce-0001';
  const now = Math.floor(Date.now() / 1000);
  const cookie = await mintSessionCookie(VALID_KEY, { nonce, iat: now, exp: now + 3600 });
  const csrf = await deriveCsrfToken(VALID_KEY, nonce);
  return {
    Cookie: `__Host-autohadir=${cookie}`,
    Origin: ORIGIN,
    'X-Autohadir-CSRF': csrf,
    'Content-Type': 'application/json',
    ...extra
  };
}

async function post(env, path, body, headers) {
  return worker.fetch(
    new Request(`${ORIGIN}${path}`, {
      method: 'POST',
      headers: headers || (await ownerHeaders()),
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
    }),
    env
  );
}

function assertPrivateHeaders(res) {
  assert.match(res.headers.get('Cache-Control') || '', /no-store/);
  assert.equal(res.headers.get('Referrer-Policy'), 'no-referrer');
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(res.headers.get('X-Frame-Options'), 'DENY');
  assert.match(res.headers.get('Content-Security-Policy') || '', /frame-ancestors 'none'/);
}

describe('Penghala Worker', () => {
  let ctx;
  beforeEach(() => {
    ctx = createEnv();
  });

  it('GET /health: versi dan mod sahaja', async () => {
    const res = await worker.fetch(new Request(`${ORIGIN}/health`), ctx.env);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(Object.keys(body).sort(), ['mode', 'status', 'version']);
  });

  it('OWNER_KEY tiada / pendek: 503 terkunci tanpa butiran, bukan 500 tidak ditangkap', async () => {
    for (const key of [undefined, '', 'short']) {
      const { env } = createEnv({ OWNER_KEY: key });
      for (const [method, path] of [['GET', '/'], ['GET', '/api/status'], ['POST', '/auth/exchange'], ['POST', '/api/session/start']]) {
        const res = await worker.fetch(new Request(`${ORIGIN}${path}`, { method, body: method === 'POST' ? 'ticket=x' : undefined, headers: method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {} }), env);
        assert.equal(res.status, 503, `${method} ${path}`);
        assertPrivateHeaders(res);
        const text = await res.text();
        assert.ok(!/owner key|OWNER_KEY|minimum 32/i.test(text), 'tiada butiran konfigurasi');
      }
    }
  });

  it('GET / terkunci dengan pengepala keselamatan', async () => {
    const res = await worker.fetch(new Request(`${ORIGIN}/`), ctx.env);
    assert.equal(res.status, 200);
    assertPrivateHeaders(res);
    const html = await res.text();
    assert.match(html, /Panel Terkunci/);
    assert.match(html, /Perintis • Penghantaran automatik MATI/);
    const csp = res.headers.get('Content-Security-Policy');
    assert.ok(!csp.includes("'unsafe-inline'"));
  });

  it('404 dan ralat juga membawa pengepala peribadi', async () => {
    const res = await worker.fetch(new Request(`${ORIGIN}/tiada`), ctx.env);
    assert.equal(res.status, 404);
    assertPrivateHeaders(res);
  });

  it('badan strim berketul tanpa Content-Length melebihi 4 KiB: 413 dan pembaca dibatalkan', async () => {
    let cancelled = false;
    let pulls = 0;
    const stream = new ReadableStream({
      pull(controller) {
        pulls++;
        if (pulls > 100) return controller.close();
        controller.enqueue(new Uint8Array(1024).fill(120));
      },
      cancel() {
        cancelled = true;
      }
    });
    const req = new Request(`${ORIGIN}/api/session/start`, { method: 'POST', headers: await ownerHeaders(), body: stream, duplex: 'half' });
    const res = await worker.fetch(req, ctx.env);
    assert.equal(res.status, 413);
    assert.ok(cancelled, 'pembaca strim dibatalkan');
    assert.ok(pulls < 20, 'berhenti membaca selepas had');
    assert.equal(ctx.browser.remoteCallCount(), 0);
  });

  it('JSON rosak: 400 tanpa tindakan berbayar; badan kosong pada start guna idme lalai', async () => {
    const bad = await post(ctx.env, '/api/session/start', '{"target":');
    assert.equal(bad.status, 400);
    assert.equal(ctx.browser.remoteCallCount(), 0);
    const arr = await post(ctx.env, '/api/session/start', '[1,2]');
    assert.equal(arr.status, 400);
    const ok = await post(ctx.env, '/api/session/start', undefined);
    assert.equal(ok.status, 200);
    assert.equal(ctx.browser.callsOf('cdp:Page.navigate')[0].params.url, 'https://idme.moe.gov.my/login');
  });

  it('pintasan JSON bypassRateLimitGap ditolak; had kadar kekal 429', async () => {
    const start = await post(ctx.env, '/api/session/start', { target: 'control' });
    assert.equal(start.status, 200);
    const before = ctx.browser.remoteCallCount();
    const bypass = await post(ctx.env, '/api/session/inspect', { bypassRateLimitGap: true });
    assert.equal(bypass.status, 400);
    const bypassStart = await post(ctx.env, '/api/session/start', { target: 'control', bypassRateLimitGap: true });
    assert.equal(bypassStart.status, 400);
    const plain = await post(ctx.env, '/api/session/inspect', {});
    assert.equal(plain.status, 429);
    assert.equal(ctx.browser.remoteCallCount(), before);
  });

  it('DO juga menolak kunci tidak dikenali (sempadan kedua)', async () => {
    const stub = ctx.env.SESSION.get(ctx.env.SESSION.idFromName('JBA5054'));
    const res = await stub.fetch('https://session-do/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: 'control', bypassRateLimitGap: true })
    });
    assert.equal(res.status, 400);
    assert.equal(ctx.browser.remoteCallCount(), 0);
  });

  it('ralat hulu (JWT/token) tidak dipulangkan; kod aplikasi tepat dikekalkan', async () => {
    ctx.browser.acquireMode = 'throw';
    const res = await post(ctx.env, '/api/session/start', { target: 'idme' });
    assert.equal(res.status, 503);
    assertPrivateHeaders(res);
    const text = await res.text();
    assert.ok(!text.includes('fixture-secret'));
    assert.equal(JSON.parse(text).code, 'acquire-uncertain');
  });

  it('GET/HEAD pada laluan mutasi tidak memulakan sesi', async () => {
    for (const method of ['GET', 'HEAD']) {
      const res = await worker.fetch(new Request(`${ORIGIN}/api/session/start`, { method, headers: await ownerHeaders() }), ctx.env);
      assert.equal(res.status, 405);
    }
    assert.equal(ctx.browser.remoteCallCount(), 0);
  });

  it('status: tiada sid, tiada panggilan pelayar, automaticSending false', async () => {
    await post(ctx.env, '/api/session/start', { target: 'control' });
    const before = ctx.browser.remoteCallCount();
    const res = await worker.fetch(new Request(`${ORIGIN}/api/status`, { headers: await ownerHeaders() }), ctx.env);
    assert.equal(res.status, 200);
    assertPrivateHeaders(res);
    const body = await res.json();
    assert.equal(body.automaticSending, false);
    assert.ok(body.csrf);
    assert.ok(!JSON.stringify(body).includes('fixture-sid'));
    assert.equal(ctx.browser.remoteCallCount(), before);
  });

  it('respons tangkapan skrin no-store dan tanpa URL', async () => {
    await post(ctx.env, '/api/session/start', { target: 'control' });
    ctx.clock.advance(12000);
    const res = await post(ctx.env, '/api/session/liveview', { mode: 'readonly' });
    assert.equal(res.status, 200);
    assertPrivateHeaders(res);
    const body = await res.json();
    assert.equal(body.mode, 'snapshot');
    assert.equal(body.url, undefined);
  });

  it('pengusiran DO (instans baharu) mengekalkan jeda kadar', async () => {
    await post(ctx.env, '/api/session/start', { target: 'control' });
    ctx.evict();
    const res = await post(ctx.env, '/api/session/inspect', {});
    assert.equal(res.status, 429);
  });

  it('Origin hilang/silang dan CSRF hilang ditolak 403', async () => {
    const h = await ownerHeaders();
    const noOrigin = { ...h };
    delete noOrigin.Origin;
    const noCsrf = { ...h };
    delete noCsrf['X-Autohadir-CSRF'];
    for (const headers of [noOrigin, { ...h, Origin: 'https://evil.example' }, { ...h, Origin: 'null' }, noCsrf, { ...h, 'X-Autohadir-CSRF': 'x' }]) {
      const res = await post(ctx.env, '/api/session/start', { target: 'idme' }, headers);
      assert.equal(res.status, 403);
    }
    assert.equal(ctx.browser.remoteCallCount(), 0);
  });

  it('laluan penghantaran kehadiran disekat', async () => {
    for (const route of ['/api/moeis/send', '/api/send', '/api/kehadiran/simpan', '/api/attendance/send', '/api/session/send', '/api/session/simpan']) {
      const res = await post(ctx.env, route, {});
      assert.ok([404, 405].includes(res.status), route);
    }
    assert.equal(ctx.browser.remoteCallCount(), 0);
  });
});

describe('Pengesahan pemilik', () => {
  async function exchange(env, ticket) {
    return worker.fetch(
      new Request(`${ORIGIN}/auth/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ ticket }).toString()
      }),
      env
    );
  }

  async function freshTicket(nonce = 'fixture-launch-nonce-0001') {
    const now = Math.floor(Date.now() / 1000);
    return mintOwnerTicket(VALID_KEY, { nonce, iat: now, exp: now + 90 });
  }

  it('pertukaran: kuki __Host-, skrip nonce CSP, tiket tidak dipantulkan', async () => {
    const { env } = createEnv();
    const ticket = await freshTicket();
    const res = await exchange(env, ticket);
    assert.equal(res.status, 200);
    assertPrivateHeaders(res);
    const cookie = res.headers.get('Set-Cookie');
    assert.match(cookie, /^__Host-autohadir=/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Strict/);
    assert.match(cookie, /Path=\//);
    const html = await res.text();
    assert.ok(!html.includes(ticket));
    const m = html.match(/<script nonce="([^"]+)">/);
    assert.ok(m);
    assert.ok(res.headers.get('Content-Security-Policy').includes(`'nonce-${m[1]}'`));
  });

  it('ulangan tiket ditolak 409', async () => {
    const { env } = createEnv();
    const ticket = await freshTicket('fixture-replay-nonce-0001');
    assert.equal((await exchange(env, ticket)).status, 200);
    assert.equal((await exchange(env, ticket)).status, 409);
  });

  it('pertukaran serentak tiket sama: tepat satu berjaya', async () => {
    const { env } = createEnv();
    const ticket = await freshTicket('fixture-concurrent-nonce-01');
    const results = await Promise.all([exchange(env, ticket), exchange(env, ticket), exchange(env, ticket)]);
    assert.equal(results.filter((r) => r.status === 200).length, 1);
  });

  it('tiket rosak / jenis sesi digunakan sebagai tiket ditolak tanpa 500', async () => {
    const { env } = createEnv();
    const now = Math.floor(Date.now() / 1000);
    const sessionCookie = await mintSessionCookie(VALID_KEY, { nonce: 'fixture-nonce-xxxxxxxx', iat: now, exp: now + 60 });
    for (const t of ['', 'a.b.c', '%%%.%%%', sessionCookie, 'x'.repeat(3000)]) {
      const res = await exchange(env, t);
      assert.ok([400, 401].includes(res.status), `status ${res.status} untuk ${t.slice(0, 10)}`);
    }
    const json = await worker.fetch(
      new Request(`${ORIGIN}/auth/exchange`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
      env
    );
    assert.equal(json.status, 415);
  });

  it('logout memerlukan CSRF dan mengosongkan kuki', async () => {
    const { env } = createEnv();
    const h = await ownerHeaders();
    delete h['X-Autohadir-CSRF'];
    assert.equal((await post(env, '/auth/logout', undefined, h)).status, 403);
    const res = await post(env, '/auth/logout', undefined);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('Set-Cookie'), /Max-Age=0/);
  });
});
