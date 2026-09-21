import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buatHadKadarLogin, HAD_LOGIN_CUBAAN, TETINGKAP_LOGIN_MS } from '../src/moeis/had-login.mjs';

// Storan dalam ingatan yang mensimulasikan fail `had-login.json` (baca/tulis
// ditukar-ganti antara dua kejadian untuk mensimulasikan RESTART proses).
function storanPalsu(awal = null) {
  let nilai = awal ? JSON.parse(JSON.stringify(awal)) : null;
  return {
    baca: () => (nilai ? JSON.parse(JSON.stringify(nilai)) : null),
    tulis: (s) => { nilai = JSON.parse(JSON.stringify(s)); },
    _nilai: () => nilai
  };
}

function buatMasa(mula) {
  let masa = mula;
  return { sekarangMs: () => masa, maju: (ms) => { masa += ms; } };
}

test('had-login: membenarkan sehingga hadCubaan percubaan, kemudian sekat', () => {
  const s = storanPalsu();
  const masa = buatMasa(1_000_000);
  const h = buatHadKadarLogin({ baca: s.baca, tulis: s.tulis, sekarangMs: masa.sekarangMs });

  assert.equal(h.bolehCuba(), true);
  assert.equal(h.bilPercubaan(), 0);

  h.catatPercubaan();
  assert.equal(h.bilPercubaan(), 1);
  assert.equal(h.bolehCuba(), true);

  h.catatPercubaan();
  assert.equal(h.bilPercubaan(), 2);
  assert.equal(h.bolehCuba(), false, 'cubaan ke-3 mesti disekat pada had 2');
});

test('had-login: PERSISTEN merentas restart (dua kejadian kongsi storan)', () => {
  const s = storanPalsu();
  const masa = buatMasa(1_000_000);

  const proses1 = buatHadKadarLogin({ baca: s.baca, tulis: s.tulis, sekarangMs: masa.sekarangMs });
  proses1.catatPercubaan();
  proses1.catatPercubaan();

  // "Restart" — kejadian baharu membaca storan yang SAMA.
  const proses2 = buatHadKadarLogin({ baca: s.baca, tulis: s.tulis, sekarangMs: masa.sekarangMs });
  assert.equal(proses2.bilPercubaan(), 2, 'pembilang mesti kekal merentas restart');
  assert.equal(proses2.bolehCuba(), false, 'restart tidak boleh menetapkan semula siling kadar');
});

test('had-login: tetingkap sejuk luput membuang cap masa lama', () => {
  const s = storanPalsu();
  const masa = buatMasa(1_000_000);
  const h = buatHadKadarLogin({ baca: s.baca, tulis: s.tulis, sekarangMs: masa.sekarangMs });

  h.catatPercubaan();
  h.catatPercubaan();
  assert.equal(h.bolehCuba(), false);

  // Maju melepasi tetingkap sejuk (+1ms) — kedua-dua percubaan kini lapuk.
  masa.maju(TETINGKAP_LOGIN_MS + 1);
  assert.equal(h.bilPercubaan(), 0);
  assert.equal(h.bolehCuba(), true, 'cubaan baharu dibenarkan selepas tetingkap sejuk luput');
});

test('had-login: catatKejayaan mengosongkan pembilang (akaun tidak dikunci)', () => {
  const s = storanPalsu();
  const masa = buatMasa(1_000_000);
  const h = buatHadKadarLogin({ baca: s.baca, tulis: s.tulis, sekarangMs: masa.sekarangMs });

  h.catatPercubaan();
  h.catatPercubaan();
  assert.equal(h.bolehCuba(), false);

  h.catatKejayaan();
  assert.equal(h.bilPercubaan(), 0);
  assert.equal(h.bolehCuba(), true);
});

test('had-login: storan ROSAK (baca melontar) -> BLOK (gagal tertutup)', () => {
  const masa = buatMasa(1_000_000);
  const rosak = buatHadKadarLogin({
    baca: () => { throw new Error('fail tidak boleh dibaca'); },
    tulis: () => {},
    sekarangMs: masa.sekarangMs
  });
  // Fail korup TIDAK boleh menetapkan semula siling kepada sifar: ia BLOK.
  assert.equal(rosak.bolehCuba(), false, 'rosak mesti gagal TERTUTUP (blok)');
  assert.equal(rosak.bilPercubaan(), HAD_LOGIN_CUBAAN, 'bilPercubaan mesti melaporkan penuh apabila rosak');
});

test('had-login: storan hilang (baca null) -> larian pertama dibenarkan', () => {
  const masa = buatMasa(1_000_000);
  const hilang = buatHadKadarLogin({ baca: () => null, tulis: () => {}, sekarangMs: masa.sekarangMs });
  assert.equal(hilang.bolehCuba(), true, 'tiada fail = larian pertama, dibenarkan');
  assert.equal(hilang.bilPercubaan(), 0);
});

test('had-login: gulung-balik jam TIDAK memulihkan kapasiti (masa depan dikira aktif)', () => {
  const s = storanPalsu();
  const masa = buatMasa(1_000_000);
  const h = buatHadKadarLogin({ baca: s.baca, tulis: s.tulis, sekarangMs: masa.sekarangMs });

  h.catatPercubaan();
  h.catatPercubaan();
  assert.equal(h.bolehCuba(), false);

  // Gulung jam ke BELAKANG satu jam — cap masa lama kini kelihatan "masa depan".
  masa.maju(-60 * 60 * 1000);
  assert.equal(h.bilPercubaan(), 2, 'cap masa masa depan mesti dikira aktif');
  assert.equal(h.bolehCuba(), false, 'gulung-balik jam tidak boleh memulihkan kapasiti');
});

test('had-login: sempadan tetingkap sejuk ialah inklusif (pada tepat 15 minit masih dikira)', () => {
  const s = storanPalsu();
  const masa = buatMasa(1_000_000);
  const h = buatHadKadarLogin({ baca: s.baca, tulis: s.tulis, sekarangMs: masa.sekarangMs });
  h.catatPercubaan();
  h.catatPercubaan();

  // Pada TEPAT tetingkap sejuk: cap masa masih dalam [t, t+tetingkap] (inklusif).
  masa.maju(TETINGKAP_LOGIN_MS);
  assert.equal(h.bilPercubaan(), 2, 'pada tepat 15 minit, percubaan masih aktif (inklusif)');

  // Satu milisaat selepas: luput.
  masa.maju(1);
  assert.equal(h.bilPercubaan(), 0, 'selepas 15 minit + 1ms, percubaan luput');
});

test('had-login: had kadar lalai dipatuhi (HAD_LOGIN_CUBAAN == 2)', () => {
  assert.equal(HAD_LOGIN_CUBAAN, 2);
  const s = storanPalsu();
  const masa = buatMasa(1_000_000);
  const h = buatHadKadarLogin({ baca: s.baca, tulis: s.tulis, sekarangMs: masa.sekarangMs });
  for (let i = 0; i < HAD_LOGIN_CUBAAN; i++) h.catatPercubaan();
  assert.equal(h.bolehCuba(), false);
});
