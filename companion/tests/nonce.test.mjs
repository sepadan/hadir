// Ujian F1: UI tetapan tempatan (GET / dan GET /lokal.js) mesti boleh
// diakses melalui nonce header ATAU parameter query ?n=; laluan yang
// mengubah keadaan (POST /api/lokal/*) kekal header sahaja.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulakanPelayanUjian, mintaMentah, NONCE_UJIAN } from './bantuan-server.mjs';

let pelayan, port;
test.before(async () => { ({ pelayan, port } = await mulakanPelayanUjian()); });
test.after(() => pelayan.close());

test('GET /?n=<nonce betul> -> 200', async () => {
  const r = await mintaMentah(port, { laluan: '/?n=' + NONCE_UJIAN });
  assert.equal(r.status, 200);
  assert.match(r.teks, /<html/i);
});

test('GET /lokal.js?n=<nonce betul> -> 200', async () => {
  const r = await mintaMentah(port, { laluan: '/lokal.js?n=' + NONCE_UJIAN });
  assert.equal(r.status, 200);
});

test('GET / tanpa nonce -> 403', async () => {
  const r = await mintaMentah(port, { laluan: '/' });
  assert.equal(r.status, 403);
});

test('GET /?n=<salah> -> 403', async () => {
  const r = await mintaMentah(port, { laluan: '/?n=salah-sama-sekali' });
  assert.equal(r.status, 403);
});

test('GET /lokal.js tanpa nonce -> 403', async () => {
  const r = await mintaMentah(port, { laluan: '/lokal.js' });
  assert.equal(r.status, 403);
});

test('GET / dengan header X-HADIR-Lokal sah (tanpa query) -> 200 juga diterima', async () => {
  const r = await mintaMentah(port, { laluan: '/', headers: { 'X-HADIR-Lokal': NONCE_UJIAN } });
  assert.equal(r.status, 200);
});

test('POST /api/lokal/rahsia dengan ?n= sahaja (tiada header) -> 403', async () => {
  const r = await mintaMentah(port, {
    method: 'POST', laluan: '/api/lokal/rahsia?n=' + NONCE_UJIAN,
    headers: { 'Content-Type': 'application/json' }, badan: JSON.stringify({ rahsiaEnjin: 'x' })
  });
  assert.equal(r.status, 403);
});

test('POST /api/lokal/rahsia dengan header X-HADIR-Lokal sah -> 200', async () => {
  const r = await mintaMentah(port, {
    method: 'POST', laluan: '/api/lokal/rahsia',
    headers: { 'X-HADIR-Lokal': NONCE_UJIAN, 'Content-Type': 'application/json' },
    badan: JSON.stringify({ rahsiaEnjin: 'x' })
  });
  assert.equal(r.status, 200);
});

test('GET /api/lokal/status dengan ?n= sahaja (tiada header) -> 403', async () => {
  const r = await mintaMentah(port, { laluan: '/api/lokal/status?n=' + NONCE_UJIAN });
  assert.equal(r.status, 403);
});

test('GET /api/lokal/status dengan header sah -> 200 dan tiada senarai klien/log mentah', async () => {
  const r = await mintaMentah(port, { laluan: '/api/lokal/status', headers: { 'X-HADIR-Lokal': NONCE_UJIAN } });
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.pasangan, undefined);
  assert.equal(r.json.log, undefined);
});
