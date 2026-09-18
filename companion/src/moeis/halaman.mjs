// Pembantu halaman MOEIS (companion/src/moeis/halaman.mjs).
//
// Fungsi di sini beroperasi terhadap satu "adapter" — antara muka kecil yang
// disenaraikan dalam companion/docs/PEMASANGAN.md dan dilaksanakan oleh
// src/moeis/adaptorPlaywright.mjs (pelayar Edge sebenar) ATAU oleh
// tests/fixtures HalamanPalsu (DOM mini, tiada rangkaian). Reka bentuk ini
// membolehkan seluruh logik pengisian diuji tanpa pelayar sebenar.
//
// Audit prototaip moeis-bot mendapati: tab Kehadiran Harian tidak dibuka
// secara eksplisit sebelum guna, tarikh ditulis tanpa memastikan format
// DD/MM/YYYY sebelum membaca, dialog simpan guna pemilih longgar, dan
// pengesahan selepas muat semula hanya membaca ringkasan kelas (bilangan)
// bukan identiti/kategori/sebab setiap murid. Fungsi di sini membetulkan
// keempat-empatnya.

export function formatTarikhPaparan(tarikhIso) {
  const m = String(tarikhIso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error('tarikhIso mesti berformat YYYY-MM-DD: ' + tarikhIso);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// Langkah 1+2: buka tab harian SEBELUM sebarang bacaan, kemudian tetapkan
// tarikh DD/MM/YYYY dan sahkan medan sama seperti dijangka SEBELUM meneruskan.
export async function bukaTabDanTetapkanTarikh(adapter, tarikhIso) {
  const paparan = formatTarikhPaparan(tarikhIso);
  const tajuk = await adapter.tajuk();
  if (!String(tajuk || '').includes('MOEIS')) throw new Error('Bukan halaman MOEIS: ' + tajuk);
  await adapter.klikTabHarian();
  await adapter.tungguKemaskiniKelihatan();
  const semasa = await adapter.bacaTarikhInput();
  if (semasa !== paparan) {
    await adapter.tetapkanTarikhInput(paparan);
  }
  const selepas = await adapter.bacaTarikhInput();
  if (selepas !== paparan) {
    throw new Error(`Tarikh borang tidak sepadan: dijangka ${paparan}, dapat ${selepas}`);
  }
  return paparan;
}

// Langkah 3: pilih tahun -> kelas, tunggu jadual murid stabil (bilangan baris
// sepadan ringkasan kelas dua bacaan berturut-turut).
export async function pilihKonteksDanStabil(adapter, { tahun, kelas }, { cubaanMaks = 12, jedaMs = 0 } = {}) {
  const t = await adapter.pilihTahun(tahun);
  if (!t || !t.ok) throw new Error('Tahun tidak dapat dipilih: ' + tahun);
  const k = await adapter.pilihKelas(kelas);
  if (!k || !k.ok) throw new Error('Kelas tidak dapat dipilih: ' + kelas);
  for (let cubaan = 1; cubaan <= cubaanMaks; cubaan++) {
    const ring = await adapter.bacaRingkasanKelas(tahun, kelas);
    const murid = await adapter.bacaSenaraiMurid();
    if (ring && murid.length === ring.jumlah) {
      if (jedaMs) await adapter.jeda(jedaMs);
      const semak2 = await adapter.bacaSenaraiMurid();
      if (semak2.length === murid.length) return { ring, murid: semak2 };
    }
    if (jedaMs) await adapter.jeda(jedaMs);
  }
  const ringAkhir = await adapter.bacaRingkasanKelas(tahun, kelas);
  throw new Error(`Jadual murid tidak stabil (MOEIS jangka ${ringAkhir ? ringAkhir.jumlah : '?'})`);
}

// Gabungan: buka tab, tetapkan tarikh, pilih konteks. Dipanggil pada bacaan
// awal DAN semula selepas muat semula (mod hantar) — setiap kali dari kosong,
// tiada keadaan diandaikan berterusan merentas muat semula.
export async function bukaDanBacaKeadaan(adapter, { tahun, kelas, tarikhIso }, opsyen) {
  await bukaTabDanTetapkanTarikh(adapter, tarikhIso);
  return pilihKonteksDanStabil(adapter, { tahun, kelas }, opsyen);
}

// Langkah 4: dialog simpan eksplisit. `.simpan` sahaja secara lalai;
// `.simpansah` HANYA bila sahkan===true. Butang confirm generik SweetAlert
// tidak pernah digunakan (tersembunyi pada dialog ini, bukan butang simpan).
export async function tekanSimpan(adapter, { sahkan }) {
  await adapter.tekanKemaskini();
  const nampak = await adapter.dialogSimpanKelihatan();
  if (!nampak) throw new Error('Dialog simpan tidak muncul selepas tekan kemaskini.');
  const tindakan = sahkan ? 'simpansah' : 'simpan';
  if (sahkan) await adapter.klikSimpanSahkan();
  else await adapter.klikSimpan();
  const berjaya = await adapter.dialogBerjayaKelihatan();
  return { tindakanSimpan: tindakan, dialogBerjaya: !!berjaya };
}

function normNama(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Langkah 5: pengesahan selepas muat semula — bukti sebenar, bukan ringkasan
// kelas sahaja. Bandingkan tarikh/tahun/kelas, SETIAP murid tidak hadir
// (identiti + kategori + sebab), murid yang sepatutnya hadir tidak lagi
// ditanda tidak hadir, dan kiraan/badge kelas.
export async function sahkanSelepasMuatSemula(adapter, { tahun, kelas, tarikhIso, muridDijangkaTidakHadir }) {
  const paparanDijangka = formatTarikhPaparan(tarikhIso);
  const verifikasi = { tarikh: false, kelas: false, murid: false, kategoriSebab: false, kiraan: false, badge: false };

  await adapter.muatSemula();
  const paparanSebenar = await bukaTabDanTetapkanTarikh(adapter, tarikhIso);
  verifikasi.tarikh = paparanSebenar === paparanDijangka;

  const { ring, murid } = await pilihKonteksDanStabil(adapter, { tahun, kelas });
  verifikasi.kelas = true; // pilihKonteksDanStabil sudah melontar ralat jika tahun/kelas tidak sah

  const tidakHadirSebenar = murid.filter((m) => !m.hadir);
  const petaDijangka = new Map(muridDijangkaTidakHadir.map((m) => [normNama(m.nama), m]));
  const petaSebenar = new Map(tidakHadirSebenar.map((m) => [normNama(m.nama), m]));

  const semuaIdentitiPadan =
    tidakHadirSebenar.length === muridDijangkaTidakHadir.length &&
    [...petaDijangka.keys()].every((k) => petaSebenar.has(k));
  verifikasi.murid = semuaIdentitiPadan;

  let kategoriSebabPadan = semuaIdentitiPadan;
  if (semuaIdentitiPadan) {
    for (const m of tidakHadirSebenar) {
      const dijangka = petaDijangka.get(normNama(m.nama));
      const sebabSebenar = await adapter.bacaSebabMurid(m.id);
      if (!sebabSebenar || !dijangka) { kategoriSebabPadan = false; break; }
      const kategoriPadan = String(sebabSebenar.kategoriValue || '').toUpperCase() === String(dijangka.kategori || '').toUpperCase();
      const sebabPadan = String(sebabSebenar.sebabText || '').toUpperCase() === String(dijangka.sebab || '').toUpperCase();
      if (!kategoriPadan || !sebabPadan) { kategoriSebabPadan = false; break; }
    }
  }
  verifikasi.kategoriSebab = kategoriSebabPadan;

  const kiraanSkrin = await adapter.bacaKiraanSkrin();
  const jumlahMurid = murid.length;
  const jangkaHadir = jumlahMurid - muridDijangkaTidakHadir.length;
  verifikasi.kiraan = Number(kiraanSkrin.bilHadir) === jangkaHadir && Number(kiraanSkrin.bilTidakHadir) === muridDijangkaTidakHadir.length;
  verifikasi.badge = !!ring && ring.hadir === jangkaHadir;

  const semuaSah = Object.values(verifikasi).every(Boolean);
  return { sah: semuaSah, verifikasi, ring, murid, kiraanSkrin };
}
