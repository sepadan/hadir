// Vault kredensial idMe per-pengguna (companion/src/kredensial.mjs).
//
// Menyimpan (pengguna, kata laluan, frasa kunci keselamatan) idMe dalam
// `kredensial.dat` yang DISULIT dengan DPAPI (Scope CurrentUser) — corak yang
// SAMA seperti simpanan.mjs (rahsia enjin). TIADA fallback teks biasa: jika
// protector sebenar tidak tersedia (bukan Windows, atau injeksi ujian tiada),
// storan gagal TERTUTUP.
//
// INVARIAN KESELAMATAN (dilanggar = pepijat HIGH):
//   * Nilai kredensial TIDAK PERNAH dipulangkan oleh sebarang API/status/UI.
//     `status()` hanya memulangkan boolean + pengguna TERSAMAR. `baca()`
//     (objek penuh dengan kata laluan) hanya wujud untuk kegunaan DALAMAN
//     login-auto.mjs — tiada endpoint HTTP memanggilnya.
//   * Kata laluan TIDAK PERNAH masuk env var, argumen CLI, log, atau respons.
//   * Fail ditulis atomik (sementara + rename) dan folder dikunci ACL icacls
//     kepada akaun Windows semasa.
import fs from 'node:fs';
import path from 'node:path';
import { protectorDpapiSebenar, sahkanProtectorBerfungsi, kunciFolderIcacls } from './simpanan.mjs';

function laluanKredensial(dirData) {
  return path.join(dirData, 'kredensial.dat');
}

// Samaran pengguna untuk status/UI: hanya aksara pertama + `***`. Tidak
// pernah mendedahkan nama penuh akaun idMe.
export function samarkanPengguna(pengguna) {
  const s = String(pengguna || '').trim();
  if (!s) return '';
  return s[0] + '***';
}

// Medan objek kredensial dalam fail (nama medan sahaja, bukan nilai — nilai
// tidak pernah meninggalkan storan).
export const MEDAN_KREDENSIAL = ['pengguna', 'kataLaluan', 'kunciKeselamatan'];

export function buatStoranKredensial({ dirData, protector, kunciFolder, fsImpl }) {
  const fsGuna = fsImpl || fs;
  if (!protector && process.platform !== 'win32') {
    throw new Error('Storan kredensial gagal tertutup: tiada pelindung DPAPI pada platform ini.');
  }
  const aktifProtector = protector || protectorDpapiSebenar();
  // Laluan sebenar sahaja menjalankan ujian kendiri sekali supaya kegagalan
  // DPAPI muncul pada startup, bukan ketika guru menyimpan kredensial pertama.
  if (!protector) sahkanProtectorBerfungsi(aktifProtector);
  const laluan = laluanKredensial(dirData);
  const panggilKunciFolder = kunciFolder || kunciFolderIcacls;

  // Baca objek penuh (TANPA penyamaran). INTERNAL sahaja — hanya login-auto.mjs.
  function baca() {
    if (!fsGuna.existsSync(laluan)) return null;
    const mentah = fsGuna.readFileSync(laluan);
    let teks;
    try {
      teks = aktifProtector.nyahlindungi(mentah);
    } catch (ralat) {
      throw new Error('Fail kredensial tidak dapat dinyahsulit: ' + ralat.message);
    }
    try {
      return JSON.parse(teks);
    } catch {
      throw new Error('Fail kredensial rosak (bukan JSON sah selepas nyahsulit).');
    }
  }

  function tulis(objek) {
    fsGuna.mkdirSync(dirData, { recursive: true });
    const terlindung = aktifProtector.lindungi(JSON.stringify(objek));
    const sementara = laluan + '.tmp-' + process.pid + '-' + Date.now();
    fsGuna.writeFileSync(sementara, terlindung);
    fsGuna.renameSync(sementara, laluan);
    panggilKunciFolder(dirData);
  }

  // Simpan kredensial. Tiada nilai dipulangkan — pemanggil hanya dapat
  // boolean melalui status().
  function simpan({ idMePengguna, idMeKataLaluan, idMeKunciKeselamatan }) {
    const pengguna = String(idMePengguna || '').trim();
    const kataLaluan = String(idMeKataLaluan || '');
    const kunciKeselamatan = String(idMeKunciKeselamatan || '').trim();
    if (!pengguna || !kataLaluan || !kunciKeselamatan) {
      // Mesej tidak mengandungi sebarang nilai — hanya menyatakan medan mana
      // yang kosong.
      throw new Error('Pengguna, kata laluan dan frasa kunci keselamatan idMe diperlukan.');
    }
    tulis({ pengguna, kataLaluan, kunciKeselamatan });
  }

  function padam() {
    if (fsGuna.existsSync(laluan)) fsGuna.unlinkSync(laluan);
  }

  // Kewujudan fail sahaja (TANPA nyahsulit) — untuk semakan pantas kehadiran
  // kredensial tanpa mendedahkan/memuat nilai ke dalam ingatan proses ini.
  function ada() {
    return fsGuna.existsSync(laluan);
  }

  // Status TIDAK PERNAH melontar untuk fail rosak — laporkan rosak:true
  // supaya UI boleh menawarkan padam. Tidak sekali-kali mendedahkan nilai.
  function status() {
    let k = null;
    try {
      k = baca();
    } catch {
      return { ada: true, rosak: true, pengguna: '', kunciAda: false };
    }
    if (!k) return { ada: false, rosak: false, pengguna: '', kunciAda: false };
    return {
      ada: true,
      rosak: false,
      pengguna: samarkanPengguna(k.pengguna),
      kunciAda: !!k.kunciKeselamatan
    };
  }

  return { simpan, baca, padam, ada, status };
}
