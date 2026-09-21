// Adapter Playwright sebenar (companion/src/moeis/adaptorPlaywright.mjs).
//
// Melaksanakan antara muka yang digunakan oleh halaman.mjs/push.mjs terhadap
// pelayar Edge sebenar. TIDAK PERNAH diuji terhadap MOEIS/idMe hidup (larangan
// keras brief pelaksanaan) — hanya dilog sebagai belum disahkan hidup dalam
// docs/PEMASANGAN.md. Selektor diwarisi daripada moeis-bot/push.mjs
// (rujukan baca sahaja, projek itu tidak disentuh).
import fs from 'node:fs';
import path from 'node:path';
import { adalahHosIdMe, tentukanStatusSelepasHantar } from './sesi.mjs';
import { URL_APLIKASI_IDME, pilihPautanAplikasiMoeis, HOS_MOEIS } from './aplikasi.mjs';
import { sensor } from '../log.mjs';

const URL_KEHADIRAN_HARIAN = 'https://moeispel.moe.gov.my/sahsiah/kehadiran/pkhem/tabguru';
const URL_LOGIN_IDME = 'https://idme.moe.gov.my/';
const jeda = (ms) => new Promise((r) => setTimeout(r, ms));

// Sanitasi DOM selepas kegagalan log masuk, untuk bundle diagnostik LOKAL
// sahaja (tulisDiagnostikKegagalan di bawah). Fungsi TULEN dan BOLEH DISIRI
// (function.toString()) supaya boleh dihantar terus ke `page.evaluate(fn)`
// tanpa closure ke luar — ini juga membolehkan ujian mengimport dan
// menjalankannya terhadap halaman tempatan sebenar. JANGAN sekali-kali
// rujuk pemboleh ubah luar fungsi ini.
//
// Nota keselamatan: `sensor()` (log.mjs) TIDAK memask kata laluan — membuang
// NILAI setiap input/textarea di sini adalah satu-satunya pertahanan sebelum
// bundle ditulis ke cakera.
export function sanitasiDomLoginGagal() {
  var root = document.documentElement.cloneNode(true);

  // 1) Buang NILAI setiap input/textarea (kata laluan, IC, dll.).
  Array.prototype.forEach.call(root.querySelectorAll('input, textarea'), function (el) {
    el.removeAttribute('value');
    try { el.value = ''; } catch (e) { /* sesetengah jenis input tidak benarkan set value kosong */ }
  });

  // 2) Buang SEPENUHNYA medan hidden/CSRF/token (bukan sekadar nilai).
  var pemilihBuang = [
    'input[type=hidden]', 'input[name*=csrf i]', 'input[name*=token i]',
    'input[name*=_token]', 'input[name*=__RequestVerificationToken i]'
  ].join(', ');
  Array.prototype.forEach.call(root.querySelectorAll(pemilihBuang), function (el) {
    if (el.parentNode) el.parentNode.removeChild(el);
  });

  // 3) Gantikan frasa keselamatan yang dipaparkan dengan placeholder — SAMA
  //    laluan carian seperti bacaKunciKeselamatan() (kelas khusus dahulu,
  //    kemudian heuristik label pendek -> nextElementSibling) — struktur
  //    (tag + kelas) DIKEKALKAN, hanya textContent digantikan.
  var petunjuk = /kunci keselamatan|security phrase|security key|frasa keselamatan/i;
  var placeholder = '[FRASA-DISAMARKAN]';
  var kotakKhusus = root.querySelector('.security-phrase, .kunci-keselamatan, .kata-kunci-box');
  var sudahGanti = false;
  if (kotakKhusus) {
    var teksKhusus = (kotakKhusus.textContent || '').trim();
    if (teksKhusus && !petunjuk.test(teksKhusus)) {
      kotakKhusus.textContent = placeholder;
      sudahGanti = true;
    }
  }
  if (!sudahGanti) {
    var calon = Array.prototype.filter.call(root.querySelectorAll('*'), function (el) {
      var teks = (el.textContent || '').trim();
      return el.children.length === 0 && teks.length > 0 && teks.length <= 80 && petunjuk.test(teks);
    });
    for (var i = 0; i < calon.length; i++) {
      var label = calon[i];
      var kotakFrasa = label.nextElementSibling;
      if (!kotakFrasa || kotakFrasa.tagName === 'INPUT' || kotakFrasa.tagName === 'LABEL') continue;
      var teksFrasa = (kotakFrasa.textContent || '').trim();
      if (teksFrasa && !petunjuk.test(teksFrasa)) {
        kotakFrasa.textContent = placeholder;
        break;
      }
    }
  }

  return '<!DOCTYPE html>\n' + root.outerHTML;
}

