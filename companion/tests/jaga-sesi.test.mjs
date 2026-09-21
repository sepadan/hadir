import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buatPenjagaSesi, JEDA_JAGA_SESI_MS, JEDA_JAGA_SESI_MIN_MS } from '../src/moeis/jaga-sesi.mjs';

function buatMasa(mula) {
  let m = mula;
  return { sekarangMs: () => m, maju: (ms) => { m += ms; } };
}

test('poke berlaku semasa giliran aktif', async () => {
  const masa = buatMasa(1_000_000);
  const poke = [];
  const p = buatPenjagaSesi({ aktif: () => true, sedangProses: () => false, poke: async () => poke.push('x'), sekarangMs: masa.sekarangMs, jedaMs: 1000, jedaMinMs: 1 });
  p.mula();
  await p._kitar();
  assert.equal(poke.length, 1);
  assert.equal(p.status().bilPoke, 1);
  p.hentikan();
});

test('tiada poke semasa giliran TIDAK aktif', async () => {
  const masa = buatMasa(1_000_000);
  const poke = [];
  const p = buatPenjagaSesi({ aktif: () => false, sedangProses: () => false, poke: async () => poke.push('x'), sekarangMs: masa.sekarangMs, jedaMs: 1000, jedaMinMs: 1 });
  p.mula();
  await p._kitar();
  assert.equal(poke.length, 0);
  assert.equal(p.status().bilLangkau, 1);
  p.hentikan();
});

test('tiada poke semasa tugasan sedang diproses (profil Edge digunakan)', async () => {
  const masa = buatMasa(1_000_000);
  const poke = [];
  const p = buatPenjagaSesi({ aktif: () => true, sedangProses: () => true, poke: async () => poke.push('x'), sekarangMs: masa.sekarangMs, jedaMs: 1000, jedaMinMs: 1 });
  p.mula();
  await p._kitar();
  assert.equal(poke.length, 0, 'penjaga mesti melangkau poke semasa profil Edge digunakan');
  p.hentikan();
});

test('selang minimum: poke dithrottle (tiada poke kedua dalam selang)', async () => {
  const masa = buatMasa(1_000_000);
  const poke = [];
  const p = buatPenjagaSesi({ aktif: () => true, sedangProses: () => false, poke: async () => poke.push('x'), sekarangMs: masa.sekarangMs, jedaMs: 1000, jedaMinMs: 1 });
  p.mula();
  await p._kitar();
  await p._kitar(); // tanpa maju masa -> mesti dithrottle
  assert.equal(poke.length, 1, 'poke kedua mesti dithrottle dalam selang');
  masa.maju(1001);
  await p._kitar();
  assert.equal(poke.length, 2, 'poke dibenarkan selepas selang luput');
  p.hentikan();
});

test('lantai selang keras dikuatkuasakan (jedaMinMs)', async () => {
  const masa = buatMasa(1_000_000);
  const poke = [];
  const p = buatPenjagaSesi({ aktif: () => true, sedangProses: () => false, poke: async () => poke.push('x'), sekarangMs: masa.sekarangMs, jedaMs: 1, jedaMinMs: 500 });
  p.mula();
  assert.equal(p.status().jedaEfektif, 500, 'jeda di bawah lantai mesti dinaikkan ke lantai');
  await p._kitar();
  masa.maju(100); // < 500 -> masih throttle
  await p._kitar();
  assert.equal(poke.length, 1);
  masa.maju(401); // jumlah 501 > 500
  await p._kitar();
  assert.equal(poke.length, 2);
  p.hentikan();
});

test('hentikan memberhentikan poke selanjutnya', async () => {
  const masa = buatMasa(1_000_000);
  const poke = [];
  const p = buatPenjagaSesi({ aktif: () => true, sedangProses: () => false, poke: async () => poke.push('x'), sekarangMs: masa.sekarangMs, jedaMs: 1000, jedaMinMs: 1 });
  p.mula();
  await p._kitar();
  assert.equal(poke.length, 1);
  p.hentikan();
  await p._kitar(); // timer null -> early return
  assert.equal(poke.length, 1, 'tiada poke selepas hentikan');
  assert.equal(p.berjalan(), false);
});

test('poke gagal (throw) tidak menghalang kitaran seterusnya', async () => {
  const masa = buatMasa(1_000_000);
  const log = [];
  let bil = 0;
  const p = buatPenjagaSesi({
    aktif: () => true, sedangProses: () => false,
    poke: async () => { bil++; if (bil === 1) throw new Error('rangkaian putus'); },
    sekarangMs: masa.sekarangMs, jedaMs: 1000, jedaMinMs: 1,
    tulisLog: (j, m) => log.push(j + ':' + m)
  });
  p.mula();
  await p._kitar();
  assert.equal(bil, 1);
  assert.match(log[0], /poke-sesi-gagal/);
  masa.maju(1001);
  await p._kitar();
  assert.equal(bil, 2, 'kitaran seterusnya masih berjalan selepas kegagalan poke');
  p.hentikan();
});

