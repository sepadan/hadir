// Tetapan tempatan bukan rahsia (companion/src/tetapan.mjs).
// Disimpan sebagai JSON biasa di %LOCALAPPDATA%/HADIR-MOEIS-Companion/tetapan.json
// (atau --data-dir semasa ujian). Rahsia TIDAK PERNAH disimpan di sini — lihat
// simpanan.mjs untuk storan disulit DPAPI.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const NAMA_FOLDER_DATA = 'HADIR-MOEIS-Companion';

export function dapatkanDirData(dataDirOverride) {
  if (dataDirOverride) return dataDirOverride;
  const asas = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(asas, NAMA_FOLDER_DATA);
}

// apiUrl lalai ialah URL deployment Apps Script HADIR yang sama seperti
// config.js (bukan rahsia — URL awam sedia ada di repo), supaya companion
// boleh diuji sambungan serta-merta tanpa admin perlu menaip URL dahulu.
export const TETAPAN_LALAI = Object.freeze({
  port: 8747,
  apiUrl: 'https://script.google.com/macros/s/AKfycbzqppwOPHQZz7dZe9OW3Hbhf1nA5wdfqBeQUUXmOxrt1ILDezw_HsLE4wgpbKMt8hbe/exec',
  label: '',
  intervalSaat: 20,
  autostart: false,
  // Frasa "kunci keselamatan" anti-pancing idMe yang admin jangkakan dilihat
  // semasa log masuk (pilihan, bukan rahsia — nilai ini hanya untuk banding
  // paparan, bukan kelayakan). Kosong bermakna tiada jangkaan; uji-login
  // pulangkan kunci:'tiada'.
  kunciKeselamatanDijangka: '',
  originDibenarkan: ['https://sepadan.github.io']
});

function laluanTetapan(dirData) {
  return path.join(dirData, 'tetapan.json');
}

export function bacaTetapan(dirData) {
  const laluan = laluanTetapan(dirData);
  if (!fs.existsSync(laluan)) return { ...TETAPAN_LALAI };
  try {
    const mentah = JSON.parse(fs.readFileSync(laluan, 'utf8'));
    const gabungan = { ...TETAPAN_LALAI, ...mentah };
    if (!Number.isFinite(gabungan.intervalSaat) || gabungan.intervalSaat < 10) gabungan.intervalSaat = 10;
    gabungan.originDibenarkan = sahkanSenaraiOrigin(gabungan.originDibenarkan);
    return gabungan;
  } catch {
    return { ...TETAPAN_LALAI };
  }
}

// Setiap entri allowlist Origin mesti Origin HTTPS yang sah tanpa laluan/nama
// pengguna (penemuan semakan bebas: JANGAN percaya fail tetapan secara membuta).
// Entri yang tidak sah dibuang; senarai kosong kembali kepada lalai yang ketat.
export function sahkanSenaraiOrigin(senarai) {
  const bersih = (Array.isArray(senarai) ? senarai : [])
    .map((x) => String(x || '').trim())
    .filter((x) => {
      if (!x || x === '*') return false;
      let u;
      try { u = new URL(x); } catch { return false; }
      return u.protocol === 'https:' && !u.username && !u.password &&
        (u.pathname === '/' || u.pathname === '') && !u.search && !u.hash &&
        x === u.origin;
    });
  return bersih.length ? bersih : [...TETAPAN_LALAI.originDibenarkan];
}

// Tulis atomik: tulis ke fail sementara dalam direktori yang sama, kemudian
// rename (operasi atomik pada NTFS) supaya proses lain tidak pernah membaca
// fail separuh tertulis.
export function tulisTetapanAtomik(dirData, tetapanBaharu) {
  fs.mkdirSync(dirData, { recursive: true });
  const laluan = laluanTetapan(dirData);
  const sementara = laluan + '.tmp-' + process.pid + '-' + Date.now();
  fs.writeFileSync(sementara, JSON.stringify(tetapanBaharu, null, 2), 'utf8');
  fs.renameSync(sementara, laluan);
}

// JSON kecil bukan rahsia (cth cache status sesi) dengan tulis atomik.
export function bacaJson(dirData, nama, lalai) {
  try {
    const teks = fs.readFileSync(path.join(dirData, nama), 'utf8');
    const nilai = JSON.parse(teks);
    return nilai && typeof nilai === 'object' ? nilai : lalai;
  } catch {
    return lalai;
  }
}

