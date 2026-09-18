#!/usr/bin/env node
// Proses anak: uji log masuk MOEIS/idMe TANPA menulis kehadiran
// (companion/bin/uji-login.mjs). companion TIDAK PERNAH menaip kata
// laluan/PIN/OTP dan tidak mengklik kotak semak log masuk — lihat
// src/moeis/sesi.mjs untuk logik tulen yang diuji. Sentiasa headed
// (Edge sistem menolak pelayar headless).
//
// Guna: node uji-login.mjs --data-dir <laluan> [--kunci-dijangka <teks>]
import { jalankanUjiLogin } from '../src/moeis/sesi.mjs';
import { dapatkanDirData } from '../src/tetapan.mjs';

function arg(nama, lalai) {
  const i = process.argv.indexOf('--' + nama);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : lalai;
}

async function main() {
  const dirData = dapatkanDirData(arg('data-dir', null));
  const kunciDijangka = arg('kunci-dijangka', '');

  const { bukaKonteks } = await import('../src/moeis/pelayar.mjs');
  const { buatAdaptorPlaywright } = await import('../src/moeis/adaptorPlaywright.mjs');

  const context = await bukaKonteks(dirData);
  const page = context.pages()[0] || await context.newPage();
  const adapter = buatAdaptorPlaywright(page);

  let hasil;
  try {
    hasil = await jalankanUjiLogin(adapter, { kunciDijangka });
    // Guru sudah log masuk idMe tetapi aplikasi MOEIS belum dilancarkan:
    // ikut pautan aplikasi pada portal idMe (NAVIGASI sahaja — tiada kata
    // laluan, tiada kotak semak log masuk, tiada borang dihantar), kemudian
    // semak semula. Inilah satu-satunya tindakan bukan-baca dalam ujian ini.
    if (hasil.status === 'idme-sah-moeis-belum' && typeof adapter.lancarkanAplikasiMoeis === 'function') {
      const lancar = await adapter.lancarkanAplikasiMoeis();
      if (lancar.ok) {
        const semula = await jalankanUjiLogin(adapter, { kunciDijangka });
        hasil = Object.assign({}, semula, { dilancarkan: true });
      } else {
        hasil = Object.assign({}, hasil, {
          sebab: String(hasil.sebab || '') + ' Cubaan melancarkan aplikasi gagal: ' + (lancar.sebab || 'tidak diketahui')
        });
      }
    }
  } finally {
    await context.close().catch(() => {});
  }

  console.log('HASIL:' + JSON.stringify(hasil));
  process.exit(0);
}

main().catch((ralat) => {
  console.log('HASIL:' + JSON.stringify({ status: 'gagal', sebab: 'Ralat teknikal: ' + ralat.message }));
  process.exit(2);
});
