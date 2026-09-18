// Ujian pemilihan pautan aplikasi MOEIS (companion/tests/aplikasi.test.mjs).
// Fungsi tulen: tiada pelayar, tiada rangkaian.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pilihPautanAplikasiMoeis, pautanMoeisSah, HOS_MOEIS, URL_APLIKASI_IDME } from '../src/moeis/aplikasi.mjs';

const PAUTAN = { teks: 'Pengurusan Murid', href: 'https://moeispel.moe.gov.my?token_idms=abc&t=1789705325&u=xyz' };

test('aplikasi: pautan berlabel "Pengurusan Murid" dipilih', () => {
  const lain = { teks: 'Sistem Lain', href: 'https://contoh.moe.gov.my/' };
  assert.equal(pilihPautanAplikasiMoeis([lain, PAUTAN]).href, PAUTAN.href);
});

test('aplikasi: tanpa label, pautan moeispel pertama diambil', () => {
  const tanpaLabel = { teks: '', href: 'https://moeispel.moe.gov.my?t=1' };
  assert.equal(pilihPautanAplikasiMoeis([{ teks: 'X', href: 'https://lain.moe.gov.my/' }, tanpaLabel]).href, tanpaLabel.href);
});

test('aplikasi: hanya HTTPS + hos TEPAT moeispel diterima', () => {
  assert.equal(pautanMoeisSah('https://moeispel.moe.gov.my/'), true);
  // Ralat: skema bukan HTTPS.
  assert.equal(pautanMoeisSah('http://moeispel.moe.gov.my/'), false);
  // Ralat: subdomain hos seakan-akan sama.
  assert.equal(pautanMoeisSah('https://jahat.moeispel.moe.gov.my/'), false);
  // Ralat: hos seakan-akan sama sebagai awalan (moeispel.moe.gov.my.jahat.com).
  assert.equal(pautanMoeisSah('https://moeispel.moe.gov.my.jahat.com/'), false);
  // Ralat: hos pihak ketiga.
  assert.equal(pautanMoeisSah('https://moeispel-moe-gov-my.jahat.com/'), false);
  // Ralat: bukan teks URL.
  assert.equal(pautanMoeisSah(''), false);
  assert.equal(pautanMoeisSah(null), false);
  assert.equal(pautanMoeisSah('bukan url'), false);
});

test('aplikasi: senarai kosong atau tidak sah pulangkan null', () => {
  assert.equal(pilihPautanAplikasiMoeis([]), null);
  assert.equal(pilihPautanAplikasiMoeis(null), null);
  assert.equal(pilihPautanAplikasiMoeis([{ teks: 'Pengurusan Murid', href: 'https://jahat.com/' }]), null);
  assert.equal(pilihPautanAplikasiMoeis([null, undefined, { teks: 'x' }]), null);
});

test('aplikasi: pemalar hos dan URL portal adalah seperti yang dijangka', () => {
  assert.equal(HOS_MOEIS, 'moeispel.moe.gov.my');
  assert.equal(URL_APLIKASI_IDME, 'https://idme.moe.gov.my/list_aplikasi');
});
