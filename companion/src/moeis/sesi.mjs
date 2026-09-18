// Logik TULEN bagi uji log masuk MOEIS/idMe (companion/src/moeis/sesi.mjs).
//
// TIADA Playwright/rangkaian di sini — boleh diuji sepenuhnya dengan double
// adapter (tests/sesi.test.mjs). companion TIDAK PERNAH menaip kata
// laluan/PIN/OTP, tidak mengklik kotak semak log masuk, dan tidak menghantar
// borang idMe — fungsi di sini hanya MEMBACA URL/kandungan halaman.
const HOS_IDME_SAH = 'idme.moe.gov.my';
const HOS_MOEIS_SAH = 'moeispel.moe.gov.my';

// Pengesahan hos anti-pancing: HTTPS wajib, hos TEPAT (tiada subdomain
// penipu seperti "idme.moe.gov.my.evil.com"), tiada userinfo
// ("https://user:pass@idme.moe.gov.my/..." — corak biasa URL pancingan),
// tiada port bukan-lalai. Fail closed pada apa-apa keraguan.
export function sahkanHos(urlString) {
  let u;
  try { u = new URL(String(urlString || '')); }
  catch { return { ok: false, sebab: 'URL tidak sah.' }; }
  if (u.protocol !== 'https:') return { ok: false, sebab: 'Protokol mesti HTTPS (dapat ' + u.protocol + ').' };
  if (u.username || u.password) return { ok: false, sebab: 'URL mengandungi maklumat pengguna (userinfo) — ditolak, corak biasa URL pancingan.' };
  if (u.hostname.toLowerCase() !== HOS_IDME_SAH) {
    return { ok: false, sebab: 'Hos bukan ' + HOS_IDME_SAH + ' (dapat ' + u.hostname + ').' };
  }
  if (u.port && u.port !== '443') return { ok: false, sebab: 'Port bukan lalai (443): ' + u.port };
  return { ok: true, hos: u.hostname };
}

function statusKunci(kunciSebenar, kunciDijangka) {
  if (!kunciSebenar || !kunciDijangka) return 'tiada';
  return kunciSebenar === kunciDijangka ? 'padan' : 'tidak-padan';
}

// Langkah uji log masuk. `adapter` ialah subset yang sama seperti
// halaman.mjs/push.mjs (lihat adaptorPlaywright.mjs) + 4 kaedah tambahan:
// urlHalaman(), bacaKunciKeselamatan(), semakCaptchaOtp(), bacaBilanganMurid().
// Tiada satu pun kaedah "klik"/"isi" dipanggil di sini — sengaja, supaya
// mustahil dari segi struktur kod untuk fungsi ini menulis apa-apa.
export async function jalankanUjiLogin(adapter, { kunciDijangka } = {}) {
  await adapter.navigasiHarian();

  const captcha = await adapter.semakCaptchaOtp();
  if (captcha) {
    return { status: 'perlu-manusia', hos: '', kunci: 'tiada', sebab: captcha.sebab || 'CAPTCHA/OTP dikesan.', bukti: ['captcha-otp-dikesan'] };
  }

  const urlSemasa = await adapter.urlHalaman();
  let u = null;
  try { u = new URL(String(urlSemasa || '')); } catch { u = null; }
  const hostname = u ? u.hostname.toLowerCase() : '';

  if (hostname === HOS_IDME_SAH) {
    const sah = sahkanHos(urlSemasa);
    if (!sah.ok) {
      return { status: 'hos-tidak-sah', hos: hostname, kunci: 'tiada', sebab: sah.sebab, bukti: ['url:' + urlSemasa] };
    }
    const kunciSebenar = await adapter.bacaKunciKeselamatan();
    const kunci = statusKunci(kunciSebenar, kunciDijangka);
    // JANGAN klik kotak semak/hantar borang — hanya laporkan apa yang
    // dibaca. Log masuk sebenar ialah tindakan MANUSIA (lihat
    // bin/log-masuk-manual.mjs).
    //
    // Dua keadaan berbeza boleh berakhir di hos idMe, dan tindakan pengguna
    // berbeza sama sekali:
    //   - borang log masuk kelihatan  -> belum log masuk
    //   - tiada borang (dashboard)    -> sudah log masuk idMe, tetapi aplikasi
    //     MOEIS belum dilancarkan dari portal, jadi lawatan terus ke MOEIS
    //     dilencongkan kembali ke dashboard idMe.
    const borang =
      typeof adapter.adaBorangLogMasuk === 'function' ? await adapter.adaBorangLogMasuk() : true;
    if (!borang) {
      return {
        status: 'idme-sah-moeis-belum',
        hos: HOS_IDME_SAH,
        kunci,
        perluManusia: true,
        sebab:
          'Log masuk idMe sudah berjaya, tetapi aplikasi MOEIS belum dibuka. ' +
          'Dalam tetingkap log masuk: tekan Aplikasi → pilih MOEIS (Pengurusan Murid), ' +
          'tunggu senarai murid muncul, kemudian tekan Uji log masuk semula.',
        bukti: ['hos-sah:' + sah.hos, 'kunci:' + kunci, 'tiada-borang-log-masuk']
      };
    }
    return {
      status: 'sesi-tamat', hos: HOS_IDME_SAH, kunci, perluManusia: true,
      bukti: ['hos-sah:' + sah.hos, 'kunci:' + kunci]
    };
  }

  if (hostname === HOS_MOEIS_SAH) {
    const tajuk = await adapter.tajuk();
    const bilMurid = await adapter.bacaBilanganMurid();
    return {
      status: 'sesi-sah', hos: HOS_MOEIS_SAH, kunci: 'tiada',
      bilMurid, tajuk, bukti: ['tajuk:' + tajuk, 'bilMurid:' + bilMurid]
    };
  }

  return {
    status: 'hos-tidak-sah', hos: hostname || '(tiada URL)', kunci: 'tiada',
    sebab: 'URL bukan idMe atau MOEIS: ' + (urlSemasa || '(kosong)'),
    bukti: ['url:' + urlSemasa]
  };
}

// Ringkasan boolean bagi /api/mula (adaSesiMoeis): TIDAK menulis apa-apa.
export async function adaSesiMoeis(adapter, opsyen) {
  const hasil = await jalankanUjiLogin(adapter, opsyen);
  return hasil.status === 'sesi-sah';
}

// Semakan hos idMe yang KETAT untuk digunakan oleh lapisan pelayar (penemuan
// semakan bebas: regex longgar `/idme\.moe\.gov\.my/` pada URL sebenar boleh
// dipadankan oleh hos penyerang seperti `evil.com/?x=idme.moe.gov.my` atau
// `idme.moe.gov.my.evil.com`). Guna sahkanHos() — HTTPS + hos TEPAT.
export function adalahHosIdMe(url) {
  return sahkanHos(url).ok;
}