export function tulisJsonAtomik(dirData, nama, objek) {
  fs.mkdirSync(dirData, { recursive: true });
  const laluan = path.join(dirData, nama);
  const sementara = laluan + '.tmp-' + process.pid + '-' + Date.now();
  fs.writeFileSync(sementara, JSON.stringify(objek, null, 2), 'utf8');
  fs.renameSync(sementara, laluan);
}

// Medan yang tidak boleh sekali-kali diterima oleh POST /api/tetapan — rahsia
// hanya melalui UI tempatan (/api/lokal/rahsia), tidak pernah melalui endpoint
// admin biasa.
export const MEDAN_RAHSIA_DILARANG = ['katalaluan', 'password', 'pin', 'rahsia', 'token'];

export function adaMedanRahsiaDilarang(payload) {
  return Object.keys(payload || {}).some((k) => MEDAN_RAHSIA_DILARANG.includes(k.toLowerCase()));
}

// Medan tetapan yang dibenarkan ditulis oleh klien JAUH (/api/tetapan, token
// Bearer daripada HADIR Admin). Sengaja SANGAT sempit:
//
//   * `originDibenarkan` TIDAK dibenarkan — klien jauh tidak boleh meluaskan
//     sempadan kepercayaannya sendiri (memasukkan Origin penyerang ke
//     allowlist). Ia hanya diubah dengan menyunting tetapan.json pada PC.
//   * `apiUrl` TIDAK dibenarkan — menukarnya membolehkan pemegang token
//     mengalihkan rahsia enjin (dihantar pada setiap panggilan RPC) ke hos
//     penyerang. Ini juga hanya ditetapkan pada PC.
//   * `kunciKeselamatanDijangka` TIDAK dibenarkan — ia menyemak paparan
//     anti-pancing idMe; klien jauh tidak boleh menetapkan nilai yang
//     meluluskan pemeriksaan itu.
export const MEDAN_TETAPAN_DIBENARKAN = ['label', 'intervalSaat'];

export function tapisTetapanDibenarkan(payload) {
  const hasil = {};
  for (const k of MEDAN_TETAPAN_DIBENARKAN) {
    if (Object.prototype.hasOwnProperty.call(payload || {}, k)) hasil[k] = payload[k];
  }
  return hasil;
}

// Medan yang boleh ditulis dari UI tempatan (/api/lokal/tetapan) — hanya
// seseorang yang berada di depan PC (bukti: nonce) boleh menetapkan hos
// backend dan frasa kunci keselamatan idMe. `originDibenarkan` tetap TIDAK
// boleh diubah melalui HTTP langsung; ia hanya daripada fail tetapan.json.
export const MEDAN_TETAPAN_LOKAL_DIBENARKAN = ['apiUrl', 'label', 'intervalSaat', 'kunciKeselamatanDijangka'];

// Hos Apps Script yang sah untuk apiUrl. Tanpa ini, apiUrl yang salah tulis
// (atau berniat jahat) boleh menghantar rahsia enjin ke hos lain.
export const HOS_API_DIBENARKAN = ['script.google.com', 'script.googleusercontent.com'];

export function sahkanApiUrl(nilai) {
  let u;
  try { u = new URL(String(nilai || '')); } catch { return { ok: false, sebab: 'apiUrl bukan URL sah.' }; }
  if (u.protocol !== 'https:') return { ok: false, sebab: 'apiUrl mesti HTTPS.' };
  if (u.username || u.password) return { ok: false, sebab: 'apiUrl tidak boleh mengandungi userinfo.' };
  if (!HOS_API_DIBENARKAN.includes(u.hostname.toLowerCase())) {
    return { ok: false, sebab: 'Hos apiUrl mesti salah satu daripada: ' + HOS_API_DIBENARKAN.join(', ') };
  }
  return { ok: true, url: u.toString() };
}

export function tapisTetapanLokalDibenarkan(payload) {
  const hasil = {};
  for (const k of MEDAN_TETAPAN_LOKAL_DIBENARKAN) {
    if (Object.prototype.hasOwnProperty.call(payload || {}, k)) hasil[k] = payload[k];
  }
  return hasil;
}
