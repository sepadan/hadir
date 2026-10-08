// tests/pdpr.test.cjs
// Ujian regresi bagi semantik MOEIS Kategori A: PDPR (PEMBELAJARAN DI RUMAH).
// Menguji aliran simpan, semak, baca semula, RMT, job Apps Script, dan kad semakan.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
function baca(n) { return fs.readFileSync(path.join(root, n), 'utf8').replace(/\r\n/g, '\n'); }

const backend = process.env.HADIR_BACKEND_FIXTURE
  ? fs.readFileSync(process.env.HADIR_BACKEND_FIXTURE, 'utf8').replace(/\r\n/g, '\n')
  : baca('apps-script/HadirWeb.gs');
const appJs = baca('app.js');

// ---------------- Helaian & Julat palsu ----------------
class HelaianPalsu {
  constructor(nama) {
    this.nama = nama;
    this.baris = [];
  }
  getRange(r, c, numRows, numCols) {
    return new JulatPalsu(this, r, c, numRows || 1, numCols || 1);
  }
  getDataRange() { return this.getRange(1, 1, this.getLastRow(), this.getLastColumn()); }
  appendRow(arr) { this.baris.push(arr.slice()); }
  deleteRow(r) { this.baris.splice(r - 1, 1); }
  getLastRow() {
    for (var i = this.baris.length - 1; i >= 0; i--) {
      var r = this.baris[i];
      if (r && r.some(function (v) { return v !== '' && v != null; })) return i + 1;
    }
    return 0;
  }
  getLastColumn() {
    var maks = 0;
    this.baris.forEach(function (r) { if (r.length > maks) maks = r.length; });
    return maks;
  }
  setFrozenRows() {}
  clearContent() { this.baris = []; }
}

class JulatPalsu {
  constructor(helaian, r, c, numRows, numCols) {
    this.helaian = helaian; this.r = r; this.c = c;
    this.numRows = numRows; this.numCols = numCols;
  }
  getValues() {
    var keluar = [];
    for (var i = this.r; i < this.r + this.numRows; i++) {
      var baris = this.helaian.baris[i - 1] || [];
      var baris2 = [];
      for (var j = this.c; j < this.c + this.numCols; j++) {
        baris2.push(baris[j - 1] === undefined ? '' : baris[j - 1]);
      }
      keluar.push(baris2);
    }
    return keluar;
  }
  getDisplayValues() {
    var format = this.helaian.formatPaparan;
    return this.getValues().map(function (baris) {
      return baris.map(function (v) { return format ? format(v) : (v == null ? '' : String(v)); });
    });
  }
  setValues(nilai) {
    for (var i = 0; i < nilai.length; i++) {
      var indeksBaris = this.r - 1 + i;
      while (this.helaian.baris.length <= indeksBaris) this.helaian.baris.push([]);
      var baris = this.helaian.baris[indeksBaris];
      for (var j = 0; j < nilai[i].length; j++) {
        var indeksLajur = this.c - 1 + j;
        while (baris.length <= indeksLajur) baris.push('');
        baris[indeksLajur] = nilai[i][j];
      }
    }
  }
  getValue() { return this.getValues()[0][0]; }
  setValue(v) { this.setValues([[v]]); }
  clearContent() {
    for (var i = this.r; i < this.r + this.numRows; i++) {
      for (var j = this.c; j < this.c + this.numCols; j++) {
        this.helaian.baris[i - 1][j - 1] = '';
      }
    }
  }
}

class SpreadsheetPalsu {
  constructor() { this.helaianPeta = new Map(); }
  getSheetByName(nama) { return this.helaianPeta.has(nama) ? this.helaianPeta.get(nama) : null; }
  insertSheet(nama) {
    var s = new HelaianPalsu(nama);
    this.helaianPeta.set(nama, s);
    return s;
  }
  flush() {}
}

