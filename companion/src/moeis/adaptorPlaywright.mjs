// Adapter Playwright sebenar (companion/src/moeis/adaptorPlaywright.mjs).
//
// Melaksanakan antara muka yang digunakan oleh halaman.mjs/push.mjs terhadap
// pelayar Edge sebenar. TIDAK PERNAH diuji terhadap MOEIS/idMe hidup (larangan
// keras brief pelaksanaan) — hanya dilog sebagai belum disahkan hidup dalam
// docs/PEMASANGAN.md. Selektor diwarisi daripada moeis-bot/push.mjs
// (rujukan baca sahaja, projek itu tidak disentuh).
import { adalahHosIdMe } from './sesi.mjs';

const URL_KEHADIRAN_HARIAN = 'https://moeispel.moe.gov.my/sahsiah/kehadiran/pkhem/tabguru';
const jeda = (ms) => new Promise((r) => setTimeout(r, ms));

export function buatAdaptorPlaywright(page) {
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
    async urlHalaman() {
      return page.url();
    },
    // Kunci keselamatan anti-pancing idMe: cuba beberapa selektor teks yang
    // munasabah; jika tiada satu pun ditemui, pulangkan null (JANGAN gagal
    // keras — sesi.mjs melaporkan status kunci:'tiada' dalam kes ini).
    async bacaKunciKeselamatan() {
      return page.evaluate(() => {
        var petunjuk = /kunci keselamatan|security phrase|security key|frasa keselamatan/i;
        var kontena = Array.from(document.querySelectorAll('body *')).find(function (el) {
          return el.children.length <= 2 && petunjuk.test(el.textContent || '');
        });
        if (!kontena) return null;
        var teksNode = kontena.querySelector('b, strong, span, .security-phrase, .kunci-keselamatan') || kontena;
        var teks = (teksNode.textContent || '').replace(petunjuk, '').trim();
        return teks || null;
      }).catch(() => null);
    },
    async semakCaptchaOtp() {
      const ada = await page.evaluate(() =>
        !!document.querySelector('.g-recaptcha, iframe[src*="recaptcha"], input[name*="otp" i], input[autocomplete="one-time-code"]')
      ).catch(() => false);
      return ada ? { sebab: 'CAPTCHA/OTP dikesan; perlu campur tangan manusia.' } : null;
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
      return page.waitForFunction(() => {
        const e = document.querySelector('.sweet-alert h2');
        return e && e.textContent.trim() === 'Berjaya.';
      }, { timeout: 30000 }).then(() => true).catch(() => false);
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
