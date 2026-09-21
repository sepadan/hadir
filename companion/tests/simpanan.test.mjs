import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bacaTetapan, tulisTetapanAtomik, TETAPAN_LALAI, bacaAtauCiptaIdEnjin } from '../src/tetapan.mjs';
import { samarkanIc, samarkanEmel, samarkanToken, samarkanNama } from '../src/log.mjs';
import { sahkanProtectorBerfungsi } from '../src/simpanan.mjs';
import { test as ujianBersyarat } from 'node:test';

// Regresi ditemui melalui ujian asap E2E: PowerShell 5.1 tidak memuatkan
// System.Security secara automatik, jadi protector DPAPI mesti memasukkan
// `Add-Type -AssemblyName System.Security` sebelum membuat panggilan.
test('protector DPAPI (kod sumber) memuatkan assembly System.Security', () => {
  const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'simpanan.mjs'), 'utf8');
  assert.match(src, /Add-Type -AssemblyName System\.Security/);
  assert.match(src, /sahkanProtectorBerfungsi/);
});

test('sahkanProtectorBerfungsi: protector rosak ditolak (fail tertutup)', () => {
  const rosak = {
    lindungi: () => Buffer.from('sampah'),
    nyahlindungi: () => 'nilai lain sama sekali'
  };
  assert.throws(() => sahkanProtectorBerfungsi(rosak), /bulat-pusing gagal/);
  const kosong = { lindungi: () => Buffer.alloc(0), nyahlindungi: () => '' };
  assert.throws(() => sahkanProtectorBerfungsi(kosong), /nilai kosong/);
});

// Ujian DPAPI SEBENAR — Windows sahaja, tiada rangkaian, tiada data murid.
// Ini menguji laluan PowerShell sebenar yang tidak pernah disentuh oleh ujian
// lain (protector palsu disuntik di tempat lain).
ujianBersyarat('DPAPI sebenar: bulat-pusing nilai probe berjaya', { skip: process.platform !== 'win32' }, async () => {
  const { protectorDpapiSebenar } = await import('../src/simpanan.mjs');
  assert.equal(sahkanProtectorBerfungsi(protectorDpapiSebenar()), true);
});

test('tulisTetapanAtomik: tiada fail sementara kekal, boleh dibaca semula', () => {
  const dirData = fs.mkdtempSync(path.join(os.tmpdir(), 'hadir-tetapan-'));
  tulisTetapanAtomik(dirData, { ...TETAPAN_LALAI, label: 'PC Guru A', port: 9999 });
  const fail = fs.readdirSync(dirData);
  assert.ok(!fail.some((f) => f.includes('.tmp-')));
  const dibaca = bacaTetapan(dirData);
  assert.equal(dibaca.label, 'PC Guru A');
  assert.equal(dibaca.port, 9999);
  fs.rmSync(dirData, { recursive: true, force: true });
});

test('bacaTetapan: nilai rosak (bukan JSON sah) gagal tertutup kepada lalai selamat', () => {
  const dirData = fs.mkdtempSync(path.join(os.tmpdir(), 'hadir-tetapan-'));
  fs.writeFileSync(path.join(dirData, 'tetapan.json'), '{ bukan json sah');
  const dibaca = bacaTetapan(dirData);
  assert.deepEqual(dibaca, TETAPAN_LALAI);
  fs.rmSync(dirData, { recursive: true, force: true });
});

test('bacaTetapan: intervalSaat < 30 dipaksa naik kepada 30 (minimum giliran)', () => {
  const dirData = fs.mkdtempSync(path.join(os.tmpdir(), 'hadir-tetapan-'));
  tulisTetapanAtomik(dirData, { ...TETAPAN_LALAI, intervalSaat: 2 });
  assert.equal(bacaTetapan(dirData).intervalSaat, 30);
  fs.rmSync(dirData, { recursive: true, force: true });
});

test('bacaAtauCiptaIdEnjin: ID stabil merentasi restart (persist ke id-enjin.json)', () => {
  const dirData = fs.mkdtempSync(path.join(os.tmpdir(), 'hadir-id-enjin-'));
  const pertama = bacaAtauCiptaIdEnjin(dirData);
  const kedua = bacaAtauCiptaIdEnjin(dirData);
  assert.equal(pertama, kedua, 'ID enjin mesti kekal sama dalam folder data yang sama');
  assert.ok(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pertama), 'ID ialah UUID');
  assert.ok(fs.existsSync(path.join(dirData, 'id-enjin.json')), 'fail id-enjin.json mesti wujud');
  fs.rmSync(dirData, { recursive: true, force: true });
});

test('bacaAtauCiptaIdEnjin: fail rosak diganti dengan UUID baharu (bukan terperangkap)', () => {
  const dirData = fs.mkdtempSync(path.join(os.tmpdir(), 'hadir-id-enjin-'));
  fs.writeFileSync(path.join(dirData, 'id-enjin.json'), '{ rosak');
  const id = bacaAtauCiptaIdEnjin(dirData);
  assert.ok(/^[0-9a-f]{8}-/i.test(id), 'ID baharu yang sah mesti dijana apabila fail rosak');
  fs.rmSync(dirData, { recursive: true, force: true });
});

test('penyahpekaan log: IC hanya hujung 4 digit', () => {
  assert.equal(samarkanIc('991231015566'), '********5566');
  assert.equal(samarkanIc(''), '');
});

test('penyahpekaan log: emel dan token dimask', () => {
  assert.equal(samarkanEmel('cikgu.ali@moe.gov.my'), 'c***@moe.gov.my');
  assert.equal(samarkanToken('sangat-rahsia-panjang'), 'san…ang');
  assert.equal(samarkanNama('ALI BIN ABU'), 'A***11');
});