function buatKonteks(opsyen) {
  opsyen = opsyen || {};
  var jam = { sekarang: opsyen.sekarang || 1_700_000_000_000 };
  var ss = new SpreadsheetPalsu();
  var propsStor = new Map();
  var propsMock = {
    getProperty: function (k) { return propsStor.has(k) ? propsStor.get(k) : null; },
    setProperty: function (k, v) { propsStor.set(k, String(v)); },
    deleteProperty: function (k) { propsStor.delete(k); }
  };

  var konteks = {
    console: console,
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : ['2026-09-24T01:00:00Z'])); }
      static now() { return Date.parse('2026-09-24T01:00:00Z'); }
    },
    ss: ss,
    SpreadsheetApp: { flush: function () {} },
    PropertiesService: { getScriptProperties: function () { return propsMock; } },
    LockService: {
      getScriptLock: function () {
        return {
          waitLock: function () {},
          releaseLock: function () {}
        };
      }
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest: function (algo, str) {
        return Array.from(crypto.createHash('sha256').update(String(str == null ? '' : str), 'utf8').digest());
      },
      getUuid: function () { return crypto.randomUUID(); },
      formatDate: function (tarikh, zon, pola) {
        return pola === 'yyyy-MM-dd' ? '2026-09-24' : '09:00';
      }
    },
    Session: { getScriptTimeZone: function () { return 'Asia/Kuala_Lumpur'; } },
    CacheService: {
      getScriptCache: function () {
        return { get: function () { return null; }, put: function () {}, remove: function () {} };
      }
    },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: function (teks) {
        return { _teks: teks, setMimeType: function () { return this; }, getContent: function () { return teks; } };
      }
    },
    ScriptApp: { getScriptId: function () { return 'skrip-ujian'; } }
  };
  vm.createContext(konteks);
  vm.runInContext(backend, konteks);

  konteks.hadirLog_ = function () {};
  konteks.normalisasiIc_ = function (ic) { return String(ic == null ? '' : ic).trim(); };
  konteks.tarikhHariIni_ = function () { return '24/09'; };
  konteks.sediakanLajurSahaja = function () {};
  konteks.dapatkanKolTarikh_ = function () { return 5; };
  konteks.dapatkanIntervalArkib_ = function () { return []; };
  konteks.dapatkanIcAktifMain_ = function () { return {}; };
  konteks.muridTiadaPadaTarikh_ = function () { return false; };
  konteks.muridDisembunyikanHariIni_ = function () { return false; };
  konteks.hadirPadamCacheInit_ = function () {};

  return { k: konteks, props: propsMock, ss: ss };
}

function sediakanPersekitaranHadir(muridList, rmtPeta) {
  var env = buatKonteks();
  env.props.setProperty('HADIR_MOEIS_ENGINE_SECRET', 'rahsia-fixture');
  env.k.hadirPetaRmt_ = function () { return rmtPeta || {}; };

  var s = env.ss.insertSheet('kehadiran');
  var tkh = '24/09';
  s.appendRow(['NO', 'NAMA', 'KELAS', 'IC', tkh]);
  muridList.forEach(function (m, idx) {
    s.appendRow([idx + 1, m.nama, m.kelas, m.ic, m.nilai !== undefined ? m.nilai : '']);
  });

  return env;
}

// ======================= UJIAN REGRESI =======================

test('1. adakahPdpr_: mengesan Kategori A dan PEMBELAJARAN DI RUMAH secara tepat', function () {
  var env = buatKonteks();
  assert.equal(typeof env.k.hadirAdakahPdpr_, 'function', 'hadirAdakahPdpr_ mesti wujud di backend');
  assert.equal(env.k.hadirAdakahPdpr_('A', 'PEMBELAJARAN DI RUMAH'), true);
  assert.equal(env.k.hadirAdakahPdpr_('a', ' pembelajaran di rumah '), true);
  assert.equal(env.k.hadirAdakahPdpr_('PDPR', 'PEMBELAJARAN DI RUMAH'), true);
  assert.equal(env.k.hadirAdakahPdpr_('D', 'DEMAM'), false);
  assert.equal(env.k.hadirAdakahPdpr_('A', 'SEBAB TIDAK SAH'), false);
  assert.equal(env.k.hadirAdakahPdpr_('', ''), false);
});