test('pemalar lalai: selang 5 minit < masa luput ~15-20 minit, lantai 1 minit', () => {
  assert.equal(JEDA_JAGA_SESI_MS, 5 * 60 * 1000);
  assert.equal(JEDA_JAGA_SESI_MIN_MS, 60 * 1000);
  assert.ok(JEDA_JAGA_SESI_MS < 15 * 60 * 1000, 'selang mesti jauh di bawah masa luput 15 minit');
});

// Klasifikasi kesihatan: poke BACA-SAHJA TIDAK boleh mengaku sihat hanya kerana
// promise selesai. `sihatTerakhir` BENAR HANYA untuk `status === 'sesi-sah'`.
// `sesi-tamat`/`perlu-manusia`/seumpamanya = TIDAK sihat.

test('poke sesi-sah -> sihat (hasil terakhir direkod)', async () => {
  const masa = buatMasa(1_000_000);
  const p = buatPenjagaSesi({
    aktif: () => true, sedangProses: () => false,
    poke: async () => ({ status: 'sesi-sah' }),
    sekarangMs: masa.sekarangMs, jedaMs: 1000, jedaMinMs: 1
  });
  p.mula();
  await p._kitar();
  assert.equal(p.status().hasilPokeTerakhir, 'sesi-sah');
  assert.equal(p.status().sihatTerakhir, true);
  p.hentikan();
});

test('poke sesi-tamat -> TIDAK sihat (promise selesai BUKAN kejayaan)', async () => {
  const masa = buatMasa(1_000_000);
  const p = buatPenjagaSesi({
    aktif: () => true, sedangProses: () => false,
    poke: async () => ({ status: 'sesi-tamat' }),
    sekarangMs: masa.sekarangMs, jedaMs: 1000, jedaMinMs: 1
  });
  p.mula();
  await p._kitar();
  assert.equal(p.status().hasilPokeTerakhir, 'sesi-tamat');
  assert.equal(p.status().sihatTerakhir, false, 'sesi-tamat mesti diklasifikasi TIDAK sihat');
  p.hentikan();
});

test('poke perlu-manusia -> TIDAK sihat', async () => {
  const masa = buatMasa(1_000_000);
  const p = buatPenjagaSesi({
    aktif: () => true, sedangProses: () => false,
    poke: async () => ({ status: 'perlu-manusia' }),
    sekarangMs: masa.sekarangMs, jedaMs: 1000, jedaMinMs: 1
  });
  p.mula();
  await p._kitar();
  assert.equal(p.status().hasilPokeTerakhir, 'perlu-manusia');
  assert.equal(p.status().sihatTerakhir, false);
  p.hentikan();
});

test('poke langkau (profil Edge digunakan) -> TIDAK sihat, direkod sebagai langkau', async () => {
  const masa = buatMasa(1_000_000);
  const p = buatPenjagaSesi({
    aktif: () => true, sedangProses: () => false,
    poke: async () => ({ status: 'langkau' }),
    sekarangMs: masa.sekarangMs, jedaMs: 1000, jedaMinMs: 1
  });
  p.mula();
  await p._kitar();
  assert.equal(p.status().hasilPokeTerakhir, 'langkau');
  assert.equal(p.status().sihatTerakhir, false);
  p.hentikan();
});

test('poke melontar -> ralat, TIDAK sihat', async () => {
  const masa = buatMasa(1_000_000);
  const p = buatPenjagaSesi({
    aktif: () => true, sedangProses: () => false,
    poke: async () => { throw new Error('rangkaian putus'); },
    sekarangMs: masa.sekarangMs, jedaMs: 1000, jedaMinMs: 1
  });
  p.mula();
  await p._kitar();
  assert.equal(p.status().hasilPokeTerakhir, 'ralat');
  assert.equal(p.status().sihatTerakhir, false);
  p.hentikan();
});

test('status awal sebelum sebarang poke: hasil "belum", tidak sihat', () => {
  const p = buatPenjagaSesi({ aktif: () => true, sedangProses: () => false, poke: async () => ({ status: 'sesi-sah' }), jedaMs: 1000, jedaMinMs: 1 });
  assert.equal(p.status().hasilPokeTerakhir, 'belum');
  assert.equal(p.status().sihatTerakhir, false);
});
