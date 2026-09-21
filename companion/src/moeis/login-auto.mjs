// Log masuk idMe AUTOMATIK — OPT-IN (companion/src/moeis/login-auto.mjs).
//
// Ini SATU-SATUNYA laluan dalam companion yang menaip kredensial idMe, dan ia
// hanya berjalan apabila SEMUA pengawal berikut lulus:
//   1. Suis `loginAuto` (tetapan) ON — lalai MATI, berasingan daripada
//      autoMulaGiliran.
//   2. Kredensial idMe wujud dalam vault DPAPI tempatan.
//   3. Sesi belum sah (kalau sudah sah, tiada log masuk diperlukan).
//   4. Frasa "Kata Kunci Keselamatan" pada halaman idMe SEBENAR PADAN dengan
//      frasa yang disimpan — anti-pancing. Tidak padan/tidak dapat dibaca =
//      ABORT, TIADA kotak semak ditekan, TIADA kata laluan ditaip.
//   5. CAPTCHA/OTP/2FA TIDAK dikesan sebelum menaip ATAU selepas hantar —
//      jika dikesan, berhenti dengan perluManusia:true, TIADA cubaan semula.
//   6. Had 2 cubaan automatik sepanjang hayat proses (perlindungan kunci akaun).
//
// ALIRAN DUA PERINGKAT idMe SEBENAR (diperbetulkan — lihat BLUEPRINT.md):
//   1. Halaman log masuk: hanya medan IC (pengguna) wujud. Frasa "Kata Kunci
//      Keselamatan" TIDAK dipaparkan di sini.
//   2. Selepas IC dihantar, idMe membawa ke /loginverification: frasa
//      dipaparkan bersama kotak semak "Ya, ini adalah Kata Kunci Keselamatan
//      saya." yang TIDAK ditanda; medan kata laluan tersembunyi sehingga
//      kotak itu ditanda.
// INVARIAN KESELAMATAN (dikemas kini, dinyatakan jujur): KATA LALUAN hanya
// pernah ditaip SELEPAS (a) frasa dibaca pada /loginverification dan PADAN
// dengan yang disimpan, DAN (b) kotak semak ditanda. IC ditaip LEBIH AWAL
// (sebelum frasa dibaca) kerana idMe memerlukannya untuk memaparkan frasa itu
// — ini bukan pelemahan anti-pancing: frasa masih satu-satunya pengawal yang
// membenarkan kata laluan ditaip, dan IC sahaja (tanpa kata laluan) tidak
// memberi penyerang apa-apa yang berguna pada halaman pancingan.
//
// INVARIAN: tiada nilai kredensial (pengguna/kata laluan/frasa) pernah muncul
// dalam keputusan pulangan, log, atau mesej ralat. Keputusan hanya membawa
// status + sebab generik + senarai bukti bukan-nilai.
//
// OPT-IN `benarkanTerusTanpaFrasa` (lalai MATI, diluluskan pemilik): apabila
// suis ini HIDUP DAN frasa "Kata Kunci Keselamatan" tidak dapat dibaca sebagai
// teks (mungkin dipaparkan sebagai imej), aliran DITERUSKAN — bukan diabort —
// kerana pemilik telah membuat keputusan sedar bahawa perlindungan kemudian
// bergantung SEPENUHNYA pada semakan HTTPS+hos idMe ketat (langkah 3, sudah
// lulus) dan kotak semak pengesahan (langkah 8). Frasa imej TIDAK PERNAH
// di-OCR atau diteka — ia kekal `null`, hanya KEPUTUSAN mengenainya berubah.
// Frasa yang DIBACA tetapi TIDAK PADAN kekal ABORT (`kunci-tidak-padan`)
// TANPA MENGIRA suis ini — isyarat anti-pancing itu tidak pernah dilonggarkan.
//
// Aliran ini BELUM disahkan terhadap idMe/MOEIS hidup (larangan keras brief
// pelaksanaan) — ujian menggunakan adapter/laman palsu sahaja. Pengesahan
// hidup berlaku kemudian dengan kehadiran pemilik, selepas kelulusan induk.
import { sahkanHos } from './sesi.mjs';

export const HAD_CUBAAN_MAKS = 2;

