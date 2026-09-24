// HADIR v1.9.0 — backend web untuk projek Apps Script KEHADIRAN.
// Fail ini tidak menggantikan bot Telegram. doPost sedia ada hanya perlu
// menyerahkan permintaan mode="hadir" kepada hadirDoPost_() terlebih dahulu.

var HADIR_SESI_JAM = 8;
var HADIR_CACHE_INIT_SAAT = 60;
var HADIR_LOGIN_MAKS_CUBAAN = 5;
var HADIR_LOGIN_SEKAT_SAAT = 15 * 60;
var HADIR_AKSI_URL_LALAI = 'https://script.google.com/macros/s/AKfycby0Td2p3zoAdBWXYbbKTqmVS4Xa8R42k0suzeDFTIjgwg-hVxIzYqNkEyTE75E_bukfLA/exec';
var HADIR_SEMAK_URL_LALAI = 'https://script.google.com/macros/s/AKfycbx306dN8vd3HR3Mu4xdum8MpG0PkbbwbKgsu88jx-nMG2LnEWszU350S2ez8TU_kX_H/exec';

/* Senarai rasmi Kategori + Sebab MOEIS. Sumber: MOEIS
   /sahsiah/kehadiran/pkhem/tabguru (diperoleh 17/09/2026). Salinan yang sama
   disimpan di MOEIS_SEBAB dalam app.js untuk paparan; projek ini tiada modul
   kongsi, jadi kedua-dua salinan mesti dikemas kini bersama jika MOEIS
   menukar senarai. Pengesahan pelayan sentiasa menggunakan salinan ini, tidak
   pernah salinan yang dihantar oleh pelanggan. */
function hadirMoeisSebabData_() {
  return {
    kategori: ['A', 'B', 'D', 'E', 'G', 'I', 'J', 'K', 'L', 'M', 'N', 'P'],
    sebab: {
      B: ['WAKIL SEKOLAH'],
      K: ['BINATANG LIAR/BUAS/BERBISA', 'DICULIK', 'GANGGUAN MISTIK/MAKHLUK HALUS',
        'GANGGUAN KUMPULAN KONGSI GELAP', 'KEBAKARAN', 'PENGGANAS/LANUN',
        'RUSUHAN DI LUAR KAWASAN SEKOLAH', 'UGUTAN DARIPADA PIHAK LUAR',
        'MANGSA BULI', 'MANGSA SEKSUAL', 'TIDAK DAPAT DIKESAN/HILANG'],
      L: ['JEREBU', 'KEMALANGAN', 'BANJIR', 'GEMPA BUMI', 'HUJAN LEBAT/RIBUT TAUFAN',
        'PENCEMARAN UDARA', 'KEMARAU', 'CUACA PANAS EL NINO', 'PENCEMARAN SISA KIMIA',
        'PENCEMARAN ALAM', 'TANAH RUNTUH'],
      E: ['DIGANTUNG SEKOLAH'],
      J: ['BEKERJA', 'BERPINDAH RANDAH', 'PEREBUTAN HAK PENJAGAAN ANAK',
        'MENGIKUT KELUARGA BERCUTI/BERKURSUS', 'MENJAGA/MENGURUSKAN AHLI KELUARGA',
        'MENJAGA AHLI KELUARGA YANG SAKIT', 'KEMATIAN AHLI KELUARGA TERDEKAT',
        'KEMISKINAN/KESEMPITAN HIDUP', 'MASALAH PENGANGKUTAN', 'MENZIARAHI KELUARGA SAKIT',
        'BALIK KAMPUNG', 'BERPINDAH KE LUAR NEGARA', 'KRISIS KELUARGA', 'LARI DARI RUMAH'],
      I: ['TEKANAN PERASAAN/TRAUMA', 'KESAKITAN AKIBAT HAID/PERMULAAN HAID'],
      A: ['PEMBELAJARAN DI RUMAH'],
      G: ['URUSAN PEPERIKSAAN'],
      M: ['HAJI/UMRAH/KEGIATAN AGAMA', 'PEPERIKSAAN/UJIAN SELAIN KPM',
        'PERTANDINGAN/AKTIVITI SELAIN KPM', 'PROSES PERPINDAHAN SEKOLAH',
        'TERLIBAT KES JENAYAH', 'TERLIBAT KES TRAFIK', 'URUSAN RASMI AGENSI KERAJAAN',
        'LATIHAN/UJIAN LESEN MEMANDU', 'TAHANAN PIHAK BERKUASA', 'TERLIBAT PROSIDING MAHKAMAH',
        'PERLINDUNGAN JABATAN KEBAJIKAN MASYARAKAT', 'CUTI SEMESTER', 'MENJALANI LATIHAN INDUSTRI'],
      N: ['BANGUN LEWAT', 'MALAS KE SEKOLAH', 'KETAGIHAN GAJET', 'TIDAK MENYIAPKAN KERJA SEKOLAH',
        'MALAS KE AKTIVITI KOKURIKULUM'],
      D: ['MAKLUMAN IBU BAPA PENJAGA', 'KECEDERAAN/PATAH TULANG', 'SURAT CUTI SAKIT HOSPITAL/KLINIK',
        'IMUNISASI RENDAH', 'DEMAM', 'TANTRUM (MBK)', 'TEMUJANJI HOSPITAL/KLINIK',
        'MENJALANI TERAPI/RAWATAN/KUARANTIN', 'TIDAK MELEPASI SARINGAN KESIHATAN (MBK)',
        'MENDAPATKAN RAWATAN TRADISIONAL', 'KEMURUNGAN', 'BATUK KOKOL', 'BEGUK', 'CACAR AIR',
        'CHIKUNGUNYA', 'COVID 19 BERGEJALA', 'COVID 19 DENGAN KEBENARAN IBUBAPA',
        'COVID 19 DIKUARANTIN', 'COVID 19 PENGGILIRAN', 'DENGGI', 'SWINE FLU (H1N1)', 'HEPATITIS',
        'HAND, FOOT AND MOUTH DISEASE (HFMD)', 'INFLUENZA', 'JAPANESE ENCEPHALITIS (JE)',
        'LEPTOSPIROSIS (PENYAKIT KENCING TIKUS)', 'KUDIS BUTA', 'MALARIA', 'MERS COV', 'SAKIT MATA',
        'SARS', 'TAUN', 'TIBI', 'SAKIT MISTIK', 'SAKIT MENTAL', 'TEKANAN EMOSI'],
      P: ['SEKOLAH DALAM HOSPITAL']
    }
  };
}

function hadirMoeisSebabSah_(kategori, sebab) {
  kategori = String(kategori || '').trim().toUpperCase();
  sebab = String(sebab || '').trim().toUpperCase();
  if (!kategori || !sebab) return false;
  var rujukan = hadirMoeisSebabData_();
  if (rujukan.kategori.indexOf(kategori) < 0) return false;
  return (rujukan.sebab[kategori] || []).indexOf(sebab) > -1;
}

function hadirMoeisLabelStatus_(status) {
  return {
    menunggu: 'Menunggu', sedang_dihantar: 'Sedang dihantar',
    tersimpan: 'Tersimpan — menunggu pengesahan', berjaya: 'Berjaya', gagal: 'Gagal'
  }[status] || status;
}

var HADIR_MOEIS_LEASE_SAAT = 15 * 60;

/* Murid tidak hadir yang kategori/sebabnya kosong atau tidak sah mengikut
   senarai rasmi MOEIS. Dikongsi oleh skrin admin (paparan "Belum lengkap")
   dan moeis_job_buat (sekatan penghantaran). */
function hadirMoeisBelumLengkap_(murid) {
  return (murid || []).filter(function (m) { return !hadirMoeisSebabSah_(m && m.kategori, m && m.sebab); });
}

/* Elak pendua tugasan bagi kelas+tarikh yang sama. Pemanggil
   (moeisJobBuat) MENGGUNAKAN SEMULA baris yang sama — id lama, setValues
   semula kepada 'menunggu' — jadi baris pendua memang mustahil. Gate ini
   sebenarnya menghalang hantar semula bagi tugasan yang sudah siap, dan
   itulah yang menyekat 1 BIJAK (23 Sep): statusnya tersilap 'berjaya'
   (positif palsu MuatSemula lama) lalu tiada jalan keluar walaupun MOEIS
   langsung tidak terisi.

   Kini: status siap (berjaya) DIBENARKAN semula — admin menekan 'Hantar'
   dan enjin menghantarnya semula. Status menunggu boleh disegarkan dengan
   snapshot terbaru sebelum klaim. Sedang_dihantar / tersimpan KEKAL
   disekat supaya lease enjin tidak direset di tengah jalan. */
function hadirMoeisBolehCiptaJob_(statusSediaAda) {
  if (statusSediaAda === undefined || statusSediaAda === null || statusSediaAda === '') return true;
  return ['menunggu', 'gagal', 'berjaya'].indexOf(statusSediaAda) >= 0;
}

/* Membenarkan penghantaran hanya apabila ada sekurang-kurangnya seorang murid
   tidak hadir dan kesemuanya mempunyai kategori+sebab yang sah. */
function hadirMoeisSahkanLengkap_(murid, kelas) {
  murid = murid || [];
  if (!murid.length) throw new Error('Tiada murid tidak hadir untuk kelas ' + kelas + ' hari ini.');
  var belumLengkap = hadirMoeisBelumLengkap_(murid);
  if (belumLengkap.length) {
    throw new Error('Kategori/sebab belum lengkap bagi: ' + belumLengkap.map(function (m) { return m.nama; }).join(', '));
  }
  return true;
}

function hadirSahRahsiaMoeis_(rahsia) {
  var betul = PropertiesService.getScriptProperties().getProperty('HADIR_MOEIS_ENGINE_SECRET');
  if (!betul) throw new Error('Rahsia enjin MOEIS belum ditetapkan.');
  if (!rahsia || hadirHash_(rahsia) !== hadirHash_(betul)) throw new Error('Akses enjin MOEIS ditolak.');
  return true;
}

