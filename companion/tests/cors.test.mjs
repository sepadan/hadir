import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulakanPelayanUjian, mintaMentah, TOKEN_SAH } from './bantuan-server.mjs';

let pelayan, port;
test.before(async () => { ({ pelayan, port } = await mulakanPelayanUjian()); });
test.after(() => pelayan.close());

test('Host palsu ditolak 403', async () => {
  const r = await mintaMentah(port, { laluan: '/api/status', host: 'evil.com:80', headers: { Authorization: `Bearer ${TOKEN_SAH}` } });
  assert.equal(r.status, 403);
});

test('Origin tidak dibenarkan -> 403 tanpa header ACAO', async () => {
  const r = await mintaMentah(port, {
    laluan: '/api/status',
    headers: { Origin: 'https://penipu.invalid', Authorization: `Bearer ${TOKEN_SAH}` }
  });
  assert.equal(r.status, 403);
  assert.equal(r.headers['access-control-allow-origin'], undefined);
});

test('Origin dibenarkan -> ACAO tepat + Vary: Origin', async () => {
  const r = await mintaMentah(port, {
    laluan: '/api/status',
    headers: { Origin: 'https://sepadan.github.io', Authorization: `Bearer ${TOKEN_SAH}` }
  });
  assert.equal(r.status, 200);
  assert.equal(r.headers['access-control-allow-origin'], 'https://sepadan.github.io');
  assert.equal(r.headers['vary'], 'Origin');
});

test('preflight OPTIONS -> header betul + Access-Control-Allow-Private-Network', async () => {
  const r = await mintaMentah(port, { method: 'OPTIONS', laluan: '/api/status', headers: { Origin: 'https://sepadan.github.io' } });
  assert.equal(r.status, 204);
  assert.equal(r.headers['access-control-allow-origin'], 'https://sepadan.github.io');
  assert.equal(r.headers['access-control-allow-private-network'], 'true');
  assert.match(r.headers['access-control-allow-headers'] || '', /x-hadir-lokal/);
});

test('preflight dengan Origin tidak dibenarkan -> 403', async () => {
  const r = await mintaMentah(port, { method: 'OPTIONS', laluan: '/api/status', headers: { Origin: 'https://penipu.invalid' } });
  assert.equal(r.status, 403);
});

test('tiada header CORS mengandungi wildcard *', async () => {
  const respons = await Promise.all([
    mintaMentah(port, { laluan: '/api/status', headers: { Origin: 'https://sepadan.github.io', Authorization: `Bearer ${TOKEN_SAH}` } }),
    mintaMentah(port, { method: 'OPTIONS', laluan: '/api/status', headers: { Origin: 'https://sepadan.github.io' } })
  ]);
  for (const r of respons) {
    for (const [k, v] of Object.entries(r.headers)) {
      if (k.toLowerCase().startsWith('access-control-')) assert.ok(!String(v).includes('*'), `${k}: ${v} tidak boleh mengandungi *`);
    }
  }
});

test('permintaan tanpa Origin dan tanpa nonce/token -> 403', async () => {
  const r = await mintaMentah(port, { laluan: '/api/status' });
  assert.equal(r.status, 403);
});
