// Log tempatan + penyahpekaan (companion/src/log.mjs).
//
// DAKWAAN YANG TEPAT (semakan bebas pusingan 2 membetulkan dakwaan lama yang
// terlalu kuat): penyahpekaan IC/emel/token berlaku DI LAPISAN INI untuk
// apa-apa yang ditulis ke log — termasuk stdout/stderr mentah proses anak.
// `tulisKerja()` memang menulis keluaran anak, jadi tanpa penapis ini IC atau
// token yang muncul dalam keluaran anak akan tersimpan mentah.
//
// HAD YANG DIAKUI: nama murid TIDAK disamarkan sepenuhnya. Enjin menyamarkan
// nama dalam MESEJ keputusan (inisial + panjang, cth "A***11") dan log kerja
// menyimpan nama sepenuhnya jika halaman MOEIS mencetaknya. Dalam kelas kecil,
// samaran inisial+panjang masih boleh mengenal pasti murid. Log berada dalam
// folder data yang ACL-nya dihadkan kepada akaun Windows semasa (lihat
// simpanan.mjs / PEMASANGAN.md). Jangan dakwa log "tanpa nama sepenuhnya".
import fs from 'node:fs';
import path from 'node:path';

export function samarkanIc(ic) {
  const s = String(ic || '').replace(/\D/g, '');
  if (s.length <= 4) return s ? '*'.repeat(s.length) : '';
  return '*'.repeat(s.length - 4) + s.slice(-4);
}

export function samarkanEmel(emel) {
  const s = String(emel || '');
  const i = s.indexOf('@');
  if (i <= 0) return s ? '***' : '';
  return s.slice(0, 1) + '***' + s.slice(i);
}

export function samarkanToken(token) {
  const s = String(token || '');
  if (s.length <= 6) return s ? '***' : '';
  return s.slice(0, 3) + '…' + s.slice(-3);
}

// Samaran nama untuk MESEJ keputusan (bukan penapis log penuh) — inisial +
// panjang. Had: masih boleh mengenal pasti murid dalam kelas yang kecil.
export function samarkanNama(nama) {
  const s = String(nama || '').trim();
  if (!s) return '';
  return s[0] + '***' + s.length;
}

// Penapis lapisan log: IC/MyKid (12 digit, dengan atau tanpa pemisah), emel dan
// rentetan seperti token (hex ≥64, base64url ≥43) dimask sebelum ditulis.
export function sensor(teks) {
  let s = String(teks == null ? '' : teks);
  s = s.replace(/\b\d{6}[- ]?\d{2}[- ]?\d{4}\b/g, (m) => samarkanIc(m));
  s = s.replace(/\b\d{12}\b/g, (m) => samarkanIc(m));
  s = s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => samarkanEmel(m));
  s = s.replace(/\b[A-Fa-f0-9]{64,}\b/g, (m) => samarkanToken(m));
  s = s.replace(/\b[A-Za-z0-9_-]{43,}\b/g, (m) => samarkanToken(m));
  return s;
}

export function buatLog({ dirData }) {
  const dirLog = path.join(dirData, 'log');
  const dirKerja = path.join(dirLog, 'kerja');

  function pastikanDir() {
    fs.mkdirSync(dirKerja, { recursive: true });
  }

  function baris(mesej) {
    return `[${new Date().toISOString()}] ${sensor(mesej)}`;
  }

  function tulis(mesej) {
    pastikanDir();
    const laluan = path.join(dirLog, 'companion.log');
    fs.appendFileSync(laluan, baris(mesej) + '\n', 'utf8');
  }

  // Keluaran mentah proses anak (stdout+stderr) disimpan untuk diagnosis —
  // tetapi sentiasa melalui sensor() sebelum menyentuh cakera.
  function tulisKerja(idKerja, teksPenuh) {
    pastikanDir();
    const namaFail = `${idKerja}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
    fs.writeFileSync(path.join(dirKerja, namaFail), sensor(teksPenuh), 'utf8');
    return path.join(dirKerja, namaFail);
  }

  function bacaTerakhir(bilangan) {
    const laluan = path.join(dirLog, 'companion.log');
    if (!fs.existsSync(laluan)) return [];
    const semua = fs.readFileSync(laluan, 'utf8').split('\n').filter(Boolean);
    return semua.slice(-bilangan);
  }

  return { tulis, tulisKerja, bacaTerakhir, dirLog, dirKerja };
}
