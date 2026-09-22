import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { buatKedaiPeranti, kelaskanKeadaanPeranti } from '../kontrak.mjs';

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
    _map: map,
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
  return {
    now: () => sekarang,
    maju(ms) {
      sekarang += ms;
    },
  };
}

const hash = { sha256: (s) => crypto.createHash('sha256').update(String(s)).digest('hex') };
const randomId = { uuid: () => crypto.randomUUID() };

function buatKedai({ ciriDidayakan = () => true, senaraiTugasAktif = async () => [], clock } = {}) {
  const storage = buatStoranPalsu();
  const lock = buatKunciPalsu();
  const jam = clock || buatJamPalsu(1_000_000);
  const kedai = buatKedaiPeranti({
    storage,
    lock,
    clock: jam,
    hash,
    randomId,
    ciriDidayakan,
    senaraiTugasAktif,
  });
  return { kedai, storage, jam };
}

async function daftarPerantiBaharu(kedai, { akaun = 'a', idPeranti, nama = 'PC Admin', rahsia = 'rahsia-panjang' } = {}) {
  const { kodDaftar } = await kedai.terbitKodDaftar({ akaun, ttlMs: 60_000, pentadbir: true });
  return kedai.daftarPeranti({ kodDaftar, idPeranti, akaun, nama, rahsia });
}

test('1. bendera ciri OFF -> semua kaedah awam melontar mesej "dilumpuhkan"', async () => {
  const { kedai } = buatKedai({ ciriDidayakan: () => false });
  await assert.rejects(() => kedai.terbitKodDaftar({ akaun: 'a', ttlMs: 1000, pentadbir: true }), /dilumpuhkan/);
  await assert.rejects(() => kedai.daftarPeranti({ kodDaftar: 'x', idPeranti: 'p1', akaun: 'a', nama: 'n', rahsia: 'r' }), /dilumpuhkan/);
  await assert.rejects(() => kedai.nyahaktifPeranti({ idPeranti: 'p1', akaun: 'a', pentadbir: true }), /dilumpuhkan/);
  await assert.rejects(() => kedai.degup({ idPeranti: 'p1', akaun: 'a', rahsia: 'r' }), /dilumpuhkan/);
  await assert.rejects(() => kedai.klaimKepimpinan({ idPeranti: 'p1', akaun: 'a', rahsia: 'r' }), /dilumpuhkan/);
  await assert.rejects(() => kedai.sahkanPenulis({ idPeranti: 'p1', akaun: 'a', rahsia: 'r', generasi: 1 }), /dilumpuhkan/);
  await assert.rejects(() => kedai.senaraiPerantiAdmin({ akaun: 'a', pentadbir: true }), /dilumpuhkan/);
  // statusPerantiAwam tidak melontar (ia awam) tetapi harus kosong sentiasa tanpa peranti berdaftar.
  const status = await kedai.statusPerantiAwam();
  assert.deepEqual(status, []);
});

test('2. kod daftar: sekali guna, luput, dan kod salah ditolak', async () => {
  const { kedai, jam } = buatKedai();
  const { kodDaftar, luputMs } = await kedai.terbitKodDaftar({ akaun: 'a', ttlMs: 1000, pentadbir: true });
  assert.equal(luputMs, jam.now() + 1000);

  await assert.rejects(
    () => kedai.daftarPeranti({ kodDaftar: 'kod-salah', idPeranti: 'p1', akaun: 'a', nama: 'n', rahsia: 'r' }),
    /Kod daftar tidak sah/
  );

  await kedai.daftarPeranti({ kodDaftar, idPeranti: 'p1', akaun: 'a', nama: 'n', rahsia: 'r' });
  // guna semula kod yang sama sepatutnya ditolak (single-use)
  await assert.rejects(
    () => kedai.daftarPeranti({ kodDaftar, idPeranti: 'p2', akaun: 'a', nama: 'n', rahsia: 'r' }),
    /digunakan/
  );

  const { kodDaftar: kodBaharu } = await kedai.terbitKodDaftar({ akaun: 'a', ttlMs: 1000, pentadbir: true });
  jam.maju(1001);
  await assert.rejects(
    () => kedai.daftarPeranti({ kodDaftar: kodBaharu, idPeranti: 'p3', akaun: 'a', nama: 'n', rahsia: 'r' }),
    /luput/
  );
});

