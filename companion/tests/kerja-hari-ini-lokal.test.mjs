// Ujian endpoint baca-sahaja /api/lokal/kerja-hari-ini (nonce sahaja).
// Endpoint ini menyediakan senarai tugasan DISENSOR kepada proses tempatan
// yang dipercayai (aplikasi desktop) TANPA token Bearer pasangan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulakanPelayanUjian, mintaMentah, NONCE_UJIAN } from './bantuan-server.mjs';

const SENARAI_SAH = [
  { id: 'k1', kelas: 'TAHUN 5', tarikhIso: '2026-09-22', status: 'menunggu', mesej: 'x', diciptaEpochMs: 1, bilTidakHadir: 0 }
];

test('kerja-hari-ini: nonce sah memulangkan senarai disensor (tiada rahsia)', async () => {
  const { pelayan, port } = await mulakanPelayanUjian({
    kerjaSenaraiDisensor: async () => SENARAI_SAH
  });
  try {
    const r = await mintaMentah(port, {
      laluan: '/api/lokal/kerja-hari-ini',
      headers: { 'X-HADIR-Lokal': NONCE_UJIAN }
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, true);
    assert.deepEqual(r.json.senarai, SENARAI_SAH);
    // tiada rahsia enjin / token / kredensial terdedah
    assert.ok(!r.teks.includes('rahsia-ujian'));
    assert.ok(!r.teks.includes('token-ujian-sah'));
  } finally {
    await new Promise((s) => pelayan.close(s));
  }
});

test('kerja-hari-ini: tanpa nonce -> 403', async () => {
  const { pelayan, port } = await mulakanPelayanUjian({
    kerjaSenaraiDisensor: async () => SENARAI_SAH
  });
  try {
    const r = await mintaMentah(port, { laluan: '/api/lokal/kerja-hari-ini' });
    assert.equal(r.status, 403);
  } finally {
    await new Promise((s) => pelayan.close(s));
  }
});

test('kerja-hari-ini: kaedah bukan GET -> 405', async () => {
  const { pelayan, port } = await mulakanPelayanUjian({
    kerjaSenaraiDisensor: async () => SENARAI_SAH
  });
  try {
    const r = await mintaMentah(port, {
      method: 'POST', laluan: '/api/lokal/kerja-hari-ini',
      headers: { 'X-HADIR-Lokal': NONCE_UJIAN }
    });
    assert.equal(r.status, 405);
  } finally {
    await new Promise((s) => pelayan.close(s));
  }
});

test('kerja-hari-ini: tiada rahsia enjin -> senarai kosong dengan nota', async () => {
  const { pelayan, port } = await mulakanPelayanUjian({
    simpanan: { adaRahsiaEnjin: () => false, simpanRahsiaEnjin: () => {}, dapatkanRahsiaEnjin: () => 'rahsia-ujian' },
    kerjaSenaraiDisensor: async () => SENARAI_SAH
  });
  try {
    const r = await mintaMentah(port, {
      laluan: '/api/lokal/kerja-hari-ini',
      headers: { 'X-HADIR-Lokal': NONCE_UJIAN }
    });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.senarai, []);
    assert.ok(r.json.nota);
  } finally {
    await new Promise((s) => pelayan.close(s));
  }
});
