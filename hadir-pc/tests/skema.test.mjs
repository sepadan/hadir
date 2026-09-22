import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buatKedaiPeranti } from '../kontrak.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skema = JSON.parse(readFileSync(path.join(__dirname, '..', 'kontrak.schema.json'), 'utf8'));

function jenisSepadan(nilai, jenis) {
  if (jenis.includes('null') && nilai === null) return true;
  const jenisSenarai = jenis.split('|').map((j) => j.trim()).filter((j) => j !== 'null');
  return jenisSenarai.some((j) => {
    if (j === 'integer') return Number.isInteger(nilai);
    if (j === 'string') return typeof nilai === 'string';
    if (j === 'boolean') return typeof nilai === 'boolean';
    if (j === 'number') return typeof nilai === 'number';
    return false;
  });
}

function sahkanStruktur(nilai, def) {
  assert.equal(typeof nilai, 'object');
  assert.notEqual(nilai, null);
  for (const medan of def.required) {
    assert.ok(Object.prototype.hasOwnProperty.call(nilai, medan), `medan wajib hilang: ${medan}`);
  }
  for (const [medan, spekMedan] of Object.entries(def.properties)) {
    if (!(medan in nilai)) continue;
    const v = nilai[medan];
    if (spekMedan.const !== undefined) {
      assert.equal(v, spekMedan.const, `medan ${medan} mesti === ${spekMedan.const}`);
      continue;
    }
    if (spekMedan.enum) {
      assert.ok(spekMedan.enum.includes(v), `medan ${medan} bukan salah satu enum`);
      continue;
    }
    const jenis = Array.isArray(spekMedan.type) ? spekMedan.type.join('|') : spekMedan.type;
    assert.ok(jenisSepadan(v, jenis), `medan ${medan} jenis tidak sepadan (${jenis}): ${JSON.stringify(v)}`);
  }
}

function buatStoranPalsu() {
  const map = new Map();
  return {
    async get(key) {
      const v = map.get(key);
      return v === undefined ? null : JSON.parse(JSON.stringify(v));
    },
    async set(key, value) {
      map.set(key, JSON.parse(JSON.stringify(value)));
    },
    async delete(key) {
      map.delete(key);
    },
    async keysWithPrefix(prefix) {
      return [...map.keys()].filter((k) => k.startsWith(prefix));
    },
  };
}

function buatKunciPalsu() {
  let ekor = Promise.resolve();
  return {
    withLock(fn) {
      const giliran = ekor.then(() => fn());
      ekor = giliran.catch(() => {});
      return giliran;
    },
  };
}

function buatJamPalsu(startMs) {
  let sekarang = startMs;
  return { now: () => sekarang, maju(ms) { sekarang += ms; } };
}

const hash = { sha256: (s) => crypto.createHash('sha256').update(String(s)).digest('hex') };
const randomId = { uuid: () => crypto.randomUUID() };

function buatKedai() {
  return buatKedaiPeranti({
    storage: buatStoranPalsu(),
    lock: buatKunciPalsu(),
    clock: buatJamPalsu(2_000_000),
    hash,
    randomId,
    ciriDidayakan: () => true,
    senaraiTugasAktif: async () => [],
  });
}

test('skema: RekodPeranti daripada daftarPeranti sepadan dengan kontrak', async () => {
  const kedai = buatKedai();
  const { kodDaftar } = await kedai.terbitKodDaftar({ akaun: 'sekolah-x', ttlMs: 60_000, pentadbir: true });
  const rekod = await kedai.daftarPeranti({ kodDaftar, idPeranti: 'p1', akaun: 'sekolah-x', nama: 'PC 1', rahsia: 'rahsia123' });
  sahkanStruktur(rekod, skema.$defs.RekodPeranti);
});

test('skema: JawapanKlaim daripada klaimKepimpinan sepadan dengan kontrak', async () => {
  const kedai = buatKedai();
  const { kodDaftar } = await kedai.terbitKodDaftar({ akaun: 'sekolah-x', ttlMs: 60_000, pentadbir: true });
  await kedai.daftarPeranti({ kodDaftar, idPeranti: 'p1', akaun: 'sekolah-x', nama: 'PC 1', rahsia: 'rahsia123' });
  const klaim = await kedai.klaimKepimpinan({ idPeranti: 'p1', akaun: 'sekolah-x', rahsia: 'rahsia123' });
  sahkanStruktur(klaim, skema.$defs.JawapanKlaim);
});

test('skema: StatusAwam daripada statusPerantiAwam sepadan dengan kontrak', async () => {
  const kedai = buatKedai();
  const { kodDaftar } = await kedai.terbitKodDaftar({ akaun: 'sekolah-x', ttlMs: 60_000, pentadbir: true });
  await kedai.daftarPeranti({ kodDaftar, idPeranti: 'p1', akaun: 'sekolah-x', nama: 'PC 1', rahsia: 'rahsia123' });
  await kedai.klaimKepimpinan({ idPeranti: 'p1', akaun: 'sekolah-x', rahsia: 'rahsia123' });
  const status = await kedai.statusPerantiAwam();
  assert.equal(status.length, 1);
  sahkanStruktur(status[0], skema.$defs.StatusAwam);
});

test('skema: SenaraiPerantiAdmin (array RekodPeranti) sepadan dengan kontrak', async () => {
  const kedai = buatKedai();
  const { kodDaftar } = await kedai.terbitKodDaftar({ akaun: 'sekolah-x', ttlMs: 60_000, pentadbir: true });
  await kedai.daftarPeranti({ kodDaftar, idPeranti: 'p1', akaun: 'sekolah-x', nama: 'PC 1', rahsia: 'rahsia123' });
  const senarai = await kedai.senaraiPerantiAdmin({ akaun: 'sekolah-x', pentadbir: true });
  assert.ok(Array.isArray(senarai));
  for (const rekod of senarai) sahkanStruktur(rekod, skema.$defs.RekodPeranti);
});
