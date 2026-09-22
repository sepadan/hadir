import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buatHadKadarLogin, HAD_LOGIN_JAM, TETINGKAP_LOGIN_JAM_MS,
  SILING_LOGIN_HARIAN, HAD_KEGAGALAN_BERTURUT
} from '../src/moeis/had-login.mjs';
import { bacaJsonKetat, tulisJsonAtomik } from '../src/tetapan.mjs';

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

// 2026-01-01T00:00:00Z sebagai titik mula neutral (jauh daripada sempadan hari
// UTC lain) untuk ujian yang tidak khusus menguji peralihan hari.
const MULA_HARI = Date.parse('2026-01-01T00:00:00.000Z');

test('had-login: membenarkan sehingga hadJam percubaan dalam sejam, kemudian sekat', () => {
  const s = storanPalsu();
  const masa = buatMasa(MULA_HARI);
  const h = buatHadKadarLogin({ baca: s.baca, tulis: s.tulis, sekarangMs: masa.sekarangMs });

  assert.equal(h.bolehCuba(), true);
  assert.equal(h.bilPercubaan(), 0);

  for (let i = 0; i < HAD_LOGIN_JAM; i++) {
    assert.equal(h.bolehCuba(), true, `percubaan ${i + 1} mesti masih dibenarkan`);
    h.catatPercubaan();
  }
  assert.equal(h.bilPercubaan(), HAD_LOGIN_JAM);
  assert.equal(h.bolehCuba(), false, `percubaan ke-${HAD_LOGIN_JAM + 1} mesti disekat`);
});

test('had-login: PERSISTEN merentas restart (dua kejadian kongsi storan)', () => {
  const s = storanPalsu();
  const masa = buatMasa(MULA_HARI);

  const proses1 = buatHadKadarLogin({ baca: s.baca, tulis: s.tulis, sekarangMs: masa.sekarangMs });
  for (let i = 0; i < HAD_LOGIN_JAM; i++) proses1.catatPercubaan();

  // "Restart" — kejadian baharu membaca storan yang SAMA.
  const proses2 = buatHadKadarLogin({ baca: s.baca, tulis: s.tulis, sekarangMs: masa.sekarangMs });
  assert.equal(proses2.bilPercubaan(), HAD_LOGIN_JAM, 'pembilang mesti kekal merentas restart');
  assert.equal(proses2.bolehCuba(), false, 'restart tidak boleh menetapkan semula siling kadar');
});

test('had-login: tetingkap sejam gelongsor — cap masa lama luput, cap masa baharu tetap dikira', () => {
  const s = storanPalsu();
  const masa = buatMasa(MULA_HARI);
  const h = buatHadKadarLogin({ baca: s.baca, tulis: s.tulis, sekarangMs: masa.sekarangMs });

  for (let i = 0; i < HAD_LOGIN_JAM; i++) h.catatPercubaan();
  assert.equal(h.bolehCuba(), false);

  // Maju melepasi tetingkap sejam (+1ms) — semua percubaan lama kini lapuk.
  masa.maju(TETINGKAP_LOGIN_JAM_MS + 1);
  assert.equal(h.bilPercubaan(), 0);
  assert.equal(h.bolehCuba(), true, 'cubaan baharu dibenarkan selepas tetingkap sejam luput');

  // Percubaan baharu direkod dan dikira semula dalam tetingkap baharu.
  h.catatPercubaan();
  assert.equal(h.bilPercubaan(), 1);
});

test('had-login: siling HARIAN TIDAK dikosongkan oleh kejayaan (diluluskan pemilik)', () => {
  const s = storanPalsu();
  const masa = buatMasa(MULA_HARI);
  const h = buatHadKadarLogin({ baca: s.baca, tulis: s.tulis, sekarangMs: masa.sekarangMs });

  // Guna beberapa pusingan cuba+kejayaan (tetingkap sejam dikosongkan setiap
  // kali oleh catatKejayaan) untuk mengumpul bilHariIni tanpa terhalang oleh
  // had jam.
  for (let pusingan = 0; pusingan < SILING_LOGIN_HARIAN; pusingan++) {
    assert.equal(h.bolehCuba(), true, `pusingan ${pusingan} mesti masih dibenarkan sebelum siling harian`);
    h.catatPercubaan();
    h.catatKejayaan(); // kejayaan kosongkan tetingkap sejam + kegagalanBerturut
  }
  const ringkas = h.statusRingkas();
  assert.equal(ringkas.bilHariIni, SILING_LOGIN_HARIAN, 'bilHariIni mesti terkumpul walaupun setiap pusingan berjaya');
  assert.equal(h.bolehCuba(), false, 'siling harian mesti menyekat walaupun tetingkap sejam kosong dan tiada kegagalan berturut-turut');
});

