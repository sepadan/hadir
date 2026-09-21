// Tetapan tempatan bukan rahsia (companion/src/tetapan.mjs).
// Disimpan sebagai JSON biasa di %LOCALAPPDATA%/HADIR-MOEIS-Companion/tetapan.json
// (atau --data-dir semasa ujian). Rahsia TIDAK PERNAH disimpan di sini — lihat
// simpanan.mjs untuk storan disulit DPAPI.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

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
  // Selang giliran lalai 90 saat. Setiap kitaran = satu POST ke Apps Script.
  // Selang 20 saat (180 permintaan/jam) pernah mencetuskan sekatan sementara
  // Google pada titik pemulangan data untuk IP PC itu; kehadiran tidak perlu
  // diproses dalam beberapa detik, jadi 90 saat lebih selamat dan tetap pantas.
  intervalSaat: 90,
  autostart: false,
  // Dua suis berasingan: `autostart` ialah warisan paparan sahaja (keadaan
  // sebenar sentiasa ditanya daripada HKCU); autoMulaGiliran ialah opt-in
  // tempatan dan gagal tertutup tanpa allowlist tarikh sekolah tepat.
  autoMulaGiliran: false,
  kalendarSekolah: [],
  autoMulaDiaktifkanPada: '',
  // Log masuk idMe AUTOMATIK — opt-in BERASINGAN daripada autoMulaGiliran.
  // Lalai MATI. Apabila ON, companion cuba log masuk idMe sendiri (maks 2
  // cubaan/proses) menggunakan kredensial dalam vault DPAPI tempatan, dan
  // hanya jika frasa kunci keselamatan padan serta tiada CAPTCHA/OTP/2FA.
  loginAuto: false,
  // Opt-in BERASINGAN daripada loginAuto: apabila HIDUP, log masuk automatik
  // diteruskan WALAUPUN frasa "Kata Kunci Keselamatan" tidak dapat dibaca
  // sebagai teks (dipaparkan sebagai imej). Lalai MATI. Perlindungan kemudian
  // bergantung SEPENUHNYA pada semakan HTTPS+hos idMe yang ketat dan kotak
  // semak pengesahan — frasa imej TIDAK PERNAH di-OCR/diteka.
  benarkanTerusTanpaFrasa: false,
  // Penjaga sesi (keep-alive) idMe/MOEIS — opt-in BERASINGAN, lalai MATI.
  // Apabila ON, companion menyentuh sesi MOEIS secara berkala (siasatan
  // baca-sahaja uji-login, TIADA kredensial) semasa giliran AKTIF supaya sesi
  // tidak luput di tengah baris tugasan. Ini ialah HALA TUJU yang diluluskan
  // pemilik, tetapi keberkesanannya BELUM dibuktikan: "luput ~15-20 minit"
  // ialah pemerhatian, BUKAN masa tamat tetap yang diukur, dan sama ada poke
  // sebenarnya menghalang luput belum disahkan terhadap idMe hidup. Lalai
  // MATI (gagal tertutup) sehingga ujian hidup membuktikannya.
  jagaSesi: false,
  // Had kadar log masuk automatik BERTERUSAN — opt-in BERASINGAN, lalai MATI.
  // Apabila HIDUP, menggantikan had ASAL "2 cubaan per proses" dengan siling
  // KADAR PERSISTEN merentas restart DAN merentas hari (had-login.mjs,
  // buatHadKadarLogin): 6 cubaan/jam gelongsor, siling harian 24 (TIDAK
  // dikosongkan oleh kejayaan), berhenti serta-merta selepas 3 kegagalan
  // berturut-turut. Kelulusan pemilik 2026-09-21. Apabila MATI, had ASAL 2
  // cubaan per proses (kaunter dalam ingatan) kekal digunakan.
  hadKadarLogin: false,
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
    if (!Number.isFinite(gabungan.intervalSaat) || gabungan.intervalSaat < 30) gabungan.intervalSaat = 30;
    gabungan.originDibenarkan = sahkanSenaraiOrigin(gabungan.originDibenarkan);
    gabungan.autoMulaGiliran = gabungan.autoMulaGiliran === true;
    gabungan.loginAuto = gabungan.loginAuto === true;
    gabungan.benarkanTerusTanpaFrasa = gabungan.benarkanTerusTanpaFrasa === true;
    gabungan.jagaSesi = gabungan.jagaSesi === true;
    gabungan.hadKadarLogin = gabungan.hadKadarLogin === true;
    gabungan.kalendarSekolah = sahkanKalendarSekolah(gabungan.kalendarSekolah);
    if (!masaIsoSah(gabungan.autoMulaDiaktifkanPada)) gabungan.autoMulaDiaktifkanPada = '';
    return gabungan;
  } catch {
    return { ...TETAPAN_LALAI };
  }
}

