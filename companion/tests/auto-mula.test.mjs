import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bolehAutoMula,
  nilaiKelayakanTugasan
} from '../src/auto-mula.mjs';

const SEKARANG = Date.parse('2026-09-21T01:00:00.000Z'); // Isnin, 09:00 Asia/Kuala_Lumpur
const SEMPADAN_PROSES = Date.parse('2026-09-21T00:30:00.000Z');

function tetapanSah(ubah = {}) {
  return {
    autoMulaGiliran: true,
    kalendarSekolah: ['2026-09-21'],
    autoMulaDiaktifkanPada: '2026-09-21T00:00:00.000Z',
    ...ubah
  };
}

function tugasanSah(ubah = {}) {
  return {
    id: 'baru', status: 'menunggu', tarikhIso: '2026-09-21',
    diciptaEpochMs: Date.parse('2026-09-21T00:50:00.000Z'),
    ...ubah
  };
}

test('auto-mula lalai OFF dan semua prasyarat mesti benar', () => {
  const asas = {
    tetapan: tetapanSah(), sekarangMs: SEKARANG, sempadanProsesMs: SEMPADAN_PROSES,
    sesiAda: true, klaimDisokong: true, rahsiaEnjinAda: true
  };
  assert.equal(bolehAutoMula(asas).boleh, true);
  assert.match(bolehAutoMula({ ...asas, tetapan: tetapanSah({ autoMulaGiliran: false }) }).sebab, /dimatikan/i);
  assert.match(bolehAutoMula({ ...asas, rahsiaEnjinAda: false }).sebab, /rahsia/i);
  assert.match(bolehAutoMula({ ...asas, klaimDisokong: null }).sebab, /klaim/i);
  assert.match(bolehAutoMula({ ...asas, sesiAda: false }).sebab, /sesi/i);
});

test('kalendar ialah allowlist tarikh tepat; kosong, tarikh tiada dan hujung minggu gagal tertutup', () => {
  const asas = {
    tetapan: tetapanSah(), sekarangMs: SEKARANG, sempadanProsesMs: SEMPADAN_PROSES,
    sesiAda: true, klaimDisokong: true, rahsiaEnjinAda: true
  };
  assert.match(bolehAutoMula({ ...asas, tetapan: tetapanSah({ kalendarSekolah: [] }) }).sebab, /kalendar/i);
  assert.match(bolehAutoMula({ ...asas, tetapan: tetapanSah({ kalendarSekolah: ['2026-09-22'] }) }).sebab, /kalendar/i);
  const sabtu = Date.parse('2026-09-19T01:00:00.000Z');
  assert.match(bolehAutoMula({ ...asas, sekarangMs: sabtu, tetapan: tetapanSah({ kalendarSekolah: ['2026-09-19'] }) }).sebab, /hujung minggu/i);
});

test('tugasan menunggu hari ini layak walau dicipta SEBELUM enjin bermula (sempadan startup/aktivasi dibuang)', () => {
  const opsyen = { tetapan: tetapanSah(), sekarangMs: SEKARANG };
  // dicipta sebelum sempadan proses (00:10) dan sebelum aktivasi opt-in
  // (23:00 hari sebelumnya = 07:00 Malaysia) — kedua-duanya kini LAYAK.
  assert.equal(nilaiKelayakanTugasan(tugasanSah({ diciptaEpochMs: Date.parse('2026-09-21T00:10:00Z') }), opsyen).boleh, true);
  assert.equal(nilaiKelayakanTugasan(tugasanSah({ diciptaEpochMs: SEMPADAN_PROSES }), opsyen).boleh, true);
  assert.equal(nilaiKelayakanTugasan(tugasanSah({ diciptaEpochMs: Date.parse('2026-09-20T23:00:00Z') }), opsyen).boleh, true);
});

test('tugasan menunggu hari ini layak walau lebih lama daripada 15 minit (had umur dibuang)', () => {
  const opsyen = { tetapan: tetapanSah(), sekarangMs: SEKARANG };
  // 00:40 — selepas sempadan/aktivasi tetapi 20 minit lebih tua daripada had
  // lama 15 minit; masih layak.
  assert.equal(nilaiKelayakanTugasan(tugasanSah({ diciptaEpochMs: Date.parse('2026-09-21T00:40:00Z') }), opsyen).boleh, true);
});

test('hanya menunggu/sedang_dihantar hari ini diterima; status selesai/tersimpan dan tarikh lain ditolak', () => {
  const opsyen = { tetapan: tetapanSah(), sekarangMs: SEKARANG };
  assert.equal(nilaiKelayakanTugasan(tugasanSah(), opsyen).boleh, true);
  // sedang_dihantar (yatim selepas crash/restart) kini LAYAK untuk pemulihan auto.
  assert.equal(nilaiKelayakanTugasan(tugasanSah({ status: 'sedang_dihantar' }), opsyen).boleh, true);
  // Sudah berjaya TIDAK PERNAH dijalankan semula; gagal/tersimpan tidak dicuba auto.
  for (const status of ['gagal', 'tersimpan', 'berjaya']) {
    assert.equal(nilaiKelayakanTugasan(tugasanSah({ status }), opsyen).boleh, false, status);
  }
  assert.match(nilaiKelayakanTugasan(tugasanSah({ tarikhIso: '2026-09-20' }), opsyen).sebab, /hari ini/i);
});

test('kewarasan cap masa dikekalkan: nilai tidak sah dan masa depan ditolak', () => {
  const opsyen = { tetapan: tetapanSah(), sekarangMs: SEKARANG };
  assert.match(nilaiKelayakanTugasan(tugasanSah({ diciptaEpochMs: '21/09/2026 08:50' }), opsyen).sebab, /penciptaan/i);
  assert.match(nilaiKelayakanTugasan(tugasanSah({ diciptaEpochMs: SEKARANG + 1 }), opsyen).sebab, /masa depan/i);
});

test('pertukaran tengah malam dan perubahan kalendar dinilai semula, bukan dicache semasa startup', () => {
  const job = tugasanSah();
  const opsyen = { tetapan: tetapanSah(), sekarangMs: SEKARANG };
  assert.equal(nilaiKelayakanTugasan(job, opsyen).boleh, true);
  const esok = Date.parse('2026-09-21T16:01:00.000Z'); // 22 Sep di Malaysia
  assert.equal(nilaiKelayakanTugasan(job, { ...opsyen, sekarangMs: esok }).boleh, false);
  assert.equal(nilaiKelayakanTugasan(job, { ...opsyen, tetapan: tetapanSah({ kalendarSekolah: [] }) }).boleh, false);
});