test('3. daftarPeranti: rekod aktif dihasilkan, rahsia hanya disimpan sebagai hash', async () => {
  const { kedai, storage } = buatKedai();
  const rekod = await daftarPerantiBaharu(kedai, { idPeranti: 'p1', rahsia: 'rahsia-rahsia' });
  assert.equal(rekod.status, 'aktif');
  assert.equal(rekod.generasi, 1);
  assert.equal(rekod.idPeranti, 'p1');
  assert.equal(rekod.rahsiaHash, undefined);
  assert.equal(rekod.rahsia, undefined);

  const mentah = await storage.get('peranti:p1');
  assert.notEqual(mentah.rahsiaHash, 'rahsia-rahsia');
  assert.equal(mentah.rahsiaHash, hash.sha256('rahsia-rahsia'));
  assert.equal(JSON.stringify(mentah).includes('rahsia-rahsia'), false);
});

test('4. tiada kepimpinan peranti tidak diluluskan: peranti tidak berdaftar / nyahaktif ditolak', async () => {
  const { kedai } = buatKedai();
  await assert.rejects(
    () => kedai.klaimKepimpinan({ idPeranti: 'tidak-wujud', akaun: 'a', rahsia: 'r' }),
    /Akses peranti ditolak/
  );

  await daftarPerantiBaharu(kedai, { idPeranti: 'p1', rahsia: 'rahsia1' });
  await kedai.nyahaktifPeranti({ idPeranti: 'p1', akaun: 'a', pentadbir: true });
  await assert.rejects(
    () => kedai.klaimKepimpinan({ idPeranti: 'p1', akaun: 'a', rahsia: 'rahsia1' }),
    /Peranti tidak diluluskan/
  );
});

test('5. konkurensi: dua peranti bertanding klaimKepimpinan serentak -> tepat satu menang', async () => {
  const { kedai } = buatKedai();
  await daftarPerantiBaharu(kedai, { idPeranti: 'A', rahsia: 'rahsiaA' });
  await daftarPerantiBaharu(kedai, { idPeranti: 'B', rahsia: 'rahsiaB' });

  const hasil = await Promise.allSettled([
    kedai.klaimKepimpinan({ idPeranti: 'A', akaun: 'a', rahsia: 'rahsiaA' }),
    kedai.klaimKepimpinan({ idPeranti: 'B', akaun: 'a', rahsia: 'rahsiaB' }),
  ]);

  const berjaya = hasil.filter((h) => h.status === 'fulfilled');
  const gagal = hasil.filter((h) => h.status === 'rejected');
  assert.equal(berjaya.length, 1);
  assert.equal(gagal.length, 1);
  assert.match(gagal[0].reason.message, /Pemimpin aktif lain memegang lease/);
});

test('6. pemimpin lapuk ditolak; pembaharuan oleh pemilik sendiri berjaya', async () => {
  const { kedai, jam } = buatKedai();
  await daftarPerantiBaharu(kedai, { idPeranti: 'A', rahsia: 'rahsiaA' });
  await daftarPerantiBaharu(kedai, { idPeranti: 'B', rahsia: 'rahsiaB' });

  const klaimA = await kedai.klaimKepimpinan({ idPeranti: 'A', akaun: 'a', rahsia: 'rahsiaA' });
  assert.equal(klaimA.pemimpin, 'A');

  await assert.rejects(
    () => kedai.klaimKepimpinan({ idPeranti: 'B', akaun: 'a', rahsia: 'rahsiaB' }),
    /Pemimpin aktif lain memegang lease/
  );

  jam.maju(1000);
  const degupA = await kedai.degup({ idPeranti: 'A', akaun: 'a', rahsia: 'rahsiaA' });
  assert.equal(degupA.pemimpin, true);

  const klaimSemulaA = await kedai.klaimKepimpinan({ idPeranti: 'A', akaun: 'a', rahsia: 'rahsiaA' });
  assert.equal(klaimSemulaA.pemimpin, 'A');
});

