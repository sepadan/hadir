// Adapter Playwright sebenar (companion/src/moeis/adaptorPlaywright.mjs).
//
// Melaksanakan antara muka yang digunakan oleh halaman.mjs/push.mjs terhadap
// pelayar Edge sebenar. TIDAK PERNAH diuji terhadap MOEIS/idMe hidup (larangan
// keras brief pelaksanaan) — hanya dilog sebagai belum disahkan hidup dalam
// docs/PEMASANGAN.md. Selektor diwarisi daripada moeis-bot/push.mjs
// (rujukan baca sahaja, projek itu tidak disentuh).
import fs from 'node:fs';
import path from 'node:path';
import { adalahHosIdMe } from './sesi.mjs';
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

export function buatAdaptorPlaywright(page, opsyen = {}) {
  const dirData = (opsyen && opsyen.dirData) || null;
  const tulisLog = typeof (opsyen && opsyen.tulisLog) === 'function' ? opsyen.tulisLog : () => {};
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
      return page.evaluate(() => {
        var petunjuk = /kunci keselamatan|security phrase|security key|frasa keselamatan/i;

        // 1) Selektor kelas khusus (jika idMe menggunakan salah satu nama
        //    biasa ini) — diterima HANYA jika teksnya sendiri BUKAN label
        //    (elak memadankan tajuk "Kata Kunci Keselamatan" sebagai frasa).
        var kotakKhusus = document.querySelector('.security-phrase, .kunci-keselamatan, .kata-kunci-box');
        if (kotakKhusus) {
          var teksKhusus = (kotakKhusus.textContent || '').trim();
          if (teksKhusus && !petunjuk.test(teksKhusus)) return teksKhusus;
        }

        // 2) Heuristik am: cari label/tajuk PENDEK (tiada anak elemen) yang
        //    memadankan petunjuk, kemudian ambil ELEMEN SELEPAS TERUS
        //    (nextElementSibling) sebagai kotak frasa — corak paparan biasa
        //    "tajuk" diikuti "nilai" dalam blok berasingan. PENTING: jangan
        //    sekali-kali kembalikan teks label itu sendiri (pepijat lama:
        //    kontena <=2 anak sering ialah label, bukan kotak frasa, dan
        //    replace() separa pada label menghasilkan serpihan palsu cth
        //    "Kata"). Jika elemen selepas terus ialah <img> (tiada teks) atau
        //    tiada langsung, JANGAN mengagak/OCR — pulangkan null dengan
        //    jujur supaya pemanggil melaporkan 'kunci-tiada', bukan fabrikasi.
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
      }).catch(() => null);
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
      await page.locator(pilihanPengguna.join(', ')).first().fill(pengguna);
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
      try {
        await page.locator(pilihanButang.join(', ')).first().click();
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
    // Fail tertutup dengan sengaja (TIADA fallback kepada kotak semak
    // sewenang-wenangnya): jika label pengesahan khusus ini tidak ditemui,
    // pulangkan `false` tanpa mengklik apa-apa — mengklik kotak salah pada
    // halaman tidak dikenali lebih berbahaya daripada tidak mengklik langsung.
    // Idempotent: hanya `.click()` jika belum ditanda (mengklik kotak yang
    // sudah ditanda akan MENYAHTANDA dan menyembunyikan semula kata laluan).
    // Selepas ditanda, SAHKAN medan kata laluan benar-benar kelihatan/aktif
    // sebelum memulangkan `true` — pendedahan mungkin async (animasi/render).
    // BELUM disahkan hidup — larangan keras brief; hanya dijalankan di sini,
    // tidak pernah dilog nilai.
    async tandakanKunciKeselamatan() {
      const kotakSedia = await page.evaluate(() => {
        var petunjuk = /kata kunci keselamatan/i;
        var label = Array.from(document.querySelectorAll('label')).find(function (l) {
          return petunjuk.test(l.textContent || '');
        });
        if (!label) return false;
        var kotak = label.querySelector('input[type=checkbox]') ||
          (label.htmlFor && document.getElementById(label.htmlFor)) ||
          (label.closest('div') && label.closest('div').querySelector('input[type=checkbox]'));
        if (!kotak) return false;
        if (!kotak.checked) kotak.click();
        return true;
      }).catch(() => false);
      if (!kotakSedia) return false;
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
      await page.locator(pilihanKataLaluan.join(', ')).first().fill(kataLaluan);
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
      if (hos === HOS_MOEIS) {
        const adaKehadiran = await page.evaluate(() => !!document.querySelector('#kehadiran')).catch(() => false);
        if (adaKehadiran) return { status: 'sesi-sah', hos };
        return { status: 'sesi-tamat', hos, sebab: 'Hos MOEIS dicapai tetapi elemen #kehadiran tiada.' };
      }
      return { status: 'sesi-tamat', hos, sebab: 'Selepas hantar, hos ialah ' + (hos || '(tiada)') + ' (bukan MOEIS).' };
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
          for (const tr of Array.from(document.querySelectorAll('tr'))) {
            const tds = Array.from(tr.querySelectorAll('td'));
            if (tds.length < 5) continue;
            if (tds[1].innerText.trim().toUpperCase() !== t.toUpperCase()) continue;
            if (tds[2].innerText.trim().toUpperCase() !== k.toUpperCase()) continue;
            const m = tds[4].innerText.match(/(\d+)\s*\/\s*(\d+)/);
            if (!m) continue;
            return { hadir: parseInt(m[1], 10), jumlah: parseInt(m[2], 10), status: tds[3].innerText.trim().replace(/\s+/g, ' ') };
          }
          return null;
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

async function pilihDropdown(page, selektor, label) {
  const hasil = await page.evaluate(([s, l]) => {
    const el = document.querySelector(s);
    if (!el) return { ok: false, mentah: 'tiada-elemen' };
    const opt = Array.from(el.options).find((o) => o.textContent.trim().toUpperCase() === l.toUpperCase());
    if (!opt) return { ok: false, mentah: 'tiada-pilihan' };
    el.value = opt.value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    if (window.jQuery) window.jQuery(el).trigger('change');
    return { ok: true, mentah: opt.value };
  }, [selektor, label]);
  await jeda(3000);
  return hasil;
}