function hadirSheetMoeisSebab_() {
  var s = ss.getSheetByName('HADIR_MOEIS_SEBAB');
  if (!s) {
    s = ss.insertSheet('HADIR_MOEIS_SEBAB');
    s.getRange(1, 1, 1, 6).setValues([['TARIKH_ISO', 'KELAS', 'IC', 'NAMA', 'KATEGORI', 'SEBAB']]);
    s.setFrozenRows(1);
  }
  return s;
}

function hadirBacaMoeisSebabPeta_(tarikhIso) {
  var s = ss.getSheetByName('HADIR_MOEIS_SEBAB');
  var peta = Object.create(null);
  if (!s || s.getLastRow() < 2) return peta;
  s.getRange(2, 1, s.getLastRow() - 1, 6).getDisplayValues().forEach(function (r) {
    if (String(r[0]).trim() !== tarikhIso) return;
    var ic = normalisasiIc_(r[2]);
    if (ic) peta[ic] = { kategori: r[4], sebab: r[5] };
  });
  return peta;
}

/* Simpan satu rekod sebab (kemas kini admin dari skrin Hantar ke MOEIS).
   Tidak menyentuh rekod murid lain bagi kelas/tarikh yang sama. */
function hadirUpsertMoeisSebab_(tarikhIso, kelas, item) {
  var s = hadirSheetMoeisSebab_();
  var n = s.getLastRow() - 1;
  var data = n > 0 ? s.getRange(2, 1, n, 6).getDisplayValues() : [];
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === tarikhIso && normalisasiIc_(data[i][2]) === item.ic) {
      s.getRange(i + 2, 1, 1, 6).setValues([[tarikhIso, kelas, item.ic, item.nama, item.kategori, item.sebab]]);
      return;
    }
  }
  s.appendRow([tarikhIso, kelas, item.ic, item.nama, item.kategori, item.sebab]);
}

/* Ganti keseluruhan rekod sebab bagi satu kelas+tarikh dengan senarai murid
   tidak hadir yang baharu disimpan (dipanggil oleh hadirSimpanKehadiran_).
   Murid yang bertukar kembali kepada hadir tidak lagi mempunyai rekod. */
function hadirGantiMoeisSebabKelas_(tarikhIso, kelas, senarai) {
  var s = hadirSheetMoeisSebab_();
  var n = s.getLastRow() - 1;
  var data = n > 0 ? s.getRange(2, 1, n, 6).getDisplayValues() : [];
  var bakiLain = data.filter(function (r) {
    return !(String(r[0]).trim() === tarikhIso && String(r[1]).trim().toUpperCase() === kelas);
  });
  var baharu = bakiLain.concat(senarai.map(function (item) {
    return [tarikhIso, kelas, item.ic, item.nama, item.kategori, item.sebab];
  }));
  if (n > 0) s.getRange(2, 1, n, 6).clearContent();
  if (baharu.length) s.getRange(2, 1, baharu.length, 6).setValues(baharu);
}

var HADIR_MOEIS_JOB_LEBAR = 13;

/* Migrasi lembut: helaian lama (11 lajur) menerima tajuk PEMILIK/LEASE_SELEPAS
   tambahan tanpa menyentuh data sedia ada. Helaian baharu dicipta terus dengan
   13 lajur. */
function hadirSheetMoeisJob_() {
  var s = ss.getSheetByName('HADIR_MOEIS_JOB');
  if (!s) {
    s = ss.insertSheet('HADIR_MOEIS_JOB');
    s.getRange(1, 1, 1, HADIR_MOEIS_JOB_LEBAR).setValues([[
      'ID', 'TARIKH_ISO', 'KELAS', 'STATUS', 'MESEJ',
      'DICIPTA', 'DIKEMASKINI', 'MASA_SELESAI', 'BIL_HADIR_SELEPAS', 'MURID_JSON',
      'KELAS_MOEIS_ID', 'PEMILIK', 'LEASE_SELEPAS'
    ]]);
    s.setFrozenRows(1);
    return s;
  }
  if (s.getLastColumn() < HADIR_MOEIS_JOB_LEBAR) {
    s.getRange(1, s.getLastColumn() + 1, 1, HADIR_MOEIS_JOB_LEBAR - s.getLastColumn())
      .setValues([['PEMILIK', 'LEASE_SELEPAS'].slice(-(HADIR_MOEIS_JOB_LEBAR - s.getLastColumn()))]);
  }
  return s;
}

function hadirBacaJobBaris_() {
  var s = ss.getSheetByName('HADIR_MOEIS_JOB');
  if (!s || s.getLastRow() < 2) return [];
  return s.getRange(2, 1, s.getLastRow() - 1, HADIR_MOEIS_JOB_LEBAR).getDisplayValues();
}

function hadirBacaJobPeta_(tarikhIso) {
  var peta = Object.create(null);
  hadirBacaJobBaris_().forEach(function (r) {
    if (String(r[1]).trim() === tarikhIso) {
      peta[String(r[2]).trim().toUpperCase()] = { id: r[0], status: r[3], mesej: r[4] };
    }
  });
  return peta;
}

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
    nyahaktifGuru: hadirNyahaktifGuru_,
    uploadGuruCsv: hadirUploadGuruCsv_, syncGuru: hadirSyncGuruApi_,
    terimaSyncMurid: hadirTerimaSyncMurid_, terimaSyncGuru: hadirTerimaSyncGuru_,
    syncSemua: hadirSyncSemuaApi_,
    moeisSenaraiKelas: hadirMoeisSenaraiKelas_, moeisSimpanSebab: hadirMoeisSimpanSebab_,
    moeisJobBuat: hadirMoeisJobBuat_, moeisJobSenarai: hadirMoeisJobSenarai_,
    moeisJobSelesai: hadirMoeisJobSelesai_, moeisJobKlaim: hadirMoeisJobKlaim_,
    moeisJobLepas: hadirMoeisJobLepas_,
    pcTerbitKodDaftar: hadirPcTerbitKodDaftar_, pcDaftarPeranti: hadirPcDaftarPeranti_,
    pcNyahaktifPeranti: hadirPcNyahaktifPeranti_, pcDegup: hadirPcDegup_,
    pcKlaimKepimpinan: hadirPcKlaimKepimpinan_, pcSahkanPenulis: hadirPcSahkanPenulis_,
    pcSenaraiPerantiAdmin: hadirPcSenaraiPerantiAdmin_, pcStatusAwam: hadirPcStatusAwam_
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

function hadirLoginKunci_() { return 'HADIR_LOGIN_GAGAL_ADMIN'; }
function hadirLoginStatus_(props) {
  var mentah = props.getProperty(hadirLoginKunci_());
  if (!mentah) return { gagal: 0, sekatHingga: 0 };
  try {
    var status = JSON.parse(mentah);
    return {
      gagal: Number(status.gagal) || 0,
      sekatHingga: Number(status.sekatHingga) || 0
    };
  } catch (e) {
    // Keserasian defensif jika nilai lama berupa nombor tunggal.
    return { gagal: Number(mentah) || 0, sekatHingga: 0 };
  }
}
function hadirLoginDisekat_(status, sekarang) {
  return status.sekatHingga > sekarang;
}
function hadirCatatLoginGagal_(props, status, sekarang) {
  if (status.sekatHingga && status.sekatHingga <= sekarang) {
    status = { gagal: 0, sekatHingga: 0 };
  }
  status.gagal = (Number(status.gagal) || 0) + 1;
  status.sekatHingga = status.gagal >= HADIR_LOGIN_MAKS_CUBAAN
    ? sekarang + HADIR_LOGIN_SEKAT_SAAT * 1000 : 0;
  props.setProperty(hadirLoginKunci_(), JSON.stringify(status));
  return status.gagal;
}
function hadirKosongkanLoginGagal_(props) {
  props.deleteProperty(hadirLoginKunci_());
}

