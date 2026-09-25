// Ujian status kad "Semak Kehadiran": Belum diisi / Tidak lengkap /
// Telah diisi / Selesai MOEIS. Data sintetik sahaja — tiada nama sebenar.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
function baca(n) { return fs.readFileSync(path.join(root, n), 'utf8').replace(/\r\n/g, '\n'); }
function sah(syarat, mesej) { if (!syarat) throw new Error(mesej); }

const app = baca('app.js');
const css = baca('styles.css');

function fungsiApp(nama) {
  const padan = app.match(new RegExp(`function ${nama}\\([^]*?(?=\\n  function |\\n  var )`));
  sah(padan, `Fungsi ${nama} tidak boleh diuji`);
  return padan[0];
}
const blokSebab = app.match(/var MOEIS_SEBAB = \{[\s\S]*?\n  \};/);
sah(blokSebab, 'Senarai MOEIS_SEBAB tidak ditemui');

const konteks = {};
vm.runInNewContext([
  blokSebab[0], fungsiApp('teks'), fungsiApp('sebabMoeisSah_'), fungsiApp('statusKadSemakan_')
].join('\n'), konteks);
const statusKad = konteks.statusKadSemakan_;

const HARI_INI = '2026-09-24';
const SEBAB_SAH = { kategori: 'D', sebab: 'DEMAM' };
sah(konteks.sebabMoeisSah_(SEBAB_SAH.kategori, SEBAB_SAH.sebab), 'Fixture sebab mesti sah dalam MOEIS_SEBAB');

function murid(nilai, sebab) {
  return Object.assign({ kunci: 'k' + Math.random(), nama: 'MURID UJIAN', nilai: nilai, kategori: '', sebab: '' }, sebab || {});
}
function kelas(senarai) {
  return { nama: 'KELAS UJIAN', murid: senarai, sudahSimpan: senarai.some(m => m.nilai === 0 || m.nilai === 1) };
}
function semak(k, moeis, tarikhIso) {
  return statusKad(k, tarikhIso || HARI_INI, HARI_INI, moeis || []);
}

// 1) Belum diisi — merah.
let s = semak(kelas([murid(''), murid('')]));
sah(s.kod === 'belum' && s.label === 'Belum diisi', 'Kelas tanpa rekod hari ini mesti "Belum diisi"');
s = semak(kelas([]));
sah(s.kod === 'belum', 'Kelas tanpa murid/rekod mesti "Belum diisi"');

// 2) Tidak lengkap — kuning: tidak hadir tanpa sebab sah.
s = semak(kelas([murid(1), murid(0)]));
sah(s.kod === 'tidak-lengkap' && s.label === 'Tidak lengkap', 'Tidak hadir tanpa sebab mesti "Tidak lengkap"');
sah(s.tanpaSebab === 1, 'Bilangan murid tidak hadir tanpa sebab mesti dilapor');
s = semak(kelas([murid(1), murid(0, { kategori: 'D', sebab: 'BUKAN SEBAB MOEIS' })]));
sah(s.kod === 'tidak-lengkap', 'Sebab yang tiada dalam senarai MOEIS mesti dianggap tiada sebab');
s = semak(kelas([murid(1), murid(0, { kategori: 'D', sebab: '' })]));
sah(s.kod === 'tidak-lengkap', 'Kategori tanpa sebab mesti "Tidak lengkap"');
// Sebahagian murid belum bernilai 0/1 (cth. murid baharu selepas simpanan).
s = semak(kelas([murid(1), murid('')]));
sah(s.kod === 'tidak-lengkap' && s.belumDitanda === 1, 'Kelas separa disimpan mesti "Tidak lengkap"');

// 3) Telah diisi.
s = semak(kelas([murid(1), murid(1)]));
sah(s.kod === 'diisi' && s.label === 'Telah diisi', 'Semua hadir dan disimpan mesti "Telah diisi"');
s = semak(kelas([murid(1), murid(0, SEBAB_SAH)]));
sah(s.kod === 'diisi', 'Tidak hadir dengan sebab sah mesti "Telah diisi"');

