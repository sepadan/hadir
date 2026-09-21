// Ujian pengurus kumpulan pelayar (companion/src/moeis/kumpulan-pelayar.mjs).
//
// Ini ialah glu antara kunci eksklusif pelayar (kunci-pelayar.mjs), dispatcher
// IPC (dispatcher-kumpulan.mjs, disuntik di sini sebagai fabrik palsu) dan
// laluan sejuk lama (jalankanTugasanAnak per-tugasan asal, disuntik sebagai
// fungsi palsu). Membuktikan: mula LEWAT (lazy) pada panggilan pertama,
// pemilikan eksklusif kunci ('kumpulan') merentas hayat kumpulan (bukan
// tugasan), jatuh balik ke laluan sejuk SEBELUM mutasi apabila kumpulan gagal
// dibuka, dan pelayar gantian dibuka semula secara lewat selepas
// tutupKumpulanPelayar() (laluan pemulihan log masuk).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buatKunciPelayar } from '../src/kunci-pelayar.mjs';
import { buatPengurusKumpulanPelayar } from '../src/moeis/kumpulan-pelayar.mjs';

function fabrikDispatcherPalsu({ hasilKe = () => ({ status: 'tidak-berubah' }) } = {}) {
  let bilCipta = 0;
  let bilTutup = 0;
  const senaraiHantar = [];
  const buat = () => {
    bilCipta++;
    return {
      async hantar(job, opsyen) {
        senaraiHantar.push({ job, opsyen });
        return hasilKe(job, opsyen);
      },
      async tutup() { bilTutup++; },
      status() { return { aktif: true }; }
    };
  };
  return { buat, bilCipta: () => bilCipta, bilTutup: () => bilTutup, senaraiHantar };
}

test('kumpulan-pelayar: panggilan pertama lazy-cipta dispatcher, panggilan seterusnya guna SEMULA', async () => {
  const kunci = buatKunciPelayar();
  const { buat, bilCipta } = fabrikDispatcherPalsu();
  const jalankanTugasanAnakSejuk = async () => { throw new Error('tidak dijangka guna laluan sejuk'); };
  const p = buatPengurusKumpulanPelayar({ kunciPelayar: kunci, buatDispatcher: buat, jalankanTugasanAnakSejuk });

  await p.jalankanTugasanAnak({ id: 'j1' }, { mod: 'baca' });
  await p.jalankanTugasanAnak({ id: 'j1' }, { mod: 'hantar' });
  await p.jalankanTugasanAnak({ id: 'j2' }, { mod: 'baca' });

  assert.equal(bilCipta(), 1, 'dispatcher hanya dicipta SEKALI merentas 3 panggilan');
  assert.equal(kunci.sibuk(), true, 'kunci mesti kekal dipegang sepanjang kumpulan aktif');
  assert.equal(kunci.status().pemegang, 'kumpulan');
});

test('kumpulan-pelayar: kunci sibuk (dipegang operasi lain) -> langkau serta-merta, TIADA dispatcher/sejuk dipanggil', async () => {
  const kunci = buatKunciPelayar();
  kunci.cubaKunci('siasatan:uji-login.mjs');
  const { buat, bilCipta } = fabrikDispatcherPalsu();
  let sejukDipanggil = 0;
  const jalankanTugasanAnakSejuk = async () => { sejukDipanggil++; return { kod: 0, stdout: '', stderr: '', hasil: { status: 'gagal' } }; };
  const p = buatPengurusKumpulanPelayar({ kunciPelayar: kunci, buatDispatcher: buat, jalankanTugasanAnakSejuk });

  const r = await p.jalankanTugasanAnak({ id: 'j1' }, { mod: 'baca' });
  assert.equal(r.hasil.status, 'langkau');
  assert.equal(r.hasil.pastiTiadaSpawn, true, 'jaminan tiada spawn mesti disertakan supaya giliran.mjs boleh cuba semula automatik');
  assert.match(r.hasil.sebab, /siasatan:uji-login\.mjs/);
  assert.equal(bilCipta(), 0);
  assert.equal(sejukDipanggil, 0);
});

