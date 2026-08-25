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
sah(backend.includes('simpanSenaraiMuridUpload'), 'Sumber rasmi main tidak digunakan');
sah(backend.includes("'importMurid'"), 'Penyelaras AKSI tiada');
sah(backend.includes("'apiUploadMurid'"), 'Penyelaras SEMAK tiada');
sah(!backend.includes("token: 'SISTEM_HADIR'"), 'AKSI tidak boleh menerima token sampul palsu');
sah(backend.includes("hadirAksiRpc_(url, 'importMurid', [csv, masuk.token], masuk.token)"), 'Token sesi AKSI mesti dihantar pada sampul import');
sah(backend.includes('uploadMuridCsv: hadirUploadMuridCsv_'), 'API upload CSV murid tiada');
sah(backend.includes("simpanSenaraiMuridUpload({ mode: mode, records: rekod, kepala: kepala })"), 'Upload CSV tidak menggunakan import rasmi KEHADIRAN');
sah(!/HADIR_(?:AKSI|SEMAK)_PASSWORD\s*=/.test(backend), 'Kata laluan tidak boleh dihardcode');
sah(backend.includes("token ? hadirSesi_(token, true) : { peranan: 'guru' }"), 'Guru tanpa log masuk belum disokong');
sah(backend.includes('hadirKunciMurid_'), 'Kunci murid legap untuk paparan awam tiada');
sah(!/icAkhir: ic\.slice\(-4\)/.test(backend), 'Paparan awam tidak boleh menerima IC murid');

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

const html = baca('index.html');
sah(html.includes('Simpan Kehadiran'), 'Butang simpan kehadiran tiada');
sah(html.includes('Data Murid'), 'Paparan murid tiada');
sah(html.includes('manifest.webmanifest'), 'Manifest tidak dipaut');
sah(html.includes('id="closeMenuBtn"') && html.includes('id="scrim"'), 'Kawalan tutup menu mudah alih tiada');
sah(html.includes('id="classSelect"'), 'Dropdown kelas satu muka tiada');
sah(!html.includes('id="menuClassName"') && !html.includes('id="menuClassCount"'), 'Kad kelas lama tidak sepatutnya berada dalam menu');
sah(html.includes('id="adminLoginDialog"'), 'Login admin dalam menu tiada');
sah(html.includes('id="reviewPane"') && html.includes('id="reviewClassSelect"'), 'Semak Kehadiran tiada');
sah(html.includes('Semua Kelas'), 'Pilihan Semua Kelas tiada');
sah(html.includes('id="resetBtn"') && html.indexOf('id="resetBtn"') < html.indexOf('id="classSelect"'), 'Set semula mesti berada di atas dropdown kelas');
sah(!html.includes('id="classTitle"') && !html.includes('Pilih kelas'), 'Kad kelas lama atau ayat Pilih kelas masih ada');
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
sah(app.includes("panggil('uploadMuridCsv'"), 'Frontend tidak menghantar CSV melalui API admin');
sah(app.includes("mode === 'sync' && !window.confirm"), 'Sync penuh CSV mesti meminta pengesahan');

const css = baca('styles.css');
sah(css.includes('height: 100dvh') && css.includes('overflow-y: auto'), 'Kawasan senarai belum boleh discroll');
sah(css.includes('@media (min-width: 901px)') && css.includes('transform: none'), 'Menu desktop belum kekal terbuka');
sah(css.includes('calc(60px + env(safe-area-inset-top))') && css.includes('padding: env(safe-area-inset-top)'), 'Bar atas PWA tidak menghormati ruang selamat iPhone');

console.log('✓ Sintaks JavaScript/Apps Script sah');
console.log('✓ Manifest HADIR standalone + maskable');
console.log('✓ Cache hanya aset statik, tiada API/data');
console.log('✓ Kontrak kehadiran dan sync AKSI/SEMAK tersedia');
console.log('✓ Menu telefon boleh ditutup melalui X, latar gelap dan Escape');
console.log('✓ Senarai boleh discroll dan menu desktop kekal tanpa kad kelas berulang');
console.log('✓ Bar atas PWA menghormati ruang selamat status/notch iPhone');
console.log('✓ Guru terus mengisi; hanya admin perlu log masuk melalui menu');