// Aliran tulen terhadap satu `adapter` (lihat adaptorPlaywright.mjs untuk
// pelaksanaan sebenar; ujian menyuntik adapter palsu). `kredensial` ialah
// objek { pengguna, kataLaluan, kunciKeselamatan } daripada vault DPAPI.
//
// Pembungkus nipis di sekeliling `jalankanLoginAutoTeras`: pada MANA-MANA
// keputusan kegagalan (perluManusia:true ATAU status bukan 'sesi-sah'/
// 'kunci-tiada-dibenarkan', ATAU pengecualian) — cuba tulis bundle
// diagnostik LOKAL SAHAJA (`adapter.tulisDiagnostikKegagalan`, jika adapter
// menyediakannya) secara best-effort. Diagnostik TIDAK PERNAH boleh
// menjatuhkan/menukar keputusan sebenar aliran log masuk.
export async function jalankanLoginAuto(adapter, kredensial, opsyen = {}) {
  let hasil;
  try {
    hasil = await jalankanLoginAutoTeras(adapter, kredensial, opsyen);
  } catch (ralat) {
    hasil = {
      status: 'gagal', perluManusia: true,
      sebab: 'Ralat teknikal semasa log masuk automatik: ' + String((ralat && ralat.message) || ralat),
      bukti: ['ralat-teknikal']
    };
  }
  const kegagalan = hasil.perluManusia === true ||
    (hasil.status !== 'sesi-sah' && hasil.status !== 'kunci-tiada-dibenarkan');
  if (kegagalan) {
    try { await adapter.tulisDiagnostikKegagalan?.(hasil); } catch { /* diagnostik tidak boleh menjatuhkan aliran utama */ }
  }
  return hasil;
}