// Fungsi TULEN dan BOLEH DISIRI (function.toString()) yang membaca frasa
// "Kata Kunci Keselamatan" daripada DOM idMe. Dipisahkan daripada
// bacaKunciKeselamatan() supaya adapter boleh meninjau DOM secara bersempadan
// (halaman lambat/separa dimuatkan) tanpa menghantar closure ke page.evaluate.
// Sama laluan carian seperti sebelumnya: kelas khusus dahulu, kemudian
// heuristik label pendek -> nextElementSibling. Pulangkan frasa (teks) atau
// null — JANGAN sekali-kali OCR/agak imej.
export function bacaFrasaKunciKeselamatan() {
  var petunjuk = /kunci keselamatan|security phrase|security key|frasa keselamatan/i;
  var kotakKhusus = document.querySelector('.security-phrase, .kunci-keselamatan, .kata-kunci-box');
  if (kotakKhusus) {
    var teksKhusus = (kotakKhusus.textContent || '').trim();
    if (teksKhusus && !petunjuk.test(teksKhusus)) return teksKhusus;
  }
  var calon = Array.from(document.querySelectorAll('body *')).filter(function (el) {
    var teks = (el.textContent || '').trim();
    return el.children.length === 0 && teks.length > 0 && teks.length <= 80 && petunjuk.test(teks);
  });
  for (var i = 0; i < calon.length; i++) {
    var label = calon[i];
    var kotakFrasa = label.nextElementSibling;
    if (!kotakFrasa || kotakFrasa.tagName === 'INPUT' || kotakFrasa.tagName === 'LABEL') continue;
    var teksFrasa = (kotakFrasa.textContent || '').trim();
    if (teksFrasa && !petunjuk.test(teksFrasa)) return teksFrasa;
  }
  return null;
}

