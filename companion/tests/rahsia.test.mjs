import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buatSimpananRahsia } from '../src/simpanan.mjs';
import { adaMedanRahsiaDilarang } from '../src/tetapan.mjs';
import { mulakanPelayanUjian, mintaMentah, TOKEN_SAH } from './bantuan-server.mjs';

test('adaMedanRahsiaDilarang mengesan kataLaluan/password/pin/rahsia/token', () => {
  assert.equal(adaMedanRahsiaDilarang({ label: 'ok' }), false);
  for (const medan of ['kataLaluan', 'password', 'pin', 'rahsia', 'token', 'PASSWORD']) {
    assert.equal(adaMedanRahsiaDilarang({ [medan]: 'x' }), true, medan);
  }
});

test('POST /api/tetapan menolak medan rahsia dengan 400', async () => {
  const { pelayan, port } = await mulakanPelayanUjian();
  try {
    const r = await mintaMentah(port, {
      method: 'POST', laluan: '/api/tetapan',
      headers: { Origin: 'https://sepadan.github.io', Authorization: `Bearer ${TOKEN_SAH}`, 'Content-Type': 'application/json' },
      badan: JSON.stringify({ password: 'bocor' })
    });
    assert.equal(r.status, 400);
  } finally { pelayan.close(); }
});

test('respons /api/status tidak pernah mengandungi rahsia enjin', async () => {
  const { pelayan, port } = await mulakanPelayanUjian();
  try {
    const r = await mintaMentah(port, {
      laluan: '/api/status',
      headers: { Origin: 'https://sepadan.github.io', Authorization: `Bearer ${TOKEN_SAH}` }
    });
    assert.equal(r.status, 200);
    assert.ok(!r.teks.includes('rahsia-ujian'), 'rahsia enjin tidak boleh bocor dalam respons status');
  } finally { pelayan.close(); }
});

function protectorPalsu() {
  const simpanan = new Map();
  return {
    lindungi(teksBiasa) { return Buffer.from('DPAPI:' + teksBiasa, 'utf8'); },
    nyahlindungi(buf) {
      const s = buf.toString('utf8');
      if (!s.startsWith('DPAPI:')) throw new Error('bukan diformat DPAPI palsu');
      return s.slice('DPAPI:'.length);
    },
    _simpanan: simpanan
  };
}

test('simpanan: tulis atomik (fail sementara + rename) dan boleh dibaca semula', () => {
  const dirData = fs.mkdtempSync(path.join(os.tmpdir(), 'hadir-companion-'));
  let panggilanIcacls = 0;
  const simpanan = buatSimpananRahsia({ dirData, protector: protectorPalsu(), kunciFolder: () => { panggilanIcacls++; } });
  simpanan.tulisSemua({ rahsiaEnjin: 'abc123' });
  const failSementaraKekal = fs.readdirSync(dirData).filter((f) => f.includes('.tmp-'));
  assert.equal(failSementaraKekal.length, 0, 'fail sementara tidak boleh kekal selepas rename atomik');
  assert.ok(fs.existsSync(path.join(dirData, 'rahsia.dat')));
  assert.equal(simpanan.bacaSemua().rahsiaEnjin, 'abc123');
  assert.equal(panggilanIcacls, 1, 'kunciFolder (icacls) mesti dipanggil selepas tulis');
  fs.rmSync(dirData, { recursive: true, force: true });
});

test('simpanan: nilai rosak (bukan hasil protector sah) gagal tertutup, bukan fallback teks biasa', () => {
  const dirData = fs.mkdtempSync(path.join(os.tmpdir(), 'hadir-companion-'));
  fs.writeFileSync(path.join(dirData, 'rahsia.dat'), 'bukan-data-dpapi-sah');
  const simpanan = buatSimpananRahsia({ dirData, protector: protectorPalsu(), kunciFolder: () => {} });
  assert.throws(() => simpanan.bacaSemua());
  fs.rmSync(dirData, { recursive: true, force: true });
});

test('buatSimpananRahsia tanpa protector pada platform bukan-Windows gagal tertutup', { skip: process.platform === 'win32' }, () => {
  const dirData = fs.mkdtempSync(path.join(os.tmpdir(), 'hadir-companion-'));
  assert.throws(() => buatSimpananRahsia({ dirData }));
  fs.rmSync(dirData, { recursive: true, force: true });
});