async function jalankanLoginAutoTeras(adapter, kredensial, opsyen) {
  const kunciDijangka = kredensial && kredensial.kunciKeselamatan ? String(kredensial.kunciKeselamatan) : '';
  const pengguna = kredensial && kredensial.pengguna ? String(kredensial.pengguna) : '';
  const kataLaluan = kredensial && kredensial.kataLaluan ? String(kredensial.kataLaluan) : '';
  const benarkanTerusTanpaFrasa = !!(opsyen && opsyen.benarkanTerusTanpaFrasa === true);

  if (!pengguna || !kataLaluan || !kunciDijangka) {
    return {
      status: 'tiada-kredensial', perluManusia: true,
      sebab: 'Kredensial idMe tidak lengkap; log masuk automatik dibatalkan.',
      bukti: ['kredensial-tidak-lengkap']
    };
  }

  // 1. Navigasi ke halaman log masuk idMe (lihat adapter).
  await adapter.navigasiLoginIdMe();

  // 2. CAPTCHA/OTP SEBELUM menaip apa-apa.
  const captchaAwal = await adapter.semakCaptchaOtp();
  if (captchaAwal) {
    return {
      status: 'perlu-manusia', perluManusia: true,
      sebab: captchaAwal.sebab || 'CAPTCHA/OTP dikesan sebelum log masuk; tiada kredensial ditaip.',
      bukti: ['captcha-otp-sebelum-menaip']
    };
  }

  // 3. Semak hos KETAT (HTTPS + idme.moe.gov.my tepat) — anti-pancing DNS.
  const urlSemasa = await adapter.urlHalaman();
  const sah = sahkanHos(urlSemasa);
  if (!sah.ok) {
    return {
      status: 'hos-tidak-sah', perluManusia: true,
      sebab: sah.sebab + ' Tiada kredensial ditaip.',
      bukti: ['hos-tidak-sah']
    };
  }

  // 4. Isi IC (pengguna) SAHAJA — idMe memerlukan IC dahulu untuk memaparkan
  //    frasa "Kata Kunci Keselamatan" pada /loginverification. Kata laluan
  //    TIDAK ditaip di sini; medan itu belum wujud pada peringkat ini.
  //    Adapter PRODUKSI memulangkan {ok,sebab} dan MENUNGGU medan menjadi sedia
  //    (halaman lambat/separa dimuatkan) — bukan melontar Timeout mentah.
  const isiIc = await adapter.isiPenggunaIdMe(pengguna);
  if (isiIc && isiIc.ok !== true) {
    return {
      status: 'perlu-manusia', perluManusia: true,
      sebab: isiIc.sebab ||
        'Medan IC tidak dapat diisi pada halaman log masuk idMe; log masuk manual diperlukan.',
      bukti: ['medan-ic-tiada']
    };
  }

  // 5. Lanjutkan ke halaman pengesahan (/loginverification). Jika halaman itu
  //    tidak muncul, berhenti — jangan cuba baca frasa pada halaman yang salah.
  const lanjut = await adapter.lanjutkanPengesahan();
  if (!lanjut || lanjut.ok !== true) {
    return {
      status: 'perlu-manusia', perluManusia: true,
      sebab: (lanjut && lanjut.sebab) ||
        'Tidak dapat meneruskan ke halaman pengesahan idMe selepas mengisi IC; log masuk manual diperlukan.',
      bukti: ['lanjut-pengesahan-gagal']
    };
  }

  // 6. Baca frasa kunci keselamatan SEKARANG (hanya wujud pada halaman
  //    pengesahan, bukan pada halaman IC).
  const kunciSebenar = await adapter.bacaKunciKeselamatan();

  // 7. Keputusan frasa — TIGA status jujur berasingan (jangan sekali-kali
  //    kelirukan "tidak dapat dibaca" dengan "tidak padan"):
  //      - kosong/null (tidak dapat dibaca sebagai teks, mungkin imej):
  //          * benarkanTerusTanpaFrasa MATI (lalai) -> 'kunci-tiada', ABORT,
  //            tiada kotak semak, tiada kata laluan.
  //          * benarkanTerusTanpaFrasa HIDUP (opt-in pemilik) -> TERUSKAN
  //            (modTanpaFrasa=true) tanpa OCR/agakan — perlindungan bergantung
  //            pada semakan hos (langkah 3, sudah lulus) + kotak semak.
  //      - dibaca tetapi berbeza -> 'kunci-tidak-padan' (pancingan sebenar),
  //        ABORT, tiada kotak semak, tiada kata laluan — TIDAK DIKIRA suis ini.
  //      - dibaca dan padan -> teruskan.
  const frasaTidakDapatDibaca = (kunciSebenar == null || String(kunciSebenar) === '');
  let modTanpaFrasa = false;
  if (frasaTidakDapatDibaca) {
    if (!benarkanTerusTanpaFrasa) {
      return {
        status: 'kunci-tiada', perluManusia: true,
        sebab: 'Frasa "Kata Kunci Keselamatan" tidak dapat dibaca sebagai teks (mungkin imej); log masuk manual diperlukan.',
        bukti: ['kunci-tiada']
      };
    }
    modTanpaFrasa = true;
  } else if (String(kunciSebenar) !== kunciDijangka) {
    return {
      status: 'kunci-tidak-padan', perluManusia: true,
      sebab: 'Frasa "Kata Kunci Keselamatan" idMe pada halaman tidak padan dengan yang disimpan. Kemungkinan halaman pancingan; tiada kotak semak ditekan, tiada kata laluan ditaip.',
      bukti: ['kunci-tidak-padan']
    };
  }

  // 8. Frasa padan (atau modTanpaFrasa): tandakan kotak semak "Ya, ini adalah
  //    Kata Kunci Keselamatan saya." — ini mendedahkan medan kata laluan yang
  //    sebelum ini tersembunyi. Adapter PRODUKSI memulangkan boolean
  //    (true = kotak ditanda DAN kata laluan disahkan kelihatan). Jika false,
  //    ABORT — jangan teruskan ke isiKataLaluan, kerana mengisi medan yang
  //    masih tersembunyi akan melontar Timeout Playwright mentah (30s) yang
  //    bocor ke log sebagai "ralat teknikal" yang tidak membantu (dikesan
  //    melalui bundle diagnostik LIVE: medan kata laluan idMe #password berada
  //    dalam kontena #submit_form yang kekal `display:none` apabila kotak
  //    semak #check_log gagal didedahkan).
  const kotakDitanda = await adapter.tandakanKunciKeselamatan();
  if (kotakDitanda !== true) {
    return {
      status: 'kotak-pengesahan-gagal', perluManusia: true,
      sebab: 'Kotak semak "Ya, ini adalah Kata Kunci Keselamatan saya." tidak dapat ditanda atau medan kata laluan tidak didedahkan; log masuk manual diperlukan.',
      bukti: ['kotak-pengesahan-gagal']
    };
  }

  // 9. Isi kata laluan — HANYA SEKARANG, selepas frasa padan DAN kotak semak
  //    ditanda (invarian keselamatan, lihat komen fail di atas). Adapter
  //    PRODUKSI memulangkan {ok,sebab} dan MENUNGGU medan kata laluan menjadi
  //    sedia (halaman lambat/separa dimuatkan).
  const isiKataLaluan = await adapter.isiKataLaluanIdMe(kataLaluan);
  if (isiKataLaluan && isiKataLaluan.ok !== true) {
    return {
      status: 'perlu-manusia', perluManusia: true,
      sebab: isiKataLaluan.sebab ||
        'Medan kata laluan tidak dapat diisi pada halaman pengesahan idMe; log masuk manual diperlukan.',
      bukti: ['medan-kata-laluan-tiada']
    };
  }

  // 10. Hantar borang ("Daftar Masuk"). Adapter PRODUKSI memulangkan
  //     {ok,status,sebab} — idMe sebenar membawa DUA butang "Daftar Masuk"
  //     (placeholder disabled/hidden + satu aktif); jangan sekali-kali
  //     anggap hantar berjaya tanpa semakan ok===true eksplisit.
  const hantar = await adapter.hantarBorangLogMasuk();
  if (!hantar || hantar.ok !== true) {
    return {
      status: 'perlu-manusia', perluManusia: true,
      sebab: (hantar && hantar.sebab) ||
        'Tidak dapat menghantar borang log masuk idMe (butang "Daftar Masuk" tidak ditemui); log masuk manual diperlukan.',
      bukti: ['butang-hantar-tiada']
    };
  }

  // 11. Langkah kedua (OTP/CAPTCHA/2FA) selepas hantar: JANGAN pintas.
  const langkah2 = await adapter.semakCaptchaOtp();
  if (langkah2) {
    return {
      status: 'perlu-manusia', perluManusia: true,
      sebab: 'Langkah kedua (OTP/CAPTCHA/2FA) dikesan selepas hantar; companion tidak memintasnya.',
      bukti: ['otp-selepas-hantar']
    };
  }

  // 12. Sahkan sesi terhasil.
  const sesi = await adapter.sahkanSesiSelepasLogin();
  if (sesi && sesi.status === 'sesi-sah') {
    if (modTanpaFrasa) {
      return {
        status: 'kunci-tiada-dibenarkan', perluManusia: false, sesiSah: true,
        sebab: 'Frasa "Kata Kunci Keselamatan" tidak dapat dibaca (imej) tetapi suis benarkanTerusTanpaFrasa HIDUP — log masuk diteruskan selepas semakan HTTPS + hos idMe dan kotak semak pengesahan ditanda; sesi kini sah.',
        bukti: ['kunci-tiada-dibenarkan', 'sesi-sah']
      };
    }
    return { status: 'sesi-sah', perluManusia: false, sebab: 'Log masuk idMe automatik berjaya.', bukti: ['sesi-sah'] };
  }
  return {
    status: 'perlu-manusia', perluManusia: true,
    sebab: (sesi && sesi.sebab) || 'Sesi tidak dapat disahkan selepas hantar; semakan manual diperlukan.',
    bukti: ['sesi-tidak-sah']
  };
}