export function buatAdaptorPlaywright(page, opsyen = {}) {
  const dirData = (opsyen && opsyen.dirData) || null;
  const tulisLog = typeof (opsyen && opsyen.tulisLog) === 'function' ? opsyen.tulisLog : () => {};
  // Had masa menunggu elemen log masuk menjadi SEDIA (hadir + kelihatan +
  // aktif). Boleh dikecilkan dalam ujian supaya laluan "tidak pernah muncul"
  // tidak perlu menunggu 15s sebenar.
  const masaSediaMs = (opsyen && typeof opsyen.masaSediaMs === 'number') ? opsyen.masaSediaMs : 15000;
  const jedaPollMs = (opsyen && typeof opsyen.jedaPollMs === 'number') ? opsyen.jedaPollMs : 250;

  // Tunggu sehingga SATU calon dalam `pilihanSelektor` menjadi SEDIA (hadir +
  // kelihatan + aktif) dalam had masa. Ini pengganti `.first().fill()` /
  // `.first().click()` yang membuta — yang melontar Timeout Playwright mentah
  // (30s) pada halaman lambat/separa dimuatkan. Pulangkan locator sedia atau
  // null (JANGAN throw).
  async function tungguSedia(pilihanSelektor, timeoutMs = masaSediaMs) {
    const mula = Date.now();
    while (Date.now() - mula < timeoutMs) {
      try {
        const loc = page.locator(pilihanSelektor.join(', '));
        const bilangan = await loc.count().catch(() => 0);
        for (let i = 0; i < bilangan; i++) {
          const satu = loc.nth(i);
          const [nampak, aktif] = await Promise.all([
            satu.isVisible().catch(() => false),
            satu.isEnabled().catch(() => false)
          ]);
          if (nampak && aktif) return satu;
        }
      } catch (_ralat) {
        // Halaman ranap / konteks pelayar lenyap SEMASA pengundian boleh
        // melempar ralat SINKRON (bukan sekadar penolakan promise) yang
        // .catch() pada count/isVisible TIDAK tangkap. Tangkap di sini supaya
        // ia TIDAK bocor sebagai "ralat teknikal" mentah; anggap belum sedia
        // dan cuba lagi sehingga had masa, kemudian pulangkan null.
      }
      await jeda(jedaPollMs);
    }
    return null;
  }

  return {
    async navigasiHarian() {
      await page.goto(URL_KEHADIRAN_HARIAN, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await jeda(4000);
    },
    async semakSesiDanCaptcha() {
      const url = page.url();
      // Semakan hos KETAT (adalahHosIdMe = HTTPS + hos tepat idme.moe.gov.my).
      // Regex longgar pada URL penuh boleh dipadankan oleh hos penyerang yang
      // membawa teks itu dalam laluan/query (penemuan semakan bebas).
      if (adalahHosIdMe(url)) return { sebab: 'Sesi idMe tamat; log masuk manual diperlukan pada PC ini.' };
      const adaCaptcha = await page.evaluate(() =>
        !!document.querySelector('.g-recaptcha, iframe[src*="recaptcha"], input[name*="otp" i]')
      ).catch(() => false);
      if (adaCaptcha) return { sebab: 'CAPTCHA/OTP dikesan; perlu campur tangan manusia.' };
      return null;
    },
    async tajuk() {
      return page.title();
    },
    // Adakah borang log masuk idMe sedang dipaparkan? Membolehkan sesi.mjs
    // membezakan "belum log masuk langsung" daripada "sudah log masuk idMe
    // tetapi aplikasi MOEIS belum dilancarkan dari portal" — dua keadaan yang
    // memerlukan tindakan pengguna yang berbeza.
    async adaBorangLogMasuk() {
      return page
        .evaluate(
          () =>
            !!document.querySelector(
              'input[type=password], input[name*="kata" i], input[name*=pass i],' +
                'input[placeholder*="KAD PENGENALAN" i], input[name*="pengenalan" i]'
            )
        )
        .catch(() => false);
    },
    async urlHalaman() {
      return page.url();
    },
    // Ikut pautan aplikasi MOEIS pada portal idMe supaya sesi MOEIS terbentuk.
    // Ini NAVIGASI sahaja: tiada kata laluan ditaip, tiada kotak semak log
    // masuk ditekan, tiada borang dihantar. Tanpa langkah ini, lawatan terus ke
    // moeispel.moe.gov.my dilencongkan kembali ke dashboard idMe.
    async lancarkanAplikasiMoeis() {
      await page.goto(URL_APLIKASI_IDME, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await jeda(4000);
      const senarai = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a')).map((a) => ({
          teks: (a.innerText || '').replace(/\s+/g, ' ').trim(),
          href: a.getAttribute('href') || ''
        }))
      );
      const pilih = pilihPautanAplikasiMoeis(senarai);
      if (!pilih) return { ok: false, sebab: 'Pautan aplikasi MOEIS tidak dijumpai pada halaman Aplikasi idMe.' };
      await page.goto(pilih.href, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await jeda(8000);
      const urlAkhir = page.url();
      let hos = '';
      try { hos = new URL(urlAkhir).hostname.toLowerCase(); } catch { hos = ''; }
      return {
        ok: hos === HOS_MOEIS,
        url: urlAkhir,
        sebab: hos === HOS_MOEIS ? null : 'Selepas mengikut pautan aplikasi, hos ialah ' + (hos || '(tiada)')
      };
    },
    // Kunci keselamatan anti-pancing idMe: cuba beberapa selektor teks yang
    // munasabah; jika tiada satu pun ditemui, pulangkan null (JANGAN gagal
    // keras — login-auto.mjs/sesi.mjs melaporkan status kunci:'tiada'/
    // 'kunci-tiada' dalam kes ini, BUKAN 'kunci-tidak-padan').
    // Kes IMEJ: jika label "Kata Kunci Keselamatan" wujud tetapi kontena tidak
    // membawa nilai teks (frasa dipaparkan sebagai <img> sahaja — kemungkinan
    // sebenar pada idMe yang belum disahkan hidup), `teks` akan kosong dan
    // fungsi ini turut memulangkan null dengan sengaja — pemanggil tidak
    // boleh mengagak nilai imej, jadi ia melaporkan 'kunci-tiada' dengan jujur
    // dan bukan mereka-reka padanan.
    // BELUM disahkan hidup — larangan keras brief; hanya dijalankan di sini,
    // tidak pernah dilog nilai.
    async bacaKunciKeselamatan() {
      // Tinjau DOM secara BERSEMPADAN (bukan sekali sahaja) supaya frasa yang
      // muncul sedikit lewat daripada kotak semak (halaman lambat/separa
      // dimuatkan) masih dibaca. Untuk frasa yang benar-benar imej (tiada
      // teks), tinjauan tamat selepas had masa dan pulangkan null — SAMA hasil
      // jujur seperti sebelumnya, hanya menunggu sebentar untuk keteguhan.
      const mula = Date.now();
      while (Date.now() - mula < masaSediaMs) {
        const frasa = await page.evaluate(bacaFrasaKunciKeselamatan).catch(() => null);
        if (frasa) return frasa;
        await jeda(jedaPollMs);
      }
      return null;
    },
    async semakCaptchaOtp() {
      const ada = await page.evaluate(() =>
        !!document.querySelector('.g-recaptcha, iframe[src*="recaptcha"], input[name*="otp" i], input[autocomplete="one-time-code"]')
      ).catch(() => false);
      return ada ? { sebab: 'CAPTCHA/OTP dikesan; perlu campur tangan manusia.' } : null;
    },
    // --- Kaedah log masuk automatik idMe (OPT-IN) ---
    // Ini SATU-SATUNYA tempat adapter menulis kredensial. Pemanggil tunggal
    // ialah login-auto.mjs (guarded oleh suis loginAuto + frasa + CAPTCHA).
    // Selektor BELUM disahkan hidup (larangan keras brief) — hanya jalankan
    // di sini, jangan sekali-kali log nilai.
    async navigasiLoginIdMe() {
      await page.goto(URL_LOGIN_IDME, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await jeda(4000);
    },
    // Isi medan IC (pengguna) SAHAJA pada halaman log masuk idMe. idMe
    // memerlukan IC dahulu untuk memaparkan frasa "Kata Kunci Keselamatan" —
    // medan kata laluan belum wujud pada peringkat ini.
    // BELUM disahkan hidup — larangan keras brief; hanya dijalankan di sini,
    // tidak pernah dilog nilai.
    async isiPenggunaIdMe(pengguna) {
      const pilihanPengguna = [
        'input[placeholder*="KAD PENGENALAN" i]', 'input[placeholder*="pengenalan" i]',
        'input[name*="pengenalan" i]', 'input[name*="ic" i]',
        'input[name="username"]', 'input[type="text"]'
      ];
      const medan = await tungguSedia(pilihanPengguna);
      if (!medan) {
        return {
          ok: false, status: 'medan-ic-tiada',
          sebab: 'Medan IC (KAD PENGENALAN) tidak muncul pada halaman log masuk idMe dalam masa dijangka (halaman mungkin lambat/separa dimuatkan); log masuk manual diperlukan.'
        };
      }
      try {
        await medan.fill(pengguna);
      } catch (ralat) {
        return {
          ok: false, status: 'medan-ic-gagal',
          sebab: 'Gagal mengisi medan IC: ' + String((ralat && ralat.message) || ralat).split('\n')[0]
        };
      }
      return { ok: true };
    },
    // Tekan butang lanjut/seterusnya pada halaman IC, kemudian tunggu halaman
    // pengesahan (/loginverification) — dikesan melalui laluan URL ATAU
    // kehadiran frasa/kotak semak kunci keselamatan. TIDAK sama dengan
    // hantarBorangLogMasuk() (butang "Daftar Masuk" berlainan, pada halaman
    // berlainan).
    // BELUM disahkan hidup — larangan keras brief; hanya dijalankan di sini,
    // tidak pernah dilog nilai.
    async lanjutkanPengesahan() {
      const pilihanButang = [
        'button:has-text("Seterusnya")', 'button:has-text("Teruskan")',
        'button:has-text("Continue")', 'button:has-text("Next")',
        'button[type="submit"]', 'input[type="submit"]'
      ];
      // Tunggu butang lanjut menjadi SEDIA (halaman lambat/separa dimuatkan)
      // sebelum mengklik — elak `.first().click()` memilih placeholder/tiada.
      const butang = await tungguSedia(pilihanButang);
      if (!butang) {
        return { ok: false, sebab: 'Butang lanjut/seterusnya tidak muncul pada halaman IC idMe dalam masa dijangka.' };
      }
      try {
        await butang.click({ timeout: 5000 });
      } catch (ralat) {
        return { ok: false, sebab: 'Tidak dapat menekan butang lanjut/seterusnya pada halaman IC idMe: ' + ralat.message };
      }
      // Playwright: waitForFunction(pageFunction, arg, options) — `arg` (kedua)
      // MESTI undefined di sini supaya { timeout } jatuh pada `options` (ketiga),
      // bukan senyap diabaikan sebagai `arg`.
      const jumpaVerifikasi = await page.waitForFunction(() => {
        const laluanSepadan = /\/loginverification/i.test(location.pathname);
        const adaFrasaAtauKotak = !!document.querySelector('input[type=checkbox]') ||
          /kata kunci keselamatan/i.test(document.body ? document.body.textContent || '' : '');
        return laluanSepadan || adaFrasaAtauKotak;
      }, undefined, { timeout: 15000 }).then(() => true).catch(() => false);
      if (!jumpaVerifikasi) {
        return { ok: false, sebab: 'Halaman pengesahan (/loginverification) tidak muncul selepas mengisi IC dalam masa dijangka.' };
      }
      return { ok: true };
    },
    // Tandakan kotak semak "Ya, ini adalah Kata Kunci Keselamatan saya." —
    // mendedahkan medan kata laluan yang sebelum ini tersembunyi. Hanya
    // dipanggil SELEPAS frasa disahkan padan (lihat login-auto.mjs).
    //
    // LIVE DOM idMe (bundle diagnostik sebenar 2026-09-21): kotak semak ialah
    // <input id="check_log" class="form-check-input" name="check"
    // type="checkbox"> di dalam <label> "Ya, ini adalah Kata Kunci
    // Keselamatan saya."; jQuery halaman mendedahkan kontena #submit_form
    // (yang memuat #password) apabila kotak ini ditanda. Sasarkan id yang
    // DIKENALI dahulu, dengan fallback kepada name dan heuristik label.
    //
    // Fail tertutup dengan sengaja (TIADA fallback kepada kotak semak
    // sewenang-wenangnya): jika tiada satu pun selektor sah dijumpai,
    // pulangkan `false` tanpa mengklik apa-apa. Guna aksi Playwright `.check()`
    // (idempotent — TIDAK menanggalkan tanda yang sudah ada — dan memancarkan
    // acara click/change sebenar supaya pengendali jQuery halaman tercetus),
    // bukannya element.click() mentah dalam evaluate yang tidak
    // berinteraksi dengan pengendali jQuery dengan boleh dipercayai.
    // Selepas ditanda, SAHKAN medan kata laluan benar-benar kelihatan/aktif
    // sebelum memulangkan `true` — pendedahan mungkin async (animasi/render).
    // BELUM disahkan hidup — larangan keras brief; hanya dijalankan di sini,
    // tidak pernah dilog nilai.
    async tandakanKunciKeselamatan() {
      const pilihanKotak = [
        'input#check_log[type="checkbox"]',
        'input[name="check"][type="checkbox"]',
        'label:has-text("Kata Kunci Keselamatan") input[type="checkbox"]'
      ];
      let kotak = null;
      // Tinjau BERSEMPADAN supaya kotak semak yang muncul sedikit lewat
      // (halaman lambat/separa dimuatkan) masih dijumpai — bukan sekali
      // semak count lalu serta-merta pulangkan false.
      const mulaKotak = Date.now();
      while (Date.now() - mulaKotak < masaSediaMs) {
        for (const sel of pilihanKotak) {
          const loc = page.locator(sel);
          const bilangan = await loc.count().catch(() => 0);
          if (bilangan > 0) { kotak = loc.first(); break; }
        }
        if (kotak) break;
        await jeda(jedaPollMs);
      }
      if (!kotak) return false;

      const sudahDitanda = await kotak.isChecked().catch(() => null);
      if (sudahDitanda !== true) {
        // Idempotent: .check() hanya menanda jika belum ditanda (TIDAK
        // menanggalkan tanda). Cuba juga apabila isChecked() gagal memulangkan
        // null (contoh perlumbaan sejurus selepas navigasi) — fail-tertutup
        // keseluruhan kekal dijaga oleh waitForFunction di bawah.
        await kotak.check({ timeout: 5000 }).catch(() => {});
      }

      // waitForFunction(pageFunction, arg, options) — `undefined` di kedudukan
      // `arg` supaya { timeout } jatuh pada `options`.
      return page.waitForFunction(() => {
        var pwd = document.querySelector('input[type=password]');
        return !!pwd && !pwd.disabled && pwd.offsetParent !== null;
      }, undefined, { timeout: 5000 }).then(() => true).catch(() => false);
    },
    // Isi kata laluan — hanya wujud SELEPAS tandakanKunciKeselamatan().
    // BELUM disahkan hidup — larangan keras brief; hanya dijalankan di sini,
    // tidak pernah dilog nilai.
    async isiKataLaluanIdMe(kataLaluan) {
      const pilihanKataLaluan = ['input[type="password"]', 'input[name*="kata" i]', 'input[name="password"]'];
      const medan = await tungguSedia(pilihanKataLaluan);
      if (!medan) {
        return {
          ok: false, status: 'medan-kata-laluan-tiada',
          sebab: 'Medan kata laluan tidak muncul pada halaman pengesahan idMe dalam masa dijangka; log masuk manual diperlukan.'
        };
      }
      try {
        await medan.fill(kataLaluan);
      } catch (ralat) {
        return {
          ok: false, status: 'medan-kata-laluan-gagal',
          sebab: 'Gagal mengisi medan kata laluan: ' + String((ralat && ralat.message) || ralat).split('\n')[0]
        };
      }
      return { ok: true };
    },
    // Hantar borang log masuk ("Daftar Masuk") pada halaman pengesahan —
    // selektor berlainan daripada lanjutkanPengesahan() dengan sengaja.
    //
    // idMe SEBENAR membawa DUA butang "Daftar Masuk" pada halaman pengesahan:
    // placeholder disabled/hidden `#log_disbale_form` (sentiasa hadir lebih
    // awal dalam DOM) DAN satu butang sebenar aktif+kelihatan. `.first()`
    // membuta memilih placeholder dan `click()` melontar Timeout Playwright
    // mentah (30s) yang bocor ke log companion sebagai "ralat teknikal".
    //
    // Pembetulan: imbas BERSEMPADAN (~8s, tinjau setiap ~250ms) kesemua
    // calon, klik HANYA yang kelihatan DAN aktif — TIDAK PERNAH `.first()`
    // membuta. Jika tiada calon sedemikian selepas had masa, pulangkan
    // keputusan berstruktur (BUKAN throw) supaya pemanggil boleh melaporkan
    // sebab jelas dan berhenti dengan perluManusia:true.
    async hantarBorangLogMasuk() {
      const pilihanSelektor = 'button:has-text("Daftar Masuk"), button[type="submit"], input[type="submit"], button.btn-login';
      const HAD_MASA_MS = 8000;
      const JEDA_POLL_MS = 250;
      const mula = Date.now();
      let butangSasaran = null;
      while (Date.now() - mula < HAD_MASA_MS) {
        const calon = page.locator(pilihanSelektor);
        const bilangan = await calon.count().catch(() => 0);
        for (let i = 0; i < bilangan; i++) {
          const satu = calon.nth(i);
          const [nampak, aktif] = await Promise.all([
            satu.isVisible().catch(() => false),
            satu.isEnabled().catch(() => false)
          ]);
          if (nampak && aktif) { butangSasaran = satu; break; }
        }
        if (butangSasaran) break;
        await jeda(JEDA_POLL_MS);
      }
      if (!butangSasaran) {
        return {
          ok: false, status: 'tiada-butang-hantar',
          sebab: 'Tiada butang "Daftar Masuk" yang aktif dan kelihatan pada halaman pengesahan idMe. ' +
            'Kemungkinan borang belum lengkap, kotak semak pengesahan belum ditanda, atau kata laluan tidak diterima.'
        };
      }

      // Pengawal pra-klik: log HANYA 3 boolean (TIDAK PERNAH nilai) segera
      // sebelum klik — bukti diagnostik tanpa membocorkan kredensial/frasa.
      const keadaan = await page.evaluate(() => {
        var petunjuk = /kata kunci keselamatan/i;
        var label = Array.from(document.querySelectorAll('label')).find(function (l) {
          return petunjuk.test(l.textContent || '');
        });
        var kotak = null;
        if (label) {
          kotak = label.querySelector('input[type=checkbox]') ||
            (label.htmlFor && document.getElementById(label.htmlFor)) ||
            (label.closest('div') && label.closest('div').querySelector('input[type=checkbox]'));
        }
        var pwd = document.querySelector('input[type=password]');
        return {
          kotakDitanda: !!(kotak && kotak.checked),
          kataLaluanTidakKosong: !!(pwd && pwd.value && pwd.value.length > 0),
          kataLaluanKelihatan: !!(pwd && !pwd.disabled && pwd.offsetParent !== null)
        };
      }).catch(() => ({ kotakDitanda: false, kataLaluanTidakKosong: false, kataLaluanKelihatan: false }));
      tulisLog('LOGIN_AUTO_PRAKLIK',
        `kotakDitanda=${keadaan.kotakDitanda} kataLaluanTidakKosong=${keadaan.kataLaluanTidakKosong} kataLaluanKelihatan=${keadaan.kataLaluanKelihatan}`);

      try {
        await butangSasaran.click({ timeout: 5000 });
      } catch (ralat) {
        return {
          ok: false, status: 'tiada-butang-hantar',
          sebab: 'Butang "Daftar Masuk" ditemui tetapi klik gagal (' +
            String((ralat && ralat.message) || ralat).split('\n')[0] + '); kemungkinan keadaan berubah serta-merta.'
        };
      }
      await jeda(5000);
      return { ok: true };
    },
    // Bundle diagnostik LOKAL SAHAJA selepas kegagalan log masuk — TIDAK
    // PERNAH dimuat naik/dilampirkan/dihantar ke mana-mana model/subagen.
    // Ditulis ke <dirData>/log/diagnostik-login-<masa>/ (folder log yang sama
    // seperti companion.log): dom-sanitasi.html (DOM disanitasi —
    // sanitasiDomLoginGagal), skrin.png (tangkapan skrin VIEWPORT, bukan
    // fullPage — elak menangkap kandungan luar skrin yang tidak berkaitan),
    // sebab.txt (sebab jujur, turut melalui sensor() log.mjs). Best-effort
    // sepenuhnya — kegagalan menulis diagnostik TIDAK BOLEH menjatuhkan
    // aliran log masuk utama.
    async tulisDiagnostikKegagalan(hasil) {
      if (!dirData) return;
      try {
        const cap = new Date().toISOString().replace(/[:.]/g, '-');
        const dirBundle = path.join(dirData, 'log', `diagnostik-login-${cap}`);
        fs.mkdirSync(dirBundle, { recursive: true });

        const domSanitasi = await page.evaluate(sanitasiDomLoginGagal).catch(() => '');
        fs.writeFileSync(path.join(dirBundle, 'dom-sanitasi.html'), domSanitasi || '', 'utf8');

        await page.screenshot({ path: path.join(dirBundle, 'skrin.png'), fullPage: false }).catch(() => {});

        const sebabTeks = sensor(String((hasil && hasil.sebab) || 'Tiada sebab dilaporkan.'));
        fs.writeFileSync(path.join(dirBundle, 'sebab.txt'), sebabTeks, 'utf8');

        tulisLog('DIAGNOSTIK_LOGIN', `Bundle diagnostik ditulis (tempatan sahaja): ${dirBundle}`);
      } catch (ralat) {
        tulisLog('DIAGNOSTIK_LOGIN', 'Gagal menulis bundle diagnostik: ' + String((ralat && ralat.message) || ralat));
      }
    },
    async sahkanSesiSelepasLogin() {
      await page.goto(URL_KEHADIRAN_HARIAN, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await jeda(5000);
      const url = page.url();
      let hos = '';
      try { hos = new URL(url).hostname.toLowerCase(); } catch { hos = ''; }

      // Selepas klik "Daftar Masuk", log masuk idMe yang BERJAYA selalunya
      // mendarat pada papan pemuka idMe (idme.moe.gov.my) — bukannya terus
      // ke MOEIS — kerana sesi MOEIS hanya terbentuk kemudian melalui pautan
      // Aplikasi/SSO (lihat aplikasi.mjs). Jadi hos==MOEIS BUKAN lagi satu-
      // satunya isyarat kejayaan: borang log masuk yang hilang (#check_log/
      // #password tiada) + penanda papan pemuka idMe (navigasi/Aplikasi/
      // Laporan/breadcrumb) juga bermaksud log masuk sudah selesai. Klasifikasi
      // dipusatkan dalam fungsi tulen `tentukanStatusSelepasHantar` (sesi.mjs)
      // supaya boleh diuji tanpa pelayar.
      const amatan = await page.evaluate(() => {
        const borangLogin = !!(
          document.querySelector('#check_log') ||
          document.querySelector('#password') ||
          document.querySelector('input[type=password], input[name*="kata" i], input[name*=pass i], input[placeholder*="KAD PENGENALAN" i], input[name*="pengenalan" i]')
        );
        const teksBadan = (document.body && document.body.innerText) || '';
        const dashboardIdMe = !!(
          document.querySelector('a[href*="list_aplikasi"]') ||
          document.querySelector('.breadcrumb, [class*="breadcrumb"]') ||
          /\b(Aplikasi|Laporan|Dashboard|Pengurusan)\b/i.test(teksBadan)
        );
        return { borangLogin, dashboardIdMe };
      }).catch(() => ({ borangLogin: false, dashboardIdMe: false }));
      const adaKehadiran = await page.evaluate(() => !!document.querySelector('#kehadiran')).catch(() => false);

      return tentukanStatusSelepasHantar({
        hos,
        borangLogin: amatan.borangLogin,
        dashboardIdMe: amatan.dashboardIdMe,
        adaKehadiran
      });
    },
    async bacaBilanganMurid() {
      return page.evaluate(() => document.querySelectorAll('#kehadiran input.case-hadir').length).catch(() => 0);
    },
    async klikTabHarian() {
      await page.locator('a[data-target="#kehadiranharian"]').click();
    },
    async tungguKemaskiniKelihatan() {
      await page.locator('#kemaskiniKehadiran').waitFor({ state: 'visible' });
    },
    async bacaTarikhInput() {
      return page.inputValue('#tkh_HH');
    },
    async tetapkanTarikhInput(paparanDdMmYyyy) {
      await page.locator('#tkh_HH').fill(paparanDdMmYyyy);
      await page.locator('#tkh_HH').dispatchEvent('change');
      await jeda(4000);
    },
    async pilihTahun(label) {
      return pilihDropdown(page, '#txtThnting', label);
    },
    async pilihKelas(label) {
      return pilihDropdown(page, '#txtNamakelas', label);
    },
    async bacaRingkasanKelas(tahun, kelas) {
      return page.evaluate(
        ([t, k]) => {
          // Padanan sama seperti pilihDropdown: tepat dahulu, kemudian awalan
          // yang TIDAK AMBIGU (HADIR "PRASEKOLAH" lawan MOEIS "PRASEKOLAH BIJAK").
          const norm = (x) => String(x == null ? '' : x).toUpperCase().replace(/[^A-Z0-9]/g, '');
          const nt = norm(t);
          const nk = norm(k);
          const baris = [];
          for (const tr of Array.from(document.querySelectorAll('tr'))) {
            const tds = Array.from(tr.querySelectorAll('td'));
            if (tds.length < 5) continue;
            const m = tds[4].innerText.match(/(\d+)\s*\/\s*(\d+)/);
            if (!m) continue;
            baris.push({ tds, m });
          }
          const unik = (pred) => {
            const calon = baris.filter(pred);
            return calon.length === 1 ? calon[0] : null;
          };
          const thnTepat = (b) => norm(b.tds[1].innerText) === nt;
          const klsTepat = (b) => norm(b.tds[2].innerText) === nk;
          const thnAwalan = (b) => norm(b.tds[1].innerText).startsWith(nt);
          const klsAwalan = (b) => norm(b.tds[2].innerText).startsWith(nk);
          const b =
            unik((x) => thnTepat(x) && klsTepat(x)) ||
            unik((x) => thnTepat(x) && klsAwalan(x)) ||
            unik((x) => thnAwalan(x) && klsTepat(x)) ||
            unik((x) => thnAwalan(x) && klsAwalan(x));
          if (!b) return null;
          return {
            hadir: parseInt(b.m[1], 10),
            jumlah: parseInt(b.m[2], 10),
            status: b.tds[3].innerText.trim().replace(/\s+/g, ' '),
            kelasPadan: b.tds[2].innerText.trim()
          };
        },
        [tahun, kelas]
      );
    },
    async bacaSenaraiMurid() {
      return page.evaluate(() =>
        Array.from(document.querySelectorAll('#kehadiran input.case-hadir')).map((cb) => ({
          id: cb.dataset.idpelajar, nama: cb.dataset.namapelajar, hadir: cb.checked
        }))
      );
    },
    async bacaKiraanSkrin() {
      const bilHadir = await page.inputValue('#bilhadir').catch(() => null);
      const bilTidakHadir = await page.inputValue('#biltidakhadir').catch(() => null);
      return { bilHadir, bilTidakHadir };
    },
    async tandaTidakHadir(id, kategori, sebab) {
      const sel = `#kehadiran input.case-hadir[data-idpelajar="${id}"]`;
      await page.evaluate((s) => document.querySelector(s).click(), sel);
      const nampak = await page.waitForFunction((s) => {
        const cb = document.querySelector(s);
        const td = cb && cb.closest('tr') && cb.closest('tr').querySelector('td.sebabthadir');
        return !!(td && td.querySelector('.selectkategori'));
      }, sel, { timeout: 15000 }).then(() => true).catch(() => false);
      if (!nampak) return { ralat: 'pemilih kategori tidak muncul' };
      const hasilKategori = await page.evaluate(([s, kat]) => {
        const td = document.querySelector(s).closest('tr').querySelector('td.sebabthadir');
        const el = td.querySelector('.selectkategori');
        const k = (kat || '').toUpperCase().trim();
        const opt = Array.from(el.options).find((o) => (o.value || '').toUpperCase() === k) ||
          Array.from(el.options).find((o) => o.textContent.trim().toUpperCase() === k);
        if (!opt || !opt.value) return null;
        el.value = opt.value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        if (window.jQuery) window.jQuery(el).trigger('change');
        return { value: opt.value, text: opt.textContent.trim() };
      }, [sel, kategori]);
      if (!hasilKategori) return { ralat: 'kategori tidak dijumpai: ' + kategori };
      await jeda(2500);
      const hasilSebab = await page.evaluate(([s, sb]) => {
        const td = document.querySelector(s).closest('tr').querySelector('td.sebabthadir');
        const el = td.querySelector('.selectsebab');
        if (!el) return { ralat: 'select sebab tiada' };
        const t = (sb || '').toUpperCase().trim();
        const opt = Array.from(el.options).find((o) => o.textContent.trim().toUpperCase() === t);
        if (!opt || !opt.value) return { ralat: 'sebab tidak dijumpai: ' + sb };
        el.value = opt.value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        if (window.jQuery) window.jQuery(el).trigger('change');
        return { value: opt.value, text: opt.textContent.trim() };
      }, [sel, sebab]);
      if (hasilSebab.ralat) return { ralat: hasilSebab.ralat };
      return {
        kategoriValue: hasilKategori.value, kategoriText: hasilKategori.text,
        sebabValue: hasilSebab.value, sebabText: hasilSebab.text, ralat: null
      };
    },
    async bacaSebabMurid(id) {
      const sel = `#kehadiran input.case-hadir[data-idpelajar="${id}"]`;
      return page.evaluate((s) => {
        const cb = document.querySelector(s);
        const td = cb && cb.closest('tr') && cb.closest('tr').querySelector('td.sebabthadir');
        if (!td) return null;
        const elK = td.querySelector('.selectkategori');
        const elS = td.querySelector('.selectsebab');
        const optK = elK && Array.from(elK.options).find((o) => o.value === elK.value);
        const optS = elS && Array.from(elS.options).find((o) => o.value === elS.value);
        return {
          kategoriValue: optK ? optK.value : '', kategoriText: optK ? optK.textContent.trim() : '',
          sebabValue: optS ? optS.value : '', sebabText: optS ? optS.textContent.trim() : ''
        };
      }, sel);
    },
    async pulihkanKeHadir(id) {
      await page.evaluate((s) => {
        const cb = document.querySelector(s);
        if (cb && !cb.checked) cb.click();
      }, `#kehadiran input.case-hadir[data-idpelajar="${id}"]`);
      await jeda(1200);
    },
    async tekanKemaskini() {
      await page.click('#kemaskiniKehadiran');
      await jeda(3500);
    },
    async dialogSimpanKelihatan() {
      return page.locator('.sweet-alert:visible button.simpan').waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
    },
    async klikSimpan() {
      await page.locator('.sweet-alert:visible button.simpan').click();
    },
    async klikSimpanSahkan() {
      await page.locator('.sweet-alert:visible button.simpansah').click();
    },
    async dialogBerjayaKelihatan() {
      // waitForFunction(pageFunction, arg, options) — `undefined` mesti hadir
      // sebagai `arg` supaya { timeout } tidak silap dianggap sebagai `arg`.
      return page.waitForFunction(() => {
        const e = document.querySelector('.sweet-alert h2');
        return e && e.textContent.trim() === 'Berjaya.';
      }, undefined, { timeout: 30000 }).then(() => true).catch(() => false);
    },
    async muatSemula() {
      await page.reload({ waitUntil: 'domcontentloaded' });
    },
    async tangkapSkrin(laluan) {
      await page.screenshot({ path: laluan, fullPage: true });
    },
    async jeda(ms) {
      await jeda(ms);
    }
  };
}

// Padanan label dropdown MOEIS. Tepat dahulu; jika tiada, padanan awalan yang
// TIDAK AMBIGU sahaja (contoh hidup: HADIR menyimpan "PRASEKOLAH" manakala
// MOEIS memaparkan "PRASEKOLAH BIJAK"). Dua calon atau lebih = BERHENTI,
// jangan sekali-kali teka kelas.
async function pilihDropdown(page, selektor, label) {
  const hasil = await page.evaluate(([s, l]) => {
    const norm = (x) => String(x == null ? '' : x).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const el = document.querySelector(s);
    if (!el) return { ok: false, mentah: 'tiada-elemen' };
    const sasaran = norm(l);
    const opsyen = Array.from(el.options).filter((o) => norm(o.textContent) !== '');
    let calon = opsyen.filter((o) => norm(o.textContent) === sasaran);
    let cara = 'tepat';
    if (!calon.length) {
      calon = opsyen.filter((o) => norm(o.textContent).startsWith(sasaran));
      cara = 'awalan';
    }
    if (calon.length !== 1) {
      return { ok: false, mentah: calon.length ? 'padanan-ambigu' : 'tiada-pilihan', bilanganCalon: calon.length };
    }
    const opt = calon[0];
    el.value = opt.value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    if (window.jQuery) window.jQuery(el).trigger('change');
    return { ok: true, mentah: opt.value, cara, padan: opt.textContent.trim() };
  }, [selektor, label]);
  await jeda(3000);
  return hasil;
}
