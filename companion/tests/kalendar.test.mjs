import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ringkasanKalendar,
  AMARAN_HARI_KALENDAR
} from '../src/auto-mula.mjs';
import { mulakanPelayanUjian, mintaMentah, NONCE_UJIAN, TOKEN_SAH } from './bantuan-server.mjs';
import { halamanLokalHtml, halamanLokalJs } from '../src/ui/render.mjs';

// --- Fungsi tulen ringkasanKalendar ---
// Semua kes menyuntik masa (Asia/Kuala_Lumpur) dan data palsu; tiada fs/rangkaian.

// 2026-09-20 09:00 KL (Ahad) — hari ini di Kuala Lumpur.
const SEKARANG = Date.parse('2026-09-20T01:00:00.000Z');

function ringkas(senarai, sekarangMs = SEKARANG) {
  return ringkasanKalendar({ kalendarSekolah: senarai }, sekarangMs);
}

test('AMARAN_HARI_KALENDAR ialah 7 (ambang amaran awal)', () => {
  assert.equal(AMARAN_HARI_KALENDAR, 7);
});

test('allowlist kosong -> amaran benar (gagal tertutup) dan tiada tarikh', () => {
  const r = ringkas([]);
  assert.equal(r.bilangan, 0);
  assert.equal(r.pertama, null);
  assert.equal(r.terakhir, null);
  assert.equal(r.hariTinggal, null);
  assert.equal(r.amaran, true);
  assert.match(r.sebab, /kosong/i);
});

test('allowlist sudah tamat -> amaran benar, hariTinggal negatif, sebab menyebut tarikh + hari lepas', () => {
  const r = ringkas(['2026-09-19']);
  assert.equal(r.amaran, true);
  assert.equal(r.hariTinggal, -1);
  assert.match(r.sebab, /tamat/i);
  assert.match(r.sebab, /2026-09-19/);
  assert.match(r.sebab, /1 hari lepas/);
});

test('tarikh terakhir hari ini (0 hari) -> amaran benar', () => {
  const r = ringkas(['2026-09-20']);
  assert.equal(r.hariTinggal, 0);
  assert.equal(r.amaran, true);
  assert.match(r.sebab, /hari ini/);
});

test('tarikh terakhir dalam 7 hari (3 hari) -> amaran benar', () => {
  const r = ringkas(['2026-09-21', '2026-09-23']);
  assert.equal(r.bilangan, 2);
  assert.equal(r.pertama, '2026-09-21');
  assert.equal(r.terakhir, '2026-09-23');
  assert.equal(r.hariTinggal, 3);
  assert.equal(r.amaran, true);
  assert.match(r.sebab, /3 hari lagi/);
});

test('tepat 7 hari -> amaran benar (sempadan ambang inklusif)', () => {
  const r = ringkas(['2026-09-27']);
  assert.equal(r.hariTinggal, 7);
  assert.equal(r.amaran, true);
});

test('8 hari -> amaran palsu (selamat), sebab menyebut tarikh + hari lagi', () => {
  const r = ringkas(['2026-09-28']);
  assert.equal(r.hariTinggal, 8);
  assert.equal(r.amaran, false);
  assert.match(r.sebab, /2026-09-28/);
  assert.match(r.sebab, /8 hari lagi/);
});

test('jauh masa depan -> amaran palsu (selamat)', () => {
  const r = ringkas(['2026-09-21', '2026-12-04']);
  assert.equal(r.bilangan, 2);
  assert.equal(r.pertama, '2026-09-21');
  assert.equal(r.terakhir, '2026-12-04');
  assert.equal(r.hariTinggal, 75);
  assert.equal(r.amaran, false);
  assert.match(r.sebab, /2026-12-04/);
});

test('entri sampah -> amaran benar (gagal tertutup, bilangan 0)', () => {
  const r = ringkas(['2026-09-21', 'bukan-tarikh']);
  assert.equal(r.amaran, true);
  assert.equal(r.bilangan, 0);
  assert.match(r.sebab, /entri tidak sah/i);
});

test('tarikh mustahil (2026-02-30) -> amaran benar (gagal tertutup)', () => {
  const r = ringkas(['2026-02-30']);
  assert.equal(r.amaran, true);
  assert.equal(r.bilangan, 0);
});

