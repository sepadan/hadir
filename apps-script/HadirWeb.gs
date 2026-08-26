// HADIR v1.6.1 — backend web untuk projek Apps Script KEHADIRAN.
// Fail ini tidak menggantikan bot Telegram. doPost sedia ada hanya perlu
// menyerahkan permintaan mode="hadir" kepada hadirDoPost_() terlebih dahulu.

var HADIR_SESI_JAM = 8;
var HADIR_CACHE_INIT_SAAT = 15;
var HADIR_AKSI_URL_LALAI = 'https://script.google.com/macros/s/AKfycby0Td2p3zoAdBWXYbbKTqmVS4Xa8R42k0suzeDFTIjgwg-hVxIzYqNkEyTE75E_bukfLA/exec';
var HADIR_SEMAK_URL_LALAI = 'https://script.google.com/macros/s/AKfycbx306dN8vd3HR3Mu4xdum8MpG0PkbbwbKgsu88jx-nMG2LnEWszU350S2ez8TU_kX_H/exec';

function hadirAdakahPermintaan_(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return false;
    var p = JSON.parse(e.postData.contents);
    if (!p || p.mode !== 'hadir') return false;
    e.hadirPayload_ = p;
    return true;
  } catch (ralat) { return false; }
}

function hadirDoPost_(e) {
  var p = e.hadirPayload_ || JSON.parse(e.postData.contents || '{}');
  var dibenarkan = {
    login: hadirLogin_, logout: hadirLogout_, init: hadirInit_,
    semakKehadiran: hadirSemakKehadiran_,
    simpanKehadiran: hadirSimpanKehadiran_, senaraiMurid: hadirSenaraiMurid_,
    simpanMurid: hadirSimpanMurid_, simpanTetapanMurid: hadirSimpanTetapanMurid_,
    uploadMuridCsv: hadirUploadMuridCsv_,
    syncSemua: hadirSyncSemuaApi_
  };
  try {
    var fn = dibenarkan[String(p.kaedah || '')];
    if (!fn) throw new Error('Fungsi tidak dibenarkan.');
    var args = Array.isArray(p.argumen) ? p.argumen : [];
    return hadirJson_({ ok: true, hasil: fn.apply(null, args) });
  } catch (ralat) {
    return hadirJson_({ ok: false, ralat: ralat && ralat.message ? ralat.message : String(ralat) });
  }
}

function hadirJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function hadirHash_(nilai) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(nilai || ''), Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}

function hadirLogin_(peranan, pin) {
  if (peranan !== 'admin') throw new Error('Log masuk hanya diperlukan untuk admin.');
  var props = PropertiesService.getScriptProperties();
  var kunci = 'HADIR_ADMIN_PIN_HASH';
  var betul = props.getProperty(kunci);
  if (!betul) throw new Error('PIN admin belum ditetapkan oleh pentadbir.');
  if (hadirHash_(pin) !== betul) throw new Error('PIN tidak betul.');
  var token = Utilities.getUuid() + Utilities.getUuid();
  props.setProperty('HADIR_SESI_' + token, JSON.stringify({
    peranan: peranan, luput: Date.now() + HADIR_SESI_JAM * 3600000
  }));
  hadirLog_('LOGIN', peranan, '', 'berjaya');
  return { token: token, peranan: peranan };
}

function hadirSesi_(token, wajibAdmin) {
  if (!token) throw new Error('Sila log masuk semula.');
  var props = PropertiesService.getScriptProperties();
  var kunci = 'HADIR_SESI_' + token;
  var mentah = props.getProperty(kunci);
  if (!mentah) throw new Error('Sesi tamat. Sila log masuk semula.');
  var sesi;
  try { sesi = JSON.parse(mentah); } catch (e) { sesi = null; }
  if (!sesi || Number(sesi.luput) < Date.now()) {
    props.deleteProperty(kunci);
    throw new Error('Sesi tamat. Sila log masuk semula.');
  }
  if (wajibAdmin && sesi.peranan !== 'admin') throw new Error('Akses pentadbir diperlukan.');
  sesi.luput = Date.now() + HADIR_SESI_JAM * 3600000;
  props.setProperty(kunci, JSON.stringify(sesi));
  return sesi;
}

function hadirLogout_(token) {
  if (token) PropertiesService.getScriptProperties().deleteProperty('HADIR_SESI_' + token);
  return { ok: true };
}

