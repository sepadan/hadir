// Pelari protokol NDJSON pekerja kumpulan pelayar
// (companion/src/moeis/pekerja-ndjson.mjs).
//
// Gelung stdin/stdout BERSAMA antara bin/pekerja-batch.mjs (produksi) dan
// tests/fixtures/pekerja-batch-palsu.mjs (ujian) supaya pelari PRODUKSI yang
// sama diuji — bukan salinan palsu berasingan (penemuan semakan Astra: ujian
// IPC span "sebenar" sebelum ini melancarkan entri berasingan yang
// MENIRU protokol, bukan modul produksi itu sendiri).
//
// Protokol NDJSON, satu mesej = satu baris:
//   stdin  (induk -> pekerja): {"id":"<n>","job":{...},"opsyen":{...}}
//   stdout (pekerja -> induk): HASIL:{"id":"<n>","hasil":{...}}
//   stdout (pekerja -> induk): BERSIH:{} (ack pembersihan, SELEPAS tutup() selesai)
// Baris tidak sah pada stdin DIABAIKAN (protokol tertutup, bukan input
// pengguna). Baris diproses SATU-SATU secara berurutan (tiada selari) supaya
// konteks pelayar dikongsi hanya menjalankan satu operasi pada satu masa.
//
// Kebergantungan pelayar (`jalankanTugas`) dan penutupan (`tutup`) DISUNTIK
// supaya modul ini boleh diuji dengan double palsu tanpa Playwright/Edge.
export async function jalankanPekerjaNdjson({ stdin, stdout, jalankanTugas, tutup }) {
  let bufer = '';
  let rangkaian = Promise.resolve();

  async function layanBaris(baris) {
    baris = baris.trim();
    if (!baris) return;
    let mesej;
    try { mesej = JSON.parse(baris); }
    catch { return; } // baris tidak sah senyap diabaikan
    const hasil = await jalankanTugas(mesej.job, mesej.opsyen).catch((ralat) => ({
      status: 'gagal', kod: 2, sebab: 'Ralat teknikal pekerja kumpulan: ' + ((ralat && ralat.message) || ralat)
    }));
    stdout.write('HASIL:' + JSON.stringify({ id: mesej.id, hasil }) + '\n');
  }

  stdin.on('data', (chunk) => {
    bufer += chunk.toString('utf8');
    let idx;
    while ((idx = bufer.indexOf('\n')) >= 0) {
      const baris = bufer.slice(0, idx);
      bufer = bufer.slice(idx + 1);
      rangkaian = rangkaian.then(() => layanBaris(baris));
    }
  });

  // EOF (induk memanggil stdin.end()) menutup konteks pelayar dan menamatkan
  // proses. Ini ialah laluan penutupan bersih yang dipanggil oleh dispatcher.
  await new Promise((selesai) => {
    stdin.on('end', selesai);
    stdin.on('error', selesai);
  });
  await rangkaian.catch(() => {});

  // PEMBERSIHAN BERSIH + ACK: tutup() (context.close) mesti selesai SEBELUM
  // ack `BERSIH:` dipancarkan. Ack ini ialah handshake "pembersihan berjaya"
  // yang DISAHKAN oleh dispatcher (dispatcher-kumpulan.mjs) sebelum melepaskan
  // kunci. Jika tutup() gagal (pulang false / lontar), TIADA ack dipancarkan
  // dan pulangan false — proses keluar bukan sifar supaya dispatcher melakukan
  // pembunuhan pokok yang disahkan.
  let bersih = true;
  try {
    bersih = (await tutup()) !== false;
  } catch {
    bersih = false;
  }
  if (bersih) {
    // Flush ack ke paip SEBELUM proses menamatkan — elak ack terpotong.
    await new Promise((selesai) => stdout.write('BERSIH:{}\n', selesai));
  }
  return bersih;
}
