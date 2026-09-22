// Ujian F4: logik tulen uji log masuk (src/moeis/sesi.mjs). Tiada
// Playwright/rangkaian — HalamanPalsu sahaja. companion tidak pernah menaip
// kata laluan/PIN/OTP atau mengklik kotak semak log masuk; ini disahkan di
// sini secara struktur (sahkanHos/jalankanUjiLogin tidak memanggil mana-mana
// kaedah "klik"/"isi").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sahkanHos, jalankanUjiLogin, adaSesiMoeis, tentukanStatusSelepasHantar, SUMBER_REGEX_PENOLAKAN_KREDENSIAL } from '../src/moeis/sesi.mjs';
import { buatHalamanPalsu, MURID_MOEIS_CONTOH } from './fixtures/halamanPalsu.mjs';

// ---------------- sahkanHos ----------------
test('sahkanHos: hos idMe sah (https, tiada port/userinfo) diterima', () => {
  const r = sahkanHos('https://idme.moe.gov.my/laluan/log-masuk');
  assert.equal(r.ok, true);
  assert.equal(r.hos, 'idme.moe.gov.my');
});

test('sahkanHos: http (bukan https) ditolak', () => {
  const r = sahkanHos('http://idme.moe.gov.my/laluan');
  assert.equal(r.ok, false);
});

test('sahkanHos: subdomain penipu ditolak', () => {
  const r = sahkanHos('https://idme.moe.gov.my.evil.com/laluan');
  assert.equal(r.ok, false);
});

test('sahkanHos: sub-laluan penipu (bukan hos) ditolak', () => {
  const r = sahkanHos('https://evil.com/idme.moe.gov.my/laluan');
  assert.equal(r.ok, false);
});

test('sahkanHos: port bukan lalai ditolak', () => {
  const r = sahkanHos('https://idme.moe.gov.my:8443/laluan');
  assert.equal(r.ok, false);
});

test('sahkanHos: userinfo (corak pancingan) ditolak', () => {
  const r = sahkanHos('https://pengguna:kata-laluan@idme.moe.gov.my/laluan');
  assert.equal(r.ok, false);
});

test('sahkanHos: URL tidak sah ditolak dengan lembut (tiada lontar)', () => {
  const r = sahkanHos('bukan-url-langsung');
  assert.equal(r.ok, false);
});

// ---------------- jalankanUjiLogin ----------------
test('jalankanUjiLogin: hos idMe sah + kunci padan -> sesi-tamat, kunci padan, perluManusia', async () => {
  const h = buatHalamanPalsu({
    muridAwal: MURID_MOEIS_CONTOH, urlAwal: 'https://idme.moe.gov.my/log-masuk',
    kunciKeselamatan: 'BURUNG-HIJAU-99'
  });
  const r = await jalankanUjiLogin(h, { kunciDijangka: 'BURUNG-HIJAU-99' });
  assert.equal(r.status, 'sesi-tamat');
  assert.equal(r.hos, 'idme.moe.gov.my');
  assert.equal(r.kunci, 'padan');
  assert.equal(r.perluManusia, true);
});

test('jalankanUjiLogin: kunci tidak padan -> tidak-padan', async () => {
  const h = buatHalamanPalsu({
    muridAwal: MURID_MOEIS_CONTOH, urlAwal: 'https://idme.moe.gov.my/log-masuk',
    kunciKeselamatan: 'BURUNG-HIJAU-99'
  });
  const r = await jalankanUjiLogin(h, { kunciDijangka: 'KUCING-MERAH-01' });
  assert.equal(r.kunci, 'tidak-padan');
});

test('jalankanUjiLogin: tiada kunci dibaca / tiada jangkaan -> tiada', async () => {
  const h1 = buatHalamanPalsu({ muridAwal: MURID_MOEIS_CONTOH, urlAwal: 'https://idme.moe.gov.my/log-masuk', kunciKeselamatan: null });
  const r1 = await jalankanUjiLogin(h1, { kunciDijangka: 'ADA-JANGKAAN' });
  assert.equal(r1.kunci, 'tiada');

  const h2 = buatHalamanPalsu({ muridAwal: MURID_MOEIS_CONTOH, urlAwal: 'https://idme.moe.gov.my/log-masuk', kunciKeselamatan: 'ADA-KUNCI' });
  const r2 = await jalankanUjiLogin(h2, { kunciDijangka: '' });
  assert.equal(r2.kunci, 'tiada');
});

