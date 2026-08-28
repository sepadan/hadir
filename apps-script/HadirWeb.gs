// HADIR v1.8.2 — backend web untuk projek Apps Script KEHADIRAN.
// Fail ini tidak menggantikan bot Telegram. doPost sedia ada hanya perlu
// menyerahkan permintaan mode="hadir" kepada hadirDoPost_() terlebih dahulu.

var HADIR_SESI_JAM = 8;
var HADIR_CACHE_INIT_SAAT = 60;
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
    semakKehadiran: hadirSemakKehadiran_, bukaKehadiranTarikh: hadirBukaKehadiranTarikh_,
    simpanKehadiran: hadirSimpanKehadiran_, senaraiMurid: hadirSenaraiMurid_,
    simpanMurid: hadirSimpanMurid_, simpanTetapanMurid: hadirSimpanTetapanMurid_,
    uploadMuridCsv: hadirUploadMuridCsv_,
    senaraiGuru: hadirSenaraiGuru_, simpanGuru: hadirSimpanGuru_,
    uploadGuruCsv: hadirUploadGuruCsv_, syncGuru: hadirSyncGuruApi_,
    terimaSyncMurid: hadirTerimaSyncMurid_, terimaSyncGuru: hadirTerimaSyncGuru_,
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

function hadirSahRahsiaSync_(rahsia) {
  var betul = PropertiesService.getScriptProperties().getProperty('SEPADAN_SYNC_SECRET');
  if (!betul) throw new Error('Rahsia penyelarasan SePadan belum ditetapkan.');
  if (!rahsia || hadirHash_(rahsia) !== hadirHash_(betul))
    throw new Error('Akses penyelarasan SePadan ditolak.');
  return true;
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
function hadirSahkanTarikhIso_(tarikhIso) {
  var zona = Session.getScriptTimeZone() || 'Asia/Kuala_Lumpur';
  var hariIniIso = Utilities.formatDate(new Date(), zona, 'yyyy-MM-dd');
  tarikhIso = String(tarikhIso || hariIniIso).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tarikhIso)) throw new Error('Tarikh tidak sah.');
  var bahagian = tarikhIso.split('-').map(Number);
  var semak = new Date(Date.UTC(bahagian[0], bahagian[1] - 1, bahagian[2]));
  if (semak.getUTCFullYear() !== bahagian[0] || semak.getUTCMonth() + 1 !== bahagian[1] ||
      semak.getUTCDate() !== bahagian[2]) throw new Error('Tarikh tidak sah.');
  if (tarikhIso.slice(0, 4) !== hariIniIso.slice(0, 4))
    throw new Error('Semakan hanya tersedia bagi tahun semasa.');
  if (tarikhIso > hariIniIso) throw new Error('Tarikh akan datang belum boleh disemak.');
  return {
    iso: tarikhIso, hariIniIso: hariIniIso, tarikh: semak,
    tkh: ('0' + bahagian[2]).slice(-2) + '/' + ('0' + bahagian[1]).slice(-2)
  };
}

