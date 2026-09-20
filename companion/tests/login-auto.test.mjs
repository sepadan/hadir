import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jalankanLoginAuto, buatPengurusLoginAuto, cubaLoginAutoStartup } from '../src/moeis/login-auto.mjs';
import { buatHalamanLoginPalsu, KREDENSIAL_PALSU } from './fixtures/halamanPalsuLogin.mjs';

const KRED = { ...KREDENSIAL_PALSU };

test('frasa kunci keselamatan TIDAK padan -> abort SEBELUM menaip apa-apa', async () => {
  const adapter = buatHalamanLoginPalsu({ kunciHalaman: 'FRASA-LAIN-BERBEZA' });
  const hasil = await jalankanLoginAuto(adapter, { ...KRED, kunciKeselamatan: 'FRASA-CONTOH-SELAMAT' });
  assert.equal(hasil.status, 'kunci-tidak-padan');
  assert.equal(hasil.perluManusia, true);
  assert.equal(adapter._panggilan.includes('isiBorangLogMasuk'), false, 'tidak boleh menaip jika frasa tidak padan');
  assert.equal(adapter._panggilan.includes('hantarBorangLogMasuk'), false);
});

test('CAPTCHA/OTP dikesan SEBELUM menaip -> perlu-manusia, tiada cubaan', async () => {
  const adapter = buatHalamanLoginPalsu({ captchaAwal: true });
  const hasil = await jalankanLoginAuto(adapter, KRED);
  assert.equal(hasil.status, 'perlu-manusia');
  assert.equal(hasil.perluManusia, true);
  assert.equal(adapter._panggilan.includes('isiBorangLogMasuk'), false);
  assert.equal(adapter._panggilan.includes('hantarBorangLogMasuk'), false);
});

test('OTP/2FA selepas hantar -> berhenti perlu-manusia (tidak pernah memintas)', async () => {
  const adapter = buatHalamanLoginPalsu({ otpSelepasHantar: true });
  const hasil = await jalankanLoginAuto(adapter, KRED);
  assert.equal(hasil.status, 'perlu-manusia');
  assert.equal(hasil.perluManusia, true);
  assert.equal(adapter._panggilan.includes('isiBorangLogMasuk'), true, 'sempat menaip sebelum OTP dikesan');
  assert.equal(adapter._panggilan.includes('hantarBorangLogMasuk'), true);
  assert.equal(adapter._panggilan.includes('sahkanSesiSelepasLogin'), false, 'tidak boleh meneruskan selepas OTP');
});

test('hos bukan idMe -> hos-tidak-sah, tiada menaip', async () => {
  const adapter = buatHalamanLoginPalsu({ urlAwal: 'https://jahat.invalid/' });
  const hasil = await jalankanLoginAuto(adapter, KRED);
  assert.equal(hasil.status, 'hos-tidak-sah');
  assert.equal(adapter._panggilan.includes('isiBorangLogMasuk'), false);
});

test('frasa padan + tiada CAPTCHA/OTP -> isi, hantar, sesi-sah', async () => {
  const adapter = buatHalamanLoginPalsu();
  const hasil = await jalankanLoginAuto(adapter, KRED);
  assert.equal(hasil.status, 'sesi-sah');
  assert.equal(hasil.perluManusia, false);
  assert.equal(adapter._panggilan.includes('isiBorangLogMasuk'), true);
  assert.equal(adapter._panggilan.includes('hantarBorangLogMasuk'), true);
});

test('kunci kosong: frasa disimpan kosong -> tiada-kredensial; frasa halaman kosong -> kunci-tidak-padan', async () => {
  // Frasa disimpan kosong: fail-closed di lapisan pengawal kredensial.
  let adapter = buatHalamanLoginPalsu();
  let hasil = await jalankanLoginAuto(adapter, { ...KRED, kunciKeselamatan: '' });
  assert.equal(hasil.status, 'tiada-kredensial');
  assert.equal(adapter._panggilan.includes('isiBorangLogMasuk'), false);
  // Frasa halaman kosong (disimpan tidak kosong): tidak padan -> abort.
  adapter = buatHalamanLoginPalsu({ kunciHalaman: '' });
  hasil = await jalankanLoginAuto(adapter, KRED);
  assert.equal(hasil.status, 'kunci-tidak-padan');
  assert.equal(adapter._panggilan.includes('isiBorangLogMasuk'), false);
});

