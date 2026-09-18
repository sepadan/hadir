// Ujian regresi untuk pembetulan penemuan SEMAKAN BEBAS (DeepSeek, 18 Sep 2026).
// Setiap ujian memetakan terus kepada satu penemuan supaya penemuan itu tidak
// boleh kembali secara senyap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { mulakanPelayanUjian, mintaMentah, TOKEN_SAH } from './bantuan-server.mjs';
import { buangIc, adaMedanSensitif } from '../src/moeis/payload.mjs';
import { adalahHosIdMe } from '../src/moeis/sesi.mjs';
import { sahkanSenaraiOrigin, bacaTetapan, bacaJson, tulisJsonAtomik } from '../src/tetapan.mjs';
import { buatLog } from '../src/log.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.join(HERE, '..');
function bacaSrc(rel) { return fs.readFileSync(path.join(AKAR, rel), 'utf8'); }

test('[penemuan 1] log-masuk-manual.mjs tidak menulis storageState/cookie ke fail teks biasa', () => {
  const src = bacaSrc('bin/log-masuk-manual.mjs');
  assert.doesNotMatch(src, /storageState\(/);
  assert.doesNotMatch(src, /sesi\.json/);
  assert.match(src, /sesi-aktif-dalam-profil/);
});

test('[penemuan 1] jalan-push.mjs tidak merujuk storageState sebagai sumber sesi', () => {
  const src = bacaSrc('bin/jalan-push.mjs');
  assert.doesNotMatch(src, /storageState\(/);
  assert.match(src, /profil-pelayar/);
});

test('[penemuan 2] buangIc membuang medan ic tetapi mengekalkan identiti pemadanan', () => {
  const job = {
    id: 'j1', kelas: '4 BIJAK', tarikhIso: '2026-09-18', kelasMoeisId: '',
    murid: [{ ic: '991231015566', nama: 'MURID CONTOH', kategori: 'D', sebab: 'DEMAM' }]
  };
  const bersih = buangIc(job);
  assert.equal(adaMedanSensitif(bersih), false);
  assert.deepEqual(bersih.murid[0], { nama: 'MURID CONTOH', kategori: 'D', sebab: 'DEMAM' });
  assert.equal(bersih.kelas, '4 BIJAK');
  assert.equal(JSON.stringify(bersih).includes('991231015566'), false);
});

test('[penemuan 2] payload kanak-kanak dihantar melalui STDIN, bukan argumen CLI', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hadir-stdin-'));
  const r = spawnSync(process.execPath, [path.join(AKAR, 'bin/jalan-push.mjs'), '--mod', 'baca', '--data-dir', dir], {
    input: '', encoding: 'utf8'
  });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.match(String(r.stderr || ''), /STDIN/);
  assert.equal(r.status, 2);
  // Kod sumber tidak boleh lagi menerima payload melalui argv.
  assert.doesNotMatch(bacaSrc('bin/jalan-push.mjs'), /--job-json/);
  assert.doesNotMatch(bacaSrc('bin/hadir-companion.mjs'), /'--job-json'/);
});

// UJIAN STRUKTUR (bukan tingkah laku): HadirWeb.gs ialah Apps Script (V8 +
// perkhidmatan Google) dan TIDAK boleh dijalankan dalam Node — jadi semakan di
// sini hanya mengesahkan bentuk kod backend. Tingkah laku klien yang
// menghantar `pemilik` diuji secara tingkah laku di bawah.
test('[penemuan 3][STRUKTUR] backend menolak laporan keputusan daripada enjin bukan pemegang klaim', () => {
  const laluanGs = path.join(AKAR, '..', 'apps-script', 'HadirWeb.gs');
  // Dalam artifak mudah alih (dist/*.zip) backend Apps Script tidak disertakan
  // — ia di-deploy berasingan. Langkau dengan jelas, bukan gagal.
  if (!fs.existsSync(laluanGs)) return;
  const gs = fs.readFileSync(laluanGs, 'utf8');
  const blok = gs.match(/function hadirMoeisJobSelesai_\([\s\S]*?\n}/)[0];
  assert.match(blok, /function hadirMoeisJobSelesai_\(id, keputusan, mesej, bilHadirSelepas, pemilik, rahsia\)/);
  assert.match(blok, /pemilikSemasa !== pemilik/);
  assert.match(blok, /statusSemasa !== 'sedang_dihantar'/);
  assert.match(blok, /LockService\.getScriptLock\(\)/);
});

// UJIAN TINGKAH LAKU: klien sebenar mesti menghantar `pemilik` sebagai argumen
// kelima dalam panggilan moeisJobSelesai (dan tidak pernah menghantarnya di
// tempat lain).
test('[penemuan 3][TINGKAH LAKU] klien menghantar pemilik dalam moeisJobSelesai', async () => {
  const { buatKlienHadir } = await import('../src/klien-hadir.mjs');
  let ditangkap = null;
  const fetchPalsu = async (url, opsyen) => {
    ditangkap = JSON.parse(opsyen.body);
    return { status: 200, text: async () => JSON.stringify({ ok: true, hasil: { ok: true } }) };
  };
  const klien = buatKlienHadir({ apiUrl: 'https://contoh.invalid/exec', rahsia: 'rahsia-palsu', fetchImpl: fetchPalsu });
  await klien.selesai('job-1', 'berjaya', 'mesej', 25, 'PC-GURU:1234');
  assert.equal(ditangkap.kaedah, 'moeisJobSelesai');
  assert.deepEqual(ditangkap.argumen, ['job-1', 'berjaya', 'mesej', 25, 'PC-GURU:1234', 'rahsia-palsu']);
});

test('[penemuan 4] sahkanSenaraiOrigin menolak wildcard, http, laluan dan userinfo', () => {
  assert.deepEqual(sahkanSenaraiOrigin(['https://sepadan.github.io']), ['https://sepadan.github.io']);
  for (const jahat of ['*', 'http://sepadan.github.io', 'https://jahat.example/x', 'https://u:p@sepadan.github.io', 'https://sepadan.github.io/#a', 'https://sepadan.github.io/?a=1']) {
    assert.deepEqual(sahkanSenaraiOrigin([jahat]), ['https://sepadan.github.io'], 'patut ditolak: ' + jahat);
  }
  assert.deepEqual(sahkanSenaraiOrigin([]), ['https://sepadan.github.io']);
});

test('[penemuan 4] fail tetapan yang dirosakkan tidak boleh meluaskan allowlist Origin', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hadir-origin-'));
  fs.writeFileSync(path.join(dir, 'tetapan.json'), JSON.stringify({ originDibenarkan: ['*', 'http://jahat.example'] }));
  assert.deepEqual(bacaTetapan(dir).originDibenarkan, ['https://sepadan.github.io']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('[penemuan 8] adalahHosIdMe menolak hos penyerang yang membawa teks idMe', () => {
  assert.equal(adalahHosIdMe('https://idme.moe.gov.my/login'), true);
  for (const jahat of [
    'https://idme.moe.gov.my.evil.com/',
    'https://evil.com/?x=idme.moe.gov.my',
    'http://idme.moe.gov.my/',
    'https://user:pass@idme.moe.gov.my/',
    'https://idme.moe.gov.my:8443/'
  ]) {
    assert.equal(adalahHosIdMe(jahat), false, 'patut ditolak: ' + jahat);
  }
});

test('[penemuan 5] /api/status membaca cache sesi dan TIDAK memicu pemeriksaan pelayar', async () => {
  let adaSesiDipanggil = 0, statusSesiDipanggil = 0;
  const { pelayan, port } = await mulakanPelayanUjian({
    adaSesiMoeis: async () => { adaSesiDipanggil += 1; return true; },
    statusSesiMoeis: async () => { statusSesiDipanggil += 1; return { sesiAda: null, belumDiperiksa: true }; }
  });
  try {
    const ORIGIN = { Origin: 'https://sepadan.github.io' };
    const auth = { ...ORIGIN, Authorization: 'Bearer ' + TOKEN_SAH };
    const r = await mintaMentah(port, { laluan: '/api/status', headers: auth });
    assert.equal(r.status, 200);
    assert.equal(adaSesiDipanggil, 0, 'adaSesiMoeis TIDAK boleh dipanggil semasa /api/status');
    assert.equal(statusSesiDipanggil, 1);
  } finally { pelayan.close(); }
});

test('[penemuan 6] lockout baldi pasangan tidak menyekat token sah', async () => {
  const { pelayan, port } = await mulakanPelayanUjian();
  try {
    const ORIGIN = { Origin: 'https://sepadan.github.io' };
    const JSONCT = { 'Content-Type': 'application/json' };
    for (let i = 0; i < 12; i++) {
      await mintaMentah(port, { method: 'POST', laluan: '/api/pair', headers: { ...ORIGIN, ...JSONCT }, badan: JSON.stringify({ kod: 'AAAABBBB' }) });
    }
    const tersekat = await mintaMentah(port, { method: 'POST', laluan: '/api/pair', headers: { ...ORIGIN, ...JSONCT }, badan: JSON.stringify({ kod: 'AAAABBBB' }) });
    assert.equal(tersekat.status, 429, 'baldi pasangan sendiri mesti disekat');
    const r = await mintaMentah(port, { laluan: '/api/status', headers: { ...ORIGIN, Authorization: 'Bearer ' + TOKEN_SAH } });
    assert.equal(r.status, 200, 'token sah masih diterima walaupun pasangan disekat');
  } finally { pelayan.close(); }
});

test('[penemuan 6] lockout baldi token tidak menyekat pasangan dengan kod betul', async () => {
  const { pelayan, port } = await mulakanPelayanUjian();
  try {
    const ORIGIN = { Origin: 'https://sepadan.github.io' };
    const JSONCT = { 'Content-Type': 'application/json' };
    for (let i = 0; i < 12; i++) {
      await mintaMentah(port, { laluan: '/api/status', headers: { ...ORIGIN, Authorization: 'Bearer salah-' + i } });
    }
    const r = await mintaMentah(port, { method: 'POST', laluan: '/api/pair', headers: { ...ORIGIN, ...JSONCT }, badan: JSON.stringify({ kod: 'ABCD1234' }) });
    assert.equal(r.status, 200, 'pasangan dengan kod betul masih berfungsi selepas lockout token');
  } finally { pelayan.close(); }
});

test('[penemuan 7] klaimDisokong hanya percaya satu jawapan bukti (kod sumber)', () => {
  const src = bacaSrc('bin/hadir-companion.mjs');
  assert.match(src, /Tugasan tidak ditemui/);
  assert.match(src, /Fungsi tidak dibenarkan/);
  assert.doesNotMatch(src, /ETIMEDOUT\|fetch failed/);
});

test('[penemuan 9] heartbeat lease direkod apabila gagal, bukan ditelan senyap', () => {
  const src = bacaSrc('src/giliran.mjs');
  assert.match(src, /LEASE_HEARTBEAT_GAGAL/);
});

// --- Penemuan pusingan 2 (semakan pengesahan) ---

// [SED baharu] Rahsia TIDAK boleh muncul dalam baris arahan powershell.exe:
// skrip melalui STDIN (`-Command -`) dan muatan melalui env proses anak.
test('[pusingan 2][TINGKAH LAKU] DPAPI tidak meletakkan rahsia dalam argv PowerShell', async () => {
  const { protectorDpapiSebenar, ARGV_POWERSHELL } = await import('../src/simpanan.mjs');
  if (process.platform !== 'win32') return;
  let ditangkap = null;
  const spawnPalsu = (bin, argv, opsyen) => {
    ditangkap = { bin, argv, opsyen };
    // Tiru hasil PowerShell: kembalikan base64 yang sama (round-trip palsu).
    return { status: 0, stdout: opsyen.env.HADIR_PS_DATA, stderr: '' };
  };
  const p = protectorDpapiSebenar({ spawnImpl: spawnPalsu });
  const teksRahsia = 'RAHSIA-ENJIN-SANGAT-SULIT-1234567890';
  const hasil = p.lindungi(teksRahsia);
  assert.ok(hasil.length > 0);
  assert.equal(ditangkap.bin, 'powershell.exe');
  assert.deepEqual(ditangkap.argv, ARGV_POWERSHELL);
  assert.equal(ditangkap.argv[ditangkap.argv.length - 1], '-', 'skrip mesti dibaca daripada STDIN');
  const argvTeks = ditangkap.argv.join(' ');
  const b64 = Buffer.from(teksRahsia, 'utf8').toString('base64');
  assert.equal(argvTeks.includes(teksRahsia), false, 'plaintext tidak boleh ada dalam argv');
  assert.equal(argvTeks.includes(b64), false, 'base64 plaintext tidak boleh ada dalam argv');
  assert.match(argvTeks, /-Command -$/);
  // Muatan pergi melalui persekitaran proses anak, dan skrip melalui stdin.
  assert.equal(ditangkap.opsyen.env.HADIR_PS_DATA, b64);
  assert.match(String(ditangkap.opsyen.input), /\$env:HADIR_PS_DATA/);
  assert.equal(String(ditangkap.opsyen.input).includes(b64), false, 'skrip tidak boleh mengandungi muatan');
  const kunciRahsiaDalamEnv = Object.keys(ditangkap.opsyen.env).filter((k) => /RAHSIA-ENJIN/.test(String(ditangkap.opsyen.env[k])));
  assert.equal(kunciRahsiaDalamEnv.length, 0, 'env tidak boleh mengandungi plaintext');
});

// [RENDAH] Penapis lapisan log: IC/emel/token dimask WALAUPUN ditulis mentah
// oleh proses anak. Nama murid TIDAK dimask sepenuhnya (had yang diakui).
test('[pusingan 2][TINGKAH LAKU] log menapis IC/emel/token daripada keluaran anak', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hadir-log-'));
  const log = buatLog({ dirData: dir });
  const mentah = [
    'IC=991231015566 emel=cikgu.ali@moe.gov.my',
    'token=' + 'a'.repeat(64),
    'nama=MURID CONTOH SATU (nama tidak dimask sepenuhnya — had diakui)'
  ].join('\n');
  const laluan = log.tulisKerja('job-1', mentah);
  const ditulis = fs.readFileSync(laluan, 'utf8');
  assert.equal(ditulis.includes('991231015566'), false, 'IC mentah tidak boleh ditulis');
  assert.match(ditulis, /5566/);
  assert.equal(ditulis.includes('cikgu.ali@moe.gov.my'), false, 'emel penuh tidak boleh ditulis');
  assert.equal(ditulis.includes('a'.repeat(64)), false, 'token tidak boleh ditulis mentah');
  // Had yang diakui secara sengaja: nama penuh kekal (bukan dakwaan pembersihan penuh).
  assert.match(ditulis, /MURID CONTOH SATU/);
  log.tulis('mesej ujian 991231015566');
  assert.equal(fs.readFileSync(path.join(log.dirLog, 'companion.log'), 'utf8').includes('991231015566'), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('cache status sesi ditulis secara atomik (tiada fail sementara tertinggal)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hadir-cache-'));
  tulisJsonAtomik(dir, 'status-sesi.json', { masa: Date.now(), sesiAda: true, status: 'sesi-sah' });
  assert.equal(bacaJson(dir, 'status-sesi.json', null).sesiAda, true);
  assert.equal(fs.readdirSync(dir).some((f) => f.includes('.tmp-')), false);
  assert.deepEqual(bacaJson(dir, 'tiada.json', { x: 1 }), { x: 1 });
  fs.rmSync(dir, { recursive: true, force: true });
});
