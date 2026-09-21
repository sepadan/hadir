// Ujian adapter Playwright SEBENAR terhadap DOM sebenar (bukan adapter palsu).
//
// Melancarkan pelayar Chromium sistem (Chrome, fallback Edge) HEADLESS dan
// memuatkan fixture HTML SANITIZED yang menyerupai halaman idMe
// /loginverification (frasa dalam kotak putih berasingan daripada label, teks
// amaran italic, kotak semak pengesahan, medan kata laluan tersembunyi pada
// mulanya). Tiada rangkaian sebenar, tiada URL idMe/MOEIS, tiada kredensial
// sebenar — hanya nilai PALSU (FRASA-CONTOH-SELAMAT) dan DOM tempatan.
//
// Ini membuktikan bahawa `buatAdaptorPlaywright(page)` (adapter PRODUKSI)
// mengekstrak frasa daripada kotak putih (BUKAN label), menanda kotak semak
// secara idempotent + mendedahkan kata laluan, dan `lanjutkanPengesahan()`
// menggunakan `waitForFunction(pageFunction, arg, options)` dengan betul
// terhadap DOM sebenar.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { buatAdaptorPlaywright, sanitasiDomLoginGagal } from '../src/moeis/adaptorPlaywright.mjs';

const FRASA = 'FRASA-CONTOH-SELAMAT';

let browser = null;
let konteks = null;
let page = null;
let adapter = null;

before(async () => {
  // Chrome sistem dahulu; Edge sebagai sandaran. HEADLESS (fixture tempatan).
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  }
  konteks = await browser.newContext();
  page = await konteks.newPage();
  adapter = buatAdaptorPlaywright(page);
});

after(async () => {
  if (browser) await browser.close();
});

// Fixture utama: frasa dalam kotak putih dengan kelas `kata-kunci-box`
// (laluan selektor kelas dalam bacaKunciKeselamatan). Label berasingan,
// amaran italic, kotak semak pengesahan belum ditanda, kata laluan tersembunyi.
function htmlPengesahan({ frasa = FRASA, frasaImej = false, kotakAda = true } = {}) {
  const isiFrasa = frasaImej
    ? '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="frasa-keselamatan">'
    : frasa;
  const kotak = kotakAda
    ? '<label class="pengesahan">' +
        '<input type="checkbox" id="sahkan-kunci" ' +
        'onchange="document.getElementById(\'medan-pwd\').style.display = this.checked ? \'block\' : \'none\'"> ' +
        'Ya, ini adalah Kata Kunci Keselamatan saya.</label>'
    : '';
  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>' +
    '<div class="loginverification">' +
    '<h2>Pengesahan Log Masuk</h2>' +
    '<div class="seksyen-kunci">' +
    '<div class="label-kunci">Kata Kunci Keselamatan</div>' +
    '<div class="kata-kunci-box" style="background:#ffffff;border:1px solid #cccccc;padding:10px;">' + isiFrasa + '</div>' +
    '<p class="amaran"><i>Amaran: Pastikan frasa di atas sama seperti yang anda daftarkan.</i></p>' +
    kotak +
    '<div class="medan-kata-laluan" id="medan-pwd" style="display:none">' +
    '<input type="password" name="password" placeholder="Kata laluan">' +
    '</div>' +
    '<button type="button" id="butang-daftar">Daftar Masuk</button>' +
    '</div></div></body></html>'
  );
}

// Fixture laluan heuristik: kotak putih TANPA kelas khas — memaksa
// bacaKunciKeselamatan menggunakan laluan "label pendek → nextElementSibling"
// dan MEMBUKTIKAN ia pulangkan frasa (elemen selepas label), BUKAN teks label.
function htmlPengesahanHeuristik({ frasa = FRASA } = {}) {
  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>' +
    '<div class="seksyen-kunci">' +
    '<div class="label-kunci">Kata Kunci Keselamatan</div>' +
    '<div style="background:#ffffff;border:1px solid #cccccc;padding:10px;">' + frasa + '</div>' +
    '<p class="amaran"><i>Amaran: Jangan kongsikan frasa anda.</i></p>' +
    '<label class="pengesahan"><input type="checkbox" id="sahkan-kunci" ' +
    'onchange="document.getElementById(\'medan-pwd\').style.display = this.checked ? \'block\' : \'none\'"> ' +
    'Ya, ini adalah Kata Kunci Keselamatan saya.</label>' +
    '<div class="medan-kata-laluan" id="medan-pwd" style="display:none">' +
    '<input type="password" name="password"></div>' +
    '</div></body></html>'
  );
}

