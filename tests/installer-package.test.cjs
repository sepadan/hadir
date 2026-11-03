const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const rd = p => fs.readFileSync(path.join(root, p), 'utf8');

// Pepijat pemasang 3 Nov 2026: pakej zip meletak exe di AKAR folder, tetapi
// setup.ps1 hanya mencari dist\win-x64\HadirDesktop.exe -> PASANG.cmd gagal
// pada PC sekolah dengan "Tidak jumpa ... jalankan publish.ps1 dahulu".
// Ujian ini mengekalkan resolusi dua-laluan setup.ps1 dan kesepaduan pakej.

test('setup.ps1 mencari exe di akar pakej DAN laluan repo', () => {
  const s = rd('desktop/setup.ps1');
  assert.ok(s.includes('Join-Path $PSScriptRoot "HadirDesktop.exe"'),
    'setup.ps1 mesti menerima exe di akar folder pakej (layout zip rasmi)');
  assert.ok(s.includes('dist\\win-x64\\HadirDesktop.exe'),
    'setup.ps1 mesti kekal menerima binaan repo dist\\win-x64');
  assert.ok(s.indexOf('Join-Path $PSScriptRoot "HadirDesktop.exe"') <
            s.indexOf('dist\\win-x64\\HadirDesktop.exe'),
    'akar pakej didahulukan supaya PASANG tidak tertukar dengan binaan lama');
});

test('update.ps1 kekal mengutamakan -Sumber dan ada fallback akar pakej', () => {
  const u = rd('desktop/update.ps1');
  assert.ok(u.includes('if ($Sumber) { $Sumber } else'),
    '-Sumber (laluan exe yang telah disahkan aplikasi) mesti kekal diutamakan');
  assert.ok(u.includes('Join-Path $PSScriptRoot "HadirDesktop.exe"'),
    'fallback akar diperlukan bila update.ps1 dijalankan dari folder pemasangan');
});

test('pemakej mengekalkan exe di akar seperti BACA-SAYA dokumentasikan', () => {
  const b = rd('desktop/installer/bina-pemasang.ps1');
  assert.ok(b.includes('Nama = "HadirDesktop.exe"'),
    'pakej meletak HadirDesktop.exe di akar folder (bukan dist\\win-x64)');
  assert.ok(b.includes('HadirDesktop.exe'),
    'guard verifikasi pakej mesti wujud');
  const docs = rd('desktop/installer/BACA-SAYA.md');
  assert.ok(docs.includes('HadirDesktop.exe'),
    'BACA-SAYA.md menyenaraikan HadirDesktop.exe dalam kandungan pakej');
});

test('pakej zip yang dibina (jika ada) mengandungi exe pada nama akar', () => {
  const dist = path.join(root, 'desktop', 'dist');
  if (!fs.existsSync(dist)) return;
  const zips = fs.readdirSync(dist).filter(n => /^HadirDesktop-Pemasang-.*\.zip$/.test(n));
  if (!zips.length) return;
  const buf = fs.readFileSync(path.join(dist, zips[0]));
  assert.ok(buf.includes(Buffer.from('HadirDesktop.exe')),
    'zip pemasang mesti mengandungi entri HadirDesktop.exe');
});
