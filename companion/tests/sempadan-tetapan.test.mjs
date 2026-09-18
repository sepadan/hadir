import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TETAPAN_LALAI, bacaTetapan, tulisTetapanAtomik,
  tapisTetapanDibenarkan, tapisTetapanLokalDibenarkan, sahkanApiUrl,
  MEDAN_TETAPAN_DIBENARKAN, MEDAN_TETAPAN_LOKAL_DIBENARKAN
} from '../src/tetapan.mjs';

// Sempadan tetapan ialah kawalan keselamatan: klien JAUH tidak boleh meluaskan
// sempadan kepercayaannya sendiri (originDibenarkan), mengalihkan hos yang
// menerima rahsia enjin (apiUrl), atau menetapkan frasa kunci keselamatan idMe.

test('tapisTetapanDibenarkan (klien jauh) hanya lulus label + intervalSaat', () => {
  const patch = tapisTetapanDibenarkan({
    label: 'PC Guru', intervalSaat: 30,
    originDibenarkan: ['https://jahat.example'],
    apiUrl: 'https://jahat.example/exec',
    kunciKeselamatanDijangka: 'apa-apa',
    kataLaluan: 'x'
  });
  assert.deepEqual(Object.keys(patch).sort(), ['intervalSaat', 'label']);
  assert.deepEqual(MEDAN_TETAPAN_DIBENARKAN, ['label', 'intervalSaat']);
});

test('tapisTetapanLokalDibenarkan membenarkan apiUrl tetapi BUKAN originDibenarkan', () => {
  const patch = tapisTetapanLokalDibenarkan({
    apiUrl: 'https://script.google.com/macros/s/x/exec',
    label: 'PC Guru', kunciKeselamatanDijangka: 'SK PR',
    originDibenarkan: ['https://jahat.example']
  });
  assert.ok(patch.apiUrl);
  assert.equal(patch.originDibenarkan, undefined);
  assert.ok(MEDAN_TETAPAN_LOKAL_DIBENARKAN.includes('apiUrl'));
  assert.ok(!MEDAN_TETAPAN_LOKAL_DIBENARKAN.includes('originDibenarkan'));
});

test('sahkanApiUrl: menolak http, hos asing, userinfo; menerima URL Apps Script', () => {
  assert.equal(sahkanApiUrl('http://script.google.com/macros/s/x/exec').ok, false);
  assert.equal(sahkanApiUrl('https://jahat.example/exec').ok, false);
  assert.equal(sahkanApiUrl('https://user:pw@script.google.com/exec').ok, false);
  assert.equal(sahkanApiUrl('bukan-url').ok, false);
  assert.equal(sahkanApiUrl('https://script.google.com/macros/s/AKfy/exec').ok, true);
  assert.equal(sahkanApiUrl('https://script.googleusercontent.com/macros/echo').ok, true);
});

test('bacaTetapan: originDibenarkan rosak/kosong kembali kepada lalai yang ketat', () => {
  const dirData = fs.mkdtempSync(path.join(os.tmpdir(), 'hadir-tetapan-'));
  tulisTetapanAtomik(dirData, { ...TETAPAN_LALAI, originDibenarkan: [] });
  assert.deepEqual(bacaTetapan(dirData).originDibenarkan, TETAPAN_LALAI.originDibenarkan);
  tulisTetapanAtomik(dirData, { ...TETAPAN_LALAI, originDibenarkan: ['https://jahat.example'] });
  // Fail boleh menetapkan apa-apa (pengendali PC), tetapi LALAI kod mesti ketat.
  assert.deepEqual(TETAPAN_LALAI.originDibenarkan, ['https://sepadan.github.io']);
  assert.equal(TETAPAN_LALAI.autostart, false);
  fs.rmSync(dirData, { recursive: true, force: true });
});
