import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  jalankanLoginAuto, buatPengurusLoginAuto, cubaLoginAutoStartup, cubaLoginAutoKerja,
  buatStatusLoginAuto, snapshotLoginAutoStatus, ayatLoginAuto
} from '../src/moeis/login-auto.mjs';
import { buatHalamanLoginPalsu, KREDENSIAL_PALSU } from './fixtures/halamanPalsuLogin.mjs';

const KRED = { ...KREDENSIAL_PALSU };

test('frasa kunci keselamatan TIDAK padan -> abort SEBELUM menaip kata laluan', async () => {
  const adapter = buatHalamanLoginPalsu({ kunciHalaman: 'FRASA-LAIN-BERBEZA' });
  const hasil = await jalankanLoginAuto(adapter, { ...KRED, kunciKeselamatan: 'FRASA-CONTOH-SELAMAT' });
  assert.equal(hasil.status, 'kunci-tidak-padan');
  assert.equal(hasil.perluManusia, true);
  // IC boleh ditaip (perkara biasa — idMe memerlukannya untuk memaparkan
  // frasa), tetapi kotak semak dan kata laluan TIDAK PERNAH disentuh.
  assert.equal(adapter._panggilan.includes('tandakanKunciKeselamatan'), false, 'kotak semak tidak boleh ditanda jika frasa tidak padan');
  assert.equal(adapter._panggilan.includes('isiKataLaluanIdMe'), false, 'tidak boleh menaip kata laluan jika frasa tidak padan');
  assert.equal(adapter._panggilan.includes('hantarBorangLogMasuk'), false);
});

test('CAPTCHA/OTP dikesan SEBELUM menaip -> perlu-manusia, tiada cubaan', async () => {
  const adapter = buatHalamanLoginPalsu({ captchaAwal: true });
  const hasil = await jalankanLoginAuto(adapter, KRED);
  assert.equal(hasil.status, 'perlu-manusia');
  assert.equal(hasil.perluManusia, true);
  assert.equal(adapter._panggilan.includes('isiPenggunaIdMe'), false);
  assert.equal(adapter._panggilan.includes('isiKataLaluanIdMe'), false);
  assert.equal(adapter._panggilan.includes('hantarBorangLogMasuk'), false);
});

test('OTP/2FA selepas hantar -> berhenti perlu-manusia (tidak pernah memintas)', async () => {
  const adapter = buatHalamanLoginPalsu({ otpSelepasHantar: true });
  const hasil = await jalankanLoginAuto(adapter, KRED);
  assert.equal(hasil.status, 'perlu-manusia');
  assert.equal(hasil.perluManusia, true);
  assert.equal(adapter._panggilan.includes('isiKataLaluanIdMe'), true, 'sempat menaip kata laluan sebelum OTP dikesan');
  assert.equal(adapter._panggilan.includes('hantarBorangLogMasuk'), true);
  assert.equal(adapter._panggilan.includes('sahkanSesiSelepasLogin'), false, 'tidak boleh meneruskan selepas OTP');
});

test('hos bukan idMe -> hos-tidak-sah, tiada menaip', async () => {
  const adapter = buatHalamanLoginPalsu({ urlAwal: 'https://jahat.invalid/' });
  const hasil = await jalankanLoginAuto(adapter, KRED);
  assert.equal(hasil.status, 'hos-tidak-sah');
  assert.equal(adapter._panggilan.includes('isiPenggunaIdMe'), false);
});

test('frasa padan + tiada CAPTCHA/OTP -> isi, hantar, sesi-sah', async () => {
  const adapter = buatHalamanLoginPalsu();
  const hasil = await jalankanLoginAuto(adapter, KRED);
  assert.equal(hasil.status, 'sesi-sah');
  assert.equal(hasil.perluManusia, false);
  assert.equal(adapter._panggilan.includes('isiPenggunaIdMe'), true);
  assert.equal(adapter._panggilan.includes('tandakanKunciKeselamatan'), true);
  assert.equal(adapter._panggilan.includes('isiKataLaluanIdMe'), true);
  assert.equal(adapter._panggilan.includes('hantarBorangLogMasuk'), true);
});