test('jalankanUjiLogin: hos idMe TIDAK sah (subdomain penipu) -> hos-tidak-sah', async () => {
  const h = buatHalamanPalsu({ muridAwal: MURID_MOEIS_CONTOH, urlAwal: 'https://idme.moe.gov.my.evil.com/log-masuk' });
  const r = await jalankanUjiLogin(h, {});
  assert.equal(r.status, 'hos-tidak-sah');
});

test('jalankanUjiLogin: MOEIS dimuatkan -> sesi-sah, bilMurid ialah bilangan sahaja', async () => {
  const h = buatHalamanPalsu({ muridAwal: MURID_MOEIS_CONTOH, urlAwal: 'https://moeispel.moe.gov.my/sahsiah/kehadiran/pkhem/tabguru' });
  const r = await jalankanUjiLogin(h, {});
  assert.equal(r.status, 'sesi-sah');
  assert.equal(r.bilMurid, MURID_MOEIS_CONTOH.length);
  assert.equal(typeof r.bilMurid, 'number');
  // Tiada nama murid dibocorkan dalam hasil.
  assert.ok(!JSON.stringify(r).includes('MURID CONTOH'));
});

test('jalankanUjiLogin: CAPTCHA/OTP dikesan -> perlu-manusia, tidak menyemak hos', async () => {
  const h = buatHalamanPalsu({ muridAwal: MURID_MOEIS_CONTOH, adaCaptchaOtp: true });
  const r = await jalankanUjiLogin(h, {});
  assert.equal(r.status, 'perlu-manusia');
  assert.ok(!h._panggilan.includes('urlHalaman'), 'tidak perlu baca URL selepas CAPTCHA/OTP dikesan');
});

test('jalankanUjiLogin: hos bukan idMe/MOEIS -> hos-tidak-sah (fail closed)', async () => {
  const h = buatHalamanPalsu({ muridAwal: MURID_MOEIS_CONTOH, urlAwal: 'https://contoh-lain.invalid/laluan' });
  const r = await jalankanUjiLogin(h, {});
  assert.equal(r.status, 'hos-tidak-sah');
});

test('adaSesiMoeis: pulangkan boolean, true hanya bagi sesi-sah', async () => {
  const hSah = buatHalamanPalsu({ muridAwal: MURID_MOEIS_CONTOH, urlAwal: 'https://moeispel.moe.gov.my/sahsiah/kehadiran/pkhem/tabguru' });
  assert.equal(await adaSesiMoeis(hSah), true);

  const hTamat = buatHalamanPalsu({ muridAwal: MURID_MOEIS_CONTOH, urlAwal: 'https://idme.moe.gov.my/log-masuk' });
  assert.equal(await adaSesiMoeis(hTamat), false);
});

// ---------------- Tiada tulisan sepanjang uji log masuk ----------------
// Pepijat nyata (18 Sep 2026): selepas guru log masuk idMe, lawatan terus ke
// MOEIS dilencongkan ke DASHBOARD idMe, bukan ke borang log masuk. Laporan
// lama berkata "sesi tamat / perlu log masuk manual" sedangkan guru sudah log
// masuk; tindakan yang perlu ialah melancarkan aplikasi MOEIS dari portal idMe.
test('jalankanUjiLogin: dashboard idMe (tiada borang) -> idme-sah-moeis-belum', async () => {
  const asas = buatHalamanPalsu({ muridAwal: MURID_MOEIS_CONTOH, urlAwal: 'https://idme.moe.gov.my/home' });
  const dashboard = { ...asas, adaBorangLogMasuk: async () => false };
  const r = await jalankanUjiLogin(dashboard, {});
  assert.equal(r.status, 'idme-sah-moeis-belum');
  assert.equal(r.perluManusia, true);
  assert.match(r.sebab, /Aplikasi/);
  // Bukan sesi sah — giliran mesti kekal fail-closed.
  assert.equal(await adaSesiMoeis(dashboard), false);
});

test('jalankanUjiLogin: borang log masuk kelihatan -> sesi-tamat', async () => {
  const asas = buatHalamanPalsu({ muridAwal: MURID_MOEIS_CONTOH, urlAwal: 'https://idme.moe.gov.my/login' });
  const borang = { ...asas, adaBorangLogMasuk: async () => true };
  const r = await jalankanUjiLogin(borang, {});
  assert.equal(r.status, 'sesi-tamat');
});

