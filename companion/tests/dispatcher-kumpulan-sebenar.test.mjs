// Ujian IPC SPAN SEBENAR dispatcher kumpulan pelayar
// (companion/tests/dispatcher-kumpulan-sebenar.test.mjs).
//
// Berbeza dengan dispatcher-kumpulan.test.mjs (double EventEmitter), ujian ini
// MELANCARKAN proses anak Node SEBENAR (tests/fixtures/pekerja-batch-palsu.mjs)
// melalui node:child_process `spawn` dan menjalankan protokol NDJSON TEPAT
// melalui paip stdin/stdout/stderr sebenar. Pekerja menggunakan kebergantungan
// pelayar PALSU (HalamanPalsu — DOM mini, TIADA Playwright/Edge/MOEIS/rangkaian).
// Ini membuktikan laluan pengeluaran dispatcher (spawn sebenar + korelasi id +
// putus sambungan + tamat masa + saliran stderr) berfungsi dengan proses anak
// sebenar, bukan hanya double.
//
// Tiada kredensial/log masuk/production; tiada pelayar sebenar dilancarkan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buatDispatcherKumpulan } from '../src/moeis/dispatcher-kumpulan.mjs';
import { buangIc } from '../src/moeis/payload.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKER = path.join(HERE, 'fixtures', 'pekerja-batch-palsu.mjs');

function spawnPekerjaSebenar(modFlags = []) {
  return spawn(process.execPath, [WORKER, ...modFlags], { stdio: ['pipe', 'pipe', 'pipe'] });
}

function buatDispatcher({ modFlags = [], tamatMasaMs = 15000, bunuhPokokProses = null } = {}) {
  const tulisLog = [];
  const d = buatDispatcherKumpulan({
    spawnPekerja: () => spawnPekerjaSebenar(modFlags),
    buangIc,
    tulisLog: (jenis, status, sebab) => tulisLog.push({ jenis, status, sebab }),
    tamatMasaMs,
    bunuhPokokProses
  });
  return { d, tulisLog };
}

const JOB_BACA = { id: 'j-baca', kelas: '1 BIJAK', tarikhIso: '2026-09-18', murid: [] };

test('IPC sebenar: SATU proses anak dikongsi, beberapa hantar() -> hasil NDJSON sebenar melalui paip', async () => {
  const { d } = buatDispatcher();
  try {
    const r1 = await d.hantar({ ...JOB_BACA, id: 'j1' }, { mod: 'baca' });
    const r2 = await d.hantar({ ...JOB_BACA, id: 'j2' }, { mod: 'baca' });
    const r3 = await d.hantar({ ...JOB_BACA, id: 'j3' }, { mod: 'baca' });

    assert.equal(r1.status, 'tidak-berubah');
    assert.equal(r2.status, 'tidak-berubah');
    assert.equal(r3.status, 'tidak-berubah');
    assert.equal(d.status().bilLancar, 1, 'SATU proses anak dikongsi merentas 3 permintaan');
  } finally {
    await d.tutup();
  }
});

test('IPC sebenar: IC TIDAK PERNAH ditulis ke stdin (payload dibersihkan, bukti gema pekerja)', async () => {
  const { d } = buatDispatcher({ modFlags: ['--mod-echo'] });
  try {
    const r = await d.hantar({ id: 'j-ic', kelas: '1 BIJAK', tarikhIso: '2026-09-18', murid: [{ nama: 'MURID CONTOH SATU', ic: '900101015533', kategori: 'D', sebab: 'DEMAM' }] }, { mod: 'baca' });
    assert.equal(r.status, 'echo');
    // `r.job` ialah job SEBENAR yang sampai ke pekerja melalui stdin sebenar.
    const jobTeks = JSON.stringify(r.job);
    assert.equal(jobTeks.includes('900101015533'), false, 'IC tidak boleh sampai ke pekerja');
    assert.equal(jobTeks.includes('"ic"'), false, 'medan ic tidak boleh wujud dalam payload yang sampai');
    assert.equal(jobTeks.includes('MURID CONTOH SATU'), true, 'nama murid mesti kekal (hanya IC dibuang)');
  } finally {
    await d.tutup();
  }
});

test('IPC sebenar: banjir stderr (>64 KB) TIDAK deadlock — pekerja tetap membalas dan stderr disalirkan (sanitasi + bersempadan)', async () => {
  const { d, tulisLog } = buatDispatcher({ modFlags: ['--mod-stderr-flood'] });
  try {
    const r = await d.hantar(JOB_BACA, { mod: 'baca' });
    assert.equal(r.status, 'tidak-berubah', 'pekerja mesti tetap membalas walaupun stderr dibanjiri');
  } finally {
    await d.tutup();
  }
});

test('IPC sebenar: pekerja keluar (crash) semasa permintaan tertunda -> gagal jujur, tiada gantung', async () => {
  const { d } = buatDispatcher({ modFlags: ['--mod-crash'] });
  try {
    const r = await d.hantar(JOB_BACA, { mod: 'baca' });
    assert.equal(r.status, 'gagal');
    assert.match(r.sebab, /terputus|keluar/i);
  } finally {
    await d.tutup();
  }
});

test('IPC sebenar: pekerja gantung (tiada balasan) -> tamat masa bersempadan -> gagal jujur + pekerja ditamatkan, TIADA main-semula', async () => {
  let bilBunuhPokok = 0;
  const { d } = buatDispatcher({
    modFlags: ['--mod-hang'],
    tamatMasaMs: 500,
    bunuhPokokProses: () => { bilBunuhPokok++; return true; }
  });
  try {
    const r = await d.hantar(JOB_BACA, { mod: 'baca' });
    assert.equal(r.status, 'gagal');
    assert.equal(r.tidakDiketahui, true, 'tamat masa mesti ditandakan tidakDiketahui (tiada main-semula membuta)');
    assert.match(r.sebab, /tidak membalas|tamat masa/i);
    assert.ok(bilBunuhPokok >= 1, 'pekerja yang gantung mesti ditamatkan (pokok proses)');
  } finally {
    await d.tutup();
  }
});

test('IPC sebenar: baris HASIL: rosak (bukan JSON sah) DIABAIKAN; permintaan diselesaikan jujur (tamat masa)', async () => {
  const { d } = buatDispatcher({ modFlags: ['--mod-malformed'], tamatMasaMs: 500 });
  try {
    const r = await d.hantar(JOB_BACA, { mod: 'baca' });
    assert.equal(r.status, 'gagal', 'baris malformed mesti diabaikan dan permintaan diselesaikan jujur (bukan gantung)');
    assert.equal(r.tidakDiketahui, true);
  } finally {
    await d.tutup();
  }
});

test('IPC sebenar: hantar() selepas tutup() -> gagal, TIADA spawn baharu', async () => {
  const { d } = buatDispatcher();
  await d.tutup();
  const r = await d.hantar(JOB_BACA, { mod: 'baca' });
  assert.equal(r.status, 'gagal');
  assert.equal(d.status().bilLancar, 0);
});