async function muat(html) {
  await page.setContent(html);
}

// ---------- bacaKunciKeselamatan: frasa dari kotak putih, BUKAN label ----------

test('adapter sebenar: bacaKunciKeselamatan pulangkan FRASA (bukan label "Kata Kunci Keselamatan")', async () => {
  await muat(htmlPengesahan());
  const frasa = await adapter.bacaKunciKeselamatan();
  assert.equal(frasa, FRASA);
  assert.notEqual(frasa, 'Kata Kunci Keselamatan');
});

test('adapter sebenar: bacaKunciKeselamatan (laluan heuristik, tanpa kelas khas) pulangkan FRASA bukan label', async () => {
  await muat(htmlPengesahanHeuristik());
  const frasa = await adapter.bacaKunciKeselamatan();
  assert.equal(frasa, FRASA);
  assert.notEqual(frasa, 'Kata Kunci Keselamatan');
});

test('adapter sebenar: frasa sebagai IMEJ (tiada teks) -> null (kunci-tiada jujur, tiada OCR/fabrikasi)', async () => {
  await muat(htmlPengesahan({ frasaImej: true }));
  const frasa = await adapter.bacaKunciKeselamatan();
  assert.equal(frasa, null);
});

// ---------- tandakanKunciKeselamatan: idempotent + spesifik + sahkan pendedahan ----------

test('adapter sebenar: tandakanKunciKeselamatan menanda kotak semak dan mendedahkan kata laluan', async () => {
  await muat(htmlPengesahan());
  const hasil = await adapter.tandakanKunciKeselamatan();
  assert.equal(hasil, true);
  const keadaan = await page.evaluate(() => ({
    ditanda: document.getElementById('sahkan-kunci').checked,
    pwdNampak: (() => { const p = document.querySelector('input[type=password]'); return !!p && !p.disabled && p.offsetParent !== null; })()
  }));
  assert.equal(keadaan.ditanda, true, 'kotak semak mesti ditanda');
  assert.equal(keadaan.pwdNampak, true, 'kata laluan mesti kelihatan selepas kotak ditanda');
});

test('adapter sebenar: tandakanKunciKeselamatan idempotent — panggilan kedua TIDAK menanggalkan tanda', async () => {
  await muat(htmlPengesahan());
  assert.equal(await adapter.tandakanKunciKeselamatan(), true);
  const kedua = await adapter.tandakanKunciKeselamatan();
  assert.equal(kedua, true);
  const keadaan = await page.evaluate(() => ({
    ditanda: document.getElementById('sahkan-kunci').checked,
    pwdNampak: (() => { const p = document.querySelector('input[type=password]'); return !!p && !p.disabled && p.offsetParent !== null; })()
  }));
  assert.equal(keadaan.ditanda, true, 'kotak semak mesti Kekal ditanda (tidak ditoggol mati)');
  assert.equal(keadaan.pwdNampak, true, 'kata laluan mesti kekal kelihatan');
});

test('adapter sebenar: tandakanKunciKeselamatan TANPA kotak semak pengesahan -> false (fail tertutup, tiada klik sewenang)', async () => {
  await muat(htmlPengesahan({ kotakAda: false }));
  const hasil = await adapter.tandakanKunciKeselamatan();
  assert.equal(hasil, false);
});

// ---------- tandakanKunciKeselamatan: DOM idMe SEBENAR (#check_log / #submit_form) ----------
//
// Fixture ini meniru STRUKTUR SEBENAR halaman pengesahan idMe (bundle
// diagnostik LIVE 2026-09-21): kotak semak <input id="check_log"
// name="check" type="checkbox"> di dalam <label> "Ya, ini adalah Kata Kunci
// Keselamatan saya.", medan kata laluan <input id="password"> di dalam kontena
// <div id="submit_form" style="display:none">, dan DUA butang "Daftar Masuk"
// (placeholder disabled `#log_disbale_form` + butang aktif `#log_open_form`
// yang didedahkan). Pengendali klik meniru tingkah laku jQuery idMe sebenar:
// menanda kotak mendedahkan #submit_form, menyahtanda menyembunyikannya.

