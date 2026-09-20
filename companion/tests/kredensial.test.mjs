import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buatStoranKredensial, samarkanPengguna } from '../src/kredensial.mjs';

// Protector DPAPI PALSU — nilai jelas bukan sebenar. Base64 di dalam supaya
// teks biasa kredensial TIDAK wujud dalam fail (model DPAPI sebenar yang
// menghasilkan ciphertext, bukan hanya awalan).
function protectorPalsu() {
  return {
    lindungi(teksBiasa) {
      return Buffer.from('DPAPI:' + Buffer.from(teksBiasa, 'utf8').toString('base64'), 'utf8');
    },
    nyahlindungi(buf) {
      const s = buf.toString('utf8');
      if (!s.startsWith('DPAPI:')) throw new Error('bukan diformat DPAPI palsu');
      return Buffer.from(s.slice('DPAPI:'.length), 'base64').toString('utf8');
    }
  };
}

const KRED = {
  idMePengguna: 'PENGGUNA-UJIAN',
  idMeKataLaluan: 'KATA-LALUAN-PALSU-TAK-SAH',
  idMeKunciKeselamatan: 'FRASA-CONTOH-SELAMAT'
};

test('samarkanPengguna: hanya aksara pertama + *** (tiada nama penuh)', () => {
  assert.equal(samarkanPengguna('ahmad.ali@moe.gov.my'), 'a***');
  assert.equal(samarkanPengguna('X'), 'X***');
  assert.equal(samarkanPengguna(''), '');
});

test('simpan menulis fail DISULIT (tiada teks biasa pada cakera)', () => {
  const dirData = fs.mkdtempSync(path.join(os.tmpdir(), 'hadir-kred-'));
  const store = buatStoranKredensial({ dirData, protector: protectorPalsu(), kunciFolder: () => {} });
  store.simpan(KRED);
  const mentah = fs.readFileSync(path.join(dirData, 'kredensial.dat'), 'utf8');
  assert.ok(mentah.startsWith('DPAPI:'), 'fail mesti disulit oleh protector');
  assert.equal(mentah.includes(KRED.idMeKataLaluan), false, 'kata laluan tidak boleh berada dalam teks biasa');
  assert.equal(mentah.includes(KRED.idMePengguna), false, 'pengguna tidak boleh berada dalam teks biasa');
  // Tiada fail sementara kekal selepas rename atomik.
  assert.equal(fs.readdirSync(dirData).filter((f) => f.includes('.tmp-')).length, 0);
  fs.rmSync(dirData, { recursive: true, force: true });
});

test('baca memulangkan objek penuh; status TIDAK pernah mendedahkan nilai', () => {
  const dirData = fs.mkdtempSync(path.join(os.tmpdir(), 'hadir-kred-'));
  const store = buatStoranKredensial({ dirData, protector: protectorPalsu(), kunciFolder: () => {} });
  store.simpan(KRED);
  const penuh = store.baca();
  assert.equal(penuh.kataLaluan, KRED.idMeKataLaluan);
  const st = store.status();
  assert.deepEqual(st, { ada: true, rosak: false, pengguna: 'P***', kunciAda: true });
  assert.equal(JSON.stringify(st).includes(KRED.idMeKataLaluan), false);
  assert.equal(JSON.stringify(st).includes(KRED.idMePengguna), false);
  fs.rmSync(dirData, { recursive: true, force: true });
});

test('status tanpa kredensial -> ada:false; padam memadam fail', () => {
  const dirData = fs.mkdtempSync(path.join(os.tmpdir(), 'hadir-kred-'));
  const store = buatStoranKredensial({ dirData, protector: protectorPalsu(), kunciFolder: () => {} });
  assert.equal(store.ada(), false);
  assert.deepEqual(store.status(), { ada: false, rosak: false, pengguna: '', kunciAda: false });
  store.simpan(KRED);
  assert.equal(store.ada(), true);
  store.padam();
  assert.equal(store.ada(), false);
  assert.deepEqual(store.status(), { ada: false, rosak: false, pengguna: '', kunciAda: false });
  fs.rmSync(dirData, { recursive: true, force: true });
});

test('fail rosak gagal tertutup: baca melontar, status laporkan rosak:true (bukan teks biasa)', () => {
  const dirData = fs.mkdtempSync(path.join(os.tmpdir(), 'hadir-kred-'));
  fs.writeFileSync(path.join(dirData, 'kredensial.dat'), 'bukan-data-dpapi-sah');
  const store = buatStoranKredensial({ dirData, protector: protectorPalsu(), kunciFolder: () => {} });
  assert.throws(() => store.baca());
  assert.deepEqual(store.status(), { ada: true, rosak: true, pengguna: '', kunciAda: false });
  fs.rmSync(dirData, { recursive: true, force: true });
});

test('simpan menolak medan kosong (mesej tanpa nilai)', () => {
  const dirData = fs.mkdtempSync(path.join(os.tmpdir(), 'hadir-kred-'));
  const store = buatStoranKredensial({ dirData, protector: protectorPalsu(), kunciFolder: () => {} });
  assert.throws(() => store.simpan({ ...KRED, idMeKataLaluan: '' }), /diperlukan/);
  assert.throws(() => store.simpan({ ...KRED, idMeKunciKeselamatan: '' }), /diperlukan/);
  fs.rmSync(dirData, { recursive: true, force: true });
});

test('storan gagal tertutup pada platform bukan Windows tanpa protector', { skip: process.platform === 'win32' }, () => {
  const dirData = fs.mkdtempSync(path.join(os.tmpdir(), 'hadir-kred-'));
  assert.throws(() => buatStoranKredensial({ dirData }));
  fs.rmSync(dirData, { recursive: true, force: true });
});

test('fsImpl disuntik digunakan (ujian fs dalam ingatan, tiada cakera)', () => {
  const memori = new Map();
  const fsPalsu = {
    existsSync: (p) => memori.has(p),
    readFileSync: (p) => memori.get(p),
    writeFileSync: (p, b) => memori.set(p, b),
    renameSync: (a, b) => { memori.set(b, memori.get(a)); memori.delete(a); },
    unlinkSync: (p) => memori.delete(p),
    mkdirSync: () => {}
  };
  const dirData = 'C:/palsu/data';
  const store = buatStoranKredensial({ dirData, protector: protectorPalsu(), kunciFolder: () => {}, fsImpl: fsPalsu });
  store.simpan(KRED);
  assert.equal(store.ada(), true);
  assert.equal(store.status().pengguna, 'P***');
  store.padam();
  assert.equal(store.ada(), false);
});
