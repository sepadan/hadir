(function () {
  'use strict';

  var cfg = window.HADIR_CONFIG || {};
  var state = {
    token: '', peranan: 'guru', data: null, reviewData: null, kelas: null,
    paneAktif: 'reviewPane',
    tidakHadir: new Set(), murid: [], sedangSimpan: false,
    uploadRecords: [], uploadHeaders: [], uploadFileName: '', muridDialog: null,
    guru: [], guruUploadRecords: [], guruUploadFileName: '',
    cacheSementara: false, tarikhEditIso: '', versiSemakan: 0
  };

  function $(id) { return document.getElementById(id); }
  function teks(v) { return String(v == null ? '' : v); }
  function norm(v) { return teks(v).trim().toUpperCase(); }
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function status(node, mesej, jenis) {
    node.textContent = mesej || '';
    node.className = 'status' + (jenis ? ' ' + jenis : '');
  }
  function mulaButang(btn, label) {
    var asal = btn.textContent;
    btn.disabled = true;
    btn.textContent = label;
    return function () { btn.disabled = false; btn.textContent = asal; };
  }

  function tunggu_(ms) {
    return new Promise(function (selesai) { setTimeout(selesai, ms); });
  }

  function panggil(kaedah, argumen, timeout) {
    if (!cfg.apiUrl) return Promise.reject(new Error('Backend HADIR belum disambungkan.'));
    var pengawal = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var jam = setTimeout(function () { if (pengawal) pengawal.abort(); }, timeout || 30000);
    return fetch(cfg.apiUrl, {
      method: 'POST', redirect: 'follow',
      signal: pengawal ? pengawal.signal : undefined,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        mode: 'hadir', id: 'hadir_' + Date.now(),
        kaedah: kaedah, argumen: argumen || []
      })
    }).then(function (r) { return r.text(); }).then(function (mentah) {
      clearTimeout(jam);
      var j;
      try { j = JSON.parse(mentah); }
      catch (e) { throw new Error('Pelayan belum menggunakan backend HADIR terkini.'); }
      if (!j.ok) throw new Error(j.ralat || 'Permintaan gagal.');
      return j.hasil;
    }).catch(function (e) {
      clearTimeout(jam);
      if (e && e.name === 'AbortError') throw new Error('Pelayan mengambil masa terlalu lama.');
      if (!navigator.onLine) throw new Error('Tiada sambungan internet. Sambung semula dan cuba lagi.');
      if (e && (e.name === 'TypeError' || /failed to fetch|load failed|network/i.test(e.message || '')))
        throw new Error('Sambungan ke pelayan Google terganggu.');
      throw e;
    });
  }

  function bolehCubaSemula_(err) {
    var mesej = err && err.message ? err.message : '';
    return navigator.onLine && !/sesi tamat|akses pentadbir|pin|fungsi tidak dibenarkan/i.test(mesej);
  }

  function panggilInit_(token, nombor) {
    nombor = nombor || 1;
    if (nombor > 1) {
      status($('publicStatus'), 'Sambungan lambat. Mencuba semula…', '');
      status($('reviewStatus'), 'Sambungan lambat. Mencuba semula…', '');
    }
    return panggil('init', token ? [token] : [], nombor === 1 ? 12000 : 20000)
      .catch(function (err) {
        if (nombor >= 2 || !bolehCubaSemula_(err)) throw err;
        return tunggu_(350).then(function () { return panggilInit_(token, nombor + 1); });
      });
  }

  var KUNCI_CACHE_INIT = 'hadir_init_cache_v1';

  function tarikhMalaysiaHariIni_() {
    try {
      var bahagian = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(new Date());
      var peta = {};
      bahagian.forEach(function (p) { peta[p.type] = p.value; });
      return peta.year + '-' + peta.month + '-' + peta.day;
    } catch (e) {
      var kini = new Date();
      return kini.getFullYear() + '-' + String(kini.getMonth() + 1).padStart(2, '0') + '-' +
        String(kini.getDate()).padStart(2, '0');
    }
  }

  function bacaCacheInit_() {
    try {
      var rekod = JSON.parse(localStorage.getItem(KUNCI_CACHE_INIT) || 'null');
      if (!rekod || !rekod.data || rekod.tarikhIso !== tarikhMalaysiaHariIni_()) {
        localStorage.removeItem(KUNCI_CACHE_INIT);
        return null;
      }
      rekod.data.peranan = 'guru';
      return rekod.data;
    } catch (e) {
      try { localStorage.removeItem(KUNCI_CACHE_INIT); } catch (abaikan) {}
      return null;
    }
  }

  function simpanCacheInit_(data) {
    if (!data || !data.tarikhIso || !Array.isArray(data.kelas)) return;
    try {
      var salinan = JSON.parse(JSON.stringify(data));
      salinan.peranan = 'guru';
      localStorage.setItem(KUNCI_CACHE_INIT, JSON.stringify({
        tarikhIso: data.tarikhIso, disimpanPada: Date.now(), data: salinan
      }));
    } catch (e) {}
  }

  function tetapkanModAdmin(aktif) {
    state.peranan = aktif ? 'admin' : 'guru';
    $('adminLoginMenu').hidden = aktif;
    $('adminLogoutMenu').hidden = !aktif;
    $('adminMenu').hidden = !aktif;
    $('roleLabel').textContent = aktif ? 'Mod admin' : 'Mod guru';
  }

  function bukaAplikasi(data) {
    var kelasSemasa = state.kelas && state.kelas.nama;
    state.data = data || { kelas: [] };
    state.reviewData = state.data;
    state.tarikhEditIso = state.data.tarikhIso || '';
    tetapkanModAdmin(state.data.peranan === 'admin' && !!state.token);
    $('topDate').textContent = state.data.tarikhPaparan || state.data.tarikh || 'Hari ini';
    $('reviewDate').textContent = state.data.tarikhPaparan || state.data.tarikh || 'Hari ini';
    $('reviewDateSelect').value = state.data.tarikhIso || '';
    $('reviewDateSelect').min = state.data.tarikhMinimum || '';
    $('reviewDateSelect').max = state.data.tarikhMaksimum || state.data.tarikhIso || '';
    lukisPilihanKelas(kelasSemasa);
    lukisPilihanSemakan();
    status($('publicStatus'), '', '');
    status($('reviewStatus'), '', '');
    $('retryBtn').hidden = true;
    $('reviewRetryBtn').hidden = true;
    bukaPane(state.paneAktif || 'reviewPane');
  }

  function lukisPilihanKelas(kelasSemasa) {
    var select = $('classSelect');
    select.textContent = '';
    var kelas = state.data && state.data.kelas ? state.data.kelas : [];
    if (!kelas.length) {
      var kosong = el('option', '', 'Tiada kelas aktif');
      kosong.value = '';
      select.appendChild(kosong);
      select.disabled = true;
      $('attendanceView').hidden = true;
      $('emptyState').hidden = false;
      $('emptyState').querySelector('h2').textContent = 'Tiada kelas aktif';
      $('emptyState').querySelector('p').textContent = 'Semak tab main dan kehadiran dalam sistem induk.';
      /* Kotak "KELAS DIPILIH" dibuang dari menu sisi — nama kelas sudah
         ada dalam dropdown di kanan atas. */
      return;
    }
    kelas.forEach(function (k) {
      var option = el('option', '', k.nama + ' · ' + k.jumlah + ' murid');
      option.value = k.nama;
      select.appendChild(option);
    });
    select.disabled = false;
    var dipilih = kelas.find(function (k) { return k.nama === kelasSemasa; }) || kelas[0];
    select.value = dipilih.nama;
    pilihKelas(dipilih);
  }

  /* Kosong BUKAN sifar.
     Backend memulangkan nilai 0 (tidak hadir), 1 (hadir), atau '' (belum
     ditanda). `Number('')` ialah 0 dalam JavaScript, jadi ujian
     `Number(m.nilai) === 0` menandakan SETIAP murid yang belum ditanda
     sebagai tidak hadir.

     Kesannya pada pagi hari baru: seluruh kelas merah, kaunter berbunyi
     "24 tidak hadir", dan satu ketikan pada Simpan Kehadiran merekodkan
     semua murid tidak hadir. Perbandingan mesti ketat.

     Peraturan 3.6 dalam hab: kosong bukan sifar. */
  function tidakHadirAsal_(murid) {
    return new Set((murid || []).filter(function (m) {
      return m.nilai === 0;
    }).map(function (m) { return teks(m.kunci); }));
  }

  function pilihKelas(kelas) {
    if (!kelas) return;
    state.kelas = kelas;
    state.tidakHadir = tidakHadirAsal_(kelas.murid);
    $('emptyState').hidden = true;
    $('attendanceView').hidden = false;
    $('classSelect').value = kelas.nama;
    $('studentSearch').value = '';
    $('saveHint').textContent = kelas.sudahSimpan ? 'Rekod semasa dimuat' : 'Belum disimpan';
    kemasKiniRmtHariIni();
    lukisMuridKelas();
  }

  function kemasKiniRmtHariIni(belumSimpan) {
    if (!state.kelas) return;
    $('rmtPresentCount').textContent = belumSimpan || !state.kelas.sudahSimpan
      ? 'RMT hadir dikira selepas simpan'
      : Number(state.kelas.rmtHadir || 0) + '/' + Number(state.kelas.rmtJumlah || 0) + ' murid RMT hadir';
  }

  function lukisMuridKelas() {
    if (!state.kelas) return;
    var q = norm($('studentSearch').value);
    var box = $('studentList');
    box.textContent = '';
    var semua = state.kelas.murid || [];
    semua.filter(function (m) { return !q || norm(m.nama).indexOf(q) > -1; })
      .forEach(function (m) {
        var kunci = teks(m.kunci), tiada = state.tidakHadir.has(kunci);
        var btn = el('button', 'student-row' + (tiada ? ' absent' : ''));
        btn.type = 'button';
        btn.appendChild(el('span', 'mini-avatar', norm(m.nama).charAt(0) || '?'));
        var copy = el('span', 'student-copy');
        copy.appendChild(el('strong', '', m.nama));
        copy.appendChild(el('small', '', state.kelas.nama));
        btn.appendChild(copy);
        btn.appendChild(el('span', 'mark', tiada ? 'Tidak hadir' : 'Hadir'));
        btn.addEventListener('click', function () {
          if (state.tidakHadir.has(kunci)) state.tidakHadir.delete(kunci);
          else state.tidakHadir.add(kunci);
          $('saveHint').textContent = 'Perubahan belum disimpan';
          kemasKiniRmtHariIni(true);
          lukisMuridKelas();
        });
        box.appendChild(btn);
      });
    /* "0 tidak hadir" membaca seperti masalah. Pada pagi hari baru,
       keadaan sebenar ialah "belum ada yang ditanda". */
    var bil = state.tidakHadir.size;
    $('absentCount').textContent = bil
      ? bil + ' tidak hadir'
      : 'Semua hadir';
  }

  function lukisPilihanSemakan() {
    var select = $('reviewClassSelect');
    var pilihanSemasa = select.value;
    var kelas = state.reviewData && state.reviewData.kelas ? state.reviewData.kelas : [];
    select.textContent = '';
    var semua = el('option', '', 'Semua Kelas');
    semua.value = '';
    select.appendChild(semua);
    kelas.forEach(function (k) {
      var option = el('option', '', k.nama);
      option.value = k.nama;
      select.appendChild(option);
    });
    select.value = kelas.some(function (k) { return k.nama === pilihanSemasa; }) ? pilihanSemasa : '';
    lukisSemakan();
  }

  function lukisSemakan() {
    var namaKelas = $('reviewClassSelect').value;
    var semuaKelas = state.reviewData && state.reviewData.kelas ? state.reviewData.kelas : [];
    var kelas = namaKelas ? semuaKelas.filter(function (k) { return k.nama === namaKelas; }) : semuaKelas;
    var selesai = kelas.filter(function (k) { return !!k.sudahSimpan; });
    var jumlahTidakHadir = 0;
    var jumlahRmtHadir = 0, jumlahRmt = 0;
    selesai.forEach(function (k) {
      jumlahTidakHadir += (k.murid || []).filter(function (m) { return m.nilai === 0; }).length;
      jumlahRmtHadir += Number(k.rmtHadir || 0);
      jumlahRmt += Number(k.rmtJumlah || 0);
    });
    $('reviewSavedCount').textContent = selesai.length;
    $('reviewPendingCount').textContent = kelas.length - selesai.length;
    $('reviewAbsentCount').textContent = jumlahTidakHadir;
    $('reviewRmtCount').textContent = jumlahRmtHadir + '/' + jumlahRmt;

    var box = $('reviewList');
    box.textContent = '';
    if (!kelas.length) {
      var kosong = el('div', 'empty-review');
      kosong.appendChild(el('strong', '', 'Tiada rekod kehadiran'));
      kosong.appendChild(el('span', '', 'Belum ada kelas yang disimpan pada tarikh ini.'));
      box.appendChild(kosong);
      return;
    }
    kelas.forEach(function (k) {
      var murid = k.murid || [];
      var tiada = k.sudahSimpan ? murid.filter(function (m) { return m.nilai === 0; }) : [];
      var hadir = k.sudahSimpan
        ? (typeof k.hadir === 'number' ? k.hadir : murid.filter(function (m) { return m.nilai === 1; }).length)
        : 0;
      var card = el('article', 'review-card review-card-action' + (k.sudahSimpan ? ' done' : ' pending'));
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', 'Isi kehadiran kelas ' + k.nama);
      var head = el('div', 'review-card-head');
      var title = el('div');
      title.appendChild(el('h2', '', k.nama));
      title.appendChild(el('p', '', murid.length + ' murid'));
      head.appendChild(title);
      head.appendChild(el('span', 'review-state', k.sudahSimpan ? 'Selesai' : 'Belum disimpan'));
      card.appendChild(head);
      if (!k.sudahSimpan) {
        card.appendChild(el('p', 'review-message', 'Belum ada rekod untuk kelas ini.'));
      } else {
        var stats = el('div', 'review-card-stats');
        var hadirBox = el('div');
        hadirBox.appendChild(el('strong', '', hadir));
        hadirBox.appendChild(el('span', '', 'Hadir'));
        var tiadaBox = el('div');
        tiadaBox.appendChild(el('strong', '', tiada.length));
        tiadaBox.appendChild(el('span', '', 'Tidak hadir'));
        stats.appendChild(hadirBox);
        stats.appendChild(tiadaBox);
        var rmtBox = el('div');
        rmtBox.appendChild(el('strong', '', Number(k.rmtHadir || 0) + '/' + Number(k.rmtJumlah || 0)));
        rmtBox.appendChild(el('span', '', 'RMT hadir'));
        stats.appendChild(rmtBox);
        card.appendChild(stats);
        var absentBox = el('div', 'review-absent');
        absentBox.appendChild(el('strong', '', tiada.length ? 'Murid tidak hadir' : 'Semua murid hadir'));
        if (tiada.length) {
          var ul = el('ul');
          tiada.forEach(function (m) { ul.appendChild(el('li', '', m.nama)); });
          absentBox.appendChild(ul);
        }
        card.appendChild(absentBox);
      }
      card.addEventListener('click', function () { bukaKehadiranKelas(k.nama); });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          bukaKehadiranKelas(k.nama);
        }
      });
      box.appendChild(card);
    });
  }

  function bukaKehadiranKelas(namaKelas) {
    if (state.cacheSementara) {
      status($('reviewStatus'), 'Tunggu sebentar. Data terkini sedang dimuatkan sebelum pengisian dibuka.', '');
      return;
    }
    var tarikhIso = state.reviewData && state.reviewData.tarikhIso
      ? state.reviewData.tarikhIso : (state.data && state.data.tarikhIso);
    var hariIni = state.data && tarikhIso === state.data.tarikhIso;
    if (!hariIni) {
      var tarikhPaparan = state.reviewData && (state.reviewData.tarikhPaparan || state.reviewData.tarikh)
        ? (state.reviewData.tarikhPaparan || state.reviewData.tarikh) : tarikhIso;
      if (!window.confirm('Anda akan mengisi atau mengubah kehadiran ' + tarikhPaparan + '. Teruskan?')) return;
      muatKehadiranTarikh_(namaKelas, tarikhIso, tarikhPaparan);
      return;
    }
    var kelasHariIni = state.data && state.data.kelas ? state.data.kelas : [];
    var kelas = kelasHariIni.find(function (k) { return k.nama === namaKelas; });
    if (!kelas) {
      status($('reviewStatus'), 'Kelas ini tiada dalam senarai aktif hari ini.', 'err');
      return;
    }
    bukaPengisianKelas_(kelas, tarikhIso, '');
  }

  function muatKehadiranTarikh_(namaKelas, tarikhIso, tarikhPaparan) {
    status($('reviewStatus'), 'Memuatkan nama murid bagi tarikh dipilih…', '');
    panggil('bukaKehadiranTarikh', [namaKelas, tarikhIso], 30000)
      .then(function (kelas) {
        bukaPengisianKelas_(kelas, tarikhIso,
          'Amaran: anda sedang mengedit kehadiran ' + tarikhPaparan + '.');
      }).catch(function (err) {
        status($('reviewStatus'), err.message, 'err');
      });
  }

  function bukaPengisianKelas_(kelas, tarikhIso, amaran) {
    state.tarikhEditIso = tarikhIso || (state.data && state.data.tarikhIso) || '';
    $('attendanceDateLabel').textContent = amaran
      ? 'KEHADIRAN · ' + teks((kelas && kelas.tarikhPaparan) || tarikhIso).toUpperCase()
      : 'KEHADIRAN HARI INI';
    status($('publicStatus'), amaran || '', amaran ? 'warn' : '');
    bukaPane('attendancePane');
    pilihKelas(kelas);
    var content = document.querySelector('.content');
    if (content) content.scrollTop = 0;
  }

  function bukaKehadiranHariIni_() {
    var kelasHariIni = state.data && state.data.kelas ? state.data.kelas : [];
    var namaSemasa = $('classSelect').value || (state.kelas && state.kelas.nama);
    var kelas = kelasHariIni.find(function (k) { return k.nama === namaSemasa; }) || kelasHariIni[0];
    state.tarikhEditIso = state.data && state.data.tarikhIso ? state.data.tarikhIso : '';
    $('attendanceDateLabel').textContent = 'KEHADIRAN HARI INI';
    status($('publicStatus'), '', '');
    bukaPane('attendancePane');
    if (kelas) pilihKelas(kelas);
  }

  function muatSemakanTarikh() {
    var tarikhIso = $('reviewDateSelect').value;
    if (!tarikhIso) return;
    var versiPermintaan = ++state.versiSemakan;
    status($('reviewStatus'), 'Memuatkan rekod kehadiran…', '');
    $('reviewDateSelect').disabled = true;
    var permintaan = state.data && tarikhIso === state.data.tarikhIso
      ? Promise.resolve(state.data)
      : panggil('semakKehadiran', [tarikhIso], 30000);
    permintaan.then(function (data) {
      if (versiPermintaan !== state.versiSemakan) return;
      state.reviewData = data || { kelas: [] };
      $('reviewDate').textContent = state.reviewData.tarikhPaparan || state.reviewData.tarikh || tarikhIso;
      status($('reviewStatus'), '', '');
      lukisPilihanSemakan();
    }).catch(function (err) {
      if (versiPermintaan !== state.versiSemakan) return;
      status($('reviewStatus'), err.message, 'err');
    }).finally(function () {
      if (versiPermintaan === state.versiSemakan) $('reviewDateSelect').disabled = false;
    });
  }

  function muatAwal() {
    status($('publicStatus'), 'Memuatkan senarai kelas…', '');
    status($('reviewStatus'), 'Memuatkan ringkasan kehadiran…', '');
    $('retryBtn').hidden = true;
    $('reviewRetryBtn').hidden = true;
    var tokenSimpan = sessionStorage.getItem('hadir_admin_token') || '';
    state.token = tokenSimpan;
    var dataCache = bacaCacheInit_();
    var cacheDipapar = false;
    if (dataCache) {
      state.cacheSementara = true;
      bukaAplikasi(dataCache);
      cacheDipapar = true;
      status($('publicStatus'), 'Memaparkan data hari ini · sedang mengemas kini…', '');
      status($('reviewStatus'), 'Memaparkan data hari ini · sedang mengemas kini…', '');
    }
    var cubaan = panggilInit_(tokenSimpan, 1);
    cubaan.catch(function (err) {
      if (!tokenSimpan) throw err;
      state.token = '';
      sessionStorage.removeItem('hadir_admin_token');
      return panggilInit_('', 1);
    }).then(function (data) {
      state.cacheSementara = false;
      simpanCacheInit_(data);
      bukaAplikasi(data);
    }).catch(function (err) {
      var mesej = err && err.message ? err.message : 'Gagal memuatkan data kehadiran.';
      if (cacheDipapar) {
        status($('publicStatus'), 'Data hari ini dipaparkan. Kemas kini terganggu: ' + mesej, 'err');
        status($('reviewStatus'), 'Data hari ini dipaparkan. Kemas kini terganggu: ' + mesej, 'err');
        $('retryBtn').hidden = false;
        $('reviewRetryBtn').hidden = false;
        return;
      }
      status($('publicStatus'), mesej, 'err');
      status($('reviewStatus'), mesej, 'err');
      $('retryBtn').hidden = false;
      $('reviewRetryBtn').hidden = false;
      $('classSelect').disabled = true;
      $('emptyState').querySelector('h2').textContent = 'Tidak dapat memuatkan';
      $('emptyState').querySelector('p').textContent = 'Semak sambungan internet dan cuba semula.';
    });
  }

  function simpanKehadiran() {
    if (!state.kelas || state.sedangSimpan || !navigator.onLine) return;
    state.sedangSimpan = true;
    var siap = mulaButang($('saveAttendanceBtn'), 'Menyimpan…');
    var tarikhSimpan = state.tarikhEditIso || (state.data && state.data.tarikhIso) || '';
    var simpanHariIni = state.data && tarikhSimpan === state.data.tarikhIso;
    panggil('simpanKehadiran', [state.kelas.nama, Array.from(state.tidakHadir), state.token || '', tarikhSimpan], 45000)
      .then(function (r) {
        $('saveHint').textContent = 'Disimpan ' + (r.masa || 'sekarang');
        state.kelas.sudahSimpan = true;
        state.kelas.tidakHadir = state.tidakHadir.size;
        state.kelas.rmtHadir = Number(r.rmtHadir || 0);
        state.kelas.rmtJumlah = Number(r.rmtJumlah || 0);
        (state.kelas.murid || []).forEach(function (m) {
          m.nilai = state.tidakHadir.has(teks(m.kunci)) ? 0 : 1;
        });
        kemasKiniRmtHariIni();
        if (simpanHariIni && state.reviewData && state.data && state.reviewData.tarikhIso === state.data.tarikhIso) {
          state.reviewData = state.data;
        }
        if (simpanHariIni) {
          simpanCacheInit_(state.data);
          lukisSemakan();
        } else {
          muatSemakanTarikh();
        }
      }).catch(function (err) {
        $('saveHint').textContent = 'Gagal: ' + err.message;
      }).finally(function () {
        state.sedangSimpan = false;
        siap();
      });
  }

  function setSemula() {
    if (!state.kelas) return;
    state.tidakHadir = tidakHadirAsal_(state.kelas.murid);
    $('saveHint').textContent = 'Kembali kepada rekod disimpan';
    kemasKiniRmtHariIni();
    lukisMuridKelas();
  }

  function bukaDialogAdmin() {
    tutupMenu();
    $('adminPin').value = '';
    status($('adminLoginStatus'), '', '');
    $('adminLoginDialog').showModal();
    setTimeout(function () { $('adminPin').focus(); }, 50);
  }

  function loginAdmin(e) {
    e.preventDefault();
    var siap = mulaButang($('adminLoginBtn'), 'Memeriksa…');
    status($('adminLoginStatus'), '', '');
    panggil('login', ['admin', $('adminPin').value]).then(function (r) {
      if (!r || !r.token) throw new Error('Log masuk tidak berjaya.');
      state.token = r.token;
      sessionStorage.setItem('hadir_admin_token', r.token);
      return panggil('init', [state.token]);
    }).then(function (data) {
      simpanCacheInit_(data);
      bukaAplikasi(data);
      $('adminLoginDialog').close();
      bukaPane('studentsPane');
    }).catch(function (err) {
      status($('adminLoginStatus'), err.message, 'err');
    }).finally(siap);
  }

  function logoutAdmin() {
    var token = state.token;
    state.token = '';
    state.peranan = 'guru';
    state.murid = [];
    state.muridDialog = null;
    sessionStorage.removeItem('hadir_admin_token');
    tetapkanModAdmin(false);
    bukaPane('reviewPane');
    tutupMenu();
    if (token) panggil('logout', [token], 8000).catch(function () {});
  }

  function bukaPane(id) {
    if (id !== 'attendancePane' && id !== 'reviewPane' && !state.token) {
      bukaDialogAdmin();
      return;
    }
    state.paneAktif = id;
    ['attendancePane', 'reviewPane', 'studentSettingsPane', 'teacherSettingsPane', 'studentsPane', 'syncPane'].forEach(function (x) { $(x).hidden = x !== id; });
    document.querySelectorAll('.menu-link[data-pane]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.pane === id);
    });
    tutupMenu();
    if (id === 'studentsPane') muatMuridAdmin();
    if (id === 'studentSettingsPane') muatTetapanMurid();
    if (id === 'teacherSettingsPane') muatGuruAdmin();
    if (id === 'reviewPane') {
      state.versiSemakan++;
      state.reviewData = state.data;
      state.tarikhEditIso = state.data && state.data.tarikhIso ? state.data.tarikhIso : '';
      $('reviewDateSelect').disabled = false;
      $('reviewDateSelect').value = state.tarikhEditIso;
      $('reviewDate').textContent = state.data && (state.data.tarikhPaparan || state.data.tarikh)
        ? (state.data.tarikhPaparan || state.data.tarikh) : 'Hari ini';
      $('attendanceDateLabel').textContent = 'KEHADIRAN HARI INI';
      status($('publicStatus'), '', '');
      lukisPilihanSemakan();
    }
  }

  function muatMuridAdmin() {
    status($('studentAdminStatus'), 'Memuatkan data murid…', '');
    panggil('senaraiMurid', [state.token]).then(function (r) {
      state.murid = r || [];
      status($('studentAdminStatus'), state.murid.length + ' rekod murid', 'ok');
      lukisMuridAdmin();
    }).catch(function (e) {
      status($('studentAdminStatus'), e.message, 'err');
    });
  }

  function lukisMuridAdmin() {
    var q = norm($('studentAdminSearch').value), box = $('studentAdminList');
    box.textContent = '';
    state.murid.filter(function (m) {
      return !q || [m.nama, m.ic, m.namaKelas, m.tahun, m.statusPengajian].some(function (x) {
        return norm(x).indexOf(q) > -1;
      });
    }).forEach(function (m) {
      var row = el('button', 'admin-item admin-item-button'), copy = el('span');
      row.type = 'button';
      copy.appendChild(el('strong', '', m.nama));
      copy.appendChild(el('small', '', [labelKelasMurid(m), labelJantina(m.jantina), m.statusPengajian, m.icAkhir ? '•••• ' + m.icAkhir : ''].filter(Boolean).join(' · ')));
      row.appendChild(copy);
      row.appendChild(el('span', 'row-chevron', '›'));
      row.addEventListener('click', function () { bukaDialogMurid(m); });
      box.appendChild(row);
    });
  }

  function labelKelasMurid(m) {
    var nilai = teks(m && (m.kelasLengkap || ((m.tahunKod || m.tahun) + ' ' + (m.namaKelas || '')))).trim();
    if (!nilai) return '';
    if (norm(nilai).indexOf('PRASEKOLAH') >= 0) return 'Prasekolah';
    return nilai.toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function labelJantina(kod) {
    return kod === 'L' ? 'Lelaki' : kod === 'P' ? 'Perempuan' : '';
  }

  function muridAktif(m) {
    return !/(BERPINDAH|TIDAK AKTIF|BERHENTI|TAMAT)/.test(norm(m.statusPengajian));
  }

  function muatTetapanMurid() {
    status($('studentSettingsStatus'), 'Memuatkan tetapan murid…', '');
    panggil('senaraiMurid', [state.token]).then(function (r) {
      state.murid = r || [];
      lukisPilihanKelasTetapan();
      status($('studentSettingsStatus'), '', '');
    }).catch(function (e) {
      status($('studentSettingsStatus'), e.message, 'err');
    });
  }

  function lukisPilihanKelasTetapan() {
    var select = $('settingsClassSelect');
    var semasa = select.value;
    var kelas = [];
    state.murid.filter(muridAktif).forEach(function (m) {
      var nama = m.kelasLengkap || binaKelasPaparan(m);
      if (nama && kelas.indexOf(nama) < 0) kelas.push(nama);
    });
    kelas.sort(function (a, b) {
      var na = parseInt(a, 10) || 99, nb = parseInt(b, 10) || 99;
      return na - nb || a.localeCompare(b);
    });
    select.textContent = '';
    kelas.forEach(function (nama) {
      var option = el('option', '', teks(nama).toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); }));
      option.value = nama;
      select.appendChild(option);
    });
    select.value = kelas.indexOf(semasa) >= 0 ? semasa : (kelas[0] || '');
    lukisTetapanMurid();
  }

  function binaKelasPaparan(m) {
    return norm((m.tahunKod || m.tahun || '') + ' ' + (m.namaKelas || '')).trim();
  }

  function lukisTetapanMurid() {
    var kelas = $('settingsClassSelect').value;
    var box = $('studentSettingsList');
    box.textContent = '';
    var senarai = state.murid.filter(function (m) {
      return muridAktif(m) && (m.kelasLengkap || binaKelasPaparan(m)) === kelas;
    });
    senarai.forEach(function (m) {
      var row = el('button', 'admin-item admin-item-button settings-item');
      row.type = 'button';
      var copy = el('span');
      copy.appendChild(el('strong', '', m.nama));
      copy.appendChild(el('small', '', labelKelasMurid(m)));
      row.appendChild(copy);
      var badges = el('span', 'settings-badges');
      if (m.rmt) badges.appendChild(el('span', 'mini-tag rmt-tag', 'RMT'));
      badges.appendChild(el('span', 'mini-tag', teks(m.jawatan || 'MURID BIASA').toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); })));
      row.appendChild(badges);
      row.addEventListener('click', function () { bukaDialogTetapanMurid(m); });
      box.appendChild(row);
    });
    if (!senarai.length) box.appendChild(el('div', 'empty-review', 'Tiada murid aktif dalam kelas ini.'));
  }

  function bukaDialogTetapanMurid(m) {
    state.muridDialog = m;
    $('settingsStudentIc').value = m.ic || '';
    $('settingsStudentName').textContent = m.nama || 'Murid';
    $('settingsStudentClass').textContent = labelKelasMurid(m);
    $('settingsStudentRmt').checked = !!m.rmt;
    $('settingsStudentRole').value = m.jawatan || 'MURID BIASA';
    status($('studentSettingsFormStatus'), '', '');
    $('studentSettingsDialog').showModal();
  }

  function simpanTetapanMurid(e) {
    e.preventDefault();
    if (!state.muridDialog) return;
    var siap = mulaButang($('saveStudentSettingsBtn'), 'Menyimpan…');
    var tetapan = {
      ic: $('settingsStudentIc').value,
      rmt: $('settingsStudentRmt').checked,
      jawatan: $('settingsStudentRole').value
    };
    panggil('simpanTetapanMurid', [tetapan, state.token], 45000).then(function (r) {
      state.muridDialog.rmt = !!r.rmt;
      state.muridDialog.jawatan = r.jawatan || 'MURID BIASA';
      lukisTetapanMurid();
      status($('studentSettingsFormStatus'), r.mesej || 'Tetapan berjaya disimpan.', 'ok');
      setTimeout(function () { $('studentSettingsDialog').close(); }, 500);
    }).catch(function (err) {
      status($('studentSettingsFormStatus'), err.message, 'err');
    }).finally(siap);
  }

  function muatGuruAdmin() {
    status($('teacherSettingsStatus'), 'Memuatkan senarai guru…', '');
    panggil('senaraiGuru', [state.token]).then(function (r) {
      state.guru = Array.isArray(r) ? r : [];
      status($('teacherSettingsStatus'), state.guru.length + ' rekod guru', 'ok');
      lukisGuruAdmin();
    }).catch(function (e) {
      status($('teacherSettingsStatus'), e.message, 'err');
    });
  }

  function lukisGuruAdmin() {
    var q = norm($('teacherSearch').value), box = $('teacherList');
    box.textContent = '';
    var senarai = state.guru.filter(function (g) {
      return !q || norm(g.nama).indexOf(q) > -1 || norm(g.jawatan).indexOf(q) > -1;
    });
    senarai.forEach(function (g) {
      var row = el('div', 'admin-item teacher-item');
      var copy = el('span');
      copy.appendChild(el('strong', '', g.nama));
      copy.appendChild(el('small', '', g.jawatan || 'Jawatan belum ditetapkan'));
      row.appendChild(copy);
      row.appendChild(el('span', 'mini-tag teacher-tag', 'Guru'));
      box.appendChild(row);
    });
    if (!senarai.length) {
      box.appendChild(el('div', 'empty-review', q ? 'Tiada guru sepadan dengan carian.' : 'Senarai guru masih kosong.'));
    }
  }

  function bukaDialogGuru() {
    $('teacherName').value = '';
    $('teacherRole').value = '';
    status($('teacherFormStatus'), '', '');
    $('teacherDialog').showModal();
    setTimeout(function () { $('teacherName').focus(); }, 30);
  }

  function simpanGuru(e) {
    e.preventDefault();
    var rekod = { nama: $('teacherName').value.trim(), jawatan: $('teacherRole').value.trim() };
    if (!rekod.nama) {
      status($('teacherFormStatus'), 'Nama guru diperlukan.', 'err');
      return;
    }
    var siap = mulaButang($('saveTeacherBtn'), 'Menyimpan…');
    status($('teacherFormStatus'), 'Menyimpan dan menyelaraskan semua aplikasi…', '');
    panggil('simpanGuru', [rekod, state.token], 120000).then(function (r) {
      status($('teacherFormStatus'), r.mesej || 'Guru berjaya disimpan.', r.syncOk === false ? 'err' : 'ok');
      return panggil('senaraiGuru', [state.token]);
    }).then(function (senarai) {
      state.guru = Array.isArray(senarai) ? senarai : [];
      lukisGuruAdmin();
      status($('teacherSettingsStatus'), state.guru.length + ' rekod guru', 'ok');
      setTimeout(function () { $('teacherDialog').close(); }, 800);
    }).catch(function (err) {
      status($('teacherFormStatus'), err.message, 'err');
    }).finally(siap);
  }

  function rekodGuruDaripadaCsv(matrix) {
    var aliasNama = ['NAMA GURU', 'NAMA', 'NAMA PENUH', 'TEACHER NAME'];
    var aliasJawatan = ['JAWATAN', 'PERANAN', 'JAWATAN GURU', 'ROLE'];
    var barisTajuk = -1, indeksNama = -1, indeksJawatan = -1;
    for (var i = 0; i < Math.min(matrix.length, 30); i++) {
      var kepala = (matrix[i] || []).map(normHeaderCsv);
      indeksNama = kepala.findIndex(function (h) { return aliasNama.indexOf(h) > -1; });
      if (indeksNama >= 0) {
        indeksJawatan = kepala.findIndex(function (h) { return aliasJawatan.indexOf(h) > -1; });
        barisTajuk = i;
        break;
      }
    }
    if (barisTajuk < 0) throw new Error('Baris tajuk tidak ditemui. Gunakan lajur NAMA GURU atau NAMA.');
    var hasil = [], dilihat = Object.create(null);
    for (var r = barisTajuk + 1; r < matrix.length; r++) {
      var row = matrix[r] || [];
      var nama = teks(row[indeksNama]).trim().replace(/\s+/g, ' ');
      var jawatan = indeksJawatan >= 0 ? teks(row[indeksJawatan]).trim().replace(/\s+/g, ' ') : '';
      var kunci = norm(nama);
      if (!nama || dilihat[kunci]) continue;
      dilihat[kunci] = true;
      hasil.push({ nama: nama, jawatan: jawatan });
    }
    if (!hasil.length) throw new Error('Tiada nama guru yang sah ditemui dalam fail.');
    if (hasil.length > 1000) throw new Error('Fail melebihi had 1,000 rekod guru.');
    return hasil;
  }

  function bukaDialogUploadGuru() {
    state.guruUploadRecords = [];
    state.guruUploadFileName = '';
    $('teacherCsvFile').value = '';
    $('teacherUploadSummary').hidden = true;
    $('teacherUploadSummary').textContent = '';
    $('confirmTeacherUploadBtn').disabled = true;
    status($('teacherUploadStatus'), '', '');
    $('teacherUploadDialog').showModal();
  }

  function bacaFailUploadGuru() {
    var fail = $('teacherCsvFile').files && $('teacherCsvFile').files[0];
    state.guruUploadRecords = [];
    $('confirmTeacherUploadBtn').disabled = true;
    $('teacherUploadSummary').hidden = true;
    if (!fail) return;
    if (fail.size > 4 * 1024 * 1024) {
      status($('teacherUploadStatus'), 'Fail terlalu besar. Had maksimum ialah 4 MB.', 'err');
      return;
    }
    status($('teacherUploadStatus'), 'Membaca fail CSV…', '');
    fail.text().then(function (text) {
      var rekod = rekodGuruDaripadaCsv(huraiCsv(text, kesanPemisahCsv(text)));
      state.guruUploadRecords = rekod;
      state.guruUploadFileName = fail.name;
      $('teacherUploadSummary').textContent = fail.name + ' · ' + rekod.length + ' rekod guru sah';
      $('teacherUploadSummary').hidden = false;
      $('confirmTeacherUploadBtn').disabled = false;
      status($('teacherUploadStatus'), 'Fail sedia. Import ini tidak memadam rekod sedia ada.', 'ok');
    }).catch(function (err) {
      status($('teacherUploadStatus'), err.message || 'Fail CSV tidak dapat dibaca.', 'err');
    });
  }

  function uploadGuruCsv(e) {
    e.preventDefault();
    if (!state.guruUploadRecords.length) return;
    var siap = mulaButang($('confirmTeacherUploadBtn'), 'Mengimport…');
    status($('teacherUploadStatus'), 'Menggabungkan senarai dan menyelaraskan AKSI serta SEMAK…', '');
    panggil('uploadGuruCsv', [{ records: state.guruUploadRecords }, state.token], 150000).then(function (r) {
      status($('teacherUploadStatus'), r.mesej || 'Senarai guru berjaya diimport.', r.syncOk === false ? 'err' : 'ok');
      return panggil('senaraiGuru', [state.token]);
    }).then(function (senarai) {
      state.guru = Array.isArray(senarai) ? senarai : [];
      lukisGuruAdmin();
      status($('teacherSettingsStatus'), state.guru.length + ' rekod guru', 'ok');
      setTimeout(function () { $('teacherUploadDialog').close(); }, 900);
    }).catch(function (err) {
      status($('teacherUploadStatus'), err.message, 'err');
    }).finally(siap);
  }

  function syncGuru() {
    var siap = mulaButang($('syncTeachersBtn'), 'Menyelaras…');
    status($('teacherSettingsStatus'), 'Menyelaraskan guru ke AKSI dan SEMAK…', '');
    panggil('syncGuru', [state.token], 120000).then(function (r) {
      var ayat = (r.ditarik ? r.ditarik + ' guru sedia ada ditarik daripada AKSI/SEMAK · ' : '') +
        (r.aksi && r.aksi.mesej ? 'AKSI: ' + r.aksi.mesej : 'AKSI selesai') + ' · ' +
        (r.semak && r.semak.mesej ? 'SEMAK: ' + r.semak.mesej : 'SEMAK selesai');
      status($('teacherSettingsStatus'), ayat, r.ok ? 'ok' : 'err');
    }).catch(function (err) {
      status($('teacherSettingsStatus'), err.message, 'err');
    }).finally(siap);
  }

  var aliasCsvMurid = {
    idMurid: ['ID MURID', 'IDMURID', 'ID PELAJAR'],
    nama: ['NAMA', 'NAMA MURID', 'NAMAMURID', 'NAMA PELAJAR'],
    ic: ['NO PENGENALAN', 'NO KAD PENGENALAN', 'NO KP', 'NOKP', 'IC', 'MYKID', 'NO MYKID'],
    jenisPengenalan: ['JENIS PENGENALAN', 'JENIS ID'],
    tarikhLahir: ['TARIKH LAHIR', 'DOB'],
    statusPengajian: ['STATUS PENGAJIAN', 'STATUS'],
    tarikhMasukSekolah: ['TARIKH MASUK SEKOLAH'],
    tarikhMasukKelas: ['TARIKH MASUK KELAS'],
    tahun: ['TAHUN TINGKATAN', 'TAHUN', 'TINGKATAN'],
    namaKelas: ['NAMA KELAS'],
    kelas: ['KELAS', 'KELAS GABUNGAN']
  };

  function normHeaderCsv(v) {
    return teks(v).replace(/^\uFEFF/, '').toUpperCase().replace(/[._/\\-]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function kesanPemisahCsv(text) {
    var baris = (text.split(/\r?\n/)[0] || '');
    return (baris.match(/;/g) || []).length > (baris.match(/,/g) || []).length ? ';' : ',';
  }

  function huraiCsv(text, pemisah) {
    var hasil = [], row = [], nilai = '', quote = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i], seterusnya = text[i + 1];
      if (c === '"' && quote && seterusnya === '"') { nilai += '"'; i++; }
      else if (c === '"') quote = !quote;
      else if (c === pemisah && !quote) { row.push(nilai); nilai = ''; }
      else if ((c === '\n' || c === '\r') && !quote) {
        if (c === '\r' && seterusnya === '\n') i++;
        row.push(nilai); hasil.push(row); row = []; nilai = '';
      } else nilai += c;
    }
    if (nilai || row.length) { row.push(nilai); hasil.push(row); }
    return hasil;
  }

  function rekodDaripadaCsv(matrix) {
    var barisTajuk = -1;
    for (var i = 0; i < Math.min(matrix.length, 30); i++) {
      var calon = (matrix[i] || []).map(normHeaderCsv);
      var adaNama = calon.some(function (h) { return aliasCsvMurid.nama.indexOf(h) > -1; });
      var adaId = calon.some(function (h) { return aliasCsvMurid.ic.indexOf(h) > -1 || aliasCsvMurid.idMurid.indexOf(h) > -1; });
      if (adaNama && adaId) { barisTajuk = i; break; }
    }
    if (barisTajuk < 0) throw new Error('Baris tajuk tidak ditemui. Pastikan fail mempunyai lajur NAMA dan IC/ID MURID.');
    var kepala = (matrix[barisTajuk] || []).map(normHeaderCsv);
    var peta = {};
    Object.keys(aliasCsvMurid).forEach(function (kunci) {
      peta[kunci] = kepala.findIndex(function (h) { return aliasCsvMurid[kunci].indexOf(h) > -1; });
    });
    function cell(row, idx) { return idx >= 0 ? teks(row[idx]).trim() : ''; }
    var rekod = [];
    for (var r = barisTajuk + 1; r < matrix.length; r++) {
      var row = matrix[r] || [];
      var item = {
        idMurid: cell(row, peta.idMurid), nama: cell(row, peta.nama), ic: cell(row, peta.ic),
        jenisPengenalan: cell(row, peta.jenisPengenalan), tarikhLahir: cell(row, peta.tarikhLahir),
        statusPengajian: cell(row, peta.statusPengajian), tarikhMasukSekolah: cell(row, peta.tarikhMasukSekolah),
        tarikhMasukKelas: cell(row, peta.tarikhMasukKelas), tahun: cell(row, peta.tahun),
        namaKelas: cell(row, peta.namaKelas), kelas: cell(row, peta.kelas), semua: {}
      };
      kepala.forEach(function (h, ci) { if (h) item.semua[h] = cell(row, ci); });
      if (item.nama && (item.ic || item.idMurid)) rekod.push(item);
    }
    if (!rekod.length) throw new Error('Tiada rekod murid yang sah ditemui dalam fail.');
    return { records: rekod, kepala: kepala };
  }

  function bukaDialogUploadMurid() {
    state.uploadRecords = [];
    state.uploadHeaders = [];
    state.uploadFileName = '';
    $('studentCsvFile').value = '';
    $('studentUploadMode').value = 'sync';
    $('studentUploadSummary').hidden = true;
    $('studentUploadSummary').textContent = '';
    $('confirmStudentUploadBtn').disabled = true;
    status($('studentUploadStatus'), '', '');
    $('studentUploadDialog').showModal();
  }

  function bacaFailUploadMurid() {
    var fail = $('studentCsvFile').files && $('studentCsvFile').files[0];
    state.uploadRecords = [];
    state.uploadHeaders = [];
    $('confirmStudentUploadBtn').disabled = true;
    $('studentUploadSummary').hidden = true;
    if (!fail) return;
    if (fail.size > 8 * 1024 * 1024) {
      status($('studentUploadStatus'), 'Fail terlalu besar. Had maksimum ialah 8 MB.', 'err');
      return;
    }
    status($('studentUploadStatus'), 'Membaca fail CSV…', '');
    fail.text().then(function (text) {
      var parsed = rekodDaripadaCsv(huraiCsv(text, kesanPemisahCsv(text)));
      state.uploadRecords = parsed.records;
      state.uploadHeaders = parsed.kepala;
      state.uploadFileName = fail.name;
      $('studentUploadSummary').textContent = fail.name + ' · ' + parsed.records.length + ' rekod murid sah';
      $('studentUploadSummary').hidden = false;
      $('confirmStudentUploadBtn').disabled = false;
      status($('studentUploadStatus'), 'Fail sedia. Semak kaedah kemas kini sebelum meneruskan.', 'ok');
    }).catch(function (err) {
      status($('studentUploadStatus'), err.message || 'Fail CSV tidak dapat dibaca.', 'err');
    });
  }

  function uploadMuridCsv(e) {
    e.preventDefault();
    if (!state.uploadRecords.length) return;
    var mode = $('studentUploadMode').value === 'merge' ? 'merge' : 'sync';
    if (mode === 'sync' && !window.confirm('Fail ini akan menjadi senarai murid aktif lengkap. Murid lama yang tiada dalam fail akan diarkibkan. Teruskan?')) return;
    var siap = mulaButang($('confirmStudentUploadBtn'), 'Mengemas kini…');
    status($('studentUploadStatus'), 'Mengemas kini KEHADIRAN dan menyelaraskan AKSI serta SEMAK…', '');
    panggil('uploadMuridCsv', [{ records: state.uploadRecords, mode: mode, kepala: state.uploadHeaders }, state.token], 150000)
      .then(function (r) {
        status($('studentUploadStatus'), r.mesej || 'Data murid berjaya dikemas kini.', r.syncOk === false ? 'err' : 'ok');
        return Promise.all([panggil('senaraiMurid', [state.token]), panggil('init', [state.token])]);
      }).then(function (hasil) {
        state.murid = hasil[0] || [];
        lukisMuridAdmin();
        simpanCacheInit_(hasil[1]);
        bukaAplikasi(hasil[1]);
        status($('studentAdminStatus'), state.murid.length + ' rekod murid', 'ok');
        setTimeout(function () { $('studentUploadDialog').close(); }, 900);
      }).catch(function (err) {
        status($('studentUploadStatus'), err.message, 'err');
      }).finally(siap);
  }

  function bukaDialogMurid(m) {
    m = m || {};
    state.muridDialog = m;
    $('dialogTitle').textContent = 'Maklumat murid';
    $('studentOriginalIc').value = m.ic || '';
    $('studentName').value = m.nama || '';
    $('studentIc').value = m.ic || '';
    $('studentId').value = m.idMurid || '';
    $('studentYear').value = m.tahunKod || m.tahun || '';
    $('studentClass').value = m.namaKelas || '';
    $('studentGender').value = m.jantina || '';
    $('studentStatus').value = m.statusPengajian || 'BERSEKOLAH';
    status($('studentFormStatus'), '', '');
    tetapkanEditMurid(false);
    $('studentDialog').showModal();
  }

  function tetapkanEditMurid(aktif) {
    ['studentName', 'studentIc', 'studentId', 'studentClass'].forEach(function (id) {
      $(id).readOnly = !aktif;
    });
    ['studentYear', 'studentGender', 'studentStatus'].forEach(function (id) {
      $(id).disabled = !aktif;
    });
    $('editStudentBtn').hidden = !!aktif;
    $('saveStudentBtn').disabled = !aktif;
    $('studentForm').classList.toggle('editing', !!aktif);
    if (aktif) {
      $('dialogTitle').textContent = 'Edit murid';
      $('studentName').focus();
    } else {
      $('dialogTitle').textContent = 'Maklumat murid';
    }
  }

  function simpanMurid(e) {
    e.preventDefault();
    var rekod = {
      originalIc: $('studentOriginalIc').value.trim(), nama: $('studentName').value.trim(), ic: $('studentIc').value.trim(),
      idMurid: $('studentId').value.trim(), tahun: $('studentYear').value, namaKelas: $('studentClass').value.trim(),
      jantina: $('studentGender').value, statusPengajian: $('studentStatus').value
    };
    if (!rekod.nama || !rekod.ic) {
      status($('studentFormStatus'), 'Nama dan IC/MyKid diperlukan.', 'err');
      return;
    }
    var siap = mulaButang($('saveStudentBtn'), 'Menyimpan…');
    panggil('simpanMurid', [rekod, state.token], 90000).then(function (r) {
      status($('studentFormStatus'), r.mesej || 'Murid disimpan dan diselaraskan.', r.syncOk === false ? 'err' : 'ok');
      return panggil('senaraiMurid', [state.token]);
    }).then(function (senarai) {
      state.murid = senarai || [];
      lukisMuridAdmin();
      setTimeout(function () { $('studentDialog').close(); }, 650);
      return panggil('init', [state.token]);
    }).then(function (data) {
      simpanCacheInit_(data);
      bukaAplikasi(data);
    }).catch(function (err) {
      status($('studentFormStatus'), err.message, 'err');
    }).finally(siap);
  }

  function syncSemua() {
    var siap = mulaButang($('syncAllBtn'), 'Menyelaraskan…');
    status($('syncStatus'), 'Mengemas kini AKSI dan SEMAK…', '');
    panggil('syncSemua', [state.token], 120000).then(function (r) {
      var ayat = (r.aksi && r.aksi.mesej ? 'AKSI: ' + r.aksi.mesej : 'AKSI selesai') + ' · ' +
        (r.semak && r.semak.mesej ? 'SEMAK: ' + r.semak.mesej : 'SEMAK selesai');
      status($('syncStatus'), ayat, r.ok ? 'ok' : 'err');
    }).catch(function (e) {
      status($('syncStatus'), e.message, 'err');
    }).finally(siap);
  }

  function bukaMenu() {
    $('sidebar').classList.add('open');
    $('scrim').hidden = false;
    $('menuBtn').setAttribute('aria-expanded', 'true');
  }
  function tutupMenu() {
    $('sidebar').classList.remove('open');
    $('scrim').hidden = true;
    $('menuBtn').setAttribute('aria-expanded', 'false');
  }
  function sambungan() {
    var offline = !navigator.onLine;
    $('offlineBar').hidden = !offline;
    $('syncBadge').textContent = offline ? '● Luar talian' : '● Sedia';
    $('syncBadge').style.color = offline ? '#ffd166' : '#8be0bd';
    $('saveAttendanceBtn').disabled = offline;
  }

  function daftarPwa() {
    if (!('serviceWorker' in navigator)) return;
    document.documentElement.dataset.pwaStatus = 'mendaftar';
    navigator.serviceWorker.register('./service-worker.js', { scope: './', updateViaCache: 'none' }).then(function (reg) {
      document.documentElement.dataset.pwaStatus = 'didaftar';
      navigator.serviceWorker.ready.then(function () { document.documentElement.dataset.pwaStatus = 'sedia'; });
      reg.update().catch(function () {});
    }).catch(function () { document.documentElement.dataset.pwaStatus = 'gagal'; });
  }

  $('menuBtn').addEventListener('click', bukaMenu);
  $('closeMenuBtn').addEventListener('click', tutupMenu);
  $('scrim').addEventListener('click', tutupMenu);
  $('classSelect').addEventListener('change', function () {
    var namaKelas = $('classSelect').value;
    var hariIni = state.data && state.tarikhEditIso === state.data.tarikhIso;
    if (!hariIni) {
      muatKehadiranTarikh_(namaKelas, state.tarikhEditIso,
        state.kelas && state.kelas.tarikhPaparan ? state.kelas.tarikhPaparan : state.tarikhEditIso);
      return;
    }
    pilihKelas((state.data.kelas || []).find(function (k) { return k.nama === namaKelas; }));
  });
  $('studentSearch').addEventListener('input', lukisMuridKelas);
  $('reviewClassSelect').addEventListener('change', lukisSemakan);
  $('reviewDateSelect').addEventListener('change', muatSemakanTarikh);
  $('saveAttendanceBtn').addEventListener('click', simpanKehadiran);
  $('resetBtn').addEventListener('click', setSemula);
  $('retryBtn').addEventListener('click', muatAwal);
  $('reviewRetryBtn').addEventListener('click', muatAwal);
  $('adminLoginMenu').addEventListener('click', bukaDialogAdmin);
  $('adminLoginForm').addEventListener('submit', loginAdmin);
  $('adminLogoutMenu').addEventListener('click', logoutAdmin);
  $('studentAdminSearch').addEventListener('input', lukisMuridAdmin);
  $('uploadStudentsBtn').addEventListener('click', bukaDialogUploadMurid);
  $('studentCsvFile').addEventListener('change', bacaFailUploadMurid);
  $('studentUploadForm').addEventListener('submit', uploadMuridCsv);
  $('studentForm').addEventListener('submit', simpanMurid);
  $('editStudentBtn').addEventListener('click', function () { tetapkanEditMurid(true); });
  $('settingsClassSelect').addEventListener('change', lukisTetapanMurid);
  $('studentSettingsForm').addEventListener('submit', simpanTetapanMurid);
  $('teacherSearch').addEventListener('input', lukisGuruAdmin);
  $('addTeacherBtn').addEventListener('click', bukaDialogGuru);
  $('uploadTeachersBtn').addEventListener('click', bukaDialogUploadGuru);
  $('syncTeachersBtn').addEventListener('click', syncGuru);
  $('teacherForm').addEventListener('submit', simpanGuru);
  $('teacherCsvFile').addEventListener('change', bacaFailUploadGuru);
  $('teacherUploadForm').addEventListener('submit', uploadGuruCsv);
  $('syncAllBtn').addEventListener('click', syncSemua);
  document.querySelectorAll('.cancel-admin-login').forEach(function (b) {
    b.addEventListener('click', function () { $('adminLoginDialog').close(); });
  });
  document.querySelectorAll('.cancel-student-dialog').forEach(function (b) {
    b.addEventListener('click', function () { $('studentDialog').close(); });
  });
  document.querySelectorAll('.cancel-student-upload').forEach(function (b) {
    b.addEventListener('click', function () { $('studentUploadDialog').close(); });
  });
  document.querySelectorAll('.cancel-student-settings').forEach(function (b) {
    b.addEventListener('click', function () { $('studentSettingsDialog').close(); });
  });
  document.querySelectorAll('.cancel-teacher-dialog').forEach(function (b) {
    b.addEventListener('click', function () { $('teacherDialog').close(); });
  });
  document.querySelectorAll('.cancel-teacher-upload').forEach(function (b) {
    b.addEventListener('click', function () { $('teacherUploadDialog').close(); });
  });
  document.querySelectorAll('.menu-link[data-pane]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.dataset.pane === 'attendancePane') bukaKehadiranHariIni_();
      else bukaPane(b.dataset.pane);
    });
  });
  window.addEventListener('online', sambungan);
  window.addEventListener('offline', sambungan);
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape') tutupMenu(); });

  $('menuBtn').setAttribute('aria-expanded', 'false');
  $('sideVersion').textContent = cfg.versi || 'HADIR v1.8.1';
  sambungan();
  daftarPwa();
  muatAwal();

  window.HADIR_UTIL = {
    norm: norm, teks: teks,
    huraiCsv: huraiCsv, rekodDaripadaCsv: rekodDaripadaCsv,
    rekodGuruDaripadaCsv: rekodGuruDaripadaCsv
  };
})();
