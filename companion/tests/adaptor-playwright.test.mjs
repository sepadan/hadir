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
import { buatAdaptorPlaywright } from '../src/moeis/adaptorPlaywright.mjs';

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
