// Pengawal fail-closed untuk giliran automatik Companion.
// Semua keputusan menggunakan waktu Asia/Kuala_Lumpur dan dibuat semula pada
// setiap poll. Modul ini tulen: tiada rangkaian, pelayar, registry atau fail.
export const ZON_MASA_SEKOLAH = 'Asia/Kuala_Lumpur';
// Amaran awal (hari sebelum allowlist kalendar sekolah tamat) untuk memberi
// pemilik masa menambah tarikh sebelum auto-mula gagal tertutup pada hari yang
// tidak lagi dilindungi allowlist.
export const AMARAN_HARI_KALENDAR = 7;

function bahagianMalaysia(sekarangMs) {
  if (!Number.isFinite(sekarangMs)) return null;
  const bahagian = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZON_MASA_SEKOLAH,
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short'
  }).formatToParts(new Date(sekarangMs));
  const peta = Object.fromEntries(bahagian.map((x) => [x.type, x.value]));
  if (!peta.year || !peta.month || !peta.day || !peta.weekday) return null;
  return { tarikhIso: `${peta.year}-${peta.month}-${peta.day}`, hari: peta.weekday };
}

function masaIsoSah(nilai) {
  if (typeof nilai !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(nilai)) return null;
  const ms = Date.parse(nilai);
  return Number.isFinite(ms) ? ms : null;
}

function asasHariSekolah(tetapan, sekarangMs) {
  const waktu = bahagianMalaysia(sekarangMs);
  if (!waktu) return { boleh: false, sebab: 'Masa semasa tidak sah; giliran gagal tertutup.' };
  if (waktu.hari === 'Sat' || waktu.hari === 'Sun') {
    return { boleh: false, sebab: 'Hari ini hujung minggu; tiada penghantaran automatik.' };
  }
  const kalendar = Array.isArray(tetapan && tetapan.kalendarSekolah) ? tetapan.kalendarSekolah : [];
  if (!kalendar.length || !kalendar.includes(waktu.tarikhIso)) {
    return { boleh: false, sebab: `Kalendar sekolah tidak membenarkan ${waktu.tarikhIso}; allowlist kosong/tidak sepadan gagal tertutup.` };
  }
  return { boleh: true, sebab: 'Hari sekolah dibenarkan.', ...waktu };
}

// Pengawal hari sekolah SAHAJA (kalendar allowlist + hujung minggu), tanpa
// pengawal sesi/klaim/rahsia — untuk pemanggil yang perlu menyemak "bolehkah
// hari ini" secara berasingan SEBELUM mencuba log masuk automatik (cth
// pasangPemulihanAutoMula dalam orchestrasi-auto.mjs, supaya log masuk
// automatik tidak dicuba pada hari yang tidak dibenarkan sama sekali).
// Fungsi TULEN — bungkusan nipis atas asasHariSekolah sedia ada.
export function bolehHariSekolah({ tetapan, sekarangMs }) {
  return asasHariSekolah(tetapan, sekarangMs);
}

export function bolehAutoMula({ tetapan, sekarangMs, sempadanProsesMs, sesiAda, klaimDisokong, rahsiaEnjinAda }) {
  if (!tetapan || tetapan.autoMulaGiliran !== true) {
    return { boleh: false, sebab: 'Auto-mula giliran dimatikan (lalai).' };
  }
  if (!rahsiaEnjinAda) return { boleh: false, sebab: 'Rahsia enjin belum ditetapkan.' };
  if (klaimDisokong !== true) return { boleh: false, sebab: 'Sokongan klaim atomik tidak dapat disahkan.' };
  if (sesiAda !== true) return { boleh: false, sebab: 'Sesi idMe/MOEIS tiada atau tidak dapat disahkan; log masuk manual diperlukan.' };
  const hari = asasHariSekolah(tetapan, sekarangMs);
  if (!hari.boleh) return hari;
  const aktivasiMs = masaIsoSah(tetapan.autoMulaDiaktifkanPada);
  if (aktivasiMs === null) return { boleh: false, sebab: 'Sempadan aktivasi opt-in tidak sah; auto-mula gagal tertutup.' };
  if (!Number.isFinite(sempadanProsesMs) || sempadanProsesMs > sekarangMs) {
    return { boleh: false, sebab: 'Sempadan startup proses tidak sah; auto-mula gagal tertutup.' };
  }
  return { boleh: true, sebab: 'Semua pengawal auto-mula lulus.', tarikhIso: hari.tarikhIso };
}