function hadirSemakKehadiran_(tarikhIso) {
  var pilihan = hadirSahkanTarikhIso_(tarikhIso);
  tarikhIso = pilihan.iso;
  var hariIniIso = pilihan.hariIniIso;
  var semak = pilihan.tarikh;
  var tkh = pilihan.tkh;
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

/* Muatan penuh hanya bagi satu kelas selepas guru menekan kad tarikh lama.
   IC tidak dihantar; setiap murid mendapat kunci legap yang khusus kepada
   tarikh tersebut. Ringkasan Semak Kehadiran kekal menghantar nama murid
   tidak hadir sahaja. */
function hadirBukaKehadiranTarikh_(kelas, tarikhIso) {
  var pilihan = hadirSahkanTarikhIso_(tarikhIso);
  kelas = String(kelas || '').trim().toUpperCase();
  if (!kelas) throw new Error('Kelas tidak sah.');
  var s = ss.getSheetByName('kehadiran');
  if (!s) throw new Error('Tab kehadiran tidak ditemui.');
  var data = s.getDataRange().getDisplayValues();
  var idxTarikh = data.length ? data[0].indexOf(pilihan.tkh) : -1;
  var intervalArkib = dapatkanIntervalArkib_();
  var icMain = dapatkanIcAktifMain_();
  var petaRmt = hadirPetaRmt_();
  var murid = [];
  for (var i = 1; i < data.length; i++) {
    var nama = String(data[i][1] || '').trim();
    var namaKelas = String(data[i][2] || '').trim().toUpperCase();
    var ic = normalisasiIc_(data[i][3]);
    if (!nama || namaKelas !== kelas || !ic ||
        muridTiadaPadaTarikh_(ic, pilihan.tkh, intervalArkib, icMain)) continue;
    var nilai = idxTarikh < 0 ? '' : data[i][idxTarikh];
    murid.push({
      kunci: hadirKunciMurid_(ic, pilihan.tkh), nama: nama,
      nilai: nilai === '0' ? 0 : nilai === '1' ? 1 : '',
      _rmt: !!petaRmt[ic], _rmtHadir: nilai === '1' && !!petaRmt[ic]
    });
  }
  murid.sort(function (a, b) { return a.nama.localeCompare(b.nama); });
  if (!murid.length) throw new Error('Tiada murid ditemui untuk kelas dan tarikh ini.');
  return {
    nama: kelas,
    murid: murid.map(function (m) { return { kunci: m.kunci, nama: m.nama, nilai: m.nilai }; }),
    jumlah: murid.length,
    tidakHadir: murid.filter(function (m) { return m.nilai === 0; }).length,
    rmtJumlah: murid.filter(function (m) { return m._rmt; }).length,
    rmtHadir: murid.filter(function (m) { return m._rmtHadir; }).length,
    sudahSimpan: murid.some(function (m) { return m.nilai === 0 || m.nilai === 1; }),
    tarikhIso: pilihan.iso,
    tarikhPaparan: hadirTarikhPaparanMs_(pilihan.tarikh, 'UTC')
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

function hadirSimpanKehadiran_(kelas, senaraiTiada, token, tarikhIso) {
  var sesi = token ? hadirSesi_(token, true) : { peranan: 'guru' };
  var pilihan = hadirSahkanTarikhIso_(tarikhIso);
  kelas = String(kelas || '').trim().toUpperCase();
  if (!kelas) throw new Error('Kelas tidak sah.');
  var tiada = Object.create(null);
  (senaraiTiada || []).forEach(function (kunci) { tiada[String(kunci || '').trim()] = true; });
  // Fungsi asal menyediakan lajur hari ini di bawah locknya sendiri. Tarikh
  // lama dibuat di bawah lock simpanan di bawah supaya satu tarikh tidak boleh
  // terhasil dua kali apabila dua guru menekan serentak.
  if (pilihan.iso === pilihan.hariIniIso) sediakanLajurSahaja();
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var s = ss.getSheetByName('kehadiran');
    var tkh = pilihan.tkh;
    var col = dapatkanKolTarikh_(s, tkh);
    var n = s.getLastRow() - 1;
    if (col < 1) {
      col = s.getLastColumn() + 1;
      s.getRange(1, col).setValue(tkh);
    }
    if (col < 1 || n < 1) throw new Error('Lajur kehadiran belum tersedia.');
    var asas = s.getRange(2, 2, n, 3).getDisplayValues();
    var nilai = s.getRange(2, col, n, 1).getValues();
    var intervalArkib = dapatkanIntervalArkib_(), icMain = dapatkanIcAktifMain_();
    var petaRmt = hadirPetaRmt_();
    var jumlah = 0, bilTiada = 0, rmtHadir = 0, rmtJumlah = 0;
    for (var i = 0; i < n; i++) {
      var ic = normalisasiIc_(asas[i][2]);
      if (String(asas[i][1]).trim().toUpperCase() !== kelas ||
          muridTiadaPadaTarikh_(ic, tkh, intervalArkib, icMain)) continue;
      var tidakHadir = !!tiada[hadirKunciMurid_(ic, tkh)];
      nilai[i][0] = tidakHadir ? 0 : 1;
      jumlah++; if (tidakHadir) bilTiada++;
      if (petaRmt[ic]) rmtJumlah++;
      if (!tidakHadir && petaRmt[ic]) rmtHadir++;
    }
    if (!jumlah) throw new Error('Tiada murid aktif ditemui untuk ' + kelas + '.');
    s.getRange(2, col, n, 1).setValues(nilai);
    if (pilihan.iso === pilihan.hariIniIso) hadirPadamCacheInit_();
    hadirLog_('SIMPAN_KEHADIRAN', sesi.peranan, kelas,
      tkh + '; ' + jumlah + ' murid; ' + bilTiada + ' tidak hadir');
    return { ok: true, jumlah: jumlah, tidakHadir: bilTiada,
      rmtHadir: rmtHadir, rmtJumlah: rmtJumlah,
      tarikhIso: pilihan.iso,
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

/**
 * Terima upload murid daripada AKSI/SEMAK. Input luar sentiasa merge-only
 * kerana kedua-dua sistem boleh melangkau kumpulan tertentu (contohnya PRA).
 * Selepas merge, HADIR menghantar senarai aktif lengkap kepada sasaran lain.
 */
function hadirTerimaSyncMurid_(senarai, sumber, rahsia) {
  hadirSahRahsiaSync_(rahsia);
  sumber = String(sumber || '').trim().toUpperCase();
  if (['AKSI', 'SEMAK'].indexOf(sumber) < 0) throw new Error('Sumber penyelarasan murid tidak sah.');
  if (!Array.isArray(senarai) || !senarai.length) throw new Error('Tiada rekod murid diterima.');
  if (senarai.length > 3000) throw new Error('Muatan murid melebihi had 3,000 rekod.');

  var rekod = senarai.map(function (asal) {
    asal = asal || {};
    var tahun = String(asal.tahun || '').trim().slice(0, 100);
    var kelasPenuh = String(asal.kelas || asal.namaKelas || '').trim().slice(0, 200);
    var namaKelas = String(asal.namaKelas || asal.kelas || '').trim().slice(0, 200);
    if (/^[1-6]\s+/i.test(namaKelas)) namaKelas = namaKelas.replace(/^[1-6]\s+/i, '');
    return {
      idMurid: String(asal.idMurid || '').trim().slice(0, 500),
      nama: String(asal.nama || '').trim().slice(0, 500),
      ic: normalisasiIc_(asal.ic),
      tahun: tahun,
      namaKelas: namaKelas,
      kelas: kelasPenuh,
      jantina: String(asal.jantina || '').trim().slice(0, 50),
      agama: String(asal.agama || '').trim().slice(0, 100),
      kaum: String(asal.kaum || '').trim().slice(0, 100)
    };
  }).filter(function (m) { return m.nama && m.ic; });
  if (!rekod.length) throw new Error('Tiada rekod murid yang sah diterima.');

  var hasil = simpanSenaraiMuridUpload({ mode: 'merge', records: rekod, kepala: [] });
  if (typeof simpanJantinaUpload === 'function') simpanJantinaUpload(rekod);
  hadirPadamCacheInit_();
  var murid = hadirMuridAktif_();
  var sync = sumber === 'AKSI'
    ? { ok: true, aksi: { ok: true, dilangkau: true }, semak: hadirSyncSemak_(murid) }
    : { ok: true, aksi: hadirSyncAksi_(murid), semak: { ok: true, dilangkau: true } };
  sync.ok = sync.aksi.ok && sync.semak.ok;
  hadirLog_('SYNC_MURID_MASUK', 'sistem', '',
    rekod.length + ' rekod; sumber=' + sumber + '; sync=' + sync.ok);
  return {
    ok: true, syncOk: sync.ok, sumber: sumber, jumlah: rekod.length,
    hasil: hasil, sync: sync,
    mesej: sync.ok ? 'Data murid diterima dan semua sistem diselaraskan.' :
      'Data murid diterima, tetapi satu sasaran perlu diselaraskan semula.'
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
    var hasil = hadirAksiRpc_(url, 'importMurid', [csv, masuk.token, 'HADIR'], masuk.token);
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
    var hasil = hadirSemakRpc_(url, 'apiUploadMurid', [senarai, kata, 'HADIR']);
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

function hadirNamaGuru_(nilai) {
  return String(nilai == null ? '' : nilai).trim().replace(/\s+/g, ' ').toUpperCase().slice(0, 200);
}

function hadirJawatanGuru_(nilai) {
  return String(nilai == null ? '' : nilai).trim().replace(/\s+/g, ' ').toUpperCase().slice(0, 120);
}

function hadirSheetGuru_() {
  var s = ss.getSheetByName('HADIR_GURU');
  if (!s) {
    s = ss.insertSheet('HADIR_GURU');
    s.getRange(1, 1, 1, 3).setValues([['NAMA GURU', 'JAWATAN', 'DIKEMAS KINI']]);
    s.setFrozenRows(1);
  }
  return s;
}

function hadirBacaGuru_() {
  var s = ss.getSheetByName('HADIR_GURU');
  if (!s || s.getLastRow() < 2) return [];
  return s.getRange(2, 1, s.getLastRow() - 1, 3).getDisplayValues()
    .map(function (r) {
      return { nama: hadirNamaGuru_(r[0]), jawatan: hadirJawatanGuru_(r[1]), dikemasKini: r[2] || '' };
    }).filter(function (g) { return !!g.nama; })
    .sort(function (a, b) { return a.nama.localeCompare(b.nama, 'ms'); });
}

function hadirSenaraiGuru_(token) {
  hadirSesi_(token, true);
  return hadirBacaGuru_();
}

function hadirGabungGuru_(senarai) {
  var s = hadirSheetGuru_();
  var data = s.getLastRow() > 1
    ? s.getRange(2, 1, s.getLastRow() - 1, 3).getDisplayValues() : [];
  var peta = Object.create(null);
  data.forEach(function (r, i) {
    var nama = hadirNamaGuru_(r[0]);
    if (nama && peta[nama] === undefined) peta[nama] = i;
  });
  var tambah = 0, kemasKini = 0, langkau = 0, dilihat = Object.create(null);
  (senarai || []).forEach(function (asal) {
    asal = asal || {};
    var nama = hadirNamaGuru_(typeof asal === 'string' ? asal : asal.nama);
    var jawatan = hadirJawatanGuru_(typeof asal === 'string' ? '' : asal.jawatan);
    if (!nama || dilihat[nama]) { langkau++; return; }
    dilihat[nama] = true;
    var masa = new Date();
    if (peta[nama] === undefined) {
      peta[nama] = data.length;
      data.push([nama, jawatan, masa]);
      tambah++;
    } else {
      var indeks = peta[nama];
      var berubah = jawatan && hadirJawatanGuru_(data[indeks][1]) !== jawatan;
      if (berubah) data[indeks][1] = jawatan;
      if (berubah) {
        data[indeks][2] = masa;
        kemasKini++;
      } else langkau++;
    }
  });
  if (data.length) s.getRange(2, 1, data.length, 3).setValues(data);
  return { tambah: tambah, kemasKini: kemasKini, langkau: langkau, jumlah: data.length };
}

function hadirSimpanGuru_(rekod, token) {
  var sesi = hadirSesi_(token, true);
  rekod = rekod || {};
  var nama = hadirNamaGuru_(rekod.nama);
  if (!nama) throw new Error('Nama guru diperlukan.');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var hasil;
  try {
    hasil = hadirGabungGuru_([{ nama: nama, jawatan: rekod.jawatan }]);
  } finally { lock.releaseLock(); }
  var guru = hadirBacaGuru_();
  var sync = hadirSyncGuruSemua_(guru);
  hadirLog_('SIMPAN_GURU', sesi.peranan, '', '1 rekod; sync=' + sync.ok);
  return {
    ok: true, syncOk: sync.ok, hasil: hasil, sync: sync,
    mesej: sync.ok ? 'Guru disimpan dan semua aplikasi diselaraskan.' :
      'Guru disimpan dalam HADIR, tetapi sebahagian penyelarasan perlu diperiksa.'
  };
}

function hadirUploadGuruCsv_(payload, token) {
  var sesi = hadirSesi_(token, true);
  payload = payload || {};
  var mentah = Array.isArray(payload.records) ? payload.records : [];
  if (!mentah.length) throw new Error('Fail CSV tidak mengandungi nama guru yang sah.');
  if (mentah.length > 1000) throw new Error('Fail CSV melebihi had 1,000 rekod guru.');
  var rekod = mentah.map(function (g) {
    return { nama: hadirNamaGuru_(g && g.nama), jawatan: hadirJawatanGuru_(g && g.jawatan) };
  }).filter(function (g) { return !!g.nama; });
  if (!rekod.length) throw new Error('Tiada nama guru yang sah ditemui.');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var hasil;
  try { hasil = hadirGabungGuru_(rekod); }
  finally { lock.releaseLock(); }
  var guru = hadirBacaGuru_();
  var sync = hadirSyncGuruSemua_(guru);
  hadirLog_('UPLOAD_GURU_CSV', sesi.peranan, '', rekod.length + ' rekod; sync=' + sync.ok);
  return {
    ok: true, syncOk: sync.ok, hasil: hasil, sync: sync,
    mesej: 'Selesai: ' + hasil.tambah + ' ditambah, ' + hasil.kemasKini +
      ' dikemas kini, ' + hasil.langkau + ' tanpa perubahan.' +
      (sync.ok ? ' AKSI dan SEMAK telah diselaraskan.' : ' Semak status penyelarasan AKSI/SEMAK.')
  };
}

function hadirTerimaSyncGuru_(senarai, sumber, rahsia) {
  hadirSahRahsiaSync_(rahsia);
  sumber = String(sumber || '').trim().toUpperCase();
  if (['AKSI', 'SEMAK'].indexOf(sumber) < 0) throw new Error('Sumber penyelarasan guru tidak sah.');
  if (!Array.isArray(senarai) || !senarai.length) throw new Error('Tiada rekod guru diterima.');
  if (senarai.length > 1000) throw new Error('Muatan guru melebihi had 1,000 rekod.');
  var rekod = senarai.map(function (asal) {
    return {
      nama: hadirNamaGuru_(typeof asal === 'string' ? asal : asal && asal.nama),
      jawatan: hadirJawatanGuru_(typeof asal === 'string' ? '' : asal && asal.jawatan)
    };
  }).filter(function (g) { return !!g.nama; });
  if (!rekod.length) throw new Error('Tiada nama guru yang sah diterima.');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var hasil;
  try { hasil = hadirGabungGuru_(rekod); }
  finally { lock.releaseLock(); }
  var guru = hadirBacaGuru_();
  var sync = sumber === 'AKSI'
    ? { ok: true, aksi: { ok: true, dilangkau: true }, semak: hadirSyncGuruSemak_(guru) }
    : { ok: true, aksi: hadirSyncGuruAksi_(guru), semak: { ok: true, dilangkau: true } };
  sync.ok = sync.aksi.ok && sync.semak.ok;
  hadirLog_('SYNC_GURU_MASUK', 'sistem', '',
    rekod.length + ' rekod; sumber=' + sumber + '; sync=' + sync.ok);
  return {
    ok: true, syncOk: sync.ok, sumber: sumber, jumlah: rekod.length,
    hasil: hasil, sync: sync,
    mesej: sync.ok ? 'Data guru diterima dan semua sistem diselaraskan.' :
      'Data guru diterima, tetapi satu sasaran perlu diselaraskan semula.'
  };
}

function hadirSyncGuruApi_(token) {
  hadirSesi_(token, true);
  var guru = hadirBacaGuru_();
  var migrasi = null;
  if (!guru.length) {
    migrasi = hadirTarikGuruSediaAda_();
    guru = hadirBacaGuru_();
  }
  if (!guru.length) throw new Error('Senarai guru HADIR masih kosong dan tiada guru dapat ditarik daripada SEMAK/AKSI.');
  var hasil = hadirSyncGuruSemua_(guru);
  hasil.ditarik = migrasi ? migrasi.jumlah : 0;
  hasil.sumberAwal = migrasi ? migrasi.sumber : 'HADIR';
  hadirLog_('SYNC_GURU', 'admin', '', guru.length + ' rekod; sumber=' + hasil.sumberAwal + '; sync=' + hasil.ok);
  return hasil;
}

/**
 * Migrasi awal sahaja: SEMAK ialah sumber senarai guru yang disahkan pengguna.
 * AKSI digunakan sebagai sandaran hanya jika SEMAK gagal atau kosong.
 */
function hadirTarikGuruSediaAda_() {
  var props = PropertiesService.getScriptProperties();
  var urlAksi = props.getProperty('HADIR_AKSI_URL') || HADIR_AKSI_URL_LALAI;
  var id = props.getProperty('HADIR_AKSI_ID') || 'admin';
  var kata = props.getProperty('HADIR_AKSI_PASSWORD');
  var urlSemak = props.getProperty('HADIR_SEMAK_URL') || HADIR_SEMAK_URL_LALAI;
  var rekod = [], dilihat = Object.create(null), ralatSemak = '';
  function tambah(item) {
    var nama = hadirNamaGuru_(typeof item === 'string' ? item : item && item.nama);
    var jawatan = hadirJawatanGuru_(typeof item === 'string' ? '' : item && item.jawatan);
    if (!nama || dilihat[nama]) return;
    dilihat[nama] = true;
    rekod.push({ nama: nama, jawatan: jawatan });
  }
  try {
    var initSemak = hadirSemakRpc_(urlSemak, 'apiInit', []);
    var senaraiSemak = initSemak && Array.isArray(initSemak.guru) ? initSemak.guru : [];
    senaraiSemak.forEach(tambah);
  } catch (eSemak) {
    ralatSemak = eSemak.message;
  }
  var sumber = 'SEMAK';
  if (!rekod.length) {
    sumber = 'AKSI';
    var tokenAksi = '';
    try {
      if (!kata) throw new Error('Kata laluan perkhidmatan AKSI belum ditetapkan.');
      var masuk = hadirAksiRpc_(urlAksi, 'login', [id, kata], '');
      if (!masuk || !masuk.berjaya || !masuk.token)
        throw new Error((masuk && masuk.mesej) || 'Login AKSI gagal.');
      tokenAksi = masuk.token;
      var senaraiAksi = hadirAksiRpc_(urlAksi, 'getSenaraiGuru', [tokenAksi], tokenAksi);
      (Array.isArray(senaraiAksi) ? senaraiAksi : []).forEach(tambah);
    } finally {
      if (tokenAksi) {
        try { hadirAksiRpc_(urlAksi, 'logout', [tokenAksi], tokenAksi); } catch (abaikan) {}
      }
    }
  }
  if (!rekod.length) throw new Error('Tiada senarai guru dapat ditarik.' +
    (ralatSemak ? ' SEMAK: ' + ralatSemak : ''));
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { hadirGabungGuru_(rekod); }
  finally { lock.releaseLock(); }
  hadirLog_('MIGRASI_GURU_SISTEM', 'admin', '',
    rekod.length + ' rekod; sumber=' + sumber);
  return { ok: true, jumlah: rekod.length, sumber: sumber };
}

function hadirSyncGuruSemua_(guru) {
  var aksi = hadirSyncGuruAksi_(guru || []);
  var semak = hadirSyncGuruSemak_(guru || []);
  return { ok: aksi.ok && semak.ok, jumlah: (guru || []).length, aksi: aksi, semak: semak };
}

function hadirSyncGuruAksi_(guru) {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('HADIR_AKSI_URL') || HADIR_AKSI_URL_LALAI;
  var id = props.getProperty('HADIR_AKSI_ID') || 'admin';
  var kata = props.getProperty('HADIR_AKSI_PASSWORD');
  if (!kata) return { ok: false, mesej: 'Kata laluan perkhidmatan AKSI belum ditetapkan.' };
  try {
    var masuk = hadirAksiRpc_(url, 'login', [id, kata], '');
    if (!masuk || !masuk.berjaya || !masuk.token) throw new Error((masuk && masuk.mesej) || 'Login AKSI gagal.');
    var hasil = hadirAksiRpc_(url, 'importGuru', [guru, masuk.token, 'HADIR'], masuk.token);
    if (!hasil || hasil.berjaya === false) throw new Error((hasil && hasil.mesej) || 'Import guru AKSI gagal.');
    var akaun = hadirAksiRpc_(url, 'pastikanAkaunGuru', [masuk.token], masuk.token);
    try { hadirAksiRpc_(url, 'logout', [masuk.token], masuk.token); } catch (abaikan) {}
    if (!akaun || akaun.berjaya === false) throw new Error((akaun && akaun.mesej) || 'Akaun guru AKSI gagal diselaraskan.');
    return { ok: true, mesej: guru.length + ' guru digabung; akaun sedia ada dikekalkan.', hasil: hasil };
  } catch (e) { return { ok: false, mesej: e.message }; }
}

function hadirSyncGuruSemak_(guru) {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('HADIR_SEMAK_URL') || HADIR_SEMAK_URL_LALAI;
  var kata = props.getProperty('HADIR_SEMAK_PASSWORD');
  if (!kata) return { ok: false, mesej: 'Kata laluan perkhidmatan SEMAK belum ditetapkan.' };
  try {
    var hasil = hadirSemakRpc_(url, 'apiImportGuru', [guru, kata, 'HADIR']);
    if (!hasil || hasil.ok === false) throw new Error((hasil && hasil.mesej) || 'Import guru SEMAK gagal.');
    return { ok: true, mesej: guru.length + ' guru digabung; kata laluan sedia ada dikekalkan.', hasil: hasil };
  } catch (e) { return { ok: false, mesej: e.message }; }
}

function hadirSemakMuatan64_(html) {
  var padan = String(html || '').match(
    /atob\((?:['"]|\\x(?:27|22))((?:[A-Za-z0-9+/=]|\\x3d)+)(?:['"]|\\x(?:27|22))\)/i
  );
  return padan ? padan[1].replace(/\\x3d/gi, '=') : '';
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