test('7. nyahaktifPeranti memagar: penulis lama ditolak dan tidak boleh menjadi pemimpin semula', async () => {
  const { kedai } = buatKedai();
  await daftarPerantiBaharu(kedai, { idPeranti: 'A', rahsia: 'rahsiaA' });
  const klaimA = await kedai.klaimKepimpinan({ idPeranti: 'A', akaun: 'a', rahsia: 'rahsiaA' });

  await kedai.nyahaktifPeranti({ idPeranti: 'A', akaun: 'a', pentadbir: true });

  await assert.rejects(
    () => kedai.sahkanPenulis({ idPeranti: 'A', akaun: 'a', rahsia: 'rahsiaA', generasi: klaimA.generasi }),
    /Peranti tidak diluluskan/
  );
  await assert.rejects(
    () => kedai.klaimKepimpinan({ idPeranti: 'A', akaun: 'a', rahsia: 'rahsiaA' }),
    /Peranti tidak diluluskan/
  );
});

test('8. tamat lease TANPA degup bukan bukti automatik; kelaskanKeadaanPeranti -> luput selepas lease tamat', async () => {
  const { kedai, jam } = buatKedai();
  await daftarPerantiBaharu(kedai, { idPeranti: 'A', rahsia: 'rahsiaA' });
  await daftarPerantiBaharu(kedai, { idPeranti: 'B', rahsia: 'rahsiaB' });

  const klaimA = await kedai.klaimKepimpinan({ idPeranti: 'A', akaun: 'a', rahsia: 'rahsiaA' });
  const sekarangSelepasKlaim = jam.now();

  const status = kelaskanKeadaanPeranti({
    lastSeenMs: sekarangSelepasKlaim,
    leaseMs: klaimA.leaseMs,
    now: sekarangSelepasKlaim,
    ambangMs: 5000,
  });
  assert.equal(status, 'aktif');

  jam.maju(50_000); // melepasi LEASE_TTL_MS (45s) tanpa sebarang degup
  const statusLuput = kelaskanKeadaanPeranti({
    lastSeenMs: sekarangSelepasKlaim,
    leaseMs: klaimA.leaseMs,
    now: jam.now(),
    ambangMs: 5000,
  });
  assert.equal(statusLuput, 'luput');

  const klaimB = await kedai.klaimKepimpinan({ idPeranti: 'B', akaun: 'a', rahsia: 'rahsiaB' });
  assert.equal(klaimB.pemimpin, 'B');
});

test('9. lease tamat + tiada tugasan aktif -> pengambilalihan dibenarkan, B menang', async () => {
  const { kedai, jam } = buatKedai({ senaraiTugasAktif: async () => [] });
  await daftarPerantiBaharu(kedai, { idPeranti: 'A', rahsia: 'rahsiaA' });
  await daftarPerantiBaharu(kedai, { idPeranti: 'B', rahsia: 'rahsiaB' });

  await kedai.klaimKepimpinan({ idPeranti: 'A', akaun: 'a', rahsia: 'rahsiaA' });
  jam.maju(46_000);

  const klaimB = await kedai.klaimKepimpinan({ idPeranti: 'B', akaun: 'a', rahsia: 'rahsiaB' });
  assert.equal(klaimB.pemimpin, 'B');
});

test('10. tugasan aktif pemimpin lama menghalang pertindihan pengambilalihan', async () => {
  const { kedai, jam } = buatKedai({ senaraiTugasAktif: async () => [{ pemilik: 'A' }] });
  await daftarPerantiBaharu(kedai, { idPeranti: 'A', rahsia: 'rahsiaA' });
  await daftarPerantiBaharu(kedai, { idPeranti: 'B', rahsia: 'rahsiaB' });

  await kedai.klaimKepimpinan({ idPeranti: 'A', akaun: 'a', rahsia: 'rahsiaA' });
  jam.maju(46_000);

  await assert.rejects(
    () => kedai.klaimKepimpinan({ idPeranti: 'B', akaun: 'a', rahsia: 'rahsiaB' }),
    /Tugasan aktif masih dipegang pemimpin sedia ada/
  );
});

test('11. tiada penulisan tertindih atas terma baharu: generasi lapuk ditolak oleh sahkanPenulis', async () => {
  const { kedai } = buatKedai();
  await daftarPerantiBaharu(kedai, { idPeranti: 'A', rahsia: 'rahsiaA' });
  const klaim1 = await kedai.klaimKepimpinan({ idPeranti: 'A', akaun: 'a', rahsia: 'rahsiaA' });
  const klaim2 = await kedai.klaimKepimpinan({ idPeranti: 'A', akaun: 'a', rahsia: 'rahsiaA' }); // pembaharuan -> generasi naik
  assert.equal(klaim2.generasi, klaim1.generasi + 1);

  await assert.rejects(
    () => kedai.sahkanPenulis({ idPeranti: 'A', akaun: 'a', rahsia: 'rahsiaA', generasi: klaim1.generasi }),
    /Generasi lapuk/
  );
  const ok = await kedai.sahkanPenulis({ idPeranti: 'A', akaun: 'a', rahsia: 'rahsiaA', generasi: klaim2.generasi });
  assert.deepEqual(ok, { ok: true });
});

