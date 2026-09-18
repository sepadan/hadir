#!/usr/bin/env node
// Pembungkus CLI bagi enjin pengisian (companion/bin/jalan-push.mjs).
// Dipanggil sebagai proses ANAK oleh giliran.mjs (execFile) supaya satu
// kegagalan pelayar tidak menjatuhkan pelayan companion utama. TIDAK PERNAH
// dijalankan terhadap MOEIS/idMe hidup dalam ujian automatik — larangan keras
// brief pelaksanaan. Guna sebenar memerlukan Edge sistem + sesi idMe sedia ada
// yang hidup di dalam profil pelayar berterusan BERASINGAN (`profil-pelayar`,
// disediakan oleh bin/log-masuk-manual.mjs). Tiada fail cookie/storageState
// teks biasa digunakan atau ditulis di mana-mana.
//
// Guna: node jalan-push.mjs --mod hantar [--sahkan] [--paksa] --data-dir <laluan>
//       (payload tugasan dibaca daripada STDIN sebagai JSON; bukan argumen CLI,
//       supaya nama/butiran murid tidak muncul dalam baris arahan proses)
import { jalankanPengisian, barisHasil, kodKeluar } from '../src/moeis/push.mjs';
import { dapatkanDirData } from '../src/tetapan.mjs';

function arg(nama, lalai) {
  const i = process.argv.indexOf('--' + nama);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : lalai;
}

// Payload tugasan datang melalui STDIN (bukan argv) supaya nama/butiran murid
// tidak boleh dibaca daripada baris arahan proses oleh proses lain. Had saiz
// 256 KB cukup untuk satu kelas dan menghalang input tak terhingga.
function bacaStdinJob(hadBytes = 256 * 1024) {
  return new Promise((selesai, tolak) => {
    if (process.stdin.isTTY) { selesai(''); return; }
    let jumlah = 0;
    const bahagian = [];
    process.stdin.on('data', (c) => {
      jumlah += c.length;
      if (jumlah > hadBytes) { tolak(new Error('Payload STDIN melebihi had saiz.')); process.stdin.destroy(); return; }
      bahagian.push(c);
    });
    process.stdin.on('end', () => selesai(Buffer.concat(bahagian).toString('utf8').trim()));
    process.stdin.on('error', tolak);
  });
}

async function main() {
  const jobJson = await bacaStdinJob();
  if (!jobJson) { console.error('BERHENTI: payload tugasan diperlukan pada STDIN (JSON).'); process.exit(2); }
  let job;
  try { job = JSON.parse(jobJson); }
  catch (ralat) { console.error('BERHENTI: payload STDIN bukan JSON sah.'); process.exit(2); }
  const mod = arg('mod', 'baca');
  const sahkan = process.argv.includes('--sahkan');
  const paksa = process.argv.includes('--paksa');
  const dirData = dapatkanDirData(arg('data-dir', null));

  console.log(`Menjalankan pengisian MOEIS: kelas ${job.kelas}, tarikh ${job.tarikhIso}, mod ${mod}${sahkan ? ' (+sahkan)' : ''}${paksa ? ' (+paksa)' : ''}`);

  // Import lewat (dynamic import) supaya playwright-core hanya dimuatkan bila
  // laluan ini benar-benar dijalankan, bukan setiap kali giliran.mjs dimuatkan.
  const { bukaKonteks } = await import('../src/moeis/pelayar.mjs');
  const { buatAdaptorPlaywright } = await import('../src/moeis/adaptorPlaywright.mjs');

  const context = await bukaKonteks(dirData);
  const page = context.pages()[0] || await context.newPage();
  const adapter = buatAdaptorPlaywright(page);

  let hasil;
  try {
    hasil = await jalankanPengisian(adapter, job, { mod, sahkan, paksa });
  } finally {
    await context.close().catch(() => {});
  }

  console.log(barisHasil(hasil));
  process.exit(kodKeluar(hasil));
}

main().catch((ralat) => {
  console.error('BERHENTI (ralat teknikal):', ralat.message);
  console.log('HASIL:' + JSON.stringify({ status: 'gagal', sebab: 'Ralat teknikal: ' + ralat.message }));
  process.exit(2);
});
