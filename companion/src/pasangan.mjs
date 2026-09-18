// Pengurusan kod pasangan sekali guna + token klien (companion/src/pasangan.mjs).
// Kod pasangan hanya boleh dijana dari UI tempatan (bukti manusia berada di
// PC ini) dan sah selama 10 minit, sekali guna sahaja.
import crypto from 'node:crypto';

const TTL_KOD_MS = 10 * 60 * 1000;

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function bandingSelamat(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (ba.length !== bb.length) {
    // Tetap jalankan timingSafeEqual pada panjang sepadan supaya masa
    // perbandingan tidak membocorkan panjang rahsia melalui laluan awal.
    crypto.timingSafeEqual(ba, ba);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

export function buatPengurusPasangan({ simpanan, jamSekarang }) {
  const masaSekarang = jamSekarang || (() => Date.now());
  let kodAktif = null; // { kod, tamat }

  function janaKodPasangan() {
    const kod = crypto.randomBytes(5).toString('hex').toUpperCase().slice(0, 8);
    kodAktif = { kod, tamat: masaSekarang() + TTL_KOD_MS };
    return kod;
  }

  function kodSahDanGuna(kodDiberi) {
    if (!kodAktif) return false;
    if (masaSekarang() > kodAktif.tamat) { kodAktif = null; return false; }
    const sepadan = bandingSelamat(kodDiberi, kodAktif.kod);
    if (sepadan) kodAktif = null; // sekali guna
    return sepadan;
  }

  function pasang(kodDiberi, label) {
    if (!kodSahDanGuna(kodDiberi)) throw new Error('Kod pasangan tidak sah atau telah tamat tempoh.');
    const token = crypto.randomBytes(32).toString('hex');
    const data = simpanan.bacaSemua();
    const senarai = Array.isArray(data.klienSenarai) ? data.klienSenarai : [];
    senarai.push({
      id: crypto.randomUUID(),
      label: String(label || '').slice(0, 100) || 'Tanpa label',
      hashToken: hashToken(token),
      dicipta: new Date(masaSekarang()).toISOString(),
      gunaTerakhir: null
    });
    data.klienSenarai = senarai;
    simpanan.tulisSemua(data);
    return token;
  }

  function sahkanToken(token) {
    if (!token) return null;
    const data = simpanan.bacaSemua();
    const senarai = Array.isArray(data.klienSenarai) ? data.klienSenarai : [];
    const hDiberi = hashToken(token);
    for (const klien of senarai) {
      if (bandingSelamat(hDiberi, klien.hashToken)) {
        klien.gunaTerakhir = new Date(masaSekarang()).toISOString();
        simpanan.tulisSemua(data);
        return klien;
      }
    }
    return null;
  }

  function senaraiKlien() {
    const data = simpanan.bacaSemua();
    return (Array.isArray(data.klienSenarai) ? data.klienSenarai : [])
      .map((k) => ({ id: k.id, label: k.label, dicipta: k.dicipta, gunaTerakhir: k.gunaTerakhir }));
  }

  function batalSemua() {
    const data = simpanan.bacaSemua();
    data.klienSenarai = [];
    simpanan.tulisSemua(data);
  }

  function batalSatu(id) {
    const data = simpanan.bacaSemua();
    data.klienSenarai = (Array.isArray(data.klienSenarai) ? data.klienSenarai : []).filter((k) => k.id !== id);
    simpanan.tulisSemua(data);
  }

  return { janaKodPasangan, pasang, sahkanToken, senaraiKlien, batalSemua, batalSatu };
}