// 4) Selesai MOEIS — hanya bukti status `berjaya`.
const lengkap = kelas([murid(1), murid(0, SEBAB_SAH)]);
function moeis(status, bil) {
  return [{ nama: 'KELAS UJIAN', statusPenghantaran: status, bilTidakHadir: bil == null ? 1 : bil, kehadiranDisimpan: true, belumLengkap: [] }];
}
s = semak(lengkap, moeis('berjaya'));
sah(s.kod === 'moeis' && s.label === 'Selesai MOEIS', 'Status berjaya mesti "Selesai MOEIS"');
const lengkapTanpaSesiAdmin = Object.assign({}, lengkap, { moeisSelesai: true });
sah(statusKad(lengkapTanpaSesiAdmin, HARI_INI, HARI_INI, []).kod === 'moeis',
  'Status MOEIS yang disahkan pelayan mesti dipaparkan tanpa log masuk admin');
const buktiAdminLama = [{ nama: 'KELAS UJIAN', statusPenghantaran: 'berjaya', bilTidakHadir: 1 }];
sah(statusKad(Object.assign({}, lengkap, { moeisSelesai: false }), HARI_INI, HARI_INI, buktiAdminLama).kod === 'diisi',
  'Bukti awam false mesti mengatasi status admin berjaya yang sudah lapuk');
['tersimpan', 'menunggu', 'sedang_dihantar', 'gagal', 'belum_dihantar', ''].forEach(function (st) {
  sah(semak(lengkap, moeis(st)).kod === 'diisi', `Status "${st}" tidak boleh dianggap Selesai MOEIS`);
});
sah(semak(lengkap, [{ nama: 'KELAS LAIN', statusPenghantaran: 'berjaya', bilTidakHadir: 1 }]).kod === 'diisi',
  'Bukti MOEIS kelas lain tidak boleh digunakan');
sah(semak(lengkap, moeis('berjaya', 3)).kod === 'diisi',
  'Bukti MOEIS lapuk (bilangan tidak hadir berbeza) tidak boleh dianggap selesai');
sah(semak(kelas([murid(1), murid(0)]), moeis('berjaya')).kod === 'tidak-lengkap',
  'Sebab tidak lengkap mesti mengatasi status berjaya lama');
sah(semak(kelas([murid(''), murid('')]), moeis('berjaya', 0)).kod === 'belum',
  'Kehadiran belum disimpan tidak boleh menjadi Selesai MOEIS');

// Tarikh lain daripada hari ini (Malaysia): tiada data sebab, jangan dakwa lengkap/MOEIS.
s = semak(kelas([murid(1), murid(0)]), moeis('berjaya'), '2026-09-23');
sah(s.kod === 'disimpan' && s.label === 'Disimpan', 'Tarikh lama yang disimpan mesti neutral "Disimpan"');
sah(semak(kelas([murid('')]), [], '2026-09-23').kod === 'belum', 'Tarikh lama tanpa rekod mesti "Belum diisi"');
// semakKehadiran tarikh lama hanya menghantar murid tidak hadir; kelas semua hadir => murid [].
sah(semak({ nama: 'KELAS UJIAN', murid: [], sudahSimpan: true, hadir: 20 }, [], '2026-09-23').kod === 'disimpan',
  'Tarikh lama semua hadir (murid kosong, sudahSimpan) mesti "Disimpan", bukan "Belum diisi"');
// Data hari semalam yang masih terbuka selepas tengah malam bukan hari ini.
sah(statusKad(lengkap, '2026-09-24', '2026-09-25', moeis('berjaya')).kod === 'disimpan',
  'Data bertarikh semalam tidak boleh dinilai sebagai hari ini');