test('tetapan tiada / kalendarSekolah bukan senarai -> amaran benar', () => {
  assert.equal(ringkasanKalendar(undefined, SEKARANG).amaran, true);
  assert.equal(ringkasanKalendar({}, SEKARANG).amaran, true);
  assert.equal(ringkasanKalendar({ kalendarSekolah: 'bukan-senarai' }, SEKARANG).amaran, true);
});

test('hari dikira dalam Asia/Kuala_Lumpur (selepas tengah malam KL, bukan UTC)', () => {
  // 2026-09-19 16:01 UTC = 2026-09-20 00:01 KL. UTC kata "19 Sep" (8 hari ke 27),
  // tetapi KL kata "20 Sep" (7 hari ke 27 -> amaran).
  const malamKL = Date.parse('2026-09-19T16:01:00.000Z');
  const r = ringkas(['2026-09-27'], malamKL);
  assert.equal(r.hariTinggal, 7);
  assert.equal(r.amaran, true);
});

test('hariTinggal sentiasa integer (bilangan hari penuh)', () => {
  assert.ok(Number.isInteger(ringkas(['2026-09-25']).hariTinggal));
  assert.ok(Number.isInteger(ringkas(['2026-09-19']).hariTinggal));
});

// --- Bentuk status API (kalendar object) ---
function tetapanKalendar(kalendarSekolah) {
  const data = { autoMulaGiliran: true, loginAuto: false, kalendarSekolah, originDibenarkan: ['https://sepadan.github.io'] };
  return { baca: () => ({ ...data }), tulis: (patch) => Object.assign(data, patch) };
}

test('/api/lokal/status memulangkan object `kalendar` (bentuk penuh, masa disuntik)', async () => {
  const kini = Date.parse('2026-09-20T01:00:00.000Z');
  const { pelayan, port } = await mulakanPelayanUjian({
    sekarangMs: () => kini,
    tetapan: tetapanKalendar(['2026-09-21', '2026-12-04'])
  });
  try {
    const r = await mintaMentah(port, {
      laluan: '/api/lokal/status',
      headers: { Origin: `http://127.0.0.1:${port}`, 'X-HADIR-Lokal': NONCE_UJIAN }
    });
    assert.equal(r.status, 200);
    const kal = r.json.kalendar;
    assert.ok(kal && typeof kal === 'object', 'kalendar object mesti wujud');
    assert.equal(kal.bilangan, 2);
    assert.equal(kal.pertama, '2026-09-21');
    assert.equal(kal.terakhir, '2026-12-04');
    assert.equal(kal.hariTinggal, 75);
    assert.equal(kal.amaran, false);
    assert.match(kal.sebab, /2026-12-04/);
    for (const kunci of ['bilangan', 'pertama', 'terakhir', 'hariTinggal', 'amaran', 'sebab']) {
      assert.ok(kunci in kal, 'kunci ' + kunci + ' mesti ada');
    }
  } finally { pelayan.close(); }
});

test('/api/status (klien jauh) turut memulangkan object `kalendar` baca sahaja', async () => {
  const kini = Date.parse('2026-09-20T01:00:00.000Z');
  const { pelayan, port } = await mulakanPelayanUjian({
    sekarangMs: () => kini,
    tetapan: tetapanKalendar(['2026-09-27'])
  });
  try {
    const r = await mintaMentah(port, {
      laluan: '/api/status',
      headers: { Origin: 'https://sepadan.github.io', Authorization: 'Bearer ' + TOKEN_SAH }
    });
    assert.equal(r.status, 200);
    const kal = r.json.kalendar;
    assert.ok(kal && typeof kal === 'object');
    assert.equal(kal.amaran, true);
    assert.equal(kal.hariTinggal, 7);
    assert.match(kal.sebab, /7 hari lagi/);
  } finally { pelayan.close(); }
});

