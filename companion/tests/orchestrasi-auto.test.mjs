import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cubaAutoMula } from '../src/orchestrasi-auto.mjs';

const SEKARANG = Date.parse('2026-09-21T01:00:00.000Z');
const SEMPADAN = Date.parse('2026-09-21T00:30:00.000Z');

function tetapan(ubah = {}) {
  return {
    autoMulaGiliran: true,
    kalendarSekolah: ['2026-09-21'],
    autoMulaDiaktifkanPada: '2026-09-21T00:00:00.000Z',
    intervalSaat: 90,
    ...ubah
  };
}

test('default OFF tidak membuat probe rangkaian/sesi dan tidak memulakan giliran', async () => {
  const panggilan = [];
  const hasil = await cubaAutoMula({
    bacaTetapan: () => tetapan({ autoMulaGiliran: false }),
    sekarangMs: () => SEKARANG, sempadanProsesMs: SEMPADAN,
    adaRahsiaEnjin: () => { panggilan.push('rahsia'); return true; },
    klaimDisokong: async () => { panggilan.push('klaim'); return true; },
    sesiDisahkan: async () => { panggilan.push('sesi'); return { ada: true }; },
    mulakanGiliran: () => panggilan.push('mula'),
    tulisLog: () => {}
  });
  assert.equal(hasil.bermula, false);
  assert.match(hasil.sebab, /dimatikan/i);
  assert.deepEqual(panggilan, []);
});

test('startup fixture memulakan giliran hanya selepas semua pengawal lulus', async () => {
  const panggilan = [];
  const hasil = await cubaAutoMula({
    bacaTetapan: () => tetapan(),
    sekarangMs: () => SEKARANG, sempadanProsesMs: SEMPADAN,
    adaRahsiaEnjin: () => true,
    klaimDisokong: async () => { panggilan.push('klaim'); return true; },
    sesiDisahkan: async () => { panggilan.push('sesi'); return { ada: true, sebab: 'SSO persisten sah.' }; },
    mulakanGiliran: (interval, opsyen) => panggilan.push(['mula', interval, opsyen]),
    tulisLog: (...args) => panggilan.push(['log', ...args])
  });
  assert.equal(hasil.bermula, true);
  assert.deepEqual(panggilan[2], ['mula', 90, { automatik: true }]);
  assert.deepEqual(panggilan.slice(0, 2), ['klaim', 'sesi']);
});

test('ralat sesi kelihatan dan queue kekal mati', async () => {
  let mula = 0;
  const hasil = await cubaAutoMula({
    bacaTetapan: () => tetapan(),
    sekarangMs: () => SEKARANG, sempadanProsesMs: SEMPADAN,
    adaRahsiaEnjin: () => true,
    klaimDisokong: async () => true,
    sesiDisahkan: async () => { throw new Error('Edge profile sedang dikunci'); },
    mulakanGiliran: () => { mula++; }, tulisLog: () => {}
  });
  assert.equal(mula, 0);
  assert.equal(hasil.bermula, false);
  assert.match(hasil.sebab, /Edge profile sedang dikunci/);
});

