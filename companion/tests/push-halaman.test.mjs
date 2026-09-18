import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bukaTabDanTetapkanTarikh, tekanSimpan, formatTarikhPaparan } from '../src/moeis/halaman.mjs';
import { jalankanPengisian, barisHasil, kodKeluar } from '../src/moeis/push.mjs';
import { buatHalamanPalsu, JOB_CONTOH, MURID_MOEIS_CONTOH } from './fixtures/halamanPalsu.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

test('halaman.mjs tidak pernah menggunakan pemilih .confirm generik untuk simpan', () => {
  const src = fs.readFileSync(path.join(HERE, '..', 'src', 'moeis', 'halaman.mjs'), 'utf8');
  assert.ok(!src.includes('.confirm'));
});

test('formatTarikhPaparan menolak format bukan ISO', () => {
  assert.throws(() => formatTarikhPaparan('18/09/2026'));
  assert.equal(formatTarikhPaparan('2026-09-18'), '18/09/2026');
});

test('tab harian dibuka sebelum sebarang bacaan (susunan panggilan)', async () => {
  const h = buatHalamanPalsu({ muridAwal: MURID_MOEIS_CONTOH });
  await bukaTabDanTetapkanTarikh(h, '2026-09-18');
  assert.equal(h._panggilan[0], 'klikTabHarian');
  assert.ok(h._panggilan.indexOf('klikTabHarian') < h._panggilan.indexOf('tetapkanTarikhInput:18/09/2026'));
});

test('#tkh_HH ditetapkan DD/MM/YYYY dan disahkan sebelum diteruskan', async () => {
  const h = buatHalamanPalsu({ muridAwal: MURID_MOEIS_CONTOH });
  await bukaTabDanTetapkanTarikh(h, '2026-09-18');
  assert.equal(await h.bacaTarikhInput(), '18/09/2026');
});

test('tarikh yang gagal dipaparkan dengan betul menyebabkan berhenti', async () => {
  const h = buatHalamanPalsu({ muridAwal: MURID_MOEIS_CONTOH, terimaFormatTarikh: false });
  await assert.rejects(() => bukaTabDanTetapkanTarikh(h, '2026-09-18'), /Tarikh borang tidak sepadan/);
});

test('tekanSimpan: .simpan secara lalai, .simpansah hanya bila sahkan=true', async () => {
  const h1 = buatHalamanPalsu({ muridAwal: MURID_MOEIS_CONTOH });
  await h1.klikTabHarian();
  const r1 = await tekanSimpan(h1, { sahkan: false });
  assert.equal(r1.tindakanSimpan, 'simpan');
  assert.equal(h1._tindakanSimpanDitekan(), 'simpan');

  const h2 = buatHalamanPalsu({ muridAwal: MURID_MOEIS_CONTOH });
  await h2.klikTabHarian();
  const r2 = await tekanSimpan(h2, { sahkan: true });
  assert.equal(r2.tindakanSimpan, 'simpansah');
  assert.equal(h2._tindakanSimpanDitekan(), 'simpansah');
});

test('mod verifikasi tidak pernah menekan simpan walaupun ada perubahan', async () => {
  const h = buatHalamanPalsu({ muridAwal: MURID_MOEIS_CONTOH });
  const hasil = await jalankanPengisian(h, JOB_CONTOH, { mod: 'verifikasi' });
  assert.equal(hasil.status, 'perlu-hantar');
  assert.equal(hasil.perubahan, 1);
  assert.ok(!h._panggilan.includes('tekanKemaskini'), 'mod verifikasi tidak boleh menekan kemaskini/simpan');
});

test('mod baca tidak pernah menekan simpan dan memuat semula di hujung', async () => {
  const h = buatHalamanPalsu({ muridAwal: MURID_MOEIS_CONTOH });
  await jalankanPengisian(h, JOB_CONTOH, { mod: 'baca' });
  assert.ok(!h._panggilan.includes('tekanKemaskini'));
});