function htmlIdMeSebenar({ adaPengendali = true } = {}) {
  const pengendali = adaPengendali
    ? '<script>' +
      'var kotak = document.getElementById("check_log");' +
      'function kemasKini() {' +
      '  var nampak = kotak.checked;' +
      '  document.getElementById("submit_form").style.display = nampak ? "block" : "none";' +
      '  document.getElementById("log_open_form").style.display = nampak ? "block" : "none";' +
      '  document.getElementById("log_disbale_form").style.display = nampak ? "none" : "block";' +
      '}' +
      'kotak.addEventListener("click", kemasKini);' +
      '</script>'
    : '';
  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>' +
    '<form id="myFormlog" method="POST">' +
    '<div class="form-group text-center">' +
    '<div class="form-check mb-0">' +
    '<label class="form-check-label tx-13 tx-white">' +
    '<input id="check_log" class="form-check-input" name="check" type="checkbox" value=""> ' +
    '<b>Ya, ini adalah Kata Kunci Keselamatan saya.</b>' +
    '</label>' +
    '</div></div>' +
    '<input id="ic" hidden type="text" name="ic" placeholder="ID Pengguna">' +
    '<div class="input-group" id="submit_form" style="display:none;">' +
    '<input id="password" type="password" class="form-control" name="password" placeholder="Kata Laluan">' +
    '</div>' +
    '<button id="log_disbale_form" type="submit" class="btn btn-info btn-block" disabled>Daftar Masuk</button>' +
    '<button id="log_open_form" type="submit" class="btn btn-info btn-block" style="display:none;">Daftar Masuk</button>' +
    '</form>' +
    pengendali +
    '</body></html>'
  );
}

test('adapter sebenar: tandakanKunciKeselamatan kenal pasti #check_log (DOM idMe sebenar) dan mendedahkan #password', async () => {
  await muat(htmlIdMeSebenar());
  const hasil = await adapter.tandakanKunciKeselamatan();
  assert.equal(hasil, true);
  const keadaan = await page.evaluate(() => ({
    ditanda: document.getElementById('check_log').checked,
    pwdNampak: (() => { const p = document.getElementById('password'); return !!p && !p.disabled && p.offsetParent !== null; })()
  }));
  assert.equal(keadaan.ditanda, true, 'kotak #check_log mesti ditanda');
  assert.equal(keadaan.pwdNampak, true, 'kata laluan mesti kelihatan selepas kotak #check_log ditanda');
});

test('adapter sebenar: tandakanKunciKeselamatan idempotent pada DOM idMe sebenar — panggilan kedua tidak menanggalkan tanda', async () => {
  await muat(htmlIdMeSebenar());
  assert.equal(await adapter.tandakanKunciKeselamatan(), true);
  assert.equal(await adapter.tandakanKunciKeselamatan(), true);
  const keadaan = await page.evaluate(() => ({
    ditanda: document.getElementById('check_log').checked,
    pwdNampak: (() => { const p = document.getElementById('password'); return !!p && !p.disabled && p.offsetParent !== null; })()
  }));
  assert.equal(keadaan.ditanda, true, 'kotak mesti kekal ditanda (tidak ditogol mati)');
  assert.equal(keadaan.pwdNampak, true, 'kata laluan mesti kekal kelihatan');
});

test('adapter sebenar: #check_log wujud tetapi tiada pengendali mendedahkan kata laluan -> false (fail tertutup, tidak isi medan tersembunyi)', async () => {
  // Meniru senario bundle diagnostik sebenar: kotak semak wujud, tetapi
  // pengendali yang sepatutnya mendedahkan #submit_form TIDAK berjalan —
  // adapter mesti pulangkan false supaya pemanggil ABORT, bukannya timeout.
  await muat(htmlIdMeSebenar({ adaPengendali: false }));
  const hasil = await adapter.tandakanKunciKeselamatan();
  assert.equal(hasil, false);
});

// ---------- lanjutkanPengesahan: waitForFunction(fn, arg, options) terhadap DOM sebenar ----------

