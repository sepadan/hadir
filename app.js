(function () {
  'use strict';

  var cfg = window.HADIR_CONFIG || {};
  var state = {
    token: '', peranan: 'guru', data: null, kelas: null,
    tidakHadir: new Set(), murid: [], sedangSimpan: false
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
      throw e;
    });
  }

  function tetapkanModAdmin(aktif) {
    state.peranan = aktif ? 'admin' : 'guru';
    $('adminLoginMenu').hidden = aktif;
    $('adminMenu').hidden = !aktif;
    $('roleLabel').textContent = aktif ? 'Mod admin' : 'Mod guru · tanpa log masuk';
  }

  function bukaAplikasi(data) {
    var kelasSemasa = state.kelas && state.kelas.nama;
    state.data = data || { kelas: [] };
    tetapkanModAdmin(state.data.peranan === 'admin' && !!state.token);
    $('topDate').textContent = state.data.tarikhPaparan || state.data.tarikh || 'Hari ini';
    lukisPilihanKelas(kelasSemasa);
    status($('publicStatus'), '', '');
    $('retryBtn').hidden = true;
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

  function pilihKelas(kelas) {
    if (!kelas) return;
    state.kelas = kelas;
    state.tidakHadir = new Set((kelas.murid || []).filter(function (m) {
      return Number(m.nilai) === 0;
    }).map(function (m) { return teks(m.kunci); }));
    $('emptyState').hidden = true;
    $('attendanceView').hidden = false;
    $('classSelect').value = kelas.nama;
    $('classTitle').textContent = kelas.nama;
    $('classAvatar').textContent = (kelas.nama.match(/\d+/) || [kelas.nama.slice(0, 2)])[0];
    $('studentSearch').value = '';
    $('saveHint').textContent = kelas.sudahSimpan ? 'Rekod semasa dimuat' : 'Belum disimpan';
    lukisMuridKelas();
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
          lukisMuridKelas();
        });
        box.appendChild(btn);
      });
    $('classSummary').textContent = semua.length + ' murid';
    $('absentCount').textContent = state.tidakHadir.size + ' tidak hadir';
  }

  function muatAwal() {
    status($('publicStatus'), 'Memuatkan senarai kelas…', '');
    $('retryBtn').hidden = true;
    var tokenSimpan = sessionStorage.getItem('hadir_admin_token') || '';
    state.token = tokenSimpan;
    var cubaan = tokenSimpan ? panggil('init', [tokenSimpan]) : panggil('init', []);
    cubaan.catch(function () {
      if (!tokenSimpan) throw new Error('Gagal memuatkan data kehadiran.');
      state.token = '';
      sessionStorage.removeItem('hadir_admin_token');
      return panggil('init', []);
    }).then(bukaAplikasi).catch(function (err) {
      status($('publicStatus'), err.message, 'err');
      $('retryBtn').hidden = false;
      $('classSelect').disabled = true;
      $('emptyState').querySelector('h2').textContent = 'Tidak dapat memuatkan';
      $('emptyState').querySelector('p').textContent = 'Semak sambungan internet dan cuba semula.';
    });
  }

  function simpanKehadiran() {
    if (!state.kelas || state.sedangSimpan || !navigator.onLine) return;
    state.sedangSimpan = true;
    var siap = mulaButang($('saveAttendanceBtn'), 'Menyimpan…');
    panggil('simpanKehadiran', [state.kelas.nama, Array.from(state.tidakHadir), state.token || ''], 45000)
      .then(function (r) {
        $('saveHint').textContent = 'Disimpan ' + (r.masa || 'sekarang');
        state.kelas.sudahSimpan = true;
        state.kelas.tidakHadir = state.tidakHadir.size;
        (state.kelas.murid || []).forEach(function (m) {
          m.nilai = state.tidakHadir.has(teks(m.kunci)) ? 0 : 1;
        });
      }).catch(function (err) {
        $('saveHint').textContent = 'Gagal: ' + err.message;
      }).finally(function () {
        state.sedangSimpan = false;
        siap();
      });
  }

  function setSemula() {
    if (!state.kelas) return;
    state.tidakHadir = new Set((state.kelas.murid || []).filter(function (m) {
      return Number(m.nilai) === 0;
    }).map(function (m) { return teks(m.kunci); }));
    $('saveHint').textContent = 'Set semula kepada rekod pelayan';
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
    sessionStorage.removeItem('hadir_admin_token');
    tetapkanModAdmin(false);
    bukaPane('attendancePane');
    tutupMenu();
    if (token) panggil('logout', [token], 8000).catch(function () {});
  }

  function bukaPane(id) {
    if (id !== 'attendancePane' && !state.token) {
      bukaDialogAdmin();
      return;
    }
    ['attendancePane', 'studentsPane', 'syncPane'].forEach(function (x) { $(x).hidden = x !== id; });
    document.querySelectorAll('.menu-link[data-pane]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.pane === id);
    });
    tutupMenu();
    if (id === 'studentsPane') muatMuridAdmin();
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
      var row = el('div', 'admin-item'), copy = el('div');
      copy.appendChild(el('strong', '', m.nama));
      copy.appendChild(el('small', '', [m.tahun, m.namaKelas, m.statusPengajian, m.icAkhir ? '•••• ' + m.icAkhir : ''].filter(Boolean).join(' · ')));
      row.appendChild(copy);
      var btn = el('button', '', 'Edit');
      btn.type = 'button';
      btn.addEventListener('click', function () { bukaDialogMurid(m); });
      row.appendChild(btn);
      box.appendChild(row);
    });
  }

  function bukaDialogMurid(m) {
    m = m || {};
    $('dialogTitle').textContent = m.ic ? 'Edit murid' : 'Tambah murid';
    $('studentOriginalIc').value = m.ic || '';
    $('studentName').value = m.nama || '';
    $('studentIc').value = m.ic || '';
    $('studentIc').readOnly = !!m.ic;
    $('studentId').value = m.idMurid || '';
    $('studentYear').value = m.tahun || '';
    $('studentClass').value = m.namaKelas || '';
    $('studentGender').value = m.jantina || '';
    $('studentStatus').value = m.statusPengajian || 'BERSEKOLAH';
    status($('studentFormStatus'), '', '');
    $('studentDialog').showModal();
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
    }).then(bukaAplikasi).catch(function (err) {
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
  }
  function tutupMenu() {
    $('sidebar').classList.remove('open');
    $('scrim').hidden = true;
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
    pilihKelas((state.data.kelas || []).find(function (k) { return k.nama === $('classSelect').value; }));
  });
  $('studentSearch').addEventListener('input', lukisMuridKelas);
  $('saveAttendanceBtn').addEventListener('click', simpanKehadiran);
  $('resetBtn').addEventListener('click', setSemula);
  $('retryBtn').addEventListener('click', muatAwal);
  $('adminLoginMenu').addEventListener('click', bukaDialogAdmin);
  $('adminLoginForm').addEventListener('submit', loginAdmin);
  $('adminLogoutMenu').addEventListener('click', logoutAdmin);
  $('studentAdminSearch').addEventListener('input', lukisMuridAdmin);
  $('addStudentBtn').addEventListener('click', function () { bukaDialogMurid(); });
  $('studentForm').addEventListener('submit', simpanMurid);
  $('syncAllBtn').addEventListener('click', syncSemua);
  document.querySelectorAll('.cancel-admin-login').forEach(function (b) {
    b.addEventListener('click', function () { $('adminLoginDialog').close(); });
  });
  document.querySelectorAll('.cancel-student-dialog').forEach(function (b) {
    b.addEventListener('click', function () { $('studentDialog').close(); });
  });
  document.querySelectorAll('.menu-link[data-pane]').forEach(function (b) {
    b.addEventListener('click', function () { bukaPane(b.dataset.pane); });
  });
  window.addEventListener('online', sambungan);
  window.addEventListener('offline', sambungan);
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape') tutupMenu(); });

  $('sideVersion').textContent = cfg.versi || 'HADIR v1.1.0 · PWA';
  sambungan();
  daftarPwa();
  muatAwal();

  window.HADIR_UTIL = { norm: norm, teks: teks };
})();