function hadirInit_(token) {
  var sesi = token ? hadirSesi_(token, true) : { peranan: 'guru' };
  var zona = Session.getScriptTimeZone() || 'Asia/Kuala_Lumpur';
  var sekarang = new Date();
  var tarikhIso = Utilities.formatDate(sekarang, zona, 'yyyy-MM-dd');
  var cache = CacheService.getScriptCache();
  var kunciCache = hadirKunciCacheInit_(tarikhIso);
  var mentah = cache.get(kunciCache);
  var hasil = null;
  if (mentah) {
    try { hasil = JSON.parse(mentah); } catch (e) { hasil = null; }
  }
  if (!hasil) {
    hasil = hadirBinaInit_(sekarang, zona, tarikhIso);
    try { cache.put(kunciCache, JSON.stringify(hasil), HADIR_CACHE_INIT_SAAT); } catch (e) {}
  }
  hasil.peranan = sesi.peranan;
  return hasil;
}

function hadirBinaInit_(sekarang, zona, tarikhIso) {
  var s = ss.getSheetByName('kehadiran');
  if (!s) throw new Error('Tab kehadiran tidak ditemui.');
  var data = s.getDataRange().getDisplayValues();
  var tkh = tarikhHariIni_();
  var idxTarikh = data.length ? data[0].indexOf(tkh) : -1;
  var intervalArkib = dapatkanIntervalArkib_();
  var icMain = dapatkanIcAktifMain_();
  var petaRmt = hadirPetaRmt_();
  var peta = Object.create(null);
  for (var i = 1; i < data.length; i++) {
    var nama = String(data[i][1] || '').trim();
    var kelas = String(data[i][2] || '').trim().toUpperCase();
    var ic = normalisasiIc_(data[i][3]);
    if (!nama || !kelas || !ic || muridDisembunyikanHariIni_(ic, intervalArkib, icMain)) continue;
    if (!peta[kelas]) peta[kelas] = [];
    var nilai = idxTarikh < 0 ? '' : data[i][idxTarikh];
    peta[kelas].push({
      kunci: hadirKunciMurid_(ic, tkh), nama: nama,
      nilai: nilai === '0' ? 0 : nilai === '1' ? 1 : '',
      _rmt: !!petaRmt[ic],
      _rmtHadir: nilai === '1' && !!petaRmt[ic]
    });
  }
  var kelasHasil = Object.keys(peta).sort(hadirSusunKelas_).map(function (kelas) {
    var murid = peta[kelas].sort(function (a, b) { return a.nama.localeCompare(b.nama); });
    return {
      nama: kelas,
      murid: murid.map(function (m) { return { kunci: m.kunci, nama: m.nama, nilai: m.nilai }; }),
      jumlah: murid.length,
      tidakHadir: murid.filter(function (m) { return m.nilai === 0; }).length,
      rmtJumlah: murid.filter(function (m) { return m._rmt; }).length,
      rmtHadir: murid.filter(function (m) { return m._rmtHadir; }).length,
      sudahSimpan: murid.some(function (m) { return m.nilai === 0 || m.nilai === 1; })
    };
  });
  return {
    peranan: 'guru', tarikh: tkh,
    tarikhIso: tarikhIso,
    tarikhMinimum: tarikhIso.slice(0, 4) + '-01-01',
    tarikhMaksimum: tarikhIso,
    tarikhPaparan: hadirTarikhPaparanMs_(sekarang, zona),
    kelas: kelasHasil
  };
}

function hadirKunciCacheInit_(tarikhIso) {
  return 'HADIR_INIT_V3_' + String(tarikhIso || '');
}

function hadirPadamCacheInit_() {
  try {
    var zona = Session.getScriptTimeZone() || 'Asia/Kuala_Lumpur';
    var tarikhIso = Utilities.formatDate(new Date(), zona, 'yyyy-MM-dd');
    CacheService.getScriptCache().remove(hadirKunciCacheInit_(tarikhIso));
  } catch (e) {}
}

/* Paparan baca sahaja untuk guru tanpa log masuk. Tab kehadiran menggunakan
   tajuk dd/MM, jadi semakan dihadkan kepada tahun semasa untuk mengelakkan
   satu tajuk lama disalah tafsir sebagai tahun yang berlainan. Respons awam
   hanya mengandungi nama murid tidak hadir, bilangan kelas dan jumlah RMT;
   nama murid hadir, IC serta status RMT individu tidak pernah dihantar. */