test('dashboard idMe selepas hantar (hos idme, borang hilang) -> sesi-sah, BUKAN perlu-manusia', async () => {
  // Senario LIVE sebenar (bundle diagnostik pemilik): selepas "Daftar Masuk",
  // halaman mendarat pada papan pemuka idMe (idme.moe.gov.my) dengan navigasi
  // Aplikasi/Laporan + breadcrumb "Laman Utama / Dashboard", manakala borang
  // log masuk (#check_log/#password) SUDAH hilang. Ini log masuk BERJAYA —
  // bukan perlu-manusia — walaupun hos belum moeispel.moe.gov.my (MOEIS
  // dicapai kemudian melalui pautan Aplikasi/SSO).
  const adapter = buatHalamanLoginPalsu({ sesiSah: false, dashboardIdMe: true });
  const hasil = await jalankanLoginAuto(adapter, KRED);
  assert.equal(hasil.status, 'sesi-sah');
  assert.equal(hasil.perluManusia, false);
  assert.equal(adapter._panggilan.includes('sahkanSesiSelepasLogin'), true);
});

test('borang log masuk idMe masih dipaparkan selepas hantar -> perlu-manusia dengan sebab menamakan penemuan', async () => {
  const adapter = buatHalamanLoginPalsu({ sesiSah: false, borangKekal: true });
  const hasil = await jalankanLoginAuto(adapter, KRED);
  assert.equal(hasil.status, 'perlu-manusia');
  assert.equal(hasil.perluManusia, true);
  assert.match(hasil.sebab, /borang log masuk idMe \(#check_log\/#password\) masih dipaparkan/);
});

test('hos idme selepas hantar tanpa borang mahupun papan pemuka -> perlu-manusia, sebab menamakan hos', async () => {
  const adapter = buatHalamanLoginPalsu({ sesiSah: false, dashboardIdMe: false, borangKekal: false });
  const hasil = await jalankanLoginAuto(adapter, KRED);
  assert.equal(hasil.status, 'perlu-manusia');
  assert.equal(hasil.perluManusia, true);
  assert.match(hasil.sebab, /hos ialah idme\.moe\.gov\.my/);
});

test('kunci kosong: frasa disimpan kosong -> tiada-kredensial; frasa halaman tidak dapat dibaca -> kunci-tiada (BUKAN kunci-tidak-padan)', async () => {
  // Frasa disimpan kosong: fail-closed di lapisan pengawal kredensial.
  let adapter = buatHalamanLoginPalsu();
  let hasil = await jalankanLoginAuto(adapter, { ...KRED, kunciKeselamatan: '' });
  assert.equal(hasil.status, 'tiada-kredensial');
  assert.equal(adapter._panggilan.includes('isiPenggunaIdMe'), false);
  // Frasa halaman tidak dapat dibaca sebagai teks (disimpan tidak kosong):
  // ini ialah 'kunci-tiada' (kejujuran: "tidak dapat dibaca", bukan "tidak
  // padan") — status berasingan daripada 'kunci-tidak-padan'.
  adapter = buatHalamanLoginPalsu({ kunciHalaman: '' });
  hasil = await jalankanLoginAuto(adapter, KRED);
  assert.equal(hasil.status, 'kunci-tiada');
  assert.notEqual(hasil.status, 'kunci-tidak-padan');
  assert.equal(hasil.perluManusia, true);
  assert.equal(adapter._panggilan.includes('tandakanKunciKeselamatan'), false);
  assert.equal(adapter._panggilan.includes('isiKataLaluanIdMe'), false);
});

test('REGRESI: bacaKunciKeselamatan dipanggil HANYA SELEPAS lanjutkanPengesahan (frasa tiada pada halaman IC)', async () => {
  // Pepijat asal: kod lama membaca frasa SEBELUM menghantar IC, pada halaman
  // yang tidak pernah memaparkan frasa itu — sentiasa null, runtuh menjadi
  // 'kunci-tidak-padan' yang mengelirukan. Aliran betul mesti menghantar IC
  // dan sampai ke /loginverification dahulu.
  const adapter = buatHalamanLoginPalsu();
  await jalankanLoginAuto(adapter, KRED);
  const iLanjut = adapter._panggilan.indexOf('lanjutkanPengesahan');
  const iBaca = adapter._panggilan.indexOf('bacaKunciKeselamatan');
  assert.notEqual(iLanjut, -1, 'lanjutkanPengesahan mesti dipanggil');
  assert.notEqual(iBaca, -1, 'bacaKunciKeselamatan mesti dipanggil');
  assert.ok(iBaca > iLanjut, 'bacaKunciKeselamatan mesti selepas lanjutkanPengesahan (bukan sebelum)');
});

test('kata laluan digerbang oleh kotak semak: urutan tepat lanjutkanPengesahan -> tandakanKunciKeselamatan -> isiKataLaluanIdMe -> hantarBorangLogMasuk', async () => {
  const adapter = buatHalamanLoginPalsu();
  const hasil = await jalankanLoginAuto(adapter, KRED);
  assert.equal(hasil.status, 'sesi-sah');
  const iLanjut = adapter._panggilan.indexOf('lanjutkanPengesahan');
  const iKotak = adapter._panggilan.indexOf('tandakanKunciKeselamatan');
  const iKataLaluan = adapter._panggilan.indexOf('isiKataLaluanIdMe');
  const iHantar = adapter._panggilan.indexOf('hantarBorangLogMasuk');
  assert.ok(iLanjut < iKotak, 'lanjutkanPengesahan sebelum tandakanKunciKeselamatan');
  assert.ok(iKotak < iKataLaluan, 'kotak semak ditanda SEBELUM kata laluan ditaip');
  assert.ok(iKataLaluan < iHantar, 'kata laluan ditaip sebelum hantar');
  assert.equal(adapter._kotakSemak, true);
});

test('kotak semak GAGAL ditanda -> kotak-pengesahan-gagal, TIADA kata laluan ditaip, TIADA hantar', async () => {
  // Adapter PRODUKSI memulangkan false apabila kotak semak tidak dijumpai
  // atau kata laluan tidak didedahkan. Sebelum pembetulan, nilai ini diabaikan
  // dan aliran terus ke isiKataLaluanIdMe — yang timeout pada medan tersembunyi
  // (bocor "ralat teknikal"). Kini aliran mesti ABORT dengan jelas.
  const adapter = buatHalamanLoginPalsu({ kotakGagal: true });
  const hasil = await jalankanLoginAuto(adapter, KRED);
  assert.equal(hasil.status, 'kotak-pengesahan-gagal');
  assert.equal(hasil.perluManusia, true);
  assert.equal(adapter._panggilan.includes('tandakanKunciKeselamatan'), true, 'kotak semak mesti dicuba');
  assert.equal(adapter._panggilan.includes('isiKataLaluanIdMe'), false, 'tidak boleh menaip kata laluan jika kotak semak gagal');
  assert.equal(adapter._panggilan.includes('hantarBorangLogMasuk'), false, 'tidak boleh hantar jika kotak semak gagal');
  assert.equal(adapter._kotakSemak, false);
});

test('benarkanTerusTanpaFrasa HIDUP + kotak semak GAGAL -> masih kotak-pengesahan-gagal (perlindungan kotak semak tidak dilonggarkan)', async () => {
  const adapter = buatHalamanLoginPalsu({ kunciAdaImej: true, kotakGagal: true });
  const hasil = await jalankanLoginAuto(adapter, KRED, { benarkanTerusTanpaFrasa: true });
  assert.equal(hasil.status, 'kotak-pengesahan-gagal');
  assert.equal(hasil.perluManusia, true);
  assert.equal(adapter._panggilan.includes('isiKataLaluanIdMe'), false);
  assert.equal(adapter._panggilan.includes('hantarBorangLogMasuk'), false);
});

// ---------------- ketahanan halaman lambat/separa dimuatkan ----------------
// Adapter PRODUKSI kini memulangkan {ok,sebab} daripada isiPenggunaIdMe /
// isiKataLaluanIdMe dan MENUNGGU medan menjadi sedia. Aliran mesti menyemak
// pulangan ini dan ABORT dengan sebab jelas (bukan bocor "ralat teknikal").

test('isiPenggunaIdMe gagal (medan IC tidak muncul) -> perlu-manusia, bukti medan-ic-tiada, tiada langkah seterusnya', async () => {
  const adapter = buatHalamanLoginPalsu({ isiPenggunaGagal: true });
  const hasil = await jalankanLoginAuto(adapter, KRED);
  assert.equal(hasil.status, 'perlu-manusia');
  assert.equal(hasil.perluManusia, true);
  assert.equal(adapter._panggilan.includes('isiPenggunaIdMe'), true);
  assert.equal(adapter._panggilan.includes('lanjutkanPengesahan'), false, 'tidak boleh lanjut jika IC tidak diisi');
  assert.equal(adapter._panggilan.includes('isiKataLaluanIdMe'), false);
  assert.equal(adapter._panggilan.includes('hantarBorangLogMasuk'), false);
  assert.ok(Array.isArray(hasil.bukti) && hasil.bukti.includes('medan-ic-tiada'));
});

test('isiKataLaluanIdMe gagal (medan kata laluan tidak muncul) -> perlu-manusia, tiada hantar, tiada sahkan sesi', async () => {
  const adapter = buatHalamanLoginPalsu({ isiKataLaluanGagal: true });
  const hasil = await jalankanLoginAuto(adapter, KRED);
  assert.equal(hasil.status, 'perlu-manusia');
  assert.equal(hasil.perluManusia, true);
  assert.equal(adapter._panggilan.includes('isiKataLaluanIdMe'), true, 'kata laluan mesti dicuba');
  assert.equal(adapter._panggilan.includes('hantarBorangLogMasuk'), false, 'tidak boleh hantar jika kata laluan tidak diisi');
  assert.equal(adapter._panggilan.includes('sahkanSesiSelepasLogin'), false);
  assert.ok(Array.isArray(hasil.bukti) && hasil.bukti.includes('medan-kata-laluan-tiada'));
});

test('kunci-tiada: frasa null (mungkin imej kunciAdaImej:true) -> perlu-manusia, tiada kotak semak, tiada kata laluan', async () => {
  const adapter = buatHalamanLoginPalsu({ kunciAdaImej: true });
  const hasil = await jalankanLoginAuto(adapter, KRED);
  assert.equal(hasil.status, 'kunci-tiada');
  assert.equal(hasil.perluManusia, true);
  assert.notEqual(hasil.status, 'kunci-tidak-padan');
  assert.equal(adapter._panggilan.includes('tandakanKunciKeselamatan'), false);
  assert.equal(adapter._panggilan.includes('isiKataLaluanIdMe'), false);
  assert.equal(adapter._panggilan.includes('hantarBorangLogMasuk'), false);
});

// ---------------- benarkanTerusTanpaFrasa (opt-in, lalai MATI) ----------------

test('benarkanTerusTanpaFrasa HIDUP + frasa tidak dapat dibaca -> TERUSKAN sepenuhnya, kunci-tiada-dibenarkan, sesiSah:true', async () => {
  const adapter = buatHalamanLoginPalsu({ kunciAdaImej: true });
  const hasil = await jalankanLoginAuto(adapter, KRED, { benarkanTerusTanpaFrasa: true });
  assert.equal(hasil.status, 'kunci-tiada-dibenarkan');
  assert.equal(hasil.perluManusia, false);
  assert.equal(hasil.sesiSah, true);
  assert.equal(adapter._panggilan.includes('tandakanKunciKeselamatan'), true);
  assert.equal(adapter._panggilan.includes('isiKataLaluanIdMe'), true);
  assert.equal(adapter._panggilan.includes('hantarBorangLogMasuk'), true);
  assert.equal(adapter._panggilan.includes('sahkanSesiSelepasLogin'), true);
});

test('benarkanTerusTanpaFrasa MATI (lalai) + frasa tidak dapat dibaca -> BERHENTI seperti biasa (kunci-tiada)', async () => {
  const adapter = buatHalamanLoginPalsu({ kunciAdaImej: true });
  // Tiada hujah ketiga langsung -> lalai MATI.
  let hasil = await jalankanLoginAuto(adapter, KRED);
  assert.equal(hasil.status, 'kunci-tiada');
  assert.equal(hasil.perluManusia, true);
  assert.equal(adapter._panggilan.includes('tandakanKunciKeselamatan'), false);
  assert.equal(adapter._panggilan.includes('isiKataLaluanIdMe'), false);

  // Sama juga apabila dinyatakan eksplisit { benarkanTerusTanpaFrasa: false }.
  const adapter2 = buatHalamanLoginPalsu({ kunciAdaImej: true });
  hasil = await jalankanLoginAuto(adapter2, KRED, { benarkanTerusTanpaFrasa: false });
  assert.equal(hasil.status, 'kunci-tiada');
  assert.equal(adapter2._panggilan.includes('tandakanKunciKeselamatan'), false);
});

test('benarkanTerusTanpaFrasa HIDUP TETAPI frasa TIDAK PADAN (dibaca, berbeza) -> tetap BERHENTI (anti-pancing tidak dilonggarkan)', async () => {
  const adapter = buatHalamanLoginPalsu({ kunciHalaman: 'FRASA-LAIN-BERBEZA' });
  const hasil = await jalankanLoginAuto(adapter, KRED, { benarkanTerusTanpaFrasa: true });
  assert.equal(hasil.status, 'kunci-tidak-padan');
  assert.equal(hasil.perluManusia, true);
  assert.equal(adapter._panggilan.includes('tandakanKunciKeselamatan'), false);
  assert.equal(adapter._panggilan.includes('isiKataLaluanIdMe'), false);
});

test('benarkanTerusTanpaFrasa HIDUP + frasa tidak dapat dibaca + OTP selepas hantar -> perlu-manusia (checkbox/password/submit berlaku, tiada sahkan sesi)', async () => {
  const adapter = buatHalamanLoginPalsu({ kunciAdaImej: true, otpSelepasHantar: true });
  const hasil = await jalankanLoginAuto(adapter, KRED, { benarkanTerusTanpaFrasa: true });
  assert.equal(hasil.status, 'perlu-manusia');
  assert.equal(hasil.perluManusia, true);
  assert.equal(adapter._panggilan.includes('tandakanKunciKeselamatan'), true);
  assert.equal(adapter._panggilan.includes('isiKataLaluanIdMe'), true);
  assert.equal(adapter._panggilan.includes('hantarBorangLogMasuk'), true);
  assert.equal(adapter._panggilan.includes('sahkanSesiSelepasLogin'), false, 'tidak boleh meneruskan selepas OTP');
});

test('benarkanTerusTanpaFrasa HIDUP + kunci-tiada-dibenarkan: hasil TIDAK PERNAH mengandungi nilai kredensial', async () => {
  const adapter = buatHalamanLoginPalsu({ kunciAdaImej: true });
  const hasil = await jalankanLoginAuto(adapter, KRED, { benarkanTerusTanpaFrasa: true });
  assert.equal(hasil.status, 'kunci-tiada-dibenarkan');
  const teks = JSON.stringify(hasil);
  assert.equal(teks.includes(KRED.kataLaluan), false, 'kata laluan tidak boleh muncul dalam hasil');
  assert.equal(teks.includes(KRED.pengguna), false, 'pengguna tidak boleh muncul dalam hasil');
});

// ---------------- hantarBorangLogMasuk({ok:false}) -> perlu-manusia, tiada sahkanSesiSelepasLogin ----------------

test('hantarBorangLogMasuk gagal (ok:false, cth dua butang "Daftar Masuk" pada idMe sebenar) -> perlu-manusia dengan sebab yang sama, TIDAK meneruskan ke sahkanSesiSelepasLogin', async () => {
  const adapter = buatHalamanLoginPalsu({
    hantarGagal: true,
    hantarSebab: 'Tiada butang "Daftar Masuk" yang aktif dan kelihatan pada halaman pengesahan idMe. Kemungkinan borang belum lengkap, kotak semak pengesahan belum ditanda, atau kata laluan tidak diterima.'
  });
  const hasil = await jalankanLoginAuto(adapter, KRED);
  assert.equal(hasil.status, 'perlu-manusia');
  assert.equal(hasil.perluManusia, true);
  assert.equal(hasil.sebab, 'Tiada butang "Daftar Masuk" yang aktif dan kelihatan pada halaman pengesahan idMe. Kemungkinan borang belum lengkap, kotak semak pengesahan belum ditanda, atau kata laluan tidak diterima.');
  assert.deepEqual(hasil.bukti, ['butang-hantar-tiada']);
  assert.equal(adapter._panggilan.includes('hantarBorangLogMasuk'), true, 'hantar mesti dicuba');
  assert.equal(adapter._panggilan.includes('sahkanSesiSelepasLogin'), false, 'tidak boleh meneruskan ke sahkan sesi jika hantar gagal');
});

test('laluan penuh berjaya: urutan lengkap navigasi -> IC -> lanjut -> baca kunci -> kotak semak -> kata laluan -> hantar -> sesi-sah', async () => {
  const adapter = buatHalamanLoginPalsu();
  const hasil = await jalankanLoginAuto(adapter, KRED);
  assert.equal(hasil.status, 'sesi-sah');
  assert.equal(hasil.perluManusia, false);
  const bukanCaptcha = adapter._panggilan.filter((p) => p !== 'semakCaptchaOtp' && p !== 'urlHalaman');
  assert.deepEqual(bukanCaptcha, [
    'navigasiLoginIdMe',
    'isiPenggunaIdMe',
    'lanjutkanPengesahan',
    'bacaKunciKeselamatan',
    'tandakanKunciKeselamatan',
    'isiKataLaluanIdMe',
    'hantarBorangLogMasuk',
    'sahkanSesiSelepasLogin'
  ]);
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

// ---------------- cubaLoginAutoKerja (job-time, sama orkestrasi terpandu) ----------------

test('cubaLoginAutoKerja: loginAuto MATI -> tiada kesan sampingan', async () => {
  const panggilan = [];
  const hasil = await cubaLoginAutoKerja({
    bacaTetapan: () => ({ loginAuto: false }),
    adaKredensial: () => { panggilan.push('adaKredensial'); return true; },
    sesiDisahkan: async () => { panggilan.push('sesi'); return { ada: false }; },
    cubaSekaliLogin: async () => { panggilan.push('cuba'); return {}; },
    tulisLog: () => {}
  });
  assert.equal(hasil.diminta, false);
  assert.equal(hasil.cuba, false);
  assert.deepEqual(panggilan, []);
});

test('cubaLoginAutoKerja: ON + kredensial + sesi SAH -> tiada cubaan', async () => {
  let cuba = 0;
  const hasil = await cubaLoginAutoKerja({
    bacaTetapan: () => ({ loginAuto: true }),
    adaKredensial: () => true,
    sesiDisahkan: async () => ({ ada: true }),
    cubaSekaliLogin: async () => { cuba++; return {}; },
    tulisLog: () => {}
  });
  assert.equal(hasil.cuba, false);
  assert.equal(cuba, 0);
});

test('cubaLoginAutoKerja: ON + kredensial + sesi TIDAK sah -> satu cubaan', async () => {
  let cuba = 0;
  const hasil = await cubaLoginAutoKerja({
    bacaTetapan: () => ({ loginAuto: true }),
    adaKredensial: () => true,
    sesiDisahkan: async () => ({ ada: false }),
    cubaSekaliLogin: async () => { cuba++; return { status: 'sesi-sah' }; },
    tulisLog: () => {}
  });
  assert.equal(hasil.cuba, true);
  assert.equal(cuba, 1);
});

// ---------------- status/snapshot/ayat ----------------

test('buatStatusLoginAuto: bentuk lalai betul', () => {
  const st = buatStatusLoginAuto();
  assert.deepEqual(st, {
    diminta: false, adaKredensial: false, sesiSah: null, percubaan: 0,
    had: 2, hasilTerakhir: '', sebab: 'Belum dinilai.'
  });
});

test('ayatLoginAuto: ayat mengikut keutamaan yang didokumenkan', () => {
  assert.match(ayatLoginAuto({ diminta: false }), /Suis loginAuto MATI/);
  assert.match(ayatLoginAuto({ diminta: true, adaKredensial: false }), /Kredensial idMe tiada/);
  assert.match(ayatLoginAuto({ diminta: true, adaKredensial: true, sesiSah: true }), /Diminta tetapi sesi idMe sudah sah/);
  assert.match(ayatLoginAuto({ diminta: true, adaKredensial: true, sesiSah: false, hasilTerakhir: 'sesi-sah' }), /Berjaya/);
  assert.match(ayatLoginAuto({ diminta: true, adaKredensial: true, sesiSah: false, hasilTerakhir: 'had-cubaan' }), /Had cubaan dicapai/);
  assert.match(ayatLoginAuto({ diminta: true, adaKredensial: true, sesiSah: false, hasilTerakhir: 'perlu-manusia', sebab: 'OTP dikesan' }), /Perlu manusia/);
  assert.match(ayatLoginAuto({ diminta: true, adaKredensial: true, sesiSah: false, hasilTerakhir: 'kunci-tidak-padan' }), /frasa keselamatan tidak padan/);
  assert.match(ayatLoginAuto({ diminta: true, adaKredensial: true, sesiSah: false, hasilTerakhir: 'kunci-tiada' }), /tidak dapat dibaca/);
  assert.match(ayatLoginAuto({ diminta: true, adaKredensial: true, sesiSah: false, hasilTerakhir: 'kunci-tiada-dibenarkan' }), /benarkanTerusTanpaFrasa HIDUP/);
  assert.match(ayatLoginAuto({ diminta: true, adaKredensial: true, sesiSah: false, hasilTerakhir: 'kotak-pengesahan-gagal' }), /kotak semak pengesahan tidak dapat ditanda/);
});

test('snapshotLoginAutoStatus: menggabungkan tetapan + status semasa + ayat', () => {
  const status = buatStatusLoginAuto();
  Object.assign(status, { sesiSah: false, hasilTerakhir: 'sesi-sah', sebab: 'ok', percubaan: 1 });
  const snap = snapshotLoginAutoStatus(status, {
    bacaTetapan: () => ({ loginAuto: true }),
    adaKredensial: () => true,
    bilCubaan: () => 1
  });
  assert.deepEqual(Object.keys(snap).sort(),
    ['adaKredensial', 'benarkanTerusTanpaFrasa', 'diminta', 'had', 'hasilTerakhir', 'percubaan', 'sebab', 'sesiSah'].sort());
  assert.equal(snap.diminta, true);
  assert.equal(snap.adaKredensial, true);
  assert.equal(snap.percubaan, 1);
  assert.equal(snap.had, 2);
  assert.equal(snap.benarkanTerusTanpaFrasa, false, 'lalai MATI apabila tiada dalam tetapan');
  assert.match(snap.sebab, /Berjaya/);
});

test('snapshotLoginAutoStatus: benarkanTerusTanpaFrasa mencerminkan tetapan HIDUP', () => {
  const status = buatStatusLoginAuto();
  const snap = snapshotLoginAutoStatus(status, {
    bacaTetapan: () => ({ loginAuto: true, benarkanTerusTanpaFrasa: true }),
    adaKredensial: () => true,
    bilCubaan: () => 0
  });
  assert.equal(snap.benarkanTerusTanpaFrasa, true);
});

// ---------------- had cubaan dikongsi antara startup dan job-time ----------------

test('had cubaan dikongsi: startup + job-time berkongsi SATU kaunter proses', async () => {
  let jalanDipanggil = 0;
  const pengurus = buatPengurusLoginAuto({
    adaKredensial: () => true,
    jalankan: async () => { jalanDipanggil++; return { status: 'perlu-manusia', perluManusia: true, sebab: 'gagal (ujian)' }; },
    jedaMs: 0
  });
  const deps = {
    bacaTetapan: () => ({ loginAuto: true }),
    adaKredensial: () => true,
    sesiDisahkan: async () => ({ ada: false }),
    cubaSekaliLogin: () => pengurus.cubaAuto(),
    tulisLog: () => {}
  };
  const pertama = await cubaLoginAutoStartup(deps);
  const kedua = await cubaLoginAutoKerja(deps);
  const ketiga = await cubaLoginAutoKerja(deps);
  assert.equal(jalanDipanggil, 2, 'jalankan mesti dipanggil tepat 2 kali merentas startup + job-time');
  assert.equal(pertama.hasil.status, 'perlu-manusia');
  assert.equal(kedua.hasil.status, 'perlu-manusia');
  assert.equal(ketiga.hasil.status, 'had-cubaan');
});

// ---------------- cubaLoginAutoKerja PAKSA (isyarat sesi-tamat hidup memintas cache) ----------------

test('cubaLoginAutoKerja paksa: cache SAH TIDAK menyekat cubaan sebenar (isyarat sesi-tamat hidup memintas cache)', async () => {
  let sesiDipanggil = 0, cuba = 0;
  const hasil = await cubaLoginAutoKerja({
    bacaTetapan: () => ({ loginAuto: true }),
    adaKredensial: () => true,
    sesiDisahkan: async () => { sesiDipanggil++; return { ada: true }; },
    cubaSekaliLogin: async () => { cuba++; return { status: 'sesi-sah' }; },
    tulisLog: () => {}
  }, { paksa: true });
  assert.equal(hasil.cuba, true);
  assert.equal(cuba, 1);
  assert.equal(sesiDipanggil, 0, 'cache sesi TIDAK dirujuk dalam mod paksa');
  assert.equal(hasil.hasil.status, 'sesi-sah');
});

test('cubaLoginAutoKerja paksa: loginAuto MATI tetap dihormati (paksa TIDAK memintas suis)', async () => {
  const panggilan = [];
  const hasil = await cubaLoginAutoKerja({
    bacaTetapan: () => ({ loginAuto: false }),
    adaKredensial: () => { panggilan.push('adaKredensial'); return true; },
    sesiDisahkan: async () => { panggilan.push('sesi'); return { ada: true }; },
    cubaSekaliLogin: async () => { panggilan.push('cuba'); return {}; },
    tulisLog: () => {}
  }, { paksa: true });
  assert.equal(hasil.diminta, false);
  assert.equal(hasil.cuba, false);
  assert.deepEqual(panggilan, []);
});

test('cubaLoginAutoKerja paksa: tanpa kredensial -> langkau (paksa TIDAK memintas pengawal kredensial)', async () => {
  let cuba = 0;
  const hasil = await cubaLoginAutoKerja({
    bacaTetapan: () => ({ loginAuto: true }),
    adaKredensial: () => false,
    sesiDisahkan: async () => { throw new Error('tidak boleh dirujuk tanpa kredensial'); },
    cubaSekaliLogin: async () => { cuba++; return {}; },
    tulisLog: () => {}
  }, { paksa: true });
  assert.equal(hasil.cuba, false);
  assert.equal(cuba, 0);
});

test('cubaLoginAutoKerja paksa: had cubaan dikongsi dengan startup (satu kaunter proses)', async () => {
  let jalanDipanggil = 0;
  const pengurus = buatPengurusLoginAuto({
    adaKredensial: () => true,
    jalankan: async () => { jalanDipanggil++; return { status: 'perlu-manusia', perluManusia: true, sebab: 'gagal (ujian)' }; },
    jedaMs: 0
  });
  const deps = {
    bacaTetapan: () => ({ loginAuto: true }),
    adaKredensial: () => true,
    sesiDisahkan: async () => ({ ada: false }),
    cubaSekaliLogin: () => pengurus.cubaAuto(),
    tulisLog: () => {}
  };
  const pertama = await cubaLoginAutoStartup(deps);
  const kedua = await cubaLoginAutoKerja(deps, { paksa: true });
  const ketiga = await cubaLoginAutoKerja(deps, { paksa: true });
  assert.equal(jalanDipanggil, 2, 'paksa berkongsi cap 2 cubaan dengan startup');
  assert.equal(pertama.hasil.status, 'perlu-manusia');
  assert.equal(kedua.hasil.status, 'perlu-manusia');
  assert.equal(ketiga.hasil.status, 'had-cubaan');
});
