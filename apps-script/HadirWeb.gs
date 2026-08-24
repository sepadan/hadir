// HADIR v1.1.0 — backend web untuk projek Apps Script KEHADIRAN.
// Fail ini tidak menggantikan bot Telegram. doPost sedia ada hanya perlu
// menyerahkan permintaan mode="hadir" kepada hadirDoPost_() terlebih dahulu.

var HADIR_SESI_JAM = 8;
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
    simpanKehadiran: hadirSimpanKehadiran_, senaraiMurid: hadirSenaraiMurid_,
    simpanMurid: hadirSimpanMurid_, syncSemua: hadirSyncSemuaApi_
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
  sediakanLajurSahaja();
  var s = ss.getSheetByName('kehadiran');
  if (!s) throw new Error('Tab kehadiran tidak ditemui.');
  var data = s.getDataRange().getDisplayValues();
  var tkh = tarikhHariIni_();
  var idxTarikh = data.length ? data[0].indexOf(tkh) : -1;
  var intervalArkib = dapatkanIntervalArkib_();
  var icMain = dapatkanIcAktifMain_();
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
      nilai: nilai === '0' ? 0 : nilai === '1' ? 1 : ''
    });
  }
  var kelasHasil = Object.keys(peta).sort(hadirSusunKelas_).map(function (kelas) {
    var murid = peta[kelas].sort(function (a, b) { return a.nama.localeCompare(b.nama); });
    return {
      nama: kelas, murid: murid, jumlah: murid.length,
      tidakHadir: murid.filter(function (m) { return m.nilai === 0; }).length,
      sudahSimpan: murid.some(function (m) { return m.nilai === 0 || m.nilai === 1; })
    };
  });
  var zona = Session.getScriptTimeZone() || 'Asia/Kuala_Lumpur';
  return {
    peranan: sesi.peranan, tarikh: tkh,
    tarikhPaparan: Utilities.formatDate(new Date(), zona, 'EEEE, d MMMM yyyy'),
    kelas: kelasHasil
  };
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
    var jumlah = 0, bilTiada = 0;
    for (var i = 0; i < n; i++) {
      var ic = normalisasiIc_(asas[i][2]);
      if (String(asas[i][1]).trim().toUpperCase() !== kelas ||
          muridDisembunyikanHariIni_(ic, intervalArkib, icMain)) continue;
      var tidakHadir = !!tiada[hadirKunciMurid_(ic, tkh)];
      nilai[i][0] = tidakHadir ? 0 : 1;
      jumlah++; if (tidakHadir) bilTiada++;
    }
    if (!jumlah) throw new Error('Tiada murid aktif ditemui untuk ' + kelas + '.');
    s.getRange(2, col, n, 1).setValues(nilai);
    hadirLog_('SIMPAN_KEHADIRAN', sesi.peranan, kelas, jumlah + ' murid; ' + bilTiada + ' tidak hadir');
    return { ok: true, jumlah: jumlah, tidakHadir: bilTiada,
      masa: Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Kuala_Lumpur', 'HH:mm') };
  } finally { lock.releaseLock(); }
}

function hadirSenaraiMurid_(token) {
  hadirSesi_(token, true);
  var s = ss.getSheetByName('main');
  if (!s) throw new Error('Tab main tidak ditemui.');
  var header = cariBarisHeaderMain_(s), n = Math.max(s.getLastRow() - header, 0);
  if (!n) return [];
  return s.getRange(header + 1, 1, n, 11).getDisplayValues()
    .filter(function (r) { return r[2] || r[3] || r[1]; })
    .map(function (r) { return {
      idMurid: r[1], nama: r[2], ic: normalisasiIc_(r[3]), icAkhir: normalisasiIc_(r[3]).slice(-4),
      jenisPengenalan: r[4], tarikhLahir: r[5], statusPengajian: r[6],
      tarikhMasukSekolah: r[7], tarikhMasukKelas: r[8], tahun: r[9], namaKelas: r[10]
    }; }).sort(function (a, b) {
      return hadirSusunKelas_(binaKelasLengkap_(a.tahun, a.namaKelas), binaKelasLengkap_(b.tahun, b.namaKelas)) || a.nama.localeCompare(b.nama);
    });
}

function hadirSimpanMurid_(rekod, token) {
  var sesi = hadirSesi_(token, true);
  rekod = rekod || {};
  var asal = normalisasiIc_(rekod.originalIc), ic = normalisasiIc_(rekod.ic);
  if (!rekod.nama || !ic) throw new Error('Nama dan IC/MyKid diperlukan.');
  if (asal && asal !== ic) throw new Error('IC/MyKid ialah kunci tetap dan tidak boleh ditukar. Arkibkan rekod lama dan tambah murid baharu.');
  rekod.ic = ic;
  var hasil = simpanSenaraiMuridUpload({ mode: 'merge', records: [rekod], kepala: [] });
  var sync = hadirSyncSemua_();
  hadirLog_('SIMPAN_MURID', sesi.peranan, '', '1 rekod; sync=' + sync.ok);
  return {
    ok: true, syncOk: sync.ok, hasil: hasil, sync: sync,
    mesej: sync.ok ? 'Murid disimpan dan semua aplikasi diselaraskan.' :
      'Murid disimpan dalam KEHADIRAN, tetapi sebahagian penyelarasan perlu diperiksa.'
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
    return { idMurid: r[1], nama: r[2], ic: normalisasiIc_(r[3]), tahun: r[9],
      namaKelas: r[10], kelas: binaKelasLengkap_(r[9], r[10]),
      jantina: nilai(r, ['JANTINA', 'JENIS KELAMIN']),
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
    var masuk = hadirAksiRpc_(url, 'login', [id, kata]);
    if (!masuk || !masuk.berjaya || !masuk.token) throw new Error((masuk && masuk.mesej) || 'Login AKSI gagal.');
    var csv = 'IC,NAMA,TAHUN,NAMA KELAS,JANTINA,AGAMA,KAUM\n' + murid.map(function (m) {
      return [m.ic, m.nama, m.tahun, m.namaKelas, m.jantina, m.agama, m.kaum].map(hadirCsv_).join(',');
    }).join('\n');
    var hasil = hadirAksiRpc_(url, 'importMurid', [csv, masuk.token]);
    try { hadirAksiRpc_(url, 'logout', [masuk.token]); } catch (abaikan) {}
    if (!hasil || hasil.berjaya === false) throw new Error((hasil && hasil.mesej) || 'Import AKSI gagal.');
    return { ok: true, mesej: murid.length + ' murid diselaraskan.', hasil: hasil };
  } catch (e) { return { ok: false, mesej: e.message }; }
}

function hadirAksiRpc_(url, fn, args) {
  var r = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'text/plain; charset=utf-8', followRedirects: true,
    muteHttpExceptions: true, payload: JSON.stringify({ fn: fn, args: args || [], token: 'SISTEM_HADIR' })
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
  var padan = html.match(/atob\('([^']+)'\)/);
  if (!padan) throw new Error('SEMAK tidak memulangkan respons RPC yang sah.');
  var data = JSON.parse(Utilities.newBlob(Utilities.base64Decode(padan[1])).getDataAsString('UTF-8'));
  if (!data.ok) throw new Error(data.ralat || 'Panggilan SEMAK gagal.');
  return data.hasil;
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