function hadirSemakKehadiran_(tarikhIso) {
  var zona = Session.getScriptTimeZone() || 'Asia/Kuala_Lumpur';
  var hariIniIso = Utilities.formatDate(new Date(), zona, 'yyyy-MM-dd');
  tarikhIso = String(tarikhIso || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tarikhIso)) throw new Error('Tarikh tidak sah.');
  var bahagian = tarikhIso.split('-').map(Number);
  var semak = new Date(Date.UTC(bahagian[0], bahagian[1] - 1, bahagian[2]));
  if (semak.getUTCFullYear() !== bahagian[0] || semak.getUTCMonth() + 1 !== bahagian[1] ||
      semak.getUTCDate() !== bahagian[2]) throw new Error('Tarikh tidak sah.');
  if (tarikhIso.slice(0, 4) !== hariIniIso.slice(0, 4))
    throw new Error('Semakan hanya tersedia bagi tahun semasa.');
  if (tarikhIso > hariIniIso) throw new Error('Tarikh akan datang belum boleh disemak.');

  var tkh = ('0' + bahagian[2]).slice(-2) + '/' + ('0' + bahagian[1]).slice(-2);
  var s = ss.getSheetByName('kehadiran');
  if (!s) throw new Error('Tab kehadiran tidak ditemui.');
  var data = s.getDataRange().getDisplayValues();
  var idxTarikh = data.length ? data[0].indexOf(tkh) : -1;
  var peta = Object.create(null);
  var intervalArkib = dapatkanIntervalArkib_();
  var icMain = dapatkanIcAktifMain_();
  var petaRmt = hadirPetaRmt_();

  if (idxTarikh >= 0) {
    for (var i = 1; i < data.length; i++) {
      var nama = String(data[i][1] || '').trim();
      var kelas = String(data[i][2] || '').trim().toUpperCase();
      var ic = normalisasiIc_(data[i][3]);
      if (!nama || !kelas || !ic || muridTiadaPadaTarikh_(ic, tkh, intervalArkib, icMain)) continue;
      if (!peta[kelas]) peta[kelas] = [];
      var nilai = data[i][idxTarikh];
      peta[kelas].push({
        nama: nama,
        nilai: nilai === '0' ? 0 : nilai === '1' ? 1 : '',
        _rmt: !!petaRmt[ic],
        _rmtHadir: nilai === '1' && !!petaRmt[ic]
      });
    }
  }

  var kelasHasil = Object.keys(peta).sort(hadirSusunKelas_).map(function (kelas) {
    var murid = peta[kelas].sort(function (a, b) { return a.nama.localeCompare(b.nama); });
    return {
      nama: kelas,
      murid: murid.filter(function (m) { return m.nilai === 0; })
        .map(function (m) { return { nama: m.nama, nilai: 0 }; }),
      jumlah: murid.length,
      hadir: murid.filter(function (m) { return m.nilai === 1; }).length,
      tidakHadir: murid.filter(function (m) { return m.nilai === 0; }).length,
      rmtJumlah: murid.filter(function (m) { return m._rmt; }).length,
      rmtHadir: murid.filter(function (m) { return m._rmtHadir; }).length,
      sudahSimpan: murid.some(function (m) { return m.nilai === 0 || m.nilai === 1; })
    };
  });

  return {
    tarikh: tkh, tarikhIso: tarikhIso,
    tarikhMinimum: hariIniIso.slice(0, 4) + '-01-01', tarikhMaksimum: hariIniIso,
    tarikhPaparan: hadirTarikhPaparanMs_(semak, 'UTC'), kelas: kelasHasil
  };
}

function hadirPetaRmt_() {
  var s = ss.getSheetByName('rmt');
  var peta = Object.create(null);
  if (!s || s.getLastRow() < 2) return peta;
  s.getRange(2, 4, s.getLastRow() - 1, 2).getDisplayValues().forEach(function (r) {
    var ic = normalisasiIc_(r[1]);
    if (ic && String(r[0]).trim() === '1') peta[ic] = true;
  });
  return peta;
}

function hadirTarikhPaparanMs_(tarikh, zona) {
  var tahun = Number(Utilities.formatDate(tarikh, zona, 'yyyy'));
  var bulan = Number(Utilities.formatDate(tarikh, zona, 'M'));
  var hari = Number(Utilities.formatDate(tarikh, zona, 'd'));
  var namaHari = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];
  var namaBulan = ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun',
    'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'];
  var indeksHari = new Date(Date.UTC(tahun, bulan - 1, hari)).getUTCDay();
  return namaHari[indeksHari] + ', ' + hari + ' ' + namaBulan[bulan - 1] + ' ' + tahun;
}

