// Ujian endpoint pemulihan latch had kadar log masuk automatik (v1.11.22 Gap 5):
// tindakan pemilik TEMPATAN sahaja (nonce+loopback), TIDAK PERNAH tanpa
// pengesahan eksplisit, dan HANYA mengosongkan latch kegagalanBerturut — tiada
// tambahan belanjawan, tiada sentuhan kredensial.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulakanPelayanUjian, mintaMentah, NONCE_UJIAN } from './bantuan-server.mjs';

test('POST /api/lokal/had-kadar-tetapkan-semula TANPA sah:true -> 400, tindakan TIDAK dipanggil', async () => {
  const { pelayan, konteks, port } = await mulakanPelayanUjian();
  try {
    const r = await mintaMentah(port, {
      method: 'POST', laluan: '/api/lokal/had-kadar-tetapkan-semula',
      headers: { Origin: `http://127.0.0.1:${port}`, 'X-HADIR-Lokal': NONCE_UJIAN, 'Content-Type': 'application/json' },
      badan: '{}'
    });
    assert.equal(r.status, 400);
    assert.equal(konteks._tetapkanSemulaLatchPanggilan, 0, 'tindakan tidak boleh dipanggil tanpa pengesahan eksplisit');
  } finally { pelayan.close(); }
});

test('POST /api/lokal/had-kadar-tetapkan-semula dengan sah:true -> 200, tindakan dipanggil tepat sekali, status baharu dipulangkan', async () => {
  const { pelayan, konteks, port } = await mulakanPelayanUjian();
  try {
    const r = await mintaMentah(port, {
      method: 'POST', laluan: '/api/lokal/had-kadar-tetapkan-semula',
      headers: { Origin: `http://127.0.0.1:${port}`, 'X-HADIR-Lokal': NONCE_UJIAN, 'Content-Type': 'application/json' },
      badan: JSON.stringify({ sah: true })
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, true);
    assert.equal(konteks._tetapkanSemulaLatchPanggilan, 1);
    assert.equal(r.json.status.kegagalanBerturut, 0, 'status baharu (kegagalanBerturut dikosongkan) mesti dipulangkan');
  } finally { pelayan.close(); }
});

test('GET /api/lokal/had-kadar-tetapkan-semula -> 405 (POST sahaja)', async () => {
  const { pelayan, port } = await mulakanPelayanUjian();
  try {
    const r = await mintaMentah(port, {
      method: 'GET', laluan: '/api/lokal/had-kadar-tetapkan-semula',
      headers: { Origin: `http://127.0.0.1:${port}`, 'X-HADIR-Lokal': NONCE_UJIAN }
    });
    assert.equal(r.status, 405);
  } finally { pelayan.close(); }
});

test('POST /api/lokal/had-kadar-tetapkan-semula TANPA nonce -> 403 (hanya header sah)', async () => {
  const { pelayan, port } = await mulakanPelayanUjian();
  try {
    const r = await mintaMentah(port, {
      method: 'POST', laluan: '/api/lokal/had-kadar-tetapkan-semula',
      headers: { Origin: `http://127.0.0.1:${port}`, 'Content-Type': 'application/json' },
      badan: JSON.stringify({ sah: true })
    });
    assert.equal(r.status, 403);
  } finally { pelayan.close(); }
});

test('remote HADIR Admin (Origin sepadan.github.io) TIDAK boleh menyeru pemulihan latch had kadar', async () => {
  const { pelayan, konteks, port } = await mulakanPelayanUjian();
  try {
    const r = await mintaMentah(port, {
      method: 'POST', laluan: '/api/lokal/had-kadar-tetapkan-semula',
      headers: { Origin: 'https://sepadan.github.io', Authorization: 'Bearer x', 'Content-Type': 'application/json' },
      badan: JSON.stringify({ sah: true })
    });
    assert.equal(r.status, 403);
    assert.equal(konteks._tetapkanSemulaLatchPanggilan, 0);
  } finally { pelayan.close(); }
});