test('kumpulan-pelayar: pembukaanGagal pada panggilan pertama -> tutup + lepas kunci + jatuh balik ke laluan sejuk', async () => {
  const kunci = buatKunciPelayar();
  const { buat, bilCipta, bilTutup } = fabrikDispatcherPalsu({
    hasilKe: () => ({ status: 'gagal', kod: 2, pembukaanGagal: true, sebab: 'Edge tidak dapat dilancarkan (ujian).' })
  });
  let sejukDipanggilDengan = null;
  const jalankanTugasanAnakSejuk = async (job, opsyen) => {
    sejukDipanggilDengan = { job, opsyen };
    return { kod: 0, stdout: '', stderr: '', hasil: { status: 'tidak-berubah' } };
  };
  const p = buatPengurusKumpulanPelayar({ kunciPelayar: kunci, buatDispatcher: buat, jalankanTugasanAnakSejuk });

  const job = { id: 'j1', kelas: '1 BIJAK' };
  const r = await p.jalankanTugasanAnak(job, { mod: 'baca' });

  assert.equal(bilCipta(), 1);
  assert.equal(bilTutup(), 1, 'dispatcher yang gagal dibuka mesti ditutup');
  assert.equal(kunci.sibuk(), false, 'kunci kumpulan mesti dilepaskan selepas jatuh balik');
  assert.deepEqual(sejukDipanggilDengan, { job, opsyen: { mod: 'baca' } }, 'laluan sejuk mesti dipanggil dengan job/opsyen ASAL');
  assert.equal(r.hasil.status, 'tidak-berubah', 'hasil akhir mesti daripada laluan sejuk, bukan hasil pembukaanGagal');
});

test('kumpulan-pelayar: tutupKumpulanPelayar() menutup dispatcher + lepas kunci; panggilan seterusnya lazy-cipta BAHARU', async () => {
  const kunci = buatKunciPelayar();
  const { buat, bilCipta, bilTutup } = fabrikDispatcherPalsu();
  const jalankanTugasanAnakSejuk = async () => { throw new Error('tidak dijangka'); };
  const p = buatPengurusKumpulanPelayar({ kunciPelayar: kunci, buatDispatcher: buat, jalankanTugasanAnakSejuk });

  await p.jalankanTugasanAnak({ id: 'j1' }, {});
  assert.equal(bilCipta(), 1);

  // Simulasi laluan sesi-tamat: giliran.mjs menutup kumpulan SEBELUM memanggil
  // pengurus log masuk induk supaya kunci kumpulan tidak menyekat kunci
  // 'siasatan:login-auto.mjs'.
  await p.tutupKumpulanPelayar();
  assert.equal(bilTutup(), 1);
  assert.equal(kunci.sibuk(), false, 'kunci mesti bebas selepas tutup supaya login-auto boleh memperolehnya');

  // Panggilan berikutnya (selepas log masuk pulih) mesti melancarkan pelayar
  // GANTIAN baharu, bukan menyambung dispatcher lama yang sudah ditutup.
  await p.jalankanTugasanAnak({ id: 'j2' }, {});
  assert.equal(bilCipta(), 2, 'pelayar gantian mesti dilancar lewat selepas tutup eksplisit');
});

test('kumpulan-pelayar: tutupKumpulanPelayar() idempoten (panggil berulang tidak menutup dua kali)', async () => {
  const kunci = buatKunciPelayar();
  const { buat, bilTutup } = fabrikDispatcherPalsu();
  const p = buatPengurusKumpulanPelayar({ kunciPelayar: kunci, buatDispatcher: buat, jalankanTugasanAnakSejuk: async () => ({}) });

  await p.jalankanTugasanAnak({ id: 'j1' }, {});
  await p.tutupKumpulanPelayar();
  await p.tutupKumpulanPelayar();
  await p.tutupKumpulanPelayar();
  assert.equal(bilTutup(), 1);
});

test('kumpulan-pelayar: tutupKumpulanPelayar() tanpa kumpulan aktif ialah tiada-op selamat', async () => {
  const kunci = buatKunciPelayar();
  const { bilTutup } = fabrikDispatcherPalsu();
  const p = buatPengurusKumpulanPelayar({
    kunciPelayar: kunci,
    buatDispatcher: () => { throw new Error('tidak dijangka dipanggil'); },
    jalankanTugasanAnakSejuk: async () => ({})
  });
  await p.tutupKumpulanPelayar();
  assert.equal(bilTutup(), 0);
  assert.equal(kunci.sibuk(), false);
});