function hadirKunciMurid_(ic, tarikh) {
  return hadirHash_(ScriptApp.getScriptId() + '|' + String(tarikh || tarikhHariIni_()) + '|' + normalisasiIc_(ic)).slice(0, 24);
}

function hadirSusunKelas_(a, b) {
  var na = parseInt(a, 10) || 99, nb = parseInt(b, 10) || 99;
  return na - nb || a.localeCompare(b);
}

function hadirSimpanKehadiran_(kelas, senaraiTiada, token) {
  var sesi = token ? hadirSesi_(token, true) : { peranan: 'guru' };
  kelas = String(kelas || '').trim().toUpperCase();
  if (!kelas) throw new Error('Kelas tidak sah.');
  var tiada = Object.create(null);
  (senaraiTiada || []).forEach(function (kunci) { tiada[String(kunci || '').trim()] = true; });
  // Sediakan lajur sebelum mengambil lock di bawah kerana fungsi asal turut
  // menggunakan ScriptLock; ScriptLock tidak boleh dikunci dua kali.
  sediakanLajurSahaja();
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var s = ss.getSheetByName('kehadiran');
    var tkh = tarikhHariIni_();
    var col = dapatkanKolTarikh_(s, tkh);
    var n = s.getLastRow() - 1;
    if (col < 1 || n < 1) throw new Error('Lajur kehadiran hari ini belum tersedia.');
    var asas = s.getRange(2, 2, n, 3).getDisplayValues();
    var nilai = s.getRange(2, col, n, 1).getValues();
    var intervalArkib = dapatkanIntervalArkib_(), icMain = dapatkanIcAktifMain_();
    var petaRmt = hadirPetaRmt_();
    var jumlah = 0, bilTiada = 0, rmtHadir = 0, rmtJumlah = 0;
    for (var i = 0; i < n; i++) {
      var ic = normalisasiIc_(asas[i][2]);
      if (String(asas[i][1]).trim().toUpperCase() !== kelas ||
          muridDisembunyikanHariIni_(ic, intervalArkib, icMain)) continue;
      var tidakHadir = !!tiada[hadirKunciMurid_(ic, tkh)];
      nilai[i][0] = tidakHadir ? 0 : 1;
      jumlah++; if (tidakHadir) bilTiada++;
      if (petaRmt[ic]) rmtJumlah++;
      if (!tidakHadir && petaRmt[ic]) rmtHadir++;
    }
    if (!jumlah) throw new Error('Tiada murid aktif ditemui untuk ' + kelas + '.');
    s.getRange(2, col, n, 1).setValues(nilai);
    hadirPadamCacheInit_();
    hadirLog_('SIMPAN_KEHADIRAN', sesi.peranan, kelas, jumlah + ' murid; ' + bilTiada + ' tidak hadir');
    return { ok: true, jumlah: jumlah, tidakHadir: bilTiada,
      rmtHadir: rmtHadir, rmtJumlah: rmtJumlah,
      masa: Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Kuala_Lumpur', 'HH:mm') };
  } finally { lock.releaseLock(); }
}

function hadirSenaraiMurid_(token) {
  hadirSesi_(token, true);
  var s = ss.getSheetByName('main');
  if (!s) throw new Error('Tab main tidak ditemui.');
  var header = cariBarisHeaderMain_(s), n = Math.max(s.getLastRow() - header, 0);
  if (!n) return [];
  var lebar = Math.max(s.getLastColumn(), 11);
  var tajuk = s.getRange(header, 1, 1, lebar).getDisplayValues()[0];
  var idxJantina = hadirIndeksTajuk_(tajuk, ['JANTINA', 'JENIS KELAMIN']);
  var idxJawatan = hadirIndeksTajuk_(tajuk, ['JAWATAN MURID', 'JAWATAN']);
  var petaJantina = hadirPetaJantinaAdmin_();
  var petaRmt = hadirPetaRmt_();
  return s.getRange(header + 1, 1, n, lebar).getDisplayValues()
    .filter(function (r) { return r[2] || r[3] || r[1]; })
    .map(function (r) {
      var ic = normalisasiIc_(r[3]);
      var tahunKod = hadirKodTahun_(r[9], r[10]);
      return {
      idMurid: r[1], nama: r[2], ic: ic, icAkhir: ic.slice(-4),
      jenisPengenalan: r[4], tarikhLahir: r[5], statusPengajian: r[6],
      tarikhMasukSekolah: r[7], tarikhMasukKelas: r[8], tahun: r[9], tahunKod: tahunKod,
      namaKelas: r[10], kelasLengkap: binaKelasLengkap_(r[9], r[10]),
      jantina: hadirJantinaKod_((idxJantina >= 0 ? r[idxJantina] : '') || petaJantina[ic], ic),
      rmt: !!petaRmt[ic],
      jawatan: String(idxJawatan >= 0 ? r[idxJawatan] : '').trim().toUpperCase() || 'MURID BIASA'
    }; }).sort(function (a, b) {
      return hadirSusunKelas_(binaKelasLengkap_(a.tahun, a.namaKelas), binaKelasLengkap_(b.tahun, b.namaKelas)) || a.nama.localeCompare(b.nama);
    });
}

