import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  jalankanLoginAuto, buatPengurusLoginAuto, cubaLoginAutoStartup, cubaLoginAutoKerja,
  buatStatusLoginAuto, snapshotLoginAutoStatus, ayatLoginAuto, klasifikasiHasilLogin
} from '../src/moeis/login-auto.mjs';
import { buatHadKadarLogin } from '../src/moeis/had-login.mjs';
import { buatProbeSesiLangsung } from '../src/moeis/probe-sesi.mjs';
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

test('borang log masuk idMe masih dipaparkan selepas hantar -> sesi-tidak-dapat-disahkan (TRANSIENT, bukan penolakan kredensial), sebab menamakan penemuan', async () => {
  // v1.11.22: sesi tidak dapat disahkan selepas hantar TIDAK bermakna
  // kredensial ditolak (Gap 1) — cuma bukti idMe tidak memaparkan penolakan
  // EKSPLISIT mahupun kejayaan. perluManusia mesti FALSE supaya pemulihan/
  // cubaan semula bersempadan diteruskan, bukan berhenti kekal.
  const adapter = buatHalamanLoginPalsu({ sesiSah: false, borangKekal: true });
  const hasil = await jalankanLoginAuto(adapter, KRED);
  assert.equal(hasil.status, 'sesi-tidak-dapat-disahkan');
  assert.equal(hasil.perluManusia, false);
  assert.match(hasil.sebab, /borang log masuk idMe \(#check_log\/#password\) masih dipaparkan/);
});

test('hos idme selepas hantar tanpa borang mahupun papan pemuka -> sesi-tidak-dapat-disahkan (transient), sebab menamakan hos', async () => {
  const adapter = buatHalamanLoginPalsu({ sesiSah: false, dashboardIdMe: false, borangKekal: false });
  const hasil = await jalankanLoginAuto(adapter, KRED);
  assert.equal(hasil.status, 'sesi-tidak-dapat-disahkan');
  assert.equal(hasil.perluManusia, false);
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

// --- Integrasi had KADAR log masuk automatik (persisten merentas restart) ---

function storanKadarPalsu() {
  let nilai = null;
  return {
    baca: () => (nilai ? JSON.parse(JSON.stringify(nilai)) : null),
    tulis: (s) => { nilai = JSON.parse(JSON.stringify(s)); }
  };
}

test('pengurus + hadKadar: 3 kegagalan berturut-turut disekat sebagai had-kegagalan-berturut', async () => {
  const storan = storanKadarPalsu();
  const hadKadar = buatHadKadarLogin({ baca: storan.baca, tulis: storan.tulis, sekarangMs: () => Date.now() });
  let panggil = 0;
  const pengurus = buatPengurusLoginAuto({
    adaKredensial: () => true,
    // Penolakan kredensial SEBENAR (bukti kredensial-ditolak) — inilah satu-satunya
    // jenis kegagalan yang mesti dikira sebagai strike (lihat klasifikasiHasilLogin).
    jalankan: async () => { panggil++; return { status: 'perlu-manusia', perluManusia: true, sebab: 'kredensial ditolak (ujian)', bukti: ['kredensial-ditolak'] }; },
    jedaMs: 0,
    hadKadar
  });
  await pengurus.cubaAuto();
  await pengurus.cubaAuto();
  await pengurus.cubaAuto();
  const keempat = await pengurus.cubaAuto();
  assert.equal(panggil, 3, 'jalankan mesti dipanggil tepat 3 kali (3 kegagalan berturut-turut)');
  assert.equal(keempat.status, 'had-kegagalan-berturut');
  assert.equal(keempat.perluManusia, true);
  assert.equal(pengurus.bilCubaan(), 3, 'bilCubaan mesti melaporkan bilangan dalam tetingkap sejam');
});

test('pengurus + hadKadar: had 6/jam disekat sebagai had-kadar apabila tiada kegagalan berturut-turut', async () => {
  const storan = storanKadarPalsu();
  const hadKadar = buatHadKadarLogin({ baca: storan.baca, tulis: storan.tulis, sekarangMs: () => Date.now() });
  // Pra-isi tetingkap sejam kepada had (6) secara terus tanpa mencetuskan
  // kegagalan berturut-turut — mensimulasikan 6 percubaan lalu yang masing-
  // masing berjaya (catatan mentah, bukan melalui pengurus).
  for (let i = 0; i < 6; i++) hadKadar.catatPercubaan();
  assert.equal(hadKadar.bolehCuba(), false, 'pra-syarat: tetingkap sejam mesti sudah penuh');

  let panggil = 0;
  const pengurus = buatPengurusLoginAuto({
    adaKredensial: () => true,
    jalankan: async () => { panggil++; return { status: 'sesi-sah', sesiSah: true }; },
    jedaMs: 0,
    hadKadar
  });
  const hasil = await pengurus.cubaAuto();
  assert.equal(panggil, 0, 'jalankan tidak boleh dipanggil apabila had jam sudah dicapai');
  assert.equal(hasil.status, 'had-kadar');
  // v1.11.22 Gap 3: had SEJAM ialah tunggu SEMENTARA (bukan sekatan kekal) —
  // perluManusia:false supaya pemulihan/cubaan semula automatik diteruskan
  // selepas tetingkap gelongsor, bukan berhenti menunggu manusia.
  assert.equal(hasil.perluManusia, false);
  assert.equal(hasil.kelas, 'transient');
  assert.equal(hasil.cubaSemula.jenis, 'tetingkap-jam');
});

test('pengurus + hadKadar: siling kadar KEKAL merentas restart (dua pengurus kongsi storan)', async () => {
  const storan = storanKadarPalsu();
  const buat = () => buatHadKadarLogin({ baca: storan.baca, tulis: storan.tulis, sekarangMs: () => Date.now() });

  const proses1 = buatPengurusLoginAuto({ adaKredensial: () => true, jalankan: async () => ({ status: 'perlu-manusia', perluManusia: true, sebab: 'kredensial ditolak (ujian)', bukti: ['kredensial-ditolak'] }), jedaMs: 0, hadKadar: buat() });
  await proses1.cubaAuto();
  await proses1.cubaAuto();
  await proses1.cubaAuto(); // 3 kegagalan berturut-turut -> disekat

  // "Restart" — pengurus baharu membaca storan kadar yang sama.
  let panggil2 = 0;
  const proses2 = buatPengurusLoginAuto({ adaKredensial: () => true, jalankan: async () => { panggil2++; return { status: 'perlu-manusia', perluManusia: true, sebab: 'kredensial ditolak (ujian)', bukti: ['kredensial-ditolak'] }; }, jedaMs: 0, hadKadar: buat() });
  const hasil = await proses2.cubaAuto();
  assert.equal(panggil2, 0, 'restart tidak boleh menetapkan semula siling kadar');
  assert.equal(hasil.status, 'had-kegagalan-berturut');
});

test('pengurus + hadKadar: kejayaan mengosongkan siling kadar (akaun tidak dikunci)', async () => {
  const storan = storanKadarPalsu();
  const hadKadar = buatHadKadarLogin({ baca: storan.baca, tulis: storan.tulis, sekarangMs: () => Date.now() });
  let panggil = 0;
  const pengurus = buatPengurusLoginAuto({
    adaKredensial: () => true,
    jalankan: async () => { panggil++; return panggil === 1 ? { status: 'perlu-manusia', perluManusia: true, sebab: 'gagal' } : { status: 'sesi-sah', sesiSah: true }; },
    jedaMs: 0,
    hadKadar
  });
  await pengurus.cubaAuto(); // gagal -> catat percubaan (1)
  assert.equal(hadKadar.bilPercubaan(), 1);
  await pengurus.cubaAuto(); // berjaya -> kosongkan pembilang
  assert.equal(hadKadar.bilPercubaan(), 0, 'kejayaan mesti mengosongkan pembilang kadar');
  assert.equal(hadKadar.bolehCuba(), true);
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

// ---------------- klasifikasiHasilLogin + single-flight (pembetulan Astra) ----------------

test('klasifikasiHasilLogin: mengelaskan hasil dengan betul (berjaya/penolakan-kredensial/perlu-manusia/transient)', () => {
  // v1.11.22 Gap 1: 'sesi-tamat'/bukti sesi-tidak-sah ialah sesi TIDAK DAPAT
  // DISAHKAN, bukan bukti kredensial ditolak — kini transient/perlu-manusia
  // mengikut status, TIDAK PERNAH lagi disalah anggap sebagai strike kredensial.
  assert.equal(klasifikasiHasilLogin({ status: 'sesi-tamat' }), 'transient');
  assert.equal(klasifikasiHasilLogin({ status: 'sesi-tidak-dapat-disahkan', bukti: ['sesi-tidak-dapat-disahkan'] }), 'transient');
  // status keras 'perlu-manusia' MENANG di atas bukti sesi-tidak-sah (bukan lagi
  // dianggap penolakan kredensial hanya kerana sesi tidak disahkan).
  assert.equal(klasifikasiHasilLogin({ status: 'perlu-manusia', bukti: ['sesi-tidak-sah'] }), 'perlu-manusia');
  assert.equal(klasifikasiHasilLogin({ status: 'gagal', bukti: ['ralat-teknikal'] }), 'transient');
  assert.equal(klasifikasiHasilLogin({ status: 'langkau' }), 'transient');
  assert.equal(klasifikasiHasilLogin({ status: 'perlu-manusia', perluManusia: true, bukti: ['otp-selepas-hantar'] }), 'perlu-manusia');
  assert.equal(klasifikasiHasilLogin({ status: 'kunci-tidak-padan', perluManusia: true, bukti: ['kunci-tidak-padan'] }), 'perlu-manusia');
  // isyarat penolakan kredensial EKSPLISIT sahaja dikira strike.
  assert.equal(klasifikasiHasilLogin({ status: 'kredensial-ditolak' }), 'penolakan-kredensial');
  assert.equal(klasifikasiHasilLogin({ status: 'perlu-manusia', bukti: ['kredensial-ditolak'] }), 'penolakan-kredensial');
  // Bendera perlu-manusia keras MESTI mendahului transient umum walaupun status
  // longgar (cth 'gagal') — bukti campuran tidak boleh diturunkan taraf.
  assert.equal(klasifikasiHasilLogin({ status: 'gagal', bukti: ['otp-selepas-hantar'] }), 'perlu-manusia');
  assert.equal(klasifikasiHasilLogin({ status: 'sesi-sah' }), 'berjaya');
  assert.equal(klasifikasiHasilLogin(null), 'transient');
  assert.equal(klasifikasiHasilLogin(undefined), 'transient');
});

test('pengurus + hadKadar: kegagalan TRANSIENT berulang TIDAK melatch had-kegagalan-berturut', async () => {
  const storan = storanKadarPalsu();
  const hadKadar = buatHadKadarLogin({ baca: storan.baca, tulis: storan.tulis, sekarangMs: () => Date.now() });
  const pengurus = buatPengurusLoginAuto({
    adaKredensial: () => true,
    jalankan: async () => ({ status: 'gagal', perluManusia: true, sebab: 'ralat teknikal (ujian)', bukti: ['ralat-teknikal'] }),
    jedaMs: 0,
    hadKadar
  });
  for (let i = 0; i < 5; i++) await pengurus.cubaAuto();
  assert.equal(hadKadar.statusRingkas().kegagalanBerturut, 0, 'ralat sementara tidak boleh menambah kegagalan berturut-turut');
  assert.equal(hadKadar.bolehCuba(), true, 'tiada latch kekal selepas ralat sementara berulang');
});

test('pengurus + hadKadar: HANYA penolakan kredensial dikira strike — 3 kali disekat, 3-strike tidak boleh jadi 4', async () => {
  const storan = storanKadarPalsu();
  const hadKadar = buatHadKadarLogin({ baca: storan.baca, tulis: storan.tulis, sekarangMs: () => Date.now() });
  let panggil = 0;
  const pengurus = buatPengurusLoginAuto({
    adaKredensial: () => true,
    jalankan: async () => { panggil++; return { status: 'perlu-manusia', perluManusia: true, sebab: 'kredensial ditolak (ujian)', bukti: ['kredensial-ditolak'] }; },
    jedaMs: 0,
    hadKadar
  });
  await pengurus.cubaAuto();
  await pengurus.cubaAuto();
  await pengurus.cubaAuto();
  const keempat = await pengurus.cubaAuto();
  assert.equal(panggil, 3, 'jalankan mesti dipanggil tepat 3 kali');
  assert.equal(keempat.status, 'had-kegagalan-berturut');
  assert.equal(hadKadar.statusRingkas().kegagalanBerturut, 3, '3-strike tidak boleh menjadi 4');
});

test('pengurus: single-flight — dua panggilan cubaAuto() serentak berkongsi SATU pelaksanaan jalankan', async () => {
  let panggilJalankan = 0;
  let lepaskan;
  const gerbang = new Promise((selesai) => { lepaskan = selesai; });
  const pengurus = buatPengurusLoginAuto({
    adaKredensial: () => true,
    jalankan: async () => { panggilJalankan++; await gerbang; return { status: 'sesi-sah', sesiSah: true }; },
    jedaMs: 0
  });
  const p1 = pengurus.cubaAuto();
  const p2 = pengurus.cubaAuto();
  lepaskan();
  const [h1, h2] = await Promise.all([p1, p2]);
  assert.equal(panggilJalankan, 1, 'jalankan mesti dipanggil tepat sekali walaupun dua panggilan serentak');
  assert.equal(h1.status, 'sesi-sah');
  assert.equal(h2.status, 'sesi-sah');
});

test('cubaLoginAutoKerja: sesi SAH (cache) -> tiada cubaan log masuk kredensial walaupun hadKadar disekat 3-strike', async () => {
  const storan = storanKadarPalsu();
  const hadKadar = buatHadKadarLogin({ baca: storan.baca, tulis: storan.tulis, sekarangMs: () => Date.now() });
  hadKadar.catatPercubaan(); hadKadar.catatKegagalan();
  hadKadar.catatPercubaan(); hadKadar.catatKegagalan();
  hadKadar.catatPercubaan(); hadKadar.catatKegagalan();
  assert.equal(hadKadar.bolehCuba(), false, 'pra-syarat: hadKadar mesti disekat 3-strike');

  let cubaSekaliDipanggil = 0;
  const hasil = await cubaLoginAutoKerja({
    bacaTetapan: () => ({ loginAuto: true }),
    adaKredensial: () => true,
    sesiDisahkan: async () => ({ ada: true }),
    cubaSekaliLogin: async () => { cubaSekaliDipanggil++; return {}; },
    tulisLog: () => {}
  });
  assert.equal(hasil.cuba, false, 'sesi sudah sah -> tiada cubaan log masuk kredensial');
  assert.equal(cubaSekaliDipanggil, 0, 'cubaSekaliLogin tidak boleh dipanggil apabila sesi cache sudah sah');
});

test('WIRING: buatHadKadarLogin sebenar + buatPengurusLoginAuto sebenar + cubaLoginAutoKerja sebenar — sesi tamat pulih bersih', async () => {
  const storan = storanKadarPalsu();
  const hadKadar = buatHadKadarLogin({ baca: storan.baca, tulis: storan.tulis, sekarangMs: () => Date.now() });
  const adapter = buatHalamanLoginPalsu();
  const pengurus = buatPengurusLoginAuto({
    adaKredensial: () => true,
    jalankan: () => jalankanLoginAuto(adapter, KRED),
    jedaMs: 0,
    hadKadar
  });
  const hasil = await cubaLoginAutoKerja({
    bacaTetapan: () => ({ loginAuto: true }),
    adaKredensial: () => true,
    sesiDisahkan: async () => ({ ada: false }),
    cubaSekaliLogin: () => pengurus.cubaAuto(),
    tulisLog: () => {}
  });
  assert.equal(hasil.cuba, true);
  assert.equal(hasil.hasil.status, 'sesi-sah');
  assert.equal(hadKadar.statusRingkas().kegagalanBerturut, 0);
});

test('pengurus: hasil transient TIDAK ditanda perluManusia (pemulihan auto-mula TIDAK berhenti pada ralat sementara)', async () => {
  const pengurus = buatPengurusLoginAuto({
    adaKredensial: () => true,
    jalankan: async () => ({ status: 'gagal', perluManusia: true, sebab: 'ralat teknikal (ujian)', bukti: ['ralat-teknikal'] }),
    jedaMs: 0
  });
  const hasil = await pengurus.cubaAuto();
  assert.equal(hasil.kelas, 'transient');
  assert.equal(hasil.perluManusia, false, 'ralat sementara mesti dilihat tidak-perlu-manusia supaya pemulihan diteruskan');
});

test('pengurus: hasil penolakan kredensial KEKAL perluManusia:true (berhenti untuk manusia)', async () => {
  const pengurus = buatPengurusLoginAuto({
    adaKredensial: () => true,
    jalankan: async () => ({ status: 'perlu-manusia', perluManusia: true, sebab: 'kredensial ditolak (ujian)', bukti: ['kredensial-ditolak'] }),
    jedaMs: 0
  });
  const hasil = await pengurus.cubaAuto();
  assert.equal(hasil.kelas, 'penolakan-kredensial');
  assert.equal(hasil.perluManusia, true, 'penolakan kredensial mesti kekal perlu-manusia');
});

// ---------------- v1.11.22 Gap 2: hasil malformed/null daripada jalankan() ----------------

test('pengurus: jalankan() memulangkan null -> tidak melontar, dilayan sebagai transient', async () => {
  const pengurus = buatPengurusLoginAuto({
    adaKredensial: () => true,
    jalankan: async () => null,
    jedaMs: 0
  });
  const hasil = await pengurus.cubaAuto();
  assert.equal(hasil.kelas, 'transient');
  assert.equal(hasil.perluManusia, false);
  assert.equal(hasil.status, 'gagal');
});

test('pengurus: jalankan() memulangkan rentetan (bukan objek) -> tidak melontar, dilayan sebagai transient', async () => {
  const pengurus = buatPengurusLoginAuto({
    adaKredensial: () => true,
    jalankan: async () => 'ralat-mentah-bukan-objek',
    jedaMs: 0
  });
  const hasil = await pengurus.cubaAuto();
  assert.equal(hasil.kelas, 'transient');
  assert.equal(hasil.perluManusia, false);
});

// ---------------- v1.11.22 Gap 3: had kadar sejam/harian ialah TRANSIENT (retry-after), bukan sekatan kekal ----------------

test('pengurus + hadKadar: had TETINGKAP SEJAM disekat -> had-kadar, perluManusia:false, cubaSemula.tetingkap-jam', async () => {
  const storan = storanKadarPalsu();
  const hadKadar = buatHadKadarLogin({ baca: storan.baca, tulis: storan.tulis, sekarangMs: () => Date.now() });
  for (let i = 0; i < 6; i++) hadKadar.catatPercubaan();
  assert.equal(hadKadar.bolehCuba(), false, 'pra-syarat: tetingkap sejam mesti penuh');

  let panggil = 0;
  const pengurus = buatPengurusLoginAuto({
    adaKredensial: () => true,
    jalankan: async () => { panggil++; return { status: 'sesi-sah', sesiSah: true }; },
    jedaMs: 0,
    hadKadar
  });
  const hasil = await pengurus.cubaAuto();
  assert.equal(panggil, 0);
  assert.equal(hasil.status, 'had-kadar');
  assert.equal(hasil.perluManusia, false, 'had jam ialah tunggu sementara, BUKAN sekatan kekal — pemulihan mesti diteruskan');
  assert.equal(hasil.kelas, 'transient');
  assert.equal(hasil.cubaSemula.jenis, 'tetingkap-jam');
  assert.equal(typeof hasil.cubaSemula.selepasMs, 'number');
});

test('pengurus + hadKadar: siling HARIAN disekat -> had-harian, perluManusia:false, cubaSemula.hari-baharu, bilHariIni TIDAK dilupakan', async () => {
  const storan = storanKadarPalsu();
  const hadKadar = buatHadKadarLogin({ baca: storan.baca, tulis: storan.tulis, sekarangMs: () => Date.now() });
  for (let pusingan = 0; pusingan < 24; pusingan++) { hadKadar.catatPercubaan(); hadKadar.catatKejayaan(); }
  assert.equal(hadKadar.bolehCuba(), false, 'pra-syarat: siling harian mesti penuh');

  let panggil = 0;
  const pengurus = buatPengurusLoginAuto({
    adaKredensial: () => true,
    jalankan: async () => { panggil++; return { status: 'sesi-sah', sesiSah: true }; },
    jedaMs: 0,
    hadKadar
  });
  const hasil = await pengurus.cubaAuto();
  assert.equal(panggil, 0);
  assert.equal(hasil.status, 'had-harian');
  assert.equal(hasil.perluManusia, false, 'siling harian ialah tunggu sementara, BUKAN sekatan kekal');
  assert.equal(hasil.kelas, 'transient');
  assert.equal(hasil.cubaSemula.jenis, 'hari-baharu');
  assert.match(hasil.cubaSemula.hariIso, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(hadKadar.statusRingkas().bilHariIni, 24, 'siling harian tidak boleh dilupakan/dikosongkan oleh laluan sekatan');
});

test('pengurus + hadKadar: 3-strike kegagalan berturut-turut KEKAL had-kegagalan-berturut, perluManusia:true (sekatan kekal, bukan retry-after)', async () => {
  const storan = storanKadarPalsu();
  const hadKadar = buatHadKadarLogin({ baca: storan.baca, tulis: storan.tulis, sekarangMs: () => Date.now() });
  hadKadar.catatPercubaan(); hadKadar.catatKegagalan();
  hadKadar.catatPercubaan(); hadKadar.catatKegagalan();
  hadKadar.catatPercubaan(); hadKadar.catatKegagalan();
  const pengurus = buatPengurusLoginAuto({
    adaKredensial: () => true,
    jalankan: async () => ({ status: 'sesi-sah', sesiSah: true }),
    jedaMs: 0,
    hadKadar
  });
  const hasil = await pengurus.cubaAuto();
  assert.equal(hasil.status, 'had-kegagalan-berturut');
  assert.equal(hasil.perluManusia, true, '3-strike ialah sekatan keselamatan kekal — mesti berhenti untuk manusia');
  assert.equal(hasil.kelas, 'perlu-manusia');
  assert.equal(hasil.cubaSemula, undefined, 'sekatan kekal tidak membawa isyarat cubaSemula');
});

test('pengurus + hadKadar: keadaan ROSAK disekat sebagai had-kadar perluManusia:true (gagal tertutup kekal)', async () => {
  const hadKadar = buatHadKadarLogin({ baca: () => { throw new Error('rosak'); }, tulis: () => {}, sekarangMs: () => Date.now() });
  const pengurus = buatPengurusLoginAuto({
    adaKredensial: () => true,
    jalankan: async () => ({ status: 'sesi-sah', sesiSah: true }),
    jedaMs: 0,
    hadKadar
  });
  const hasil = await pengurus.cubaAuto();
  assert.equal(hasil.status, 'had-kadar');
  assert.equal(hasil.perluManusia, true, 'fail rosak mesti kekal gagal tertutup — bukan retry-after');
});

// ---------------- v1.11.22 Gap 4: probe sesi langsung mendahului gerbang had kadar ----------------

test('pengurus + hadKadar: sesiSah() probe {ada:true} memintas gerbang had kadar walaupun disekat 3-strike, TIADA belanjawan digunakan', async () => {
  const storan = storanKadarPalsu();
  const hadKadar = buatHadKadarLogin({ baca: storan.baca, tulis: storan.tulis, sekarangMs: () => Date.now() });
  hadKadar.catatPercubaan(); hadKadar.catatKegagalan();
  hadKadar.catatPercubaan(); hadKadar.catatKegagalan();
  hadKadar.catatPercubaan(); hadKadar.catatKegagalan();
  assert.equal(hadKadar.bolehCuba(), false, 'pra-syarat: disekat 3-strike');
  const bilPercubaanSebelum = hadKadar.bilPercubaan();

  let panggilJalankan = 0;
  const pengurus = buatPengurusLoginAuto({
    adaKredensial: () => true,
    jalankan: async () => { panggilJalankan++; return { status: 'sesi-sah', sesiSah: true }; },
    jedaMs: 0,
    hadKadar,
    sesiSah: async () => ({ ada: true })
  });
  const hasil = await pengurus.cubaAuto();
  assert.equal(hasil.status, 'sesi-sah');
  assert.equal(hasil.perluManusia, false);
  assert.equal(panggilJalankan, 0, 'jalankan (log masuk kredensial) tidak boleh dipanggil apabila probe sesi mengesahkan sesi sudah sah');
  assert.equal(hadKadar.bilPercubaan(), bilPercubaanSebelum, 'probe TIDAK boleh menggunakan belanjawan (catatPercubaan)');
});

test('pengurus + hadKadar: sesiSah() probe {ada:false} -> gerbang had kadar dinilai seperti biasa', async () => {
  const storan = storanKadarPalsu();
  const hadKadar = buatHadKadarLogin({ baca: storan.baca, tulis: storan.tulis, sekarangMs: () => Date.now() });
  let panggilJalankan = 0;
  const pengurus = buatPengurusLoginAuto({
    adaKredensial: () => true,
    jalankan: async () => { panggilJalankan++; return { status: 'sesi-sah', sesiSah: true }; },
    jedaMs: 0,
    hadKadar,
    sesiSah: async () => ({ ada: false })
  });
  const hasil = await pengurus.cubaAuto();
  assert.equal(panggilJalankan, 1, 'sesi tidak sah -> log masuk sebenar mesti dicuba seperti biasa');
  assert.equal(hasil.status, 'sesi-sah');
});

test('pengurus TANPA hadKadar: sesiSah disuntik tetapi diabaikan (probe hanya bermakna apabila hadKadar hadir)', async () => {
  let panggilSesiSah = 0;
  let panggilJalankan = 0;
  const pengurus = buatPengurusLoginAuto({
    adaKredensial: () => true,
    jalankan: async () => { panggilJalankan++; return { status: 'sesi-sah', sesiSah: true }; },
    jedaMs: 0,
    sesiSah: async () => { panggilSesiSah++; return { ada: true }; }
  });
  await pengurus.cubaAuto();
  assert.equal(panggilSesiSah, 0, 'tanpa hadKadar, probe sesiSah tidak dirujuk (had asal 2 cubaan/proses kekal tidak berubah)');
  assert.equal(panggilJalankan, 1);
});

// ---------------- v1.11.22 Gap 5: pemulihan tetapkanSemulaLatch (pemilik tempatan) ----------------

test('WIRING: selepas hadKadar.tetapkanSemulaLatch(), pengurus.cubaAuto() meneruskan aliran normal bersempadan (tiada belanjawan tambahan)', async () => {
  const storan = storanKadarPalsu();
  const hadKadar = buatHadKadarLogin({ baca: storan.baca, tulis: storan.tulis, sekarangMs: () => Date.now() });
  hadKadar.catatPercubaan(); hadKadar.catatKegagalan();
  hadKadar.catatPercubaan(); hadKadar.catatKegagalan();
  hadKadar.catatPercubaan(); hadKadar.catatKegagalan();
  assert.equal(hadKadar.bolehCuba(), false, 'pra-syarat: latch 3-strike aktif');

  hadKadar.tetapkanSemulaLatch();
  assert.equal(hadKadar.bolehCuba(), true, 'latch mesti dikosongkan oleh tindakan pemilik eksplisit');

  let panggil = 0;
  const pengurus = buatPengurusLoginAuto({
    adaKredensial: () => true,
    jalankan: async () => { panggil++; return { status: 'sesi-sah', sesiSah: true }; },
    jedaMs: 0,
    hadKadar
  });
  const hasil = await pengurus.cubaAuto();
  assert.equal(panggil, 1, 'aliran normal diteruskan selepas tetapan semula latch');
  assert.equal(hasil.status, 'sesi-sah');
  // Tiada belanjawan TAMBAHAN diberikan — bilHariIni sedia ada (3, daripada 3
  // catatPercubaan sebelum latch) dikekalkan dan bertambah SATU sahaja untuk
  // cubaan baharu ini (4) — tetapkanSemulaLatch bukan reset penuh siling harian.
  assert.equal(hadKadar.statusRingkas().bilHariIni, 4, 'siling harian sedia ada (3) + satu cubaan baharu = 4, BUKAN direset ke 0/1');
});

// ---------------- v1.11.23: probe-sesi.mjs (cache-less) berwayar hujung-ke-hujung dengan pengurus ----------------
// Menggantikan wiring cache-dahulu lama (sesiSahProbeLangsung, v1.11.22 Gap 4)
// yang tersilap mempercayai cache STALE selepas tugasan mendedahkan
// sesi-tamat. Ujian ini menyambungkan buatProbeSesiLangsung SEBENAR (bukan
// double `sesiSah` generik seperti ujian di atas) kepada buatPengurusLoginAuto
// + buatHadKadarLogin SEBENAR untuk mengesahkan kontrak belanjawan.

test('v1.11.23: sesi LIVE sah -> {ada:true}, log masuk sebenar TIDAK dipanggil, SIFAR belanjawan digunakan', async () => {
  const storan = storanKadarPalsu();
  const hadKadar = buatHadKadarLogin({ baca: storan.baca, tulis: storan.tulis, sekarangMs: () => Date.now() });
  const bilPercubaanSebelum = hadKadar.bilPercubaan();
  let panggilProbeLangsung = 0;
  let panggilJalankan = 0;
  const probeSesiLangsung = buatProbeSesiLangsung({
    probeLangsung: async () => { panggilProbeLangsung++; return { status: 'sesi-sah' }; }
  });
  const pengurus = buatPengurusLoginAuto({
    adaKredensial: () => true,
    jalankan: async () => { panggilJalankan++; return { status: 'sesi-sah', sesiSah: true }; },
    jedaMs: 0,
    hadKadar,
    sesiSah: probeSesiLangsung
  });
  const hasil = await pengurus.cubaAuto();
  assert.equal(panggilProbeLangsung, 1, 'probe langsung mesti benar-benar dijalankan');
  assert.equal(panggilJalankan, 0, 'sesi sudah sah -> log masuk kredensial sebenar tidak boleh dipanggil');
  assert.equal(hasil.status, 'sesi-sah');
  assert.equal(hasil.perluManusia, false);
  assert.equal(hadKadar.bilPercubaan(), bilPercubaanSebelum, 'SIFAR belanjawan digunakan apabila probe langsung mengesahkan sesi sudah sah');
});

test('v1.11.23: probe langsung profil-sibuk/ralat (unknown/busy) -> tangguh, SIFAR belanjawan, log masuk sebenar TIDAK dipanggil', async () => {
  const storan = storanKadarPalsu();
  const hadKadar = buatHadKadarLogin({ baca: storan.baca, tulis: storan.tulis, sekarangMs: () => Date.now() });
  const bilPercubaanSebelum = hadKadar.bilPercubaan();
  let panggilJalankan = 0;
  const probeSesiLangsung = buatProbeSesiLangsung({
    probeLangsung: async () => { const e = new Error('Profil Edge sedang digunakan.'); e.langkau = true; throw e; }
  });
  const pengurus = buatPengurusLoginAuto({
    adaKredensial: () => true,
    jalankan: async () => { panggilJalankan++; return { status: 'sesi-sah', sesiSah: true }; },
    jedaMs: 0,
    hadKadar,
    sesiSah: probeSesiLangsung
  });
  const hasil = await pengurus.cubaAuto();
  assert.equal(panggilJalankan, 0, 'profil sibuk/tidak diketahui -> log masuk kredensial sebenar TIDAK PERNAH dicuba pada kitaran ini');
  assert.equal(hasil.status, 'langkau');
  assert.equal(hasil.kelas, 'transient');
  assert.equal(hasil.perluManusia, false, 'tangguhan bukan strike, bukan berhenti-untuk-manusia');
  assert.equal(hadKadar.bilPercubaan(), bilPercubaanSebelum, 'SIFAR belanjawan digunakan semasa tangguh (catatPercubaan tidak boleh dipanggil)');
});

test('v1.11.23: stale-positive dielakkan — cache luar mendakwa sesi-sah tetapi probe LANGSUNG (live) melapor sesi-tamat -> gerbang had kadar dinilai SEBENAR (belanjawan digunakan, log masuk sebenar dicuba)', async () => {
  const storan = storanKadarPalsu();
  const hadKadar = buatHadKadarLogin({ baca: storan.baca, tulis: storan.tulis, sekarangMs: () => Date.now() });
  const bilHariIniSebelum = hadKadar.statusRingkas().bilHariIni;
  // Cache luar (mis. status-sesi.json v1.11.22 lama) mendakwa sesi sah — probe
  // BAHARU tidak menerima/merujuk cache ini langsung sama sekali (tiada
  // parameter cache dalam buatProbeSesiLangsung); satu-satunya kebenaran ialah
  // probeLangsung (siasatan LIVE).
  const cacheLuarStalePositif = { sesiAda: true };
  let panggilJalankan = 0;
  const probeSesiLangsung = buatProbeSesiLangsung({
    probeLangsung: async () => {
      // Siasatan LIVE sebenar mendedahkan sesi SUDAH tamat walaupun cache luar
      // (tidak disuntik/tidak dirujuk di sini) masih mendakwa sesi-sah.
      assert.equal(cacheLuarStalePositif.sesiAda, true, 'cache luar kekal stale-positive sepanjang ujian ini — bukti ia tidak pernah "diperbetulkan" oleh probe');
      return { status: 'sesi-tamat', sebab: 'Borang log masuk masih ada.' };
    }
  });
  const pengurus = buatPengurusLoginAuto({
    adaKredensial: () => true,
    jalankan: async () => { panggilJalankan++; return { status: 'sesi-sah', sesiSah: true }; },
    jedaMs: 0,
    hadKadar,
    sesiSah: probeSesiLangsung
  });
  const hasil = await pengurus.cubaAuto();
  assert.equal(panggilJalankan, 1, 'sesi sebenarnya tamat -> log masuk kredensial sebenar MESTI dicuba (bukan disekat oleh cache stale)');
  assert.equal(hasil.status, 'sesi-sah');
  // bilPercubaan() (tetingkap SEJAM) kembali 0 selepas kejayaan kerana
  // catatKejayaan() mengosongkan tetingkap sejam — bukti belanjawan
  // sebenarnya DIGUNAKAN ialah siling HARIAN (bilHariIni), yang TIDAK
  // dikosongkan oleh kejayaan (lihat ujian WIRING tetapkanSemulaLatch di atas).
  assert.equal(hadKadar.statusRingkas().bilHariIni, bilHariIniSebelum + 1, 'sesi tamat SEBENAR memang layak membelanjakan SATU cubaan belanjawan (siling harian bertambah)');
});