test('adapter sebenar: lanjutkanPengesahan pulangkan {ok:true} apabila kotak semak kunci muncul (laluan adaFrasaAtauKotak)', async () => {
  // Halaman IC palsu dengan butang "Seterusnya" yang, apabila ditekan, menukar
  // kandungan kepada halaman pengesahan yang mengandungi kotak semak — meniru
  // dua peringkat idMe. waitForFunction yang telah dibetulkan mesti menunggu
  // sehingga kotak semak muncul lalu pulangkan ok:true.
  const htmlDuaPeringkat =
    '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>' +
    '<div id="peringkat-ic"><button type="button" id="butang-seterusnya">Seterusnya</button></div>' +
    '<div id="peringkat-verifikasi" style="display:none">' +
    '<div class="label-kunci">Kata Kunci Keselamatan</div>' +
    '<label class="pengesahan"><input type="checkbox"> Ya, ini adalah Kata Kunci Keselamatan saya.</label>' +
    '</div>' +
    '<script>' +
    'document.getElementById("butang-seterusnya").addEventListener("click", function () {' +
    '  document.getElementById("peringkat-ic").style.display = "none";' +
    '  document.getElementById("peringkat-verifikasi").style.display = "block";' +
    '});' +
    '</script>' +
    '</body></html>';
  await muat(htmlDuaPeringkat);
  const hasil = await adapter.lanjutkanPengesahan();
  assert.equal(hasil.ok, true);
});
// Catatan: laluan kegagalan waitForFunction (kotak semak TIDAK pernah muncul
// -> {ok:false} selepas timeout 15s) TIDAK diuji di sini kerana ia memaksa
// tunggu 15s sebenar. Pembetulan tandatangan `waitForFunction(fn, undefined,
// { timeout: 15000 })` disahkan oleh sumber + laluan gembira di atas.

// ---------- hantarBorangLogMasuk: DUA butang "Daftar Masuk" idMe sebenar ----------
//
// idMe /loginverification sebenar membawa DUA butang "Daftar Masuk": satu
// placeholder disabled+hidden `#log_disbale_form` (sentiasa lebih awal dalam
// DOM) dan satu butang sebenar aktif+kelihatan. `.first()` membuta lama
// memilih placeholder dan `click()` melontar Timeout Playwright mentah.

test('adapter sebenar: hantarBorangLogMasuk klik butang AKTIF + KELIHATAN, BUKAN placeholder disabled/hidden log_disbale_form', async () => {
  await muat(
    '<!doctype html><html><body>' +
    '<button disabled type="submit" id="log_disbale_form" class="btn btn-info btn-block" style="display:none" ' +
    'onclick="window.__diklik=\'log_disbale_form\'">Daftar Masuk</button>' +
    '<button type="submit" id="log_enable_form" class="btn btn-primary btn-block" ' +
    'onclick="window.__diklik=\'log_enable_form\'">Daftar Masuk</button>' +
    '</body></html>'
  );
  const hasil = await adapter.hantarBorangLogMasuk();
  assert.equal(hasil.ok, true);
  const diklik = await page.evaluate(() => window.__diklik || null);
  assert.equal(diklik, 'log_enable_form', 'mesti klik butang AKTIF, bukan placeholder disabled/hidden');
});

test('adapter sebenar: TIADA butang "Daftar Masuk" aktif/kelihatan -> {ok:false, status:"tiada-butang-hantar"}, sebab jelas, TIADA raw Timeout, TIDAK throw (bounded ~8s)', async () => {
  await muat(
    '<!doctype html><html><body>' +
    '<button disabled type="submit" id="log_disbale_form" class="btn btn-info btn-block" style="display:none">Daftar Masuk</button>' +
    '</body></html>'
  );
  const hasil = await adapter.hantarBorangLogMasuk();
  assert.equal(hasil.ok, false);
  assert.equal(hasil.status, 'tiada-butang-hantar');
  assert.match(hasil.sebab, /Daftar Masuk/);
  assert.doesNotMatch(hasil.sebab, /Timeout/i, 'sebab tidak boleh membocorkan Timeout Playwright mentah');
});

// ---------- sanitasiDomLoginGagal: fungsi TULEN, boleh disiri untuk diagnostik ----------