function hadirIndeksTajuk_(tajuk, calon) {
  var peta = Object.create(null);
  (tajuk || []).forEach(function (h, i) { peta[normalisasiHeader_(h)] = i; });
  for (var i = 0; i < calon.length; i++) {
    var idx = peta[normalisasiHeader_(calon[i])];
    if (idx !== undefined) return idx;
  }
  return -1;
}

function hadirKodTahun_(tahun, kelas) {
  var t = String(tahun || '').trim().toUpperCase();
  var k = String(kelas || '').trim().toUpperCase();
  if (t.indexOf('PRASEKOLAH') >= 0 || k.indexOf('PRASEKOLAH') >= 0) return 'PRASEKOLAH';
  var peta = { SATU: '1', DUA: '2', TIGA: '3', EMPAT: '4', LIMA: '5', ENAM: '6' };
  var hasil = '';
  Object.keys(peta).some(function (perkataan) {
    if (t.indexOf(perkataan) >= 0) { hasil = peta[perkataan]; return true; }
    return false;
  });
  return hasil || (t.match(/[1-6]/) || [''])[0];
}

function hadirPetaJantinaAdmin_() {
  var peta = Object.create(null);
  var s = ss.getSheetByName('jantina');
  if (!s || s.getLastRow() < 2) return peta;
  s.getRange(2, 1, s.getLastRow() - 1, 2).getDisplayValues().forEach(function (r) {
    var ic = normalisasiIc_(r[0]);
    var j = hadirJantinaKod_(r[1], ic);
    if (ic && j) peta[ic] = j;
  });
  return peta;
}

function hadirJantinaKod_(nilai, ic) {
  var v = String(nilai || '').trim().toUpperCase();
  if (v.charAt(0) === 'L') return 'L';
  if (v.charAt(0) === 'P') return 'P';
  var digit = String(ic || '').replace(/\D/g, '');
  if (digit.length >= 12) return Number(digit.slice(-1)) % 2 ? 'L' : 'P';
  return '';
}

function hadirSimpanMurid_(rekod, token) {
  var sesi = hadirSesi_(token, true);
  rekod = rekod || {};
  var asal = normalisasiIc_(rekod.originalIc), ic = normalisasiIc_(rekod.ic);
  if (!rekod.nama || !ic) throw new Error('Nama dan IC/MyKid diperlukan.');
  if (asal && asal !== ic) throw new Error('IC/MyKid ialah kunci tetap dan tidak boleh ditukar. Arkibkan rekod lama dan tambah murid baharu.');
  rekod.ic = ic;
  var hasil = simpanSenaraiMuridUpload({ mode: 'merge', records: [rekod], kepala: [] });
  hadirPadamCacheInit_();
  if (rekod.jantina && typeof simpanJantinaUpload === 'function') simpanJantinaUpload([rekod]);
  var sync = hadirSyncSemua_();
  hadirLog_('SIMPAN_MURID', sesi.peranan, '', '1 rekod; sync=' + sync.ok);
  return {
    ok: true, syncOk: sync.ok, hasil: hasil, sync: sync,
    mesej: sync.ok ? 'Murid disimpan dan semua aplikasi diselaraskan.' :
      'Murid disimpan dalam KEHADIRAN, tetapi sebahagian penyelarasan perlu diperiksa.'
  };
}