test('jalankanUjiLogin tidak pernah klik simpan/kemaskini walau apa jua senario', async () => {
  const senario = [
    { urlAwal: 'https://idme.moe.gov.my/log-masuk', kunciKeselamatan: 'X' },
    { urlAwal: 'https://moeispel.moe.gov.my/sahsiah/kehadiran/pkhem/tabguru' },
    { urlAwal: 'https://apa-apa.invalid/x' },
    { adaCaptchaOtp: true }
  ];
  for (const s of senario) {
    const h = buatHalamanPalsu({ muridAwal: MURID_MOEIS_CONTOH, ...s });
    await jalankanUjiLogin(h, {});
    const klikTulisan = h._panggilan.filter((p) =>
      p.startsWith('klikSimpan') || p.startsWith('klikSimpanSahkan') || p.startsWith('tekanKemaskini') || p.startsWith('tandaTidakHadir')
    );
    assert.equal(klikTulisan.length, 0, 'jalankanUjiLogin tidak boleh menyentuh sebarang kaedah tulisan: ' + JSON.stringify(h._panggilan));
  }
});

test('sesi.mjs tidak mengandungi sebarang panggilan klik/isi kata laluan dalam kod sumber', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = fs.readFileSync(path.join(here, '..', 'src', 'moeis', 'sesi.mjs'), 'utf8');
  // u.username/u.password ialah komponen bacaan URL WHATWG (untuk mengesan
  // corak URL pancingan) — bukan medan borang; dikecualikan daripada semakan.
  assert.ok(!/\.fill\(|\.type\(|\.click\(/.test(src),
    'sesi.mjs tidak boleh mengandungi sebarang isyarat menaip/klik borang log masuk');
});

// ---------------- tentukanStatusSelepasHantar (klasifikasi selepas hantar) ----------------

test('tentukanStatusSelepasHantar: hos MOEIS + #kehadiran -> sesi-sah', () => {
  const r = tentukanStatusSelepasHantar({ hos: 'moeispel.moe.gov.my', adaKehadiran: true });
  assert.equal(r.status, 'sesi-sah');
});

test('tentukanStatusSelepasHantar: hos MOEIS tanpa #kehadiran -> sesi-tamat (laluan sedia ada kekal)', () => {
  const r = tentukanStatusSelepasHantar({ hos: 'moeispel.moe.gov.my', adaKehadiran: false, borangLogin: false, dashboardIdMe: true });
  // Walaupun penanda dashboard ada, hos MOEIS dikendalikan EKSKLUSIF oleh
  // #kehadiran — elak padanan teks longgar pada halaman MOEIS sendiri.
  assert.equal(r.status, 'sesi-tamat');
  assert.match(r.sebab, /#kehadiran/);
});

test('tentukanStatusSelepasHantar: papan pemuka idMe (hos idme, borang hilang) -> sesi-sah WALAUPUN hos belum MOEIS', () => {
  const r = tentukanStatusSelepasHantar({ hos: 'idme.moe.gov.my', borangLogin: false, dashboardIdMe: true });
  assert.equal(r.status, 'sesi-sah');
});

test('tentukanStatusSelepasHantar: borang log masuk masih ada -> sesi-tamat, sebab menamakan borang', () => {
  const r = tentukanStatusSelepasHantar({ hos: 'idme.moe.gov.my', borangLogin: true, dashboardIdMe: true });
  assert.equal(r.status, 'sesi-tamat');
  assert.match(r.sebab, /borang log masuk idMe/);
});

test('tentukanStatusSelepasHantar: hos idme tanpa borang mahupun papan pemuka -> sesi-tamat, sebab menamakan hos', () => {
  const r = tentukanStatusSelepasHantar({ hos: 'idme.moe.gov.my', borangLogin: false, dashboardIdMe: false });
  assert.equal(r.status, 'sesi-tamat');
  assert.match(r.sebab, /hos ialah idme\.moe\.gov\.my/);
});

test('tentukanStatusSelepasHantar: hos bukan idMe/moeispel (cth portal captive) TIDAK diakui kejayaan walaupun teks longgar ada', () => {
  // Penemuan semakan bebas: hos sewenang bukan idMe/moeispel (cth portal
  // captive, laman ralat, redirect luar) mesti fail-tertutup — bukan dilayan
  // sebagai sesi-sah hanya kerana teks longgar seperti "Pengurusan" padan.
  const r = tentukanStatusSelepasHantar({ hos: 'captive.evil.example', borangLogin: false, dashboardIdMe: true });
  assert.equal(r.status, 'sesi-tamat');
  assert.match(r.sebab, /hos ialah captive\.evil\.example/);
});

// ---------------- kredensialDitolak (penolakan kredensial EKSPLISIT, v1.11.22) ----------------
// Isyarat positif berasingan daripada "sesi tidak dapat disahkan" (yang boleh
// bermakna apa sahaja daripada ralat rangkaian ke halaman separuh dimuatkan).
// kredensialDitolak:true bermakna idMe SENDIRI memaparkan penolakan kredensial
// eksplisit (kata laluan/IC salah) — SATU-SATUNYA isyarat yang boleh mengira
// strike terhadap had 3-kegagalan-berturut (lihat klasifikasiHasilLogin).

test('tentukanStatusSelepasHantar: kredensialDitolak:true -> status kredensial-ditolak (penolakan eksplisit)', () => {
  const r = tentukanStatusSelepasHantar({ hos: 'idme.moe.gov.my', borangLogin: true, kredensialDitolak: true });
  assert.equal(r.status, 'kredensial-ditolak');
  assert.match(r.sebab, /penolakan kredensial/);
});

test('tentukanStatusSelepasHantar: MOEIS sesi-sah MENANG walaupun kredensialDitolak:true tersilap dihantar', () => {
  // Susunan diperlukan: (1) MOEIS sesi-sah menang dahulu — mustahil dari segi
  // logik untuk mencapai MOEIS DAN mempunyai kredensial ditolak serentak, tetapi
  // susunan ini mengelakkan sebarang kekeliruan input tidak konsisten daripada
  // menjatuhkan sesi yang jelas sudah sah.
  const r = tentukanStatusSelepasHantar({ hos: 'moeispel.moe.gov.my', adaKehadiran: true, kredensialDitolak: true });
  assert.equal(r.status, 'sesi-sah');
});

test('tentukanStatusSelepasHantar: kredensialDitolak lalai MATI (false) -> tiada regresi kepada laluan sesi-tamat sedia ada', () => {
  const r1 = tentukanStatusSelepasHantar({ hos: 'idme.moe.gov.my', borangLogin: true, dashboardIdMe: true });
  assert.equal(r1.status, 'sesi-tamat');
  const r2 = tentukanStatusSelepasHantar({ hos: 'idme.moe.gov.my', borangLogin: false, dashboardIdMe: true });
  assert.equal(r2.status, 'sesi-sah');
});

// ---------------- SUMBER_REGEX_PENOLAKAN_KREDENSIAL (v1.11.23 — pembetulan pusingan semakan induk) ----------------
// Set ini mesti kekal KETAT: hanya frasa yang secara literal menamakan kata
// laluan/IC sebagai salah/tidak betul boleh mengira strike terhadap had
// 3-kegagalan-berturut. Frasa GENERIK (log masuk gagal/tidak sah, invalid
// login) turut muncul bagi sesi tamat/ralat rangkaian — mengiranya sebagai
// strike akan mengunci akaun kerana kegagalan yang bukan salah kredensial.

test('REGEX_PENOLAKAN_KREDENSIAL: frasa EKSPLISIT kata laluan/IC salah dipadankan', () => {
  const r = new RegExp(SUMBER_REGEX_PENOLAKAN_KREDENSIAL, 'i');
  assert.equal(r.test('Kata laluan tidak betul.'), true);
  assert.equal(r.test('Kata laluan salah, sila cuba lagi.'), true);
  assert.equal(r.test('No. Kad Pengenalan yang dimasukkan salah.'), true);
  assert.equal(r.test('Incorrect password.'), true);
  assert.equal(r.test('Invalid password entered.'), true);
});

test('REGEX_PENOLAKAN_KREDENSIAL: frasa GENERIK "log masuk gagal"/"invalid login" TIDAK dipadankan (bukan strike)', () => {
  const r = new RegExp(SUMBER_REGEX_PENOLAKAN_KREDENSIAL, 'i');
  assert.equal(r.test('Log masuk gagal.'), false);
  assert.equal(r.test('Log masuk tidak sah.'), false);
  assert.equal(r.test('Maklumat log masuk tidak sah.'), false);
  assert.equal(r.test('Invalid login.'), false);
  assert.equal(r.test('Invalid credentials.'), false);
  assert.equal(r.test('Sesi anda telah tamat.'), false);
  assert.equal(r.test('Ralat rangkaian, sila cuba lagi.'), false);
});
