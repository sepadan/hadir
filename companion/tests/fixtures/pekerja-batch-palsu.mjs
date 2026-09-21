#!/usr/bin/env node
// Pekerja kumpulan pelayar PALSU untuk ujian IPC (companion/tests/fixtures/pekerja-batch-palsu.mjs).
//
// Menggunakan pelari protokol NDJSON PRODUKSI yang SAMA
// (src/moeis/pekerja-ndjson.mjs) seperti bin/pekerja-batch.mjs — hanya
// kebergantungan pelayar yang PALSU: `bukaKonteks`/`buatAdaptorPlaywright`
// disuntik sebagai double (HalamanPalsu — DOM mini dalam ingatan, TIADA
// Playwright/Edge/MOEIS/rangkaian). Ini membolehkan pelari PRODUKSI diuji
// terhadap proses anak SEBENAR (spawn sebenar + paip sebenar + protokol
// NDJSON sebenar) dengan kebergantungan tempatan palsu sahaja.
//
// MOD KESALAHAN (untuk ujian IPC dispatcher, HANYA melalui flag `--mod-*`):
//   --mod-stderr-flood : banjir stderr (untuk uji drain stderr tiada deadlock)
//   --mod-hang         : terima permintaan tetapi TIDAK pernah membalas
//   --mod-crash        : keluar serta-merta dengan kod bukan sifar
//   --mod-malformed    : tulis baris HASIL: yang rosak (bukan JSON sah)
// Tiada mod ini boleh dipilih daripada jauh (ini fail ujian tempatan sahaja);
// bin/pekerja-batch.mjs pengeluaran TIDAK membaca sebarang flag `--mod-*`.
import { jalankanPekerjaNdjson } from '../../src/moeis/pekerja-ndjson.mjs';
import { buatPekerjaBatch } from '../../src/moeis/pekerja-batch.mjs';
import { buatHalamanPalsu, MURID_MOEIS_CONTOH } from './halamanPalsu.mjs';

function modDipilih() {
  if (process.argv.includes('--mod-stderr-flood')) return 'stderr-flood';
  if (process.argv.includes('--mod-hang')) return 'hang';
  if (process.argv.includes('--mod-crash')) return 'crash';
  if (process.argv.includes('--mod-malformed')) return 'malformed';
  if (process.argv.includes('--mod-echo')) return 'echo';
  return 'normal';
}

const mod = modDipilih();

// Konteks palsu: satu konteks dikongsi, setiap tugasan dapat halaman "baharu".
const pekerja = buatPekerjaBatch({
  bukaKonteks: async () => ({ async newPage() { return { async close() {} }; }, async close() {} }),
  buatAdaptorPlaywright: (halaman) => buatHalamanPalsu({ muridAwal: MURID_MOEIS_CONTOH }),
  dirData: 'ujian'
});

// Kebergantungan tugas yang disuntik ke pelari PRODUKSI. Mod kesalahan
// disimulasikan DI SINI (kebergantungan palsu), bukan dalam pelari.
function jalankanTugas(job, opsyen) {
  if (mod === 'crash') { process.exit(3); return; }
  if (mod === 'hang') return new Promise(() => {}); // tidak pernah membalas (uji tamat masa)
  if (mod === 'malformed') {
    // Tulis baris HASIL: rosak (JSON tidak sah, berakhir baris) kemudian
    // GANTUNG supaya tiada HASIL sah menyusul — dispatcher mesti mengabaikan
    // baris rosak dan menyelesaikan permintaan secara jujur (tamat masa).
    process.stdout.write('HASIL:{bukan-json-sah}\n');
    return new Promise(() => {});
  }
  if (mod === 'echo') {
    // Gema balik job SEPERTI YANG DITERIMA (bukti end-to-end apa yang sampai
    // melalui stdin sebenar) — tanpa memproses/memanggil pelayar.
    return Promise.resolve({ status: 'echo', job });
  }
  if (mod === 'stderr-flood') {
    // Banjir stderr melebihi penimbal paip (64 KB) — jika induk tidak
    // mengonsumsi stderr, tulisan ini akan DEADLOCK. 200 x 1 KB = 200 KB.
    for (let i = 0; i < 200; i++) process.stderr.write('S'.repeat(1000));
  }
  return pekerja.jalankan(job, opsyen);
}

await jalankanPekerjaNdjson({
  stdin: process.stdin,
  stdout: process.stdout,
  jalankanTugas,
  tutup: () => pekerja.tutup()
}).then((bersih) => process.exit(bersih ? 0 : 1));