function hadirSimpanTetapanMurid_(tetapan, token) {
  var sesi = hadirSesi_(token, true);
  tetapan = tetapan || {};
  var ic = normalisasiIc_(tetapan.ic);
  var dibenarkan = ['PENGAWAS', 'PENGAWAS PERPUSTAKAAN', 'KETUA KELAS',
    'PENOLONG KETUA KELAS', 'MURID BIASA'];
  var jawatan = String(tetapan.jawatan || 'MURID BIASA').trim().toUpperCase();
  var rmt = tetapan.rmt === true;
  if (!ic) throw new Error('Murid tidak sah.');
  if (dibenarkan.indexOf(jawatan) < 0) throw new Error('Jawatan murid tidak sah.');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var kelas = '';
  try {
    var sMain = ss.getSheetByName('main');
    if (!sMain) throw new Error('Tab main tidak ditemui.');
    var header = cariBarisHeaderMain_(sMain);
    var n = Math.max(sMain.getLastRow() - header, 0);
    var asas = n ? sMain.getRange(header + 1, 1, n, Math.max(sMain.getLastColumn(), 11)).getDisplayValues() : [];
    var indeks = -1;
    for (var i = 0; i < asas.length; i++) {
      if (normalisasiIc_(asas[i][3]) === ic) { indeks = i; break; }
    }
    if (indeks < 0) throw new Error('Murid tidak ditemui dalam tab main.');
    var nama = String(asas[indeks][2] || '').trim();
    kelas = binaKelasLengkap_(asas[indeks][9], asas[indeks][10]);

    var tajuk = sMain.getRange(header, 1, 1, Math.max(sMain.getLastColumn(), 11)).getDisplayValues()[0];
    var idxJawatan = hadirIndeksTajuk_(tajuk, ['JAWATAN MURID', 'JAWATAN']);
    var kolJawatan;
    if (idxJawatan < 0) {
      kolJawatan = sMain.getLastColumn() + 1;
      sMain.getRange(header, kolJawatan).setValue('JAWATAN MURID');
    } else kolJawatan = idxJawatan + 1;
    sMain.getRange(header + 1 + indeks, kolJawatan).setValue(jawatan);

    var sRmt = ss.getSheetByName('rmt');
    if (!sRmt) {
      sRmt = ss.insertSheet('rmt');
      sRmt.getRange(1, 1, 1, 5).setValues([['BIL', 'NAMA MURID', 'KELAS', 'STATUS RMT', 'IC']]);
    }
    var dataRmt = sRmt.getLastRow() > 1
      ? sRmt.getRange(2, 1, sRmt.getLastRow() - 1, 5).getDisplayValues() : [];
    var barisRmt = -1;
    for (var r = 0; r < dataRmt.length; r++) {
      if (normalisasiIc_(dataRmt[r][4]) === ic) { barisRmt = r + 2; break; }
    }
    if (barisRmt < 0) {
      barisRmt = sRmt.getLastRow() + 1;
      sRmt.getRange(barisRmt, 1, 1, 5).setValues([[barisRmt - 1, nama, kelas, rmt ? 1 : 0, ic]]);
    } else {
      sRmt.getRange(barisRmt, 2, 1, 3).setValues([[nama, kelas, rmt ? 1 : 0]]);
    }
    sRmt.getRange(barisRmt, 5).setNumberFormat('@');
    SpreadsheetApp.flush();
    hadirPadamCacheInit_();
    if (typeof padamCacheSistem_ === 'function') padamCacheSistem_();
  } finally { lock.releaseLock(); }

  hadirLog_('TETAPAN_MURID', sesi.peranan, kelas, 'rmt=' + (rmt ? 1 : 0) + '; jawatan=' + jawatan);
  return { ok: true, rmt: rmt, jawatan: jawatan, mesej: 'Tetapan murid berjaya disimpan.' };
}