function hadirLogin_(peranan, pin) {
  if (peranan !== 'admin') throw new Error('Log masuk hanya diperlukan untuk admin.');
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var props = PropertiesService.getScriptProperties();
    var sekarang = Date.now();
    var status = hadirLoginStatus_(props);
    if (hadirLoginDisekat_(status, sekarang))
      throw new Error('Terlalu banyak cubaan gagal. Cuba lagi dalam 15 minit.');
    var kunci = 'HADIR_ADMIN_PIN_HASH';
    var betul = props.getProperty(kunci);
    if (!betul) throw new Error('PIN admin belum ditetapkan oleh pentadbir.');
    if (hadirHash_(pin) !== betul) {
      var cubaan = hadirCatatLoginGagal_(props, status, sekarang);
      if (cubaan >= HADIR_LOGIN_MAKS_CUBAAN)
        throw new Error('Terlalu banyak cubaan gagal. Cuba lagi dalam 15 minit.');
      throw new Error('PIN tidak betul.');
    }
    hadirKosongkanLoginGagal_(props);
    var token = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('HADIR_SESI_' + token, JSON.stringify({
      peranan: peranan, luput: sekarang + HADIR_SESI_JAM * 3600000
    }));
    hadirLog_('LOGIN', peranan, '', 'berjaya');
    return { token: token, peranan: peranan };
  } finally {
    lock.releaseLock();
  }
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
  var petaSebab = hadirBacaMoeisSebabPeta_(tarikhIso);
  var peta = Object.create(null);
  for (var i = 1; i < data.length; i++) {
    var nama = String(data[i][1] || '').trim();
    var kelas = String(data[i][2] || '').trim().toUpperCase();
    var ic = normalisasiIc_(data[i][3]);
    if (!nama || !kelas || !ic || muridDisembunyikanHariIni_(ic, intervalArkib, icMain)) continue;
    if (!peta[kelas]) peta[kelas] = [];
    var nilai = idxTarikh < 0 ? '' : data[i][idxTarikh];
    var sebabRekod = nilai === '0' ? petaSebab[ic] : null;
    peta[kelas].push({
      kunci: hadirKunciMurid_(ic, tkh), nama: nama,
      nilai: nilai === '0' ? 0 : nilai === '1' ? 1 : '',
      _rmt: !!petaRmt[ic],
      _rmtHadir: nilai === '1' && !!petaRmt[ic],
      kategori: sebabRekod ? sebabRekod.kategori : '',
      sebab: sebabRekod ? sebabRekod.sebab : ''
    });
  }
  var kelasHasil = Object.keys(peta).sort(hadirSusunKelas_).map(function (kelas) {
    var murid = peta[kelas].sort(function (a, b) { return a.nama.localeCompare(b.nama); });
    return {
      nama: kelas,
      murid: murid.map(function (m) { return { kunci: m.kunci, nama: m.nama, nilai: m.nilai, kategori: m.kategori, sebab: m.sebab }; }),
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
  var petaSebab = hadirBacaMoeisSebabPeta_(pilihan.iso);
  var murid = [];
  for (var i = 1; i < data.length; i++) {
    var nama = String(data[i][1] || '').trim();
    var namaKelas = String(data[i][2] || '').trim().toUpperCase();
    var ic = normalisasiIc_(data[i][3]);
    if (!nama || namaKelas !== kelas || !ic ||
        muridTiadaPadaTarikh_(ic, pilihan.tkh, intervalArkib, icMain)) continue;
    var nilai = idxTarikh < 0 ? '' : data[i][idxTarikh];
    var sebabRekod = nilai === '0' ? petaSebab[ic] : null;
    murid.push({
      kunci: hadirKunciMurid_(ic, pilihan.tkh), nama: nama,
      nilai: nilai === '0' ? 0 : nilai === '1' ? 1 : '',
      _rmt: !!petaRmt[ic], _rmtHadir: nilai === '1' && !!petaRmt[ic],
      kategori: sebabRekod ? sebabRekod.kategori : '',
      sebab: sebabRekod ? sebabRekod.sebab : ''
    });
  }
  murid.sort(function (a, b) { return a.nama.localeCompare(b.nama); });
  if (!murid.length) throw new Error('Tiada murid ditemui untuk kelas dan tarikh ini.');
  return {
    nama: kelas,
    murid: murid.map(function (m) { return { kunci: m.kunci, nama: m.nama, nilai: m.nilai, kategori: m.kategori, sebab: m.sebab }; }),
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

/* senaraiSebab: [{kunci, kategori, sebab}] bagi setiap murid tidak hadir.
   Kategori dan sebab wajib dan disahkan terhadap hadirMoeisSebabData_()
   sebelum sebarang tulisan berlaku — pelanggan tidak dipercayai. */
function hadirSimpanKehadiran_(kelas, senaraiSebab, token, tarikhIso) {
  var sesi = token ? hadirSesi_(token, true) : { peranan: 'guru' };
  var pilihan = hadirSahkanTarikhIso_(tarikhIso);
  kelas = String(kelas || '').trim().toUpperCase();
  if (!kelas) throw new Error('Kelas tidak sah.');
  var tiada = Object.create(null);
  (senaraiSebab || []).forEach(function (item) {
    item = item || {};
    var kunci = String(item.kunci || '').trim();
    if (!kunci) return;
    var kategori = String(item.kategori || '').trim().toUpperCase();
    var sebab = String(item.sebab || '').trim().toUpperCase();
    if (!hadirMoeisSebabSah_(kategori, sebab))
      throw new Error('Kategori dan sebab MOEIS wajib dipilih bagi setiap murid tidak hadir.');
    tiada[kunci] = { kategori: kategori, sebab: sebab };
  });
  // Fungsi asal menyediakan lajur hari ini di bawah locknya sendiri. Tarikh
  // lama dibuat di bawah lock simpanan di bawah supaya satu tarikh tidak boleh
  // terhasil dua kali apabila dua guru menekan serentak.
  if (pilihan.iso === pilihan.hariIniIso) sediakanLajurSahaja();
  var keputusan;
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    if (pilihan.iso === pilihan.hariIniIso) {
      var jobAktif = hadirMoeisCariJobDiBawahLock_(kelas, pilihan.iso);
      if (jobAktif.indeks >= 0 &&
          ['sedang_dihantar', 'tersimpan'].indexOf(jobAktif.baris[jobAktif.indeks][3]) >= 0)
        throw new Error('Tugasan MOEIS untuk ' + kelas + ' sedang dihantar atau tersimpan; tunggu pengesahan sebelum menyimpan semula kehadiran.');
    }
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
    var sebabUntukSimpan = [];
    for (var i = 0; i < n; i++) {
      var ic = normalisasiIc_(asas[i][2]);
      if (String(asas[i][1]).trim().toUpperCase() !== kelas ||
          muridTiadaPadaTarikh_(ic, tkh, intervalArkib, icMain)) continue;
      var rekodSebab = tiada[hadirKunciMurid_(ic, tkh)];
      var tidakHadir = !!rekodSebab;
      nilai[i][0] = tidakHadir ? 0 : 1;
      jumlah++;
      if (tidakHadir) {
        bilTiada++;
        sebabUntukSimpan.push({
          ic: ic, nama: String(asas[i][0]).trim(),
          kategori: rekodSebab.kategori, sebab: rekodSebab.sebab
        });
      }
      if (petaRmt[ic]) rmtJumlah++;
      if (!tidakHadir && petaRmt[ic]) rmtHadir++;
    }
    if (!jumlah) throw new Error('Tiada murid aktif ditemui untuk ' + kelas + '.');
    s.getRange(2, col, n, 1).setValues(nilai);
    hadirGantiMoeisSebabKelas_(pilihan.iso, kelas, sebabUntukSimpan);
    if (pilihan.iso === pilihan.hariIniIso) {
      try { hadirMoeisJobBuatDiBawahLock_(kelas, pilihan.iso, '', sesi.peranan, sebabUntukSimpan); }
      catch (e) { hadirLog_('MOEIS_JOB_AUTO_GAGAL', sesi.peranan, kelas, String((e && e.message) || e)); }
    }
    if (pilihan.iso === pilihan.hariIniIso) hadirPadamCacheInit_();
    hadirLog_('SIMPAN_KEHADIRAN', sesi.peranan, kelas,
      tkh + '; ' + jumlah + ' murid; ' + bilTiada + ' tidak hadir');
    keputusan = { ok: true, jumlah: jumlah, tidakHadir: bilTiada,
      rmtHadir: rmtHadir, rmtJumlah: rmtJumlah,
      tarikhIso: pilihan.iso,
      masa: Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Kuala_Lumpur', 'HH:mm') };
  } finally { lock.releaseLock(); }

  return keputusan;
}

function hadirMoeisKehadiranKelasDisimpan_(nilaiKehadiran) {
  if (!Array.isArray(nilaiKehadiran) || !nilaiKehadiran.length) return false;
  // Hanya 1 (hadir) atau 0 (tidak hadir) dikira disimpan; kosong/nilai lain tidak.
  return nilaiKehadiran.every(function (nilai) {
    return nilai === 0 || nilai === 1 || nilai === '0' || nilai === '1';
  });
}

/* Admin sahaja. Senarai kelas hari ini untuk skrin "Hantar ke MOEIS": bilangan
   tidak hadir, murid yang belum lengkap kategori/sebab, dan status tugasan
   giliran sedia ada bagi kelas itu. */
function hadirMoeisSenaraiKelas_(token) {
  hadirSesi_(token, true);
  var zona = Session.getScriptTimeZone() || 'Asia/Kuala_Lumpur';
  var tarikhIso = Utilities.formatDate(new Date(), zona, 'yyyy-MM-dd');
  var tkh = tarikhHariIni_();
  var s = ss.getSheetByName('kehadiran');
  if (!s) throw new Error('Tab kehadiran tidak ditemui.');
  var julat = s.getDataRange();
  var data = julat.getDisplayValues();
  // Nilai kehadiran dibaca mentah: format paparan boleh membundarkan 0.4 kepada '0'.
  var mentah = julat.getValues();
  var idxTarikh = data.length ? data[0].indexOf(tkh) : -1;
  var intervalArkib = dapatkanIntervalArkib_(), icMain = dapatkanIcAktifMain_();
  var petaSebab = hadirBacaMoeisSebabPeta_(tarikhIso);
  var kelasSemua = Object.create(null);
  var kehadiranKelasNilai = Object.create(null);
  var absenPeta = Object.create(null);
  for (var i = 1; i < data.length; i++) {
    var nama = String(data[i][1] || '').trim();
    var kelas = String(data[i][2] || '').trim().toUpperCase();
    var ic = normalisasiIc_(data[i][3]);
    if (!nama || !kelas || !ic || muridDisembunyikanHariIni_(ic, intervalArkib, icMain)) continue;
    kelasSemua[kelas] = true;
    var nilai = idxTarikh < 0 ? '' : mentah[i][idxTarikh];
    if (!kehadiranKelasNilai[kelas]) kehadiranKelasNilai[kelas] = [];
    kehadiranKelasNilai[kelas].push(nilai);
    if (nilai !== 0 && nilai !== '0') continue;
    var sebabRekod = petaSebab[ic];
    if (!absenPeta[kelas]) absenPeta[kelas] = [];
    absenPeta[kelas].push({
      kunci: hadirKunciMurid_(ic, tkh), nama: nama,
      kategori: sebabRekod ? sebabRekod.kategori : '',
      sebab: sebabRekod ? sebabRekod.sebab : ''
    });
  }
  var jobPeta = hadirBacaJobPeta_(tarikhIso);
  return Object.keys(kelasSemua).sort(hadirSusunKelas_).map(function (kelas) {
    var murid = (absenPeta[kelas] || []).sort(function (a, b) { return a.nama.localeCompare(b.nama); });
    var belumLengkap = hadirMoeisBelumLengkap_(murid);
    var job = jobPeta[kelas];
    return {
      nama: kelas,
      bilTidakHadir: murid.length,
      kehadiranDisimpan: hadirMoeisKehadiranKelasDisimpan_(kehadiranKelasNilai[kelas]),
      belumLengkap: belumLengkap.map(function (m) { return { kunci: m.kunci, nama: m.nama }; }),
      statusPenghantaran: job ? job.status : 'belum_dihantar',
      mesejPenghantaran: job ? job.mesej : '',
      idTugasan: job ? job.id : ''
    };
  });
}

/* Admin sahaja. Kemas kini kategori/sebab satu murid tanpa membuka semula
   skrin kehadiran. Murid mesti sudah ditanda tidak hadir hari ini. */
function hadirMoeisSimpanSebab_(payload, token) {
  var sesi = hadirSesi_(token, true);
  payload = payload || {};
  var kelas = String(payload.kelas || '').trim().toUpperCase();
  var kunci = String(payload.kunci || '').trim();
  var kategori = String(payload.kategori || '').trim().toUpperCase();
  var sebab = String(payload.sebab || '').trim().toUpperCase();
  if (!kelas || !kunci) throw new Error('Murid tidak sah.');
  if (!hadirMoeisSebabSah_(kategori, sebab)) throw new Error('Kategori atau sebab tidak sah.');
  var zona = Session.getScriptTimeZone() || 'Asia/Kuala_Lumpur';
  var tarikhIso = Utilities.formatDate(new Date(), zona, 'yyyy-MM-dd');
  var tkh = tarikhHariIni_();
  var s = ss.getSheetByName('kehadiran');
  if (!s) throw new Error('Tab kehadiran tidak ditemui.');
  var data = s.getDataRange().getDisplayValues();
  var idxTarikh = data.length ? data[0].indexOf(tkh) : -1;
  if (idxTarikh < 0) throw new Error('Lajur kehadiran hari ini belum wujud.');
  var intervalArkib = dapatkanIntervalArkib_(), icMain = dapatkanIcAktifMain_();
  var dipadan = null;
  for (var i = 1; i < data.length; i++) {
    var namaKelas = String(data[i][2] || '').trim().toUpperCase();
    var ic = normalisasiIc_(data[i][3]);
    if (namaKelas !== kelas || !ic || muridDisembunyikanHariIni_(ic, intervalArkib, icMain)) continue;
    if (hadirKunciMurid_(ic, tkh) !== kunci) continue;
    if (data[i][idxTarikh] !== '0') throw new Error('Murid ini tidak ditanda tidak hadir hari ini.');
    dipadan = { ic: ic, nama: String(data[i][1] || '').trim() };
    break;
  }
  if (!dipadan) throw new Error('Murid tidak ditemui untuk kelas dan tarikh ini.');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    hadirUpsertMoeisSebab_(tarikhIso, kelas, {
      ic: dipadan.ic, nama: dipadan.nama, kategori: kategori, sebab: sebab
    });
  } finally { lock.releaseLock(); }
  hadirPadamCacheInit_();
  hadirLog_('MOEIS_SEBAB_ADMIN', sesi.peranan, kelas, 'kategori=' + kategori);
  return { ok: true, kategori: kategori, sebab: sebab, mesej: 'Kategori dan sebab dikemas kini.' };
}

/* Admin sahaja, dan hanya untuk kehadiran hari ini. Mencipta satu tugasan
   giliran yang kelak diambil oleh enjin Playwright pada PC guru (projek
   berasingan moeis-bot). HADIR tidak menghubungi MOEIS secara langsung. */
function hadirMoeisJobBuat_(kelas, tarikhIso, token, kelasMoeisId) {
  var sesi = hadirSesi_(token, true);
  return hadirMoeisJobBuatDalaman_(kelas, tarikhIso, kelasMoeisId, sesi.peranan);
}

/* Pembungkus admin mengambil tepat satu ScriptLock. */
function hadirMoeisJobBuatDalaman_(kelas, tarikhIso, kelasMoeisId, peranan) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return hadirMoeisJobBuatDiBawahLock_(kelas, tarikhIso, kelasMoeisId, peranan); }
  finally { lock.releaseLock(); }
}

function hadirMoeisCariJobDiBawahLock_(kelas, tarikhIso) {
  var sJob = ss.getSheetByName('HADIR_MOEIS_JOB');
  // Sheet lama 11 lajur perlu dimigrasi sebelum sebarang bacaan 13 lajur.
  // Jangan cipta sheet kosong untuk simpanan yang semuanya hadir.
  if (sJob) sJob = hadirSheetMoeisJob_();
  var n = sJob ? sJob.getLastRow() - 1 : 0;
  var baris = n > 0 ? sJob.getRange(2, 1, n, HADIR_MOEIS_JOB_LEBAR).getDisplayValues() : [];
  var indeks = -1;
  for (var j = 0; j < baris.length; j++) {
    if (String(baris[j][1]).trim() === tarikhIso && String(baris[j][2]).trim().toUpperCase() === kelas) {
      indeks = j; break;
    }
  }
  return { sJob: sJob, baris: baris, indeks: indeks };
}

/* Pemanggil mesti sudah memegang ScriptLock; tiada kunci bersarang. */
function hadirMoeisJobBuatDiBawahLock_(kelas, tarikhIso, kelasMoeisId, peranan, muridSimpanan) {
  kelas = String(kelas || '').trim().toUpperCase();
  if (!kelas) throw new Error('Kelas tidak sah.');
  kelasMoeisId = String(kelasMoeisId || '').trim().slice(0, 100);
  var zona = Session.getScriptTimeZone() || 'Asia/Kuala_Lumpur';
  var hariIniIso = Utilities.formatDate(new Date(), zona, 'yyyy-MM-dd');
  tarikhIso = String(tarikhIso || hariIniIso).trim();
  if (tarikhIso !== hariIniIso) throw new Error('Penghantaran MOEIS hanya tersedia bagi kehadiran hari ini.');
  var murid = muridSimpanan || [];
  if (!muridSimpanan) {
    // Bacaan kehadiran + sebab dan penulisan job mesti berada di bawah lock
    // yang sama dengan simpanan guru dan klaim enjin. Jika dua Simpan tiba
    // rapat, pembina job yang lambat tidak boleh menulis snapshot lama.
    var tkh = tarikhHariIni_();
    var s = ss.getSheetByName('kehadiran');
    if (!s) throw new Error('Tab kehadiran tidak ditemui.');
    var julat = s.getDataRange();
    var data = julat.getDisplayValues();
    // Nilai kehadiran dibaca mentah: format paparan boleh membundarkan 0.4 kepada '0'.
    var mentah = julat.getValues();
    var idxTarikh = data.length ? data[0].indexOf(tkh) : -1;
    var intervalArkib = dapatkanIntervalArkib_(), icMain = dapatkanIcAktifMain_();
    var petaSebab = hadirBacaMoeisSebabPeta_(tarikhIso);
    // Semua murid aktif kelas mesti bernilai 0/1 hari ini sebelum job dibaca
    // atau ditulis; lajur tarikh tiada = semua kosong = belum disimpan.
    var nilaiKelas = [];
    for (var i = 1; i < data.length; i++) {
      var nama = String(data[i][1] || '').trim();
      var namaKelas = String(data[i][2] || '').trim().toUpperCase();
      var ic = normalisasiIc_(data[i][3]);
      if (!nama || namaKelas !== kelas || !ic || muridDisembunyikanHariIni_(ic, intervalArkib, icMain)) continue;
      var nilai = idxTarikh < 0 ? '' : mentah[i][idxTarikh];
      nilaiKelas.push(nilai);
      if (nilai !== 0 && nilai !== '0') continue;
      var sebabRekod = petaSebab[ic];
      murid.push({
        ic: ic, nama: nama,
        kategori: sebabRekod ? sebabRekod.kategori : '',
        sebab: sebabRekod ? sebabRekod.sebab : ''
      });
    }
    if (!hadirMoeisKehadiranKelasDisimpan_(nilaiKelas)) {
      throw new Error('Kehadiran kelas belum disimpan sepenuhnya untuk ' + kelas +
        ' hari ini. Simpan kehadiran semua murid dahulu.');
    }
  }
  var job = hadirMoeisCariJobDiBawahLock_(kelas, tarikhIso);
  var indeks = job.indeks, baris = job.baris;
  if (!murid.length && muridSimpanan) {
    if (indeks >= 0 && baris[indeks][3] === 'menunggu') job.sJob.deleteRow(indeks + 2);
    return { ok: true, kelas: kelas, jumlah: 0, mesej: 'Tiada murid tidak hadir; tugasan menunggu dibatalkan.' };
  }
  hadirMoeisSahkanLengkap_(murid, kelas);
  var sJob = job.sJob || hadirSheetMoeisJob_();
  if (indeks >= 0 && !hadirMoeisBolehCiptaJob_(baris[indeks][3])) {
    throw new Error('Tugasan untuk kelas ' + kelas + ' pada tarikh ini sudah wujud (status: ' +
      hadirMoeisLabelStatus_(baris[indeks][3]) + ').');
  }
  var masa = new Date();
  var id = indeks >= 0 ? baris[indeks][0] : Utilities.getUuid();
  if (!kelasMoeisId && indeks >= 0) kelasMoeisId = String(baris[indeks][10] || '');
  // 13 lajur (HADIR_MOEIS_JOB_LEBAR): PEMILIK/LEASE_SELEPAS kosong pada
  // tugasan baharu/dicipta semula — setValues() melontar ralat dimensi
  // jika baris ini kurang daripada lebar jadual sebenar.
  var barisBaru = [id, tarikhIso, kelas, 'menunggu', '', masa, masa, '', '', JSON.stringify(murid), kelasMoeisId, '', ''];
  if (indeks >= 0) sJob.getRange(indeks + 2, 1, 1, HADIR_MOEIS_JOB_LEBAR).setValues([barisBaru]);
  else sJob.appendRow(barisBaru);
  hadirLog_('MOEIS_JOB_BUAT', peranan, kelas, murid.length + ' murid tidak hadir');
  return {
    ok: true, kelas: kelas, jumlah: murid.length,
    mesej: 'Tugasan penghantaran MOEIS dicipta untuk ' + kelas + ' (' + murid.length + ' murid).'
  };
}

/* Dibaca oleh admin (token sesi) untuk paparan status, atau oleh enjin PC
   (rahsia HADIR_MOEIS_ENGINE_SECRET) untuk mengambil tugasan. Butiran murid
   (termasuk IC, diperlukan oleh enjin untuk mengisi borang MOEIS) hanya
   dihantar pada laluan rahsia enjin, tidak pada paparan admin. */
function hadirMoeisJobSenarai_(token, rahsia) {
  var modAdmin = false;
  if (token) { hadirSesi_(token, true); modAdmin = true; }
  else hadirSahRahsiaMoeis_(rahsia);
  var paparan = hadirBacaJobBaris_();
  var s = ss.getSheetByName('HADIR_MOEIS_JOB');
  var nilai = (!s || s.getLastRow() < 2) ? [] :
    s.getRange(2, 1, s.getLastRow() - 1, HADIR_MOEIS_JOB_LEBAR).getValues();
  return paparan.map(function (r, indeks) {
    var diciptaMentah = nilai[indeks] && nilai[indeks][5];
    var diciptaEpochMs = diciptaMentah instanceof Date ? diciptaMentah.getTime() : NaN;
    var rekod = {
      id: r[0], tarikhIso: r[1], kelas: r[2], status: r[3], mesej: r[4],
      dicipta: r[5], diciptaEpochMs: isFinite(diciptaEpochMs) ? diciptaEpochMs : null,
      dikemaskini: r[6], masaSelesai: r[7],
      bilHadirSelepas: r[8] === '' ? null : Number(r[8]),
      kelasMoeisId: r[10] || ''
    };
    if (!modAdmin) rekod.murid = JSON.parse(r[9] || '[]');
    return rekod;
  });
}

/* Dipanggil oleh enjin PC sahaja (rahsia HADIR_MOEIS_ENGINE_SECRET) apabila
   satu tugasan selesai diproses di MOEIS. HADIR tidak pernah memanggil MOEIS
   sendiri; ini hanya merekod keputusan yang dilaporkan oleh enjin.
   'tersimpan' bermaksud dialog Simpan berjaya tetapi pengesahan selepas muat
   semula tidak lengkap — ini BUKAN kejayaan dan tidak boleh dicuba semula
   secara automatik oleh giliran. PEMILIK/LEASE dikosongkan supaya baris tidak
   kekal terkunci kepada enjin yang sudah selesai.

   PENTING (penemuan semakan bebas): `pemilik` WAJIB sepadan dengan lajur
   PEMILIK dan status semasa mesti 'sedang_dihantar' (atau 'tersimpan' untuk
   laluan pengesahan semula). Tanpa semakan ini, sesiapa yang memegang rahsia
   enjin boleh menandakan mana-mana tugasan 'berjaya' tanpa sebarang bacaan
   semula MOEIS — memintas mesin keadaan klaim → sahkan → lapor. */
function hadirMoeisJobSelesai_(id, keputusan, mesej, bilHadirSelepas, pemilik, rahsia) {
  hadirSahRahsiaMoeis_(rahsia);
  keputusan = String(keputusan || '').toLowerCase();
  if (['berjaya', 'gagal', 'tersimpan'].indexOf(keputusan) < 0) throw new Error('Keputusan tugasan tidak sah.');
  pemilik = String(pemilik || '').trim();
  if (!pemilik) throw new Error('Pemilik tugasan diperlukan untuk merekod keputusan.');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var kelasLog = '';
  try {
    var s = ss.getSheetByName('HADIR_MOEIS_JOB');
    if (!s || s.getLastRow() < 2) throw new Error('Tugasan tidak ditemui.');
    var n = s.getLastRow() - 1;
    var baris = s.getRange(2, 1, n, HADIR_MOEIS_JOB_LEBAR).getDisplayValues();
    var indeks = -1;
    for (var i = 0; i < baris.length; i++) { if (String(baris[i][0]) === String(id)) { indeks = i; break; } }
    if (indeks < 0) throw new Error('Tugasan tidak ditemui.');
    var statusSemasa = String(baris[indeks][3] || '').trim();
    var pemilikSemasa = String(baris[indeks][11] || '').trim();
    if (!pemilikSemasa) throw new Error('Tugasan tidak dipegang oleh mana-mana enjin (tiada klaim aktif).');
    if (pemilikSemasa !== pemilik) throw new Error('Hanya enjin yang memegang klaim boleh merekod keputusan tugasan ini.');
    if (statusSemasa !== 'sedang_dihantar' && statusSemasa !== 'tersimpan') {
      throw new Error('Status tugasan tidak sepadan untuk merekod keputusan (status: ' + statusSemasa + ').');
    }
    kelasLog = baris[indeks][2];
    var masa = new Date();
    s.getRange(indeks + 2, 4).setValue(keputusan);
    s.getRange(indeks + 2, 5).setValue(String(mesej || '').slice(0, 500));
    s.getRange(indeks + 2, 7).setValue(masa);
    s.getRange(indeks + 2, 8).setValue(masa);
    s.getRange(indeks + 2, 9).setValue(bilHadirSelepas == null || bilHadirSelepas === '' ? '' : Number(bilHadirSelepas));
    s.getRange(indeks + 2, 12).setValue('');
    s.getRange(indeks + 2, 13).setValue('');
  } finally { lock.releaseLock(); }
  hadirLog_('MOEIS_JOB_SELESAI', 'sistem', kelasLog, keputusan);
  return { ok: true };
}

/* Klaim atomik satu tugasan sedia ada bagi enjin PC (rahsia
   HADIR_MOEIS_ENGINE_SECRET). Dipanggil selepas enjin melihat senarai melalui
   moeisJobSenarai dan memilih satu tugasan berstatus 'menunggu'. Pengesahan
   sebenar keadaan tugasan dibuat semula di sini di bawah ScriptLock supaya dua
   enjin yang mencuba id yang sama serentak hanya satu berjaya. Pulangkan objek
   tugasan yang diklaim, atau null jika tidak boleh diklaim (tugasan lain
   sedang memegangnya, sudah tersimpan/berjaya, atau gagal tanpa kebenaran
   cuba semula eksplisit).

   benarkanCubaSemula:
     - true      -> tugasan 'gagal' boleh dicuba semula (klaim admin manual).
     - 'verifikasi' -> tugasan 'tersimpan' boleh diklaim untuk BACAAN SAHAJA
       (lease dipegang, status KEKAL 'tersimpan', tiada tulisan kehadiran
       baharu dibenarkan menerusi laluan ini) — pemulihan selamat companion
       apabila pengesahan selepas simpan tidak lengkap.
     - false/tiada -> gelung automatik biasa. */
function hadirMoeisJobKlaim_(id, pemilik, benarkanCubaSemula, rahsia) {
  hadirSahRahsiaMoeis_(rahsia);
  pemilik = String(pemilik || '').trim();
  if (!pemilik) throw new Error('Pemilik tugasan diperlukan untuk klaim.');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var s = ss.getSheetByName('HADIR_MOEIS_JOB');
    if (!s || s.getLastRow() < 2) return null;
    var n = s.getLastRow() - 1;
    var baris = s.getRange(2, 1, n, HADIR_MOEIS_JOB_LEBAR).getDisplayValues();
    var indeks = -1;
    for (var i = 0; i < baris.length; i++) { if (String(baris[i][0]) === String(id)) { indeks = i; break; } }
    if (indeks < 0) return null;
    var status = String(baris[indeks][3] || '');
    var pemilikSediaAda = String(baris[indeks][11] || '');
    // LEASE_SELEPAS mesti dibaca sebagai NILAI NOMBOR (getValue), bukan
    // getDisplayValues() — bentuk paparan lokal (cth "18/9/2026 09:15:00")
    // menjadikan new Date(...) itu NaN, yang secara silap membenarkan enjin
    // lain "merampas" tugasan yang sebenarnya masih dipegang (lease sentiasa
    // dianggap luput). Nilai bukan-nombor dianggap TIDAK SAH dan fail
    // tertutup: hanya pemilik SEDIA ADA yang boleh memperbaharui; pemilik
    // BERLAINAN tidak boleh mengambil alih melainkan lease itu nombor sah
    // dan benar-benar luput.
    var leaseMentah = s.getRange(indeks + 2, 13).getValue();
    var leaseSah = typeof leaseMentah === 'number' && isFinite(leaseMentah);
    var leaseTiada = leaseMentah === '' || leaseMentah == null;
    var sekarang = Date.now();
    var mahuVerifikasiSahaja = status === 'tersimpan' && benarkanCubaSemula === 'verifikasi';
    var bolehKlaim = false;
    if (status === 'menunggu') bolehKlaim = true;
    else if (status === 'sedang_dihantar' && pemilikSediaAda === pemilik) bolehKlaim = true; // heartbeat lease oleh pemilik sama
    else if (status === 'sedang_dihantar' && pemilikSediaAda !== pemilik && leaseSah && leaseMentah < sekarang) bolehKlaim = true; // lease sah dan luput, runner mati
    else if (status === 'sedang_dihantar' && pemilikSediaAda === '' && !leaseSah && leaseTiada) bolehKlaim = true; // tiada pemilik & tiada lease aktif (tugasan lama/manual) — tiada enjin memegang
    else if (status === 'gagal' && benarkanCubaSemula === true) bolehKlaim = true;
    else if (mahuVerifikasiSahaja) bolehKlaim = true;
    if (!bolehKlaim) return null;
    var masa = new Date();
    var leaseBaharu = sekarang + HADIR_MOEIS_LEASE_SAAT * 1000; // simpan sebagai epoch ms, bukan Date/paparan
    if (!mahuVerifikasiSahaja) s.getRange(indeks + 2, 4).setValue('sedang_dihantar');
    s.getRange(indeks + 2, 7).setValue(masa);
    s.getRange(indeks + 2, 12).setValue(pemilik);
    s.getRange(indeks + 2, 13).setValue(leaseBaharu);
    return {
      id: baris[indeks][0], tarikhIso: baris[indeks][1], kelas: baris[indeks][2],
      murid: JSON.parse(baris[indeks][9] || '[]'), kelasMoeisId: baris[indeks][10] || ''
    };
  } finally { lock.releaseLock(); }
}

