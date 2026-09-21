#!/usr/bin/env node
// Pembungkus CLI bagi pekerja KUMPULAN pelayar (companion/bin/pekerja-batch.mjs).
//
// Berbeza daripada jalan-push.mjs (satu proses = satu tugasan): proses ini
// BERTERUSAN sepanjang hayat satu kumpulan (satu kitaran giliran) dan
// memproses BEBERAPA tugasan berurutan terhadap SATU konteks pelayar dikongsi
// (Option 2, seni bina diluluskan) — bukan melancarkan Edge sejuk bagi setiap
// tugasan.
//
// Dilancarkan sebagai proses ANAK BERTERUSAN oleh
// src/moeis/dispatcher-kumpulan.mjs (melalui spawnPekerja yang disuntik oleh
// bin/hadir-companion.mjs) — bukan execFile satu-tembakan.
//
// Payload job (nama/kategori/sebab murid tidak hadir) datang melalui STDIN
// SAHAJA — sama seperti jalan-push.mjs, TIDAK PERNAH melalui argumen CLI. IC
// sudah dibuang oleh dispatcher SEBELUM ditulis ke stdin (src/moeis/payload.mjs
// buangIc), bukan di sini.
//
// Gelung protokol NDJSON sebenar hidup dalam modul BERSAMA
// src/moeis/pekerja-ndjson.mjs (diimport oleh fail ini DAN oleh fixture ujian)
// supaya pelari produksi yang sama diuji. Fail ini hanya membekalkan
// kebergantungan pelayar PRODUKSI (bukaKonteks/buatAdaptorPlaywright sebenar)
// kepada pelari itu.
import { jalankanPekerjaNdjson } from '../src/moeis/pekerja-ndjson.mjs';
import { buatPekerjaBatch } from '../src/moeis/pekerja-batch.mjs';
import { dapatkanDirData } from '../src/tetapan.mjs';

function arg(nama, lalai) {
  const i = process.argv.indexOf('--' + nama);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : lalai;
}

const dirData = dapatkanDirData(arg('data-dir', null));

async function main() {
  // Import lewat (dynamic import) — sama sebab seperti jalan-push.mjs: elak
  // memuatkan playwright-core kecuali laluan ini benar-benar dijalankan.
  const { bukaKonteks } = await import('../src/moeis/pelayar.mjs');
  const { buatAdaptorPlaywright } = await import('../src/moeis/adaptorPlaywright.mjs');

  const pekerja = buatPekerjaBatch({
    bukaKonteks,
    buatAdaptorPlaywright,
    dirData
  });

  await jalankanPekerjaNdjson({
    stdin: process.stdin,
    stdout: process.stdout,
    jalankanTugas: (job, opsyen) => pekerja.jalankan(job, opsyen),
    tutup: () => pekerja.tutup()
  }).then((bersih) => process.exit(bersih ? 0 : 1));
}

main().catch(async (ralat) => {
  console.error('BERHENTI (ralat teknikal pekerja kumpulan):', ralat && ralat.message);
  process.exit(2);
});
