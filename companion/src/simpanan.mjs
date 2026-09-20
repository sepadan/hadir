// Storan rahsia per-pengguna (companion/src/simpanan.mjs).
// Menyulitkan rahsia.dat dengan DPAPI (Scope CurrentUser) melalui PowerShell
// ProtectedData. TIADA fallback teks biasa — jika protector sebenar tidak
// tersedia (bukan Windows, atau injeksi ujian tiada), storan gagal TERTUTUP:
// buatSimpananRahsia() melontar ralat dan companion tidak boleh bermula.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

function laluanRahsia(dirData) {
  return path.join(dirData, 'rahsia.dat');
}

// Protector DPAPI sebenar. Digunakan hanya pada Windows sebenar; ujian
// menyuntik protector palsu supaya tiada panggilan PowerShell sebenar dibuat.
//
// WAJIB: `Add-Type -AssemblyName System.Security` dimuatkan dahulu. PowerShell
// 5.1 TIDAK memuatkan jenis `[System.Security.Cryptography.ProtectedData]`
// secara automatik — tanpa baris itu setiap panggilan gagal dengan
// "Unable to find type" (ditemui melalui ujian asap E2E sebenar; ujian unit
// dengan protector palsu tidak pernah mendedahkannya).
//
// PENTING (penemuan semakan bebas pusingan 2): data TIDAK boleh dihantar dalam
// baris arahan `powershell.exe`. Skrip dihantar melalui STDIN (`-Command -`)
// dan muatan data melalui pemboleh ubah persekitaran proses anak. Baris arahan
// proses boleh dibaca oleh proses lain pengguna yang sama; blok persekitaran
// tidak dipaparkan oleh Task Manager/WMI. Tiada satu pun panggilan di bawah
// mengandungi rahsia dalam argv.
// Skrip SATU BARIS: `powershell -Command -` melaksanakan input STDIN baris
// demi baris, jadi pernyataan yang dipisahkan kepada dua baris akan gagal
// SECARA SENYAP (status 0, tiada keluaran) — ditemui melalui ujian DPAPI nyata.
// `$ErrorActionPreference='Stop'` + pemeriksaan hasil menjadikan sebarang
// kegagalan senyap itu sebagai ralat sebenar (fail tertutup).
function skripDpapi(operasi) {
  return '$ErrorActionPreference = \'Stop\'; ' +
    'Add-Type -AssemblyName System.Security -ErrorAction SilentlyContinue; ' +
    '$b = [Convert]::FromBase64String($env:HADIR_PS_DATA); ' +
    '$p = [System.Security.Cryptography.ProtectedData]::' + operasi +
    '($b, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser); ' +
    'if (-not $p -or $p.Length -eq 0) { [Console]::Error.Write(\'DPAPI memulangkan nilai kosong.\'); exit 3 }; ' +
    '[Console]::Out.Write([Convert]::ToBase64String($p))';
}

export const SKRIP_LINDUNGI = skripDpapi('Protect');
export const SKRIP_NYAHSLINDUNGI = skripDpapi('Unprotect');

export const ARGV_POWERSHELL = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'];

// `spawnImpl` boleh disuntik oleh ujian supaya argv/env yang sebenarnya
// digunakan boleh diperiksa tanpa menjalankan PowerShell sebenar.
export function jalankanPowershellStdin(skrip, dataB64, spawnImpl) {
  const laksana = spawnImpl || spawnSync;
  const r = laksana('powershell.exe', ARGV_POWERSHELL, {
    input: skrip,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, HADIR_PS_DATA: dataB64 },
    maxBuffer: 4 * 1024 * 1024
  });
  if (!r || r.status !== 0) {
    const mesej = String((r && r.stderr) || (r && r.error && r.error.message) || 'tiada butiran')
      .replace(/\s+/g, ' ').trim().slice(0, 300);
    throw new Error('Panggilan PowerShell DPAPI gagal: ' + mesej);
  }
  const keluaran = String(r.stdout || '').trim();
  // Fail tertutup: status 0 dengan keluaran kosong bermakna skrip tidak
  // menghasilkan apa-apa (pernah berlaku semasa skrip berbilang baris) — itu
  // kegagalan, bukan nilai sah.
  if (!keluaran) throw new Error('Panggilan PowerShell DPAPI memulangkan keluaran kosong.');
  return keluaran;
}

