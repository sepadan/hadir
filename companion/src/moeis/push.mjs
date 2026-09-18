// Enjin pengisian MOEIS (companion/src/moeis/push.mjs).
//
// jalankanPengisian() ialah fungsi tulen yang menerima `adapter` (lihat
// halaman.mjs) dan satu `job` HADIR ({kelas, tarikhIso, murid, kelasMoeisId}),
// lalu memulangkan objek keputusan berstruktur (medan sama seperti penanda
// mesin `HASIL:` yang dicetak oleh CLI di bawah). Ini membolehkan seluruh
// mekanik diuji terhadap HalamanPalsu tanpa pelayar sebenar.
//
// Keselamatan yang dikekalkan daripada audit prototaip moeis-bot:
//   - berhenti jika bilangan baris tidak sepadan jadual MOEIS (halaman.mjs
//     melontar ralat dalam kes ini, ditangkap sebagai ralat teknikal);
//   - berhenti pada konflik tanpa --paksa (paksa hanya CLI manual, giliran.mjs
//     TIDAK PERNAH menghantar --paksa secara automatik);
//   - kategori/sebab wajib bagi setiap murid tidak hadir SEBELUM membuka
//     pelayar;
//   - berhenti pada CAPTCHA/OTP/sesi tamat dengan status perlu-manusia.
import { petakanKelasMoeis } from './kelas.mjs';
import { bukaDanBacaKeadaan, tekanSimpan, sahkanSelepasMuatSemula } from './halaman.mjs';