test('12. statusPerantiAwam tiada PII/rahsia; kelaskanKeadaanPeranti membezakan 4 keadaan', async () => {
  const { kedai, jam } = buatKedai();
  await daftarPerantiBaharu(kedai, { idPeranti: 'A', rahsia: 'rahsiaA', nama: 'Nama Sulit' });
  await kedai.klaimKepimpinan({ idPeranti: 'A', akaun: 'a', rahsia: 'rahsiaA' });

  const status = await kedai.statusPerantiAwam();
  assert.equal(status.length, 1);
  const s = status[0];
  const kunci = Object.keys(s).sort();
  assert.deepEqual(kunci, ['akaun', 'generasi', 'leaseMs', 'lastSeenMs', 'pemimpin'].sort());
  const gambaran = JSON.stringify(s);
  assert.equal(gambaran.includes('Nama Sulit'), false);
  assert.equal(gambaran.includes('rahsia'), false);
  assert.equal(gambaran.includes('Hash'), false);

  assert.equal(
    kelaskanKeadaanPeranti({ lastSeenMs: null, leaseMs: null, now: jam.now(), ambangMs: 5000 }),
    'tidak_diketahui'
  );
  assert.equal(
    kelaskanKeadaanPeranti({ lastSeenMs: jam.now() - 10_000, leaseMs: jam.now() + 1000, now: jam.now(), ambangMs: 5000 }),
    'luar_talian'
  );
  assert.equal(
    kelaskanKeadaanPeranti({ lastSeenMs: jam.now(), leaseMs: jam.now() - 1, now: jam.now(), ambangMs: 5000 }),
    'luput'
  );
  assert.equal(
    kelaskanKeadaanPeranti({ lastSeenMs: jam.now(), leaseMs: jam.now() + 1000, now: jam.now(), ambangMs: 5000 }),
    'aktif'
  );
});

test('13. senaraiPerantiAdmin memerlukan pentadbir dan tidak membocorkan rahsia', async () => {
  const { kedai } = buatKedai();
  await daftarPerantiBaharu(kedai, { idPeranti: 'A', rahsia: 'rahsiaA' });
  await daftarPerantiBaharu(kedai, { idPeranti: 'B', rahsia: 'rahsiaB' });

  await assert.rejects(
    () => kedai.senaraiPerantiAdmin({ akaun: 'a', pentadbir: false }),
    /Akses pentadbir diperlukan/
  );

  const senarai = await kedai.senaraiPerantiAdmin({ akaun: 'a', pentadbir: true });
  assert.equal(senarai.length, 2);
  for (const rec of senarai) {
    assert.equal(rec.rahsiaHash, undefined);
    assert.equal(JSON.stringify(rec).toLowerCase().includes('rahsia'), false);
  }
});

test('14. kod daftar sekali guna: dua pendaftaran serentak dengan kod sama -> tepat satu berjaya', async () => {
  const { kedai } = buatKedai();
  const { kodDaftar } = await kedai.terbitKodDaftar({ akaun: 'a', ttlMs: 60_000, pentadbir: true });
  const hasil = await Promise.allSettled([
    kedai.daftarPeranti({ kodDaftar, idPeranti: 'p1', akaun: 'a', nama: 'n1', rahsia: 'r1' }),
    kedai.daftarPeranti({ kodDaftar, idPeranti: 'p2', akaun: 'a', nama: 'n2', rahsia: 'r2' }),
  ]);
  const berjaya = hasil.filter((h) => h.status === 'fulfilled');
  const gagal = hasil.filter((h) => h.status === 'rejected');
  assert.equal(berjaya.length, 1, 'tepat satu pendaftaran mesti berjaya');
  assert.equal(gagal.length, 1, 'tepat satu pendaftaran mesti gagal');
  assert.match(gagal[0].reason.message, /digunakan|sah/);
});