/* Lepaskan lease tugasan tanpa merekod keputusan (henti bersih giliran).
   Hanya pemilik semasa boleh melepaskan; ini mengelakkan satu enjin
   melepaskan tugasan yang sedang dipegang oleh enjin lain. */
function hadirMoeisJobLepas_(id, pemilik, rahsia) {
  hadirSahRahsiaMoeis_(rahsia);
  pemilik = String(pemilik || '').trim();
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var s = ss.getSheetByName('HADIR_MOEIS_JOB');
    if (!s || s.getLastRow() < 2) throw new Error('Tugasan tidak ditemui.');
    var n = s.getLastRow() - 1;
    var baris = s.getRange(2, 1, n, HADIR_MOEIS_JOB_LEBAR).getDisplayValues();
    var indeks = -1;
    for (var i = 0; i < baris.length; i++) { if (String(baris[i][0]) === String(id)) { indeks = i; break; } }
    if (indeks < 0) throw new Error('Tugasan tidak ditemui.');
    if (String(baris[indeks][3] || '') !== 'sedang_dihantar') return { ok: true };
    if (String(baris[indeks][11] || '') !== pemilik) throw new Error('Hanya pemilik tugasan boleh melepaskannya.');
    s.getRange(indeks + 2, 4).setValue('menunggu');
    s.getRange(indeks + 2, 7).setValue(new Date());
    s.getRange(indeks + 2, 12).setValue('');
    s.getRange(indeks + 2, 13).setValue('');
  } finally { lock.releaseLock(); }
  return { ok: true };
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
    s.getRange(1, 1, 1, 4).setValues([['NAMA GURU', 'JAWATAN', 'DIKEMAS KINI', 'STATUS']]);
    s.setFrozenRows(1);
  } else if (!s.getRange(1, 4).getValue()) {
    s.getRange(1, 4).setValue('STATUS');
    if (s.getLastRow() > 1) s.getRange(2, 4, s.getLastRow() - 1, 1).setValue('AKTIF');
  }
  return s;
}

