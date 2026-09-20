import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  UMUR_MAKS_TUGASAN_MINIT,
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

test('hanya menunggu hari ini dengan cap penciptaan sah selepas kedua-dua sempadan diterima', () => {
  const opsyen = { tetapan: tetapanSah(), sekarangMs: SEKARANG, sempadanProsesMs: SEMPADAN_PROSES };
  assert.equal(nilaiKelayakanTugasan(tugasanSah(), opsyen).boleh, true);
  for (const status of ['gagal', 'tersimpan', 'sedang_dihantar', 'berjaya']) {
    assert.equal(nilaiKelayakanTugasan(tugasanSah({ status }), opsyen).boleh, false, status);
  }
  assert.match(nilaiKelayakanTugasan(tugasanSah({ tarikhIso: '2026-09-20' }), opsyen).sebab, /hari ini/i);
  assert.match(nilaiKelayakanTugasan(tugasanSah({ diciptaEpochMs: '21\/09\/2026 08:50' }), opsyen).sebab, /penciptaan/i);
  assert.match(nilaiKelayakanTugasan(tugasanSah({ diciptaEpochMs: SEMPADAN_PROSES }), opsyen).sebab, /sempadan/i);
  assert.match(nilaiKelayakanTugasan(tugasanSah({ diciptaEpochMs: Date.parse('2026-09-21T00:10:00Z') }), opsyen).sebab, /sempadan/i);
});

test(`umur maksimum konservatif ialah ${UMUR_MAKS_TUGASAN_MINIT} minit dan cap masa masa depan ditolak`, () => {
  const opsyen = { tetapan: tetapanSah(), sekarangMs: SEKARANG, sempadanProsesMs: SEMPADAN_PROSES };
  const terlaluLama = SEKARANG - (UMUR_MAKS_TUGASAN_MINIT * 60 * 1000) - 1;
  assert.match(nilaiKelayakanTugasan(tugasanSah({ diciptaEpochMs: terlaluLama }), opsyen).sebab, /terlalu lama/i);
  assert.match(nilaiKelayakanTugasan(tugasanSah({ diciptaEpochMs: SEKARANG + 1 }), opsyen).sebab, /masa depan/i);
});

test('pertukaran tengah malam dan perubahan kalendar dinilai semula, bukan dicache semasa startup', () => {
  const job = tugasanSah();
  const opsyen = { tetapan: tetapanSah(), sekarangMs: SEKARANG, sempadanProsesMs: SEMPADAN_PROSES };
  assert.equal(nilaiKelayakanTugasan(job, opsyen).boleh, true);
  const esok = Date.parse('2026-09-21T16:01:00.000Z'); // 22 Sep di Malaysia
  assert.equal(nilaiKelayakanTugasan(job, { ...opsyen, sekarangMs: esok }).boleh, false);
  assert.equal(nilaiKelayakanTugasan(job, { ...opsyen, tetapan: tetapanSah({ kalendarSekolah: [] }) }).boleh, false);
});

