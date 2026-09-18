#!/usr/bin/env node
// Ujian asap E2E TEMPATAN companion (companion/tests/asap-e2e.mjs).
//
// Menjalankan pelayan companion SEBENAR sebagai proses anak dengan direktori
// data sementara, kemudian memeriksa gelung keselamatan melalui HTTP loopback
// mentah (supaya header Host/Origin boleh dikawal). Ia menggunakan storan
// DPAPI SEBENAR (platform Windows) tetapi:
//
//   * TIADA pelayar dilancarkan (playwright-core sengaja tidak dipasang di sini)
//   * TIADA rangkaian luar — hanya 127.0.0.1, dan tiada rahsia enjin ditetapkan
//     supaya setiap laluan yang memanggil HADIR/Apps Script gagal tertutup
//   * TIADA data murid/nama/IC sebenar
//
// Guna: node tests/asap-e2e.mjs      (dari folder companion/)
// Keluar 0 jika semua pemeriksaan lulus, 1 jika tidak.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.join(HERE, '..');
const ORIGIN = 'https://sepadan.github.io';
const JSONCT = { 'Content-Type': 'application/json' };

const hasil = [];
let gagal = 0;
function sah(nama, syarat, bukti) {
  hasil.push({ nama, lulus: !!syarat, bukti: bukti === undefined ? '' : String(bukti).slice(0, 200) });
  if (!syarat) gagal++;
}

function portBebas() {
  return new Promise((selesai) => {
    const s = http.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => selesai(p));
    });
  });
}

function minta(port, { method = 'GET', laluan = '/', host, headers = {}, badan = null }) {
  return new Promise((selesai) => {
    const req = http.request({ host: '127.0.0.1', port, path: laluan, method,
      headers: { Host: host || `127.0.0.1:${port}`, ...headers } }, (res) => {
      const bahagian = [];
      res.on('data', (c) => bahagian.push(c));
      res.on('end', () => {
        const teks = Buffer.concat(bahagian).toString('utf8');
        let json = null;
        try { json = teks ? JSON.parse(teks) : null; } catch { /* bukan JSON */ }
        selesai({ status: res.statusCode, headers: res.headers, teks, json });
      });
    });
    req.on('error', (e) => selesai({ status: 0, headers: {}, teks: '', json: null, ralatRangkaian: e.code || e.message }));
    if (badan) req.write(badan);
    req.end();
  });
}

const dirData = fs.mkdtempSync(path.join(os.tmpdir(), 'hadir-asap-'));
const port = await portBebas();
fs.writeFileSync(path.join(dirData, 'tetapan.json'), JSON.stringify({
  port, label: 'PC Ujian', intervalSaat: 20, autostart: false, originDibenarkan: [ORIGIN]
}), 'utf8');

const anak = spawn(process.execPath, [path.join(AKAR, 'bin', 'hadir-companion.mjs'), 'serve', '--data-dir', dirData],
  { stdio: ['ignore', 'pipe', 'pipe'] });
let keluaran = '';
anak.stdout.on('data', (c) => { keluaran += String(c); });
anak.stderr.on('data', (c) => { keluaran += String(c); });

function tungguNonce(hadMs = 30000) {
  return new Promise((selesai, tolak) => {
    const mula = Date.now();
    const semak = setInterval(() => {
      const m = keluaran.match(/\?n=([0-9a-f]+)/);
      if (m) { clearInterval(semak); selesai(m[1]); return; }
      if (Date.now() - mula > hadMs) { clearInterval(semak); tolak(new Error('Pelayan tidak memulakan dirinya dalam ' + hadMs + 'ms: ' + keluaran.slice(0, 300))); }
    }, 200);
  });
}

let nonce = null;
let ralatPersediaan = '';
try {
  nonce = await tungguNonce();
} catch (ralat) {
  ralatPersediaan = ralat.message;
}