function hadirBacaGuru_(sertakanTidakAktif) {
  var s = ss.getSheetByName('HADIR_GURU');
  if (!s || s.getLastRow() < 2) return [];
  var lajur = Math.max(4, Math.min(s.getLastColumn(), 4));
  return s.getRange(2, 1, s.getLastRow() - 1, lajur).getDisplayValues()
    .map(function (r) {
      var status = hadirJawatanGuru_(r[3] || 'AKTIF');
      return { nama: hadirNamaGuru_(r[0]), jawatan: hadirJawatanGuru_(r[1]),
        dikemasKini: r[2] || '', aktif: status !== 'TIDAK AKTIF' };
    }).filter(function (g) { return !!g.nama && (sertakanTidakAktif || g.aktif); })
    .sort(function (a, b) { return a.nama.localeCompare(b.nama, 'ms'); });
}

function hadirSenaraiGuru_(token) {
  hadirSesi_(token, true);
  return hadirBacaGuru_();
}

function hadirGabungGuru_(senarai, mod) {
  mod = String(mod || 'merge').toLowerCase() === 'sync' ? 'sync' : 'merge';
  var s = hadirSheetGuru_();
  var data = s.getLastRow() > 1
    ? s.getRange(2, 1, s.getLastRow() - 1, 4).getDisplayValues() : [];
  var peta = Object.create(null);
  data.forEach(function (r, i) {
    var nama = hadirNamaGuru_(r[0]);
    if (nama && peta[nama] === undefined) peta[nama] = i;
  });
  var tambah = 0, kemasKini = 0, nyahaktif = 0, aktifSemula = 0;
  var langkau = 0, dilihat = Object.create(null);
  (senarai || []).forEach(function (asal) {
    asal = asal || {};
    var nama = hadirNamaGuru_(typeof asal === 'string' ? asal : asal.nama);
    var jawatan = hadirJawatanGuru_(typeof asal === 'string' ? '' : asal.jawatan);
    if (!nama || dilihat[nama]) { langkau++; return; }
    dilihat[nama] = true;
    var masa = new Date();
    if (peta[nama] === undefined) {
      peta[nama] = data.length;
      data.push([nama, jawatan, masa, 'AKTIF']);
      tambah++;
    } else {
      var indeks = peta[nama];
      var berubah = false;
      if (jawatan && hadirJawatanGuru_(data[indeks][1]) !== jawatan) {
        data[indeks][1] = jawatan;
        berubah = true;
      }
      if (hadirJawatanGuru_(data[indeks][3] || 'AKTIF') === 'TIDAK AKTIF') {
        data[indeks][3] = 'AKTIF';
        aktifSemula++;
        berubah = true;
      }
      if (berubah) {
        data[indeks][2] = masa;
        kemasKini++;
      } else langkau++;
    }
  });
  if (mod === 'sync') {
    data.forEach(function (r) {
      var nama = hadirNamaGuru_(r[0]);
      if (!nama || dilihat[nama] || hadirJawatanGuru_(r[3] || 'AKTIF') === 'TIDAK AKTIF') return;
      r[3] = 'TIDAK AKTIF';
      r[2] = new Date();
      nyahaktif++;
    });
  }
  if (data.length) s.getRange(2, 1, data.length, 4).setValues(data);
  return { tambah: tambah, kemasKini: kemasKini, nyahaktif: nyahaktif,
    aktifSemula: aktifSemula, langkau: langkau,
    jumlah: data.filter(function (r) { return hadirJawatanGuru_(r[3] || 'AKTIF') !== 'TIDAK AKTIF'; }).length };
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
    hasil = hadirGabungGuru_([{ nama: nama, jawatan: rekod.jawatan }], 'merge');
    var guru = hadirBacaGuru_();
    var sync = hadirSyncGuruSemua_(guru, 'merge');
  } finally { lock.releaseLock(); }
  hadirLog_('SIMPAN_GURU', sesi.peranan, '', '1 rekod; sync=' + sync.ok);
  return {
    ok: true, syncOk: sync.ok, hasil: hasil, sync: sync,
    mesej: sync.ok ? 'Guru disimpan dan semua aplikasi diselaraskan.' :
      'Guru disimpan dalam HADIR, tetapi sebahagian penyelarasan perlu diperiksa.'
  };
}

