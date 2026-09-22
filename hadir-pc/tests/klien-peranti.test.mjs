// hadir-pc/tests/klien-peranti.test.mjs
// Ujian klien RPC berbilang PC. Semua panggilan HTTP dipalsukan (fetchImpl) —
// TIADA rangkaian sebenar dilancarkan.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buatKlienPeranti, sahkanKontrak } from '../klien-peranti.mjs';

function buatFetchPalsu(jawapan) {
  const panggilan = [];
  const fetchImpl = async (url, opsyen) => {
    panggilan.push({ url, opsyen });
    return {
      status: 200,
      async text() {
        return JSON.stringify(jawapan);
      },
    };
  };
  fetchImpl.panggilan = panggilan;
  return fetchImpl;
}

const REKOD_PERANTI_SAH = {
  idPeranti: 'p1',
  akaun: 'a1',
  nama: 'PC Kaunter',
  status: 'aktif',
  generasi: 1,
  diciptaMs: 1000,
  dilulusMs: 1000,
  lastSeenMs: null,
  nyahaktifMs: null,
};

test('daftar: menghantar POST {mode:hadir} dengan User-Agent pelayar dan menerima bentuk sah', async () => {
  const fetchImpl = buatFetchPalsu({ ok: true, hasil: REKOD_PERANTI_SAH });
  const klien = buatKlienPeranti({ apiUrl: 'https://contoh.invalid/exec', fetchImpl });
  const hasil = await klien.daftar('kod123', 'p1', 'a1', 'PC Kaunter', 'rahsia-rawak');
  assert.deepEqual(hasil, REKOD_PERANTI_SAH);

  assert.equal(fetchImpl.panggilan.length, 1);
  const { url, opsyen } = fetchImpl.panggilan[0];
  assert.equal(url, 'https://contoh.invalid/exec');
  assert.equal(opsyen.method, 'POST');
  assert.match(opsyen.headers['User-Agent'], /Mozilla/);
  const badan = JSON.parse(opsyen.body);
  assert.equal(badan.mode, 'hadir');
  assert.equal(badan.kaedah, 'pcDaftarPeranti');
  assert.deepEqual(badan.argumen, ['kod123', 'p1', 'a1', 'PC Kaunter', 'rahsia-rawak']);
});

test('daftar: bentuk cacat (medan tiada) ditolak', async () => {
  const rekodCacat = { ...REKOD_PERANTI_SAH };
  delete rekodCacat.generasi;
  const fetchImpl = buatFetchPalsu({ ok: true, hasil: rekodCacat });
  const klien = buatKlienPeranti({ apiUrl: 'https://contoh.invalid/exec', fetchImpl });
  await assert.rejects(
    () => klien.daftar('kod123', 'p1', 'a1', 'PC Kaunter', 'rahsia-rawak'),
    /Bentuk balasan tidak sah/
  );
});

test('daftar: bentuk cacat (jenis salah) ditolak', async () => {
  const rekodCacat = { ...REKOD_PERANTI_SAH, generasi: 'satu' };
  const fetchImpl = buatFetchPalsu({ ok: true, hasil: rekodCacat });
  const klien = buatKlienPeranti({ apiUrl: 'https://contoh.invalid/exec', fetchImpl });
  await assert.rejects(
    () => klien.daftar('kod123', 'p1', 'a1', 'PC Kaunter', 'rahsia-rawak'),
    /Bentuk balasan tidak sah/
  );
});

test('!ok -> melontar ralat daripada j.ralat', async () => {
  const fetchImpl = buatFetchPalsu({ ok: false, ralat: 'Ciri berbilang PC dilumpuhkan.' });
  const klien = buatKlienPeranti({ apiUrl: 'https://contoh.invalid/exec', fetchImpl });
  await assert.rejects(
    () => klien.daftar('kod123', 'p1', 'a1', 'PC Kaunter', 'rahsia-rawak'),
    /Ciri berbilang PC dilumpuhkan\./
  );
});

test('degup: bentuk sah diterima', async () => {
  const jawapan = { ok: true, pemimpin: true, generasi: 3 };
  const fetchImpl = buatFetchPalsu({ ok: true, hasil: jawapan });
  const klien = buatKlienPeranti({ apiUrl: 'https://contoh.invalid/exec', fetchImpl });
  const hasil = await klien.degup('p1', 'a1', 'rahsia-rawak');
  assert.deepEqual(hasil, jawapan);
});

test('degup: bentuk cacat (pemimpin bukan boolean) ditolak', async () => {
  const fetchImpl = buatFetchPalsu({ ok: true, hasil: { ok: true, pemimpin: 'ya', generasi: 3 } });
  const klien = buatKlienPeranti({ apiUrl: 'https://contoh.invalid/exec', fetchImpl });
  await assert.rejects(() => klien.degup('p1', 'a1', 'rahsia-rawak'), /Bentuk balasan tidak sah/);
});

