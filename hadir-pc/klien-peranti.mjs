// hadir-pc/klien-peranti.mjs
// Klien RPC untuk ciri "berbilang PC" HADIR, mengikut konvensyen RPC yang sama
// dengan companion/src/klien-hadir.mjs (mod 'hadir', User-Agent pelayar, balasan
// {ok, hasil|ralat}). Setiap kaedah mengesahkan bentuk balasan berbanding
// kontrak sebelum memulangkannya — balasan yang tidak sepadan dilontar sebagai
// ralat supaya kerosakan senyap pada backend tidak lulus ke pemanggil.

const UA_PELAYAR = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function panggilRpc(apiUrl, kaedah, argumen, { fetchImpl } = {}) {
  const fetchGuna = fetchImpl || fetch;
  const r = await fetchGuna(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8', 'User-Agent': UA_PELAYAR },
    body: JSON.stringify({ mode: 'hadir', kaedah, argumen })
  });
  const teks = await r.text();
  let j;
  try { j = JSON.parse(teks); }
  catch { throw new Error('Balasan bukan JSON (status ' + r.status + ').'); }
  if (!j.ok) throw new Error(j.ralat || 'Permintaan HADIR gagal.');
  return j.hasil;
}

function jenisSepadan(nilai, jenis) {
  if (jenis === 'null') return nilai === null;
  if (jenis === 'string') return typeof nilai === 'string';
  if (jenis === 'number') return typeof nilai === 'number' && Number.isFinite(nilai);
  if (jenis === 'boolean') return typeof nilai === 'boolean';
  if (jenis === 'true') return nilai === true;
  return false;
}

function medanSepadan(nilai, jenisMedan) {
  const jenisSenarai = jenisMedan.split('|').map((s) => s.trim());
  return jenisSenarai.some((j) => jenisSepadan(nilai, j));
}

// Pengesah bentuk hand-rolled ringkas: `bentuk` ialah peta { medan: 'jenis' | 'jenis1|jenis2' }.
// Tidak menyemak medan tambahan (backend boleh berkembang); hanya medan wajib + jenisnya.
function sahkanKontrak(nilai, bentuk, namaBentuk) {
  if (!nilai || typeof nilai !== 'object' || Array.isArray(nilai)) {
    throw new Error(`Bentuk balasan tidak sah untuk ${namaBentuk}.`);
  }
  for (const [medan, jenisMedan] of Object.entries(bentuk)) {
    if (!(medan in nilai)) {
      throw new Error(`Bentuk balasan tidak sah untuk ${namaBentuk}: medan "${medan}" tiada.`);
    }
    if (!medanSepadan(nilai[medan], jenisMedan)) {
      throw new Error(`Bentuk balasan tidak sah untuk ${namaBentuk}: medan "${medan}" jenis salah.`);
    }
  }
  return nilai;
}

const BENTUK_REKOD_PERANTI = {
  idPeranti: 'string',
  akaun: 'string',
  nama: 'string',
  status: 'string',
  generasi: 'number',
  diciptaMs: 'number',
  dilulusMs: 'number',
  lastSeenMs: 'number|null',
  nyahaktifMs: 'number|null',
};

const BENTUK_JAWAPAN_DEGUP = {
  ok: 'true',
  pemimpin: 'boolean',
  generasi: 'number',
};

const BENTUK_JAWAPAN_KLAIM = {
  ok: 'true',
  pemimpin: 'string',
  generasi: 'number',
  leaseMs: 'number',
};

const BENTUK_STATUS_AWAM = {
  akaun: 'string',
  pemimpin: 'string|null',
  lastSeenMs: 'number|null',
  leaseMs: 'number',
  generasi: 'number',
};

function sahkanSenaraiPerantiAdmin(nilai) {
  if (!Array.isArray(nilai)) throw new Error('Bentuk balasan tidak sah untuk SenaraiPerantiAdmin: bukan senarai.');
  return nilai.map((rec) => sahkanKontrak(rec, BENTUK_REKOD_PERANTI, 'SenaraiPerantiAdmin'));
}

function sahkanStatusAwam(nilai) {
  if (!Array.isArray(nilai)) throw new Error('Bentuk balasan tidak sah untuk StatusAwam: bukan senarai.');
  return nilai.map((rec) => sahkanKontrak(rec, BENTUK_STATUS_AWAM, 'StatusAwam'));
}

export function buatKlienPeranti({ apiUrl, fetchImpl }) {
  return {
    async daftar(kodDaftar, idPeranti, akaun, nama, rahsia) {
      const hasil = await panggilRpc(apiUrl, 'pcDaftarPeranti', [kodDaftar, idPeranti, akaun, nama, rahsia], { fetchImpl });
      return sahkanKontrak(hasil, BENTUK_REKOD_PERANTI, 'RekodPeranti');
    },
    async degup(idPeranti, akaun, rahsia) {
      const hasil = await panggilRpc(apiUrl, 'pcDegup', [idPeranti, akaun, rahsia], { fetchImpl });
      return sahkanKontrak(hasil, BENTUK_JAWAPAN_DEGUP, 'JawapanDegup');
    },
    async klaimKepimpinan(idPeranti, akaun, rahsia) {
      const hasil = await panggilRpc(apiUrl, 'pcKlaimKepimpinan', [idPeranti, akaun, rahsia], { fetchImpl });
      return sahkanKontrak(hasil, BENTUK_JAWAPAN_KLAIM, 'JawapanKlaim');
    },
    async senaraiPerantiAdmin(akaun, token) {
      const hasil = await panggilRpc(apiUrl, 'pcSenaraiPerantiAdmin', [akaun, token], { fetchImpl });
      return sahkanSenaraiPerantiAdmin(hasil);
    },
    async statusAwam() {
      const hasil = await panggilRpc(apiUrl, 'pcStatusAwam', [], { fetchImpl });
      return sahkanStatusAwam(hasil);
    },
  };
}

export { sahkanKontrak };