test('hasil login-auto TIDAK PERNAH mengandungi nilai kredensial (tiada rahsia dalam respons/log)', async () => {
  const adapter = buatHalamanLoginPalsu();
  const hasil = await jalankanLoginAuto(adapter, KRED);
  const teks = JSON.stringify(hasil);
  assert.equal(teks.includes(KRED.kataLaluan), false, 'kata laluan tidak boleh muncul dalam hasil');
  assert.equal(teks.includes(KRED.pengguna), false, 'pengguna tidak boleh muncul dalam hasil');
});

test('pengurus: had 2 cubaan per proses dikuatkuasakan (tiada gelung tanpa hujung)', async () => {
  let panggil = 0;
  const pengurus = buatPengurusLoginAuto({
    adaKredensial: () => true,
    jalankan: async () => { panggil++; return { status: 'perlu-manusia', perluManusia: true, sebab: 'gagal (ujian)' }; },
    jedaMs: 0
  });
  await pengurus.cubaAuto();
  await pengurus.cubaAuto();
  const ketiga = await pengurus.cubaAuto();
  assert.equal(panggil, 2, 'jalankan mesti dipanggil tepat 2 kali');
  assert.equal(ketiga.status, 'had-cubaan');
  assert.equal(ketiga.perluManusia, true);
});

test('pengurus: tiada kredensial -> tiada-kredensial tanpa memanggil jalankan', async () => {
  let panggil = 0;
  const pengurus = buatPengurusLoginAuto({
    adaKredensial: () => false,
    jalankan: async () => { panggil++; return {}; },
    jedaMs: 0
  });
  const hasil = await pengurus.cubaAuto();
  assert.equal(hasil.status, 'tiada-kredensial');
  assert.equal(panggil, 0);
});

test('orkestrasi startup: loginAuto lalai MATI -> tiada kesan sampingan', async () => {
  const panggilan = [];
  const hasil = await cubaLoginAutoStartup({
    bacaTetapan: () => ({ loginAuto: false }),
    adaKredensial: () => { panggilan.push('adaKredensial'); return true; },
    sesiDisahkan: async () => { panggilan.push('sesi'); return { ada: false }; },
    cubaSekaliLogin: async () => { panggilan.push('cuba'); return {}; },
    tulisLog: () => {}
  });
  assert.equal(hasil.diminta, false);
  assert.equal(hasil.cuba, false);
  assert.deepEqual(panggilan, [], 'loginAuto OFF tidak boleh menyentuh sesi/kredensial/cuba');
});

test('orkestrasi startup: loginAuto ON + kredensial + sesi SAH -> langkau login', async () => {
  let cuba = 0;
  const hasil = await cubaLoginAutoStartup({
    bacaTetapan: () => ({ loginAuto: true }),
    adaKredensial: () => true,
    sesiDisahkan: async () => ({ ada: true }),
    cubaSekaliLogin: async () => { cuba++; return {}; },
    tulisLog: () => {}
  });
  assert.equal(hasil.diminta, true);
  assert.equal(hasil.cuba, false);
  assert.equal(cuba, 0);
});

test('orkestrasi startup: loginAuto ON + kredensial + sesi TIDAK sah -> SATU cubaan', async () => {
  let cuba = 0;
  const hasil = await cubaLoginAutoStartup({
    bacaTetapan: () => ({ loginAuto: true }),
    adaKredensial: () => true,
    sesiDisahkan: async () => ({ ada: false }),
    cubaSekaliLogin: async () => { cuba++; return { status: 'sesi-sah' }; },
    tulisLog: () => {}
  });
  assert.equal(hasil.diminta, true);
  assert.equal(hasil.cuba, true);
  assert.equal(cuba, 1);
  assert.equal(hasil.hasil.status, 'sesi-sah');
});

test('orkestrasi startup: loginAuto ON tanpa kredensial -> langkau', async () => {
  let sesi = 0, cuba = 0;
  const hasil = await cubaLoginAutoStartup({
    bacaTetapan: () => ({ loginAuto: true }),
    adaKredensial: () => false,
    sesiDisahkan: async () => { sesi++; return { ada: false }; },
    cubaSekaliLogin: async () => { cuba++; return {}; },
    tulisLog: () => {}
  });
  assert.equal(hasil.cuba, false);
  assert.equal(sesi, 0, 'jangan semak sesi pun jika tiada kredensial');
  assert.equal(cuba, 0);
});
