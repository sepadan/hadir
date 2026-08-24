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
sah(backend.includes('uploadMuridCsv: hadirUploadMuridCsv_'), 'API upload CSV murid tiada');
sah(backend.includes("simpanSenaraiMuridUpload({ mode: mode, records: rekod, kepala: kepala })"), 'Upload CSV tidak menggunakan import rasmi KEHADIRAN');
sah(!/HADIR_(?:AKSI|SEMAK)_PASSWORD\s*=/.test(backend), 'Kata laluan tidak boleh dihardcode');
sah(backend.includes("token ? hadirSesi_(token, true) : { peranan: 'guru' }"), 'Guru tanpa log masuk belum disokong');
sah(backend.includes('hadirKunciMurid_'), 'Kunci murid legap untuk paparan awam tiada');
sah(!/icAkhir: ic\.slice\(-4\)/.test(backend), 'Paparan awam tidak boleh menerima IC murid');

const html = baca('index.html');
sah(html.includes('Simpan Kehadiran'), 'Butang simpan kehadiran tiada');
sah(html.includes('Data Murid'), 'Paparan murid tiada');
sah(html.includes('manifest.webmanifest'), 'Manifest tidak dipaut');
sah(html.includes('id="closeMenuBtn"') && html.includes('id="scrim"'), 'Kawalan tutup menu mudah alih tiada');
sah(html.includes('id="classSelect"'), 'Dropdown kelas satu muka tiada');
sah(html.includes('id="menuClassName"') && html.includes('id="menuClassCount"'), 'Nama kelas dalam menu tiada');
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

console.log('✓ Sintaks JavaScript/Apps Script sah');
console.log('✓ Manifest HADIR standalone + maskable');
console.log('✓ Cache hanya aset statik, tiada API/data');
console.log('✓ Kontrak kehadiran dan sync AKSI/SEMAK tersedia');
console.log('✓ Menu telefon boleh ditutup melalui X, latar gelap dan Escape');
console.log('✓ Senarai boleh discroll, menu desktop kekal dan nama kelas dipaparkan');
console.log('✓ Guru terus mengisi; hanya admin perlu log masuk melalui menu');
