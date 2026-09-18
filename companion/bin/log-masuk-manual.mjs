#!/usr/bin/env node
// Proses anak: buka Edge headed dan tunggu MANUSIA log masuk idMe sendiri
// (companion/bin/log-masuk-manual.mjs). companion TIDAK menaip apa-apa dan
// TIDAK mengklik butang log masuk — hanya memerhati (poll setiap 5 saat)
// sehingga URL berada pada moeispel.moe.gov.my DAN elemen #kehadiran wujud,
// bermakna guru sudah selesai log masuk sendiri. Had masa 20 minit.
//
// Guna: node log-masuk-manual.mjs --data-dir <laluan>
import { dapatkanDirData } from '../src/tetapan.mjs';

function arg(nama, lalai) {
  const i = process.argv.indexOf('--' + nama);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : lalai;
}

const URL_KEHADIRAN_HARIAN = 'https://moeispel.moe.gov.my/sahsiah/kehadiran/pkhem/tabguru';
const HAD_MASA_MS = 20 * 60 * 1000;
const JEDA_POLL_MS = 5000;
const jeda = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const dirData = dapatkanDirData(arg('data-dir', null));

  const { bukaKonteks } = await import('../src/moeis/pelayar.mjs');
  const context = await bukaKonteks(dirData);
  const page = context.pages()[0] || await context.newPage();

  await page.goto(URL_KEHADIRAN_HARIAN, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});

  const mula = Date.now();
  let berjaya = false;
  while (Date.now() - mula < HAD_MASA_MS) {
    const url = page.url();
    if (/moeispel\.moe\.gov\.my/i.test(url)) {
      const adaKehadiran = await page.evaluate(() => !!document.querySelector('#kehadiran')).catch(() => false);
      if (adaKehadiran) { berjaya = true; break; }
    }
    await jeda(JEDA_POLL_MS);
  }

  if (!berjaya) {
    await context.close().catch(() => {});
    console.log('HASIL:' + JSON.stringify({ status: 'tamat-masa' }));
    process.exit(0);
    return;
  }

  await context.close().catch(() => {});
  // PENTING (penemuan semakan bebas): JANGAN tulis `storageState` ke fail.
  // Cookie sesi idMe/MOEIS akan menjadi JSON teks biasa di cakera dan itu
  // menurunkan taraf kelayakan log masuk (profil Chromium sudah menyimpannya
  // disulit DPAPI per-pengguna). Sesi kekal dalam profil berterusan
  // `profil-pelayar` sahaja, dan enjin pengisian juga menggunakan profil itu.
  console.log('HASIL:' + JSON.stringify({
    status: 'sesi-aktif-dalam-profil',
    nota: 'Sesi disimpan dalam profil pelayar berasingan (disulit DPAPI oleh Chromium). Tiada fail cookie teks biasa ditulis.'
  }));
  process.exit(0);
}

main().catch((ralat) => {
  console.log('HASIL:' + JSON.stringify({ status: 'gagal', sebab: ralat.message }));
  process.exit(2);
});