// Pengurus cubaan: menguatkuasakan had 2 cubaan automatik per proses dengan
// backoff antara cubaan. `adaKredensial` memulangkan boolean (tanpa menyahsulit
// nilai), `jalankan` ialah tindakan log masuk sebenar (proses anak yang
// membaca vault sendiri dan menaip — nilai tidak pernah melalui proses ini).
export function buatPengurusLoginAuto({ adaKredensial, jalankan, tulisLog, jedaMs = 5000 }) {
  let cubaan = 0;

  async function cubaAuto() {
    if (cubaan >= HAD_CUBAAN_MAKS) {
      return {
        status: 'had-cubaan', perluManusia: true,
        sebab: `Had ${HAD_CUBAAN_MAKS} cubaan log masuk automatik per proses dicapai; log masuk manusia diperlukan.`,
        bukti: ['had-cubaan']
      };
    }
    let ada = false;
    try { ada = !!adaKredensial(); } catch { ada = false; }
    if (!ada) {
      return {
        status: 'tiada-kredensial', perluManusia: true,
        sebab: 'Kredensial idMe belum disimpan pada PC ini.',
        bukti: ['tiada-kredensial']
      };
    }
    cubaan += 1;
    if (cubaan > 1 && jedaMs > 0) {
      await new Promise((selesai) => setTimeout(selesai, jedaMs * (cubaan - 1)));
    }
    const hasil = await jalankan();
    if (tulisLog) tulisLog('LOGIN_AUTO', String(hasil && hasil.status), String((hasil && hasil.sebab) || ''));
    return hasil;
  }

  function bilCubaan() {
    return cubaan;
  }

  return { cubaAuto, bilCubaan };
}