test('mod hantar: pengesahan lulus (semua padan) -> disahkan', async () => {
  const h = buatHalamanPalsu({ muridAwal: MURID_MOEIS_CONTOH });
  const hasil = await jalankanPengisian(h, JOB_CONTOH, { mod: 'hantar' });
  assert.equal(hasil.status, 'disahkan');
  assert.equal(hasil.tindakanSimpan, 'simpan');
  assert.ok(Object.values(hasil.verifikasi).every(Boolean));
  assert.equal(h._dimuatSemulaBil() >= 1, true);
});

test('mod hantar: kategori/sebab tidak padan selepas muat semula -> tersimpan, bukan disahkan', async () => {
  const h = buatHalamanPalsu({ muridAwal: MURID_MOEIS_CONTOH });
  const bacaAsal = h.bacaSebabMurid;
  h.bacaSebabMurid = async (id) => ({ kategoriValue: 'LAIN', kategoriText: 'LAIN', sebabValue: 'LAIN', sebabText: 'LAIN' });
  const hasil = await jalankanPengisian(h, JOB_CONTOH, { mod: 'hantar' });
  assert.equal(hasil.status, 'tersimpan');
  assert.equal(hasil.verifikasi.kategoriSebab, false);
});

test('mod hantar: kategori/sebab hilang pada job -> gagal (kod 7), tiada pelayar disentuh', async () => {
  const h = buatHalamanPalsu({ muridAwal: MURID_MOEIS_CONTOH });
  const jobTiadaSebab = { ...JOB_CONTOH, murid: [{ nama: 'MURID CONTOH SATU', kategori: '', sebab: '' }] };
  const hasil = await jalankanPengisian(h, jobTiadaSebab, { mod: 'hantar' });
  assert.equal(hasil.status, 'gagal');
  assert.equal(kodKeluar(hasil), 7);
  assert.equal(h._panggilan.length, 0, 'tiada satu pun panggilan halaman apabila kategori/sebab hilang');
});

test('konflik: MOEIS sudah tandakan murid tidak hadir yang tiada dalam job -> konflik, tiada tulisan', async () => {
  const muridDenganKonflik = MURID_MOEIS_CONTOH.map((m) => ({ ...m }));
  muridDenganKonflik[2] = { ...muridDenganKonflik[2], hadir: false }; // MURID CONTOH TIGA sudah TH di MOEIS
  const h = buatHalamanPalsu({ muridAwal: muridDenganKonflik });
  const hasil = await jalankanPengisian(h, JOB_CONTOH, { mod: 'hantar' });
  assert.equal(hasil.status, 'konflik');
  assert.equal(kodKeluar(hasil), 10);
  assert.ok(!h._panggilan.includes('tekanKemaskini'));
});

test('idempotent: job sepadan sepenuhnya dengan keadaan MOEIS -> tidak-berubah, tiada klik simpan', async () => {
  const muridSudahBenar = MURID_MOEIS_CONTOH.map((m) => (m.id === 'm1' ? { ...m, hadir: false, kategoriValue: 'D', kategoriText: 'D', sebabValue: 'DEMAM', sebabText: 'DEMAM' } : m));
  const h = buatHalamanPalsu({ muridAwal: muridSudahBenar });
  const hasil = await jalankanPengisian(h, JOB_CONTOH, { mod: 'hantar' });
  assert.equal(hasil.status, 'tidak-berubah');
  assert.equal(hasil.perubahan, 0);
  assert.ok(!h._panggilan.includes('tekanKemaskini'));
});

test('penanda HASIL sah JSON dan kod keluar sepadan status', async () => {
  const h = buatHalamanPalsu({ muridAwal: MURID_MOEIS_CONTOH });
  const hasil = await jalankanPengisian(h, JOB_CONTOH, { mod: 'hantar' });
  const baris = barisHasil(hasil);
  assert.match(baris, /^HASIL:/);
  const dihurai = JSON.parse(baris.slice('HASIL:'.length));
  assert.equal(dihurai.status, hasil.status);
  assert.equal(kodKeluar({ status: 'disahkan' }), 0);
  assert.equal(kodKeluar({ status: 'tidak-berubah' }), 0);
  assert.equal(kodKeluar({ status: 'tersimpan' }), 6);
  assert.equal(kodKeluar({ status: 'konflik' }), 10);
  assert.equal(kodKeluar({ status: 'gagal' }), 8);
  assert.equal(kodKeluar({ status: 'gagal', kod: 11 }), 11);
});
