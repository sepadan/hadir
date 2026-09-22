// Ujian TULEN bagi companion/src/moeis/probe-sesi.mjs (v1.11.23).
//
// Kontrak yang mesti dijamin: probe ini TIDAK PERNAH membaca cache (satu-
// satunya kebergantungan ialah `probeLangsung`, siasatan langsung disuntik).
// Ini membezakannya daripada wiring cache-dahulu lama (`sesiSahProbeLangsung`
// v1.11.22, kini dibuang) yang mempercayai cache STALE walaupun tugasan
// sudah mendedahkan sesi-tamat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buatProbeSesiLangsung } from '../src/moeis/probe-sesi.mjs';

test('TIADA kebergantungan cache: buatProbeSesiLangsung hanya menerima probeLangsung', () => {
  // Bukti struktur: fungsi kilang hanya destructure satu medan. Sebarang
  // cache "stale-positive" yang wujud di luar tidak boleh mempengaruhi
  // keputusan probe ini — hasil probeLangsung SENTIASA menang.
  assert.equal(buatProbeSesiLangsung.length, 1);
});

test('stale-positive: probeLangsung (siasatan HIDUP) melapor sesi-tamat -> {ada:false}, walaupun cache luar mendakwa sesi-sah', async () => {
  // Simulasi pepijat 1.11.22 asal: satu cache luar (tidak disuntik ke sini
  // langsung sebagai bukti ia tidak boleh dirujuk) mendakwa sesi sah, tetapi
  // siasatan LANGSUNG (probeLangsung) yang sebenarnya dijalankan selepas
  // tugasan mendedahkan sesi-tamat melaporkan status sebenar.
  let panggilanProbeLangsung = 0;
  const probe = buatProbeSesiLangsung({
    probeLangsung: async () => {
      panggilanProbeLangsung++;
      return { status: 'sesi-tamat', sebab: 'Borang log masuk masih ada.' };
    }
  });
  const hasil = await probe();
  assert.equal(panggilanProbeLangsung, 1, 'probe mesti benar-benar menjalankan siasatan langsung, bukan pintasan cache');
  assert.equal(hasil.ada, false);
  assert.equal(hasil.tangguh, undefined, 'sesi tamat SEBENAR bukan tangguhan — ia layak membelanjakan belanjawan log masuk');
});

test('live valid: probeLangsung melapor sesi-sah -> {ada:true}', async () => {
  const probe = buatProbeSesiLangsung({
    probeLangsung: async () => ({ status: 'sesi-sah', hos: 'moeispel.moe.gov.my' })
  });
  const hasil = await probe();
  assert.equal(hasil.ada, true);
  assert.match(hasil.sebab, /Sesi idMe sah/);
});

test('unknown/busy: probeLangsung melontar (profil sibuk/ralat) -> {ada:false, tangguh:true} (BUKAN "tamat")', async () => {
  const probe = buatProbeSesiLangsung({
    probeLangsung: async () => { const e = new Error('Profil Edge sedang digunakan oleh tugasan.'); e.langkau = true; throw e; }
  });
  const hasil = await probe();
  assert.equal(hasil.ada, false);
  assert.equal(hasil.tangguh, true, 'siasatan yang gagal dijalankan mesti ditangguh, bukan disamakan dengan sesi tamat');
});

test('status lain (cth kredensial-ditolak/perlu-manusia) -> {ada:false} tanpa tangguh (bukan "tamat" tetapi juga bukan siasatan gagal)', async () => {
  const probe = buatProbeSesiLangsung({
    probeLangsung: async () => ({ status: 'kredensial-ditolak', sebab: 'idMe menolak kredensial.' })
  });
  const hasil = await probe();
  assert.equal(hasil.ada, false);
  assert.equal(hasil.tangguh, undefined);
  assert.match(hasil.sebab, /kredensial-ditolak|idMe menolak/);
});
