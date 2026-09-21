// Ujian pekerja kumpulan pelayar (companion/src/moeis/pekerja-batch.mjs).
//
// TULEN — `bukaKonteks`/`buatAdaptorPlaywright` disuntik sebagai double palsu;
// tiada pelayar sebenar dilancarkan. Membuktikan: SATU konteks dikongsi
// merentas beberapa tugasan (lazy launch sekali sahaja), HALAMAN BAHARU +
// adapter baharu bagi SETIAP tugasan (tiada kelas/tarikh terwarisi), tutup()
// menutup konteks SEKALI, dan kegagalan membuka konteks dilaporkan sebagai
// hasil `pembukaanGagal:true` (bukan lontaran) supaya pemanggil (kumpulan-
// pelayar.mjs) boleh jatuh balik ke laluan sejuk dengan selamat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buatPekerjaBatch } from '../src/moeis/pekerja-batch.mjs';
import { buatHalamanPalsu } from './fixtures/halamanPalsu.mjs';

// Konteks pelayar palsu: `newPage()` memulangkan objek halaman bernombor unik
// supaya ujian dapat mengesahkan setiap tugasan menerima halaman BERBEZA.
function buatKonteksPalsu() {
  let bilNewPage = 0;
  let bilPageClose = 0;
  let bilKonteksClose = 0;
  const konteks = {
    async newPage() {
      bilNewPage++;
      const nombor = bilNewPage;
      return { _nombor: nombor, async close() { bilPageClose++; } };
    },
    async close() { bilKonteksClose++; }
  };
  return { konteks, bilNewPage: () => bilNewPage, bilPageClose: () => bilPageClose, bilKonteksClose: () => bilKonteksClose };
}

// Fabrik adapter palsu: mengekori SETIAP page yang diterima (untuk sahkan
// halaman berbeza per tugasan) dan memulangkan satu HalamanPalsu BAHARU
// (murid disuntik per panggilan) — mensimulasikan buatAdaptorPlaywright(page)
// sebenar tanpa Playwright.
function buatFabrikAdapterPalsu(senaraiMuridPerTugasan) {
  let panggilanKe = 0;
  const halamanDiterima = [];
  const adapterDicipta = [];
  const fabrik = (halaman) => {
    halamanDiterima.push(halaman);
    const murid = senaraiMuridPerTugasan[panggilanKe] || [];
    panggilanKe++;
    const adapter = buatHalamanPalsu({ muridAwal: murid });
    adapterDicipta.push(adapter);
    return adapter;
  };
  return { fabrik, halamanDiterima, adapterDicipta };
}

const MURID_HADIR_SEMUA = [
  { id: 'm1', nama: 'MURID CONTOH SATU', hadir: true },
  { id: 'm2', nama: 'MURID CONTOH DUA', hadir: true }
];

function jobTanpaTidakHadir(id, kelas) {
  return { id, kelas, tarikhIso: '2026-09-21', murid: [] };
}

test('pekerja-batch: SATU konteks dilancar dan dikongsi merentas 3 tugasan berurutan', async () => {
  const { konteks, bilNewPage, bilKonteksClose } = buatKonteksPalsu();
  let bilBukaKonteks = 0;
  const bukaKonteks = async () => { bilBukaKonteks++; return konteks; };
  const { fabrik } = buatFabrikAdapterPalsu([MURID_HADIR_SEMUA, MURID_HADIR_SEMUA, MURID_HADIR_SEMUA]);

  const pekerja = buatPekerjaBatch({ bukaKonteks, buatAdaptorPlaywright: fabrik });

  const h1 = await pekerja.jalankan(jobTanpaTidakHadir('j1', '1 BIJAK'), { mod: 'baca' });
  const h2 = await pekerja.jalankan(jobTanpaTidakHadir('j2', '1 BIJAK'), { mod: 'baca' });
  const h3 = await pekerja.jalankan(jobTanpaTidakHadir('j3', '1 BIJAK'), { mod: 'baca' });

  assert.equal(bilBukaKonteks, 1, 'bukaKonteks mesti dipanggil SATU kali sahaja untuk 3 tugasan');
  assert.equal(bilNewPage(), 3, 'setiap tugasan mesti menerima halaman baharu (newPage)');
  assert.equal(h1.status, 'tidak-berubah');
  assert.equal(h2.status, 'tidak-berubah');
  assert.equal(h3.status, 'tidak-berubah');

  assert.equal(pekerja.status().bilLancar, 1, 'bilLancar mesti 1 (satu launch sahaja per kumpulan)');
  assert.equal(bilKonteksClose(), 0, 'konteks belum ditutup sebelum tutup() dipanggil');

  await pekerja.tutup();
  assert.equal(bilKonteksClose(), 1, 'tutup() mesti menutup konteks SEKALI');
  assert.equal(pekerja.status().bilTutup, 1);
  assert.equal(pekerja.status().aktif, false);
});

