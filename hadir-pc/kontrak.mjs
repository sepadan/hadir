// hadir-pc/kontrak.mjs
// Modul domain tulen (dependency-free) untuk pendaftaran peranti, kepimpinan
// (leadership) dengan lease, dan fencing generasi monotonik bagi ciri
// "berbilang PC" HADIR. Semua kebergantungan luar disuntik (storage, lock,
// clock, hash, randomId, ciriDidayakan, senaraiTugasAktif) supaya modul ini
// boleh diuji sepenuhnya dengan fake — tiada panggilan rangkaian/Sheets di sini.

const LEASE_TTL_MS = 45_000;

export const KONTRAK = {
  LEASE_TTL_MS,
  $defs: {
    RekodPeranti: {
      fields: {
        idPeranti: 'string',
        akaun: 'string',
        nama: 'string',
        status: "'aktif' | 'nyahaktif'",
        generasi: 'number',
        diciptaMs: 'number',
        dilulusMs: 'number',
        lastSeenMs: 'number | null',
        nyahaktifMs: 'number | null',
      },
    },
    RekodKepimpinan: {
      fields: {
        pemimpin: 'string | null',
        leaseMs: 'number',
        generasi: 'number',
      },
    },
    KodDaftar: {
      fields: { kodDaftar: 'string', luputMs: 'number' },
    },
    JawapanDegup: {
      fields: { ok: 'true', pemimpin: 'boolean', generasi: 'number' },
    },
    JawapanKlaim: {
      fields: { ok: 'true', pemimpin: 'string', generasi: 'number', leaseMs: 'number' },
    },
    StatusAwam: {
      fields: {
        akaun: 'string',
        pemimpin: 'string | null',
        lastSeenMs: 'number | null',
        leaseMs: 'number',
        generasi: 'number',
      },
    },
    SenaraiPerantiAdmin: {
      fields: {
        idPeranti: 'string',
        akaun: 'string',
        nama: 'string',
        status: "'aktif' | 'nyahaktif'",
        generasi: 'number',
        diciptaMs: 'number',
        dilulusMs: 'number',
        lastSeenMs: 'number | null',
        nyahaktifMs: 'number | null',
      },
    },
  },
};

const CIRI_DILUMPUHKAN = 'Ciri berbilang PC dilumpuhkan.';

export function kelaskanKeadaanPeranti({ lastSeenMs, leaseMs, now, ambangMs }) {
  if (lastSeenMs === null || lastSeenMs === undefined) return 'tidak_diketahui';
  if (typeof leaseMs === 'number' && leaseMs <= now) return 'luput';
  if (now - lastSeenMs > ambangMs) return 'luar_talian';
  return 'aktif';
}

function sanitisePeranti(rec) {
  return {
    idPeranti: rec.idPeranti,
    akaun: rec.akaun,
    nama: rec.nama,
    status: rec.status,
    generasi: rec.generasi,
    diciptaMs: rec.diciptaMs,
    dilulusMs: rec.dilulusMs,
    lastSeenMs: rec.lastSeenMs,
    nyahaktifMs: rec.nyahaktifMs,
  };
}

function kunciPeranti(idPeranti) {
  return `peranti:${idPeranti}`;
}
function kunciAkaun(akaun) {
  return `akaun:${akaun}`;
}
function kunciKodDaftar(hashKod) {
  return `kodDaftar:${hashKod}`;
}

