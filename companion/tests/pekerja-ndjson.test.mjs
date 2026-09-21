// Ujian pelari NDJSON pekerja kumpulan pelayar (companion/src/moeis/pekerja-ndjson.mjs).
//
// Pelari PRODUKSI yang SAMA digunakan oleh bin/pekerja-batch.mjs dan oleh
// fixture ujian — ujian ini memacu pelari secara langsung dengan kebergantungan
// PALSU (stdin/stdout tiruan, `jalankanTugas`/`tutup` disuntik) supaya gelung
// protokol sebenar (bukan salinan) terbukti betul tanpa Playwright/Edge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { jalankanPekerjaNdjson } from '../src/moeis/pekerja-ndjson.mjs';

function buatStdinPalsu() {
  const stdin = new EventEmitter();
  stdin._tulis = (s) => stdin.emit('data', Buffer.from(s, 'utf8'));
  stdin._tamat = () => stdin.emit('end');
  stdin._ralat = (e) => stdin.emit('error', e);
  return stdin;
}

function buatStdoutPalsu() {
  const baris = [];
  return {
    write(s, cb) { baris.push(String(s)); if (cb) cb(); },
    _baris: baris
  };
}

function jalankan({ stdin, baris, jalankanTugas, tutup }) {
  const stdout = buatStdoutPalsu();
  const janji = jalankanPekerjaNdjson({ stdin, stdout, jalankanTugas, tutup });
  // Suap semua baris sekaligus kemudian tutup stdin.
  for (const b of baris) stdin._tulis(b);
  stdin._tamat();
  return { janji, stdout };
}

test('pekerja-ndjson: beberapa baris diproses SATU-SATU berurutan dan HASIL: ditulis betul', async () => {
  const stdin = buatStdinPalsu();
  const panggilan = [];
  const { janji, stdout } = jalankan({
    stdin,
    baris: [
      '{"id":"1","job":{"id":"a"},"opsyen":{"mod":"x"}}\n',
      '{"id":"2","job":{"id":"b"},"opsyen":{"mod":"y"}}\n'
    ],
    jalankanTugas: async (job, opsyen) => {
      panggilan.push({ job: job.id, mod: opsyen.mod });
      return { status: 'ok', job: job.id };
    },
    tutup: async () => {}
  });
  await janji;
  assert.deepEqual(panggilan, [
    { job: 'a', mod: 'x' },
    { job: 'b', mod: 'y' }
  ], 'tugasan mesti diproses berurutan mengikut tertib input');
  const hasilBaris = stdout._baris.filter((b) => b.startsWith('HASIL:'));
  assert.equal(hasilBaris.length, 2);
  const pertama = JSON.parse(hasilBaris[0].slice('HASIL:'.length));
  assert.equal(pertama.id, '1');
  assert.equal(pertama.hasil.status, 'ok');
});

test('pekerja-ndjson: baris JSON tidak sah DIABAIKAN (tidak dibalas, tidak lontar)', async () => {
  const stdin = buatStdinPalsu();
  const panggilan = [];
  const { janji, stdout } = jalankan({
    stdin,
    baris: ['bukan-json\n', '{"id":"1","job":{}}\n'],
    jalankanTugas: async () => { panggilan.push(1); return { status: 'ok' }; },
    tutup: async () => {}
  });
  await janji;
  assert.equal(panggilan.length, 1, 'baris tidak sah mesti diabaikan sepenuhnya');
  assert.equal(stdout._baris.filter((b) => b.startsWith('HASIL:')).length, 1);
});

test('pekerja-ndjson: ralat jalankanTugas -> HASIL: gagal (bukan lontaran ke atas)', async () => {
  const stdin = buatStdinPalsu();
  const { janji, stdout } = jalankan({
    stdin,
    baris: ['{"id":"9","job":{}}\n'],
    jalankanTugas: async () => { throw new Error('letup ujian'); },
    tutup: async () => {}
  });
  await janji;
  const hasil = JSON.parse(stdout._baris[0].slice('HASIL:'.length));
  assert.equal(hasil.id, '9');
  assert.equal(hasil.hasil.status, 'gagal');
  assert.match(hasil.hasil.sebab, /letup ujian/);
});

test('pekerja-ndjson: EOF menutup konteks (tutup dipanggil SEKALI sahaja)', async () => {
  const stdin = buatStdinPalsu();
  let bilTutup = 0;
  const { janji } = jalankan({
    stdin,
    baris: ['{"id":"1","job":{}}\n'],
    jalankanTugas: async () => ({ status: 'ok' }),
    tutup: async () => { bilTutup++; }
  });
  await janji;
  assert.equal(bilTutup, 1, 'tutup() mesti dipanggil tepat sekali pada EOF');
});

test('pekerja-ndjson: baris dibelah pada \n (bukan memerlukan EOF penuh) — mesej berbilang dalam satu chunk', async () => {
  const stdin = buatStdinPalsu();
  const panggilan = [];
  const { janji, stdout } = jalankan({
    stdin,
    baris: ['{"id":"1","job":{}}\n{"id":"2","job":{}}\n'], // dua mesej dalam satu chunk
    jalankanTugas: async () => { panggilan.push(1); return { status: 'ok' }; },
    tutup: async () => {}
  });
  await janji;
  assert.equal(panggilan.length, 2);
  assert.equal(stdout._baris.filter((b) => b.startsWith('HASIL:')).length, 2);
});

test('pekerja-ndjson: ralat stdin (EPIPE) menamatkan pelari dan masih memanggil tutup()', async () => {
  const stdin = buatStdinPalsu();
  let bilTutup = 0;
  const janji = jalankanPekerjaNdjson({
    stdin,
    stdout: buatStdoutPalsu(),
    jalankanTugas: async () => ({ status: 'ok' }),
    tutup: async () => { bilTutup++; }
  });
  stdin._ralat(new Error('EPIPE'));
  await janji;
  assert.equal(bilTutup, 1, 'tutup() mesti tetap dipanggil walaupun stdin ralat');
});

test('pekerja-ndjson: ack BERSIH:{} dipancarkan SELEPAS tutup() selesai (close bersih)', async () => {
  const stdin = buatStdinPalsu();
  let tutupSelesai = false;
  const { janji, stdout } = jalankan({
    stdin,
    baris: ['{"id":"1","job":{}}\n'],
    jalankanTugas: async () => ({ status: 'ok' }),
    tutup: async () => { tutupSelesai = true; }
  });
  const bersih = await janji;
  assert.equal(bersih, true);
  const adaAck = stdout._baris.some((b) => b.startsWith('BERSIH:'));
  assert.equal(adaAck, true, 'ack BERSIH: mesti dipancarkan selepas tutup() selesai');
});

test('pekerja-ndjson: tutup() pulang false -> TIADA ack BERSIH (close gagal, pulangan false)', async () => {
  const stdin = buatStdinPalsu();
  const { janji, stdout } = jalankan({
    stdin,
    baris: ['{"id":"1","job":{}}\n'],
    jalankanTugas: async () => ({ status: 'ok' }),
    tutup: async () => false
  });
  const bersih = await janji;
  assert.equal(bersih, false);
  assert.equal(stdout._baris.some((b) => b.startsWith('BERSIH:')), false, 'tiada ack jika tutup() gagal');
});
