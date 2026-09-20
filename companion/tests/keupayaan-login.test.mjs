import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keupayaanLogMasuk } from '../src/moeis/keupayaan.mjs';

test('companion melaporkan auto-login tersedia secara opt-in (JUJUR: belum disahkan hidup)', () => {
  const k = keupayaanLogMasuk();
  assert.equal(k.automatik, true);
  assert.equal(k.mod, 'automatik-optin');
  assert.match(k.sebab, /opt-in/);
  assert.match(k.sebab, /loginAuto/);
  assert.match(k.sebab, /lalai MATI/i);
  // Jujur: belum disahkan terhadap idMe hidup.
  assert.match(k.sebab, /belum disahkan/i);
  // Tiada dakwaan palsu "tidak pernah menyimpan kata laluan".
  assert.match(k.sebab, /vault kredensial DPAPI/i);
});