test('had-login: 3 KEGAGALAN BERTURUT-TURUT = blok serta-merta (tiada cubaan semula)', () => {
  const s = storanPalsu();
  const masa = buatMasa(MULA_HARI);
  const h = buatHadKadarLogin({ baca: s.baca, tulis: s.tulis, sekarangMs: masa.sekarangMs });

  for (let i = 0; i < HAD_KEGAGALAN_BERTURUT; i++) {
    assert.equal(h.bolehCuba(), true, `sebelum kegagalan ${i + 1} mesti masih dibenarkan`);
    h.catatPercubaan();
    h.catatKegagalan();
  }
  assert.equal(h.bolehCuba(), false, `${HAD_KEGAGALAN_BERTURUT} kegagalan berturut-turut mesti blok serta-merta`);
  const ringkas = h.statusRingkas();
  assert.equal(ringkas.kegagalanBerturut, HAD_KEGAGALAN_BERTURUT);
  assert.match(ringkas.sebab, /berturut-turut/);

  // Tetingkap sejam gelongsor TIDAK memulihkan — hanya kejayaan memulihkan.
  masa.maju(TETINGKAP_LOGIN_JAM_MS + 1);
  assert.equal(h.bolehCuba(), false, 'kegagalan berturut-turut TIDAK dipulihkan oleh masa/tetingkap sejam');

  h.catatKejayaan();
  assert.equal(h.bolehCuba(), true, 'catatKejayaan mesti memulihkan selepas kegagalan berturut-turut');
});

test('had-login: catatKejayaan mengosongkan tetingkap sejam + kegagalanBerturut, KEKALKAN bilHariIni', () => {
  const s = storanPalsu();
  const masa = buatMasa(MULA_HARI);
  const h = buatHadKadarLogin({ baca: s.baca, tulis: s.tulis, sekarangMs: masa.sekarangMs });

  h.catatPercubaan();
  h.catatKegagalan();
  h.catatPercubaan();
  h.catatKegagalan();
  assert.equal(h.statusRingkas().bilHariIni, 2);

  h.catatKejayaan();
  const ringkas = h.statusRingkas();
  assert.equal(ringkas.bilJam, 0, 'tetingkap sejam mesti kosong selepas kejayaan');
  assert.equal(ringkas.kegagalanBerturut, 0, 'kegagalan berturut-turut mesti reset selepas kejayaan');
  assert.equal(ringkas.bilHariIni, 2, 'bilHariIni mesti KEKAL selepas kejayaan (siling harian tidak dikosongkan)');
  assert.equal(h.bolehCuba(), true);
});

test('had-login: hari baharu (UTC) reset bilHariIni', () => {
  const s = storanPalsu();
  const masa = buatMasa(MULA_HARI);
  const h = buatHadKadarLogin({ baca: s.baca, tulis: s.tulis, sekarangMs: masa.sekarangMs });

  h.catatPercubaan();
  h.catatPercubaan();
  assert.equal(h.statusRingkas().bilHariIni, 2);

  // Maju 25 jam — melangkau ke hari UTC seterusnya.
  masa.maju(25 * 60 * 60 * 1000);
  assert.equal(h.statusRingkas().bilHariIni, 0, 'hari baharu mesti reset bilHariIni');
  assert.equal(h.bolehCuba(), true);

  h.catatPercubaan();
  assert.equal(h.statusRingkas().bilHariIni, 1, 'bilHariIni bermula semula daripada 0 pada hari baharu');
});

test('had-login: storan ROSAK (baca melontar) -> BLOK (gagal tertutup)', () => {
  const masa = buatMasa(MULA_HARI);
  const rosak = buatHadKadarLogin({
    baca: () => { throw new Error('fail tidak boleh dibaca'); },
    tulis: () => {},
    sekarangMs: masa.sekarangMs
  });
  assert.equal(rosak.bolehCuba(), false, 'rosak mesti gagal TERTUTUP (blok)');
  assert.equal(rosak.bilPercubaan(), HAD_LOGIN_JAM, 'bilPercubaan mesti melaporkan penuh apabila rosak');
  const ringkas = rosak.statusRingkas();
  assert.equal(ringkas.diblok, true);
  assert.match(ringkas.sebab, /rosak/);
});