test('sanitasiDomLoginGagal: buang nilai input + medan csrf/hidden, gantikan frasa dengan placeholder, kekalkan struktur .kata-kunci-box', async () => {
  await muat(
    '<!doctype html><html><body>' +
    '<input type="text" name="ic" value="SECRET-VALUE">' +
    '<input type="hidden" name="csrf_token" value="rahsia-csrf-nilai">' +
    '<div class="kata-kunci-box">FRASA-CONTOH-SELAMAT</div>' +
    '</body></html>'
  );
  const html = await page.evaluate(sanitasiDomLoginGagal);
  assert.equal(html.includes('SECRET-VALUE'), false, 'nilai input tidak boleh bocor');
  assert.equal(html.includes('csrf_token'), false, 'medan csrf mesti dibuang sepenuhnya');
  assert.equal(html.includes('rahsia-csrf-nilai'), false);
  assert.equal(html.includes('FRASA-CONTOH-SELAMAT'), false, 'frasa sebenar tidak boleh bocor');
  assert.match(html, /\[FRASA-DISAMARKAN\]/);
  assert.match(html, /class="kata-kunci-box"/, 'struktur (tag+kelas) mesti dikekalkan');
});

// ---------- ketahanan halaman lambat/separa dimuatkan (slow/partial render) ----------
//
// Adapter PRODUKSI kini MENUNGGU elemen log masuk menjadi SEDIA (hadir +
// kelihatan + aktif) secara bersempadan sebelum mengisi/mengklik — bukan
// `.first().fill()/.click()` yang melontar Timeout Playwright mentah pada
// halaman lambat. Fixture di bawah menyuntik elemen selepas setTimeout untuk
// meniru render yang lewat; adapter mesti menunggu (bukan gagal serta-merta).

function htmlIcLambat({ masa = 700 } = {}) {
  return (
    '<!doctype html><html><head><meta charset="utf-8"></head><body>' +
    '<div id="sementara">Memuatkan...</div>' +
    '<script>' +
    'setTimeout(function () {' +
    '  var i = document.createElement("input");' +
    '  i.type = "text";' +
    '  i.setAttribute("placeholder", "KAD PENGENALAN");' +
    '  i.id = "ic-lambat";' +
    '  document.body.appendChild(i);' +
    '}, ' + masa + ');' +
    '</script>' +
    '</body></html>'
  );
}

function htmlKataLaluanLambat({ masa = 700 } = {}) {
  return (
    '<!doctype html><html><body>' +
    '<script>' +
    'setTimeout(function () {' +
    '  var p = document.createElement("input");' +
    '  p.type = "password";' +
    '  p.id = "pwd-lambat";' +
    '  document.body.appendChild(p);' +
    '}, ' + masa + ');' +
    '</script>' +
    '</body></html>'
  );
}

function htmlFrasaLambat({ frasa = FRASA, masa = 700 } = {}) {
  return (
    '<!doctype html><html><body>' +
    '<div class="seksyen-kunci"><div class="label-kunci">Kata Kunci Keselamatan</div></div>' +
    '<script>' +
    'setTimeout(function () {' +
    '  var b = document.createElement("div");' +
    '  b.className = "kata-kunci-box";' +
    '  b.style.background = "#ffffff";' +
    '  b.textContent = ' + JSON.stringify(frasa) + ';' +
    '  document.querySelector(".seksyen-kunci").appendChild(b);' +
    '}, ' + masa + ');' +
    '</script>' +
    '</body></html>'
  );
}

function htmlKotakLambat({ masa = 700 } = {}) {
  return (
    '<!doctype html><html><body>' +
    '<script>' +
    'setTimeout(function () {' +
    '  var l = document.createElement("label");' +
    '  l.innerHTML = \'<input id="check_log" class="form-check-input" name="check" type="checkbox"> Ya, ini adalah Kata Kunci Keselamatan saya.\';' +
    '  document.body.appendChild(l);' +
    '  var d = document.createElement("div");' +
    '  d.id = "submit_form";' +
    '  d.style.display = "none";' +
    '  d.innerHTML = \'<input id="password" type="password">\';' +
    '  document.body.appendChild(d);' +
    '  document.getElementById("check_log").addEventListener("click", function () {' +
    '    document.getElementById("submit_form").style.display = this.checked ? "block" : "none";' +
    '  });' +
    '}, ' + masa + ');' +
    '</script>' +
    '</body></html>'
  );
}

test('adapter sebenar: isiPenggunaIdMe MENUNGGU medan IC yang muncul lewat dan berjaya mengisi', async () => {
  await muat(htmlIcLambat({ masa: 700 }));
  const hasil = await adapter.isiPenggunaIdMe('PENGGUNA-UJIAN');
  assert.equal(hasil.ok, true);
  const nilai = await page.evaluate(() => document.getElementById('ic-lambat').value);
  assert.equal(nilai, 'PENGGUNA-UJIAN');
});