// Pendawaian kad dan gaya: warna + teks.
const badanSemakan = fungsiApp('lukisSemakan');
sah(badanSemakan.includes('statusKadSemakan_('), 'Kad Semak Kehadiran mesti menggunakan statusKadSemakan_');
sah(badanSemakan.includes('tarikhMalaysiaHariIni_()'), 'Kad mesti menilai berbanding tarikh Malaysia hari ini');
sah(!/'Selesai' : 'Belum disimpan'/.test(badanSemakan), 'Label lama Selesai/Belum disimpan masih digunakan pada kad');
sah(badanSemakan.includes("'review-state st-' + statusKad.kod"), 'Label status mesti membawa kelas warna mengikut kod');
sah(/aria-label[^\n]*statusKad\.label/.test(badanSemakan), 'Label aksesibiliti kad mesti menyebut status');
sah(/\.review-state\.st-belum\s*\{[^}]*color:\s*#b82f42/i.test(css), 'Belum diisi mesti merah');
sah(/\.review-state\.st-tidak-lengkap\s*\{[^}]*color:\s*#7a5400/i.test(css), 'Tidak lengkap mesti kuning');
sah(/\.review-state\.st-moeis\s*\{/.test(css), 'Selesai MOEIS mesti mempunyai gaya sendiri');

// Keputusan pemilik: "Telah diisi" dan "Selesai MOEIS" kedua-duanya hijau.
function peraturan(pemilih) {
  const padan = css.match(new RegExp(pemilih.replace(/[.]/g, '\\.') + '\\s*\\{([^}]*)\\}'));
  sah(padan, `Peraturan CSS ${pemilih} tiada`);
  return padan[1];
}
function nilaiHex(badan, sifat) {
  const padan = badan.match(new RegExp('(?:^|;)\\s*' + sifat + ':\\s*(#[0-9a-f]{3,6})', 'i'));
  sah(padan, `Sifat ${sifat} mesti warna hex`);
  let h = padan[1].slice(1);
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}
function hijau(rgb) {
  const [r, g, b] = rgb;
  const maks = Math.max(r, g, b), min = Math.min(r, g, b), d = maks - min;
  if (maks !== g || d < 12) return false; // mesti hijau dominan, bukan kelabu
  const hue = 60 * ((b - r) / d) + 120;
  return hue >= 90 && hue <= 170;
}
const diisi = peraturan('.review-state.st-diisi');
const selesaiMoeis = peraturan('.review-state.st-moeis');
sah(hijau(nilaiHex(diisi, 'color')) && hijau(nilaiHex(diisi, 'background')), 'Telah diisi mesti hijau');
sah(hijau(nilaiHex(selesaiMoeis, 'background')), 'Selesai MOEIS mesti hijau (latar), bukan biru');
sah(!hijau(nilaiHex(peraturan('.review-state.st-belum'), 'color')) &&
    !hijau(nilaiHex(peraturan('.review-state.st-tidak-lengkap'), 'color')),
  'Belum diisi/Tidak lengkap tidak boleh hijau');
sah(hijau(nilaiHex(peraturan('.review-card.kad-moeis'), 'border-color')), 'Bingkai kad Selesai MOEIS mesti hijau');
const simpan = fungsiApp('simpanKehadiran');
sah(/state\.moeisKelas = state\.moeisKelas\.filter/.test(simpan),
  'Simpanan kehadiran mesti membuang bukti MOEIS lama bagi kelas itu');

// Aliran: membuka Semak Kehadiran dalam mod admin memuatkan bukti MOEIS tanpa
// perlu membuka menu Hantar ke MOEIS dahulu.
function binaAliranMoeis(pilihan) {
  const panggilan = [];
  let lukis = 0;
  const penyelesai = [];
  const k = {
    state: Object.assign({ peranan: 'guru', token: '', paneAktif: 'reviewPane', moeisKelas: [],
      reviewData: { tarikhIso: HARI_INI, kelas: [Object.assign({}, lengkap)] },
      versiSemakan: 0, versiMoeisSemakan: 0, moeisSemakanSedang: false,
      moeisSemakanAktif: null, moeisSemakanMuatSemula: false }, pilihan || {}),
    tarikhMalaysiaHariIni_: () => HARI_INI,
    lukisSemakan: () => { lukis++; },
    panggil: (kaedah, argumen) => {
      panggilan.push({ kaedah, argumen });
      return new Promise((selesai, gagal) => penyelesai.push({ selesai, gagal }));
    }
  };
  vm.runInNewContext(fungsiApp('muatBuktiMoeisSemakan_'), k);
  return { k, panggilan, penyelesai, lukis: () => lukis };
}
const tunggu = () => new Promise(r => setImmediate(r));

(async function () {
  // Guru tanpa sesi admin: satu ringkasan awam, tiada panggilan admin pendua.
  let a = binaAliranMoeis();
  a.k.muatBuktiMoeisSemakan_();
  a.k.muatBuktiMoeisSemakan_();
  sah(a.panggilan.length === 1 && a.panggilan[0].kaedah === 'semakKehadiran' &&
      a.panggilan[0].argumen[0] === HARI_INI, 'Status MOEIS mesti dimuat melalui API awam tanpa token admin');
  a.penyelesai[0].selesai({ kelas: [{ nama: 'KELAS UJIAN', moeisSelesai: true }] });
  await tunggu();
  sah(a.lukis() === 1, 'Kad Semak mesti dilukis semula selepas bukti awam diterima');
  sah(semak(a.k.state.reviewData.kelas[0], []).kod === 'moeis', 'Selesai MOEIS mesti dipaparkan tanpa log masuk admin');
  a.k.muatBuktiMoeisSemakan_();
  sah(a.panggilan.length === 2, 'Buka semula Semak boleh menyegar bukti MOEIS');

  // Status bukan berjaya kekal "Telah diisi" walaupun pengguna awam.
  a = binaAliranMoeis();
  a.k.muatBuktiMoeisSemakan_();
  a.penyelesai[0].selesai({ kelas: [{ nama: 'KELAS UJIAN', moeisSelesai: false }] });
  await tunggu();
  sah(semak(a.k.state.reviewData.kelas[0], []).kod === 'diisi', 'Bukti false tidak boleh dianggap selesai MOEIS');

  // Tarikh selain hari ini: tiada panggilan.
  a = binaAliranMoeis({ reviewData: { tarikhIso: '2026-09-23', kelas: [Object.assign({}, lengkap)] } });
  a.k.muatBuktiMoeisSemakan_();
  sah(a.panggilan.length === 0, 'Semakan tarikh lama tidak memuatkan bukti MOEIS');

  // Pane bertukar sebelum respons: simpan data, jangan lukis.
  a = binaAliranMoeis();
  a.k.muatBuktiMoeisSemakan_();
  a.k.state.paneAktif = 'attendancePane';
  a.penyelesai[0].selesai({ kelas: [{ nama: 'KELAS UJIAN', moeisSelesai: true }] });
  await tunggu();
  sah(a.lukis() === 0 && a.k.state.reviewData.kelas[0].moeisSelesai !== true,
    'Respons lapuk tidak boleh mengemas kini kad selepas pane bertukar');

  // Keluar dan masuk semula ketika permintaan lama masih berjalan mesti
  // menjadualkan muatan baharu selepas respons lapuk selesai.
  a = binaAliranMoeis();
  a.k.muatBuktiMoeisSemakan_();
  a.k.state.paneAktif = 'attendancePane';
  a.k.state.paneAktif = 'reviewPane';
  a.k.state.versiSemakan++;
  a.k.muatBuktiMoeisSemakan_();
  a.penyelesai[0].selesai({ kelas: [{ nama: 'KELAS UJIAN', moeisSelesai: false }] });
  await tunggu();
  sah(a.panggilan.length === 2, 'Masuk semula ke Semak mesti mengulang permintaan bukti lapuk');
  a.penyelesai[1].selesai({ kelas: [{ nama: 'KELAS UJIAN', moeisSelesai: true }] });
  await tunggu();
  sah(a.lukis() === 1 && semak(a.k.state.reviewData.kelas[0], []).kod === 'moeis',
    'Bukti daripada permintaan baharu mesti menyegarkan kad selepas masuk semula');

  // Jika pengguna keluar semula sebelum respons lama tamat, jangan buat
  // permintaan susulan di pane tersembunyi; buka semula kemudian mesti memuat.
  a = binaAliranMoeis();
  a.k.muatBuktiMoeisSemakan_();
  a.k.state.paneAktif = 'attendancePane';
  a.k.state.paneAktif = 'reviewPane';
  a.k.state.versiSemakan++;
  a.k.muatBuktiMoeisSemakan_();
  a.k.state.paneAktif = 'attendancePane';
  a.penyelesai[0].selesai({ kelas: [{ nama: 'KELAS UJIAN', moeisSelesai: false }] });
  await tunggu();
  sah(a.panggilan.length === 1, 'Jangan muat semula MOEIS ketika pane Semak sudah tersembunyi');
  a.k.state.paneAktif = 'reviewPane';
  a.k.state.versiSemakan++;
  a.k.muatBuktiMoeisSemakan_();
  sah(a.panggilan.length === 2, 'Buka semula Semak kemudian mesti mendapatkan permintaan baharu');
  a.penyelesai[1].selesai({ kelas: [{ nama: 'KELAS UJIAN', moeisSelesai: true }] });
  await tunggu();
  sah(semak(a.k.state.reviewData.kelas[0], []).kod === 'moeis', 'Permintaan selepas buka semula memaparkan status terkini');

  // Tarikh/data bertukar: respons lama mesti diabaikan.
  a = binaAliranMoeis();
  a.k.muatBuktiMoeisSemakan_();
  a.k.state.reviewData = { tarikhIso: '2026-09-24', kelas: [Object.assign({}, lengkap)] };
  a.penyelesai[0].selesai({ kelas: [{ nama: 'KELAS UJIAN', moeisSelesai: true }] });
  await tunggu();
  sah(a.lukis() === 0 && a.k.state.reviewData.kelas[0].moeisSelesai !== true,
    'Respons daripada tarikh sebelumnya mesti diabaikan');

  // Simpanan kehadiran semasa permintaan: respons lama tidak boleh memulihkan bukti berjaya.
  a = binaAliranMoeis();
  a.k.muatBuktiMoeisSemakan_();
  a.k.state.versiMoeisSemakan++;
  a.penyelesai[0].selesai(moeis('berjaya'));
  await tunggu();
  sah(a.k.state.moeisKelas.length === 0, 'Respons MOEIS yang bermula sebelum simpanan mesti diabaikan');

  // Ralat: tiada lukis, boleh cuba semula.
  a = binaAliranMoeis();
  a.k.muatBuktiMoeisSemakan_();
  a.penyelesai[0].gagal(new Error('rangkaian'));
  await tunggu();
  a.k.muatBuktiMoeisSemakan_();
  sah(a.lukis() === 0 && a.panggilan.length === 2, 'Kegagalan tidak melukis dan tidak menyekat cubaan seterusnya');

  // Pendawaian.
  const reviewPane = app.match(/if \(id === 'reviewPane'\) \{[\s\S]*?\n    \}/);
  sah(reviewPane && reviewPane[0].includes('muatBuktiMoeisSemakan_()'),
    'Membuka Semak Kehadiran mesti memuatkan bukti MOEIS admin');
  sah(!fungsiApp('lukisSemakan').includes('muatBuktiMoeisSemakan_'), 'lukisSemakan tidak boleh memanggil muatan (elak gelung)');
  sah(fungsiApp('simpanKehadiran').includes('state.versiMoeisSemakan++'),
    'Simpanan kehadiran mesti membatalkan respons bukti MOEIS yang sedang dalam penerbangan');

  console.log('Ujian kad Semak Kehadiran lulus.');
})().catch(e => { console.error(e); process.exitCode = 1; });
