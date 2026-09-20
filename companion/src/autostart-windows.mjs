// Pengurusan SATU entri Run key milik Companion. Semua panggilan menggunakan
// execFileSync + argv tetap; tiada shell dan tiada arahan daripada UI.
export const LALUAN_RUN_HKCU = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
export const NAMA_ENTRI_AUTOSTART = 'HADIRMoeisCompanion';

function petikArgumenWindows(nilai) {
  const s = String(nilai);
  if (s && !/[\s"]/u.test(s)) return s;
  return '"' + s
    .replace(/(\\*)"/g, '$1$1\\"')
    .replace(/(\\+)$/g, '$1$1') + '"';
}

export function binaArahanAutostartWindows(exePath, scriptPath) {
  return [exePath, scriptPath, 'serve'].map(petikArgumenWindows).join(' ');
}

export function buatPengurusAutostartWindows({ platform, execFileSync, exePath, scriptPath }) {
  const disokong = platform === 'win32';
  const arahanDijangka = binaArahanAutostartWindows(exePath, scriptPath);

  function status() {
    if (!disokong) {
      return { disokong: false, berdaftar: false, sepadan: false, sebab: 'Autostart HKCU hanya disokong pada Windows.' };
    }
    let teks;
    try {
      teks = String(execFileSync('reg.exe', ['query', LALUAN_RUN_HKCU, '/v', NAMA_ENTRI_AUTOSTART], {
        encoding: 'utf8', windowsHide: true
      }) || '');
    } catch {
      return { disokong: true, berdaftar: false, sepadan: false, sebab: 'Entri autostart companion tidak didaftarkan.' };
    }
    const namaSelamat = NAMA_ENTRI_AUTOSTART.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const padan = teks.match(new RegExp('^\\s*' + namaSelamat + '\\s+REG_SZ\\s+(.*)$', 'mi'));
    if (!padan) {
      return { disokong: true, berdaftar: false, sepadan: false, sebab: 'Entri autostart companion tidak didaftarkan.' };
    }
    const sepadan = padan[1].trim() === arahanDijangka;
    return {
      disokong: true, berdaftar: true, sepadan,
      sebab: sepadan
        ? 'Entri HKCU companion didaftarkan dan sepadan.'
        : 'Entri HKCU wujud tetapi arahannya tidak sepadan dengan companion ini.'
    };
  }

  function tetapkan(aktif) {
    if (!disokong) throw new Error('Autostart HKCU hanya disokong pada Windows.');
    if (aktif === true) {
      execFileSync('reg.exe', [
        'add', LALUAN_RUN_HKCU, '/v', NAMA_ENTRI_AUTOSTART,
        '/t', 'REG_SZ', '/d', arahanDijangka, '/f'
      ], { stdio: 'ignore', windowsHide: true });
    } else if (status().berdaftar) {
      // Padam nama nilai milik Companion sahaja; jangan sentuh nilai Run lain.
      execFileSync('reg.exe', [
        'delete', LALUAN_RUN_HKCU, '/v', NAMA_ENTRI_AUTOSTART, '/f'
      ], { stdio: 'ignore', windowsHide: true });
    }
    return status();
  }

  return { status, tetapkan, arahanDijangka };
}

