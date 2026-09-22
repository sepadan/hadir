// Penjana HTML/JS UI tetapan tempatan (companion/src/ui/render.mjs).
//
// Nonce TIDAK PERNAH dibakar ke dalam HTML statik ini secara pelayan.
// Sebaliknya: pelayar memuatkan halaman melalui `?n=<nonce>` (lihat tip
// konsol bin/hadir-companion.mjs), skrip but bina di bawah membaca nonce
// daripada `location.search`, segera membuang query itu daripada alamat/
// sejarah pelayar dengan `history.replaceState` (supaya nonce tidak kekal
// dalam sejarah/bookmark), kemudian memuatkan `/lokal.js?n=<nonce>` secara
// dinamik. `lokal.js` pula membaca semula nonce daripada `document
// .currentScript.src` dan menghantarnya sebagai header `X-HADIR-Lokal` pada
// setiap panggilan `/api/lokal/*` seterusnya — laluan mengubah keadaan itu
// HANYA menerima header, tidak sekali-kali query (lihat server.mjs).
export function halamanLokalHtml() {
  return `<!DOCTYPE html>
<html lang="ms">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Tetapan Companion HADIR-MOEIS</title>
<style>
body{font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:640px;margin:32px auto;padding:0 16px;color:#1b1b1b}
h1{font-size:1.3rem}
h2{font-size:1rem;margin-top:28px}
label{display:block;margin-top:16px;font-weight:600}
input[type=password],input[type=text],input[type=number],textarea{width:100%;padding:8px;margin-top:4px;box-sizing:border-box}
button{margin-top:12px;padding:8px 16px;cursor:pointer}
.amaran{background:#fff3cd;padding:12px;border-radius:6px;margin-top:16px}
.status{margin-top:8px;font-size:0.9rem;white-space:pre-wrap}
.panel{background:#f5f8fb;border-radius:8px;padding:12px;margin-top:10px;font-size:0.88rem;display:grid;gap:4px}
.banner{background:#fff3cd;padding:12px;border-radius:6px;margin-top:16px;font-weight:600}
.banner-amaran{background:#f8d7da;border:2px solid #dc3545;color:#7a2020}
.banner-ok{background:#d4edda;border:1px solid #28a745;color:#155724}
.senarai-tarikh{list-style:none;padding:0;margin-top:8px}
.senarai-tarikh li{margin:4px 0;display:flex;gap:8px;align-items:center}
.senarai-tarikh li button{margin:0;padding:2px 10px}
</style>
</head>
<body>
<h1>Tetapan tempatan — Companion HADIR-MOEIS</h1>
<p>Halaman ini hanya boleh diakses pada PC ini (127.0.0.1). Rahsia enjin dan
kredensial idMe dimasukkan <strong>hanya di sini</strong> — HADIR Admin di
pelayar tidak pernah menerima kata laluan atau rahsia enjin. Companion menaip
kredensial idMe <strong>hanya</strong> apabila log masuk automatik opt-in
(suis <em>loginAuto</em>, lalai MATI) dihidupkan DAN frasa kunci keselamatan
padan; selain itu ia tidak pernah menaip kata laluan/PIN/OTP.</p>

<div class="amaran">Giliran penghantaran MATI secara lalai. Log masuk idMe
automatik juga opt-in (loginAuto, lalai MATI). Autostart Windows opt-in
sahaja (lihat bawah).</div>

<div id="bannerKalendar" class="banner" style="display:none"></div>

<h2>Status</h2>
<div id="panelStatus" class="panel">Memuatkan status…</div>
<button id="btnMuatStatus">Muat semula status</button>

<h2>Rahsia enjin</h2>
<label for="rahsia">Rahsia enjin MOEIS (HADIR_MOEIS_ENGINE_SECRET)</label>
<input id="rahsia" type="password" autocomplete="off" placeholder="Tampal rahsia daripada Script Properties" />
<button id="btnRahsia">Simpan rahsia</button>
<div id="statusRahsia" class="status"></div>

<h2>Tetapan sambungan HADIR</h2>
<label for="apiUrl">URL Apps Script HADIR (apiUrl)</label>
<input id="apiUrl" type="text" autocomplete="off" />
<label for="kunciKeselamatan">Kunci keselamatan anti-pancing idMe dijangka (pilihan)</label>
<input id="kunciKeselamatan" type="text" autocomplete="off" placeholder="Kosongkan jika tidak pasti" />
<button id="btnTetapan">Simpan tetapan</button>
<div id="statusTetapan" class="status"></div>

<h2>Kredensial idMe (vault DPAPI tempatan)</h2>
<div class="amaran">Kredensial disimpan disulit DPAPI (akaun Windows ini sahaja) dalam
kredensial.dat — tiada teks biasa pada cakera. Nilai TIDAK PERNAH dipaparkan
semula: status hanya memaparkan boolean + pengguna tersamar.</div>
<label for="idMePengguna">Pengguna idMe (cth IC / ID guru)</label>
<input id="idMePengguna" type="text" autocomplete="off" />
<label for="idMeKataLaluan">Kata laluan idMe</label>
<input id="idMeKataLaluan" type="password" autocomplete="off" />
<label for="idMeKunciKeselamatan">Frasa "Kata Kunci Keselamatan" idMe yang dijangka (anti-pancing)</label>
<input id="idMeKunciKeselamatan" type="text" autocomplete="off" placeholder="Frasa tepat seperti dipaparkan semasa log masuk" />
<button id="btnKredensial">Simpan kredensial</button>
<button id="btnKredensialPadam">Padam kredensial</button>
<div id="statusKredensial" class="status"></div>

<h2>Pasangan HADIR Admin</h2>
<label>Kod pasangan (masukkan di HADIR Admin, sah 10 minit)</label>
<button id="btnKod">Jana kod pasangan</button>
<div id="statusKod" class="status"></div>

<h2>Sesi MOEIS/idMe</h2>
<div class="amaran">Log masuk idMe automatik ialah opt-in (suis loginAuto). Tanpa
loginAuto, log masuk kekal manual (guru log masuk sendiri).</div>
<p>Uji log masuk hanya MEMBACA hos + kunci keselamatan anti-pancing dan
keadaan sesi semasa — ia <strong>tidak pernah</strong> menaip kata laluan,
tidak mengklik kotak semak log masuk, dan tidak menulis kehadiran.</p>
<button id="btnUjiLogin">Uji log masuk (tanpa tulis)</button>
<div id="statusUjiLogin" class="status"></div>

<label>Log masuk manual idMe (selepas sesi tamat — guru log masuk sendiri)</label>
<button id="btnLogin">Buka Edge untuk log masuk</button>
<div id="statusLogin" class="status"></div>

<h2>Automasi tempatan (suis opt-in berasingan)</h2>
<label><input id="autostart" type="checkbox" style="width:auto;display:inline" /> Mulakan companion automatik semasa log masuk Windows (opt-in)</label>
<button id="btnAutostart">Kemas kini autostart</button>
<div id="statusAutostart" class="status"></div>

<label><input id="autoMulaGiliran" type="checkbox" style="width:auto;display:inline" /> Auto-mula giliran selepas companion berjaya bind (opt-in)</label>
<label><input id="loginAuto" type="checkbox" style="width:auto;display:inline" /> Log masuk idMe automatik — cuba semula secara automatik bila sesi tamat semasa giliran berjalan (opt-in, lalai MATI)</label>
<label><input id="benarkanTerusTanpaFrasa" type="checkbox" style="width:auto;display:inline" /> Teruskan log masuk idMe automatik walaupun frasa "Kata Kunci Keselamatan" tidak dapat dibaca (imej) (opt-in, lalai MATI)</label>
<div class="amaran">AMARAN: Jika dihidupkan, semakan frasa keselamatan DILANGKAU apabila frasa dipaparkan sebagai imej. Perlindungan kemudian bergantung pada semakan HTTPS + hos idMe yang ketat dan kotak semak pengesahan sahaja. Frasa imej TIDAK PERNAH di-OCR atau diteka. Anda boleh mematikannya semula bila-bila masa.</div>
<div id="loginAutoStatus" class="status" style="margin-top:2px"></div>
<label><input id="jagaSesi" type="checkbox" style="width:auto;display:inline" /> Penjaga sesi (keep-alive) idMe/MOEIS — sentuh sesi secara berkala semasa giliran aktif supaya tidak luput di tengah tugasan (opt-in, lalai MATI; BELUM terbukti menghalang luput terhadap idMe hidup)</label>
<div id="jagaSesiStatus" class="status" style="margin-top:2px"></div>
<label><input id="hadKadarLogin" type="checkbox" style="width:auto;display:inline" /> Had kadar login auto berterusan — pulihkan sesi idMe sepanjang hari tanpa restart (opt-in, lalai MATI)</label>
<div class="amaran">AMARAN: Apabila dihidupkan, had 2 cubaan per proses DIGANTIKAN oleh siling kadar BERTERUSAN merentas restart dan merentas hari: 6 cubaan/jam gelongsor, siling harian 24 (TIDAK dikosongkan oleh kejayaan), berhenti serta-merta selepas 3 kegagalan berturut-turut. OTP/CAPTCHA/2FA kekal berhenti untuk manusia, tidak pernah dipintas. Anda boleh mematikannya semula bila-bila masa.</div>
<div id="hadKadarLoginStatus" class="status" style="margin-top:2px"></div>
<button id="btnTetapkanSemulaLatch" style="display:none">Tetapkan semula sekatan kegagalan berturut-turut</button>
<div class="status">Tindakan ini HANYA mengosongkan pembilang kegagalan berturut-turut (sekatan 3-strike). Siling sejam/harian sedia ada dan kredensial TIDAK disentuh; tiada belanjawan tambahan diberikan.</div>
<label for="tarikhBaru">Tambah tarikh sekolah (YYYY-MM-DD) — allowlist auto-mula giliran</label>
<div style="display:flex;gap:8px;align-items:center;margin-top:4px">
  <input id="tarikhBaru" type="text" autocomplete="off" placeholder="2026-12-05" style="flex:1" />
  <button id="btnTambahTarikh" style="margin-top:0">Tambah</button>
</div>
<ul id="kalendarSekolah" class="senarai-tarikh"></ul>
<button id="btnSimpanKalendar">Simpan kalendar</button>
<div id="statusKalendar" class="status"></div>
<p class="status">Allowlist kosong gagal tertutup. Sabtu/Ahad, cuti, kerja lama,
kerja dari sebelum startup, cap masa rosak, gagal, berjaya dan lease luput
tidak diproses automatik. Tugasan tersimpan (pengesahan tidak lengkap)
dipulihkan dengan pengesahan baca-sahaja — mod verifikasi sahaja, tiada hantar.
Had umur tugasan ialah 15 minit.</p>

<script>
(function () {
  var m = location.search.match(/[?&]n=([^&]+)/);
  var nonce = m ? decodeURIComponent(m[1]) : '';
  if (window.history && window.history.replaceState) {
    window.history.replaceState(null, '', location.pathname);
  }
  var s = document.createElement('script');
  s.src = '/lokal.js?n=' + encodeURIComponent(nonce);
  document.body.appendChild(s);
})();
</script>
</body>
</html>`;
}