test('had-login: storan hilang (baca null) -> larian pertama dibenarkan', () => {
  const masa = buatMasa(MULA_HARI);
  const hilang = buatHadKadarLogin({ baca: () => null, tulis: () => {}, sekarangMs: masa.sekarangMs });
  assert.equal(hilang.bolehCuba(), true, 'tiada fail = larian pertama, dibenarkan');
  assert.equal(hilang.bilPercubaan(), 0);
});

test('had-login: gulung-balik jam DALAM tetingkap sejam TIDAK memulihkan kapasiti (masa depan dikira aktif)', () => {
  const s = storanPalsu();
  const masa = buatMasa(MULA_HARI);
  const h = buatHadKadarLogin({ baca: s.baca, tulis: s.tulis, sekarangMs: masa.sekarangMs });

  for (let i = 0; i < HAD_LOGIN_JAM; i++) h.catatPercubaan();
  assert.equal(h.bolehCuba(), false);

  // Gulung jam ke BELAKANG 10 minit (tidak merentas sempadan hari) — cap
  // masa lama kini kelihatan "masa depan".
  masa.maju(-10 * 60 * 1000);
  assert.equal(h.bilPercubaan(), HAD_LOGIN_JAM, 'cap masa masa depan mesti dikira aktif');
  assert.equal(h.bolehCuba(), false, 'gulung-balik jam tidak boleh memulihkan kapasiti');
});

test('had-login: jam digulung ke belakang MERENTAS SEMPADAN HARI -> BLOK', () => {
  const s = storanPalsu();
  const masa = buatMasa(MULA_HARI);
  const h = buatHadKadarLogin({ baca: s.baca, tulis: s.tulis, sekarangMs: masa.sekarangMs });

  h.catatPercubaan();
  h.catatKejayaan();
  assert.equal(h.bolehCuba(), true);

  // Gulung jam ke belakang 2 hari — hariIso tersimpan kini "di masa depan"
  // berbanding hari yang dikira daripada jam baharu.
  masa.maju(-2 * 24 * 60 * 60 * 1000);
  assert.equal(h.bolehCuba(), false, 'gulung-balik jam merentas hari mesti blok (gagal tertutup)');
  const ringkas = h.statusRingkas();
  assert.equal(ringkas.diblok, true);
  assert.match(ringkas.sebab, /digulung ke belakang/);

  // Hanya catatKejayaan (log masuk manual berjaya) boleh menulis semula
  // keadaan bersih dan memulihkan.
  h.catatKejayaan();
  assert.equal(h.bolehCuba(), true, 'catatKejayaan menulis keadaan bersih dan memulihkan');
});

test('had-login: sempadan tetingkap sejam ialah inklusif (pada tepat 1 jam masih dikira)', () => {
  const s = storanPalsu();
  const masa = buatMasa(MULA_HARI);
  const h = buatHadKadarLogin({ baca: s.baca, tulis: s.tulis, sekarangMs: masa.sekarangMs });
  h.catatPercubaan();

  // Pada TEPAT tetingkap sejam: cap masa masih dalam [t, t+tetingkap] (inklusif).
  masa.maju(TETINGKAP_LOGIN_JAM_MS);
  assert.equal(h.bilPercubaan(), 1, 'pada tepat 1 jam, percubaan masih aktif (inklusif)');

  // Satu milisaat selepas: luput.
  masa.maju(1);
  assert.equal(h.bilPercubaan(), 0, 'selepas 1 jam + 1ms, percubaan luput');
});

test('had-login: pemalar polisi diluluskan pemilik', () => {
  assert.equal(HAD_LOGIN_JAM, 6);
  assert.equal(SILING_LOGIN_HARIAN, 24);
  assert.equal(HAD_KEGAGALAN_BERTURUT, 3);
});

test('had-login: statusRingkas melaporkan sebab null apabila tidak diblok', () => {
  const s = storanPalsu();
  const masa = buatMasa(MULA_HARI);
  const h = buatHadKadarLogin({ baca: s.baca, tulis: s.tulis, sekarangMs: masa.sekarangMs });
  const ringkas = h.statusRingkas();
  assert.equal(ringkas.diblok, false);
  assert.equal(ringkas.sebab, null);
});

