import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sealAccount, openAccount, validateAccount } from '../src/vault.mjs';

export const KEY = 'synthetic-cloud-owner-key-0000000000000000000000';
export const ACCOUNT = { identifier: 'fixture-owner', password: 'fixture-password', phrase: 'fixture phrase', consent: true, allowUnreadablePhrase: false };

test('cloud vault encrypts with random IV; tampering, wrong key and schema fail closed', async () => {
  const a = await sealAccount(KEY, ACCOUNT), b = await sealAccount(KEY, ACCOUNT);
  assert.notEqual(a.iv, b.iv);
  assert.ok(!JSON.stringify(a).includes(ACCOUNT.password));
  assert.deepEqual(await openAccount(KEY, a), ACCOUNT);
  for (const record of [{...a, ciphertext: a.ciphertext.slice(0,-4)+'AAAA'}, {...a, iv:'AAAA'}, {...a, version:2}]) {
    await assert.rejects(openAccount(KEY, record), {code:'vault-unavailable'});
  }
  await assert.rejects(openAccount(KEY+'other', a), {code:'vault-unavailable'});
  for (const patch of [{consent:false}, {password:4}, {phrase:''}, {identifier:'x'.repeat(129)}, {allowUnreadablePhrase:'true'}, {extra:true}]) {
    assert.throws(()=>validateAccount({...ACCOUNT,...patch}));
  }
});
