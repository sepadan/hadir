// Ralat aplikasi bertaip. Hanya kod dalam daftar ini boleh sampai kepada klien,
// dan klien sentiasa menerima mesej TETAP daripada daftar — bukan err.message
// (yang mungkin mengandungi teks hulu seperti JWT, URL atau data peribadi).

export const ERROR_CODES = Object.freeze({
  'invalid-request': [400, 'Permintaan tidak sah.'],
  'invalid-json': [400, 'Badan JSON tidak sah.'],
  'unknown-field': [400, 'Medan permintaan tidak dibenarkan.'],
  'invalid-target': [400, 'Sasaran navigasi tidak sah. Hanya control, idme atau moeis dibenarkan.'],
  'invalid-mode': [400, 'Mod paparan tidak sah.'],
  'manual-consent-required': [400, 'Persetujuan manual eksplisit diperlukan untuk setiap pautan kawalan penuh.'],
  'ticket-malformed': [400, 'Tiket pelancaran tidak sah.'],
  'ticket-invalid': [401, 'Tiket pelancaran tidak sah atau tamat tempoh.'],
  unauthorized: [401, 'Sesi pemilik tidak sah atau tamat tempoh.'],
  'forbidden-origin': [403, 'Permintaan silang-asal ditolak.'],
  'csrf-invalid': [403, 'Token CSRF tidak sah.'],
  'not-found': [404, 'Laluan tidak ditemui.'],
  'method-not-allowed': [405, 'Kaedah tidak dibenarkan.'],
  'sending-blocked': [405, 'Penghantaran kehadiran automatik disekat sepenuhnya dalam Fasa 1.'],
  'ticket-replayed': [409, 'Tiket telah digunakan.'],
  'no-session': [409, 'Tiada sesi pelayar aktif.'],
  'session-expired': [409, 'Sesi pelayar telah mencapai had 15 minit dan sedang/telah ditutup.'],
  'close-pending': [409, 'Penutupan sesi terdahulu belum disahkan. Cuba "Tutup sesi" semula sebentar lagi.'],
  'acquire-uncertain': [503, 'Status pelancaran pelayar tidak pasti. Pelancaran baharu disekat sehingga tempoh selamat 15 minit berlalu.'],
  'payload-too-large': [413, 'Muatan melebihi had 4 KiB.'],
  'unsupported-media-type': [415, 'Jenis kandungan tidak disokong.'],
  'rate-limited': [429, 'Sila tunggu 12 saat antara tindakan pelayar Cloudflare.'],
  'daily-cap': [429, 'Had pelancaran harian tercapai (maksimum 8 cubaan sehari, waktu Kuala Lumpur).'],
  'nonce-store-full': [429, 'Terlalu banyak tiket dalam tempoh singkat. Cuba lagi selepas 2 minit.'],
  internal: [500, 'Ralat dalaman.'],
  'navigation-failed': [502, 'Sesi dibuka tetapi navigasi gagal atau tidak pasti. Sesi dikekalkan; guna "Semak halaman".'],
  'cdp-failed': [502, 'Sambungan CDP ke pelayar gagal.'],
  'liveview-failed': [502, 'Gagal menjana pautan Live View.'],
  'liveview-url-untrusted': [502, 'Pautan Live View yang dipulangkan bukan daripada asal Cloudflare yang dipercayai. Ditolak.'],
  'cdp-method-denied': [500, 'Arahan CDP tidak dibenarkan.'],
  'not-configured': [503, 'Panel belum dikonfigurasi.'],
  'browser-unavailable': [503, 'Binding pelayar Cloudflare tidak tersedia.'],
  'lookup-unavailable': [503, 'Status sesi pelayar tidak dapat disahkan. Tiada pelancaran baharu dibuat.'],
  'snapshot-unavailable': [503, 'Paparan baca-sahaja tidak tersedia: guardrail readonly tidak disahkan dan tangkapan skrin gagal.'],
  'cdp-timeout': [504, 'Pelayar tidak menjawab dalam had masa.']
});

export class AppError extends Error {
  constructor(code, opts = {}) {
    const entry = ERROR_CODES[code] || ERROR_CODES.internal;
    super(opts.message || entry[1]);
    this.name = 'AppError';
    this.code = ERROR_CODES[code] ? code : 'internal';
    this.status = opts.status || entry[0];
    if (Number.isInteger(opts.retryAfterSec) && opts.retryAfterSec > 0) this.retryAfterSec = opts.retryAfterSec;
  }
}

export function isKnownCode(code) {
  return typeof code === 'string' && Object.hasOwn(ERROR_CODES, code);
}

/** Tukar sebarang ralat kepada bentuk selamat untuk klien. */
export function toSafeError(err) {
  if (err instanceof AppError) {
    const out = { status: err.status, code: err.code, error: ERROR_CODES[err.code][1] };
    if (err.retryAfterSec) out.retryAfterSec = err.retryAfterSec;
    return out;
  }
  return { status: 500, code: 'internal', error: ERROR_CODES.internal[1] };
}
