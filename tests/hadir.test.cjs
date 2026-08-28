const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
function baca(n) { return fs.readFileSync(path.join(root, n), 'utf8'); }
function sah(syarat, mesej) { if (!syarat) throw new Error(mesej); }

new Function(baca('app.js'));
new Function(baca('service-worker.js'));
new Function(baca('apps-script/HadirWeb.gs'));

const manifest = JSON.parse(baca('manifest.webmanifest'));
sah(manifest.short_name === 'HADIR', 'short_name manifest salah');
sah(manifest.display === 'standalone', 'PWA mesti standalone');
sah(manifest.icons.some(x => x.purpose === 'maskable'), 'ikon maskable tiada');

const sw = baca('service-worker.js');
sah(sw.includes("url.origin !== self.location.origin"), 'Service Worker mesti menghadkan asal');
sah(!/script\.google|googleusercontent|macros\/s\//.test(sw), 'URL API tidak boleh berada dalam cache PWA');
sah((sw.match(/'\.\//g) || []).length >= 10, 'Senarai aset PWA terlalu pendek');

const backend = baca('apps-script/HadirWeb.gs');
sah(backend.includes('hadirAdakahPermintaan_'), 'Penghala HADIR tiada');
sah(backend.includes('CacheService.getScriptCache()') && backend.includes('HADIR_CACHE_INIT_SAAT = 60'), 'Cache pelayan init pantas tiada');
sah(backend.includes('hadirPadamCacheInit_();'), 'Cache init tidak dibuang selepas perubahan data');
const fungsiInit = backend.match(/function hadirInit_\(token\) \{([\s\S]*?)\n\}/);
sah(fungsiInit && !fungsiInit[1].includes('sediakanLajurSahaja()'), 'Bacaan init tidak boleh menyediakan lajur atau menjalankan kerja tulis');
sah(backend.includes('simpanSenaraiMuridUpload'), 'Sumber rasmi main tidak digunakan');
sah(backend.includes("'importMurid'"), 'Penyelaras AKSI tiada');
sah(backend.includes("'apiUploadMurid'"), 'Penyelaras SEMAK tiada');
sah(!backend.includes("token: 'SISTEM_HADIR'"), 'AKSI tidak boleh menerima token sampul palsu');
sah(backend.includes("hadirAksiRpc_(url, 'importMurid', [csv, masuk.token, 'HADIR'], masuk.token)"), 'Token sesi dan penanda asal AKSI mesti dihantar pada import');
sah(backend.includes('uploadMuridCsv: hadirUploadMuridCsv_'), 'API upload CSV murid tiada');
sah(backend.includes('semakKehadiran: hadirSemakKehadiran_'), 'API semakan tarikh terdahulu tiada');
sah(backend.includes('bukaKehadiranTarikh: hadirBukaKehadiranTarikh_'), 'API buka pengisian tarikh lama tiada');
sah(backend.includes('function hadirSahkanTarikhIso_'), 'Pengesahan tarikh bersama tiada');
sah(backend.includes('function hadirSimpanKehadiran_(kelas, senaraiTiada, token, tarikhIso)'), 'Simpanan tarikh dipilih tiada');
sah(backend.includes('muridTiadaPadaTarikh_(ic, tkh, intervalArkib, icMain)'), 'Simpanan tarikh lama tidak menghormati tempoh murid aktif');
sah(backend.includes("kunci: hadirKunciMurid_(ic, pilihan.tkh)"), 'Kunci murid tarikh lama mesti legap dan khusus tarikh');
sah(backend.includes("throw new Error('Semakan hanya tersedia bagi tahun semasa.')"), 'Semakan tarikh mesti dihadkan kepada tahun semasa');
sah(backend.includes('muridTiadaPadaTarikh_(ic, tkh, intervalArkib, icMain)'), 'Semakan sejarah mesti menghormati tempoh murid aktif');
sah(backend.includes('function hadirPetaRmt_()'), 'Sumber status RMT tiada');
sah(backend.includes('simpanTetapanMurid: hadirSimpanTetapanMurid_'), 'API Tetapan Murid tiada');
sah(backend.includes("'JAWATAN MURID'"), 'Simpanan jawatan murid tiada');
sah(backend.includes('senaraiGuru: hadirSenaraiGuru_') && backend.includes('uploadGuruCsv: hadirUploadGuruCsv_'), 'API Tetapan Guru tiada');
sah(backend.includes("getSheetByName('HADIR_GURU')") && backend.includes("['NAMA GURU', 'JAWATAN', 'DIKEMAS KINI']"), 'Sumber guru HADIR tiada');
sah(backend.includes("hadirAksiRpc_(url, 'importGuru'") && backend.includes("hadirSemakRpc_(url, 'apiImportGuru'"), 'Penyelarasan guru AKSI/SEMAK tiada');
sah(backend.includes("hadirAksiRpc_(url, 'pastikanAkaunGuru'"), 'Akaun guru AKSI tidak dipastikan selepas import');
sah(backend.includes('function hadirTarikGuruSediaAda_()') && backend.includes("hadirAksiRpc_(urlAksi, 'getSenaraiGuru', [tokenAksi], tokenAksi)") &&
  backend.includes("hadirSemakRpc_(urlSemak, 'apiInit', [])"),
  'Migrasi awal guru mesti menggabungkan AKSI dan SEMAK menggunakan API rasmi');
sah(backend.includes("if (!guru.length) {\n    migrasi = hadirTarikGuruSediaAda_();"),
  'Migrasi guru awal mesti berlaku hanya apabila HADIR_GURU kosong');
sah(backend.includes('terimaSyncMurid: hadirTerimaSyncMurid_') && backend.includes('terimaSyncGuru: hadirTerimaSyncGuru_'), 'Endpoint relay AKSI/SEMAK ke HADIR tiada');
sah(backend.includes("getProperty('SEPADAN_SYNC_SECRET')") && backend.includes('hadirSahRahsiaSync_'), 'Relay masuk mesti disahkan dengan rahsia Script Properties');
sah(backend.includes("mode: 'merge', records: rekod, kepala: []"), 'Murid dari sistem lain mesti digabung tanpa mengarkib kumpulan yang tidak diliputi');
sah(backend.includes("sumber === 'AKSI'") && backend.includes('dilangkau: true'), 'Relay mesti melangkau sistem asal bagi mencegah gelung');
sah(backend.includes("'apiUploadMurid', [senarai, kata, 'HADIR']") && backend.includes("'apiImportGuru', [guru, kata, 'HADIR']"), 'Panggilan SEMAK mesti membawa penanda asal HADIR');
sah(!backend.includes('padamGuru') && !backend.includes('hapusGuru'), 'Import guru tidak boleh memadam rekod sedia ada');
sah(backend.includes('rmtHadir: rmtHadir, rmtJumlah: rmtJumlah'), 'Simpanan kehadiran mesti pulangkan nisbah RMT');
sah(backend.includes('tahunKod: tahunKod') && backend.includes('hadirJantinaKod_'), 'Tahun atau jantina admin tidak dilengkapkan');
sah(backend.includes('murid.filter(function (m) { return m.nilai === 0; })'), 'Respons sejarah hanya boleh menghantar nama murid tidak hadir');
sah(backend.includes('.map(function (m) { return { nama: m.nama, nilai: 0 }; })'), 'Respons sejarah mesti membuang IC dan status RMT individu');
sah(!backend.includes("murid: murid, jumlah: murid.length"), 'Objek murid dalaman tidak boleh dihantar terus kepada paparan awam');

const fungsiTarikhIso = backend.match(/function hadirSahkanTarikhIso_\(tarikhIso\) \{([\s\S]*?)\n\}/);
sah(fungsiTarikhIso, 'Pengesah tarikh ISO tidak boleh diuji');
const sahkanTarikhIso = new Function('tarikhIso', 'Session', 'Utilities', fungsiTarikhIso[1]);
const sesiTarikh = { getScriptTimeZone: function () { return 'Asia/Kuala_Lumpur'; } };
const utilitiIso = { formatDate: function () { return '2026-08-26'; } };
const tarikhLamaSah = sahkanTarikhIso('2026-08-25', sesiTarikh, utilitiIso);
sah(tarikhLamaSah.tkh === '25/08' && tarikhLamaSah.iso === '2026-08-25', 'Tarikh lama sah tidak dipetakan dengan betul');
function tarikhDitolak(iso) {
  try { sahkanTarikhIso(iso, sesiTarikh, utilitiIso); return false; }
  catch (_) { return true; }
}
sah(tarikhDitolak('2026-08-27'), 'Tarikh akan datang mesti ditolak');
sah(tarikhDitolak('2025-12-31'), 'Tarikh tahun lain mesti ditolak');
sah(backend.includes("simpanSenaraiMuridUpload({ mode: mode, records: rekod, kepala: kepala })"), 'Upload CSV tidak menggunakan import rasmi KEHADIRAN');
sah(!/HADIR_(?:AKSI|SEMAK)_PASSWORD\s*=/.test(backend), 'Kata laluan tidak boleh dihardcode');
sah(backend.includes("token ? hadirSesi_(token, true) : { peranan: 'guru' }"), 'Guru tanpa log masuk belum disokong');
sah(backend.includes('hadirKunciMurid_'), 'Kunci murid legap untuk paparan awam tiada');
sah((backend.match(/icAkhir:\s*ic\.slice\(-4\)/g) || []).length === 1, 'Hanya API admin boleh menerima hujung IC murid');

const fungsiTarikh = backend.match(/function hadirTarikhPaparanMs_\(tarikh, zona\) \{([\s\S]*?)\n\}/);
sah(fungsiTarikh, 'Pemformat tarikh Bahasa Melayu tiada');
const tarikhMelayu = new Function('tarikh', 'zona', 'Utilities', fungsiTarikh[1]);
const utilitiTarikh = { formatDate: function (_, __, corak) {
  return { yyyy: '2026', M: '8', d: '25' }[corak];
} };
sah(tarikhMelayu(new Date(), 'Asia/Kuala_Lumpur', utilitiTarikh) === 'Selasa, 25 Ogos 2026', 'Hari atau bulan belum dalam Bahasa Melayu');
sah(!backend.includes("'EEEE, d MMMM yyyy'"), 'Format tarikh Inggeris lama masih digunakan');

const fungsiMuatan = backend.match(/function hadirSemakMuatan64_\(html\) \{([\s\S]*?)\n\}/);
sah(fungsiMuatan, 'Pembaca muatan RPC SEMAK tiada');
const bacaMuatanSemak = new Function('html', fungsiMuatan[1]);
sah(bacaMuatanSemak("<script>atob('YWJj')</script>") === 'YWJj', 'Respons SEMAK langsung tidak boleh dibaca');
sah(bacaMuatanSemak('userHtml\\x22:\\x22...atob(\\x27YWJjZA==\\x27)...') === 'YWJjZA==', 'Pembungkus HtmlService Google tidak boleh dibaca');
sah(bacaMuatanSemak('userHtml\\x22:\\x22...atob(\\x27YWJjZA\\x3d\\x3d\\x27)...') === 'YWJjZA==', 'Padding Base64 yang dihex oleh HtmlService Google tidak boleh dibaca');

const html = baca('index.html');
sah(html.includes('Simpan Kehadiran'), 'Butang simpan kehadiran tiada');
sah(html.includes('Data Murid'), 'Paparan murid tiada');
sah(html.includes('manifest.webmanifest'), 'Manifest tidak dipaut');
sah(html.includes('id="closeMenuBtn"') && html.includes('id="scrim"'), 'Kawalan tutup menu mudah alih tiada');
sah(html.includes('id="classSelect"'), 'Dropdown kelas satu muka tiada');
sah(!html.includes('id="menuClassName"') && !html.includes('id="menuClassCount"'), 'Kad kelas lama tidak sepatutnya berada dalam menu');
sah(html.includes('id="adminLoginDialog"'), 'Login admin dalam menu tiada');
sah(html.includes('id="reviewPane"') && html.includes('id="reviewClassSelect"'), 'Semak Kehadiran tiada');
sah(html.includes('id="reviewRetryBtn"'), 'Muka depan tiada butang cuba semula');
sah(html.includes('<section id="reviewPane" class="pane">') && html.includes('<section id="attendancePane" class="pane" hidden>'), 'Semak Kehadiran mesti menjadi muka depan');
sah(html.includes('class="menu-link active" data-pane="reviewPane"'), 'Menu Semak Kehadiran mesti aktif pada mula');
sah(html.indexOf('data-pane="reviewPane"') < html.indexOf('data-pane="attendancePane"'), 'Semak Kehadiran mesti berada paling atas sebelum Kehadiran');
sah(html.includes('id="reviewDateSelect"') && html.includes('type="date"'), 'Pilihan tarikh Semak Kehadiran tiada');
sah(html.includes('id="reviewRmtCount"') && html.includes('id="rmtPresentCount"'), 'Bilangan RMT hadir tiada');
sah(html.includes('id="studentSettingsPane"') && html.includes('id="settingsClassSelect"'), 'Menu Tetapan Murid tiada');
sah(html.indexOf('data-pane="studentSettingsPane"') < html.indexOf('data-pane="studentsPane"'), 'Tetapan Murid mesti berada di atas Data Murid');
sah(html.includes('id="teacherSettingsPane"') && html.includes('id="teacherCsvFile"'), 'Paparan Tetapan Guru atau upload CSV tiada');
sah(html.indexOf('data-pane="teacherSettingsPane"') < html.indexOf('data-pane="studentsPane"'), 'Tetapan Guru mesti berada di atas Data Murid');
sah(html.includes('Guru yang tiada dalam fail tidak dipadam') && html.includes('kata laluan sedia ada'), 'Paparan mesti menerangkan import guru gabung-sahaja');
sah(html.includes('id="editStudentBtn"') && html.indexOf('id="editStudentBtn"') < html.indexOf('id="saveStudentBtn"'), 'Butang Edit mesti sebelum Simpan & Selaras');
sah(html.includes('id="adminLogoutMenu"') && html.indexOf('id="sideVersion"') < html.indexOf('id="adminLogoutMenu"'), 'Log keluar mesti berada di sebelah versi');
sah(!html.includes('· PWA'), 'Label versi tidak perlu memaparkan PWA');
sah(html.includes('Semua Kelas'), 'Pilihan Semua Kelas tiada');
sah(html.includes('id="resetBtn"') && html.indexOf('id="resetBtn"') < html.indexOf('id="classSelect"'), 'Set semula mesti berada di atas dropdown kelas');
sah(!html.includes('id="classTitle"') && !html.includes('<h1>Pilih kelas</h1>'), 'Kad kelas lama atau tajuk Pilih kelas masih ada');
sah(html.indexOf('id="sideVersion"') < html.indexOf('id="adminLoginMenu"'), 'Login admin mesti berada di sebelah versi');
sah(!html.includes('tanpa log masuk'), 'Ayat tanpa log masuk masih dipaparkan');
sah(html.includes('id="uploadStudentsBtn"') && html.includes('id="studentCsvFile"'), 'Dialog Update Data Murid CSV tiada');
sah(!html.includes('id="addStudentBtn"'), 'Butang + Murid lama masih ada');
sah(!html.includes('id="loginRole"'), 'Guru tidak sepatutnya melihat pilihan login');

const app = baca('app.js');
sah(app.includes("$('closeMenuBtn').addEventListener('click', tutupMenu)"), 'Butang X tidak menutup menu');
sah(app.includes("$('scrim').addEventListener('click', tutupMenu)"), 'Latar gelap tidak menutup menu');
sah(app.includes("e.key === 'Escape'"), 'Escape tidak menutup menu');
sah(app.includes("id !== 'reviewPane'"), 'Semak Kehadiran mesti boleh dibuka tanpa login admin');
sah(app.includes("panggil('semakKehadiran', [tarikhIso]"), 'Frontend tidak memuatkan tarikh kehadiran terdahulu');
sah(app.includes("panggil('bukaKehadiranTarikh', [namaKelas, tarikhIso]"), 'Kad tarikh lama tidak memuatkan murid bagi tarikh dipilih');
sah(app.includes("window.confirm('Anda akan mengisi atau mengubah kehadiran '"), 'Amaran sebelum mengedit tarikh lama tiada');
sah(app.includes("state.reviewData = state.data") && app.includes("$('reviewDateSelect').value = state.tarikhEditIso"), 'Semak Kehadiran mesti kembali ke hari semasa apabila menu dibuka');
sah(app.includes('var versiPermintaan = ++state.versiSemakan') && app.includes('versiPermintaan !== state.versiSemakan'), 'Respons tarikh lama tidak boleh menimpa paparan hari semasa selepas menu dibuka semula');
sah(app.includes("var tarikhSimpan = state.tarikhEditIso") && app.includes("state.token || '', tarikhSimpan"), 'Simpanan tidak menghantar tarikh yang sedang diedit');
sah(!app.includes("'review-open'") && !app.includes("'Isi kehadiran hari ini'"), 'Teks dan anak panah tindakan masih berada pada kad semakan');
sah(app.includes('m.nilai === 0') && !app.includes('return Number(m.nilai) === 0'), 'Nilai kosong tidak boleh dibaca sebagai tidak hadir dalam semakan');
sah(app.includes("'Murid tidak hadir' : 'Semua murid hadir'"), 'Semakan mesti menyenaraikan murid tidak hadir sahaja');
sah(app.includes("panggil('uploadMuridCsv'"), 'Frontend tidak menghantar CSV melalui API admin');
sah(app.includes("mode === 'sync' && !window.confirm"), 'Sync penuh CSV mesti meminta pengesahan');
sah(app.includes("panggil('simpanTetapanMurid'"), 'Frontend tidak menyimpan RMT atau jawatan murid');
sah(app.includes("panggil('senaraiGuru'") && app.includes("panggil('simpanGuru'") && app.includes("panggil('uploadGuruCsv'"), 'Frontend Tetapan Guru tidak lengkap');
sah(app.includes('function rekodGuruDaripadaCsv') && app.includes("aliasNama = ['NAMA GURU', 'NAMA'"), 'Pembaca CSV guru tiada');
sah(app.includes("panggil('syncGuru'"), 'Butang selaras semula guru tidak disambungkan');
sah(app.includes("$('reviewRmtCount').textContent = jumlahRmtHadir + '/' + jumlahRmt"), 'Kotak RMT mesti memaparkan hadir/jumlah');
sah(app.includes("paneAktif: 'reviewPane'") && app.includes("bukaKehadiranKelas(k.nama)"), 'Kad kelas semakan mesti membuka pengisian kehadiran');
sah(app.includes("Sambungan lambat. Mencuba semula") && app.includes("panggilInit_('', 1)"), 'Init mesti cuba semula dan pulih daripada sesi lama');
sah(app.includes("$('reviewRetryBtn').addEventListener('click', muatAwal)"), 'Butang cuba semula muka depan tidak disambungkan');
sah(app.includes("KUNCI_CACHE_INIT = 'hadir_init_cache_v1'") && app.includes('bacaCacheInit_()'), 'Paparan segera daripada salinan data hari ini tiada');
sah(app.includes("rekod.tarikhIso !== tarikhMalaysiaHariIni_()"), 'Cache peranti mesti luput apabila tarikh berubah');
sah(app.includes("salinan.peranan = 'guru'"), 'Cache peranti tidak boleh memulihkan akses admin');
sah(app.includes('if (state.cacheSementara)') && app.includes('Data terkini sedang dimuatkan sebelum pengisian dibuka'), 'Data cache tidak boleh digunakan untuk menulis sebelum segar');
sah(app.includes("bukaPane('attendancePane');") && app.includes('pilihKelas(kelas);'), 'Kelas yang ditekan mesti dipilih pada halaman kehadiran');
sah(app.includes("$('saveStudentBtn').disabled = !aktif"), 'Butiran murid mesti baca sahaja sehingga Edit ditekan');
sah(app.includes("m.tahunKod || m.tahun"), 'Tahun murid tidak dimasukkan ke dialog');

function fungsiApp(nama) {
  const padan = app.match(new RegExp(`function ${nama}\\([^]*?(?=\\n  function |\\n  var aliasCsvMurid)`));
  sah(padan, `Fungsi ${nama} tidak boleh diuji`);
  return padan[0];
}
const konteksGuruCsv = {};
const sumberGuruCsv = [
  fungsiApp('teks'), fungsiApp('norm'), fungsiApp('normHeaderCsv'),
  fungsiApp('kesanPemisahCsv'), fungsiApp('huraiCsv'),
  fungsiApp('rekodGuruDaripadaCsv')
].join('\n');
require('vm').runInNewContext(sumberGuruCsv, konteksGuruCsv);
const csvGuru = 'NAMA GURU;JAWATAN\nCikgu A;Guru Kelas\nCikgu A;Nilai pendua\nCikgu B;';
const guruCsv = konteksGuruCsv.rekodGuruDaripadaCsv(
  konteksGuruCsv.huraiCsv(csvGuru, konteksGuruCsv.kesanPemisahCsv(csvGuru))
);
sah(guruCsv.length === 2 && guruCsv[0].nama === 'Cikgu A' && guruCsv[1].jawatan === '',
  'CSV guru mesti menyokong titik koma, jawatan pilihan dan membuang nama pendua');

const cfg = baca('config.js');
sah(cfg.includes("versi: 'HADIR v1.8.1'"), 'Versi paparan bukan v1.8.1');
sah(!cfg.includes('PWA'), 'Config versi tidak perlu menulis PWA');
sah(html.includes('styles.css?v=1.8.1') && html.includes('app.js?v=1.8.1') && html.includes('config.js?v=1.8.1'), 'Versi aset HTML tidak seragam');
sah(sw.includes("hadir-shell-v1.8.1-20260828-3") && sw.includes('app.js?v=1.8.1'), 'Cache PWA belum dinaikkan bersama aset');

const css = baca('styles.css');
sah(css.includes('height: 100dvh') && css.includes('overflow-y: auto'), 'Kawasan senarai belum boleh discroll');
sah(css.includes('@media (min-width: 901px)') && css.includes('transform: none'), 'Menu desktop belum kekal terbuka');
sah(css.includes('calc(60px + env(safe-area-inset-top))') && css.includes('padding: env(safe-area-inset-top)'), 'Bar atas PWA tidak menghormati ruang selamat iPhone');
sah(css.includes('min-inline-size: 0') && css.includes('.review-picker input[type="date"]'), 'Dropdown tarikh belum dikekang pada lebar telefon');
sah(!css.includes('.review-open'), 'Gaya footer anak panah kad lama masih ada');

console.log('✓ Sintaks JavaScript/Apps Script sah');
console.log('✓ Manifest HADIR standalone + maskable');
console.log('✓ Cache Storage hanya aset statik; salinan init hari ini disimpan berasingan untuk paparan segera');
console.log('✓ Kontrak kehadiran dan sync AKSI/SEMAK tersedia');
console.log('✓ Menu telefon boleh ditutup melalui X, latar gelap dan Escape');
console.log('✓ Senarai boleh discroll dan menu desktop kekal tanpa kad kelas berulang');
console.log('✓ Bar atas PWA menghormati ruang selamat status/notch iPhone');
console.log('✓ Guru terus mengisi; hanya admin perlu log masuk melalui menu');
console.log('✓ Guru boleh semak tarikh terdahulu; nama hadir dan status RMT individu tidak didedahkan');
console.log('✓ Bilangan RMT hadir tersedia selepas simpan dan dalam semakan tarikh');
console.log('✓ Nisbah RMT menggunakan format hadir/jumlah');
console.log('✓ Semak Kehadiran ialah muka depan dan kad kelas membuka pengisian');
console.log('✓ Init menggunakan cache pelayan tanpa kerja tulis, salinan segera dan cubaan semula');
console.log('✓ Kad semakan bersih, tarikh kembali ke hari semasa dan tarikh lama boleh diedit selepas amaran');
console.log('✓ Tetapan Murid dan paparan baca sahaja tersedia');
console.log('✓ Tetapan Guru merge-only, upload CSV dan sync AKSI/SEMAK tersedia');
console.log('✓ Upload murid/guru dari mana-mana sistem menggunakan relay tanpa gelung');
console.log('✓ Migrasi awal guru AKSI + SEMAK → HADIR tersedia apabila sumber HADIR kosong');
console.log('✓ Versi PWA v1.8.1 dan cache aset dinaikkan serentak');
