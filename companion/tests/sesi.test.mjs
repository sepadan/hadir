// Ujian F4: logik tulen uji log masuk (src/moeis/sesi.mjs). Tiada
// Playwright/rangkaian — HalamanPalsu sahaja. companion tidak pernah menaip
// kata laluan/PIN/OTP atau mengklik kotak semak log masuk; ini disahkan di
// sini secara struktur (sahkanHos/jalankanUjiLogin tidak memanggil mana-mana
// kaedah "klik"/"isi").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sahkanHos, jalankanUjiLogin, adaSesiMoeis } from '../src/moeis/sesi.mjs';
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