test('adapter sebenar: isiPenggunaIdMe medan IC TIDAK pernah muncul -> {ok:false, status:medan-ic-tiada}, TIADA throw', async () => {
  const adaptorPantas = buatAdaptorPlaywright(page, { masaSediaMs: 1500, jedaPollMs: 100 });
  await muat('<!doctype html><html><body><div>tiada borang</div></body></html>');
  const hasil = await adaptorPantas.isiPenggunaIdMe('PENGGUNA-UJIAN');
  assert.equal(hasil.ok, false);
  assert.equal(hasil.status, 'medan-ic-tiada');
});

test('adapter sebenar: isiKataLaluanIdMe MENUNGGU medan kata laluan yang muncul lewat dan berjaya mengisi', async () => {
  await muat(htmlKataLaluanLambat({ masa: 700 }));
  const hasil = await adapter.isiKataLaluanIdMe('KATA-LALUAN-PALSU-TAK-SAH');
  assert.equal(hasil.ok, true);
  const nilai = await page.evaluate(() => document.getElementById('pwd-lambat').value);
  assert.equal(nilai, 'KATA-LALUAN-PALSU-TAK-SAH');
});

test('adapter sebenar: isiKataLaluanIdMe medan TIDAK pernah muncul -> {ok:false, status:medan-kata-laluan-tiada}, TIADA throw', async () => {
  const adaptorPantas = buatAdaptorPlaywright(page, { masaSediaMs: 1500, jedaPollMs: 100 });
  await muat('<!doctype html><html><body><div>tiada borang</div></body></html>');
  const hasil = await adaptorPantas.isiKataLaluanIdMe('KATA-LALUAN-PALSU-TAK-SAH');
  assert.equal(hasil.ok, false);
  assert.equal(hasil.status, 'medan-kata-laluan-tiada');
});

test('adapter sebenar: bacaKunciKeselamatan MENUNGGU frasa yang muncul lewat (bukan null serta-merta)', async () => {
  await muat(htmlFrasaLambat({ frasa: FRASA, masa: 700 }));
  const frasa = await adapter.bacaKunciKeselamatan();
  assert.equal(frasa, FRASA);
});

test('adapter sebenar: tandakanKunciKeselamatan MENUNGGU kotak semak yang muncul lewat dan mendedahkan kata laluan', async () => {
  await muat(htmlKotakLambat({ masa: 700 }));
  const hasil = await adapter.tandakanKunciKeselamatan();
  assert.equal(hasil, true);
  const keadaan = await page.evaluate(() => ({
    ditanda: document.getElementById('check_log').checked,
    pwdNampak: (() => { const p = document.getElementById('password'); return !!p && !p.disabled && p.offsetParent !== null; })()
  }));
  assert.equal(keadaan.ditanda, true);
  assert.equal(keadaan.pwdNampak, true);
});

function htmlButangLanjutLambat({ masa = 700 } = {}) {
  return (
    '<!doctype html><html><body>' +
    '<div id="peringkat-ic"></div>' +
    '<div id="peringkat-verifikasi" style="display:none">' +
    '<div class="label-kunci">Kata Kunci Keselamatan</div>' +
    '<label><input type="checkbox"> Ya, ini adalah Kata Kunci Keselamatan saya.</label>' +
    '</div>' +
    '<script>' +
    'setTimeout(function () {' +
    '  var b = document.createElement("button");' +
    '  b.id = "butang-seterusnya";' +
    '  b.textContent = "Seterusnya";' +
    '  b.addEventListener("click", function () {' +
    '    document.getElementById("peringkat-ic").style.display = "none";' +
    '    document.getElementById("peringkat-verifikasi").style.display = "block";' +
    '  });' +
    '  document.getElementById("peringkat-ic").appendChild(b);' +
    '}, ' + masa + ');' +
    '</script>' +
    '</body></html>'
  );
}

test('adapter sebenar: lanjutkanPengesahan MENUNGGU butang Seterusnya yang muncul lewat dan beralih ke halaman pengesahan', async () => {
  await muat(htmlButangLanjutLambat({ masa: 700 }));
  const hasil = await adapter.lanjutkanPengesahan();
  assert.equal(hasil.ok, true);
});