export function nilaiKelayakanTugasan(job, { tetapan, sekarangMs }) {
  const hari = asasHariSekolah(tetapan, sekarangMs);
  if (!hari.boleh) return hari;
  if (!job || (job.status !== 'menunggu' && job.status !== 'sedang_dihantar')) {
    return { boleh: false, sebab: 'Hanya tugasan menunggu atau sedang_dihantar (yatim) untuk hari ini boleh diproses automatik.' };
  }
  if (job.tarikhIso !== hari.tarikhIso) {
    return { boleh: false, sebab: 'Hanya tugasan untuk hari ini di Asia/Kuala_Lumpur boleh diproses automatik.' };
  }
  if (!Number.isFinite(job.diciptaEpochMs)) {
    return { boleh: false, sebab: 'Cap masa penciptaan tugasan tiada atau tidak sah.' };
  }
  // Kewarasan cap masa sahaja (bukan masa depan). Sempadan startup/aktivasi dan
  // umur maksimum TIDAK lagi dijadikan penolak — tugasan hari ini yang masih
  // belum selesai (menunggu/sedang_dihantar) diteruskan selepas restart.
  // Pemilikan lease aktif / klaim atomik diputuskan oleh backend (moeisJobKlaim_),
  // bukan di sini.
  if (job.diciptaEpochMs > sekarangMs) {
    return { boleh: false, sebab: 'Cap masa penciptaan tugasan berada pada masa depan.' };
  }
  return { boleh: true, sebab: 'Tugasan menunggu/sedang_dihantar hari ini layak diproses automatik.' };
}

// --- Amaran kalendar sekolah (baca sahaja, tulen) ---
// ringkasanKalendar ialah fungsi TULEN: tiada rangkaian, pelayar, registry atau
// fail. Ia menerima `tetapan` dan `sekarangMs` (disuntik) lalu mengembalikan
// ringkasan allowlist kalendarSekolah untuk dipaparkan (banner UI) dan untuk
// dilaporkan dalam /api/lokal/status dan /api/status.

function tarikhTepatSah(nilai) {
  if (typeof nilai !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(nilai)) return false;
  const [tahun, bulan, hari] = nilai.split('-').map(Number);
  const d = new Date(Date.UTC(tahun, bulan - 1, hari));
  return d.getUTCFullYear() === tahun && d.getUTCMonth() + 1 === bulan && d.getUTCDate() === hari;
}

function hariAntaraIso(isoMula, isoTamat) {
  const [tm, bm, hm] = isoMula.split('-').map(Number);
  const [tt, bt, ht] = isoTamat.split('-').map(Number);
  return Math.round((Date.UTC(tt, bt - 1, ht) - Date.UTC(tm, bm - 1, hm)) / 86400000);
}

export function ringkasanKalendar(tetapan, sekarangMs) {
  const senarai = Array.isArray(tetapan && tetapan.kalendarSekolah) ? tetapan.kalendarSekolah : [];
  const dinormalkan = senarai.map((x) => String(x || '').trim());
  // Cermin sahkanKalendarSekolah (tetapan.mjs): senarai kosong ATAU sebarang
  // entri tidak sah membatalkan seluruh allowlist (gagal tertutup). Amaran
  // TIDAK BOLEH menghasilkan keadaan "selamat" palsu daripada data separa sah.
  const rosak = dinormalkan.some((x) => !tarikhTepatSah(x));
  const sah = (!dinormalkan.length || rosak) ? [] : [...new Set(dinormalkan)].sort();

  const hariIni = bahagianMalaysia(sekarangMs);
  const bilangan = sah.length;
  const pertama = sah.length ? sah[0] : null;
  const terakhir = sah.length ? sah[sah.length - 1] : null;
  const hariTinggal = (sah.length && hariIni) ? hariAntaraIso(hariIni.tarikhIso, terakhir) : null;

  let amaran;
  let sebab;
  if (rosak) {
    amaran = true;
    sebab = 'Kalendar sekolah mengandungi entri tidak sah; allowlist gagal tertutup sehingga tarikh tepat diperbetulkan.';
  } else if (!sah.length) {
    amaran = true;
    sebab = 'Kalendar sekolah kosong; auto-mula gagal tertutup sehingga tarikh sekolah ditambah.';
  } else if (!hariIni) {
    amaran = true;
    sebab = 'Masa semasa tidak sah; kalendar tidak dapat dinilai dan auto-mula gagal tertutup.';
  } else if (hariTinggal < 0) {
    amaran = true;
    sebab = `Kalendar sekolah sudah tamat pada ${terakhir} (${-hariTinggal} hari lepas); auto-mula tidak akan berjalan sehingga tarikh baharu ditambah.`;
  } else if (hariTinggal === 0) {
    amaran = true;
    sebab = `Tarikh sekolah terakhir ialah hari ini (${terakhir}); tiada tarikh untuk hari berikutnya — tambah tarikh baharu segera.`;
  } else if (hariTinggal <= AMARAN_HARI_KALENDAR) {
    amaran = true;
    sebab = `Tarikh sekolah terakhir ${terakhir} tinggal ${hariTinggal} hari lagi — tambah tarikh baharu sebelum ia tamat.`;
  } else {
    amaran = false;
    sebab = `Kalendar sekolah sah sehingga ${terakhir} (${hariTinggal} hari lagi).`;
  }

  return { bilangan, pertama, terakhir, hariTinggal, amaran, sebab };
}

