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
//
// Percubaan pertama (semakan Referer) GAGAL dalam pelayar sebenar: log [req]
// companion menunjukkan `referer=-` kerana pelayar membuang Referer apabila
// halaman HTTPS menuju ke HTTP. Penyelesaian muktamad: "/" tanpa nonce sentiasa
// dialihkan ke URL bernonce. Halaman pembuka tidak boleh membaca URL/kandungan
// tetingkap 127.0.0.1 (asal berbeza), dan setiap /api/lokal/* masih wajib
// membawa header X-HADIR-Lokal bernonce.
test('[pepijat butang tetapan] GET / tanpa nonce -> 302 ke URL bernonce', async () => {
  const r = await mintaMentah(port, {
    laluan: '/',
    headers: { Referer: 'https://sepadan.github.io/hadir/' }
  });
  assert.equal(r.status, 302);
  assert.equal(r.headers.location, '/?n=' + encodeURIComponent(NONCE_UJIAN));
  assert.equal(r.headers['cache-control'], 'no-store');
});

test('GET / tanpa nonce dan TANPA Referer -> tetap 302 (pelayar buang Referer HTTPS->HTTP)', async () => {
  const r = await mintaMentah(port, { laluan: '/' });
  assert.equal(r.status, 302);
  assert.equal(r.headers.location, '/?n=' + encodeURIComponent(NONCE_UJIAN));
});

test('GET / tanpa nonce, Sec-Fetch-Site: cross-site -> 302 (halaman pembuka tetap tidak boleh baca nonce)', async () => {
  const r = await mintaMentah(port, { laluan: '/', headers: { 'Sec-Fetch-Site': 'cross-site' } });
  assert.equal(r.status, 302);
});

test('GET / tanpa nonce dengan Referer asing -> tetap 302, bukan 403', async () => {
  const r = await mintaMentah(port, {
    laluan: '/',
    headers: { Referer: 'https://jahat.invalid/hadir/' }
  });
  assert.equal(r.status, 302);
});

test('GET /lokal.js TANPA nonce -> 403 (hanya halaman / yang dialihkan)', async () => {
  const r = await mintaMentah(port, { laluan: '/lokal.js' });
  assert.equal(r.status, 403);
});

test('GET / dengan nonce sah -> 200, no-store dan tidak boleh dibingkaikan', async () => {
  const r = await mintaMentah(port, { laluan: '/?n=' + encodeURIComponent(NONCE_UJIAN) });
  assert.equal(r.status, 200);
  assert.equal(r.headers['x-frame-options'], 'DENY');
  assert.match(String(r.headers['content-security-policy'] || ''), /frame-ancestors 'none'/);
});