function hadirUploadMuridCsv_(payload, token) {
  var sesi = hadirSesi_(token, true);
  payload = payload || {};
  var mentah = Array.isArray(payload.records) ? payload.records : [];
  if (!mentah.length) throw new Error('Fail CSV tidak mengandungi rekod murid yang sah.');
  if (mentah.length > 3000) throw new Error('Fail CSV melebihi had 3,000 rekod.');
  var mode = payload.mode === 'merge' ? 'merge' : 'sync';
  var kepala = Array.isArray(payload.kepala) ? payload.kepala.slice(0, 300).map(function (h) {
    return String(h == null ? '' : h).trim().slice(0, 150);
  }) : [];
  var medan = ['idMurid', 'nama', 'ic', 'jenisPengenalan', 'tarikhLahir', 'statusPengajian',
    'tarikhMasukSekolah', 'tarikhMasukKelas', 'tahun', 'namaKelas', 'kelas'];
  var rekod = mentah.map(function (asal) {
    asal = asal || {};
    var item = { semua: {} };
    medan.forEach(function (k) { item[k] = String(asal[k] == null ? '' : asal[k]).trim().slice(0, 500); });
    if (asal.semua && typeof asal.semua === 'object') {
      kepala.forEach(function (h) {
        if (!h) return;
        item.semua[h] = String(asal.semua[h] == null ? '' : asal.semua[h]).trim().slice(0, 1000);
      });
    }
    return item;
  }).filter(function (r) { return r.nama && (r.ic || r.idMurid); });
  if (!rekod.length) throw new Error('Tiada rekod dengan nama dan IC/ID murid ditemui.');
  var hasil = simpanSenaraiMuridUpload({ mode: mode, records: rekod, kepala: kepala });
  hadirPadamCacheInit_();
  var sync = hadirSyncSemua_();
  hadirLog_('UPLOAD_MURID_CSV', sesi.peranan, '', rekod.length + ' rekod; mode=' + mode + '; sync=' + sync.ok);
  var ringkasan = [];
  if (hasil && hasil.ditambah != null) ringkasan.push(hasil.ditambah + ' ditambah');
  if (hasil && hasil.dikemasKini != null) ringkasan.push(hasil.dikemasKini + ' dikemas kini');
  if (hasil && hasil.diarkibkan) ringkasan.push(hasil.diarkibkan + ' diarkibkan');
  return {
    ok: true, syncOk: sync.ok, hasil: hasil, sync: sync,
    mesej: 'Selesai: ' + (ringkasan.length ? ringkasan.join(', ') : rekod.length + ' rekod diproses') +
      (sync.ok ? '. AKSI dan SEMAK telah diselaraskan.' : '. Data KEHADIRAN disimpan; semak status penyelarasan AKSI/SEMAK.')
  };
}

function hadirSyncSemuaApi_(token) {
  hadirSesi_(token, true);
  var hasil = hadirSyncSemua_();
  hadirLog_('SYNC_SEMUA', 'admin', '', JSON.stringify({ ok: hasil.ok, aksi: hasil.aksi.ok, semak: hasil.semak.ok }));
  return hasil;
}

function hadirSyncSemua_() {
  var murid = hadirMuridAktif_();
  var aksi = hadirSyncAksi_(murid);
  var semak = hadirSyncSemak_(murid);
  return { ok: aksi.ok && semak.ok, jumlah: murid.length, aksi: aksi, semak: semak };
}

function hadirMuridAktif_() {
  var s = ss.getSheetByName('main');
  var header = cariBarisHeaderMain_(s), n = Math.max(s.getLastRow() - header, 0);
  if (!n) return [];
  var lebar = Math.max(s.getLastColumn(), 11);
  var tajuk = s.getRange(header, 1, 1, lebar).getDisplayValues()[0];
  var peta = Object.create(null);
  var petaJantina = hadirPetaJantinaAdmin_();
  tajuk.forEach(function (h, i) { var k = normalisasiHeader_(h); if (k) peta[k] = i; });
  function nilai(r, calon) {
    for (var i = 0; i < calon.length; i++) {
      var idx = peta[normalisasiHeader_(calon[i])];
      if (idx !== undefined && r[idx] !== '') return r[idx];
    }
    return '';
  }
  return s.getRange(header + 1, 1, n, lebar).getDisplayValues().filter(function (r) {
    var status = String(r[6] || '').trim().toUpperCase();
    return r[2] && normalisasiIc_(r[3]) && !/(BERPINDAH|TIDAK AKTIF|BERHENTI|TAMAT)/.test(status);
  }).map(function (r) {
    var ic = normalisasiIc_(r[3]);
    return { idMurid: r[1], nama: r[2], ic: ic, tahun: r[9],
      namaKelas: r[10], kelas: binaKelasLengkap_(r[9], r[10]),
      jantina: hadirJantinaKod_(nilai(r, ['JANTINA', 'JENIS KELAMIN']) || petaJantina[ic], ic),
      agama: nilai(r, ['AGAMA']), kaum: nilai(r, ['KAUM', 'BANGSA']) };
  });
}