test('klaimKepimpinan: bentuk sah diterima', async () => {
  const jawapan = { ok: true, pemimpin: 'p1', generasi: 4, leaseMs: 99999 };
  const fetchImpl = buatFetchPalsu({ ok: true, hasil: jawapan });
  const klien = buatKlienPeranti({ apiUrl: 'https://contoh.invalid/exec', fetchImpl });
  const hasil = await klien.klaimKepimpinan('p1', 'a1', 'rahsia-rawak');
  assert.deepEqual(hasil, jawapan);
});

test('klaimKepimpinan: bentuk cacat (ok bukan true) ditolak', async () => {
  const fetchImpl = buatFetchPalsu({ ok: true, hasil: { ok: false, pemimpin: 'p1', generasi: 4, leaseMs: 99999 } });
  const klien = buatKlienPeranti({ apiUrl: 'https://contoh.invalid/exec', fetchImpl });
  await assert.rejects(() => klien.klaimKepimpinan('p1', 'a1', 'rahsia-rawak'), /Bentuk balasan tidak sah/);
});

test('senaraiPerantiAdmin: senarai sah diterima', async () => {
  const fetchImpl = buatFetchPalsu({ ok: true, hasil: [REKOD_PERANTI_SAH] });
  const klien = buatKlienPeranti({ apiUrl: 'https://contoh.invalid/exec', fetchImpl });
  const hasil = await klien.senaraiPerantiAdmin('a1', 'token-admin');
  assert.deepEqual(hasil, [REKOD_PERANTI_SAH]);
});

test('senaraiPerantiAdmin: bukan senarai ditolak', async () => {
  const fetchImpl = buatFetchPalsu({ ok: true, hasil: REKOD_PERANTI_SAH });
  const klien = buatKlienPeranti({ apiUrl: 'https://contoh.invalid/exec', fetchImpl });
  await assert.rejects(() => klien.senaraiPerantiAdmin('a1', 'token-admin'), /bukan senarai/);
});

test('senaraiPerantiAdmin: anggota senarai cacat ditolak', async () => {
  const rekodCacat = { ...REKOD_PERANTI_SAH };
  delete rekodCacat.nama;
  const fetchImpl = buatFetchPalsu({ ok: true, hasil: [rekodCacat] });
  const klien = buatKlienPeranti({ apiUrl: 'https://contoh.invalid/exec', fetchImpl });
  await assert.rejects(() => klien.senaraiPerantiAdmin('a1', 'token-admin'), /Bentuk balasan tidak sah/);
});

test('statusAwam: senarai sah diterima dan tiada rahsia/PII', async () => {
  const status = [{ akaun: 'a1', pemimpin: 'p1', lastSeenMs: 500, leaseMs: 99999, generasi: 4 }];
  const fetchImpl = buatFetchPalsu({ ok: true, hasil: status });
  const klien = buatKlienPeranti({ apiUrl: 'https://contoh.invalid/exec', fetchImpl });
  const hasil = await klien.statusAwam();
  assert.deepEqual(hasil, status);
  assert.ok(!('rahsiaHash' in hasil[0]));
  assert.ok(!('nama' in hasil[0]));
});

test('statusAwam: bentuk cacat (leaseMs tiada) ditolak', async () => {
  const rekodCacat = { akaun: 'a1', pemimpin: 'p1', lastSeenMs: 500, generasi: 4 };
  const fetchImpl = buatFetchPalsu({ ok: true, hasil: [rekodCacat] });
  const klien = buatKlienPeranti({ apiUrl: 'https://contoh.invalid/exec', fetchImpl });
  await assert.rejects(() => klien.statusAwam(), /Bentuk balasan tidak sah/);
});

test('balasan bukan JSON melontar ralat jelas', async () => {
  const fetchImpl = async () => ({ status: 500, async text() { return 'bukan json'; } });
  const klien = buatKlienPeranti({ apiUrl: 'https://contoh.invalid/exec', fetchImpl });
  await assert.rejects(() => klien.statusAwam(), /Balasan bukan JSON/);
});

test('sahkanKontrak: diekspot dan boleh diguna terus untuk bentuk tersuai', () => {
  assert.deepEqual(sahkanKontrak({ a: 1 }, { a: 'number' }, 'Ujian'), { a: 1 });
  assert.throws(() => sahkanKontrak({ a: 'x' }, { a: 'number' }, 'Ujian'), /Bentuk balasan tidak sah/);
});