function hadirNyahaktifGuru_(nama, token) {
  var sesi = hadirSesi_(token, true);
  nama = hadirNamaGuru_(nama);
  if (!nama) throw new Error('Nama guru diperlukan.');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var hasil, sync;
  try {
    var aktif = hadirBacaGuru_().filter(function (g) { return g.nama !== nama; });
    hasil = hadirGabungGuru_(aktif, 'sync');
    sync = hadirSyncGuruSemua_(hadirBacaGuru_(), 'sync');
  } finally { lock.releaseLock(); }
  hadirLog_('NYAHAKTIF_GURU', sesi.peranan, '', '1 rekod; sync=' + sync.ok);
  return { ok: true, syncOk: sync.ok, hasil: hasil, sync: sync,
    mesej: sync.ok ? 'Guru dinyahaktifkan dalam semua aplikasi; sejarah dan kata laluan dikekalkan.' :
      'Guru dinyahaktifkan dalam HADIR, tetapi sebahagian penyelarasan perlu diperiksa.' };
}

function hadirUploadGuruCsv_(payload, token) {
  var sesi = hadirSesi_(token, true);
  payload = payload || {};
  var mentah = Array.isArray(payload.records) ? payload.records : [];
  if (!mentah.length) throw new Error('Fail CSV tidak mengandungi nama guru yang sah.');
  if (mentah.length > 1000) throw new Error('Fail CSV melebihi had 1,000 rekod guru.');
  var mod = String(payload.mode || 'merge').toLowerCase() === 'sync' ? 'sync' : 'merge';
  var rekod = mentah.map(function (g) {
    return { nama: hadirNamaGuru_(g && g.nama), jawatan: hadirJawatanGuru_(g && g.jawatan) };
  }).filter(function (g) { return !!g.nama; });
  if (!rekod.length) throw new Error('Tiada nama guru yang sah ditemui.');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var hasil;
  try {
    hasil = hadirGabungGuru_(rekod, mod);
    var guru = hadirBacaGuru_();
    var sync = hadirSyncGuruSemua_(guru, mod);
  } finally { lock.releaseLock(); }
  hadirLog_('UPLOAD_GURU_CSV', sesi.peranan, '', rekod.length + ' rekod; sync=' + sync.ok);
  return {
    ok: true, syncOk: sync.ok, hasil: hasil, sync: sync,
    mesej: 'Selesai: ' + hasil.tambah + ' ditambah, ' + hasil.kemasKini +
      ' dikemas kini, ' + hasil.nyahaktif + ' dinyahaktifkan, ' + hasil.langkau + ' tanpa perubahan.' +
      (sync.ok ? ' AKSI dan SEMAK telah diselaraskan.' : ' Semak status penyelarasan AKSI/SEMAK.')
  };
}

function hadirTerimaSyncGuru_(senarai, sumber, rahsia, mod) {
  hadirSahRahsiaSync_(rahsia);
  sumber = String(sumber || '').trim().toUpperCase();
  if (['AKSI', 'SEMAK'].indexOf(sumber) < 0) throw new Error('Sumber penyelarasan guru tidak sah.');
  mod = String(mod || 'merge').toLowerCase() === 'sync' ? 'sync' : 'merge';
  if (!Array.isArray(senarai) || (!senarai.length && mod !== 'sync')) throw new Error('Tiada rekod guru diterima.');
  if (senarai.length > 1000) throw new Error('Muatan guru melebihi had 1,000 rekod.');
  var rekod = senarai.map(function (asal) {
    return {
      nama: hadirNamaGuru_(typeof asal === 'string' ? asal : asal && asal.nama),
      jawatan: hadirJawatanGuru_(typeof asal === 'string' ? '' : asal && asal.jawatan)
    };
  }).filter(function (g) { return !!g.nama; });
  if (!rekod.length && mod !== 'sync') throw new Error('Tiada nama guru yang sah diterima.');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var hasil;
  var sync;
  try {
    hasil = hadirGabungGuru_(rekod, mod);
    var guru = hadirBacaGuru_();
    sync = sumber === 'AKSI'
      ? { ok: true, aksi: { ok: true, dilangkau: true }, semak: hadirSyncGuruSemak_(guru, mod) }
      : { ok: true, aksi: hadirSyncGuruAksi_(guru, mod), semak: { ok: true, dilangkau: true } };
    sync.ok = sync.aksi.ok && sync.semak.ok;
  } finally { lock.releaseLock(); }
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
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    guru = hadirBacaGuru_();
    var hasil = hadirSyncGuruSemua_(guru, 'sync');
  }
  finally { lock.releaseLock(); }
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

function hadirSyncGuruSemua_(guru, mod) {
  var aksi = hadirSyncGuruAksi_(guru || [], mod);
  var semak = hadirSyncGuruSemak_(guru || [], mod);
  return { ok: aksi.ok && semak.ok, jumlah: (guru || []).length, aksi: aksi, semak: semak };
}

