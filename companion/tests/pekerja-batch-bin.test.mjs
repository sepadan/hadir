// Ujian SMOKE bin produksi pekerja kumpulan pelayar
// (companion/tests/pekerja-batch-bin.test.mjs).
//
// Membuktikan PENDAWAIAN kebergantungan bin/pekerja-batch.mjs PRODUKSI (bukan
// salinan palsu) adalah betul: import lewat pelayar (playwright-core) muat,
// `buatPekerjaBatch` + `jalankanPekerjaNdjson` disambung dengan betul, dan
// laluan EOF -> tutup -> exit(0) bersih berfungsi — TANPA melancarkan pelayar
// sebenar dan TANPA menyentuh portal/kredensial. `bukaKonteks` adalah MALAS
// (hanya dipanggil pada tugasan PERTAMA), jadi menutup stdin serta-merta tanpa
// sebarang job mesti menamatkan proses dengan kod 0 dan TIDAK melancarkan Edge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(HERE, '..', 'bin', 'pekerja-batch.mjs');

function dirDataSementara() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hadir-bin-smoke-'));
}

test('bin produksi: pendawaian betul — EOF tanpa job menamatkan proses bersih (kod 0), tiada pelayar dilancar', async () => {
  const dirData = dirDataSementara();
  const anak = spawn(process.execPath, [BIN, '--data-dir', dirData], { stdio: ['pipe', 'pipe', 'pipe'] });

  let stderr = '';
  anak.stderr.on('data', (c) => { stderr += c.toString('utf8'); });

  // Tutup stdin serta-merta (EOF) — tiada job dihantar, jadi bukaKonteks (Edge)
  // TIDAK PERNAH dipanggil.
  anak.stdin.end();

  const kod = await new Promise((selesai) => anak.on('exit', (k) => selesai(k)));
  try { fs.rmSync(dirData, { recursive: true, force: true }); } catch {}

  assert.equal(kod, 0, 'bin mesti keluar bersih pada EOF tanpa job (stderr: ' + stderr.trim() + ')');
});

test('bin produksi: menolak baris stdin tidak sah dan keluar bersih (protokol tertutup)', async () => {
  const dirData = dirDataSementara();
  const anak = spawn(process.execPath, [BIN, '--data-dir', dirData], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  anak.stderr.on('data', (c) => { stderr += c.toString('utf8'); });

  // Hantar baris tidak sah sahaja (bukan JSON), kemudian EOF.
  anak.stdin.write('bukan-json\n');
  anak.stdin.end();

  const kod = await new Promise((selesai) => anak.on('exit', (k) => selesai(k)));
  try { fs.rmSync(dirData, { recursive: true, force: true }); } catch {}

  assert.equal(kod, 0, 'baris stdin tidak sah mesti diabaikan dan proses keluar bersih (stderr: ' + stderr.trim() + ')');
});