try {
  sah('pelayan companion bermula dan memaparkan nonce UI tempatan', !!nonce, ralatPersediaan || 'ok');

  // --- FASA A: empangan nonce UI tempatan ---
  let r = await minta(port, { laluan: '/' });
  sah('GET / tanpa nonce -> 403', r.status === 403, r.status);
  r = await minta(port, { laluan: '/?n=' + nonce });
  sah('GET /?n=<nonce> -> 200 HTML tetapan tempatan', r.status === 200 && /Tetapan tempatan/.test(r.teks), r.status);
  r = await minta(port, { laluan: '/lokal.js?n=salah' });
  sah('GET /lokal.js nonce salah -> 403', r.status === 403, r.status);
  r = await minta(port, { laluan: '/lokal.js?n=' + nonce });
  sah('GET /lokal.js?n=<nonce> -> 200 JS', r.status === 200 && /X-HADIR-Lokal/.test(r.teks), r.status);
  r = await minta(port, { method: 'POST', laluan: '/api/lokal/kod-pasangan', headers: JSONCT, badan: '{}' });
  sah('POST /api/lokal/* tanpa header nonce -> 403 (query nonce tidak mencukupi)', r.status === 403, r.status);
  r = await minta(port, { method: 'POST', laluan: '/api/lokal/rahsia', headers: JSONCT, badan: JSON.stringify({ rahsiaEnjin: 'RAHSIA-PALSU-UJIAN' }) });
  sah('POST /api/lokal/rahsia tanpa nonce -> 403 (rahsia tidak boleh dihantar tanpa bukti PC)', r.status === 403, r.status);

  // --- FASA B: Origin/Host/CORS ---
  r = await minta(port, { method: 'POST', laluan: '/api/pair', headers: { ...JSONCT, Origin: 'https://jahat.example' }, badan: JSON.stringify({ kod: 'AAAAAAAA' }) });
  sah('Origin tidak dibenarkan -> 403 tanpa ACAO', r.status === 403 && !r.headers['access-control-allow-origin'], r.status);
  r = await minta(port, { method: 'OPTIONS', laluan: '/api/status', headers: { Origin: 'https://jahat.example', 'Access-Control-Request-Method': 'GET' } });
  sah('preflight Origin tidak dibenarkan -> 403 tanpa ACAO', r.status === 403 && !r.headers['access-control-allow-origin'], r.status);
  r = await minta(port, { method: 'OPTIONS', laluan: '/api/status', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' } });
  sah('preflight Origin dibenarkan -> 204 ACAO tepat + Vary + Private-Network',
    r.status === 204 && r.headers['access-control-allow-origin'] === ORIGIN && r.headers['vary'] === 'Origin' && r.headers['access-control-allow-private-network'] === 'true',
    r.status + ' acao=' + r.headers['access-control-allow-origin']);
  r = await minta(port, { laluan: '/api/status', host: 'jahat.example', headers: { Origin: ORIGIN, Authorization: 'Bearer x' } });
  sah('Host header bukan loopback -> 403 (anti DNS-rebinding)', r.status === 403, r.status);
  r = await minta(port, { method: 'POST', laluan: '/api/pair', headers: { ...JSONCT, Origin: 'null' }, badan: JSON.stringify({ kod: 'AAAAAAAA' }) });
  sah('Origin "null" ditolak -> 403', r.status === 403, r.status);

  // --- FASA C: pasangan ---
  r = await minta(port, { method: 'POST', laluan: '/api/lokal/kod-pasangan', headers: { ...JSONCT, 'X-HADIR-Lokal': nonce }, badan: '{}' });
  const kod = r.json?.kod;
  sah('kod pasangan dijana melalui UI tempatan (8 aksara)', r.status === 200 && /^[0-9A-F]{8}$/.test(kod || ''), r.status);
  r = await minta(port, { method: 'POST', laluan: '/api/pair', headers: { ...JSONCT, Origin: ORIGIN }, badan: JSON.stringify({ kod: 'ZZZZZZZZ' }) });
  sah('kod salah -> 401', r.status === 401, r.status + ' ' + (r.json?.ralat || ''));
  r = await minta(port, { method: 'POST', laluan: '/api/pair', headers: { ...JSONCT, Origin: ORIGIN }, badan: JSON.stringify({ kod, label: 'PC Ujian' }) });
  const token = r.json?.token;
  sah('pasangan dengan kod betul -> 200 + token 64 aksara', r.status === 200 && typeof token === 'string' && token.length === 64, r.status + ' ' + (r.json?.ralat || ''));
  r = await minta(port, { method: 'POST', laluan: '/api/pair', headers: { ...JSONCT, Origin: ORIGIN }, badan: JSON.stringify({ kod, label: 'guna semula' }) });
  sah('kod pasangan sekali guna', r.status === 401, r.status);

  // --- FASA D: endpoint admin dengan token sah ---
  const auth = { Origin: ORIGIN, Authorization: 'Bearer ' + token };
  r = await minta(port, { laluan: '/api/status', headers: auth });
  sah('GET /api/status -> 200', r.status === 200 && r.json?.ok === true, r.status + ' ' + (r.json?.ralat || ''));
  sah('status: rahsiaEnjin tidak pernah dihantar, hanya boolean adaRahsiaEnjin=false',
    r.json?.adaRahsiaEnjin === false && !/RAHSIA-PALSU/.test(r.teks), 'adaRahsiaEnjin=' + r.json?.adaRahsiaEnjin);
  sah('status: klaimDisokong=null (jujur — tidak dapat ditentukan tanpa rahsia)',
    r.json?.giliran?.klaimDisokong === null, 'klaimDisokong=' + JSON.stringify(r.json?.giliran?.klaimDisokong));
  sah('status: senarai klien berlabel, tiada hashToken',
    Array.isArray(r.json?.pasangan) && r.json.pasangan.length === 1 && !/hashToken/.test(JSON.stringify(r.json.pasangan)), 'ok');
  sah('status: giliran MATI secara lalai (default OFF)', r.json?.giliran?.aktif === false, 'aktif=' + r.json?.giliran?.aktif);
  // Penemuan semakan bebas: /api/status TIDAK BOLEH memicu pelancaran Edge
  // atau panggilan keluar. Pada pemulaan bersih tiada cache sesi, jadi status
  // mesti melaporkan "belum diperiksa" — bukan melancarkan pelayar.
  sah('/api/status tidak memicu pemeriksaan pelayar (cache kosong = belumDiperiksa)',
    r.json?.moeis?.belumDiperiksa === true && r.json?.moeis?.sesiAda === null,
    JSON.stringify(r.json?.moeis));
  r = await minta(port, { method: 'POST', laluan: '/api/tetapan', headers: { ...auth, ...JSONCT }, badan: JSON.stringify({ kataLaluan: 'jangan-terima' }) });
  sah('/api/tetapan menolak medan kata laluan -> 400', r.status === 400, r.status);
  r = await minta(port, { method: 'POST', laluan: '/api/tetapan', headers: { ...auth, ...JSONCT }, badan: JSON.stringify({ autostart: true }) });
  sah('/api/tetapan menolak autostart (opt-in hanya melalui UI tempatan)', r.status === 200 && r.json?.tetapan?.autostart === false, JSON.stringify(r.json?.tetapan?.autostart));
  // Sempadan kepercayaan: klien jauh TIDAK boleh meluaskan allowlist Origin,
  // mengalihkan apiUrl (rahsia enjin dihantar ke situ), atau menetapkan frasa
  // kunci keselamatan idMe.
  r = await minta(port, { method: 'POST', laluan: '/api/tetapan', headers: { ...auth, ...JSONCT }, badan: JSON.stringify({ originDibenarkan: ['https://jahat.example'] }) });
  sah('/api/tetapan menolak originDibenarkan daripada klien jauh -> 400', r.status === 400, r.status + ' ' + (r.json?.ralat || ''));
  r = await minta(port, { method: 'POST', laluan: '/api/tetapan', headers: { ...auth, ...JSONCT }, badan: JSON.stringify({ apiUrl: 'https://jahat.example/exec' }) });
  sah('/api/tetapan menolak apiUrl daripada klien jauh -> 400 (anti eksfiltrasi rahsia)', r.status === 400, r.status + ' ' + (r.json?.ralat || ''));
  r = await minta(port, { method: 'POST', laluan: '/api/tetapan', headers: { ...auth, ...JSONCT }, badan: JSON.stringify({ kunciKeselamatanDijangka: 'apa-apa' }) });
  sah('/api/tetapan menolak kunciKeselamatanDijangka daripada klien jauh -> 400', r.status === 400, r.status);
  r = await minta(port, { method: 'POST', laluan: '/api/pair', headers: { ...JSONCT, Origin: 'https://jahat.example' }, badan: JSON.stringify({ kod: 'AAAAAAAA' }) });
  sah('Origin yang cuba ditambah gagal masih DITOLAK (allowlist tidak berubah)', r.status === 403 && !r.headers['access-control-allow-origin'], r.status);
  r = await minta(port, { method: 'POST', laluan: '/api/lokal/tetapan', headers: { ...JSONCT, 'X-HADIR-Lokal': nonce }, badan: JSON.stringify({ apiUrl: 'https://jahat.example/exec' }) });
  sah('UI tempatan menolak apiUrl hos asing -> 400', r.status === 400, r.status + ' ' + (r.json?.ralat || ''));
  r = await minta(port, { method: 'POST', laluan: '/api/lokal/tetapan', headers: { ...JSONCT, 'X-HADIR-Lokal': nonce }, badan: JSON.stringify({ originDibenarkan: ['https://jahat.example'] }) });
  sah('UI tempatan juga tidak boleh mengubah originDibenarkan melalui HTTP -> 400', r.status === 400, r.status);
  r = await minta(port, { method: 'POST', laluan: '/api/mula', headers: { ...auth, ...JSONCT }, badan: '{}' });
  sah('/api/mula tanpa rahsia enjin -> 409 gagal tertutup', r.status === 409, r.status + ' ' + (r.json?.ralat || ''));
  r = await minta(port, { method: 'POST', laluan: '/api/kerja-jalan', headers: { ...auth, ...JSONCT }, badan: JSON.stringify({ id: 'x' }) });
  sah('/api/kerja-jalan tanpa sah:true -> 400', r.status === 400, r.status);
  r = await minta(port, { method: 'POST', laluan: '/api/kerja-sah', headers: { ...auth, ...JSONCT }, badan: JSON.stringify({ id: 'x', sah: true }) });
  sah('/api/kerja-sah tanpa rahsia -> 409 sebelum sebarang panggilan keluar', r.status === 409, r.status + ' ' + (r.json?.ralat || ''));
  r = await minta(port, { method: 'POST', laluan: '/api/autostart', headers: { ...auth, ...JSONCT }, badan: JSON.stringify({ aktif: true }) });
  sah('/api/autostart tanpa sah:true -> 400 (opt-in eksplisit)', r.status === 400, r.status);
  r = await minta(port, { method: 'GET', laluan: '/api/kerja', headers: auth });
  sah('GET /api/kerja -> 200 senarai kosong + nota (tiada panggilan keluar)',
    r.status === 200 && Array.isArray(r.json?.senarai) && r.json.senarai.length === 0, r.status);
  r = await minta(port, { method: 'POST', laluan: '/api/uji-login', headers: { ...auth, ...JSONCT }, badan: '{}' });
  sah('/api/uji-login tanpa playwright-core -> JSON gagal tertutup (TIADA pelayar dilancarkan)',
    r.status === 200 && r.json?.ok === true && typeof r.json?.status === 'string', r.status + ' status=' + (r.json?.status || ''));
  r = await minta(port, { method: 'POST', laluan: '/api/tiada', headers: { ...auth, ...JSONCT }, badan: '{}' });
  sah('laluan tidak dikenali -> 404', r.status === 404, r.status);
  r = await minta(port, { method: 'POST', laluan: '/api/tetapan', headers: { ...auth, ...JSONCT }, badan: 'x'.repeat(40000) });
  sah('badan terlalu besar -> 413 atau sambungan ditutup', r.status === 413 || r.ralatRangkaian === 'ECONNRESET', r.status + ' ' + (r.ralatRangkaian || ''));

  // --- FASA D2: TIADA fail kredensial teks biasa selepas aliran sebenar ---
  // Ini ujian TINGKAH LAKU sebenar pada cakera (bukan imbas kod sumber):
  // selepas pemasangan pasangan + rahsia disimpan, direktori data tidak boleh
  // mengandungi fail kuki/sesi/storageState dalam bentuk teks biasa.
  const senaraiFail = (fungsi) => {
    const hasil = [];
    const jelajah = (dir, awalan) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = awalan + e.name;
        if (e.isDirectory()) { if (e.name !== 'profil-pelayar') jelajah(path.join(dir, e.name), rel + '/'); }
        else hasil.push(rel);
      }
    };
    try { jelajah(dirData, ''); } catch { /* direktori sementara diabaikan */ }
    return hasil;
  };
  const failNyata = senaraiFail();
  // Nota: `status-sesi.json` ialah cache bukan-rahsia (status sesi ada/tiada +
  // masa) yang disemak berasingan di bawah — ia BUKAN fail kuki.
  const dilarang = failNyata.filter((f) => /(?<!status-)sesi\.json|storageState|cookies?\.(json|txt)|auth[\/-]state\.json|kredensial/i.test(f));
  sah('tiada fail kuki/sesi teks biasa ditulis (ujian tingkah laku cakera)',
    dilarang.length === 0, JSON.stringify(dilarang));
  sah('fail yang ada hanyalah keadaan tempatan yang dijangka',
    failNyata.every((f) => /^(tetapan\.json|rahsia\.dat|status-sesi\.json|log\/)/.test(f)),
    JSON.stringify(failNyata));
  // rahsia.dat mesti disulit (bukan JSON teks biasa).
  const mentahRahsia = fs.readFileSync(path.join(dirData, 'rahsia.dat'));
  sah('rahsia.dat disulit DPAPI (bukan JSON teks biasa)',
    mentahRahsia.length > 0 && !/[{]/.test(mentahRahsia.toString('utf8', 0, 1)), 'bait pertama=' + mentahRahsia[0]);
  // Cache status sesi TIDAK BOLEH mengandungi kuki/token (jika ia wujud —
  // ia hanya ditulis selepas pemeriksaan sesi sebenar berjaya).
  const laluanCacheSesi = path.join(dirData, 'status-sesi.json');
  if (fs.existsSync(laluanCacheSesi)) {
    const cacheSesi = JSON.parse(fs.readFileSync(laluanCacheSesi, 'utf8'));
    sah('status-sesi.json tidak membawa kuki/token', !/token|cookie|sesi=/i.test(JSON.stringify(cacheSesi)), JSON.stringify(cacheSesi));
  } else {
    sah('status-sesi.json tidak ditulis oleh /api/status (tiada pemeriksaan pelayar)', true, 'tiada fail');
  }

  // --- FASA E: sekatan kadar auth (terakhir, ia mengunci diri) ---
  let terakhir = null;
  for (let i = 0; i < 14; i++) terakhir = await minta(port, { laluan: '/api/status', headers: { Origin: ORIGIN, Authorization: 'Bearer salah-' + i } });
  sah('kegagalan auth berturut-turut -> 429', terakhir.status === 429, terakhir.status);
} finally {
  anak.kill();
  try { fs.rmSync(dirData, { recursive: true, force: true }); } catch { /* ACL icacls boleh menghalang padam; bukan kegagalan ujian */ }
}

const lulus = hasil.filter((h) => h.lulus).length;
console.log('Ujian asap E2E companion: ' + lulus + '/' + hasil.length + ' lulus, ' + gagal + ' gagal');
for (const h of hasil) {
  if (!h.lulus) console.log('  GAGAL: ' + h.nama + ' | ' + h.bukti);
}
if (process.env.ASAP_VERBOSE === '1') {
  for (const h of hasil) console.log((h.lulus ? '  OK   ' : '  GAGAL ') + h.nama + (h.bukti ? ' | ' + h.bukti : ''));
}
process.exit(gagal ? 1 : 0);
