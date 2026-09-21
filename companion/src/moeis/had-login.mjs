// Had kadar log masuk idMe automatik — PERSISTEN BERTERUSAN, merentas restart
// DAN merentas hari (companion/src/moeis/had-login.mjs).
//
// KELULUSAN PEMILIK (2026-09-21): had kadar BERTERUSAN supaya sesi idMe yang
// tamat dipulihkan sendiri sepanjang hari tanpa restart. Polisi diluluskan
// secara eksplisit:
//   - maksimum HAD_LOGIN_JAM (6) percubaan dalam tetingkap SEJAM gelongsor;
//   - siling HARIAN SILING_LOGIN_HARIAN (24), TIDAK dikosongkan oleh
//     kejayaan — hanya hari baharu (UTC) atau tetapan semula manual
//     (padam fail keadaan) mengosongkannya;
//   - berhenti serta-merta (tiada cubaan semula) selepas
//     HAD_KEGAGALAN_BERTURUT (3) KEGAGALAN BERTURUT-TURUT; hanya
//     catatKejayaan() mengosongkan pembilang ini.
//
// GAGAL TERTUTUP (tidak berubah daripada versi sebelum ini, dikembangkan):
//   (a) cap masa MASA DEPAN (jam Windows digulung ke belakang dalam tetingkap
//       sejam) dikira sebagai AKTIF — gulung-balik jam tidak memulihkan
//       kapasiti serta-merta;
//   (b) keadaan yang ROSAK/tidak boleh baca (`baca` MELONTAR) dianggap BLOK —
//       fail korup tidak menetapkan semula siling kepada sifar;
//   (c) BAHARU: jika hari (UTC, YYYY-MM-DD) yang dikira daripada `sekarangMs()`
//       lebih AWAL daripada `hariIso` yang disimpan, jam telah digulung ke
//       belakang merentas sempadan hari — dianggap BLOK juga (siling harian
//       tidak boleh "dipulihkan" dengan menggulung jam ke semalam).
//
// Kontrak `baca`: `null`/`undefined` = tiada fail (larian pertama, dibenarkan);
// objek = keadaan boleh baca; MELONTAR = fail wujud tetapi rosak (BLOK).
//
// Tulen: `baca`/`tulis`/`sekarangMs` disuntik supaya ujian guna storan dalam
// ingatan tanpa fail/rangkaian. Tiada nilai kredensial di sini — hanya cap
// masa dan pembilang.
//
// Keadaan disimpan: { percubaan: [epochMs...], kegagalanBerturut, hariIso,
// bilHariIni }. `percubaan` disimpan dipangkas kepada tetingkap sejam sahaja
// (elak fail membesar tanpa had); siling harian dikira secara berasingan
// dalam `bilHariIni` supaya ia TIDAK terjejas oleh pemangkasan tetingkap
// sejam.

export const HAD_LOGIN_JAM = 6;                        // maks percubaan / tetingkap sejam gelongsor
export const TETINGKAP_LOGIN_JAM_MS = 60 * 60 * 1000;  // 1 jam
export const SILING_LOGIN_HARIAN = 24;                 // maks percubaan / hari (UTC), tidak dikosongkan kejayaan
export const HAD_KEGAGALAN_BERTURUT = 3;                // berhenti serta-merta selepas ini

function hariIsoDaripadaMs(ms) {
  // Hari KALENDAR MALAYSIA (UTC+8), bukan hari UTC. Malaysia tiada DST, jadi
  // ofset tetap selamat. Sempadan hari yang penting bagi guru ialah tengah
  // malam tempatan — bukan 08:00 pagi (tengah hari persekolahan).
  const OFSET_MS = 8 * 60 * 60 * 1000;
  return new Date(ms + OFSET_MS).toISOString().slice(0, 10); // YYYY-MM-DD (MYT)
}