test('kumpulan-pelayar: status() mendedahkan aktif mengikut keadaan dispatcher', async () => {
  const kunci = buatKunciPelayar();
  const { buat } = fabrikDispatcherPalsu();
  const p = buatPengurusKumpulanPelayar({ kunciPelayar: kunci, buatDispatcher: buat, jalankanTugasanAnakSejuk: async () => ({}) });
  assert.equal(p.status().aktif, false);
  await p.jalankanTugasanAnak({ id: 'j1' }, {});
  assert.equal(p.status().aktif, true);
  await p.tutupKumpulanPelayar();
  assert.equal(p.status().aktif, false);
});

test('kumpulan-pelayar: buatDispatcher() melontar -> kunci DILEPASKAN (tiada apa dilancarkan) dan hasil gagal', async () => {
  const kunci = buatKunciPelayar();
  const p = buatPengurusKumpulanPelayar({
    kunciPelayar: kunci,
    buatDispatcher: () => { throw new Error('ENOENT node (ujian)'); },
    jalankanTugasanAnakSejuk: async () => { throw new Error('tidak dijangka'); }
  });
  const r = await p.jalankanTugasanAnak({ id: 'j1' }, { mod: 'baca' });
  assert.equal(r.hasil.status, 'gagal');
  assert.match(r.hasil.sebab, /membuka kumpulan/i);
  assert.equal(kunci.sibuk(), false, 'kunci mesti dilepaskan kerana tiada pelayar dilancarkan');
});

test('kumpulan-pelayar: d.tutup() gagal -> kunci DIKEKALKAN (gagal-tertutup) dan tugasan seterusnya dilangkau', async () => {
  const kunci = buatKunciPelayar();
  let bilTutup = 0;
  const buat = () => ({
    async hantar() { return { status: 'tidak-berubah' }; },
    async tutup() { bilTutup++; throw new Error('konteks Edge tidak dapat ditutup (ujian)'); },
    status() { return { aktif: true }; }
  });
  const p = buatPengurusKumpulanPelayar({ kunciPelayar: kunci, buatDispatcher: buat, jalankanTugasanAnakSejuk: async () => ({}) });

  await p.jalankanTugasanAnak({ id: 'j1' }, {});
  assert.equal(kunci.sibuk(), true, 'kunci dipegang selepas dibuka');

  await assert.rejects(() => p.tutupKumpulanPelayar(), /gagal ditutup|tidak dapat ditutup/i);
  assert.equal(bilTutup, 1);
  // FAIL-CLOSED: kunci TIDAK dilepaskan (Edge yatim mungkin masih memegang profil).
  assert.equal(kunci.sibuk(), true, 'kunci mesti DIKEKALKAN selepas penutupan gagal (tiada pelepasan senyap)');

  // Tugasan seterusnya TIDAK melancarkan pelayar kedua — ia dilangkau (block dikekalkan).
  const r = await p.jalankanTugasanAnak({ id: 'j2' }, { mod: 'baca' });
  assert.equal(r.hasil.status, 'langkau');
  assert.equal(r.hasil.pastiTiadaSpawn, true);
});

test('kumpulan-pelayar: tutup serentak dengan jalankanTugasanAnak -> tugasan dilangkau (tiada pelayar kedua semasa menutup)', async () => {
  const kunci = buatKunciPelayar();
  let tutupSelesai;
  const tutupSedang = new Promise((r) => { tutupSelesai = r; });
  const buat = () => ({
    async hantar() { return { status: 'tidak-berubah' }; },
    async tutup() { await tutupSedang; },  // tutup yang perlahan
    status() { return { aktif: true }; }
  });
  const p = buatPengurusKumpulanPelayar({ kunciPelayar: kunci, buatDispatcher: buat, jalankanTugasanAnakSejuk: async () => ({}) });

  await p.jalankanTugasanAnak({ id: 'j1' }, {});

  const janjiTutup = p.tutupKumpulanPelayar();
  // Semasa tutup belum selesai, tugasan baharu mesti dilangkau (fasa 'menutup').
  const r = await p.jalankanTugasanAnak({ id: 'j2' }, { mod: 'baca' });
  assert.equal(r.hasil.status, 'langkau', 'tugasan semasa menutup mesti dilangkau, bukan melancarkan pelayar kedua');
  assert.equal(r.hasil.pastiTiadaSpawn, true);

  tutupSelesai();
  await janjiTutup;
  assert.equal(kunci.sibuk(), false, 'kunci dilepaskan selepas penutupan selesai');
});
