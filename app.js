(function () {
  'use strict';

  var cfg = window.HADIR_CONFIG || {};
  var state = {
    token: '', peranan: '', data: null, kelas: null,
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
    btn.disabled = true; btn.textContent = label;
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

  function bukaAplikasi(data) {
    state.data = data;
    state.peranan = data.peranan || 'guru';
    $('loginView').hidden = true; $('appView').hidden = false;
    $('roleLabel').textContent = state.peranan === 'admin' ? 'Pentadbir' : 'Guru';
    $('studentsNav').hidden = state.peranan !== 'admin';
    $('syncNav').hidden = state.peranan !== 'admin';
    $('topDate').textContent = data.tarikhPaparan || data.tarikh || 'Hari ini';
    lukisKelas();
  }

  function login(e) {
    e.preventDefault();
    var btn = $('loginForm').querySelector('button[type=submit]');
    var siap = mulaButang(btn, 'Memeriksa…');
    status($('loginStatus'), '', '');
    panggil('login', [$('loginRole').value, $('loginPin').value]).then(function (r) {
      if (!r || !r.token) throw new Error('Log masuk tidak berjaya.');
      state.token = r.token;
      sessionStorage.setItem('hadir_token', r.token);
      $('loginPin').value = '';
      return panggil('init', [state.token]);
    }).then(bukaAplikasi).catch(function (err) {
      status($('loginStatus'), err.message, 'err');
    }).finally(siap);
  }

  function pulihSesi() {
    state.token = sessionStorage.getItem('hadir_token') || '';
    if (!state.token) return;
    status($('loginStatus'), 'Memulihkan sesi…', '');
    panggil('init', [state.token]).then(bukaAplikasi).catch(function () {
      state.token = ''; sessionStorage.removeItem('hadir_token');
      status($('loginStatus'), '', '');
    });
  }

  function logout() {
    var token = state.token;
    state = { token: '', peranan: '', data: null, kelas: null, tidakHadir: new Set(), murid: [], sedangSimpan: false };
    sessionStorage.removeItem('hadir_token');
    $('appView').hidden = true; $('loginView').hidden = false;
    $('attendanceView').hidden = true; $('emptyState').hidden = false;
    if (token) panggil('logout', [token], 8000).catch(function () {});
  }

  function lukisKelas() {
    var q = norm($('classSearch').value);
    var box = $('classList'); box.textContent = '';
    (state.data.kelas || []).filter(function (k) { return !q || norm(k.nama).indexOf(q) > -1; })
      .forEach(function (k) {
        var btn = el('button', 'chat-item' + (state.kelas && state.kelas.nama === k.nama ? ' active' : ''));
        btn.type = 'button';
        btn.appendChild(el('div', 'avatar', (k.nama.match(/\d+/) || [k.nama.slice(0, 2)])[0]));
        var copy = el('div', 'chat-copy'); copy.appendChild(el('strong', '', k.nama));
        copy.appendChild(el('small', '', k.jumlah + ' murid · ' + k.tidakHadir + ' tidak hadir'));
        btn.appendChild(copy);
        btn.appendChild(el('span', 'count-pill' + (k.tidakHadir ? ' danger' : ''), teks(k.tidakHadir)));
        btn.addEventListener('click', function () { pilihKelas(k); }); box.appendChild(btn);
      });
  }

  function pilihKelas(kelas) {
    state.kelas = kelas;
    state.tidakHadir = new Set((kelas.murid || []).filter(function (m) { return Number(m.nilai) === 0; }).map(function (m) { return teks(m.ic); }));
    $('emptyState').hidden = true; $('attendanceView').hidden = false;
    $('classTitle').textContent = kelas.nama; $('classAvatar').textContent = (kelas.nama.match(/\d+/) || [kelas.nama.slice(0, 2)])[0];
    $('studentSearch').value = ''; $('saveHint').textContent = kelas.sudahSimpan ? 'Rekod semasa dimuat' : 'Belum disimpan';
    lukisMuridKelas(); lukisKelas(); tutupMenu();
  }

  function lukisMuridKelas() {
    if (!state.kelas) return;
    var q = norm($('studentSearch').value), box = $('studentList'); box.textContent = '';
    var semua = state.kelas.murid || [];
    semua.filter(function (m) { return !q || norm(m.nama).indexOf(q) > -1 || norm(m.ic).indexOf(q) > -1; })
      .forEach(function (m) {
        var ic = teks(m.ic), tiada = state.tidakHadir.has(ic);
        var btn = el('button', 'student-row' + (tiada ? ' absent' : '')); btn.type = 'button';
        btn.appendChild(el('span', 'mini-avatar', norm(m.nama).charAt(0) || '?'));
        var copy = el('span', 'student-copy'); copy.appendChild(el('strong', '', m.nama)); copy.appendChild(el('small', '', m.icAkhir ? '•••• ' + m.icAkhir : state.kelas.nama)); btn.appendChild(copy);
        btn.appendChild(el('span', 'mark', tiada ? 'Tidak hadir' : 'Hadir'));
        btn.addEventListener('click', function () {
          if (state.tidakHadir.has(ic)) state.tidakHadir.delete(ic); else state.tidakHadir.add(ic);
          $('saveHint').textContent = 'Perubahan belum disimpan'; lukisMuridKelas();
        }); box.appendChild(btn);
      });
    $('classSummary').textContent = semua.length + ' murid';
    $('absentCount').textContent = state.tidakHadir.size + ' tidak hadir';
  }

  function simpanKehadiran() {
    if (!state.kelas || state.sedangSimpan || !navigator.onLine) return;
    state.sedangSimpan = true;
    var siap = mulaButang($('saveAttendanceBtn'), 'Menyimpan…');
    panggil('simpanKehadiran', [state.kelas.nama, Array.from(state.tidakHadir), state.token], 45000)
      .then(function (r) {
        $('saveHint').textContent = 'Disimpan ' + (r.masa || 'sekarang');
        state.kelas.sudahSimpan = true; state.kelas.tidakHadir = state.tidakHadir.size;
        (state.kelas.murid || []).forEach(function (m) { m.nilai = state.tidakHadir.has(teks(m.ic)) ? 0 : 1; });
        lukisKelas();
      }).catch(function (err) { $('saveHint').textContent = 'Gagal: ' + err.message; })
      .finally(function () { state.sedangSimpan = false; siap(); });
  }

  function setSemula() {
    if (!state.kelas) return;
    state.tidakHadir = new Set((state.kelas.murid || []).filter(function (m) { return Number(m.nilai) === 0; }).map(function (m) { return teks(m.ic); }));
    $('saveHint').textContent = 'Set semula kepada rekod pelayan'; lukisMuridKelas();
  }

  function bukaPane(id) {
    ['attendancePane', 'studentsPane', 'syncPane'].forEach(function (x) { $(x).hidden = x !== id; });
    document.querySelectorAll('.nav-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.pane === id); });
    if (id === 'studentsPane') muatMuridAdmin();
  }

  function muatMuridAdmin() {
    status($('syncStatus'), '', '');
    panggil('senaraiMurid', [state.token]).then(function (r) { state.murid = r || []; lukisMuridAdmin(); })
      .catch(function (e) { status($('syncStatus'), e.message, 'err'); });
  }

  function lukisMuridAdmin() {
    var q = norm($('studentAdminSearch').value), box = $('studentAdminList'); box.textContent = '';
    state.murid.filter(function (m) {
      return !q || [m.nama, m.ic, m.namaKelas, m.tahun, m.statusPengajian].some(function (x) { return norm(x).indexOf(q) > -1; });
    }).forEach(function (m) {
      var row = el('div', 'admin-item'), copy = el('div'); copy.appendChild(el('strong', '', m.nama));
      copy.appendChild(el('small', '', [m.tahun, m.namaKelas, m.statusPengajian, m.icAkhir ? '•••• ' + m.icAkhir : ''].filter(Boolean).join(' · '))); row.appendChild(copy);
      var btn = el('button', '', 'Edit'); btn.type = 'button'; btn.addEventListener('click', function () { bukaDialogMurid(m); }); row.appendChild(btn); box.appendChild(row);
    });
  }

  function bukaDialogMurid(m) {
    m = m || {};
    $('dialogTitle').textContent = m.ic ? 'Edit murid' : 'Tambah murid';
    $('studentOriginalIc').value = m.ic || ''; $('studentName').value = m.nama || ''; $('studentIc').value = m.ic || '';
    $('studentIc').readOnly = !!m.ic;
    $('studentId').value = m.idMurid || ''; $('studentYear').value = m.tahun || ''; $('studentClass').value = m.namaKelas || '';
    $('studentGender').value = m.jantina || ''; $('studentStatus').value = m.statusPengajian || 'BERSEKOLAH';
    status($('studentFormStatus'), '', ''); $('studentDialog').showModal();
  }

  function simpanMurid(e) {
    e.preventDefault();
    var rekod = {
      originalIc: $('studentOriginalIc').value.trim(), nama: $('studentName').value.trim(), ic: $('studentIc').value.trim(),
      idMurid: $('studentId').value.trim(), tahun: $('studentYear').value, namaKelas: $('studentClass').value.trim(),
      jantina: $('studentGender').value, statusPengajian: $('studentStatus').value
    };
    if (!rekod.nama || !rekod.ic) { status($('studentFormStatus'), 'Nama dan IC/MyKid diperlukan.', 'err'); return; }
    var siap = mulaButang($('saveStudentBtn'), 'Menyimpan…');
    panggil('simpanMurid', [rekod, state.token], 90000).then(function (r) {
      status($('studentFormStatus'), r.mesej || 'Murid disimpan dan diselaraskan.', r.syncOk === false ? 'err' : 'ok');
      return panggil('senaraiMurid', [state.token]);
    }).then(function (senarai) {
      state.murid = senarai || []; lukisMuridAdmin();
      setTimeout(function () { $('studentDialog').close(); }, 650);
      return panggil('init', [state.token]);
    }).then(function (d) { state.data = d; lukisKelas(); }).catch(function (err) {
      status($('studentFormStatus'), err.message, 'err');
    }).finally(siap);
  }

  function syncSemua() {
    var siap = mulaButang($('syncAllBtn'), 'Menyelaraskan…'); status($('syncStatus'), 'Mengemas kini AKSI dan SEMAK…', '');
    panggil('syncSemua', [state.token], 120000).then(function (r) {
      var ayat = (r.aksi && r.aksi.mesej ? 'AKSI: ' + r.aksi.mesej : 'AKSI selesai') + ' · ' +
        (r.semak && r.semak.mesej ? 'SEMAK: ' + r.semak.mesej : 'SEMAK selesai');
      status($('syncStatus'), ayat, r.ok ? 'ok' : 'err');
    }).catch(function (e) { status($('syncStatus'), e.message, 'err'); }).finally(siap);
  }

  function bukaMenu() { $('sidebar').classList.add('open'); $('scrim').hidden = false; }
  function tutupMenu() { $('sidebar').classList.remove('open'); $('scrim').hidden = true; }
  function sambungan() {
    var offline = !navigator.onLine; $('offlineBar').hidden = !offline;
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

  $('loginForm').addEventListener('submit', login); $('logoutBtn').addEventListener('click', logout);
  $('classSearch').addEventListener('input', lukisKelas); $('studentSearch').addEventListener('input', lukisMuridKelas);
  $('saveAttendanceBtn').addEventListener('click', simpanKehadiran); $('resetBtn').addEventListener('click', setSemula);
  $('menuBtn').addEventListener('click', bukaMenu); $('closeMenuBtn').addEventListener('click', tutupMenu); $('scrim').addEventListener('click', tutupMenu);
  $('studentAdminSearch').addEventListener('input', lukisMuridAdmin); $('addStudentBtn').addEventListener('click', function () { bukaDialogMurid(); });
  $('studentForm').addEventListener('submit', simpanMurid); $('syncAllBtn').addEventListener('click', syncSemua);
  document.querySelectorAll('.cancel-dialog').forEach(function (b) { b.addEventListener('click', function () { $('studentDialog').close(); }); });
  document.querySelectorAll('.nav-btn').forEach(function (b) { b.addEventListener('click', function () { bukaPane(b.dataset.pane); }); });
  window.addEventListener('online', sambungan); window.addEventListener('offline', sambungan);
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape') tutupMenu(); });
  $('appVersion').textContent = $('sideVersion').textContent = cfg.versi || 'HADIR v1.0.0 · PWA';
  if (!cfg.apiUrl) status($('loginStatus'), 'Aplikasi siap. Backend sedang menunggu deployment Apps Script.', '');
  sambungan(); daftarPwa(); pulihSesi();

  window.HADIR_UTIL = { norm: norm, teks: teks };
})();