function hadirSyncGuruAksi_(guru, mod) {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('HADIR_AKSI_URL') || HADIR_AKSI_URL_LALAI;
  var id = props.getProperty('HADIR_AKSI_ID') || 'admin';
  var kata = props.getProperty('HADIR_AKSI_PASSWORD');
  if (!kata) return { ok: false, mesej: 'Kata laluan perkhidmatan AKSI belum ditetapkan.' };
  try {
    var masuk = hadirAksiRpc_(url, 'login', [id, kata], '');
    if (!masuk || !masuk.berjaya || !masuk.token) throw new Error((masuk && masuk.mesej) || 'Login AKSI gagal.');
    var hasil = hadirAksiRpc_(url, 'importGuru', [guru, masuk.token, 'HADIR', mod || 'merge'], masuk.token);
    if (!hasil || hasil.berjaya === false) throw new Error((hasil && hasil.mesej) || 'Import guru AKSI gagal.');
    var akaun = hadirAksiRpc_(url, 'pastikanAkaunGuru', [masuk.token], masuk.token);
    try { hadirAksiRpc_(url, 'logout', [masuk.token], masuk.token); } catch (abaikan) {}
    if (!akaun || akaun.berjaya === false) throw new Error((akaun && akaun.mesej) || 'Akaun guru AKSI gagal diselaraskan.');
    return { ok: true, mesej: guru.length + ' guru digabung; akaun sedia ada dikekalkan.', hasil: hasil };
  } catch (e) { return { ok: false, mesej: e.message }; }
}

function hadirSyncGuruSemak_(guru, mod) {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('HADIR_SEMAK_URL') || HADIR_SEMAK_URL_LALAI;
  var kata = props.getProperty('HADIR_SEMAK_PASSWORD');
  if (!kata) return { ok: false, mesej: 'Kata laluan perkhidmatan SEMAK belum ditetapkan.' };
  try {
    var hasil = hadirSemakRpc_(url, 'apiImportGuru', [guru, kata, 'HADIR', mod || 'merge']);
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

/* === Multi-PC: pendaftaran peranti + kepimpinan + fencing === */
/* Peranti dan kepimpinan berbilang PC bagi satu akaun. Logik keadaan di sini
   ADALAH SALINAN TANGAN (mirror) bagi hadir-pc/kontrak.mjs — Apps Script tidak
   boleh mengimport modul ESM, jadi peraturan sekali-guna/lease/fencing
   diulang secara sengaja di sini dan mesti kekal SEPADAN dengan kontrak.mjs
   apabila salah satu dipinda.

   HAD JUJUR (tidak boleh diberi jaminan lebih daripada ini):
   - Apps Script TIDAK boleh memagar pelayar portal fizikal secara transaksi;
     satu pelayar aktif lama mesti berhenti menulis SENDIRI apabila ia
     kehilangan kepimpinan (semakan generasi pada penulisan seterusnya).
   - Tulisan yang sedang berlaku semasa kehilangan kepimpinan berada dalam
     keadaan tidak pasti — pemulihan mesti membaca dahulu (read-first
     reconciliation), bukan mengandaikan kejayaan atau kegagalan.
   - Tiada jaminan terhadap network partition yang tidak dapat dikesan oleh
     lease/heartbeat; hanya cap masa lastSeenMs/leaseMs direkodkan — TIDAK
     PERNAH memaparkan dakwaan pasti "PC online". */

var HADIR_PELBAGAI_PC_TTL_KOD_MS = 15 * 60 * 1000;
var HADIR_PELBAGAI_PC_LEASE_MS = 45 * 1000;

function hadirPcCiriDidayakan_() {
  return PropertiesService.getScriptProperties().getProperty('HADIR_PELBAGAI_PC') === '1';
}

function hadirPcPastikanDidayakan_() {
  if (!hadirPcCiriDidayakan_()) throw new Error('Ciri berbilang PC dilumpuhkan.');
}

/* Migrasi lembut mengikut gaya hadirSheetMoeisJob_: cipta hanya jika tiada,
   tambah tajuk lajur yang hilang jika helaian sedia ada lebih sempit. */
function hadirSheetPeranti_() {
  var lajur = ['ID', 'AKAUN', 'NAMA', 'RAHSIA_HASH', 'STATUS', 'GENERASI',
    'DICIPTA_MS', 'DILULUS_MS', 'LAST_SEEN_MS', 'NYAHAKTIF_MS'];
  var s = ss.getSheetByName('HADIR_PERANTI');
  if (!s) {
    s = ss.insertSheet('HADIR_PERANTI');
    s.getRange(1, 1, 1, lajur.length).setValues([lajur]);
    s.setFrozenRows(1);
    return s;
  }
  if (s.getLastColumn() < lajur.length) {
    s.getRange(1, s.getLastColumn() + 1, 1, lajur.length - s.getLastColumn())
      .setValues([lajur.slice(s.getLastColumn())]);
  }
  return s;
}

function hadirSheetPerantiLead_() {
  var lajur = ['AKAUN', 'PEMIMPIN', 'LEASE_MS', 'GENERASI'];
  var s = ss.getSheetByName('HADIR_PERANTI_LEAD');
  if (!s) {
    s = ss.insertSheet('HADIR_PERANTI_LEAD');
    s.getRange(1, 1, 1, lajur.length).setValues([lajur]);
    s.setFrozenRows(1);
    return s;
  }
  if (s.getLastColumn() < lajur.length) {
    s.getRange(1, s.getLastColumn() + 1, 1, lajur.length - s.getLastColumn())
      .setValues([lajur.slice(s.getLastColumn())]);
  }
  return s;
}

function hadirPcBacaPerantiBaris_() {
  var s = hadirSheetPeranti_();
  if (s.getLastRow() < 2) return [];
  return s.getRange(2, 1, s.getLastRow() - 1, 10).getValues();
}

function hadirPcCariPerantiIndeks_(baris, idPeranti) {
  for (var i = 0; i < baris.length; i++) {
    if (String(baris[i][0]) === String(idPeranti)) return i;
  }
  return -1;
}

function hadirPcBacaLeadBaris_() {
  var s = hadirSheetPerantiLead_();
  if (s.getLastRow() < 2) return [];
  return s.getRange(2, 1, s.getLastRow() - 1, 4).getValues();
}

function hadirPcCariLeadIndeks_(baris, akaun) {
  for (var i = 0; i < baris.length; i++) {
    if (String(baris[i][0]) === String(akaun)) return i;
  }
  return -1;
}

function hadirPcRekodLead_(baris, indeks) {
  if (indeks < 0) return { pemimpin: null, leaseMs: 0, generasi: 0 };
  var r = baris[indeks];
  return { pemimpin: r[1] || null, leaseMs: Number(r[2]) || 0, generasi: Number(r[3]) || 0 };
}

function hadirPcTulisLead_(s, baris, indeks, akaun, rekod) {
  var barisBaru = [akaun, rekod.pemimpin || '', rekod.leaseMs, rekod.generasi];
  if (indeks >= 0) {
    s.getRange(indeks + 2, 1, 1, 4).setValues([barisBaru]);
  } else {
    s.appendRow(barisBaru);
  }
}

function hadirPcSanitisePeranti_(r) {
  return {
    idPeranti: r[0], akaun: r[1], nama: r[2], status: r[4], generasi: Number(r[5]) || 0,
    diciptaMs: Number(r[6]) || 0, dilulusMs: Number(r[7]) || 0,
    lastSeenMs: r[8] === '' || r[8] == null ? null : Number(r[8]),
    nyahaktifMs: r[9] === '' || r[9] == null ? null : Number(r[9])
  };
}

function hadirPcKodDaftarKunci_(hashKod) { return 'HADIR_KOD_DAFTAR_' + hashKod; }

function hadirPcTerbitKodDaftar_(akaun, ttlMs, token) {
  hadirSesi_(token, true);
  hadirPcPastikanDidayakan_();
  var props = PropertiesService.getScriptProperties();
  var sekarang = Date.now();
  var kodDaftar = Utilities.getUuid() + Utilities.getUuid();
  var hashKod = hadirHash_(kodDaftar);
  var luputMs = sekarang + (Number(ttlMs) || HADIR_PELBAGAI_PC_TTL_KOD_MS);
  props.setProperty(hadirPcKodDaftarKunci_(hashKod), JSON.stringify({
    akaun: akaun, luputMs: luputMs, digunakan: false, digunakanOleh: null
  }));
  return { kodDaftar: kodDaftar, luputMs: luputMs };
}

function hadirPcDaftarPeranti_(kodDaftar, idPeranti, akaun, nama, rahsia) {
  hadirPcPastikanDidayakan_();
  if (!rahsia) throw new Error('Rahsia peranti diperlukan.');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var props = PropertiesService.getScriptProperties();
    var hashKod = hadirHash_(kodDaftar);
    var kunciKod = hadirPcKodDaftarKunci_(hashKod);
    var mentah = props.getProperty(kunciKod);
    if (!mentah) throw new Error('Kod daftar tidak sah.');
    var kod;
    try { kod = JSON.parse(mentah); } catch (e) { throw new Error('Kod daftar tidak sah.'); }
    var sekarang = Date.now();
    if (kod.digunakan) throw new Error('Kod daftar telah digunakan.');
    if (Number(kod.luputMs) < sekarang) throw new Error('Kod daftar telah luput.');
    if (String(kod.akaun) !== String(akaun)) throw new Error('Kod daftar tidak sah untuk akaun ini.');

    var s = hadirSheetPeranti_();
    var baris = hadirPcBacaPerantiBaris_();
    if (hadirPcCariPerantiIndeks_(baris, idPeranti) >= 0) throw new Error('Peranti sudah didaftarkan.');

    kod.digunakan = true;
    kod.digunakanOleh = idPeranti;
    props.setProperty(kunciKod, JSON.stringify(kod));

    var namaBersih = String(nama || '').trim().slice(0, 80);
    var rekod = [idPeranti, akaun, namaBersih, hadirHash_(rahsia), 'aktif', 1,
      sekarang, sekarang, '', ''];
    s.appendRow(rekod);
    hadirLog_('PC_DAFTAR', 'admin', '', 'peranti didaftarkan untuk akaun ' + akaun);
    return hadirPcSanitisePeranti_(rekod);
  } finally { lock.releaseLock(); }
}

function hadirPcNyahaktifPeranti_(idPeranti, akaun, token) {
  hadirSesi_(token, true);
  hadirPcPastikanDidayakan_();
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var s = hadirSheetPeranti_();
    var baris = hadirPcBacaPerantiBaris_();
    var indeks = hadirPcCariPerantiIndeks_(baris, idPeranti);
    if (indeks < 0 || String(baris[indeks][1]) !== String(akaun)) throw new Error('Peranti tidak ditemui.');
    var sekarang = Date.now();
    var generasiPeranti = (Number(baris[indeks][5]) || 0) + 1;
    s.getRange(indeks + 2, 5).setValue('nyahaktif');
    s.getRange(indeks + 2, 6).setValue(generasiPeranti);
    s.getRange(indeks + 2, 10).setValue(sekarang);

    var sLead = hadirSheetPerantiLead_();
    var leadBaris = hadirPcBacaLeadBaris_();
    var leadIndeks = hadirPcCariLeadIndeks_(leadBaris, akaun);
    var lead = hadirPcRekodLead_(leadBaris, leadIndeks);
    if (lead.pemimpin === idPeranti) {
      lead.pemimpin = null;
      lead.leaseMs = 0;
      lead.generasi += 1;
      hadirPcTulisLead_(sLead, leadBaris, leadIndeks, akaun, lead);
    }
    var leadAkhir = hadirPcRekodLead_(leadBaris, leadIndeks);
    leadAkhir = lead.pemimpin === null ? lead : leadAkhir;
    hadirLog_('PC_NYAHAKTIF', 'admin', '', 'peranti dinyahaktifkan untuk akaun ' + akaun);
    return { ok: true, generasi: leadAkhir.generasi };
  } finally { lock.releaseLock(); }
}