export function protectorDpapiSebenar({ spawnImpl } = {}) {
  if (process.platform !== 'win32') {
    throw new Error('DPAPI hanya tersedia pada Windows; storan rahsia gagal tertutup.');
  }
  return {
    lindungi(teksBiasa) {
      const b64Masuk = Buffer.from(teksBiasa, 'utf8').toString('base64');
      if (!b64Masuk) return Buffer.alloc(0);
      const keluar = jalankanPowershellStdin(SKRIP_LINDUNGI, b64Masuk, spawnImpl);
      return Buffer.from(keluar.trim(), 'base64');
    },
    nyahlindungi(bufferTerlindung) {
      const b64Masuk = bufferTerlindung.toString('base64');
      const keluar = jalankanPowershellStdin(SKRIP_NYAHSLINDUNGI, b64Masuk, spawnImpl);
      return Buffer.from(keluar.trim(), 'base64').toString('utf8');
    }
  };
}

// Ujian kendiri DPAPI sebenar: putar-pusing satu nilai probe. Jika protector
// tidak berfungsi (cth assembly System.Security tidak dapat dimuatkan), ini
// melontar SEKARANG dengan mesej jelas, bukan gagal senyap semasa pasangan
// pertama guru. Dipanggil sekali oleh buatSimpananRahsia pada laluan sebenar.
export function sahkanProtectorBerfungsi(protector) {
  const probe = 'hadir-companion-probe-' + Date.now();
  const terlindung = protector.lindungi(probe);
  if (!terlindung || !terlindung.length) throw new Error('DPAPI memulangkan nilai kosong.');
  const kembali = protector.nyahlindungi(terlindung);
  if (kembali !== probe) throw new Error('DPAPI tidak dapat memulihkan nilai probe (bulat-pusing gagal).');
  return true;
}

export function kunciFolderIcacls(dirData) {
  if (process.platform !== 'win32') return;
  const pengguna = process.env.USERNAME || process.env.USER;
  if (!pengguna) return;
  try {
    execFileSync('icacls.exe', [dirData, '/inheritance:r', '/grant:r', `${pengguna}:(OI)(CI)F`], { stdio: 'ignore' });
  } catch {
    // icacls tidak wajib untuk fungsi teras; kegagalan tidak boleh menghentikan
    // storan (fail tetap disulit DPAPI), tetapi tidak boleh membocorkan apa-apa
    // ke log/console sama ada.
  }
}

export function buatSimpananRahsia({ dirData, protector, kunciFolder }) {
  if (!protector && process.platform !== 'win32') {
    throw new Error('Storan rahsia gagal tertutup: tiada pelindung DPAPI pada platform ini.');
  }
  const aktifProtector = protector || protectorDpapiSebenar();
  // Laluan sebenar sahaja (protector bukan suntikan ujian) menjalankan ujian
  // kendiri sekali supaya kegagalan DPAPI muncul di sini, bukan kemudian.
  if (!protector) sahkanProtectorBerfungsi(aktifProtector);
  const laluan = laluanRahsia(dirData);
  const panggilKunciFolder = kunciFolder || kunciFolderIcacls;

  function bacaSemua() {
    if (!fs.existsSync(laluan)) return {};
    const mentah = fs.readFileSync(laluan);
    let teks;
    try {
      teks = aktifProtector.nyahlindungi(mentah);
    } catch (ralat) {
      throw new Error('Fail rahsia tidak dapat dinyahsulit: ' + ralat.message);
    }
    try {
      return JSON.parse(teks);
    } catch {
      throw new Error('Fail rahsia rosak (bukan JSON sah selepas nyahsulit).');
    }
  }

  function tulisSemua(objek) {
    fs.mkdirSync(dirData, { recursive: true });
    const terlindung = aktifProtector.lindungi(JSON.stringify(objek));
    const sementara = laluan + '.tmp-' + process.pid + '-' + Date.now();
    fs.writeFileSync(sementara, terlindung);
    fs.renameSync(sementara, laluan);
    panggilKunciFolder(dirData);
  }

  return { bacaSemua, tulisSemua };
}

// Pembungkus API bernama bagi penggunaan server.mjs/bin — mengelakkan
// pemanggil lain daripada perlu tahu bentuk objek storan mentah.
export function buatSimpananApi(simpananGeneric) {
  return {
    adaRahsiaEnjin() { return !!simpananGeneric.bacaSemua().rahsiaEnjin; },
    simpanRahsiaEnjin(rahsiaEnjin) {
      const data = simpananGeneric.bacaSemua();
      data.rahsiaEnjin = rahsiaEnjin;
      simpananGeneric.tulisSemua(data);
    },
    dapatkanRahsiaEnjin() { return simpananGeneric.bacaSemua().rahsiaEnjin || ''; }
  };
}