test('2. PDPR bersendirian: dikira HADIR, disimpan 1 dalam kehadiran, direkod dalam SEBAB dan JOB', function () {
  var env = sediakanPersekitaranHadir([
    { nama: 'Murid Alfa', kelas: '1 UJI', ic: 'ic-alfa' },
    { nama: 'Murid Beta', kelas: '1 UJI', ic: 'ic-beta' },
    { nama: 'Murid Gamma', kelas: '1 UJI', ic: 'ic-gamma' }
  ], { 'ic-alfa': true, 'ic-beta': true }); // Alfa (PDPR) dan Beta (Hadir) ada RMT

  var k = env.k;
  var kunciAlfa = k.hadirKunciMurid_('ic-alfa', '24/09');
  var hasil = k.hadirSimpanKehadiran_('1 UJI', [
    { kunci: kunciAlfa, kategori: 'A', sebab: 'PEMBELAJARAN DI RUMAH' }
  ], '', '2026-09-24');

  // Semantik kehadiran: PDPR dikira HADIR
  assert.equal(hasil.jumlah, 3, 'Jumlah murid mesti 3');
  assert.equal(hasil.tidakHadir, 0, 'Kiraan tidak hadir mesti 0 (PDPR dikira HADIR)');

  // Peraturan RMT: Murid PDPR tidak menerima hidangan di sekolah
  assert.equal(hasil.rmtJumlah, 2, '2 murid layak RMT');
  assert.equal(hasil.rmtHadir, 1, 'Hanya Murid Beta (hadir fizikal) menerima RMT; Murid Alfa (PDPR) TIDAK');

  // Tab kehadiran: nilai mesti 1 bagi semua murid (termasuk PDPR)
  var sKehadiran = env.ss.getSheetByName('kehadiran');
  assert.equal(sKehadiran.baris[1][4], 1, 'Alfa (PDPR) mesti disimpan 1 dalam tab kehadiran');
  assert.equal(sKehadiran.baris[2][4], 1, 'Beta (hadir fizikal) mesti 1');
  assert.equal(sKehadiran.baris[3][4], 1, 'Gamma (hadir fizikal) mesti 1');

  // Tab HADIR_MOEIS_SEBAB: rekod PDPR TIDAK digugurkan
  var sSebab = env.ss.getSheetByName('HADIR_MOEIS_SEBAB');
  assert.ok(sSebab, 'Tab HADIR_MOEIS_SEBAB mesti dicipta');
  assert.equal(sSebab.getLastRow(), 2, '1 rekod sebab mesti disimpan');
  assert.equal(sSebab.baris[1][2], 'ic-alfa');
  assert.equal(sSebab.baris[1][4], 'A');
  assert.equal(sSebab.baris[1][5], 'PEMBELAJARAN DI RUMAH');

  // Tab HADIR_MOEIS_JOB: job dicipta dengan membawa murid PDPR (bukan job kosong)
  var sJob = env.ss.getSheetByName('HADIR_MOEIS_JOB');
  assert.ok(sJob, 'Tab HADIR_MOEIS_JOB mesti dicipta');
  assert.equal(sJob.getLastRow(), 2);
  var jobMurid = JSON.parse(sJob.baris[1][9]);
  assert.equal(jobMurid.length, 1, 'Job mesti membawa 1 murid PDPR');
  assert.equal(jobMurid[0].ic, 'ic-alfa');
  assert.equal(jobMurid[0].kategori, 'A');
  assert.equal(jobMurid[0].sebab, 'PEMBELAJARAN DI RUMAH');

  // Senarai job enjin: rekod tidak dianggap semuaHadir kosong
  var senaraiJob = k.hadirMoeisJobSenarai_('', 'rahsia-fixture');
  assert.equal(senaraiJob.length, 1);
  assert.equal(senaraiJob[0].semuaHadir, false, 'Job dengan murid PDPR TIDAK boleh dianggap semuaHadir=true');
});