function hadirPcSahkanPerantiAktif_(idPeranti, akaun, rahsia) {
  var baris = hadirPcBacaPerantiBaris_();
  var indeks = hadirPcCariPerantiIndeks_(baris, idPeranti);
  if (indeks < 0 || String(baris[indeks][1]) !== String(akaun) ||
    String(baris[indeks][3]) !== hadirHash_(rahsia)) {
    throw new Error('Akses peranti ditolak.');
  }
  if (String(baris[indeks][4]) !== 'aktif') throw new Error('Peranti tidak diluluskan.');
  return { indeks: indeks, baris: baris };
}

function hadirPcDegup_(idPeranti, akaun, rahsia) {
  hadirPcPastikanDidayakan_();
  var s = hadirSheetPeranti_();
  var sah = hadirPcSahkanPerantiAktif_(idPeranti, akaun, rahsia);
  var sekarang = Date.now();
  s.getRange(sah.indeks + 2, 9).setValue(sekarang);

  var sLead = hadirSheetPerantiLead_();
  var leadBaris = hadirPcBacaLeadBaris_();
  var leadIndeks = hadirPcCariLeadIndeks_(leadBaris, akaun);
  var lead = hadirPcRekodLead_(leadBaris, leadIndeks);
  var adalahPemimpin = lead.pemimpin === idPeranti;
  if (adalahPemimpin) {
    lead.leaseMs = sekarang + HADIR_PELBAGAI_PC_LEASE_MS;
    hadirPcTulisLead_(sLead, leadBaris, leadIndeks, akaun, lead);
  }
  return { ok: true, pemimpin: adalahPemimpin, generasi: lead.generasi };
}

/* Kawalan pertindihan pengambilalihan: baca baris HADIR_MOEIS_JOB berstatus
   'sedang_dihantar' ATAU 'tersimpan' yang lajur PEMILIK (indeks 11) sepadan
   dengan pemimpin lama. Jika wujud, pengambilalihan ditolak — tugasan aktif
   itu mungkin masih ditulis oleh pelayar lama. */
function hadirPcTugasAktifDipegangOleh_(pemilikLama) {
  var baris = hadirBacaJobBaris_();
  for (var i = 0; i < baris.length; i++) {
    var status = String(baris[i][3] || '');
    var pemilik = String(baris[i][11] || '');
    if ((status === 'sedang_dihantar' || status === 'tersimpan') && pemilik === pemilikLama) {
      return true;
    }
  }
  return false;
}

function hadirPcKlaimKepimpinan_(idPeranti, akaun, rahsia) {
  hadirPcPastikanDidayakan_();
  hadirPcSahkanPerantiAktif_(idPeranti, akaun, rahsia);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    // Sah semula di dalam kunci — status peranti mungkin berubah semasa menunggu giliran.
    hadirPcSahkanPerantiAktif_(idPeranti, akaun, rahsia);
    var sekarang = Date.now();
    var sLead = hadirSheetPerantiLead_();
    var leadBaris = hadirPcBacaLeadBaris_();
    var leadIndeks = hadirPcCariLeadIndeks_(leadBaris, akaun);
    var lead = hadirPcRekodLead_(leadBaris, leadIndeks);

    if (!lead.pemimpin) {
      var baharu = { pemimpin: idPeranti, leaseMs: sekarang + HADIR_PELBAGAI_PC_LEASE_MS, generasi: lead.generasi + 1 };
      hadirPcTulisLead_(sLead, leadBaris, leadIndeks, akaun, baharu);
      hadirLog_('PC_KLAIM', 'sistem', '', 'kepimpinan baharu untuk akaun ' + akaun);
      return { ok: true, pemimpin: idPeranti, generasi: baharu.generasi, leaseMs: baharu.leaseMs };
    }

    if (lead.pemimpin === idPeranti) {
      var diperbaharui = { pemimpin: idPeranti, leaseMs: sekarang + HADIR_PELBAGAI_PC_LEASE_MS, generasi: lead.generasi + 1 };
      hadirPcTulisLead_(sLead, leadBaris, leadIndeks, akaun, diperbaharui);
      return { ok: true, pemimpin: idPeranti, generasi: diperbaharui.generasi, leaseMs: diperbaharui.leaseMs };
    }

    if (lead.leaseMs > sekarang) {
      throw new Error('Pemimpin aktif lain memegang lease.');
    }

    var pemimpinLama = lead.pemimpin;
    if (hadirPcTugasAktifDipegangOleh_(pemimpinLama)) {
      throw new Error('Tugasan aktif masih dipegang pemimpin sedia ada — ambil alih ditolak.');
    }

    var ambilAlih = { pemimpin: idPeranti, leaseMs: sekarang + HADIR_PELBAGAI_PC_LEASE_MS, generasi: lead.generasi + 1 };
    hadirPcTulisLead_(sLead, leadBaris, leadIndeks, akaun, ambilAlih);
    hadirLog_('PC_KLAIM', 'sistem', '', 'pengambilalihan kepimpinan untuk akaun ' + akaun);
    return { ok: true, pemimpin: idPeranti, generasi: ambilAlih.generasi, leaseMs: ambilAlih.leaseMs };
  } finally { lock.releaseLock(); }
}

function hadirPcSahkanPenulis_(idPeranti, akaun, rahsia, generasi) {
  hadirPcPastikanDidayakan_();
  hadirPcSahkanPerantiAktif_(idPeranti, akaun, rahsia);
  var leadBaris = hadirPcBacaLeadBaris_();
  var leadIndeks = hadirPcCariLeadIndeks_(leadBaris, akaun);
  var lead = hadirPcRekodLead_(leadBaris, leadIndeks);
  if (lead.pemimpin !== idPeranti) throw new Error('Peranti bukan pemimpin semasa.');
  if (lead.generasi !== Number(generasi)) throw new Error('Generasi lapuk — penulis telah dipagar.');
  return { ok: true };
}

function hadirPcSenaraiPerantiAdmin_(akaun, token) {
  hadirSesi_(token, true);
  hadirPcPastikanDidayakan_();
  var baris = hadirPcBacaPerantiBaris_();
  var hasil = [];
  for (var i = 0; i < baris.length; i++) {
    if (String(baris[i][1]) === String(akaun)) hasil.push(hadirPcSanitisePeranti_(baris[i]));
  }
  return hasil;
}

/* Tiada gate ciri/pentadbir di sini secara sengaja: ini status AWAM. Apabila
   ciri dilumpuhkan, tiada helaian HADIR_PERANTI_LEAD wujud secara praktikal
   (daftarPeranti/klaimKepimpinan menolak dahulu), jadi ia secara semula jadi
   memulangkan senarai kosong. TIDAK PERNAH mendedahkan RAHSIA_HASH / serial /
   nama / PII — hanya id peranti legap + cap masa.
   Laluan ini BACA SAHAJA: ia TIDAK mencipta helaian (tiada kesan tulis tanpa
   pengesahan) — jika helaian belum wujud ia terus memulangkan senarai kosong. */
function hadirPcStatusAwam_() {
  var leadSheet = ss.getSheetByName('HADIR_PERANTI_LEAD');
  var perantiSheet = ss.getSheetByName('HADIR_PERANTI');
  var leadBaris = (!leadSheet || leadSheet.getLastRow() < 2) ? [] :
    leadSheet.getRange(2, 1, leadSheet.getLastRow() - 1, 4).getValues();
  var perantiBaris = (!perantiSheet || perantiSheet.getLastRow() < 2) ? [] :
    perantiSheet.getRange(2, 1, perantiSheet.getLastRow() - 1, 10).getValues();
  var hasil = [];
  for (var i = 0; i < leadBaris.length; i++) {
    var akaun = String(leadBaris[i][0]);
    var lead = hadirPcRekodLead_(leadBaris, i);
    var lastSeenMs = null;
    if (lead.pemimpin) {
      var pIndeks = hadirPcCariPerantiIndeks_(perantiBaris, lead.pemimpin);
      if (pIndeks >= 0) {
        var v = perantiBaris[pIndeks][8];
        lastSeenMs = v === '' || v == null ? null : Number(v);
      }
    }
    hasil.push({
      akaun: akaun, pemimpin: lead.pemimpin, lastSeenMs: lastSeenMs,
      leaseMs: lead.leaseMs, generasi: lead.generasi
    });
  }
  return hasil;
}
