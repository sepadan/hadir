// Ujian regresi bagi pepijat nyata (18 Sep 2026): UI tempatan companion tidak
// boleh menyimpan apa-apa dalam pelayar sebenar kerana semakan Origin menolak
// origin loopback pelayan itu sendiri SEBELUM semakan nonce.
//
// Punca: pelayar menghantar `Origin: http://127.0.0.1:<port>` pada setiap POST
// UI tempatan, dan header `X-HADIR-Lokal` mencetuskan preflight CORS. Ujian
// lama terlepas kerana `fetch` Node tidak menghantar header Origin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulakanPelayanUjian, mintaMentah, NONCE_UJIAN } from './bantuan-server.mjs';

let pelayan, port, asalLokal;

test.before(async () => {
  ({ pelayan, port } = await mulakanPelayanUjian());
  asalLokal = `http://127.0.0.1:${port}`;
});
test.after(() => pelayan.close());

test('[pepijat UI tempatan] preflight OPTIONS dengan Origin loopback -> 204', async () => {
  const r = await mintaMentah(port, {
    method: 'OPTIONS',
    laluan: '/api/lokal/kod-pasangan',
    headers: {
      Origin: asalLokal,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'x-hadir-lokal'
    }
  });
  assert.equal(r.status, 204);
  assert.equal(r.headers['access-control-allow-origin'], asalLokal);
});

test('[pepijat UI tempatan] POST dengan Origin loopback + nonce sah -> bukan 403', async () => {
  const r = await mintaMentah(port, {
    method: 'POST',
    laluan: '/api/lokal/kod-pasangan',
    headers: { Origin: asalLokal, 'X-HADIR-Lokal': NONCE_UJIAN, 'Content-Type': 'application/json' },
    badan: '{}'
  });
  assert.notEqual(r.status, 403);
  assert.equal(r.status, 200);
});

test('Origin loopback TANPA nonce tetap ditolak -> 403', async () => {
  const r = await mintaMentah(port, {
    method: 'POST',
    laluan: '/api/lokal/kod-pasangan',
    headers: { Origin: asalLokal, 'Content-Type': 'application/json' },
    badan: '{}'
  });
  assert.equal(r.status, 403);
});

test('Origin loopback tidak memberi kuasa pada laluan BUKAN tempatan -> 403', async () => {
  const r = await mintaMentah(port, { laluan: '/api/status', headers: { Origin: asalLokal } });
  assert.equal(r.status, 403);
});

test('Origin asing pada laluan tempatan -> 403', async () => {
  const r = await mintaMentah(port, {
    method: 'POST',
    laluan: '/api/lokal/rahsia',
    headers: { Origin: 'https://jahat.invalid', 'X-HADIR-Lokal': NONCE_UJIAN, 'Content-Type': 'application/json' },
    badan: '{}'
  });
  assert.equal(r.status, 403);
});

test('Origin loopback dengan port berbeza -> 403', async () => {
  const r = await mintaMentah(port, {
    method: 'POST',
    laluan: '/api/lokal/kod-pasangan',
    headers: { Origin: 'http://127.0.0.1:1', 'X-HADIR-Lokal': NONCE_UJIAN, 'Content-Type': 'application/json' },
    badan: '{}'
  });
  assert.equal(r.status, 403);
});

// Pepijat nyata (18 Sep 2026): butang "Buka tetapan tempatan" dalam HADIR Admin
// membuka "/" TANPA nonce, jadi guru nampak "Access to 127.0.0.1 was denied".
// Halaman HADIR tidak boleh membaca nonce (asal berbeza); penyelesaiannya ialah
// alihan 302 ke URL bernonce, hanya apabila Referer ialah laman HADIR.
test('[pepijat butang tetapan] GET / tanpa nonce, Referer HADIR -> 302 ke URL bernonce', async () => {
  const r = await mintaMentah(port, {
    laluan: '/',
    headers: { Referer: 'https://sepadan.github.io/hadir/' }
  });
  assert.equal(r.status, 302);
  assert.equal(r.headers.location, '/?n=' + encodeURIComponent(NONCE_UJIAN));
});

test('GET / tanpa nonce dan tanpa Referer -> 403 (tiada alihan)', async () => {
  const r = await mintaMentah(port, { laluan: '/' });
  assert.equal(r.status, 403);
});

test('GET / tanpa nonce dengan Referer asing -> 403 (Referer tidak boleh dipalsukan)', async () => {
  const r = await mintaMentah(port, {
    laluan: '/',
    headers: { Referer: 'https://jahat.invalid/hadir/' }
  });
  assert.equal(r.status, 403);
});

test('GET / dengan nonce sah tetap dihidangkan 200 (tiada regresi)', async () => {
  const r = await mintaMentah(port, { laluan: '/?n=' + encodeURIComponent(NONCE_UJIAN) });
  assert.equal(r.status, 200);
});