// Objek status mutable, dikongsi antara startup dan job-time (lihat
// buatStatusLoginAuto/snapshotLoginAutoStatus di bawah) — memberikan status
// endpoints + UI tempatan sesuatu yang boleh dipaparkan pada bila-bila masa,
// tanpa menyimpan sebarang nilai kredensial.
export function buatStatusLoginAuto() {
  return {
    diminta: false, adaKredensial: false, sesiSah: null, percubaan: 0,
    had: HAD_CUBAAN_MAKS, hasilTerakhir: '', sebab: 'Belum dinilai.'
  };
}

// Orkestrasi tulen terpandu (semua kebergantungan disuntik), dikongsi antara
// laluan startup (cubaLoginAutoStartup) dan laluan job-time (cubaLoginAutoKerja)
// — kedua-duanya berkongsi HAD_CUBAAN_MAKS yang sama melalui `cubaSekaliLogin`
// (buatPengurusLoginAuto.cubaAuto, satu kaunter per proses).
async function cubaLoginAutoTerpandu({
  bacaTetapan, adaKredensial, sesiDisahkan, cubaSekaliLogin, tulisLog, status, bilCubaan,
  paksa = false
}) {
  const t = bacaTetapan();
  if (t.loginAuto !== true) {
    const sebab = 'Log masuk idMe automatik dimatikan (lalai).';
    if (status) Object.assign(status, { diminta: false, adaKredensial: false, sesiSah: null, hasilTerakhir: '', sebab });
    if (tulisLog) tulisLog('LOGIN_AUTO', 'dilangkau', sebab);
    return { diminta: false, cuba: false, sebab };
  }
  let ada = false;
  try { ada = !!adaKredensial(); } catch { ada = false; }
  if (status) status.adaKredensial = ada;
  if (!ada) {
    const sebab = 'Kredensial idMe belum disimpan; langkau log masuk automatik.';
    if (status) Object.assign(status, { hasilTerakhir: 'kredensial-tiada', sebab });
    if (tulisLog) tulisLog('LOGIN_AUTO', 'dilangkau', sebab);
    return { diminta: true, cuba: false, sebab };
  }
  let sesiAda = false;
  if (!paksa) {
    try {
      const s = await sesiDisahkan();
      sesiAda = !!(s && s.ada === true);
    } catch {
      sesiAda = false;
    }
    if (status) status.sesiSah = sesiAda;
    if (sesiAda) {
      const sebab = 'Sesi idMe sudah sah; tiada log masuk automatik diperlukan.';
      if (status) Object.assign(status, { hasilTerakhir: '', sebab });
      if (tulisLog) tulisLog('LOGIN_AUTO', 'dilangkau', sebab);
      return { diminta: true, cuba: false, sebab };
    }
  } else if (tulisLog) {
    // Isyarat sesi-tamat HIDUP daripada tugasan: cache sesi TIDAK boleh menyekat
    // cubaan sebenar. Suis loginAuto dan kredensial (di atas) kekal dihormati;
    // hanya gerbang cache-sahaja yang dipintas. HAD_CUBAAN_MAKS dikongsi kekal
    // melalui cubaSekaliLogin (buatPengurusLoginAuto.cubaAuto).
    tulisLog('LOGIN_AUTO', 'dipaksa', 'Isyarat sesi-tamat hidup; cache sesi diabaikan, cubaan log masuk sebenar dipaksa (pengawal lain kekal).');
  }
  const hasil = await cubaSekaliLogin();
  if (status) {
    Object.assign(status, {
      sesiSah: !!(hasil && (hasil.status === 'sesi-sah' || hasil.sesiSah === true)),
      hasilTerakhir: (hasil && hasil.status) ? hasil.status : 'tidak-diketahui',
      sebab: (hasil && hasil.sebab) || 'Hasil log masuk automatik tidak diketahui.'
    });
  }
  if (status && typeof bilCubaan === 'function') status.percubaan = bilCubaan();
  return { diminta: true, cuba: true, hasil };
}

