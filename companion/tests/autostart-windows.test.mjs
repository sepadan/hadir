import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NAMA_ENTRI_AUTOSTART,
  LALUAN_RUN_HKCU,
  binaArahanAutostartWindows,
  buatPengurusAutostartWindows
} from '../src/autostart-windows.mjs';

test('arahan Run key memelihara laluan beruang dan membawa argv tetap sahaja', () => {
  const arahan = binaArahanAutostartWindows(
    'C:\\Program Files\\nodejs\\node.exe',
    'C:\\Program Files\\HADIR Companion\\bin\\hadir-companion.mjs'
  );
  assert.equal(arahan, '"C:\\Program Files\\nodejs\\node.exe" "C:\\Program Files\\HADIR Companion\\bin\\hadir-companion.mjs" serve');
});

test('adapter palsu menerima argv reg.exe injection-safe dan buang hanya entri milik sendiri', () => {
  const panggilan = [];
  let nilai = '';
  const execFileSyncPalsu = (fail, args) => {
    panggilan.push({ fail, args: [...args] });
    if (args[0] === 'query') {
      if (!nilai) throw Object.assign(new Error('tiada'), { status: 1 });
      return Buffer.from(`    ${NAMA_ENTRI_AUTOSTART}    REG_SZ    ${nilai}\r\n`);
    }
    if (args[0] === 'add') { nilai = args[args.indexOf('/d') + 1]; return Buffer.from(''); }
    if (args[0] === 'delete') { nilai = ''; return Buffer.from(''); }
    throw new Error('panggilan tidak dijangka');
  };
  const p = buatPengurusAutostartWindows({
    platform: 'win32', execFileSync: execFileSyncPalsu,
    exePath: 'C:\\Program Files\\nodejs\\node.exe',
    scriptPath: 'C:\\HADIR Companion\\bin\\hadir-companion.mjs'
  });
  assert.equal(p.status().berdaftar, false);
  assert.equal(p.tetapkan(true).berdaftar, true);
  const add = panggilan.find((x) => x.args[0] === 'add');
  assert.equal(add.fail, 'reg.exe');
  assert.deepEqual(add.args.slice(0, 4), ['add', LALUAN_RUN_HKCU, '/v', NAMA_ENTRI_AUTOSTART]);
  assert.ok(!add.args.includes('cmd.exe'));
  assert.equal(p.tetapkan(false).berdaftar, false);
  const del = panggilan.find((x) => x.args[0] === 'delete');
  assert.deepEqual(del.args, ['delete', LALUAN_RUN_HKCU, '/v', NAMA_ENTRI_AUTOSTART, '/f']);
});

test('status melapor pendaftaran sebenar dan ketidakpadanan arahan, bukan flag tetapan', () => {
  const execFileSyncPalsu = (_fail, args) => {
    if (args[0] === 'query') return Buffer.from(`    ${NAMA_ENTRI_AUTOSTART}    REG_SZ    "C:\\lain.exe" serve\r\n`);
    return Buffer.from('');
  };
  const p = buatPengurusAutostartWindows({
    platform: 'win32', execFileSync: execFileSyncPalsu,
    exePath: 'C:\\node.exe', scriptPath: 'C:\\hadir companion\\hadir-companion.mjs'
  });
  assert.deepEqual(p.status(), {
    disokong: true, berdaftar: true, sepadan: false,
    sebab: 'Entri HKCU wujud tetapi arahannya tidak sepadan dengan companion ini.'
  });
});