export function halamanLokalJs() {
  return `(function(){
  'use strict';
  var scriptEl = document.currentScript;
  var NONCE = '';
  try { NONCE = new URL(scriptEl.src, location.href).searchParams.get('n') || ''; } catch (e) { NONCE = ''; }

  function panggil(laluan, method, badan) {
    return fetch(laluan, {
      method: method || 'GET',
      headers: Object.assign({ 'X-HADIR-Lokal': NONCE }, badan ? { 'Content-Type': 'application/json' } : {}),
      body: badan ? JSON.stringify(badan) : undefined
    }).then(function (r) { return r.json(); });
  }

  function papar(id, teks) { document.getElementById(id).textContent = teks; }

  // Status penjaga sesi (keep-alive) — paparkan cubaan TERAKHIR + hasil dan
  // klasifikasi sihat/tidak sihat secara jujur. 'sesi-sah' = sihat; apa-apa
  // yang lain ('sesi-tamat', 'perlu-manusia', 'ralat', 'langkau', ...) = TIDAK
  // sihat — penjaga tidak mengaku berjaya hanya kerana siasatan selesai.
  function jagaTeksStatus(jaga) {
    if (!jaga) return 'Belum ada cubaan.';
    var bahagian = [];
    bahagian.push('cubaan ' + (jaga.bilPoke || 0) + ', langkau ' + (jaga.bilLangkau || 0));
    var hasil = jaga.hasilPokeTerakhir;
    if (hasil && hasil !== 'belum') {
      bahagian.push('hasil terakhir: ' + hasil + (jaga.sihatTerakhir === true ? ' (sihat)' : ' (TIDAK sihat)'));
      if (jaga.masaPokeTerakhir) {
        bahagian.push(new Date(jaga.masaPokeTerakhir).toLocaleTimeString());
      }
    } else {
      bahagian.push('belum ada poke berjaya');
    }
    return bahagian.join(' — ');
  }

  var kalendarSemasa = [];
  function renderKalendar() {
    var ul = document.getElementById('kalendarSekolah');
    ul.innerHTML = '';
    kalendarSemasa.forEach(function (tarikh, indeks) {
      var li = document.createElement('li');
      li.appendChild(document.createTextNode(tarikh + ' '));
      var butang = document.createElement('button');
      butang.type = 'button';
      butang.textContent = 'Buang';
      butang.addEventListener('click', function () {
        kalendarSemasa.splice(indeks, 1);
        renderKalendar();
      });
      li.appendChild(butang);
      ul.appendChild(li);
    });
  }

  function muatStatus() {
    panggil('/api/lokal/status', 'GET').then(function (r) {
      if (!r.ok) { papar('panelStatus', r.ralat || 'Ralat memuat status.'); return; }
      var g = r.giliran || {}, moeis = r.moeis || {};
      var auto = r.autoMula || {}, autostart = r.autostart || {}, keupayaan = r.keupayaanLogMasuk || {};
      var tetapan = r.tetapan || {}, kredensial = r.kredensial || {};
      document.getElementById('autostart').checked = autostart.berdaftar === true && autostart.sepadan === true;
      document.getElementById('autoMulaGiliran').checked = tetapan.autoMulaGiliran === true;
      document.getElementById('loginAuto').checked = tetapan.loginAuto === true;
      document.getElementById('benarkanTerusTanpaFrasa').checked = tetapan.benarkanTerusTanpaFrasa === true;
      document.getElementById('jagaSesi').checked = tetapan.jagaSesi === true;
      document.getElementById('hadKadarLogin').checked = tetapan.hadKadarLogin === true;
      var la = r.loginAutoStatus || {};
      papar('loginAutoStatus', (la.sebab || 'Belum dinilai.') + (la.percubaan > 0 ? ' (cubaan ' + la.percubaan + '/' + la.had + ')' : ''));
      var jaga = r.jagaSesi || {};
      var jagaTeks = tetapan.jagaSesi === true
        ? ('HIDUP — ' + jagaTeksStatus(jaga))
        : 'MATI (lalai)';
      papar('jagaSesiStatus', jagaTeks);
      var had = r.hadKadarLoginStatus || {};
      var ang = function (x) { return (x === null || x === undefined) ? '?' : x; };
      var hadTeks = tetapan.hadKadarLogin === true
        ? ('HIDUP — hari ini ' + ang(had.bilHariIni) + '/' + (had.silingHarian || 24) +
           ', tetingkap sejam ' + ang(had.bilJam) + '/' + (had.hadJam || 6) +
           ', kegagalan berturut ' + ang(had.kegagalanBerturut) + '/' + (had.hadKegagalanBerturut || 3) +
           (had.diblok ? (' — DIBLOK: ' + (had.sebab || '')) : ''))
        : 'MATI (lalai) — had 2 cubaan per proses digunakan';
      papar('hadKadarLoginStatus', hadTeks);
      // Tindakan pemulihan pemilik tempatan (v1.11.22 Gap 5): hanya dipaparkan
      // apabila sekatan 3-strike KEKAL sedang aktif — had sejam/harian ialah
      // tunggu sementara sahaja dan pulih dengan sendirinya, jadi butang tidak
      // perlu/tidak dipaparkan untuk kes itu.
      var btnResetLatch = document.getElementById('btnTetapkanSemulaLatch');
      btnResetLatch.style.display = (tetapan.hadKadarLogin === true && had.jenisSekat === 'kegagalan-berturut') ? '' : 'none';
      kalendarSemasa = (tetapan.kalendarSekolah || []).slice();
      renderKalendar();
      var kal = r.kalendar || {};
      var banner = document.getElementById('bannerKalendar');
      if (kal.sebab) {
        banner.style.display = 'block';
        banner.textContent = 'Kalendar sekolah: ' + kal.sebab;
        banner.className = kal.amaran ? 'banner banner-amaran' : 'banner banner-ok';
      } else {
        banner.style.display = 'none';
      }
      papar('panelStatus',
        'Giliran: ' + (g.aktif ? 'HIDUP' : 'MATI (lalai)') + '\\n' +
        'Klaim atomik backend HADIR: ' + (g.klaimDisokong === true
          ? 'ada'
          : (g.klaimDisokong === false ? 'TIADA — naik taraf backend HADIR dahulu' : 'tidak dapat ditentukan')) + '\\n' +
        'Sesi idMe: ' + (moeis.sesiAda === true
          ? ('ada' + (moeis.umurSesi != null ? ' (disemak ' + moeis.umurSesi + 's lalu)' : ''))
          : (moeis.sesiAda === false ? 'tiada/tamat — perlu log masuk manual' : 'belum diperiksa (tekan "Uji log masuk")')) + '\\n' +
        'Rahsia enjin: ' + (r.rahsiaEnjinAda ? 'ada' : 'BELUM ditetapkan') + '\\n' +
        'Autostart Windows sebenar: ' + (autostart.berdaftar
          ? (autostart.sepadan ? 'HIDUP' : 'AMARAN: entri tidak sepadan')
          : 'mati (lalai)') + '\\n' +
        'Auto-mula giliran: ' + (auto.bermula ? 'BERMULA' : 'tidak bermula') +
          ' — ' + (auto.sebab || 'belum dinilai') + '\\n' +
        'Log masuk automatik: ' + (keupayaan.automatik
          ? ('tersedia opt-in, suis loginAuto ' + (tetapan.loginAuto === true ? 'HIDUP' : 'MATI'))
          : 'BLOCKED') + '\\n' +
        'Kredensial idMe: ' + (kredensial.ada
          ? ('ada (pengguna ' + (kredensial.pengguna || 'tersamar') + (kredensial.rosak ? ', ROSAK' : '') + ')')
          : 'tiada') + '\\n' +
        'Nota: ' + (keupayaan.sebab || 'Keupayaan tidak diketahui.')
      );
    }).catch(function (e) { papar('panelStatus', 'Ralat: ' + e.message); });
  }
  document.getElementById('btnMuatStatus').addEventListener('click', muatStatus);
  muatStatus();

  document.getElementById('btnRahsia').addEventListener('click', function () {
    var nilai = document.getElementById('rahsia').value;
    panggil('/api/lokal/rahsia', 'POST', { rahsiaEnjin: nilai }).then(function (r) {
      document.getElementById('rahsia').value = '';
      papar('statusRahsia', r.ok ? 'Rahsia disimpan (disulit DPAPI).' : (r.ralat || 'Ralat.'));
      muatStatus();
    });
  });

  document.getElementById('btnKredensial').addEventListener('click', function () {
    panggil('/api/lokal/kredensial', 'POST', {
      idMePengguna: document.getElementById('idMePengguna').value,
      idMeKataLaluan: document.getElementById('idMeKataLaluan').value,
      idMeKunciKeselamatan: document.getElementById('idMeKunciKeselamatan').value
    }).then(function (r) {
      // Bersihkan medan sebaik sahaja disimpan — nilai tidak pernah digemakan.
      document.getElementById('idMePengguna').value = '';
      document.getElementById('idMeKataLaluan').value = '';
      document.getElementById('idMeKunciKeselamatan').value = '';
      papar('statusKredensial', r.ok
        ? ('Kredensial disimpan (disulit DPAPI). Pengguna tersamar: ' + (r.pengguna || '?'))
        : (r.ralat || 'Ralat.'));
      muatStatus();
    });
  });

  document.getElementById('btnKredensialPadam').addEventListener('click', function () {
    panggil('/api/lokal/kredensial-padam', 'POST', {}).then(function (r) {
      papar('statusKredensial', r.ok ? 'Kredensial dipadam.' : (r.ralat || 'Ralat.'));
      muatStatus();
    });
  });

  document.getElementById('btnTetapan').addEventListener('click', function () {
    panggil('/api/lokal/tetapan', 'POST', {
      apiUrl: document.getElementById('apiUrl').value,
      kunciKeselamatanDijangka: document.getElementById('kunciKeselamatan').value,
      autoMulaGiliran: document.getElementById('autoMulaGiliran').checked,
      loginAuto: document.getElementById('loginAuto').checked,
      benarkanTerusTanpaFrasa: document.getElementById('benarkanTerusTanpaFrasa').checked,
      jagaSesi: document.getElementById('jagaSesi').checked,
      hadKadarLogin: document.getElementById('hadKadarLogin').checked
    }).then(function (r) {
      papar('statusTetapan', r.ok ? 'Tetapan disimpan.' : (r.ralat || 'Ralat.'));
      muatStatus();
    });
  });

  document.getElementById('loginAuto').addEventListener('change', function () {
    panggil('/api/lokal/tetapan', 'POST', { loginAuto: document.getElementById('loginAuto').checked }).then(function (r) {
      papar('statusTetapan', r.ok ? 'Suis loginAuto disimpan.' : (r.ralat || 'Ralat.'));
      muatStatus();
    });
  });
  document.getElementById('benarkanTerusTanpaFrasa').addEventListener('change', function () {
    panggil('/api/lokal/tetapan', 'POST', { benarkanTerusTanpaFrasa: document.getElementById('benarkanTerusTanpaFrasa').checked }).then(function (r) {
      papar('statusTetapan', r.ok ? 'Suis benarkanTerusTanpaFrasa disimpan.' : (r.ralat || 'Ralat.'));
      muatStatus();
    });
  });
  document.getElementById('jagaSesi').addEventListener('change', function () {
    panggil('/api/lokal/tetapan', 'POST', { jagaSesi: document.getElementById('jagaSesi').checked }).then(function (r) {
      papar('statusTetapan', r.ok ? 'Suis jagaSesi (keep-alive) disimpan.' : (r.ralat || 'Ralat.'));
      muatStatus();
    });
  });
  document.getElementById('hadKadarLogin').addEventListener('change', function () {
    panggil('/api/lokal/tetapan', 'POST', { hadKadarLogin: document.getElementById('hadKadarLogin').checked }).then(function (r) {
      papar('statusTetapan', r.ok ? 'Suis had kadar login auto berterusan disimpan.' : (r.ralat || 'Ralat.'));
      muatStatus();
    });
  });
  document.getElementById('btnTetapkanSemulaLatch').addEventListener('click', function () {
    var ok = confirm('Tetapkan semula sekatan kegagalan berturut-turut log masuk automatik? Siling sejam/harian sedia ada TIDAK disentuh; tiada belanjawan tambahan diberikan.');
    if (!ok) return;
    panggil('/api/lokal/had-kadar-tetapkan-semula', 'POST', { sah: true }).then(function (r) {
      papar('hadKadarLoginStatus', r.ok ? 'Sekatan kegagalan berturut-turut ditetapkan semula.' : (r.ralat || 'Ralat.'));
      muatStatus();
    });
  });
  document.getElementById('autoMulaGiliran').addEventListener('change', function () {
    panggil('/api/lokal/tetapan', 'POST', { autoMulaGiliran: document.getElementById('autoMulaGiliran').checked }).then(function (r) {
      papar('statusTetapan', r.ok ? 'Suis auto-mula giliran disimpan.' : (r.ralat || 'Ralat.'));
      muatStatus();
    });
  });

  document.getElementById('btnTambahTarikh').addEventListener('click', function () {
    var nilai = document.getElementById('tarikhBaru').value.trim();
    var bahagian = nilai.split('-');
    var formatOk = bahagian.length === 3 && bahagian[0].length === 4 && bahagian[1].length === 2 && bahagian[2].length === 2;
    if (!formatOk) {
      papar('statusKalendar', 'Format tarikh mesti YYYY-MM-DD (cth 2026-12-05).');
      return;
    }
    if (kalendarSemasa.indexOf(nilai) >= 0) {
      papar('statusKalendar', 'Tarikh itu sudah ada dalam senarai.');
      return;
    }
    kalendarSemasa.push(nilai);
    kalendarSemasa.sort();
    document.getElementById('tarikhBaru').value = '';
    renderKalendar();
    papar('statusKalendar', '');
  });

  document.getElementById('btnSimpanKalendar').addEventListener('click', function () {
    panggil('/api/lokal/tetapan', 'POST', { kalendarSekolah: kalendarSemasa }).then(function (r) {
      if (r.ok) {
        papar('statusKalendar', 'Kalendar disimpan.');
        muatStatus();
      } else {
        papar('statusKalendar', r.ralat || 'Ralat.');
      }
    });
  });

  document.getElementById('btnKod').addEventListener('click', function () {
    panggil('/api/lokal/kod-pasangan', 'POST', {}).then(function (r) {
      papar('statusKod', r.ok ? ('Kod: ' + r.kod + ' (sah 10 minit, sekali guna)') : (r.ralat || 'Ralat.'));
    });
  });

  document.getElementById('btnUjiLogin').addEventListener('click', function () {
    papar('statusUjiLogin', 'Membuka Edge untuk membaca status (tiada tulisan)…');
    panggil('/api/lokal/uji-login', 'POST', {}).then(function (r) {
      if (!r.ok) { papar('statusUjiLogin', r.ralat || 'Ralat.'); return; }
      papar('statusUjiLogin',
        'Status: ' + r.status + '\\n' +
        'Hos: ' + (r.hos || '-') + '\\n' +
        'Kunci keselamatan: ' + (r.kunci || '-') +
        (r.sebab ? '\\n' + r.sebab : (r.perluManusia ? '\\nPerlu log masuk manual pada PC ini.' : ''))
      );
      muatStatus();
    });
  });

  document.getElementById('btnLogin').addEventListener('click', function () {
    papar('statusLogin', 'Membuka Edge… log masuk sendiri, tetingkap ditutup automatik selepas berjaya (had 20 minit).');
    panggil('/api/lokal/log-masuk-manual', 'POST', {}).then(function (r) {
      papar('statusLogin', r.ok ? JSON.stringify(r.hasil) : (r.ralat || 'Ralat.'));
      muatStatus();
    });
  });

  document.getElementById('btnAutostart').addEventListener('click', function () {
    var aktif = document.getElementById('autostart').checked;
    panggil('/api/lokal/autostart', 'POST', { aktif: aktif }).then(function (r) {
      papar('statusAutostart', r.ok ? r.autostart.sebab : (r.ralat || 'Ralat.'));
      muatStatus();
    });
  });
})();`;
}