// Orkestrasi startup (tulen, semua kebergantungan disuntik). Dipanggil SELEPAS
// bind loopback berjaya, SEBELUM pengawal auto-mula giliran dinilai.
export function cubaLoginAutoStartup(deps) {
  return cubaLoginAutoTerpandu(deps);
}

// Orkestrasi job-time: dipanggil SEBELUM klaim (kitaran) atau SELEPAS proses
// anak keluar (percubaan semula satu tugasan) — profil Edge sentiasa bebas
// pada dua titik ini. Kongsi HAD_CUBAAN_MAKS yang sama dengan startup.
export function cubaLoginAutoKerja(deps, opsyen = {}) {
  return cubaLoginAutoTerpandu({ ...deps, paksa: !!(opsyen && opsyen.paksa) });
}

// Ayat status plain-Malay untuk UI tempatan / status endpoints.
export function ayatLoginAuto(st) {
  if (!st.diminta) return 'Suis loginAuto MATI — log masuk automatik idMe tidak aktif.';
  if (!st.adaKredensial) return 'Kredensial idMe tiada — log masuk automatik dilangkau.';
  if (st.sesiSah === true) return 'Diminta tetapi sesi idMe sudah sah — tiada log masuk automatik diperlukan.';
  if (st.hasilTerakhir === 'sesi-sah') return 'Berjaya — log masuk idMe automatik berjaya, sesi kini sah.';
  if (st.hasilTerakhir === 'had-cubaan') return 'Had cubaan dicapai — log masuk manusia diperlukan.';
  if (st.hasilTerakhir === 'perlu-manusia') return 'Perlu manusia: ' + (st.sebab || 'langkah kedua (OTP/CAPTCHA/2FA) atau semakan manual.');
  if (st.hasilTerakhir === 'kunci-tidak-padan') return 'Perlu manusia: frasa keselamatan tidak padan — tiada kredensial ditaip.';
  if (st.hasilTerakhir === 'kunci-tiada') return 'Perlu manusia: frasa keselamatan tidak dapat dibaca (mungkin imej) — log masuk manual diperlukan.';
  if (st.hasilTerakhir === 'kunci-tiada-dibenarkan') return 'Berjaya — frasa tidak dapat dibaca (imej) tetapi suis benarkanTerusTanpaFrasa HIDUP; log masuk diteruskan selepas semakan HTTPS+hos dan kotak semak pengesahan.';
  if (st.hasilTerakhir === 'kotak-pengesahan-gagal') return 'Perlu manusia: kotak semak pengesahan tidak dapat ditanda atau medan kata laluan tidak didedahkan — log masuk manual diperlukan.';
  if (st.hasilTerakhir === 'hos-tidak-sah') return 'Perlu manusia: hos idMe tidak sah — tiada kredensial ditaip.';
  return st.sebab || 'Belum dinilai.';
}

// Petikan baca-sahaja status semasa untuk status endpoints (/api/status,
// /api/lokal/status) — tiada nilai kredensial, hanya boolean/status generik.
export function snapshotLoginAutoStatus(status, { bacaTetapan, adaKredensial, bilCubaan }) {
  const t = bacaTetapan();
  let ada = false;
  try { ada = !!adaKredensial(); } catch { ada = false; }
  const diminta = t.loginAuto === true;
  const sesiSah = status ? status.sesiSah : null;
  const hasilTerakhir = status ? status.hasilTerakhir : '';
  const percubaan = typeof bilCubaan === 'function' ? bilCubaan() : (status ? status.percubaan : 0);
  return {
    diminta, adaKredensial: ada, sesiSah,
    percubaan, had: HAD_CUBAAN_MAKS, hasilTerakhir,
    benarkanTerusTanpaFrasa: t.benarkanTerusTanpaFrasa === true,
    sebab: ayatLoginAuto({ diminta, adaKredensial: ada, sesiSah, hasilTerakhir, sebab: status ? status.sebab : '' })
  };
}
