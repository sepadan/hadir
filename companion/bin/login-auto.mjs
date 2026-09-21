#!/usr/bin/env node
// Proses anak: log masuk idMe AUTOMATIK opt-in (companion/bin/login-auto.mjs).
//
// SATU-SATUNYA tempat companion menaip kredensial idMe. Dijalankan HANYA
// daripada pelayan `serve` selepas pengawal startup lulus (suis loginAuto ON,
// kredensial ada, sesi tidak sah, had cubaan belum tercapai). Kredensial
// dibaca daripada vault DPAPI DALAM proses anak ini; nilai TIDAK PERNAH dilog,
// dipulangkan, atau disalurkan melalui argumen CLI/env.
//
// Guna: node login-auto.mjs --data-dir <laluan>
import { dapatkanDirData, bacaTetapan } from '../src/tetapan.mjs';
import { buatStoranKredensial } from '../src/kredensial.mjs';
import { jalankanLoginAuto } from '../src/moeis/login-auto.mjs';
import { buatLog } from '../src/log.mjs';

function arg(nama, lalai) {
  const i = process.argv.indexOf('--' + nama);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : lalai;
}

async function main() {
  const dirData = dapatkanDirData(arg('data-dir', null));
  const store = buatStoranKredensial({ dirData });

  // Baca kredensial penuh di sini sahaja; nilai kekal dalam proses ini.
  let kred = null;
  try {
    kred = store.baca();
  } catch (ralat) {
    console.log('HASIL:' + JSON.stringify({
      status: 'gagal', perluManusia: true,
      sebab: 'Kredensial tidak dapat dibaca (vault rosak?): ' + ralat.message
    }));
    process.exit(0);
    return;
  }
  if (!kred || !kred.pengguna || !kred.kataLaluan || !kred.kunciKeselamatan) {
    console.log('HASIL:' + JSON.stringify({
      status: 'tiada-kredensial', perluManusia: true,
      sebab: 'Kredensial idMe belum disimpan atau tidak lengkap.'
    }));
    process.exit(0);
    return;
  }

  const { bukaKonteks } = await import('../src/moeis/pelayar.mjs');
  const { buatAdaptorPlaywright } = await import('../src/moeis/adaptorPlaywright.mjs');

  const context = await bukaKonteks(dirData);
  const page = context.pages()[0] || await context.newPage();
  const log = buatLog({ dirData });
  const adapter = buatAdaptorPlaywright(page, {
    dirData,
    tulisLog: (jenis, mesej) => log.tulis(jenis + ': ' + mesej)
  });
  const tetapan = bacaTetapan(dirData);

  let hasil;
  try {
    hasil = await jalankanLoginAuto(adapter, kred, { benarkanTerusTanpaFrasa: tetapan.benarkanTerusTanpaFrasa === true });
  } finally {
    await context.close().catch(() => {});
  }

  console.log('HASIL:' + JSON.stringify(hasil));
  process.exit(0);
}

main().catch((ralat) => {
  console.log('HASIL:' + JSON.stringify({
    status: 'gagal', perluManusia: true,
    sebab: 'Ralat teknikal: ' + ralat.message
  }));
  process.exit(2);
});