function normNama(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function samarkanNama(nama) {
  const s = String(nama || '').trim();
  return s ? s[0] + '***' + normNama(s).length : '';
}

const VERIFIKASI_KOSONG = Object.freeze({
  tarikh: false, kelas: false, murid: false, kategoriSebab: false, kiraan: false, badge: false
});

function hasilAsas(job, tambahan) {
  return {
    status: 'gagal', sebab: '', kelas: job.kelas, tarikhIso: job.tarikhIso,
    murid: null, tidakHadir: (job.murid || []).filter((m) => m && m.nama).length,
    perubahan: 0, bilHadir: null, bilTidakHadir: null,
    verifikasi: { ...VERIFIKASI_KOSONG }, tindakanSimpan: 'tiada', kod: 2,
    ...tambahan
  };
}

export async function jalankanPengisian(adapter, job, opsyen = {}) {
  const mod = opsyen.mod || 'baca';
  const paksa = !!opsyen.paksa;
  const sahkan = !!opsyen.sahkan;

  // Kategori/sebab wajib dan pemetaan kelas disahkan daripada DATA JOB SAHAJA,
  // SEBELUM sebarang panggilan pelayar — job yang tidak lengkap tidak
  // menyebabkan pelayar dibuka langsung.
  const peta = petakanKelasMoeis(job.kelas);
  if (!peta) {
    return hasilAsas(job, { status: 'gagal', sebab: 'Nama kelas tidak dapat dipetakan ke MOEIS: ' + job.kelas, kod: 2 });
  }
  const muridDijangkaTidakHadir = (job.murid || []).filter((m) => m && m.nama);
  const kekurangan = muridDijangkaTidakHadir.filter((m) => !m.kategori || !m.sebab);
  if (kekurangan.length) {
    return hasilAsas(job, {
      status: 'gagal', kod: 7,
      sebab: `${kekurangan.length} murid tiada kategori/sebab: ${kekurangan.map((m) => samarkanNama(m.nama)).join(', ')}`
    });
  }

  try {
    await adapter.navigasiHarian();
    const isuSesi = await adapter.semakSesiDanCaptcha();
    if (isuSesi) {
      return hasilAsas(job, { status: 'gagal', sebab: isuSesi.sebab || 'Perlu campur tangan manusia.', kod: 11, perluManusia: true });
    }

    const awal = await bukaDanBacaKeadaan(adapter, { tahun: peta.tahun, kelas: peta.kelas, tarikhIso: job.tarikhIso });
    const petaDijangka = new Map(muridDijangkaTidakHadir.map((m) => [normNama(m.nama), m]));
    const idx = new Map(awal.murid.map((m) => [normNama(m.nama), m]));

    const takPadan = muridDijangkaTidakHadir.filter((m) => !idx.has(normNama(m.nama)));
    if (takPadan.length) {
      return hasilAsas(job, {
        status: 'gagal', kod: 2, murid: awal.murid.length,
        sebab: `Nama tidak padan dengan MOEIS: ${takPadan.map((m) => samarkanNama(m.nama)).join(', ')}`
      });
    }

    const idTidakHadir = new Set(muridDijangkaTidakHadir.map((m) => idx.get(normNama(m.nama)).id));
    const perluTanda = awal.murid.filter((m) => m.hadir && idTidakHadir.has(m.id));
    const konflikList = awal.murid.filter((m) => !m.hadir && !idTidakHadir.has(m.id));

    if (konflikList.length && !paksa) {
      return hasilAsas(job, {
        status: 'konflik', kod: 10, murid: awal.murid.length,
        sebab: `MOEIS sudah menanda ${konflikList.length} murid tidak hadir yang tiada dalam HADIR.`
      });
    }

    const perubahan = perluTanda.length + (paksa ? konflikList.length : 0);

    if (perubahan === 0) {
      await adapter.muatSemula();
      return hasilAsas(job, {
        status: 'tidak-berubah', kod: 0, sebab: 'Tiada perubahan diperlukan.',
        murid: awal.murid.length, perubahan: 0
      });
    }

    if (mod === 'baca' || mod === 'verifikasi') {
      if (mod === 'baca') await adapter.muatSemula();
      return hasilAsas(job, {
        status: 'perlu-hantar', kod: 0, murid: awal.murid.length, perubahan,
        sebab: `${perubahan} perubahan diperlukan (mod ${mod}, tiada tulisan).`
      });
    }

    // mod === 'hantar'
    const isiHasil = [];
    for (const m of perluTanda) {
      const dijangka = petaDijangka.get(normNama(m.nama));
      const r = await adapter.tandaTidakHadir(m.id, dijangka.kategori, dijangka.sebab);
      isiHasil.push({ ...r, nama: m.nama });
    }
    if (paksa) {
      for (const m of konflikList) await adapter.pulihkanKeHadir(m.id);
    }
    const gagalIsi = isiHasil.filter((h) => h.ralat);
    if (gagalIsi.length) {
      return hasilAsas(job, {
        status: 'gagal', kod: 8, murid: awal.murid.length, perubahan,
        sebab: `Gagal mengisi ${gagalIsi.length} murid: ${gagalIsi.map((h) => samarkanNama(h.nama) + ' (' + h.ralat + ')').join('; ')}`
      });
    }

    const simpanHasil = await tekanSimpan(adapter, { sahkan });
    if (!simpanHasil.dialogBerjaya) {
      return hasilAsas(job, {
        status: 'gagal', kod: 8, murid: awal.murid.length, perubahan,
        tindakanSimpan: simpanHasil.tindakanSimpan,
        sebab: 'Dialog simpan tidak menunjukkan kejayaan.'
      });
    }

    const pengesahan = await sahkanSelepasMuatSemula(adapter, {
      tahun: peta.tahun, kelas: peta.kelas, tarikhIso: job.tarikhIso, muridDijangkaTidakHadir
    });
    const kiraan = pengesahan.kiraanSkrin || {};
    return {
      status: pengesahan.sah ? 'disahkan' : 'tersimpan',
      kod: pengesahan.sah ? 0 : 6,
      sebab: pengesahan.sah ? 'Pengesahan selepas muat semula berjaya.' : 'Dialog simpan berjaya tetapi pengesahan tidak lengkap.',
      kelas: job.kelas, tarikhIso: job.tarikhIso,
      murid: awal.murid.length, tidakHadir: muridDijangkaTidakHadir.length, perubahan,
      bilHadir: kiraan.bilHadir == null ? null : Number(kiraan.bilHadir),
      bilTidakHadir: kiraan.bilTidakHadir == null ? null : Number(kiraan.bilTidakHadir),
      verifikasi: pengesahan.verifikasi, tindakanSimpan: simpanHasil.tindakanSimpan
    };
  } catch (ralat) {
    return hasilAsas(job, { status: 'gagal', kod: 2, sebab: 'Ralat teknikal: ' + ralat.message });
  }
}

export function barisHasil(hasil) {
  const { kod, ...tanpaKod } = hasil;
  return 'HASIL:' + JSON.stringify(tanpaKod);
}

export const KOD_KELUAR_LALAI = {
  disahkan: 0, 'tidak-berubah': 0, 'perlu-hantar': 0,
  tersimpan: 6, konflik: 10, gagal: 8
};

export function kodKeluar(hasil) {
  if (typeof hasil.kod === 'number') return hasil.kod;
  return KOD_KELUAR_LALAI[hasil.status] ?? 2;
}
