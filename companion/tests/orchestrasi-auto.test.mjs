import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cubaAutoMula, pasangPemulihanAutoMula } from '../src/orchestrasi-auto.mjs';

const SEKARANG = Date.parse('2026-09-21T01:00:00.000Z');
const SEMPADAN = Date.parse('2026-09-21T00:30:00.000Z');

function tetapan(ubah = {}) {
  return {
    autoMulaGiliran: true,
    kalendarSekolah: ['2026-09-21'],
    autoMulaDiaktifkanPada: '2026-09-21T00:00:00.000Z',
    intervalSaat: 90,
    ...ubah
  };
}

test('default OFF tidak membuat probe rangkaian/sesi dan tidak memulakan giliran', async () => {
  const panggilan = [];
  const hasil = await cubaAutoMula({
    bacaTetapan: () => tetapan({ autoMulaGiliran: false }),
    sekarangMs: () => SEKARANG, sempadanProsesMs: SEMPADAN,
    adaRahsiaEnjin: () => { panggilan.push('rahsia'); return true; },
    klaimDisokong: async () => { panggilan.push('klaim'); return true; },
    sesiDisahkan: async () => { panggilan.push('sesi'); return { ada: true }; },
    mulakanGiliran: () => panggilan.push('mula'),
    tulisLog: () => {}
  });
  assert.equal(hasil.bermula, false);
  assert.match(hasil.sebab, /dimatikan/i);
  assert.deepEqual(panggilan, []);
});

test('startup fixture memulakan giliran hanya selepas semua pengawal lulus', async () => {
  const panggilan = [];
  const hasil = await cubaAutoMula({
    bacaTetapan: () => tetapan(),
    sekarangMs: () => SEKARANG, sempadanProsesMs: SEMPADAN,
    adaRahsiaEnjin: () => true,
    klaimDisokong: async () => { panggilan.push('klaim'); return true; },
    sesiDisahkan: async () => { panggilan.push('sesi'); return { ada: true, sebab: 'SSO persisten sah.' }; },
    mulakanGiliran: (interval, opsyen) => panggilan.push(['mula', interval, opsyen]),
    tulisLog: (...args) => panggilan.push(['log', ...args])
  });
  assert.equal(hasil.bermula, true);
  assert.deepEqual(panggilan[2], ['mula', 90, { automatik: true }]);
  assert.deepEqual(panggilan.slice(0, 2), ['klaim', 'sesi']);
});

test('ralat sesi kelihatan dan queue kekal mati', async () => {
  let mula = 0;
  const hasil = await cubaAutoMula({
    bacaTetapan: () => tetapan(),
    sekarangMs: () => SEKARANG, sempadanProsesMs: SEMPADAN,
    adaRahsiaEnjin: () => true,
    klaimDisokong: async () => true,
    sesiDisahkan: async () => { throw new Error('Edge profile sedang dikunci'); },
    mulakanGiliran: () => { mula++; }, tulisLog: () => {}
  });
  assert.equal(mula, 0);
  assert.equal(hasil.bermula, false);
  assert.match(hasil.sebab, /Edge profile sedang dikunci/);
});

// ---------------- pasangPemulihanAutoMula (pemulihan giliran, bounded) ----------------

test('pemulihan: berhenti serta-merta apabila autoMulaGiliran MATI (tiada panggilan login/auto-mula)', async () => {
  const panggilan = [];
  const p = pasangPemulihanAutoMula({
    bacaTetapan: () => ({ autoMulaGiliran: false }),
    giliranAktif: () => false,
    cubaLoginAutoKerja: async () => { panggilan.push('login'); },
    cubaAutoMula: async () => { panggilan.push('auto-mula'); return { bermula: false }; },
    tulisLog: () => {}
  });
  p.mula();
  assert.equal(p.berjalan(), true);
  await p._kitar();
  assert.deepEqual(panggilan, [], 'suis MATI mesti mengelak sebarang panggilan login/auto-mula');
  assert.equal(p.berjalan(), false, 'pemulihan mesti berhenti apabila suis MATI');
});

test('pemulihan: berhenti apabila giliran sudah aktif (tiada panggilan login/auto-mula)', async () => {
  const panggilan = [];
  const p = pasangPemulihanAutoMula({
    bacaTetapan: () => ({ autoMulaGiliran: true }),
    giliranAktif: () => true,
    cubaLoginAutoKerja: async () => { panggilan.push('login'); },
    cubaAutoMula: async () => { panggilan.push('auto-mula'); return { bermula: false }; },
    tulisLog: () => {}
  });
  p.mula();
  await p._kitar();
  assert.deepEqual(panggilan, [], 'giliran aktif mesti mengelak sebarang panggilan login/auto-mula');
  assert.equal(p.berjalan(), false, 'pemulihan mesti berhenti apabila giliran sudah aktif');
});

