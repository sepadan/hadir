// Ujian endpoint baca-sahaja /api/lokal/kerja-penuh (nonce sahaja).
// Endpoint ini menyediakan senarai tugasan PENUH (murid + kategori + sebab)
// kepada proses tempatan yang dipercayai (aplikasi desktop) supaya ia boleh
// MEMBINA tugasan penghantaran MOEIS. IC dan rahsia enjin TIDAK PERNAH
// dihantar — penapisan berlaku melalui senarai putih medan (kerjaPenuhSelamat).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulakanPelayanUjian, mintaMentah, NONCE_UJIAN } from './bantuan-server.mjs';
import { kerjaPenuhSelamat } from '../src/server.mjs';

// Bentuk SEBENAR satu rekod tugasan HADIR (apps-script/hadirMoeisJobSenarai_ +
// apa yang klien.senarai() pulangkan): murid membawa IC mentah, dan hanya
// nama/kategori/sebab sepatutnya sampai ke desktop.
const TUGASAN_MENTAH = [
  {
    id: 'job-1', kelas: 'TAHUN 5', tarikhIso: '2026-09-22', status: 'menunggu', mesej: '',
    diciptaEpochMs: 1758500000000, kelasMoeisId: 'K5',
    murid: [
      { ic: '090101011234', nama: 'ALI BIN ABU', kategori: 'SAKIT', sebab: 'DEMAM' },
      { ic: '090101015678', nama: 'SITI BINTI ALI', kategori: 'URUSAN', sebab: 'KELUARGA' }
    ]
  }
];

const SENARAI_DIJANGKA = [
  {
    id: 'job-1', kelas: 'TAHUN 5', tarikhIso: '2026-09-22', status: 'menunggu', mesej: '',
    diciptaEpochMs: 1758500000000, kelasMoeisId: 'K5',
    murid: [
      { id: '', nama: 'ALI BIN ABU', kategori: 'SAKIT', sebab: 'DEMAM' },
      { id: '', nama: 'SITI BINTI ALI', kategori: 'URUSAN', sebab: 'KELUARGA' }
    ]
  }
];

test('kerja-penuh: nonce sah memulangkan senarai penuh TANPA IC', async () => {
  const { pelayan, port } = await mulakanPelayanUjian({
    kerjaSenaraiPenuh: async () => TUGASAN_MENTAH
  });
  try {
    const r = await mintaMentah(port, {
      laluan: '/api/lokal/kerja-penuh',
      headers: { 'X-HADIR-Lokal': NONCE_UJIAN }
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, true);
    assert.deepEqual(r.json.senarai, SENARAI_DIJANGKA);
    // IC tidak pernah muncul, walaupun pembekal (fixture) sengaja membawanya.
    assert.ok(!r.teks.includes('090101011234'));
    assert.ok(!r.teks.includes('090101015678'));
    assert.ok(!/"ic"\s*:/.test(r.teks));
    // rahsia/token ujian tidak terdedah
    assert.ok(!r.teks.includes('rahsia-ujian'));
    assert.ok(!r.teks.includes('token-ujian-sah'));
  } finally {
    await new Promise((s) => pelayan.close(s));
  }
});

test('kerja-penuh: tanpa nonce -> 403', async () => {
  const { pelayan, port } = await mulakanPelayanUjian({
    kerjaSenaraiPenuh: async () => TUGASAN_MENTAH
  });
  try {
    const r = await mintaMentah(port, { laluan: '/api/lokal/kerja-penuh' });
    assert.equal(r.status, 403);
  } finally {
    await new Promise((s) => pelayan.close(s));
  }
});

test('kerja-penuh: kaedah bukan GET -> 405', async () => {
  const { pelayan, port } = await mulakanPelayanUjian({
    kerjaSenaraiPenuh: async () => TUGASAN_MENTAH
  });
  try {
    const r = await mintaMentah(port, {
      method: 'POST', laluan: '/api/lokal/kerja-penuh',
      headers: { 'X-HADIR-Lokal': NONCE_UJIAN }
    });
    assert.equal(r.status, 405);
  } finally {
    await new Promise((s) => pelayan.close(s));
  }
});

test('kerja-penuh: tiada rahsia enjin -> senarai kosong dengan nota', async () => {
  const { pelayan, port } = await mulakanPelayanUjian({
    simpanan: { adaRahsiaEnjin: () => false, simpanRahsiaEnjin: () => {}, dapatkanRahsiaEnjin: () => 'rahsia-ujian' },
    kerjaSenaraiPenuh: async () => TUGASAN_MENTAH
  });
  try {
    const r = await mintaMentah(port, {
      laluan: '/api/lokal/kerja-penuh',
      headers: { 'X-HADIR-Lokal': NONCE_UJIAN }
    });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.senarai, []);
    assert.ok(r.json.nota);
  } finally {
    await new Promise((s) => pelayan.close(s));
  }
});

test('kerja-penuh: pembekal tiada -> senarai kosong (bukan ralat 500)', async () => {
  const { pelayan, port } = await mulakanPelayanUjian({});
  try {
    const r = await mintaMentah(port, {
      laluan: '/api/lokal/kerja-penuh',
      headers: { 'X-HADIR-Lokal': NONCE_UJIAN }
    });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.senarai, []);
  } finally {
    await new Promise((s) => pelayan.close(s));
  }
});

// ---------- penapisan TULEN (kerjaPenuhSelamat) ----------

test('kerjaPenuhSelamat: medan baharu/rahsia pada rekod dibuang secara struktur', () => {
  const hasil = kerjaPenuhSelamat([{
    id: 'j1', kelas: 'TAHUN 5', tarikhIso: '2026-09-22', status: 'menunggu', mesej: 'm',
    diciptaEpochMs: 123, kelasMoeisId: 'K5', pemilik: 'enjin-1', leaseSelepas: 999,
    rahsia: 'rahsia-ujian', murid: [{ ic: '090101011234', kunci: 'abc', nama: 'ALI', kategori: 'S', sebab: 'D', token: 'x' }]
  }]);
  assert.deepEqual(hasil, [{
    id: 'j1', kelas: 'TAHUN 5', tarikhIso: '2026-09-22', status: 'menunggu', mesej: 'm',
    diciptaEpochMs: 123, kelasMoeisId: 'K5',
    murid: [{ id: '', nama: 'ALI', kategori: 'S', sebab: 'D' }]
  }]);
});

test('kerjaPenuhSelamat: bentuk tidak dijangka tidak melontar', () => {
  assert.deepEqual(kerjaPenuhSelamat(null), []);
  assert.deepEqual(kerjaPenuhSelamat('bukan senarai'), []);
  assert.deepEqual(kerjaPenuhSelamat([null, 5, { id: 'j1' }]), [{
    id: 'j1', kelas: '', tarikhIso: '', status: '', mesej: '',
    diciptaEpochMs: null, kelasMoeisId: '', murid: []
  }]);
  // diciptaEpochMs bukan nombor -> null (bukan NaN/string).
  assert.equal(kerjaPenuhSelamat([{ id: 'j1', diciptaEpochMs: 'x' }])[0].diciptaEpochMs, null);
});
