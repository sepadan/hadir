const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
function baca(n) { return fs.readFileSync(path.join(root, n), 'utf8').replace(/\r\n/g, '\n'); }
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
sah(backend.includes('HADIR_LOGIN_MAKS_CUBAAN') && backend.includes('HADIR_LOGIN_SEKAT_SAAT'),
  'Login admin mesti mempunyai had cubaan dan tempoh sekatan');
const blokLogin = backend.match(/function hadirLogin_\([\s\S]*?(?=\nfunction |$)/)[0];
sah(blokLogin.includes('LockService.getScriptLock()') &&
    /finally[\s\S]*releaseLock\(\)/.test(blokLogin),
  'Keseluruhan peralihan login mesti atomik di bawah ScriptLock');
sah(blokLogin.includes('hadirLoginDisekat_(status, sekarang)'),
  'Login admin mesti menolak cubaan ketika sekatan aktif');
sah(blokLogin.includes('hadirCatatLoginGagal_(props, status, sekarang)'),
  'PIN admin salah mesti direkod untuk had cubaan');
sah(blokLogin.includes('hadirKosongkanLoginGagal_(props)'),
  'Login berjaya mesti mengosongkan kiraan gagal');
sah(backend.includes("getProperty(hadirLoginKunci_())") &&
    backend.includes("setProperty(hadirLoginKunci_()"),
  'Status sekatan login mesti menggunakan Script Properties sebagai sumber benar');
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
sah(backend.includes('function hadirSimpanKehadiran_(kelas, senaraiSebab, token, tarikhIso)'), 'Simpanan tarikh dipilih tiada');
sah(backend.includes('muridTiadaPadaTarikh_(ic, tkh, intervalArkib, icMain)'), 'Simpanan tarikh lama tidak menghormati tempoh murid aktif');
sah(backend.includes("kunci: hadirKunciMurid_(ic, pilihan.tkh)"), 'Kunci murid tarikh lama mesti legap dan khusus tarikh');
sah(backend.includes("throw new Error('Semakan hanya tersedia bagi tahun semasa.')"), 'Semakan tarikh mesti dihadkan kepada tahun semasa');
sah(backend.includes('muridTiadaPadaTarikh_(ic, tkh, intervalArkib, icMain)'), 'Semakan sejarah mesti menghormati tempoh murid aktif');
sah(backend.includes('function hadirPetaRmt_()'), 'Sumber status RMT tiada');
sah(backend.includes('simpanTetapanMurid: hadirSimpanTetapanMurid_'), 'API Tetapan Murid tiada');
sah(backend.includes("'JAWATAN MURID'"), 'Simpanan jawatan murid tiada');
sah(backend.includes('senaraiGuru: hadirSenaraiGuru_') && backend.includes('uploadGuruCsv: hadirUploadGuruCsv_'), 'API Tetapan Guru tiada');
sah(backend.includes("getSheetByName('HADIR_GURU')") && backend.includes("['NAMA GURU', 'JAWATAN', 'DIKEMAS KINI', 'STATUS']"), 'Sumber guru HADIR tiada');
sah(backend.includes('nyahaktifGuru: hadirNyahaktifGuru_') && backend.includes("hadirGabungGuru_(aktif, 'sync')"), 'Nyahaktif guru berpusat tiada');
sah(backend.includes("mod === 'sync'") && backend.includes("r[3] = 'TIDAK AKTIF'"), 'Sync penuh guru mesti menggunakan status, bukan padam fizikal');
sah(backend.includes("hadirAksiRpc_(url, 'importGuru'") && backend.includes("hadirSemakRpc_(url, 'apiImportGuru'"), 'Penyelarasan guru AKSI/SEMAK tiada');
sah(backend.includes("hadirAksiRpc_(url, 'pastikanAkaunGuru'"), 'Akaun guru AKSI tidak dipastikan selepas import');
sah(backend.includes('function hadirTarikGuruSediaAda_()') && backend.includes("hadirSemakRpc_(urlSemak, 'apiInit', [])") &&
  backend.indexOf("hadirSemakRpc_(urlSemak, 'apiInit', [])") < backend.indexOf("hadirAksiRpc_(urlAksi, 'getSenaraiGuru', [tokenAksi], tokenAksi)"),
  'Migrasi awal guru mesti mengutamakan senarai SEMAK yang paling baharu');
sah(backend.includes("if (!rekod.length) {\n    sumber = 'AKSI';"),
  'AKSI hanya boleh digunakan sebagai sandaran apabila senarai SEMAK kosong');
sah(backend.includes("if (!guru.length) {\n    migrasi = hadirTarikGuruSediaAda_();"),
  'Migrasi guru awal mesti berlaku hanya apabila HADIR_GURU kosong');
sah(backend.includes('terimaSyncMurid: hadirTerimaSyncMurid_') && backend.includes('terimaSyncGuru: hadirTerimaSyncGuru_'), 'Endpoint relay AKSI/SEMAK ke HADIR tiada');
sah(backend.includes("getProperty('SEPADAN_SYNC_SECRET')") && backend.includes('hadirSahRahsiaSync_'), 'Relay masuk mesti disahkan dengan rahsia Script Properties');
sah(backend.includes("mode: 'merge', records: rekod, kepala: []"), 'Murid dari sistem lain mesti digabung tanpa mengarkib kumpulan yang tidak diliputi');
sah(backend.includes("sumber === 'AKSI'") && backend.includes('dilangkau: true'), 'Relay mesti melangkau sistem asal bagi mencegah gelung');
sah(backend.includes("'apiUploadMurid', [senarai, kata, 'HADIR']") && backend.includes("'apiImportGuru', [guru, kata, 'HADIR', mod || 'merge']"), 'Panggilan SEMAK mesti membawa penanda asal dan mod HADIR');
sah(!backend.includes('deleteRow') && !backend.includes('clearContents'), 'Sync guru tidak boleh memadam rekod sedia ada secara fizikal');
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
sah(html.includes('id="teacherUploadMode"') && html.includes('Sync penuh — nyahaktif guru yang tiada') && html.includes('sejarah tidak dipadam'), 'Paparan mesti menerangkan dua mod import guru dan perlindungan sejarah');
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
sah(app.includes("panggil('nyahaktifGuru'") && app.includes("mode: mod"), 'Frontend nyahaktif/sync penuh guru tidak lengkap');
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

// Ciri MOEIS: Kategori + Sebab tidak hadir dan giliran "Hantar ke MOEIS".
sah(backend.includes('moeisSenaraiKelas: hadirMoeisSenaraiKelas_') &&
    backend.includes('moeisJobBuat: hadirMoeisJobBuat_') &&
    backend.includes('moeisJobSenarai: hadirMoeisJobSenarai_') &&
    backend.includes('moeisJobSelesai: hadirMoeisJobSelesai_') &&
    backend.includes('moeisSimpanSebab: hadirMoeisSimpanSebab_'),
  'API Hantar ke MOEIS tiada');
sah(backend.includes("getSheetByName('HADIR_MOEIS_SEBAB')") && backend.includes("getSheetByName('HADIR_MOEIS_JOB')"),
  'Sumber data MOEIS (sebab dan giliran tugasan) tiada');
sah(backend.includes('hadirGantiMoeisSebabKelas_(pilihan.iso, kelas, sebabUntukSimpan)'),
  'Simpanan kehadiran mesti menyimpan kategori/sebab bersama rekod kehadiran');
sah(backend.includes('HADIR_MOEIS_ENGINE_SECRET') && backend.includes('function hadirSahRahsiaMoeis_'),
  'Rahsia enjin MOEIS untuk moeis_job_senarai/moeis_job_selesai tiada');
sah(!/HADIR_MOEIS_ENGINE_SECRET\s*=\s*['"]/.test(backend), 'Rahsia enjin MOEIS tidak boleh dihardcode');
sah(backend.includes("if (tarikhIso !== hariIniIso) throw new Error('Penghantaran MOEIS hanya tersedia bagi kehadiran hari ini.')"),
  'Penciptaan tugasan MOEIS mesti dihadkan kepada hari ini');
const badanJobBuat = backend.match(/function hadirMoeisJobBuat_[\s\S]*?(?=\nfunction |$)/)[0];
sah(!/UrlFetchApp|hadirAksiRpc_|hadirSemakRpc_/.test(badanJobBuat),
  'HADIR tidak boleh menghubungi MOEIS secara langsung daripada job_buat; ia hanya mencipta tugasan');

sah(html.includes('id="moeisPane"') && html.includes('id="moeisList"'), 'Skrin Hantar ke MOEIS tiada');
sah(html.includes('data-pane="moeisPane"'), 'Menu Hantar ke MOEIS tiada dalam sisi admin');
sah(html.includes('id="sebabDialog"') && html.includes('id="sebabKategori"') && html.includes('id="sebabSebab"'),
  'Dialog Kategori/Sebab tiada');
sah(html.includes('id="sebabHadirBtn"'), 'Pilihan Tandakan Hadir dalam dialog sebab tiada');

sah(app.includes('var MOEIS_SEBAB = {'), 'Senarai Kategori/Sebab MOEIS tiada pada frontend');
sah(app.includes("bukaDialogSebab({ kunci: kunci, nama: m.nama }, 'tanda');"),
  'Menandakan tidak hadir mesti membuka dialog Kategori/Sebab');
sah(app.includes('function simpanSebabDialog'), 'Pengesahan dialog sebab tiada');
sah(app.includes("panggil('simpanKehadiran', [state.kelas.nama, senaraiSebab, state.token || '', tarikhSimpan]"),
  'Simpanan kehadiran mesti menghantar kategori/sebab, bukan sekadar senarai kunci');
sah(app.includes('senaraiSebab.some(function (s) { return !s.kategori || !s.sebab; })'),
  'Simpanan mesti disekat di sisi pelanggan jika kategori/sebab belum lengkap');
sah(app.includes("panggil('moeisSenaraiKelas'") && app.includes("panggil('moeisJobBuat'") && app.includes("panggil('moeisSimpanSebab'"),
  'Frontend skrin Hantar ke MOEIS tidak lengkap');
sah(app.includes('hantarBtn.disabled = !lengkap'), 'Butang Hantar mesti disekat apabila kategori/sebab belum lengkap');

function fungsiBackend(nama) {
  const re = new RegExp('function ' + nama + '\\([^)]*\\)\\s*\\{[\\s\\S]*?(?=\\nfunction |$)');
  const padan = backend.match(re);
  sah(padan, `Fungsi ${nama} tidak boleh diuji`);
  return padan[0];
}
const konteksMoeis = {};
const sumberMoeis = [
  'hadirMoeisSebabData_', 'hadirMoeisSebabSah_', 'hadirMoeisBelumLengkap_',
  'hadirMoeisBolehCiptaJob_', 'hadirMoeisSahkanLengkap_'
].map(fungsiBackend).join('\n');
vm.runInNewContext(sumberMoeis, konteksMoeis);

// Pengesahan wajib kategori+sebab terhadap senarai rasmi MOEIS.
sah(konteksMoeis.hadirMoeisSebabSah_('D', 'DEMAM') === true, 'Pasangan kategori/sebab sah mesti diterima');
sah(konteksMoeis.hadirMoeisSebabSah_('D', 'TIDAK WUJUD') === false, 'Sebab tidak sah mesti ditolak');
sah(konteksMoeis.hadirMoeisSebabSah_('Z', 'DEMAM') === false, 'Kategori tidak sah mesti ditolak');
sah(konteksMoeis.hadirMoeisSebabSah_('', '') === false, 'Kategori dan sebab kosong mesti ditolak');

// Pengiraan "belum lengkap".
const senaraiCampurMoeis = [
  { nama: 'Ali', kategori: 'D', sebab: 'DEMAM' },
  { nama: 'Siti', kategori: '', sebab: '' },
  { nama: 'Ah Kow', kategori: 'N', sebab: 'BANGUN LEWAT' },
  { nama: 'Muthu', kategori: 'D', sebab: 'TIDAK WUJUD' }
];
const belumLengkapMoeis = konteksMoeis.hadirMoeisBelumLengkap_(senaraiCampurMoeis);
sah(belumLengkapMoeis.length === 2 && belumLengkapMoeis[0].nama === 'Siti' && belumLengkapMoeis[1].nama === 'Muthu',
  'Pengiraan belum lengkap mesti mengesan kategori/sebab kosong atau tidak sah');

// Penolakan hantar (moeis_job_buat) apabila tidak lengkap atau tiada murid.
try {
  konteksMoeis.hadirMoeisSahkanLengkap_(senaraiCampurMoeis, '1 BIJAK');
  throw new Error('Sepatutnya ditolak kerana belum lengkap');
} catch (e) {
  sah(/Siti/.test(e.message) && /Muthu/.test(e.message),
    'Penolakan hantar mesti menyenaraikan murid yang belum lengkap: ' + e.message);
}
try {
  konteksMoeis.hadirMoeisSahkanLengkap_([], '1 BIJAK');
  throw new Error('Sepatutnya ditolak kerana tiada murid tidak hadir');
} catch (e) {
  sah(/Tiada murid/.test(e.message), 'Kelas tanpa murid tidak hadir mesti ditolak: ' + e.message);
}
sah(konteksMoeis.hadirMoeisSahkanLengkap_([{ nama: 'Ali', kategori: 'D', sebab: 'DEMAM' }], '1 BIJAK') === true,
  'Senarai lengkap mesti diterima untuk penghantaran');

// Elak pendua tugasan bagi kelas+tarikh yang sama. Pendua memang mustahil
// kerana pemanggil MENGGUNAKAN SEMULA baris yang sama (id lama, setValues
// semula kepada 'menunggu') — jadi gate ini sebenarnya mengawal bila admin
// boleh menghantar semula.
sah(konteksMoeis.hadirMoeisBolehCiptaJob_(undefined) === true, 'Tiada tugasan sedia ada mesti boleh dicipta');
sah(konteksMoeis.hadirMoeisBolehCiptaJob_('gagal') === true, 'Tugasan gagal mesti boleh dicuba semula');
sah(konteksMoeis.hadirMoeisBolehCiptaJob_('menunggu') === false, 'Tugasan menunggu mesti disekat (enjin akan mengambilnya)');
sah(konteksMoeis.hadirMoeisBolehCiptaJob_('sedang_dihantar') === false, 'Tugasan sedang_dihantar mesti disekat (jangan reset lease)');
sah(konteksMoeis.hadirMoeisBolehCiptaJob_('tersimpan') === false, 'Tugasan tersimpan mesti disekat (menunggu pengesahan)');
// Status siap BOLEH dihantar semula: sebelum ini ia disekat dan itulah yang
// mengunci 1 BIJAK — statusnya tersilap 'berjaya' (positif palsu MuatSemula
// lama) lalu tiada jalan keluar walaupun MOEIS langsung tidak terisi.
sah(konteksMoeis.hadirMoeisBolehCiptaJob_('berjaya') === true, 'Tugasan berjaya mesti boleh dihantar semula oleh admin');

const cfg = baca('config.js');
const versiPadanan = cfg.match(/versi: 'HADIR v([0-9.]+)'/);
sah(versiPadanan, 'config.js mesti menyatakan versi paparan dalam bentuk HADIR v<versi>');
const versiPaparan = versiPadanan[1];
sah(!cfg.includes('PWA'), 'Config versi tidak perlu menulis PWA');
sah(html.includes(`styles.css?v=${versiPaparan}`) && html.includes(`app.js?v=${versiPaparan}`) &&
    html.includes(`config.js?v=${versiPaparan}`) && html.includes(`manifest.webmanifest?v=${versiPaparan}`),
  'Semua aset HTML mesti membawa versi yang sama dengan config.js (senarai semak aset blueprint)');
sah(sw.includes(`hadir-shell-v${versiPaparan}-`) && sw.includes(`app.js?v=${versiPaparan}`),
  'CACHE_VERSION dan APP_SHELL service worker mesti dinaikkan bersama aset');

// Ciri Enjin PC (Companion): klaim atomik + lease, status tersimpan, dan
// pengawal admin di frontend (tiada wildcard CORS, tiada medan kata laluan,
// sessionStorage lalai).
sah(backend.includes('function hadirMoeisJobKlaim_') && backend.includes('function hadirMoeisJobLepas_'),
  'Klaim/lepas atomik tugasan MOEIS tiada');
sah(backend.includes('moeisJobKlaim: hadirMoeisJobKlaim_') && backend.includes('moeisJobLepas: hadirMoeisJobLepas_'),
  'Klaim/lepas atomik tidak didaftarkan dalam jadual kaedah dibenarkan');
sah(backend.includes("HADIR_MOEIS_JOB_LEBAR = 13"), 'Lebar jadual tugasan MOEIS belum dinaikkan kepada 13 (PEMILIK + LEASE_SELEPAS)');
sah(backend.includes("'PEMILIK', 'LEASE_SELEPAS'") || backend.includes("['PEMILIK', 'LEASE_SELEPAS']"),
  'Migrasi lembut lajur PEMILIK/LEASE_SELEPAS tiada');
sah(backend.includes("['berjaya', 'gagal', 'tersimpan'].indexOf(keputusan)"),
  'hadirMoeisJobSelesai_ mesti menerima keputusan "tersimpan" (disimpan, menunggu pengesahan)');
sah(backend.includes("tersimpan: 'Tersimpan — menunggu pengesahan'"), 'Label status tersimpan tiada');
sah(backend.includes('idTugasan: job ? job.id : '), 'Senarai kelas admin mesti membawa id tugasan supaya companion boleh dijalankan semula');
sah(backend.includes('diciptaEpochMs'),
  'Kontrak enjin mesti membawa cap masa penciptaan epoch yang tidak kabur untuk pengawal tugasan fresh');

// Pembetulan semakan bebas (18 September 2026) — dikunci pada suite repo:
// laporan keputusan mesti datang daripada pemegang klaim sahaja, dan payload
// murid tidak boleh mengandungi IC melalui laluan yang dikawal companion.
const blokSelesai = backend.match(/function hadirMoeisJobSelesai_\([\s\S]*?\n}/)[0];
sah(/function hadirMoeisJobSelesai_\(id, keputusan, mesej, bilHadirSelepas, pemilik, rahsia\)/.test(blokSelesai),
  'moeisJobSelesai mesti menerima pemilik sebagai argumen kelima');
sah(blokSelesai.includes('pemilikSemasa !== pemilik') && blokSelesai.includes("statusSemasa !== 'sedang_dihantar'"),
  'moeisJobSelesai mesti menolak laporan daripada enjin bukan pemegang klaim atau status yang tidak sepadan');

// Pemulihan tugasan tersekat (21 September 2026): tugasan 'sedang_dihantar'
// yang ditinggalkan enjin mati/restart mesti boleh diklaim semula. Tiga laluan
// klaim mesti wujud: (1) pemilik sama (restart/heartbeat), (2) pemilik
// berlainan dengan lease sah yang luput (runner mati), (3) tugasan yatim tanpa
// pemilik & tanpa lease (tugasan lama/manual). Tidak ada laluan ini bermakna
// tugasan tersekat kekal tidak boleh diproses.
const blokKlaim = backend.match(/function hadirMoeisJobKlaim_\([\s\S]*?\n}/)[0];
sah(blokKlaim.includes("status === 'sedang_dihantar' && pemilikSediaAda === pemilik"),
  'Klaim pemilik sama (restart/heartbeat) tiada — tugasan tersekat tidak boleh dipulihkan segera');
sah(blokKlaim.includes('leaseMentah < sekarang'),
  'Klaim pemilik berlainan selepas lease luput (runner mati) tiada');
sah(blokKlaim.includes('leaseTiada'),
  'Pemulihan tugasan yatim tanpa pemilik & tanpa lease tiada');

const payloadCompanion = path.join(root, 'companion', 'src', 'moeis', 'payload.mjs');
if (fs.existsSync(payloadCompanion)) {
  const p = baca('companion/src/moeis/payload.mjs');
  sah(/murid: murid[\s\S]*map\(\(m\) => \(\{ nama: m\.nama/.test(p),
    'Payload proses anak mesti membuang medan ic (PII) sebelum dihantar');
}
if (fs.existsSync(path.join(root, 'companion', 'bin', 'jalan-push.mjs'))) {
  const jp = baca('companion/bin/jalan-push.mjs');
  sah(!/--job-json/.test(jp) && /bacaStdinJob/.test(jp),
    'Payload tugasan mesti melalui STDIN, bukan argumen CLI (baris arahan boleh dibaca proses lain)');
}

sah(!app.includes('function companionPanggil') && !app.includes('companionPanggil('),
  'Kod Companion mesti dibuang dari frontend: enjin PC kini aplikasi HADIR Desktop yang membaca backend terus, bukan panggilan pelayar ke loopback 8747');
sah(!/Access-Control-Allow-Origin['"`]?\s*[,:]\s*['"`]\*/.test(app), 'Frontend tidak boleh mengandungi rentetan CORS wildcard *');
sah(!app.includes('KUNCI_COMPANION_SESI') && !app.includes('8747'),
  'Tiada pasangan Companion atau port loopback boleh kekal dalam app.js');
const bahagianMoeisPaneHtml = html.slice(html.indexOf('id="moeisPane"'), html.indexOf('</section>', html.indexOf('id="moeisPane"')));
sah(!/type=["']password["']/.test(bahagianMoeisPaneHtml), 'Skrin Hantar ke MOEIS/Companion tidak boleh mempunyai medan type="password"');
sah(!html.includes('id="companionSambungBtn"') && !html.includes('id="companionPairDialog"') &&
    !html.includes('id="companionPane"') && !html.includes('Enjin PC (Companion)'),
  'UI Companion mesti dibuang dari index.html: sambungan dibuat oleh aplikasi HADIR Desktop, bukan pelayar');

const companionDir = path.join(root, 'companion');
if (fs.existsSync(companionDir)) {
  const failCompanion = [];
  (function jalan(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((ent) => {
      if (ent.name === 'node_modules' || ent.name === 'dist' || ent.name === 'data' || ent.name === 'log') return;
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) jalan(p);
      else if (/\.(mjs|js|json)$/.test(ent.name)) failCompanion.push(p);
    });
  })(companionDir);
  const gabunganCompanion = failCompanion.map((p) => fs.readFileSync(p, 'utf8')).join('\n');
  sah(!/HADIR_MOEIS_ENGINE_SECRET\s*=\s*['"][^'"]+['"]/.test(gabunganCompanion),
    'Rahsia enjin tidak boleh dihardcode dalam companion/');
  sah(!/['"]Bearer [a-zA-Z0-9]{10,}['"]/.test(gabunganCompanion), 'Token contoh sebenar tidak boleh dihardcode dalam companion/');
}

// Ujian tingkah laku sebenar bagi had cubaan dan luput sekatan.
let sekarang = 1_000_000;
let kunciDipegang = false;
let nomborUuid = 0;
const stor = new Map([['HADIR_ADMIN_PIN_HASH', 'betul']]);
const propsMock = {
  getProperty(k) { return stor.has(k) ? stor.get(k) : null; },
  setProperty(k, v) { stor.set(k, String(v)); },
  deleteProperty(k) { stor.delete(k); }
};
const konteks = {
  Date: { now: () => sekarang },
  console,
  PropertiesService: { getScriptProperties: () => propsMock },
  LockService: { getScriptLock: () => ({
    waitLock() { sah(!kunciDipegang, 'Kunci login tidak boleh diambil bersarang'); kunciDipegang = true; },
    releaseLock() { sah(kunciDipegang, 'Kunci login dilepaskan tanpa dipegang'); kunciDipegang = false; }
  }) },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
    computeDigest: () => [], getUuid: () => `uuid-${++nomborUuid}`
  }
};
vm.createContext(konteks);
vm.runInContext(backend, konteks);
konteks.hadirHash_ = nilai => String(nilai || '');
konteks.hadirLog_ = () => {};
for (let i = 1; i <= 4; i++) {
  try { konteks.hadirLogin_('admin', 'salah'); throw new Error('PIN salah diterima'); }
  catch (e) { sah(/PIN tidak betul/.test(e.message), `Cubaan gagal ${i} salah: ${e.message}`); }
  sah(!kunciDipegang, 'Kunci mesti dilepas selepas PIN salah');
}
try { konteks.hadirLogin_('admin', 'salah'); throw new Error('Cubaan kelima diterima'); }
catch (e) { sah(/Terlalu banyak/.test(e.message), `Cubaan kelima mesti menyekat: ${e.message}`); }
const statusSekat = JSON.parse(stor.get('HADIR_LOGIN_GAGAL_ADMIN'));
sah(statusSekat.gagal === 5 && statusSekat.sekatHingga === sekarang + 900000,
  'Cubaan kelima mesti menyimpan kiraan dan cap masa sekatan');
try { konteks.hadirLogin_('admin', 'betul'); throw new Error('Login ketika sekatan diterima'); }
catch (e) { sah(/Terlalu banyak/.test(e.message), 'PIN betul mesti ditolak ketika sekatan aktif'); }
sekarang += 900001;
const loginPulih = konteks.hadirLogin_('admin', 'betul');
sah(loginPulih.peranan === 'admin' && loginPulih.token,
  'Login mesti pulih selepas tempoh sekatan tamat');
sah(!stor.has('HADIR_LOGIN_GAGAL_ADMIN'), 'Login berjaya mesti mengosongkan status gagal');
sah(!kunciDipegang, 'Kunci mesti dilepas selepas login berjaya');

sah(backend.includes('hadirPcCiriDidayakan_') && backend.includes("HADIR_PELBAGAI_PC"),
  'Suis ciri berbilang PC tiada');
sah(backend.includes('function hadirPcKlaimKepimpinan_') && backend.includes('function hadirPcSahkanPenulis_'),
  'Fungsi kepimpinan/fencing berbilang PC tiada');
sah(backend.includes('pcTerbitKodDaftar: hadirPcTerbitKodDaftar_'),
  'Penyenaraian dibenarkan tiada kaedah pcTerbitKodDaftar');
sah(backend.includes('pcDaftarPeranti: hadirPcDaftarPeranti_') &&
    backend.includes('pcNyahaktifPeranti: hadirPcNyahaktifPeranti_') &&
    backend.includes('pcDegup: hadirPcDegup_') &&
    backend.includes('pcKlaimKepimpinan: hadirPcKlaimKepimpinan_') &&
    backend.includes('pcSahkanPenulis: hadirPcSahkanPenulis_') &&
    backend.includes('pcSenaraiPerantiAdmin: hadirPcSenaraiPerantiAdmin_') &&
    backend.includes('pcStatusAwam: hadirPcStatusAwam_'),
  'Penyenaraian dibenarkan tiada kaedah berbilang PC lengkap');
const blokPcKlaim = backend.match(/function hadirPcKlaimKepimpinan_\([\s\S]*?(?=\nfunction |$)/)[0];
sah(blokPcKlaim.includes('LockService.getScriptLock()') && /finally[\s\S]*releaseLock\(\)/.test(blokPcKlaim),
  'Klaim kepimpinan berbilang PC mesti atomik di bawah ScriptLock');
const blokPcDaftar = backend.match(/function hadirPcDaftarPeranti_\([\s\S]*?(?=\nfunction |$)/)[0];
sah(blokPcDaftar.includes('hadirHash_(rahsia)') && !blokPcDaftar.includes('RAHSIA_HASH, rahsia'),
  'Pendaftaran peranti mesti menyimpan hash rahsia, bukan teks jelas');
const blokPcStatusAwam = backend.match(/function hadirPcStatusAwam_\([\s\S]*?(?=\nfunction |$)/)[0];
sah(!blokPcStatusAwam.includes('RAHSIA_HASH') && !blokPcStatusAwam.includes('HADIR_MOEIS_ENGINE_SECRET'),
  'Status awam berbilang PC tidak boleh membocorkan rahsia/hash rahsia');

// UI Peranti PC (ciri berbilang PC) dibuang daripada frontend: ciri itu masih OFF
// secara lalai dan tidak digunakan oleh aliran semasa (satu PC, enjin = aplikasi
// HADIR Desktop). Bahagian backend pc* kekal dan masih diuji di atas.
['devicePcPane', 'devicePcAdmin', 'devicePcIssueForm', 'devicePcAkaunInput', 'devicePcTtlInput',
 'devicePcIssueBtn', 'devicePcKodResult', 'devicePcKodOutput', 'devicePcSalinBtn', 'devicePcKodLuput'
].forEach((id) => {
  sah(!html.includes(`id="${id}"`) && !app.includes(`'${id}'`),
    `UI Peranti PC "${id}" mesti dibuang daripada frontend (ciri belum digunakan)`);
});
sah(!app.includes('function nyahaktifPerantiPc_') && !app.includes('function terbitKodDaftarPc_') &&
    !app.includes('function muatPerantiPc_'),
  'Fungsi UI Peranti PC mesti dibuang bersama UI-nya');

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
console.log('✓ Tetapan Guru menyokong gabung, sync penuh dan nyahaktif tanpa memadam sejarah');
console.log('✓ Upload murid/guru dari mana-mana sistem menggunakan relay tanpa gelung');
console.log('✓ Migrasi awal guru mengutamakan SEMAK; AKSI hanya sandaran');
console.log('✓ Kategori + Sebab MOEIS wajib, disahkan pada pelayan dan disimpan bersama kehadiran');
console.log('✓ Hantar ke MOEIS menyekat penghantaran tidak lengkap dan mengelak tugasan pendua');
console.log('✓ Versi PWA v1.11.0 dan cache aset dinaikkan serentak');
console.log('✓ Klaim atomik + lease + status tersimpan tersedia untuk giliran MOEIS berasingan');
console.log('✓ Enjin PC (Companion) HADIR Admin: pengawal admin, sessionStorage lalai, tiada wildcard CORS di frontend');

