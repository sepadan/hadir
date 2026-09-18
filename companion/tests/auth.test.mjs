import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mulakanPelayanUjian, mintaMentah, TOKEN_SAH } from './bantuan-server.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

test('kod sumber pasangan.mjs menggunakan timingSafeEqual untuk banding token/kod', () => {
  const src = fs.readFileSync(path.join(HERE, '..', 'src', 'pasangan.mjs'), 'utf8');
  assert.match(src, /timingSafeEqual/);
});

let pelayan, port;
test.before(async () => { ({ pelayan, port } = await mulakanPelayanUjian()); });
test.after(() => pelayan.close());

const ORIGIN = { Origin: 'https://sepadan.github.io' };

test('tiada token -> 401', async () => {
  const r = await mintaMentah(port, { laluan: '/api/status', headers: { ...ORIGIN } });
  assert.equal(r.status, 401);
});

test('token salah -> 401', async () => {
  const r = await mintaMentah(port, { laluan: '/api/status', headers: { ...ORIGIN, Authorization: 'Bearer salah-sama-sekali' } });
  assert.equal(r.status, 401);
});

test('token betul -> 200', async () => {
  const r = await mintaMentah(port, { laluan: '/api/status', headers: { ...ORIGIN, Authorization: `Bearer ${TOKEN_SAH}` } });
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
});

test('N kegagalan berturut-turut -> 429', async () => {
  let terakhir;
  for (let i = 0; i < 15; i++) {
    terakhir = await mintaMentah(port, { laluan: '/api/status', headers: { ...ORIGIN, Authorization: 'Bearer salah-' + i } });
  }
  assert.equal(terakhir.status, 429);
});
