// Pengawal fail-closed untuk giliran automatik Companion.
// Semua keputusan menggunakan waktu Asia/Kuala_Lumpur dan dibuat semula pada
// setiap poll. Modul ini tulen: tiada rangkaian, pelayar, registry atau fail.
export const ZON_MASA_SEKOLAH = 'Asia/Kuala_Lumpur';
export const UMUR_MAKS_TUGASAN_MINIT = 15;

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

export function nilaiKelayakanTugasan(job, { tetapan, sekarangMs, sempadanProsesMs }) {
  const hari = asasHariSekolah(tetapan, sekarangMs);
  if (!hari.boleh) return hari;
  if (!job || job.status !== 'menunggu') {
    return { boleh: false, sebab: 'Hanya tugasan fresh berstatus menunggu boleh diproses automatik.' };
  }
  if (job.tarikhIso !== hari.tarikhIso) {
    return { boleh: false, sebab: 'Hanya tugasan untuk hari ini di Asia/Kuala_Lumpur boleh diproses automatik.' };
  }
  if (!Number.isFinite(job.diciptaEpochMs)) {
    return { boleh: false, sebab: 'Cap masa penciptaan tugasan tiada atau tidak sah.' };
  }
  const aktivasiMs = masaIsoSah(tetapan && tetapan.autoMulaDiaktifkanPada);
  if (aktivasiMs === null || !Number.isFinite(sempadanProsesMs)) {
    return { boleh: false, sebab: 'Sempadan aktivasi/startup tidak sah; tugasan ditolak.' };
  }
  const sempadan = Math.max(aktivasiMs, sempadanProsesMs);
  if (job.diciptaEpochMs <= sempadan) {
    return { boleh: false, sebab: 'Tugasan dicipta pada/sebelum sempadan opt-in atau startup; semakan manual diperlukan.' };
  }
  if (job.diciptaEpochMs > sekarangMs) {
    return { boleh: false, sebab: 'Cap masa penciptaan tugasan berada pada masa depan.' };
  }
  const umurMs = sekarangMs - job.diciptaEpochMs;
  if (umurMs > UMUR_MAKS_TUGASAN_MINIT * 60 * 1000) {
    return { boleh: false, sebab: `Tugasan terlalu lama (had ${UMUR_MAKS_TUGASAN_MINIT} minit); semakan manual diperlukan.` };
  }
  return { boleh: true, sebab: 'Tugasan fresh dan layak diproses automatik.' };
}