test('3. Campuran tidak hadir sebenar + PDPR: kiraan tepat dan job membawa kedua-duanya', function () {
  var env = sediakanPersekitaranHadir([
    { nama: 'Murid Alfa', kelas: '1 UJI', ic: 'ic-alfa' },
    { nama: 'Murid Beta', kelas: '1 UJI', ic: 'ic-beta' },
    { nama: 'Murid Gamma', kelas: '1 UJI', ic: 'ic-gamma' }
  ], { 'ic-alfa': true, 'ic-beta': true, 'ic-gamma': true });

  var k = env.k;
  var kunciAlfa = k.hadirKunciMurid_('ic-alfa', '24/09');
  var kunciBeta = k.hadirKunciMurid_('ic-beta', '24/09');

  var hasil = k.hadirSimpanKehadiran_('1 UJI', [
    { kunci: kunciAlfa, kategori: 'A', sebab: 'PEMBELAJARAN DI RUMAH' },
    { kunci: kunciBeta, kategori: 'D', sebab: 'DEMAM' }
  ], '', '2026-09-24');

  // Alfa: PDPR (dikira hadir), Beta: SAKIT (tidak hadir), Gamma: Hadir
  assert.equal(hasil.jumlah, 3);
  assert.equal(hasil.tidakHadir, 1, 'Hanya Murid Beta dikira tidak hadir');
  assert.equal(hasil.rmtJumlah, 3);
  assert.equal(hasil.rmtHadir, 1, 'Hanya Murid Gamma (hadir fizikal) menerima RMT');

  var sKehadiran = env.ss.getSheetByName('kehadiran');
  assert.equal(sKehadiran.baris[1][4], 1, 'Alfa (PDPR) = 1');
  assert.equal(sKehadiran.baris[2][4], 0, 'Beta (SAKIT) = 0');
  assert.equal(sKehadiran.baris[3][4], 1, 'Gamma = 1');

  var sJob = env.ss.getSheetByName('HADIR_MOEIS_JOB');
  var jobMurid = JSON.parse(sJob.baris[1][9]);
  assert.equal(jobMurid.length, 2, 'Job MOEIS mesti membawa kedua-dua murid');
  assert.equal(jobMurid[0].ic, 'ic-alfa');
  assert.equal(jobMurid[0].kategori, 'A');
  assert.equal(jobMurid[1].ic, 'ic-beta');
  assert.equal(jobMurid[1].kategori, 'D');

  // Pengesahan siap: hadirMoeisJobSelesaiSah_ mesti menerima rekod
  var jobRekod = { status: 'berjaya', bilTidakHadir: 2 };
  var muridStatus = [
    { nama: 'Murid Alfa', nilai: 1, nilaiMentah: 1, kategori: 'A', sebab: 'PEMBELAJARAN DI RUMAH' },
    { nama: 'Murid Beta', nilai: 0, nilaiMentah: 0, kategori: 'D', sebab: 'DEMAM' },
    { nama: 'Murid Gamma', nilai: 1, nilaiMentah: 1, kategori: '', sebab: '' }
  ];
  assert.equal(k.hadirMoeisJobSelesaiSah_(jobRekod, muridStatus), true,
    'hadirMoeisJobSelesaiSah_ mesti mengesahkan selesai bila kedua-dua PDPR dan Sakit lengkap');
});

test('4. Keseluruhan kelas PDPR (All-PDPR): tidak ditelan oleh pintasan semua-hadir', function () {
  var env = sediakanPersekitaranHadir([
    { nama: 'Murid Alfa', kelas: '1 UJI', ic: 'ic-alfa' },
    { nama: 'Murid Beta', kelas: '1 UJI', ic: 'ic-beta' }
  ], { 'ic-alfa': true, 'ic-beta': true });

  var k = env.k;
  var kunciA = k.hadirKunciMurid_('ic-alfa', '24/09');
  var kunciB = k.hadirKunciMurid_('ic-beta', '24/09');

  var hasil = k.hadirSimpanKehadiran_('1 UJI', [
    { kunci: kunciA, kategori: 'A', sebab: 'PEMBELAJARAN DI RUMAH' },
    { kunci: kunciB, kategori: 'A', sebab: 'PEMBELAJARAN DI RUMAH' }
  ], '', '2026-09-24');

  assert.equal(hasil.jumlah, 2);
  assert.equal(hasil.tidakHadir, 0, 'Kiraan kehadiran: 0 tidak hadir');
  assert.equal(hasil.rmtHadir, 0, 'Tiada murid menerima RMT di sekolah');

  var sJob = env.ss.getSheetByName('HADIR_MOEIS_JOB');
  var jobMurid = JSON.parse(sJob.baris[1][9]);
  assert.equal(jobMurid.length, 2, 'Tugasan MOEIS MESTI membawa kedua-dua murid PDPR');
  var senarai = k.hadirMoeisJobSenarai_('', 'rahsia-fixture');
  assert.equal(senarai[0].semuaHadir, false, 'Bukan pintasan semuaHadir kosong');
});

