import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buatKunciPelayar } from '../src/kunci-pelayar.mjs';

// Kunci eksklusif pelayar — sumber-benar TUNGGAL "adakah profil Edge sedang
// digunakan". Semantik: cubaKunci (skip, bukan queue) + lepaskan (hanya
// pemegang sebenar yang boleh membebaskan — TIADA paksa-bunuh).

test('kunci bebas: cubaKunci berjaya, sibuk menjadi benar', () => {
  const k = buatKunciPelayar();
  assert.equal(k.cubaKunci('siasatan').boleh, true);
  assert.equal(k.sibuk(), true);
});

test('kunci dipegang: cubaKunci kedua gagal dan melaporkan pemegang', () => {
  const k = buatKunciPelayar();
  k.cubaKunci('tugasan');
  const r2 = k.cubaKunci('siasatan');
  assert.equal(r2.boleh, false);
  assert.equal(r2.pemegang, 'tugasan');
  assert.equal(k.sibuk(), true);
});

test('lepaskan label salah TIDAK membebaskan (tiada paksa-bunuh pemegang lain)', () => {
  const k = buatKunciPelayar();
  k.cubaKunci('tugasan');
  assert.equal(k.lepaskan('siasatan'), false);
  assert.equal(k.sibuk(), true);
  assert.equal(k.lepaskan('tugasan'), true);
  assert.equal(k.sibuk(), false);
});

test('lepaskan tanpa label membebaskan pemegang semasa (pemilik sebenar)', () => {
  const k = buatKunciPelayar();
  const r = k.cubaKunci('siasatan');
  assert.equal(k.lepaskan(r.pemegang), true);
  assert.equal(k.sibuk(), false);
});

test('status mendedahkan sibuk + pemegang', () => {
  const k = buatKunciPelayar();
  assert.deepEqual(k.status(), { sibuk: false, pemegang: null });
  k.cubaKunci('tugasan');
  assert.deepEqual(k.status(), { sibuk: true, pemegang: 'tugasan' });
});

test('kunci diperoleh semula selepas lepaskan (serialize, bukan queue)', () => {
  const k = buatKunciPelayar();
  k.cubaKunci('a');
  k.lepaskan('a');
  assert.equal(k.cubaKunci('b').boleh, true);
});