// ---- Integrasi dengan storan SEBENAR (bacaJsonKetat) --------------------
// Semakan bebas keluarga model berbeza mendapati jurang ini: suite hanya
// menyuntik `baca` yang MELONTAR, jadi ia tidak pernah membuktikan bahawa
// pembaca fail SEBENAR yang digunakan bin/hadir-companion.mjs benar-benar
// mematuhi kontrak "fail rosak = BLOK". `bacaJson` biasa menelan ralat parse
// dan memulangkan null, menjadikan jaminan itu palsu dalam pengeluaran.
test('had-login integrasi: fail had-login.json yang ROSAK -> BLOK melalui bacaJsonKetat (fail tertutup)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'had-login-rosak-'));
  try {
    fs.writeFileSync(path.join(dir, 'had-login.json'), '{ ini bukan json', 'utf8');
    assert.throws(() => bacaJsonKetat(dir, 'had-login.json'), 'fail rosak mesti MELONTAR, bukan pulang null');
    const masa = buatMasa(MULA_HARI);
    const h = buatHadKadarLogin({
      baca: () => bacaJsonKetat(dir, 'had-login.json'),
      tulis: (s) => tulisJsonAtomik(dir, 'had-login.json', s),
      sekarangMs: masa.sekarangMs
    });
    assert.equal(h.bolehCuba(), false, 'fail rosak mesti menyebabkan BLOK (gagal tertutup)');
    assert.equal(h.statusRingkas().bilHariIni, null, 'pembilang yang tidak boleh dibaca mesti null, bukan angka rekaan');
    assert.match(h.statusRingkas().sebab, /rosak/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('had-login integrasi: fail TIADA -> larian pertama dibenarkan (bacaJsonKetat pulang null)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'had-login-tiada-'));
  try {
    assert.equal(bacaJsonKetat(dir, 'had-login.json'), null);
    const masa = buatMasa(MULA_HARI);
    const h = buatHadKadarLogin({
      baca: () => bacaJsonKetat(dir, 'had-login.json'),
      tulis: (s) => tulisJsonAtomik(dir, 'had-login.json', s),
      sekarangMs: masa.sekarangMs
    });
    assert.equal(h.bolehCuba(), true);
    h.catatPercubaan();
    assert.equal(bacaJsonKetat(dir, 'had-login.json').bilHariIni, 1, 'keadaan mesti benar-benar ditulis ke fail');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---- Sempadan hari MALAYSIA (UTC+8), bukan hari UTC --------------------
test('had-login: siling harian menggunakan hari kalendar MALAYSIA (tengah malam MYT = reset)', () => {
  const s = storanPalsu();
  // 23:30 waktu Malaysia pada 20 Sep 2026 = 15:30Z 20 Sep.
  const masa = buatMasa(Date.parse('2026-09-20T15:30:00.000Z'));
  const h = buatHadKadarLogin({ baca: s.baca, tulis: s.tulis, sekarangMs: masa.sekarangMs });
  h.catatPercubaan();
  assert.equal(h.statusRingkas().bilHariIni, 1);
  // 00:30 waktu Malaysia pada 21 Sep (= 16:30Z 20 Sep) — SATU jam kemudian
  // tetapi hari MYT sudah bertukar, jadi siling harian bermula semula.
  masa.maju(60 * 60 * 1000);
  assert.equal(h.statusRingkas().bilHariIni, 0, 'hari MYT baharu mesti mengosongkan bilHariIni');
  h.catatPercubaan();
  assert.equal(h.statusRingkas().bilHariIni, 1);
});

// ---- Pembetulan Astra: kegagalanBerturut TIDAK PERNAH melebihi had --------
test('had-login: catatKegagalan dipanggil terus 10 kali (memintas bolehCuba) -> kegagalanBerturut dikunci pada had (tidak boleh jadi 4)', () => {
  const s = storanPalsu();
  const masa = buatMasa(MULA_HARI);
  const h = buatHadKadarLogin({ baca: s.baca, tulis: s.tulis, sekarangMs: masa.sekarangMs });
  for (let i = 0; i < 10; i++) h.catatKegagalan();
  assert.equal(h.statusRingkas().kegagalanBerturut, HAD_KEGAGALAN_BERTURUT, 'pembilang mesti dikunci pada had, tidak boleh melebihinya');
});

test('had-login: keadaan legasi tersimpan kegagalanBerturut:4 (>had) dikekalkan, blok, dan pulih bersih melalui catatKejayaan (kekalkan bilHariIni)', () => {
  const s = storanPalsu({ percubaan: [], kegagalanBerturut: 4, hariIso: '2026-01-01', bilHariIni: 7 });
  const masa = buatMasa(Date.parse('2026-01-01T01:00:00.000Z'));
  const h = buatHadKadarLogin({ baca: s.baca, tulis: s.tulis, sekarangMs: masa.sekarangMs });
  assert.equal(h.statusRingkas().kegagalanBerturut, 4, 'nilai legasi tersimpan mesti dikekalkan, bukan dipadam/dilabel semula');
  assert.equal(h.bolehCuba(), false);
  assert.equal(h.statusRingkas().bilHariIni, 7);

  h.catatKejayaan();
  assert.equal(h.bolehCuba(), true, 'log masuk manual berjaya mesti memulihkan');
  assert.equal(h.statusRingkas().bilHariIni, 7, 'bilHariIni mesti KEKAL (siling harian tidak dikosongkan oleh kejayaan)');
});

// ---- v1.11.22 Gap 5: tetapkanSemulaLatch (pemulihan tindakan pemilik tempatan) ----
test('had-login: tetapkanSemulaLatch mengosongkan HANYA kegagalanBerturut, KEKALKAN tetingkap sejam DAN bilHariIni', () => {
  const s = storanPalsu();
  const masa = buatMasa(MULA_HARI);
  const h = buatHadKadarLogin({ baca: s.baca, tulis: s.tulis, sekarangMs: masa.sekarangMs });

  h.catatPercubaan(); h.catatKegagalan();
  h.catatPercubaan(); h.catatKegagalan();
  h.catatPercubaan(); h.catatKegagalan();
  assert.equal(h.bolehCuba(), false, 'pra-syarat: latch 3-strike aktif');
  assert.equal(h.bilPercubaan(), 3);
  assert.equal(h.statusRingkas().bilHariIni, 3);

  h.tetapkanSemulaLatch();
  const ringkas = h.statusRingkas();
  assert.equal(ringkas.kegagalanBerturut, 0, 'kegagalanBerturut mesti dikosongkan');
  assert.equal(h.bolehCuba(), true, 'bolehCuba mesti pulih selepas latch dikosongkan');
  assert.equal(h.bilPercubaan(), 3, 'tetingkap sejam SEDIA ADA mesti DIKEKALKAN (bukan reset penuh seperti catatKejayaan)');
  assert.equal(ringkas.bilHariIni, 3, 'siling harian mesti DIKEKALKAN (tindakan ini tidak menambah belanjawan)');
});

test('had-login: tetapkanSemulaLatch pada keadaan legasi kegagalanBerturut:4 (>had) -> pulih, bilHariIni kekal', () => {
  const s = storanPalsu({ percubaan: [], kegagalanBerturut: 4, hariIso: '2026-01-01', bilHariIni: 7 });
  const masa = buatMasa(Date.parse('2026-01-01T01:00:00.000Z'));
  const h = buatHadKadarLogin({ baca: s.baca, tulis: s.tulis, sekarangMs: masa.sekarangMs });
  assert.equal(h.bolehCuba(), false);

  h.tetapkanSemulaLatch();
  assert.equal(h.bolehCuba(), true);
  assert.equal(h.statusRingkas().kegagalanBerturut, 0);
  assert.equal(h.statusRingkas().bilHariIni, 7, 'tetapkanSemulaLatch TIDAK PERNAH mengubah bilHariIni');
});

test('had-login: tiada migrasi senyap — nilai legasi >had kekal dilaporkan JUJUR sehingga tetapkanSemulaLatch dipanggil secara eksplisit', () => {
  const s = storanPalsu({ percubaan: [], kegagalanBerturut: 5, hariIso: '2026-01-01', bilHariIni: 1 });
  const masa = buatMasa(Date.parse('2026-01-01T01:00:00.000Z'));
  const h = buatHadKadarLogin({ baca: s.baca, tulis: s.tulis, sekarangMs: masa.sekarangMs });
  // Membaca statusRingkas()/bolehCuba() berulang kali TIDAK PERNAH mengubah keadaan.
  h.statusRingkas(); h.bolehCuba(); h.statusRingkas();
  assert.equal(h.statusRingkas().kegagalanBerturut, 5, 'baca berulang tidak boleh mengubah nilai legasi secara senyap');
  assert.equal(h.bolehCuba(), false);
});

// ---- v1.11.22 Gap 3: jenisSekat + cubaSemulaSelepasMs/cubaSemulaHariIso ----
test('had-login: statusRingkas jenisSekat null apabila tidak diblok', () => {
  const s = storanPalsu();
  const masa = buatMasa(MULA_HARI);
  const h = buatHadKadarLogin({ baca: s.baca, tulis: s.tulis, sekarangMs: masa.sekarangMs });
  const r = h.statusRingkas();
  assert.equal(r.jenisSekat, null);
  assert.equal(r.cubaSemulaSelepasMs, null);
  assert.equal(r.cubaSemulaHariIso, null);
});

test('had-login: jenisSekat "tetingkap-jam" apabila had 6/jam disekat, cubaSemulaSelepasMs ialah tamat tempoh cap masa TERTUA + 1ms', () => {
  const s = storanPalsu();
  const masa = buatMasa(MULA_HARI);
  const h = buatHadKadarLogin({ baca: s.baca, tulis: s.tulis, sekarangMs: masa.sekarangMs });
  for (let i = 0; i < HAD_LOGIN_JAM; i++) { h.catatPercubaan(); masa.maju(1000); }
  const r = h.statusRingkas();
  assert.equal(r.jenisSekat, 'tetingkap-jam');
  assert.equal(r.cubaSemulaHariIso, null);
  // Cap masa TERTUA ialah percubaan pertama (MULA_HARI); tamat tempoh ialah
  // MULA_HARI + TETINGKAP_LOGIN_JAM_MS + 1.
  assert.equal(r.cubaSemulaSelepasMs, MULA_HARI + TETINGKAP_LOGIN_JAM_MS + 1);
});

test('had-login: jenisSekat "siling-harian" apabila siling 24/hari disekat, cubaSemulaHariIso ialah hari MYT SETERUSNYA', () => {
  const s = storanPalsu();
  const masa = buatMasa(MULA_HARI);
  const h = buatHadKadarLogin({ baca: s.baca, tulis: s.tulis, sekarangMs: masa.sekarangMs });
  for (let pusingan = 0; pusingan < SILING_LOGIN_HARIAN; pusingan++) { h.catatPercubaan(); h.catatKejayaan(); }
  const r = h.statusRingkas();
  assert.equal(r.jenisSekat, 'siling-harian');
  assert.equal(r.cubaSemulaSelepasMs, null);
  assert.match(r.cubaSemulaHariIso, /^\d{4}-\d{2}-\d{2}$/);
  assert.notEqual(r.cubaSemulaHariIso, r.hariIso, 'cubaSemulaHariIso mesti hari SETERUSNYA, bukan hari semasa');
});

test('had-login: jenisSekat "kegagalan-berturut" apabila 3-strike, TIADA cubaSemulaSelepasMs/cubaSemulaHariIso (sekatan kekal)', () => {
  const s = storanPalsu();
  const masa = buatMasa(MULA_HARI);
  const h = buatHadKadarLogin({ baca: s.baca, tulis: s.tulis, sekarangMs: masa.sekarangMs });
  for (let i = 0; i < HAD_KEGAGALAN_BERTURUT; i++) { h.catatPercubaan(); h.catatKegagalan(); }
  const r = h.statusRingkas();
  assert.equal(r.jenisSekat, 'kegagalan-berturut');
  assert.equal(r.cubaSemulaSelepasMs, null);
  assert.equal(r.cubaSemulaHariIso, null);
});

test('had-login: jenisSekat "rosak"/"gulung-balik" apabila gagal tertutup, TIADA cubaSemula (sekatan kekal)', () => {
  const masa = buatMasa(MULA_HARI);
  const rosak = buatHadKadarLogin({ baca: () => { throw new Error('rosak'); }, tulis: () => {}, sekarangMs: masa.sekarangMs });
  const rRosak = rosak.statusRingkas();
  assert.equal(rRosak.jenisSekat, 'rosak');
  assert.equal(rRosak.cubaSemulaSelepasMs, null);
  assert.equal(rRosak.cubaSemulaHariIso, null);

  const s = storanPalsu();
  const h = buatHadKadarLogin({ baca: s.baca, tulis: s.tulis, sekarangMs: masa.sekarangMs });
  h.catatPercubaan(); h.catatKejayaan();
  masa.maju(-2 * 24 * 60 * 60 * 1000);
  const rGulung = h.statusRingkas();
  assert.equal(rGulung.jenisSekat, 'gulung-balik');
  assert.equal(rGulung.cubaSemulaSelepasMs, null);
  assert.equal(rGulung.cubaSemulaHariIso, null);
});
