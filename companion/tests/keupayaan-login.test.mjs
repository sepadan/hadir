import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keupayaanLogMasuk } from '../src/moeis/keupayaan.mjs';

test('companion melaporkan auto-login BLOCKED dengan sebab tepat dan tiada dakwaan vault', () => {
  assert.deepEqual(keupayaanLogMasuk(), {
    automatik: false,
    mod: 'manual',
    sebab: 'Tiada integrasi vault pelayar diluluskan; log masuk idMe kekal manual.'
  });
});