test('pekerja-batch: halaman ditutup selepas SETIAP tugasan (bukan hanya pada tutup())', async () => {
  const { konteks, bilPageClose } = buatKonteksPalsu();
  const bukaKonteks = async () => konteks;
  const { fabrik } = buatFabrikAdapterPalsu([[], []]);
  const pekerja = buatPekerjaBatch({ bukaKonteks, buatAdaptorPlaywright: fabrik });

  await pekerja.jalankan(jobTanpaTidakHadir('j1', '1 BIJAK'), { mod: 'baca' });
  assert.equal(bilPageClose(), 1, 'halaman tugasan pertama mesti ditutup serta-merta selepas selesai');
  await pekerja.jalankan(jobTanpaTidakHadir('j2', '1 BIJAK'), { mod: 'baca' });
  assert.equal(bilPageClose(), 2);
});

test('pekerja-batch: tugasan kedua TIDAK mewarisi keadaan (murid/kelas) daripada tugasan pertama', async () => {
  const { konteks } = buatKonteksPalsu();
  const bukaKonteks = async () => konteks;
  const muridTugasan1 = [
    { id: 'a1', nama: 'MURID KELAS SATU', hadir: true }
  ];
  const muridTugasan2 = [
    { id: 'b1', nama: 'MURID KELAS DUA SATU', hadir: true },
    { id: 'b2', nama: 'MURID KELAS DUA DUA', hadir: true }
  ];
  const { fabrik, adapterDicipta } = buatFabrikAdapterPalsu([muridTugasan1, muridTugasan2]);
  const pekerja = buatPekerjaBatch({ bukaKonteks, buatAdaptorPlaywright: fabrik });

  const job1 = { id: 'j1', kelas: '1 BIJAK', tarikhIso: '2026-09-21', murid: [{ nama: 'MURID KELAS SATU', kategori: 'D', sebab: 'DEMAM' }] };
  const h1 = await pekerja.jalankan(job1, { mod: 'hantar' });
  assert.equal(h1.status, 'disahkan');
  assert.equal(h1.murid, 1, 'tugasan 1 mesti hanya nampak murid kelasnya sendiri (1 orang)');

  const job2 = { id: 'j2', kelas: '2 BIJAK', tarikhIso: '2026-09-21', murid: [] };
  const h2 = await pekerja.jalankan(job2, { mod: 'baca' });
  assert.equal(h2.status, 'tidak-berubah');
  assert.equal(h2.murid, 2, 'tugasan 2 mesti nampak senarai murid kelasnya sendiri (2 orang), bukan kelas 1');

  // Adapter tugasan 1 (yang menanda seorang murid tidak hadir) mesti kekal
  // TERPISAH daripada adapter tugasan 2 — tiada mutasi merentas tugasan.
  assert.equal(adapterDicipta[0]._murid()[0].hadir, false, 'mutasi tugasan 1 mesti kekal pada adapternya sendiri');
  assert.equal(adapterDicipta[1]._murid().every((m) => m.hadir), true, 'adapter tugasan 2 tidak boleh terjejas oleh mutasi tugasan 1');
});

test('pekerja-batch: bukaKonteks gagal -> hasil pembukaanGagal:true (bukan lontaran)', async () => {
  const bukaKonteks = async () => { throw new Error('Edge tidak dapat dilancarkan (ujian).'); };
  const pekerja = buatPekerjaBatch({ bukaKonteks, buatAdaptorPlaywright: () => { throw new Error('tidak dijangka dipanggil'); } });

  const hasil = await pekerja.jalankan(jobTanpaTidakHadir('j1', '1 BIJAK'), { mod: 'baca' });
  assert.equal(hasil.status, 'gagal');
  assert.equal(hasil.pembukaanGagal, true, 'kegagalan membuka konteks mesti ditandakan pembukaanGagal supaya pemanggil boleh jatuh balik ke laluan sejuk');
  assert.match(hasil.sebab, /gagal membuka konteks/i);
});

test('pekerja-batch: tugasan selepas tutup() ditolak (tiada konteks dibuka semula secara senyap)', async () => {
  const { konteks } = buatKonteksPalsu();
  const bukaKonteks = async () => konteks;
  const { fabrik } = buatFabrikAdapterPalsu([[]]);
  const pekerja = buatPekerjaBatch({ bukaKonteks, buatAdaptorPlaywright: fabrik });

  await pekerja.jalankan(jobTanpaTidakHadir('j1', '1 BIJAK'), { mod: 'baca' });
  await pekerja.tutup();

  await assert.rejects(
    () => pekerja.jalankan(jobTanpaTidakHadir('j2', '1 BIJAK'), { mod: 'baca' }),
    /ditutup/i
  );
});

test('pekerja-batch: tutup() tanpa sebarang tugasan dijalankan ialah tiada-op selamat (tiada bukaKonteks dipanggil)', async () => {
  let bilBuka = 0;
  const bukaKonteks = async () => { bilBuka++; return buatKonteksPalsu().konteks; };
  const pekerja = buatPekerjaBatch({ bukaKonteks, buatAdaptorPlaywright: () => { throw new Error('tidak dijangka'); } });
  await pekerja.tutup();
  assert.equal(bilBuka, 0);
  assert.equal(pekerja.status().bilTutup, 0, 'tutup() tanpa konteks aktif tidak mengira sebagai penutupan');
});
