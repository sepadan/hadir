// tests/hadir-pc-vm.test.cjs
// Menguji fungsi SEBENAR ciri berbilang PC dalam apps-script/HadirWeb.gs
// (hadirPc*_) di dalam persekitaran Apps Script palsu (vm), BUKAN cermin
// hadir-pc/kontrak.mjs. Tiada rangkaian sebenar, tiada Spreadsheet sebenar —
// semua SpreadsheetApp/PropertiesService/LockService/Utilities dipalsukan
// dalam memori sahaja.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const backend = fs.readFileSync(
  path.join(__dirname, '..', 'apps-script', 'HadirWeb.gs'),
  'utf8'
).replace(/\r\n/g, '\n');

// ---------------- Helaian & Julat palsu (in-memory, gaya Apps Script) ----------------

class HelaianPalsu {
  constructor(nama) {
    this.nama = nama;
    this.baris = []; // baris[0] = baris 1 (tajuk), dsb.
  }
  getRange(r, c, numRows, numCols) {
    return new JulatPalsu(this, r, c, numRows || 1, numCols || 1);
  }
  getDataRange() { return this.getRange(1, 1, this.getLastRow(), this.getLastColumn()); }
  appendRow(arr) { this.baris.push(arr.slice()); }
  deleteRow(r) { this.baris.splice(r - 1, 1); }
  getLastRow() { return this.baris.length; }
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
    return this.getValues().map(function (baris) {
      return baris.map(function (v) { return v == null ? '' : String(v); });
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

// ---------------- Konteks VM: satu persekitaran Apps Script palsu segar ----------------

function buatKonteks(opsyen) {
  opsyen = opsyen || {};
  var jam = { sekarang: opsyen.sekarang || 1_700_000_000_000 };
  var kunciDipegang = false;
  var bilKunci = 0;
  var selepasLepasKunci = null;
  var ss = new SpreadsheetPalsu();
  var propsStor = new Map();
  var propsMock = {
    getProperty: function (k) { return propsStor.has(k) ? propsStor.get(k) : null; },
    setProperty: function (k, v) { propsStor.set(k, String(v)); },
    deleteProperty: function (k) { propsStor.delete(k); }
  };

  var konteks = {
    console: console,
    Date: { now: function () { return jam.sekarang; } },
    ss: ss,
    SpreadsheetApp: { flush: function () {} },
    PropertiesService: { getScriptProperties: function () { return propsMock; } },
    LockService: {
      getScriptLock: function () {
        return {
          waitLock: function () {
            assert.equal(kunciDipegang, false, 'Kunci tidak boleh diambil semula sebelum dilepaskan (tiada bersarang)');
            kunciDipegang = true;
            bilKunci++;
          },
          releaseLock: function () {
            assert.equal(kunciDipegang, true, 'Kunci dilepaskan tanpa dipegang');
            kunciDipegang = false;
            if (selepasLepasKunci) {
              var callback = selepasLepasKunci;
              selepasLepasKunci = null;
              callback();
            }
          }
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
      formatDate: function () { return ''; }
    },
    Session: { getScriptTimeZone: function () { return 'Asia/Kuala_Lumpur'; } },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: function (teks) {
        return {
          _teks: teks,
          setMimeType: function () { return this; },
          getContent: function () { return teks; }
        };
      }
    },
    ScriptApp: { getScriptId: function () { return 'skrip-ujian'; } }
  };
  vm.createContext(konteks);
  vm.runInContext(backend, konteks);
  // Fungsi luar-fail (disediakan oleh Code.gs projek Apps Script sebenar, bukan
  // sebahagian HadirWeb.gs) — dipalsukan mengikut arahan spesifikasi. Fungsi
  // berbilang PC yang diuji di sini tidak bergantung kepada tingkah laku
  // sebenar fungsi ini.
  konteks.hadirLog_ = function () {};
  konteks.normalisasiIc_ = function (ic) { return String(ic == null ? '' : ic).trim(); };
  konteks.tarikhHariIni_ = function () { return '2026-01-01'; };

  return {
    k: konteks,
    props: propsMock,
    ss: ss,
    jam: jam,
    majukanMasa: function (ms) { jam.sekarang += ms; },
    kunciDipegang: function () { return kunciDipegang; },
    bilKunci: function () { return bilKunci; },
    selepasLepasKunci: function (callback) { selepasLepasKunci = callback; }
  };
}

function dayakanCiri(env) {
  env.props.setProperty('HADIR_PELBAGAI_PC', '1');
}

function tokenSesi(env, peranan) {
  var token = 'tok-' + Math.random().toString(36).slice(2);
  env.props.setProperty('HADIR_SESI_' + token, JSON.stringify({
    peranan: peranan || 'admin', luput: env.jam.sekarang + 3600000
  }));
  return token;
}

function buatKehadiranMoeisPalsu() {
  var env = buatKonteks();
  var tarikhIso = '2026-09-24', tkh = '24/09';
  env.k.Date = class extends Date {
    constructor(...args) { super(...(args.length ? args : ['2026-09-24T01:00:00Z'])); }
    static now() { return Date.parse('2026-09-24T01:00:00Z'); }
  };
  env.k.Utilities.formatDate = function (tarikh, zon, pola) {
    return pola === 'yyyy-MM-dd' ? tarikhIso : '09:00';
  };
  env.k.tarikhHariIni_ = function () { return tkh; };
  env.k.sediakanLajurSahaja = function () {};
  env.k.dapatkanKolTarikh_ = function () { return 5; };
  env.k.dapatkanIntervalArkib_ = function () { return []; };
  env.k.dapatkanIcAktifMain_ = function () { return {}; };
  env.k.muridTiadaPadaTarikh_ = function () { return false; };
  env.k.muridDisembunyikanHariIni_ = function () { return false; };
  env.k.hadirPetaRmt_ = function () { return {}; };
  env.k.hadirPadamCacheInit_ = function () {};
  env.props.setProperty('HADIR_MOEIS_ENGINE_SECRET', 'rahsia-fixture');
  var s = env.ss.insertSheet('kehadiran');
  s.appendRow(['NO', 'NAMA', 'KELAS', 'IC', tkh]);
  s.appendRow([1, 'Murid Alfa', '1 UJI', 'fixture-a', '']);
  s.appendRow([2, 'Murid Beta', '1 UJI', 'fixture-b', '']);
  return { env: env, tarikhIso: tarikhIso, tkh: tkh };
}

test('dua Simpan sebelum klaim menyegarkan satu job/ID dan klaim membaca snapshot kedua', function () {
  var f = buatKehadiranMoeisPalsu(), k = f.env.k;
  var kunciA = k.hadirKunciMurid_('fixture-a', f.tkh);
  var kunciB = k.hadirKunciMurid_('fixture-b', f.tkh);
  k.hadirSimpanKehadiran_('1 UJI', [{ kunci: kunciA, kategori: 'D', sebab: 'DEMAM' }], '', f.tarikhIso);
  var jobSheet = f.env.ss.getSheetByName('HADIR_MOEIS_JOB');
  assert.equal(jobSheet.getLastRow(), 2);
  var id = jobSheet.baris[1][0];
  assert.deepEqual(JSON.parse(jobSheet.baris[1][9]), [
    { ic: 'fixture-a', nama: 'Murid Alfa', kategori: 'D', sebab: 'DEMAM' }
  ]);
  var kehadiran = f.env.ss.getSheetByName('kehadiran');
  var bacaAsal = kehadiran.getDataRange.bind(kehadiran);
  kehadiran.getDataRange = function () {
    assert.equal(f.env.kunciDipegang(), true, 'snapshot job mesti dibaca di bawah ScriptLock');
    return bacaAsal();
  };
  k.hadirSimpanKehadiran_('1 UJI', [{ kunci: kunciB, kategori: 'N', sebab: 'BANGUN LEWAT' }], '', f.tarikhIso);
  assert.equal(jobSheet.getLastRow(), 2, 'tiada baris pendua');
  assert.equal(jobSheet.baris[1][0], id, 'ID asal dikekalkan');
  assert.equal(jobSheet.baris[1][3], 'menunggu');
  assert.deepEqual(JSON.parse(jobSheet.baris[1][9]), [
    { ic: 'fixture-b', nama: 'Murid Beta', kategori: 'N', sebab: 'BANGUN LEWAT' }
  ]);
  var claim = k.hadirMoeisJobKlaim_(id, 'desktop-fixture', false, 'rahsia-fixture');
  assert.deepEqual(Array.from(claim.murid, x => ({ ic: x.ic, nama: x.nama, kategori: x.kategori, sebab: x.sebab })), [
    { ic: 'fixture-b', nama: 'Murid Beta', kategori: 'N', sebab: 'BANGUN LEWAT' }
  ]);
});

test('klaim pada pelepasan kunci Simpan melihat snapshot terkini', function () {
  var f = buatKehadiranMoeisPalsu(), k = f.env.k;
  var kunciA = k.hadirKunciMurid_('fixture-a', f.tkh);
  var kunciB = k.hadirKunciMurid_('fixture-b', f.tkh);
  k.hadirSimpanKehadiran_('1 UJI', [{ kunci: kunciA, kategori: 'D', sebab: 'DEMAM' }], '', f.tarikhIso);
  var id = f.env.ss.getSheetByName('HADIR_MOEIS_JOB').baris[1][0];
  var claim;
  f.env.selepasLepasKunci(function () {
    claim = k.hadirMoeisJobKlaim_(id, 'desktop-fixture', false, 'rahsia-fixture');
  });
  k.hadirSimpanKehadiran_('1 UJI', [{ kunci: kunciB, kategori: 'N', sebab: 'BANGUN LEWAT' }], '', f.tarikhIso);
  assert.deepEqual(Array.from(claim.murid, x => x.ic), ['fixture-b']);
});

test('Simpan semua hadir membuang job menunggu dan klaim tidak menemuinya', function () {
  var f = buatKehadiranMoeisPalsu(), k = f.env.k;
  var kunciA = k.hadirKunciMurid_('fixture-a', f.tkh);
  k.hadirSimpanKehadiran_('1 UJI', [{ kunci: kunciA, kategori: 'D', sebab: 'DEMAM' }], '', f.tarikhIso);
  var id = f.env.ss.getSheetByName('HADIR_MOEIS_JOB').baris[1][0];
  k.hadirSimpanKehadiran_('1 UJI', [], '', f.tarikhIso);
  assert.equal(f.env.ss.getSheetByName('HADIR_MOEIS_JOB').getLastRow(), 1);
  assert.equal(k.hadirMoeisJobKlaim_(id, 'desktop-fixture', false, 'rahsia-fixture'), null);
});

test('Simpan semua hadir mengekalkan sejarah job gagal atau berjaya', function () {
  for (var status of ['gagal', 'berjaya']) {
    var f = buatKehadiranMoeisPalsu(), k = f.env.k;
    var kunciA = k.hadirKunciMurid_('fixture-a', f.tkh);
    k.hadirSimpanKehadiran_('1 UJI', [{ kunci: kunciA, kategori: 'D', sebab: 'DEMAM' }], '', f.tarikhIso);
    var jobSheet = f.env.ss.getSheetByName('HADIR_MOEIS_JOB');
    jobSheet.baris[1][3] = status;
    var sebelum = jobSheet.baris[1].slice();
    k.hadirSimpanKehadiran_('1 UJI', [], '', f.tarikhIso);
    assert.deepEqual(jobSheet.baris[1], sebelum);
  }
});

test('admin mencipta job dengan tepat satu ScriptLock tanpa bersarang', function () {
  var f = buatKehadiranMoeisPalsu(), k = f.env.k;
  var kunciA = k.hadirKunciMurid_('fixture-a', f.tkh);
  k.hadirSimpanKehadiran_('1 UJI', [{ kunci: kunciA, kategori: 'D', sebab: 'DEMAM' }], '', f.tarikhIso);
  var sebelum = f.env.bilKunci();
  f.env.props.setProperty('HADIR_SESI_admin-fixture', JSON.stringify({
    peranan: 'admin', luput: Date.parse('2027-01-01T00:00:00Z')
  }));
  k.hadirMoeisJobBuat_('1 UJI', f.tarikhIso, 'admin-fixture');
  assert.equal(f.env.bilKunci(), sebelum + 1);
  assert.equal(f.env.ss.getSheetByName('HADIR_MOEIS_JOB').getLastRow(), 2);
});

test('job sedia ada 11 lajur dimigrasi sebelum refresh atomik', function () {
  var f = buatKehadiranMoeisPalsu(), k = f.env.k;
  var kunciB = k.hadirKunciMurid_('fixture-b', f.tkh);
  var jobSheet = f.env.ss.insertSheet('HADIR_MOEIS_JOB');
  jobSheet.appendRow([
    'ID', 'TARIKH_ISO', 'KELAS', 'STATUS', 'MESEJ', 'DICIPTA',
    'DIKEMASKINI', 'MASA_SELESAI', 'BIL_HADIR_SELEPAS', 'MURID_JSON', 'KELAS_MOEIS_ID'
  ]);
  jobSheet.appendRow([
    'job-legacy', f.tarikhIso, '1 UJI', 'menunggu', '', 'masa', 'masa', '', '',
    JSON.stringify([{ ic: 'fixture-a', nama: 'Murid Alfa', kategori: 'D', sebab: 'DEMAM' }]), ''
  ]);

  k.hadirSimpanKehadiran_('1 UJI', [{ kunci: kunciB, kategori: 'N', sebab: 'BANGUN LEWAT' }], '', f.tarikhIso);

  assert.equal(jobSheet.baris[0][11], 'PEMILIK');
  assert.equal(jobSheet.baris[0][12], 'LEASE_SELEPAS');
  assert.equal(jobSheet.baris[1][0], 'job-legacy');
  assert.deepEqual(JSON.parse(jobSheet.baris[1][9]), [
    { ic: 'fixture-b', nama: 'Murid Beta', kategori: 'N', sebab: 'BANGUN LEWAT' }
  ]);
});

test('Simpan ketika job aktif menolak tanpa mengubah kehadiran, snapshot atau lease', function () {
  for (var status of ['sedang_dihantar', 'tersimpan']) {
    var f = buatKehadiranMoeisPalsu(), k = f.env.k;
    var kunciA = k.hadirKunciMurid_('fixture-a', f.tkh);
    var kunciB = k.hadirKunciMurid_('fixture-b', f.tkh);
    k.hadirSimpanKehadiran_('1 UJI', [{ kunci: kunciA, kategori: 'D', sebab: 'DEMAM' }], '', f.tarikhIso);
    var jobSheet = f.env.ss.getSheetByName('HADIR_MOEIS_JOB');
    jobSheet.baris[1][3] = status;
    jobSheet.baris[1][11] = 'desktop-fixture';
    jobSheet.baris[1][12] = 2_000_000_000_000;
    var sebelum = jobSheet.baris[1].slice();
    var kehadiran = f.env.ss.getSheetByName('kehadiran').baris.map(r => r.slice());
    assert.throws(function () {
      k.hadirSimpanKehadiran_('1 UJI', [{ kunci: kunciB, kategori: 'D', sebab: 'DEMAM' }], '', f.tarikhIso);
    }, /Tugasan.*sedang dihantar|Tugasan.*tersimpan/i);
    assert.equal(jobSheet.getLastRow(), 2);
    assert.deepEqual(jobSheet.baris[1], sebelum, status + ': job/lease aktif mesti kekal');
    assert.deepEqual(f.env.ss.getSheetByName('kehadiran').baris, kehadiran);
  }
});

// ================================================================
// hadirPcTerbitKodDaftar_
// ================================================================

test('pcTerbitKodDaftar_: menolak tanpa token sesi', function () {
  var env = buatKonteks();
  dayakanCiri(env);
  assert.throws(function () {
    env.k.hadirPcTerbitKodDaftar_('AKAUN1', 900000, '');
  }, /Sesi tamat|Sila log masuk semula/);
});

test('pcTerbitKodDaftar_: menolak token sesi yang tidak sah/luput', function () {
  var env = buatKonteks();
  dayakanCiri(env);
  assert.throws(function () {
    env.k.hadirPcTerbitKodDaftar_('AKAUN1', 900000, 'token-tidak-wujud');
  }, /Sesi tamat/);
});

test('pcTerbitKodDaftar_: menolak token bukan admin (Akses pentadbir)', function () {
  var env = buatKonteks();
  dayakanCiri(env);
  var tokenGuru = tokenSesi(env, 'guru');
  assert.throws(function () {
    env.k.hadirPcTerbitKodDaftar_('AKAUN1', 900000, tokenGuru);
  }, /Akses pentadbir/);
});

test('pcTerbitKodDaftar_: dengan token admin sah memulangkan {kodDaftar, luputMs} dan menyimpan HANYA hash', function () {
  var env = buatKonteks();
  dayakanCiri(env);
  var tokenAdmin = tokenSesi(env, 'admin');
  var hasil = env.k.hadirPcTerbitKodDaftar_('AKAUN1', 900000, tokenAdmin);
  assert.equal(typeof hasil.kodDaftar, 'string');
  assert.ok(hasil.kodDaftar.length > 10);
  assert.equal(hasil.luputMs, env.jam.sekarang + 900000);

  var hashKod = env.k.hadirHash_(hasil.kodDaftar);
  var kunci = 'HADIR_KOD_DAFTAR_' + hashKod;
  var mentahDisimpan = env.props.getProperty(kunci);
  assert.ok(mentahDisimpan, 'Kunci Script Properties berasaskan hash mesti wujud');
  // Kod mentah TIDAK PERNAH disimpan dalam nilai Script Properties.
  assert.ok(!mentahDisimpan.includes(hasil.kodDaftar), 'Nilai tersimpan tidak boleh mengandungi kod mentah');
});

// ================================================================
// hadirPcDaftarPeranti_
// ================================================================

test('pcDaftarPeranti_: kod tidak sah ditolak', function () {
  var env = buatKonteks();
  dayakanCiri(env);
  assert.throws(function () {
    env.k.hadirPcDaftarPeranti_('kod-tak-wujud', 'p1', 'AKAUN1', 'PC Kaunter', 'rahsia1');
  }, /Kod daftar tidak sah/);
  assert.equal(env.kunciDipegang(), false, 'Kunci mesti dilepaskan selepas kod tidak sah');
});

test('pcDaftarPeranti_: kod luput ditolak', function () {
  var env = buatKonteks();
  dayakanCiri(env);
  var tokenAdmin = tokenSesi(env, 'admin');
  var terbit = env.k.hadirPcTerbitKodDaftar_('AKAUN1', 1000, tokenAdmin);
  env.majukanMasa(1001);
  assert.throws(function () {
    env.k.hadirPcDaftarPeranti_(terbit.kodDaftar, 'p1', 'AKAUN1', 'PC Kaunter', 'rahsia1');
  }, /Kod daftar telah luput/);
});

test('pcDaftarPeranti_: kod untuk akaun lain ditolak', function () {
  var env = buatKonteks();
  dayakanCiri(env);
  var tokenAdmin = tokenSesi(env, 'admin');
  var terbit = env.k.hadirPcTerbitKodDaftar_('AKAUN1', 900000, tokenAdmin);
  assert.throws(function () {
    env.k.hadirPcDaftarPeranti_(terbit.kodDaftar, 'p1', 'AKAUN-LAIN', 'PC Kaunter', 'rahsia1');
  }, /Kod daftar tidak sah untuk akaun ini/);
});

test('pcDaftarPeranti_: pendaftaran sah mengembalikan rekod tersanitasi dan menyimpan hash rahsia, bukan teks jelas', function () {
  var env = buatKonteks();
  dayakanCiri(env);
  var tokenAdmin = tokenSesi(env, 'admin');
  var terbit = env.k.hadirPcTerbitKodDaftar_('AKAUN1', 900000, tokenAdmin);
  var rekod = env.k.hadirPcDaftarPeranti_(terbit.kodDaftar, 'p1', 'AKAUN1', 'PC Kaunter', 'rahsia-rawak-1');
  assert.equal(rekod.idPeranti, 'p1');
  assert.equal(rekod.akaun, 'AKAUN1');
  assert.equal(rekod.status, 'aktif');
  assert.equal(rekod.generasi, 1);
  assert.deepEqual(
    Object.keys(rekod).sort(),
    ['akaun', 'diciptaMs', 'dilulusMs', 'generasi', 'idPeranti', 'lastSeenMs', 'nama', 'nyahaktifMs', 'status'].sort(),
    'Rekod tersanitasi tidak boleh membawa medan rahsia/hash rahsia yang tidak dijangka'
  );

  var helaian = env.ss.getSheetByName('HADIR_PERANTI');
  var barisPeranti = helaian.baris[1]; // baris 2 (selepas tajuk)
  assert.equal(barisPeranti[3], env.k.hadirHash_('rahsia-rawak-1'), 'Lajur RAHSIA_HASH mesti sama dengan hash rahsia');
  assert.notEqual(barisPeranti[3], 'rahsia-rawak-1', 'Rahsia tidak boleh disimpan sebagai teks jelas');
});

test('pcDaftarPeranti_: perlanggaran sekali-guna — dua pendaftaran kod sama, tepat SATU berjaya', function () {
  var env = buatKonteks();
  dayakanCiri(env);
  var tokenAdmin = tokenSesi(env, 'admin');
  var terbit = env.k.hadirPcTerbitKodDaftar_('AKAUN1', 900000, tokenAdmin);

  var berjaya = 0, gagal = 0, mesejGagal = '';
  [['p1', 'PC Satu'], ['p2', 'PC Dua']].forEach(function (pasangan) {
    try {
      env.k.hadirPcDaftarPeranti_(terbit.kodDaftar, pasangan[0], 'AKAUN1', pasangan[1], 'rahsia-' + pasangan[0]);
      berjaya++;
    } catch (e) { gagal++; mesejGagal = e.message; }
  });
  assert.equal(berjaya, 1, 'Tepat satu percubaan pendaftaran mesti berjaya bagi kod yang sama');
  assert.equal(gagal, 1, 'Percubaan kedua bagi kod yang sama mesti ditolak');
  assert.match(mesejGagal, /Kod daftar telah digunakan/);
});

test('pcDaftarPeranti_: peranti id sedia ada tidak boleh didaftar semula', function () {
  var env = buatKonteks();
  dayakanCiri(env);
  var tokenAdmin = tokenSesi(env, 'admin');
  var t1 = env.k.hadirPcTerbitKodDaftar_('AKAUN1', 900000, tokenAdmin);
  env.k.hadirPcDaftarPeranti_(t1.kodDaftar, 'p1', 'AKAUN1', 'PC Satu', 'rahsia1');
  var t2 = env.k.hadirPcTerbitKodDaftar_('AKAUN1', 900000, tokenAdmin);
  assert.throws(function () {
    env.k.hadirPcDaftarPeranti_(t2.kodDaftar, 'p1', 'AKAUN1', 'PC Satu Lagi', 'rahsia2');
  }, /Peranti sudah didaftarkan/);
});

// ================================================================
// Flag OFF — setiap laluan tulis mesti ditolak
// ================================================================

test('Ciri berbilang PC dilumpuhkan (lalai OFF): setiap laluan tulis/baca terkawal ditolak', function () {
  var env = buatKonteks(); // HADIR_PELBAGAI_PC TIDAK ditetapkan
  var tokenAdmin = tokenSesi(env, 'admin');

  assert.throws(function () { env.k.hadirPcTerbitKodDaftar_('AKAUN1', 900000, tokenAdmin); },
    /Ciri berbilang PC dilumpuhkan\./);
  assert.throws(function () { env.k.hadirPcDaftarPeranti_('kod', 'p1', 'AKAUN1', 'PC', 'rahsia'); },
    /Ciri berbilang PC dilumpuhkan\./);
  assert.throws(function () { env.k.hadirPcNyahaktifPeranti_('p1', 'AKAUN1', tokenAdmin); },
    /Ciri berbilang PC dilumpuhkan\./);
  assert.throws(function () { env.k.hadirPcDegup_('p1', 'AKAUN1', 'rahsia'); },
    /Ciri berbilang PC dilumpuhkan\./);
  assert.throws(function () { env.k.hadirPcKlaimKepimpinan_('p1', 'AKAUN1', 'rahsia'); },
    /Ciri berbilang PC dilumpuhkan\./);
  assert.throws(function () { env.k.hadirPcSahkanPenulis_('p1', 'AKAUN1', 'rahsia', 1); },
    /Ciri berbilang PC dilumpuhkan\./);
  assert.throws(function () { env.k.hadirPcSenaraiPerantiAdmin_('AKAUN1', tokenAdmin); },
    /Ciri berbilang PC dilumpuhkan\./);
});

test('Ciri berbilang PC dilumpuhkan: nilai selain "1" turut dianggap OFF', function () {
  var env = buatKonteks();
  env.props.setProperty('HADIR_PELBAGAI_PC', '0');
  assert.throws(function () { env.k.hadirPcDegup_('p1', 'AKAUN1', 'rahsia'); },
    /Ciri berbilang PC dilumpuhkan\./);
});

// ================================================================
// Bantuan: daftar satu peranti aktif (ciri didayakan) untuk ujian seterusnya
// ================================================================

function daftarPerantiAktif(env, idPeranti, akaun, rahsia) {
  var tokenAdmin = tokenSesi(env, 'admin');
  var terbit = env.k.hadirPcTerbitKodDaftar_(akaun, 900000, tokenAdmin);
  return env.k.hadirPcDaftarPeranti_(terbit.kodDaftar, idPeranti, akaun, idPeranti, rahsia);
}

// ================================================================
// hadirPcDegup_
// ================================================================

test('pcDegup_: menolak rahsia salah atau peranti tidak diluluskan', function () {
  var env = buatKonteks();
  dayakanCiri(env);
  daftarPerantiAktif(env, 'p1', 'AKAUN1', 'rahsia-betul');
  assert.throws(function () {
    env.k.hadirPcDegup_('p1', 'AKAUN1', 'rahsia-salah');
  }, /Akses peranti ditolak/);
});

test('pcDegup_: memulangkan bentuk tersanitasi {ok, pemimpin, generasi} sahaja — tiada rahsia/hash/nama/PII', function () {
  var env = buatKonteks();
  dayakanCiri(env);
  daftarPerantiAktif(env, 'p1', 'AKAUN1', 'rahsia-betul');
  var hasil = env.k.hadirPcDegup_('p1', 'AKAUN1', 'rahsia-betul');
  assert.deepEqual(Object.keys(hasil).sort(), ['generasi', 'ok', 'pemimpin']);
  assert.equal(typeof hasil.ok, 'boolean');
  assert.equal(typeof hasil.pemimpin, 'boolean');
  assert.equal(typeof hasil.generasi, 'number');
  var teksJson = JSON.stringify(hasil);
  assert.ok(!/rahsia|hash|nama|p1/i.test(teksJson), 'Respons degup tidak boleh membocorkan PII/rahsia/id: ' + teksJson);
});

test('pcDegup_: merekod LAST_SEEN_MS pada helaian peranti', function () {
  var env = buatKonteks();
  dayakanCiri(env);
  daftarPerantiAktif(env, 'p1', 'AKAUN1', 'rahsia-betul');
  env.majukanMasa(5000);
  env.k.hadirPcDegup_('p1', 'AKAUN1', 'rahsia-betul');
  var helaian = env.ss.getSheetByName('HADIR_PERANTI');
  var lastSeenMs = helaian.baris[1][8];
  assert.equal(lastSeenMs, env.jam.sekarang);
});

// ================================================================
// hadirPcKlaimKepimpinan_ + hadirPcSahkanPenulis_
// ================================================================

test('pcKlaimKepimpinan_: peranti pertama menjadi pemimpin baharu (generasi 1)', function () {
  var env = buatKonteks();
  dayakanCiri(env);
  daftarPerantiAktif(env, 'p1', 'AKAUN1', 'rahsia1');
  var hasil = env.k.hadirPcKlaimKepimpinan_('p1', 'AKAUN1', 'rahsia1');
  assert.equal(hasil.ok, true);
  assert.equal(hasil.pemimpin, 'p1');
  assert.equal(hasil.generasi, 1);
});

test('pcKlaimKepimpinan_: perlumbaan dua peranti — tepat SATU menjadi pemimpin semasa lease aktif', function () {
  var env = buatKonteks();
  dayakanCiri(env);
  daftarPerantiAktif(env, 'p1', 'AKAUN1', 'rahsia1');
  daftarPerantiAktif(env, 'p2', 'AKAUN1', 'rahsia2');

  var hasilP1 = env.k.hadirPcKlaimKepimpinan_('p1', 'AKAUN1', 'rahsia1');
  assert.equal(hasilP1.pemimpin, 'p1');

  assert.throws(function () {
    env.k.hadirPcKlaimKepimpinan_('p2', 'AKAUN1', 'rahsia2');
  }, /Pemimpin aktif lain memegang lease/);

  // Sahkan hanya SATU pemimpin tercatat pada helaian lead.
  var statusAwam = env.k.hadirPcStatusAwam_();
  var rekodAkaun = statusAwam.filter(function (a) { return a.akaun === 'AKAUN1'; });
  assert.equal(rekodAkaun.length, 1);
  assert.equal(rekodAkaun[0].pemimpin, 'p1');
});

test('pcKlaimKepimpinan_: pengambilalihan dibenarkan selepas lease pemimpin lama luput', function () {
  var env = buatKonteks();
  dayakanCiri(env);
  daftarPerantiAktif(env, 'p1', 'AKAUN1', 'rahsia1');
  daftarPerantiAktif(env, 'p2', 'AKAUN1', 'rahsia2');

  env.k.hadirPcKlaimKepimpinan_('p1', 'AKAUN1', 'rahsia1');
  env.majukanMasa(60000); // > HADIR_PELBAGAI_PC_LEASE_MS (45 saat)

  var hasilAmbilAlih = env.k.hadirPcKlaimKepimpinan_('p2', 'AKAUN1', 'rahsia2');
  assert.equal(hasilAmbilAlih.pemimpin, 'p2');
  assert.equal(hasilAmbilAlih.generasi, 2);
});

test('pcSahkanPenulis_: generasi lapuk selepas pemimpin sama memperbaharui kepimpinan (heartbeat) ditolak', function () {
  var env = buatKonteks();
  dayakanCiri(env);
  daftarPerantiAktif(env, 'p1', 'AKAUN1', 'rahsia1');

  var klaim1 = env.k.hadirPcKlaimKepimpinan_('p1', 'AKAUN1', 'rahsia1');
  var klaim2 = env.k.hadirPcKlaimKepimpinan_('p1', 'AKAUN1', 'rahsia1'); // pembaharuan diri sendiri -> generasi++
  assert.equal(klaim2.generasi, klaim1.generasi + 1);

  // Penulis yang masih memegang generasi lama (sebelum pembaharuan) mesti dipagar.
  assert.throws(function () {
    env.k.hadirPcSahkanPenulis_('p1', 'AKAUN1', 'rahsia1', klaim1.generasi);
  }, /Generasi lapuk/);

  // Generasi terkini masih diterima.
  var hasil = env.k.hadirPcSahkanPenulis_('p1', 'AKAUN1', 'rahsia1', klaim2.generasi);
  assert.equal(hasil.ok, true);
});

test('pcSahkanPenulis_: pemimpin lama yang telah diambil alih ditolak sebagai "bukan pemimpin semasa"', function () {
  var env = buatKonteks();
  dayakanCiri(env);
  daftarPerantiAktif(env, 'p1', 'AKAUN1', 'rahsia1');
  daftarPerantiAktif(env, 'p2', 'AKAUN1', 'rahsia2');

  var klaimP1 = env.k.hadirPcKlaimKepimpinan_('p1', 'AKAUN1', 'rahsia1');
  env.majukanMasa(60000);
  env.k.hadirPcKlaimKepimpinan_('p2', 'AKAUN1', 'rahsia2');

  // p1 tidak lagi pemimpin langsung selepas pengambilalihan — ditolak sebelum sempat semak generasi.
  assert.throws(function () {
    env.k.hadirPcSahkanPenulis_('p1', 'AKAUN1', 'rahsia1', klaimP1.generasi);
  }, /Peranti bukan pemimpin semasa/);
});

test('pcSahkanPenulis_: pemimpin semasa dengan generasi terkini diterima', function () {
  var env = buatKonteks();
  dayakanCiri(env);
  daftarPerantiAktif(env, 'p1', 'AKAUN1', 'rahsia1');
  var klaim = env.k.hadirPcKlaimKepimpinan_('p1', 'AKAUN1', 'rahsia1');
  var hasil = env.k.hadirPcSahkanPenulis_('p1', 'AKAUN1', 'rahsia1', klaim.generasi);
  assert.equal(hasil.ok, true);
});

test('pcSahkanPenulis_: peranti yang bukan pemimpin semasa ditolak', function () {
  var env = buatKonteks();
  dayakanCiri(env);
  daftarPerantiAktif(env, 'p1', 'AKAUN1', 'rahsia1');
  daftarPerantiAktif(env, 'p2', 'AKAUN1', 'rahsia2');
  var klaim = env.k.hadirPcKlaimKepimpinan_('p1', 'AKAUN1', 'rahsia1');
  assert.throws(function () {
    env.k.hadirPcSahkanPenulis_('p2', 'AKAUN1', 'rahsia2', klaim.generasi);
  }, /Peranti bukan pemimpin semasa/);
});

// ================================================================
// hadirPcNyahaktifPeranti_ + hadirPcSenaraiPerantiAdmin_
// ================================================================

test('pcNyahaktifPeranti_: menolak tanpa token admin', function () {
  var env = buatKonteks();
  dayakanCiri(env);
  daftarPerantiAktif(env, 'p1', 'AKAUN1', 'rahsia1');
  assert.throws(function () {
    env.k.hadirPcNyahaktifPeranti_('p1', 'AKAUN1', '');
  }, /Sesi tamat|Sila log masuk semula/);
});

test('pcSenaraiPerantiAdmin_: menolak token bukan admin', function () {
  var env = buatKonteks();
  dayakanCiri(env);
  daftarPerantiAktif(env, 'p1', 'AKAUN1', 'rahsia1');
  var tokenGuru = tokenSesi(env, 'guru');
  assert.throws(function () {
    env.k.hadirPcSenaraiPerantiAdmin_('AKAUN1', tokenGuru);
  }, /Akses pentadbir/);
});

test('pcSenaraiPerantiAdmin_: dengan token admin memulangkan senarai peranti bagi akaun tersebut sahaja', function () {
  var env = buatKonteks();
  dayakanCiri(env);
  daftarPerantiAktif(env, 'p1', 'AKAUN1', 'rahsia1');
  daftarPerantiAktif(env, 'p2', 'AKAUN2', 'rahsia2');
  var tokenAdmin = tokenSesi(env, 'admin');
  var senarai = env.k.hadirPcSenaraiPerantiAdmin_('AKAUN1', tokenAdmin);
  assert.equal(senarai.length, 1);
  assert.equal(senarai[0].idPeranti, 'p1');
});

test('pcNyahaktifPeranti_: dengan token admin sah menukar status dan melucutkan kepimpinan jika berkenaan', function () {
  var env = buatKonteks();
  dayakanCiri(env);
  daftarPerantiAktif(env, 'p1', 'AKAUN1', 'rahsia1');
  env.k.hadirPcKlaimKepimpinan_('p1', 'AKAUN1', 'rahsia1');

  var tokenAdmin = tokenSesi(env, 'admin');
  var hasil = env.k.hadirPcNyahaktifPeranti_('p1', 'AKAUN1', tokenAdmin);
  assert.equal(hasil.ok, true);

  var senarai = env.k.hadirPcSenaraiPerantiAdmin_('AKAUN1', tokenAdmin);
  assert.equal(senarai[0].status, 'nyahaktif');

  // Peranti dinyahaktifkan tidak lagi boleh degup/klaim.
  assert.throws(function () {
    env.k.hadirPcDegup_('p1', 'AKAUN1', 'rahsia1');
  }, /Peranti tidak diluluskan/);
});

test('pcNyahaktifPeranti_: peranti tidak ditemui bagi akaun ditolak', function () {
  var env = buatKonteks();
  dayakanCiri(env);
  daftarPerantiAktif(env, 'p1', 'AKAUN1', 'rahsia1');
  var tokenAdmin = tokenSesi(env, 'admin');
  assert.throws(function () {
    env.k.hadirPcNyahaktifPeranti_('p1', 'AKAUN-LAIN', tokenAdmin);
  }, /Peranti tidak ditemui/);
});

// ================================================================
// hadirPcStatusAwam_
// ================================================================

test('pcStatusAwam_: awam, baca sahaja, dan TIDAK mencipta helaian apabila tiada — memulangkan []', function () {
  var env = buatKonteks(); // tiada peranti/lead langsung dicipta, ciri pun tidak didayakan
  var hasil = env.k.hadirPcStatusAwam_();
  assert.equal(Array.isArray(hasil), true);
  assert.equal(hasil.length, 0);
  assert.equal(env.ss.getSheetByName('HADIR_PERANTI_LEAD'), null, 'Status awam tidak boleh mencipta helaian LEAD');
  assert.equal(env.ss.getSheetByName('HADIR_PERANTI'), null, 'Status awam tidak boleh mencipta helaian PERANTI');
});

test('pcStatusAwam_: tidak memerlukan token dan tidak membocorkan PII/rahsia', function () {
  var env = buatKonteks();
  dayakanCiri(env);
  daftarPerantiAktif(env, 'p1', 'AKAUN1', 'rahsia-rahsia');
  env.k.hadirPcKlaimKepimpinan_('p1', 'AKAUN1', 'rahsia-rahsia');
  var hasil = env.k.hadirPcStatusAwam_();
  assert.equal(hasil.length, 1);
  assert.deepEqual(Object.keys(hasil[0]).sort(), ['akaun', 'generasi', 'leaseMs', 'pemimpin', 'lastSeenMs'].sort());
  var teksJson = JSON.stringify(hasil);
  assert.ok(!/rahsia/i.test(teksJson), 'Status awam tidak boleh membocorkan rahsia: ' + teksJson);
});


// ================================================================
// Gerbang cipta semula tugasan (hadirMoeisBolehCiptaJob_)
// ================================================================
//
// 23 Sep 2026: 1 BIJAK mempunyai status 'berjaya' yang SALAH (positif palsu
// MuatSemula lama) dan gerbang menolak cipta semula walaupun MOEIS langsung
// tidak terisi — tiada jalan keluar automatik. Peraturan mesti:
//   - benarkan kosong / 'gagal'      (perilaku asal, kekal)
//   - benarkan 'berjaya'             (status siap boleh dihantar semula;
//     pemanggil MEMANG menggunakan semula baris yang sama — id lama +
//     setValues semula kepada 'menunggu' — jadi pendua tetap mustahil)
//   - benarkan 'menunggu' untuk mengganti snapshot sebelum klaim
//   - SEKAT 'sedang_dihantar' / 'tersimpan' (jangan reset lease enjin)
test('hadirMoeisBolehCiptaJob_: menunggu boleh disegarkan, lease aktif disekat', function () {
  var env = buatKonteks();
  var f = env.k.hadirMoeisBolehCiptaJob_;
  assert.equal(typeof f, 'function', 'gerbang mesti wujud dalam HadirWeb.gs');

  // Perilaku asal mesti kekal
  assert.equal(f(undefined), true, 'tiada tugasan sedia ada -> cipta');
  assert.equal(f(null), true, 'status null -> cipta');
  assert.equal(f(''), true, 'status kosong -> cipta');
  assert.equal(f('gagal'), true, 'gagal -> cipta semula (perilaku asal)');

  // Pembaikan 1 BIJAK: status siap kini boleh dihantar semula
  assert.equal(f('berjaya'), true,
    'berjaya -> BOLEH dihantar semula; sebelum ini ia mengunci 1 BIJAK walaupun MOEIS kosong');

  assert.equal(f('menunggu'), true, 'menunggu -> segarkan snapshot sebelum klaim');
  assert.equal(f('sedang_dihantar'), false, 'sedang_dihantar -> disekat (jangan reset lease)');
  assert.equal(f('tersimpan'), false,
    'tersimpan -> disekat (menunggu pengesahan; jangan reset lease)');
});