test('pemulihan: mencuba login + auto-mula setiap kitaran (login tidak memerlukan manusia), berhenti sebaik auto-mula bermula', async () => {
  let bilLogin = 0;
  let bilAutoMula = 0;
  let giliranSudahAktif = false;
  const p = pasangPemulihanAutoMula({
    bacaTetapan: () => ({ autoMulaGiliran: true }),
    giliranAktif: () => giliranSudahAktif,
    // Sesi cache sudah sah -> log masuk automatik ialah no-op, tiada
    // `perluManusia` (bandingkan ujian "berhenti-untuk-manusia" di bawah).
    cubaLoginAutoKerja: async () => { bilLogin++; return { diminta: true, cuba: false, sebab: 'Sesi sudah sah.' }; },
    cubaAutoMula: async () => {
      bilAutoMula++;
      const bermula = bilAutoMula >= 2;
      if (bermula) giliranSudahAktif = true;
      return { bermula, sebab: bermula ? 'Giliran bermula.' : 'Sesi masih tidak sah.' };
    },
    tulisLog: () => {}
  });
  p.mula();
  await p._kitar();
  assert.equal(bilLogin, 1);
  assert.equal(bilAutoMula, 1);
  assert.equal(p.berjalan(), true, 'kekal berjalan selagi auto-mula belum bermula');
  await p._kitar();
  assert.equal(bilLogin, 2);
  assert.equal(bilAutoMula, 2);
  assert.equal(p.berjalan(), false, 'berhenti sebaik auto-mula melaporkan bermula:true');
});

test('pemulihan: terus berkitar (memanggil login + auto-mula SETIAP kitaran) selagi auto-mula gagal DAN login tidak memerlukan manusia', async () => {
  let bilLogin = 0;
  let bilAutoMula = 0;
  const p = pasangPemulihanAutoMula({
    bacaTetapan: () => ({ autoMulaGiliran: true }),
    giliranAktif: () => false,
    cubaLoginAutoKerja: async () => { bilLogin++; return { diminta: false, cuba: false }; },
    cubaAutoMula: async () => { bilAutoMula++; return { bermula: false, sebab: 'Kalendar tidak membenarkan hari ini.' }; },
    tulisLog: () => {}
  });
  p.mula();
  await p._kitar();
  await p._kitar();
  await p._kitar();
  assert.equal(bilLogin, 3, 'cubaLoginAutoKerja mesti dipanggil setiap kitaran (pengawal dinilai semula)');
  assert.equal(bilAutoMula, 3, 'cubaAutoMula mesti dipanggil setiap kitaran (pengawal dinilai semula)');
  assert.equal(p.berjalan(), true, 'kekal berjalan selagi auto-mula terus gagal dan login tidak memerlukan manusia');
});

test('pemulihan: BERHENTI-UNTUK-MANUSIA — log masuk perluManusia:true menghentikan gelung TANPA memanggil cubaAutoMula', async () => {
  let bilLogin = 0;
  let bilAutoMula = 0;
  const p = pasangPemulihanAutoMula({
    bacaTetapan: () => ({ autoMulaGiliran: true }),
    giliranAktif: () => false,
    cubaLoginAutoKerja: async () => {
      bilLogin++;
      return { diminta: true, cuba: true, hasil: { status: 'kunci-tidak-padan', perluManusia: true, sebab: 'Frasa tidak padan (ujian).' } };
    },
    cubaAutoMula: async () => { bilAutoMula++; return { bermula: false }; },
    tulisLog: () => {}
  });
  p.mula();
  await p._kitar();
  assert.equal(bilLogin, 1);
  assert.equal(bilAutoMula, 0, 'cubaAutoMula TIDAK PERNAH dipanggil selepas log masuk memerlukan manusia');
  assert.equal(p.berjalan(), false, 'gelung berhenti serta-merta apabila log masuk memerlukan manusia');
});