test('5. Buka semula dan kemas kini (Reopening and edits)', function () {
  var env = sediakanPersekitaranHadir([
    { nama: 'Murid Alfa', kelas: '1 UJI', ic: 'ic-alfa' },
    { nama: 'Murid Beta', kelas: '1 UJI', ic: 'ic-beta' }
  ], { 'ic-alfa': true });

  var k = env.k;
  var kunciA = k.hadirKunciMurid_('ic-alfa', '24/09');

  // Langkah 1: Simpan Alfa sebagai PDPR
  k.hadirSimpanKehadiran_('1 UJI', [
    { kunci: kunciA, kategori: 'A', sebab: 'PEMBELAJARAN DI RUMAH' }
  ], '', '2026-09-24');

  // Langkah 2: Buka semula melalui hadirInit_ dan hadirBukaKehadiranTarikh_
  var initData = k.hadirInit_('');
  var kelasInit = initData.kelas.find(x => x.nama === '1 UJI');
  assert.ok(kelasInit);
  assert.equal(kelasInit.tidakHadir, 0, 'Kiraan tidak hadir pada kad mesti 0');
  var muridAlfaInit = kelasInit.murid.find(m => m.nama === 'Murid Alfa');
  assert.equal(muridAlfaInit.nilai, 1, 'Nilai Alfa mesti 1 (HADIR)');
  assert.equal(muridAlfaInit.kategori, 'A', 'Kategori PDPR mesti dibaca semula');
  assert.equal(muridAlfaInit.sebab, 'PEMBELAJARAN DI RUMAH', 'Sebab PDPR mesti dibaca semula');
  assert.equal(kelasInit.rmtHadir, 0, 'RMT hadir mesti 0 kerana Alfa PDPR');

  var bukaTarikh = k.hadirBukaKehadiranTarikh_('1 UJI', '2026-09-24');
  var muridAlfaBuka = bukaTarikh.murid.find(m => m.nama === 'Murid Alfa');
  assert.equal(muridAlfaBuka.nilai, 1);
  assert.equal(muridAlfaBuka.kategori, 'A');
  assert.equal(muridAlfaBuka.sebab, 'PEMBELAJARAN DI RUMAH');

  // Semakan tarikh turut membaca nilai mentah dan sebab PDPR tanpa ReferenceError.
  var semakan = k.hadirSemakKehadiran_('2026-09-24');
  var semakKelas = semakan.kelas.find(x => x.nama === '1 UJI');
  assert.ok(semakKelas);
  assert.equal(semakKelas.tidakHadir, 0);
  assert.equal(semakKelas.hadir, 2);
  assert.equal(semakKelas.murid.length, 0); // Nama/kategori murid hadir tidak didedahkan awam.

  // Langkah 3: Guru menukar Alfa kembali kepada Hadir fizikal biasa (senarai sebab kosong)
  k.hadirSimpanKehadiran_('1 UJI', [], '', '2026-09-24');
  var sSebabSelepas = env.ss.getSheetByName('HADIR_MOEIS_SEBAB');
  assert.equal(sSebabSelepas.getLastRow(), 1, 'Rekod PDPR mesti dikeluarkan dari SEBAB bila ditukar hadir');

  var initData2 = k.hadirInit_('');
  var kelasInit2 = initData2.kelas.find(x => x.nama === '1 UJI');
  var muridAlfaInit2 = kelasInit2.murid.find(m => m.nama === 'Murid Alfa');
  assert.equal(muridAlfaInit2.nilai, 1);
  assert.equal(muridAlfaInit2.kategori, '', 'Kategori kosong selepas tukar hadir');
  assert.equal(kelasInit2.rmtHadir, 1, 'Kini Alfa hadir fizikal dan menerima RMT');
});

