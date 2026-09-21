// Had kadar log masuk idMe automatik — PERSISTEN merentas restart
// (companion/src/moeis/had-login.mjs).
//
// Menggantikan had lama "2 cubaan per PROSES" (kaunter dalam ingatan, ditetapkan
// semula pada setiap restart) dengan siling KADAR yang kekal merentas restart
// dalam tetingkap sejuk: cap masa setiap percubaan gagal ditulis ke fail kecil
// (JSON biasa, TIADA rahsia — hanya cap masa epoch) supaya gelung crash/restart
// tidak boleh menghasilkan lebih daripada `hadCubaan` percubaan log masuk dalam
// `tetingkapMs` terhadap idMe (perlindungan kunci akaun).
//
// Ini ialah pembetulan cadangan semakan bebas kredensial (Claude, keluarga
// model berbeza) yang sebelum ini diterima sebagai "had terdokumen": pembilang
// + cap masa dalam fail kecil untuk merentas restart dalam tetingkap sejuk.
//
// GAGAL TERTUTUP: (a) cap masa MASA DEPAN (jam Windows digulung ke belakang)
// dikira sebagai AKTIF — gulung-balik jam tidak memulihkan kapasiti serta-merta;
// (b) keadaan yang ROSAK/tidak boleh baca (`baca` MELONTAR) dianggap BLOK —
// fail korup tidak menetapkan semula siling kepada sifar. Laluan pemulihan ialah
// log masuk manual yang berjaya (`catatKejayaan` menulis semula `{ percubaan: [] }`).
//
// Kontrak `baca`: `null`/`undefined` = tiada fail (larian pertama, dibenarkan);
// objek = keadaan boleh baca; MELONTAR = fail wujud tetapi rosak (BLOK).
//
// Tulen: `baca`/`tulis`/`sekarangMs` disuntik supaya ujian guna storan dalam
// ingatan tanpa fail/rangkaian. Tiada nilai kredensial di sini — hanya cap masa.

export const HAD_LOGIN_CUBAAN = 2;                 // maks percubaan gagal per tetingkap
export const TETINGKAP_LOGIN_MS = 15 * 60 * 1000;  // tetingkap sejuk: 15 minit

export function buatHadKadarLogin({
  baca,                                             // () -> { percubaan: [...] } | null (lihat kontrak)
  tulis,                                            // ({ percubaan: [...] }) -> void
  sekarangMs = () => Date.now(),
  hadCubaan = HAD_LOGIN_CUBAAN,
  tetingkapMs = TETINGKAP_LOGIN_MS
}) {
  // Pulangkan { rosak, senarai }. rosak=true apabila baca() melontar (fail
  // wujud tetapi tidak boleh dihuraikan) — isyarat BLOK, bukan sifar.
  function bacaSenarai() {
    let mentah;
    try {
      mentah = typeof baca === 'function' ? baca() : null;
    } catch {
      return { rosak: true, senarai: [] };
    }
    const senarai = (mentah && Array.isArray(mentah.percubaan) ? mentah.percubaan : [])
      .filter((t) => Number.isFinite(t));
    return { rosak: false, senarai };
  }

  // Cap masa dalam tetingkap sejuk dikira. Cap masa MASA DEPAN (sekarang - t < 0,
  // akibat gulung-balik jam) TIDAK dibuang — ia dikira AKTIF supaya siling kadar
  // gagal TERTUTUP terhadap reset jam. Cap masa lama dibuang secara semula jadi.
  function dalamTetingkap(senarai, sekarang) {
    return senarai.filter((t) => sekarang - t <= tetingkapMs);
  }

  function bolehCuba() {
    const { rosak, senarai } = bacaSenarai();
    if (rosak) return false; // gagal tertutup: fail korup = blok
    return dalamTetingkap(senarai, sekarangMs()).length < hadCubaan;
  }

  function bilPercubaan() {
    const { rosak, senarai } = bacaSenarai();
    if (rosak) return hadCubaan; // laporkan penuh supaya status tidak mengelirukan
    return dalamTetingkap(senarai, sekarangMs()).length;
  }

  // Rezab SATU slot SEBELUM menjalankan log masuk — supaya percubaan yang
  // terhempas di tengah jalan (crash proses anak) masih dikira secara kekal.
  // Berjaya kemudian dipanggil `catatKejayaan()` untuk mengosongkan pembilang.
  function catatPercubaan() {
    const { senarai } = bacaSenarai();
    const sekarang = sekarangMs(); // tangkap SEKALI supaya cap masa konsisten
    const aktif = dalamTetingkap(senarai, sekarang);
    aktif.push(sekarang);
    if (typeof tulis === 'function') tulis({ percubaan: aktif });
  }

  // Log masuk berjaya bermakna akaun TIDAK dikunci — kosongkan pembilang
  // supaya kegagalan lalu tidak menghukum percubaan masa depan yang sah.
  // Ini juga merupakan laluan PEMULIHAN bagi fail yang rosak (tulis semula bersih).
  function catatKejayaan() {
    if (typeof tulis === 'function') tulis({ percubaan: [] });
  }

  return { bolehCuba, catatPercubaan, catatKejayaan, bilPercubaan };
}