// --- Laluan editor kalendar (/api/lokal/tetapan) ---
test('editor: /api/lokal/tetapan menerima tarikh tepat sah dan menyimpan', async () => {
  const kini = Date.parse('2026-09-20T01:00:00.000Z');
  const { pelayan, konteks, port } = await mulakanPelayanUjian({ sekarangMs: () => kini });
  try {
    const r = await mintaMentah(port, {
      method: 'POST', laluan: '/api/lokal/tetapan',
      headers: { Origin: `http://127.0.0.1:${port}`, 'X-HADIR-Lokal': NONCE_UJIAN, 'Content-Type': 'application/json' },
      badan: JSON.stringify({ kalendarSekolah: ['2026-09-21', '2026-09-22'] })
    });
    assert.equal(r.status, 200);
    assert.deepEqual(konteks.tetapan.baca().kalendarSekolah, ['2026-09-21', '2026-09-22']);
  } finally { pelayan.close(); }
});

test('editor: tarikh bukan tepat ditolak 400 dengan mesej server verbatim', async () => {
  const kini = Date.parse('2026-09-20T01:00:00.000Z');
  const { pelayan, port } = await mulakanPelayanUjian({ sekarangMs: () => kini });
  try {
    for (const buruk of [['bukan-tarikh'], ['2026-02-30'], ['21/09/2026'], ['2026-09-21', 'x']]) {
      const r = await mintaMentah(port, {
        method: 'POST', laluan: '/api/lokal/tetapan',
        headers: { Origin: `http://127.0.0.1:${port}`, 'X-HADIR-Lokal': NONCE_UJIAN, 'Content-Type': 'application/json' },
        badan: JSON.stringify({ kalendarSekolah: buruk })
      });
      assert.equal(r.status, 400, JSON.stringify(buruk));
      // Mesej ini mesti kekal verbatim — UI memaparkannya terus.
      assert.equal(r.json.ralat, 'kalendarSekolah mesti senarai tarikh tepat YYYY-MM-DD yang sah.');
    }
  } finally { pelayan.close(); }
});

test('editor: klien jauh TIDAK boleh menghantar kalendarSekolah (400 medan PC tempatan)', async () => {
  const { pelayan, port } = await mulakanPelayanUjian();
  try {
    const r = await mintaMentah(port, {
      method: 'POST', laluan: '/api/tetapan',
      headers: { Origin: 'https://sepadan.github.io', Authorization: 'Bearer ' + TOKEN_SAH, 'Content-Type': 'application/json' },
      badan: JSON.stringify({ kalendarSekolah: ['2026-09-21'] })
    });
    assert.equal(r.status, 400);
    assert.match(r.json.ralat, /PC companion/i);
  } finally { pelayan.close(); }
});

// --- Bentuk UI (banner + editor) ---
test('UI: banner kalendar + editor (Tambah/Buang/Simpan) wujud dan JS sah', () => {
  const html = halamanLokalHtml();
  const js = halamanLokalJs();
  for (const id of ['bannerKalendar', 'tarikhBaru', 'btnTambahTarikh', 'kalendarSekolah', 'btnSimpanKalendar', 'statusKalendar']) {
    assert.match(html, new RegExp('id="' + id + '"'), 'elemen ' + id + ' mesti wujud');
  }
  // Editor menghantar senarai penuh ke /api/lokal/tetapan (nonce header sahaja).
  assert.match(js, /kalendarSemasa/);
  // Mesej penolakan server dipaparkan verbatim (r.ralat), dan pada kegagalan
  // muatStatus TIDAK dipanggil — suntingan setempat dikekalkan supaya pemilik
  // boleh betulkan dan simpan semula (tiada tarikh hilang senyap); muatStatus
  // hanya pada kejayaan simpan (cabang `if (r.ok)`).
  assert.ok(js.includes('r.ralat'), 'mesej server dipaparkan verbatim');
  assert.ok(js.includes('if (r.ok) {'), 'muatStatus hanya pada kejayaan simpan');
  assert.match(js, /\/api\/lokal\/tetapan/);
  assert.match(js, /kalendarSekolah:\s*kalendarSemasa/);
  // Mesej penolakan server dipaparkan verbatim.
  assert.match(js, /r\.ralat \|\| 'Ralat\.'/);
  // Banner menunjukkan sebab (ayat Melayu) daripada status, jelas apabila amaran.
  assert.match(js, /banner-amaran/);
  assert.match(js, /kal\.sebab/);
  assert.doesNotThrow(() => new Function(js), 'JavaScript UI yang dijana mesti sah');
});