test('6. Pengesahan pelayan (Backend validation): fail-closed pada nilai mentah rosak', function () {
  var env = buatKonteks();
  var k = env.k;

  // Nilai mentah 0.4 tidak boleh disahkan untuk PDPR atau tidak hadir
  var jobSah = { status: 'berjaya', bilTidakHadir: 1 };
  var muridRosak = [{ nilai: 1, nilaiMentah: 0.4, kategori: 'A', sebab: 'PEMBELAJARAN DI RUMAH' }];
  assert.equal(k.hadirMoeisJobSelesaiSah_(jobSah, muridRosak), false, 'Nilai mentah 0.4 mesti ditolak');

  // PDPR tanpa sebab sah ditolak
  var muridPdprTanpaSebab = [{ nilai: 1, nilaiMentah: 1, kategori: 'A', sebab: '' }];
  assert.equal(k.hadirMoeisJobSelesaiSah_(jobSah, muridPdprTanpaSebab), false, 'PDPR tanpa sebab mesti ditolak');

  // hadirMoeisSahkanLengkap_ menolak murid PDPR dengan sebab tidak sah
  assert.throws(function () {
    k.hadirMoeisSahkanLengkap_([{ nama: 'Alfa', kategori: 'A', sebab: '' }], '1 UJI', false);
  }, /Kategori\/sebab belum lengkap/);
});

test('7. Status kad Semak Kehadiran (statusKadSemakan_)', function () {
  function fungsiApp(nama) {
    const padan = appJs.match(new RegExp(`function ${nama}\\([^]*?(?=\\n  function |\\n  var )`));
    assert.ok(padan, `Fungsi ${nama} tidak boleh diuji`);
    return padan[0];
  }
  const blokSebab = appJs.match(/var MOEIS_SEBAB = \{[\s\S]*?\n  \};/);
  assert.ok(blokSebab, 'Senarai MOEIS_SEBAB tidak ditemui');

  const konteksApp = {};
  vm.runInNewContext([
    blokSebab[0],
    fungsiApp('teks'),
    fungsiApp('adakahPdpr_'),
    fungsiApp('sebabMoeisSah_'),
    fungsiApp('statusKadSemakan_')
  ].join('\n'), konteksApp);

  const statusKad = konteksApp.statusKadSemakan_;
  const HARI_INI = '2026-09-24';

  function kls(senarai) {
    return { nama: '1 UJI', murid: senarai, sudahSimpan: true };
  }

  // A) Kelas dengan 1 PDPR (nilai 1) dan 1 Hadir (nilai 1): Telah diisi
  var s = statusKad(kls([
    { nilai: 1, kategori: 'A', sebab: 'PEMBELAJARAN DI RUMAH' },
    { nilai: 1, kategori: '', sebab: '' }
  ]), HARI_INI, HARI_INI, []);
  assert.equal(s.kod, 'diisi', 'Kelas dengan PDPR lengkap mesti "Telah diisi"');

  // B) Kelas dengan PDPR dan job berjaya -> Selesai MOEIS
  var buktiMoeis = [{ nama: '1 UJI', statusPenghantaran: 'berjaya', bilTidakHadir: 1 }];
  s = statusKad(kls([
    { nilai: 1, kategori: 'A', sebab: 'PEMBELAJARAN DI RUMAH' },
    { nilai: 1, kategori: '', sebab: '' }
  ]), HARI_INI, HARI_INI, buktiMoeis);
  assert.equal(s.kod, 'moeis', 'Kelas dengan PDPR dan bukti berjaya mesti "Selesai MOEIS"');

  // C) Kelas dengan PDPR tetapi sebab tidak sah -> Tidak lengkap
  s = statusKad(kls([
    { nilai: 1, kategori: 'A', sebab: 'BUKAN PDPR' },
    { nilai: 1, kategori: '', sebab: '' }
  ]), HARI_INI, HARI_INI, []);
  assert.equal(s.kod, 'tidak-lengkap', 'PDPR dengan sebab tidak sah mesti "Tidak lengkap"');
});