export function buatKedaiPeranti({
  storage,
  lock,
  clock,
  hash,
  randomId,
  ciriDidayakan,
  senaraiTugasAktif,
}) {
  function pastikanDidayakan() {
    if (!ciriDidayakan()) throw new Error(CIRI_DILUMPUHKAN);
  }

  async function bacaAkaun(akaun) {
    const rec = await storage.get(kunciAkaun(akaun));
    return rec || { pemimpin: null, leaseMs: 0, generasi: 0 };
  }

  async function sahkanPerantiAktif({ idPeranti, akaun, rahsia }) {
    const rec = await storage.get(kunciPeranti(idPeranti));
    if (!rec || rec.akaun !== akaun || rec.rahsiaHash !== hash.sha256(rahsia)) {
      throw new Error('Akses peranti ditolak.');
    }
    if (rec.status !== 'aktif') {
      throw new Error('Peranti tidak diluluskan.');
    }
    return rec;
  }

  async function terbitKodDaftar({ akaun, ttlMs, pentadbir }) {
    pastikanDidayakan();
    if (pentadbir !== true) throw new Error('Akses pentadbir diperlukan.');
    const now = clock.now();
    const kodDaftar = randomId.uuid();
    const hashKod = hash.sha256(kodDaftar);
    const luputMs = now + ttlMs;
    await storage.set(kunciKodDaftar(hashKod), {
      akaun,
      luputMs,
      digunakan: false,
      digunakanOleh: null,
    });
    return { kodDaftar, luputMs };
  }

  async function daftarPeranti({ kodDaftar, idPeranti, akaun, nama, rahsia }) {
    pastikanDidayakan();
    if (!rahsia) throw new Error('Rahsia peranti diperlukan.');
    // Seluruh pengesahan kod + tandaan "digunakan" + penciptaan peranti dijalankan
    // di bawah kunci: kod daftar adalah SEKALI GUNA, jadi dua pendaftaran serentak
    // dengan kod yang sama mesti hanya satu yang berjaya.
    return lock.withLock(async () => {
      const hashKod = hash.sha256(kodDaftar);
      const kunci = kunciKodDaftar(hashKod);
      const kod = await storage.get(kunci);
      const now = clock.now();
      if (!kod) throw new Error('Kod daftar tidak sah.');
      if (kod.digunakan) throw new Error('Kod daftar telah digunakan.');
      if (kod.luputMs < now) throw new Error('Kod daftar telah luput.');
      if (kod.akaun !== akaun) throw new Error('Kod daftar tidak sah untuk akaun ini.');

      const sediaAda = await storage.get(kunciPeranti(idPeranti));
      if (sediaAda) throw new Error('Peranti sudah didaftarkan.');

      await storage.set(kunci, { ...kod, digunakan: true, digunakanOleh: idPeranti });

      const namaBersih = String(nama || '').trim().slice(0, 80);
      const rekod = {
        idPeranti,
        akaun,
        nama: namaBersih,
        rahsiaHash: hash.sha256(rahsia),
        status: 'aktif',
        generasi: 1,
        diciptaMs: now,
        dilulusMs: now,
        lastSeenMs: null,
        nyahaktifMs: null,
      };
      await storage.set(kunciPeranti(idPeranti), rekod);
      return sanitisePeranti(rekod);
    });
  }

  async function nyahaktifPeranti({ idPeranti, akaun, pentadbir }) {
    pastikanDidayakan();
    if (pentadbir !== true) throw new Error('Akses pentadbir diperlukan.');
    return lock.withLock(async () => {
      const rec = await storage.get(kunciPeranti(idPeranti));
      if (!rec || rec.akaun !== akaun) throw new Error('Peranti tidak ditemui.');
      const now = clock.now();
      rec.status = 'nyahaktif';
      rec.generasi += 1;
      rec.nyahaktifMs = now;
      await storage.set(kunciPeranti(idPeranti), rec);

      const akaunRec = await bacaAkaun(akaun);
      if (akaunRec.pemimpin === idPeranti) {
        akaunRec.pemimpin = null;
        akaunRec.leaseMs = 0;
        akaunRec.generasi += 1;
        await storage.set(kunciAkaun(akaun), akaunRec);
      }
      const akaunAkhir = await bacaAkaun(akaun);
      return { ok: true, generasi: akaunAkhir.generasi };
    });
  }

  async function degup({ idPeranti, akaun, rahsia }) {
    pastikanDidayakan();
    const rec = await sahkanPerantiAktif({ idPeranti, akaun, rahsia });
    const now = clock.now();
    rec.lastSeenMs = now;
    const akaunRec = await bacaAkaun(akaun);
    const adalahPemimpin = akaunRec.pemimpin === idPeranti;
    if (adalahPemimpin) {
      akaunRec.leaseMs = now + LEASE_TTL_MS;
      await storage.set(kunciAkaun(akaun), akaunRec);
    }
    await storage.set(kunciPeranti(idPeranti), rec);
    return { ok: true, pemimpin: adalahPemimpin, generasi: akaunRec.generasi };
  }

  async function klaimKepimpinan({ idPeranti, akaun, rahsia }) {
    pastikanDidayakan();
    await sahkanPerantiAktif({ idPeranti, akaun, rahsia });
    return lock.withLock(async () => {
      // Sah semula di dalam kunci — status peranti mungkin berubah semasa menunggu giliran.
      await sahkanPerantiAktif({ idPeranti, akaun, rahsia });
      const now = clock.now();
      const akaunRec = await bacaAkaun(akaun);

      if (!akaunRec.pemimpin) {
        const baharu = { pemimpin: idPeranti, leaseMs: now + LEASE_TTL_MS, generasi: akaunRec.generasi + 1 };
        await storage.set(kunciAkaun(akaun), baharu);
        return { ok: true, pemimpin: idPeranti, generasi: baharu.generasi, leaseMs: baharu.leaseMs };
      }

      if (akaunRec.pemimpin === idPeranti) {
        const diperbaharui = { pemimpin: idPeranti, leaseMs: now + LEASE_TTL_MS, generasi: akaunRec.generasi + 1 };
        await storage.set(kunciAkaun(akaun), diperbaharui);
        return { ok: true, pemimpin: idPeranti, generasi: diperbaharui.generasi, leaseMs: diperbaharui.leaseMs };
      }

      if (akaunRec.leaseMs > now) {
        throw new Error('Pemimpin aktif lain memegang lease.');
      }

      const pemimpinLama = akaunRec.pemimpin;
      const tugasAktif = await senaraiTugasAktif(akaun);
      if (Array.isArray(tugasAktif) && tugasAktif.some((t) => t.pemilik === pemimpinLama)) {
        throw new Error('Tugasan aktif masih dipegang pemimpin sedia ada — ambil alih ditolak.');
      }

      const ambilAlih = { pemimpin: idPeranti, leaseMs: now + LEASE_TTL_MS, generasi: akaunRec.generasi + 1 };
      await storage.set(kunciAkaun(akaun), ambilAlih);
      return { ok: true, pemimpin: idPeranti, generasi: ambilAlih.generasi, leaseMs: ambilAlih.leaseMs };
    });
  }

  async function sahkanPenulis({ idPeranti, akaun, rahsia, generasi }) {
    pastikanDidayakan();
    await sahkanPerantiAktif({ idPeranti, akaun, rahsia });
    const akaunRec = await bacaAkaun(akaun);
    if (akaunRec.pemimpin !== idPeranti) {
      throw new Error('Peranti bukan pemimpin semasa.');
    }
    if (akaunRec.generasi !== generasi) {
      throw new Error('Generasi lapuk — penulis telah dipagar.');
    }
    return { ok: true };
  }

  async function senaraiPerantiAdmin({ akaun, pentadbir }) {
    pastikanDidayakan();
    if (pentadbir !== true) throw new Error('Akses pentadbir diperlukan.');
    const kunciSenarai = await storage.keysWithPrefix('peranti:');
    const hasil = [];
    for (const k of kunciSenarai) {
      const rec = await storage.get(k);
      if (rec && rec.akaun === akaun) hasil.push(sanitisePeranti(rec));
    }
    return hasil;
  }

  async function statusPerantiAwam() {
    // Tiada gate ciri/pentadbir di sini secara sengaja: ini status AWAM.
    // Namun apabila ciri dilumpuhkan, tiada peranti/akaun akan wujud dalam
    // storan produksi (kerana daftarPeranti/klaimKepimpinan menolak), jadi
    // ia secara semula jadi memulangkan senarai kosong.
    const kunciSenarai = await storage.keysWithPrefix('akaun:');
    const hasil = [];
    for (const k of kunciSenarai) {
      const akaun = k.slice('akaun:'.length);
      const rec = await storage.get(k);
      if (!rec) continue;
      let lastSeenMs = null;
      if (rec.pemimpin) {
        const perantiRec = await storage.get(kunciPeranti(rec.pemimpin));
        if (perantiRec) lastSeenMs = perantiRec.lastSeenMs;
      }
      hasil.push({
        akaun,
        pemimpin: rec.pemimpin,
        lastSeenMs,
        leaseMs: rec.leaseMs,
        generasi: rec.generasi,
      });
    }
    return hasil;
  }

  return {
    terbitKodDaftar,
    daftarPeranti,
    nyahaktifPeranti,
    degup,
    klaimKepimpinan,
    sahkanPenulis,
    senaraiPerantiAdmin,
    statusPerantiAwam,
  };
}