test('pemulihan: HARI DAHULU — bolehHariIni:false menghentikan gelung TANPA menyentuh log masuk automatik langsung', async () => {
  let bilHari = 0;
  let bilLogin = 0;
  let bilAutoMula = 0;
  const p = pasangPemulihanAutoMula({
    bacaTetapan: () => ({ autoMulaGiliran: true }),
    giliranAktif: () => false,
    bolehHariIni: async () => { bilHari++; return { boleh: false, sebab: 'Hari ini hujung minggu (ujian).' }; },
    cubaLoginAutoKerja: async () => { bilLogin++; return { diminta: false, cuba: false }; },
    cubaAutoMula: async () => { bilAutoMula++; return { bermula: false }; },
    tulisLog: () => {}
  });
  p.mula();
  await p._kitar();
  assert.equal(bilHari, 1);
  assert.equal(bilLogin, 0, 'log masuk automatik tidak boleh dicuba pada hari yang tidak dibenarkan');
  assert.equal(bilAutoMula, 0);
  assert.equal(p.berjalan(), false, 'gelung berhenti apabila hari ini tidak dibenarkan');
});

test('pemulihan: bolehHariIni:true membenarkan gelung diteruskan seperti biasa', async () => {
  let bilHari = 0;
  let bilLogin = 0;
  const p = pasangPemulihanAutoMula({
    bacaTetapan: () => ({ autoMulaGiliran: true }),
    giliranAktif: () => false,
    bolehHariIni: async () => { bilHari++; return { boleh: true, sebab: 'Hari sekolah dibenarkan.' }; },
    cubaLoginAutoKerja: async () => { bilLogin++; return { diminta: false, cuba: false }; },
    cubaAutoMula: async () => ({ bermula: false }),
    tulisLog: () => {}
  });
  p.mula();
  await p._kitar();
  assert.equal(bilHari, 1);
  assert.equal(bilLogin, 1, 'log masuk automatik mesti dicuba apabila hari ini dibenarkan');
  assert.equal(p.berjalan(), true);
});

test('pemulihan: BERSEMPADAN — berhenti selepas hadKitaran kitaran walaupun auto-mula terus gagal', async () => {
  let bilAutoMula = 0;
  const p = pasangPemulihanAutoMula({
    bacaTetapan: () => ({ autoMulaGiliran: true }),
    giliranAktif: () => false,
    cubaLoginAutoKerja: async () => ({ diminta: false, cuba: false }),
    cubaAutoMula: async () => { bilAutoMula++; return { bermula: false, sebab: 'Terus gagal (ujian).' }; },
    tulisLog: () => {},
    hadKitaran: 3
  });
  p.mula();
  await p._kitar();
  await p._kitar();
  await p._kitar();
  assert.equal(bilAutoMula, 3, 'tiga kitaran pertama mesti berjalan seperti biasa');
  assert.equal(p.berjalan(), true, 'masih berjalan selepas tepat hadKitaran kitaran (had disemak di ATAS kitaran seterusnya)');
  await p._kitar();
  assert.equal(bilAutoMula, 3, 'kitaran ke-4 (melebihi had) TIDAK memanggil cubaAutoMula');
  assert.equal(p.berjalan(), false, 'gelung berhenti sebaik had kitaran dicapai');
});

test('pemulihan: TIADA PERTINDIHAN — kitaran kedua yang dicetuskan semasa kitaran pertama masih berjalan diabaikan', async () => {
  let bilAutoMulaDipanggil = 0;
  let selesaikanKitaranPertama;
  const gerbang = new Promise((selesai) => { selesaikanKitaranPertama = selesai; });
  const p = pasangPemulihanAutoMula({
    bacaTetapan: () => ({ autoMulaGiliran: true }),
    giliranAktif: () => false,
    cubaLoginAutoKerja: async () => ({ diminta: false, cuba: false }),
    cubaAutoMula: async () => {
      bilAutoMulaDipanggil++;
      if (bilAutoMulaDipanggil === 1) await gerbang; // tahan kitaran pertama di sini
      return { bermula: false };
    },
    tulisLog: () => {}
  });
  p.mula();
  const kitaranPertama = p._kitar(); // TIDAK ditunggu — sengaja biar tergantung pada gerbang
  const kitaranKedua = p._kitar(); // dipanggil semasa kitaran pertama masih dalam penerbangan
  await kitaranKedua; // mesti kembali serta-merta (diabaikan), tidak menunggu gerbang
  assert.equal(bilAutoMulaDipanggil, 1, 'kitaran kedua yang bertindih mesti diabaikan sepenuhnya (bukan dibaris-gilirkan)');
  selesaikanKitaranPertama();
  await kitaranPertama;
  assert.equal(bilAutoMulaDipanggil, 1, 'kitaran pertama selesai tanpa kitaran kedua pernah memanggil cubaAutoMula');
});

