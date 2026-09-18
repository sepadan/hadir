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
input[type=password],input[type=text],input[type=number]{width:100%;padding:8px;margin-top:4px;box-sizing:border-box}
button{margin-top:12px;padding:8px 16px;cursor:pointer}
.amaran{background:#fff3cd;padding:12px;border-radius:6px;margin-top:16px}
.status{margin-top:8px;font-size:0.9rem;white-space:pre-wrap}
.panel{background:#f5f8fb;border-radius:8px;padding:12px;margin-top:10px;font-size:0.88rem;display:grid;gap:4px}
</style>
</head>
<body>
<h1>Tetapan tempatan — Companion HADIR-MOEIS</h1>
<p>Halaman ini hanya boleh diakses pada PC ini (127.0.0.1). Rahsia enjin
dimasukkan <strong>hanya di sini</strong> — HADIR Admin di pelayar tidak
pernah menerima kata laluan atau rahsia enjin. Companion tidak pernah menaip
kata laluan/PIN/OTP pada MOEIS/idMe.</p>

<div class="amaran">Giliran penghantaran MATI secara lalai. Mula/henti
dikawal dari HADIR Admin selepas PC ini dipasangkan. Autostart Windows juga
opt-in sahaja (lihat bawah).</div>

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

<h2>Pasangan HADIR Admin</h2>
<label>Kod pasangan (masukkan di HADIR Admin, sah 10 minit)</label>
<button id="btnKod">Jana kod pasangan</button>
<div id="statusKod" class="status"></div>

<h2>Sesi MOEIS/idMe</h2>
<p>Uji log masuk hanya MEMBACA hos + kunci keselamatan anti-pancing dan
keadaan sesi semasa — ia <strong>tidak pernah</strong> menaip kata laluan,
tidak mengklik kotak semak log masuk, dan tidak menulis kehadiran.</p>
<button id="btnUjiLogin">Uji log masuk (tanpa tulis)</button>
<div id="statusUjiLogin" class="status"></div>

<label>Log masuk manual idMe (selepas sesi tamat — guru log masuk sendiri)</label>
<button id="btnLogin">Buka Edge untuk log masuk</button>
<div id="statusLogin" class="status"></div>

<h2>Autostart</h2>
<label><input id="autostart" type="checkbox" style="width:auto;display:inline" /> Mulakan companion automatik semasa log masuk Windows (opt-in)</label>
<button id="btnAutostart">Kemas kini autostart</button>

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

  function muatStatus() {
    panggil('/api/lokal/status', 'GET').then(function (r) {
      if (!r.ok) { papar('panelStatus', r.ralat || 'Ralat memuat status.'); return; }
      var g = r.giliran || {}, moeis = r.moeis || {};
      papar('panelStatus',
        'Giliran: ' + (g.aktif ? 'HIDUP' : 'MATI (lalai)') + '\\n' +
        'Klaim atomik backend HADIR: ' + (g.klaimDisokong === true
          ? 'ada'
          : (g.klaimDisokong === false ? 'TIADA — naik taraf backend HADIR dahulu' : 'tidak dapat ditentukan')) + '\\n' +
        'Sesi idMe: ' + (moeis.sesiAda === true
          ? ('ada' + (moeis.umurSesi != null ? ' (disemak ' + moeis.umurSesi + 's lalu)' : ''))
          : (moeis.sesiAda === false ? 'tiada/tamat — perlu log masuk manual' : 'belum diperiksa (tekan "Uji log masuk")')) + '\\n' +
        'Rahsia enjin: ' + (r.rahsiaEnjinAda ? 'ada' : 'BELUM ditetapkan') + '\\n' +
        'Autostart: ' + (r.autostart ? 'HIDUP' : 'mati (lalai)')
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

  document.getElementById('btnTetapan').addEventListener('click', function () {
    panggil('/api/lokal/tetapan', 'POST', {
      apiUrl: document.getElementById('apiUrl').value,
      kunciKeselamatanDijangka: document.getElementById('kunciKeselamatan').value
    }).then(function (r) {
      papar('statusTetapan', r.ok ? 'Tetapan disimpan.' : (r.ralat || 'Ralat.'));
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
        (r.perluManusia ? '\\nPerlu log masuk manual pada PC ini.' : '')
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
    panggil('/api/lokal/autostart', 'POST', { aktif: aktif }).then(muatStatus);
  });
})();`;
}
