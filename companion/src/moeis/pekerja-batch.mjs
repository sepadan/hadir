// Pekerja kumpulan pelayar — SATU konteks Edge dikongsi merentas SATU
// kumpulan (kitaran giliran), bukan satu konteks per tugasan
// (companion/src/moeis/pekerja-batch.mjs).
//
// Fungsi TULEN — `bukaKonteks`/`buatAdaptorPlaywright` disuntik supaya ujian
// guna double palsu tanpa Playwright/Edge sebenar. `jalankanPengisian`
// (src/moeis/push.mjs) TIDAK disentuh — modul ini hanya membekalkan
// konteks+halaman kepadanya.
//
// Seni bina diluluskan (Option 2): mula LEWAT (lazy) pada tugasan pertama;
// SETIAP tugasan menerima HALAMAN BAHARU + adapter baharu (tidak pernah
// mempercayai kelas/tarikh/senarai murid halaman sebelumnya — pilih-semula
// dan sahkan dari awal setiap kali, sama seperti laluan sejuk lama); konteks
// itu sendiri ditutup HANYA dalam tutup() (bukan selepas setiap tugasan).
//
// Kegagalan membuka konteks (Edge/Playwright tidak dapat dilancarkan)
// dilaporkan sebagai HASIL biasa `{status:'gagal', pembukaanGagal:true}` —
// BUKAN lontaran — supaya pemanggil (src/moeis/kumpulan-pelayar.mjs) boleh
// jatuh balik ke laluan sejuk SEBELUM sebarang mutasi dengan selamat.
import { jalankanPengisian } from './push.mjs';

export function buatPekerjaBatch({ bukaKonteks, buatAdaptorPlaywright, dirData }) {
  let konteks = null;
  let ditutup = false;
  let bilLancar = 0;
  let bilTutup = 0;

  async function pastikanKonteks() {
    if (ditutup) throw new Error('Pekerja kumpulan pelayar sudah ditutup.');
    if (!konteks) {
      konteks = await bukaKonteks(dirData);
      bilLancar++;
    }
    return konteks;
  }

  async function jalankan(job, opsyen) {
    let k;
    try {
      k = await pastikanKonteks();
    } catch (ralat) {
      if (ditutup) throw ralat; // "sudah ditutup" mesti kekal lontaran jelas, bukan hasil senyap
      return {
        status: 'gagal', kod: 2, pembukaanGagal: true,
        sebab: 'Pekerja kumpulan gagal membuka konteks pelayar: ' + ((ralat && ralat.message) || String(ralat))
      };
    }
    const halaman = await k.newPage();
    try {
      const adapter = buatAdaptorPlaywright(halaman);
      return await jalankanPengisian(adapter, job, opsyen || {});
    } finally {
      await halaman.close().catch(() => {});
    }
  }

  async function tutup() {
    if (ditutup) return true;
    ditutup = true;
    if (konteks) {
      const k = konteks;
      konteks = null;
      bilTutup++;
      try {
        await k.close();
        return true;
      } catch {
        // context.close gagal — bukan penutupan bersih. Pulang false supaya
        // pelari TIDAK memancarkan ack BERSIH (dispatcher akan bunuh pokok).
        return false;
      }
    }
    return true;
  }

  function status() {
    return { aktif: !!konteks, ditutup, bilLancar, bilTutup };
  }

  return { mulakan: pastikanKonteks, jalankan, tutup, status };
}