function masaIsoSah(nilai) {
  return typeof nilai === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(nilai) && Number.isFinite(Date.parse(nilai));
}

function tarikhIsoTepatSah(nilai) {
  if (typeof nilai !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(nilai)) return false;
  const [tahun, bulan, hari] = nilai.split('-').map(Number);
  const d = new Date(Date.UTC(tahun, bulan - 1, hari));
  return d.getUTCFullYear() === tahun && d.getUTCMonth() + 1 === bulan && d.getUTCDate() === hari;
}

// Allowlist tarikh TEPAT, bukan julat dan bukan senarai cuti. Jika satu entri
// rosak, keseluruhan allowlist dikosongkan supaya kesilapan tidak membuka hari
// yang tidak dimaksudkan.
export function sahkanKalendarSekolah(senarai) {
  if (!Array.isArray(senarai) || !senarai.length) return [];
  const bersih = senarai.map((x) => String(x || '').trim());
  if (bersih.some((x) => !tarikhIsoTepatSah(x))) return [];
  return [...new Set(bersih)].sort();
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

// Pembaca JSON KETAT untuk fail yang keselamatannya bergantung pada
// "gagal tertutup". `bacaJson` biasa menelan SEMUA ralat (fail hilang DAN
// JSON rosak) dan memulangkan `lalai` — untuk had kadar log masuk itu
// bermakna fail yang rosak dianggap "larian pertama" dan siling kadar
// DISET SEMULA secara senyap. Di sini:
//   - fail TIADA (ENOENT) -> `null` (larian pertama, dibenarkan);
//   - fail ADA tetapi tidak boleh dibaca/dihuraikan -> MELONTAR (isyarat
//     BLOK kepada pemanggil, bukan sifar).
export function bacaJsonKetat(dirData, nama) {
  const laluan = path.join(dirData, nama);
  let teks;
  try {
    teks = fs.readFileSync(laluan, 'utf8');
  } catch (ralat) {
    if (ralat && ralat.code === 'ENOENT') return null;
    throw ralat;
  }
  const nilai = JSON.parse(teks); // JSON rosak -> MELONTAR (sengaja)
  return nilai && typeof nilai === 'object' ? nilai : null;
}

export function tulisJsonAtomik(dirData, nama, objek) {
  fs.mkdirSync(dirData, { recursive: true });
  const laluan = path.join(dirData, nama);
  const sementara = laluan + '.tmp-' + process.pid + '-' + Date.now();
  fs.writeFileSync(sementara, JSON.stringify(objek, null, 2), 'utf8');
  fs.renameSync(sementara, laluan);
}

// ID enjin yang STABIL merentasi restart proses (disimpan di id-enjin.json).
// Digunakan sebagai `pemilik` klaim MOEIS supaya enjin yang dimulakan semula
// (crash/restart OS/autostart) masih dikenali sebagai pemilik SAMA bagi
// tugasan 'sedang_dihantar' yang ditinggalkan proses sebelumnya — ini
// membolehkan pemulihan klaim SEGERA (heartbeat pemilik sama, baris 940 di
// hadirMoeisJobKlaim_) tanpa menunggu lease 15 minit luput. Nilai ialah UUID
// rawak tempatan: bukan rahsia, bukan cap jari perkakasan, dan stabil hanya
// dalam folder data PC itu.
export function bacaAtauCiptaIdEnjin(dirData) {
  const sedia = bacaJson(dirData, 'id-enjin.json', null);
  const id = sedia && typeof sedia.id === 'string' && sedia.id.length >= 8 ? sedia.id : '';
  if (id) return id;
  const baharu = crypto.randomUUID();
  tulisJsonAtomik(dirData, 'id-enjin.json', { id: baharu, dicipta: new Date().toISOString() });
  return baharu;
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
export const MEDAN_TETAPAN_LOKAL_DIBENARKAN = [
  'apiUrl', 'label', 'intervalSaat', 'kunciKeselamatanDijangka',
  'autoMulaGiliran', 'kalendarSekolah', 'loginAuto', 'benarkanTerusTanpaFrasa',
  'jagaSesi', 'hadKadarLogin'
];

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