export function buatHadKadarLogin({
  baca,                                             // () -> keadaan | null (lihat kontrak)
  tulis,                                            // (keadaan) -> void
  sekarangMs = () => Date.now(),
  hadJam = HAD_LOGIN_JAM,
  tetingkapJamMs = TETINGKAP_LOGIN_JAM_MS,
  silingHarian = SILING_LOGIN_HARIAN,
  hadKegagalanBerturut = HAD_KEGAGALAN_BERTURUT
}) {
  const KEADAAN_KOSONG = Object.freeze({ percubaan: [], kegagalanBerturut: 0, hariIso: '', bilHariIni: 0 });

  // Pulangkan { rosak, keadaan }. rosak=true apabila baca() melontar (fail
  // wujud tetapi tidak boleh dihuraikan) — isyarat BLOK, bukan sifar.
  function bacaKeadaan() {
    let mentah;
    try {
      mentah = typeof baca === 'function' ? baca() : null;
    } catch {
      return { rosak: true, keadaan: KEADAAN_KOSONG };
    }
    if (!mentah || typeof mentah !== 'object') return { rosak: false, keadaan: KEADAAN_KOSONG };
    const percubaan = (Array.isArray(mentah.percubaan) ? mentah.percubaan : []).filter((t) => Number.isFinite(t));
    const kegagalanBerturut = Number.isFinite(mentah.kegagalanBerturut) && mentah.kegagalanBerturut >= 0
      ? mentah.kegagalanBerturut : 0;
    const hariIso = typeof mentah.hariIso === 'string' ? mentah.hariIso : '';
    const bilHariIni = Number.isFinite(mentah.bilHariIni) && mentah.bilHariIni >= 0 ? mentah.bilHariIni : 0;
    return { rosak: false, keadaan: { percubaan, kegagalanBerturut, hariIso, bilHariIni } };
  }

  // Cap masa dalam tetingkap sejam gelongsor dikira. Cap masa MASA DEPAN
  // (sekarang - t < 0, akibat gulung-balik jam) TIDAK dibuang — ia dikira
  // AKTIF supaya siling kadar gagal TERTUTUP terhadap reset jam.
  function dalamTetingkapJam(percubaan, sekarang) {
    return percubaan.filter((t) => sekarang - t <= tetingkapJamMs);
  }

  // Snapshot bersepadu: baca keadaan, kira hari semasa, kesan gulung-balik
  // jam merentas sempadan hari. `gulungBalik` = true bermakna BLOK, sama
  // seperti `rosak`.
  function snapshot() {
    const sekarang = sekarangMs();
    const hariSemasa = hariIsoDaripadaMs(sekarang);
    const { rosak, keadaan } = bacaKeadaan();
    const gulungBalik = !rosak && keadaan.hariIso !== '' && hariSemasa < keadaan.hariIso;
    const hariBaru = !rosak && !gulungBalik && (keadaan.hariIso === '' || hariSemasa > keadaan.hariIso);
    const bilHariIniEfektif = hariBaru ? 0 : keadaan.bilHariIni;
    return { sekarang, hariSemasa, rosak, gulungBalik, hariBaru, keadaan, bilHariIniEfektif };
  }

  function bolehCuba() {
    const s = snapshot();
    if (s.rosak) return false; // gagal tertutup: fail korup = blok
    if (s.gulungBalik) return false; // gagal tertutup: jam digulung ke belakang merentas hari = blok
    if (s.keadaan.kegagalanBerturut >= hadKegagalanBerturut) return false; // berhenti serta-merta
    if (s.bilHariIniEfektif >= silingHarian) return false; // siling harian
    return dalamTetingkapJam(s.keadaan.percubaan, s.sekarang).length < hadJam;
  }

  function bilPercubaan() {
    const s = snapshot();
    if (s.rosak || s.gulungBalik) return hadJam; // laporkan penuh supaya status tidak mengelirukan
    return dalamTetingkapJam(s.keadaan.percubaan, s.sekarang).length;
  }

  // Rezab SATU slot SEBELUM menjalankan log masuk — supaya percubaan yang
  // terhempas di tengah jalan (crash proses anak) masih dikira secara kekal.
  // Andaian: pemanggil sudah menyemak bolehCuba() dahulu (pengurus cubaan).
  function catatPercubaan() {
    const s = snapshot();
    const keadaanAsas = s.rosak ? KEADAAN_KOSONG : s.keadaan;
    const aktifJam = dalamTetingkapJam(keadaanAsas.percubaan, s.sekarang);
    aktifJam.push(s.sekarang);
    const bilHariIniBaru = (s.rosak ? 0 : s.bilHariIniEfektif) + 1;
    if (typeof tulis === 'function') {
      tulis({
        percubaan: aktifJam,
        kegagalanBerturut: s.rosak ? 0 : keadaanAsas.kegagalanBerturut,
        hariIso: s.hariSemasa,
        bilHariIni: bilHariIniBaru
      });
    }
  }

  // Log masuk berjaya bermakna akaun TIDAK dikunci — kosongkan tetingkap
  // sejam DAN kegagalan berturut-turut, TETAPI KEKALKAN bilHariIni (siling
  // harian TIDAK dikosongkan oleh kejayaan — diluluskan pemilik).
  function catatKejayaan() {
    const s = snapshot();
    const bersihkan = s.rosak || s.gulungBalik; // fail korup ATAU gulung-balik jam = tulis keadaan bersih
    if (typeof tulis === 'function') {
      tulis({
        percubaan: [],
        kegagalanBerturut: 0,
        hariIso: s.hariSemasa,
        bilHariIni: bersihkan ? 0 : s.bilHariIniEfektif
      });
    }
  }

  // Kegagalan (bukan kejayaan) menambah pembilang kegagalan-berturut-turut;
  // 3 berturut-turut = berhenti serta-merta (bolehCuba() jadi false) sehingga
  // catatKejayaan() dipanggil (log masuk manual berjaya).
  function catatKegagalan() {
    const s = snapshot();
    const keadaanAsas = s.rosak ? KEADAAN_KOSONG : s.keadaan;
    if (typeof tulis === 'function') {
      tulis({
        percubaan: dalamTetingkapJam(keadaanAsas.percubaan, s.sekarang),
        kegagalanBerturut: (s.rosak ? 0 : keadaanAsas.kegagalanBerturut) + 1,
        hariIso: s.hariSemasa,
        bilHariIni: s.rosak ? 0 : s.bilHariIniEfektif
      });
    }
  }

  // Petikan status ringkas untuk UI/status endpoints — tiada nilai kredensial,
  // hanya pembilang dan sebab generik jika diblok.
  function statusRingkas() {
    const s = snapshot();
    // Angka SEBENAR yang tersimpan sahaja. Apabila keadaan tidak boleh dibaca
    // (`rosak`), pembilang dilaporkan `null` (UI memaparkan '?') — JANGAN
    // reka angka tepu 24/6/3 seolah-olah ia fakta yang diukur. `sebab`
    // menjelaskan keadaan sebenarnya.
    const bolehBaca = !s.rosak;
    const bilJam = bolehBaca ? dalamTetingkapJam(s.keadaan.percubaan, s.sekarang).length : null;
    const bilHariIni = bolehBaca ? s.bilHariIniEfektif : null;
    const kegagalanBerturut = bolehBaca ? s.keadaan.kegagalanBerturut : null;
    const diblok = !bolehCuba();
    let sebab = null;
    if (s.rosak) sebab = 'Keadaan had kadar log masuk rosak/tidak boleh dibaca; log masuk automatik diblok sehingga log masuk manual berjaya.';
    else if (s.gulungBalik) sebab = 'Jam sistem nampak digulung ke belakang merentas sempadan hari; log masuk automatik diblok (gagal tertutup).';
    else if (kegagalanBerturut >= hadKegagalanBerturut) sebab = `${hadKegagalanBerturut} kegagalan log masuk automatik berturut-turut; berhenti serta-merta sehingga log masuk manual berjaya.`;
    else if (bilHariIni >= silingHarian) sebab = `Siling harian ${silingHarian} percubaan dicapai; cuba lagi esok atau log masuk manual.`;
    else if (diblok) sebab = `Had ${hadJam} percubaan/jam dicapai; cuba lagi selepas tetingkap sejam gelongsor.`;
    return {
      bilJam, hadJam,
      bilHariIni, silingHarian,
      kegagalanBerturut, hadKegagalanBerturut,
      diblok, sebab,
      hariIso: bolehBaca ? s.hariSemasa : null
    };
  }

  return { bolehCuba, catatPercubaan, catatKejayaan, catatKegagalan, bilPercubaan, statusRingkas };
}