function hadirSyncAksi_(murid) {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('HADIR_AKSI_URL') || HADIR_AKSI_URL_LALAI;
  var id = props.getProperty('HADIR_AKSI_ID') || 'admin';
  var kata = props.getProperty('HADIR_AKSI_PASSWORD');
  if (!kata) return { ok: false, mesej: 'Kata laluan perkhidmatan AKSI belum ditetapkan.' };
  try {
    var masuk = hadirAksiRpc_(url, 'login', [id, kata], '');
    if (!masuk || !masuk.berjaya || !masuk.token) throw new Error((masuk && masuk.mesej) || 'Login AKSI gagal.');
    var csv = 'IC,NAMA,TAHUN,NAMA KELAS,JANTINA,AGAMA,KAUM\n' + murid.map(function (m) {
      return [m.ic, m.nama, m.tahun, m.namaKelas, m.jantina, m.agama, m.kaum].map(hadirCsv_).join(',');
    }).join('\n');
    var hasil = hadirAksiRpc_(url, 'importMurid', [csv, masuk.token], masuk.token);
    try { hadirAksiRpc_(url, 'logout', [masuk.token], masuk.token); } catch (abaikan) {}
    if (!hasil || hasil.berjaya === false) throw new Error((hasil && hasil.mesej) || 'Import AKSI gagal.');
    return { ok: true, mesej: murid.length + ' murid diselaraskan.', hasil: hasil };
  } catch (e) { return { ok: false, mesej: e.message }; }
}

function hadirAksiRpc_(url, fn, args, tokenSesi) {
  var r = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'text/plain; charset=utf-8', followRedirects: true,
    muteHttpExceptions: true,
    payload: JSON.stringify({ fn: fn, args: args || [], token: tokenSesi || '' })
  });
  var j = JSON.parse(r.getContentText());
  if (!j.ok) throw new Error(j.ralat || 'Panggilan AKSI gagal.');
  return j.hasil;
}

function hadirSyncSemak_(murid) {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('HADIR_SEMAK_URL') || HADIR_SEMAK_URL_LALAI;
  var kata = props.getProperty('HADIR_SEMAK_PASSWORD');
  if (!kata) return { ok: false, mesej: 'Kata laluan perkhidmatan SEMAK belum ditetapkan.' };
  try {
    var senarai = murid.map(function (m) { return {
      nama: m.nama, ic: m.ic, tahun: m.tahun, kelas: m.namaKelas,
      jantina: m.jantina, agama: m.agama
    }; });
    var hasil = hadirSemakRpc_(url, 'apiUploadMurid', [senarai, kata]);
    if (!hasil || hasil.ok === false) throw new Error((hasil && hasil.mesej) || 'Import SEMAK gagal.');
    return { ok: true, mesej: murid.length + ' murid diselaraskan.', hasil: hasil };
  } catch (e) { return { ok: false, mesej: e.message }; }
}

function hadirSemakRpc_(url, kaedah, argumen) {
  var id = 'hadir_' + Date.now();
  var r = UrlFetchApp.fetch(url, {
    method: 'post', followRedirects: true, muteHttpExceptions: true,
    payload: { mode: 'rpc', id: id, kaedah: kaedah, argumen: JSON.stringify(argumen || []) }
  });
  var html = r.getContentText();
  var padan = hadirSemakMuatan64_(html);
  if (!padan) throw new Error('SEMAK tidak memulangkan respons RPC yang sah.');
  var data = JSON.parse(Utilities.newBlob(Utilities.base64Decode(padan)).getDataAsString('UTF-8'));
  if (data.sumber !== 'semak-rpc' || data.id !== id)
    throw new Error('SEMAK memulangkan respons RPC yang tidak sepadan.');
  if (!data.ok) throw new Error(data.ralat || 'Panggilan SEMAK gagal.');
  return data.hasil;
}

function hadirSemakMuatan64_(html) {
  var padan = String(html || '').match(
    /atob\((?:['"]|\\x(?:27|22))([A-Za-z0-9+/=]+)(?:['"]|\\x(?:27|22))\)/
  );
  return padan ? padan[1] : '';
}

function hadirCsv_(nilai) {
  return '"' + String(nilai == null ? '' : nilai).replace(/"/g, '""') + '"';
}

function hadirLog_(tindakan, peranan, kelas, butiran) {
  try {
    var s = ss.getSheetByName('HADIR_LOG');
    if (!s) {
      s = ss.insertSheet('HADIR_LOG');
      s.appendRow(['MASA', 'TINDAKAN', 'PERANAN', 'KELAS', 'BUTIRAN TANPA PII']);
    }
    s.appendRow([new Date(), tindakan, peranan || '', kelas || '', butiran || '']);
  } catch (abaikan) {}
}

// Jalankan dari editor untuk mendapatkan hash PIN sebelum disimpan di Script
// Properties. Fungsi ini tidak menyimpan PIN dan tidak mencetaknya ke log.
function hadirHashPinUntukTetapan(pin) {
  return hadirHash_(pin);
}
