// Semakan Host + Origin + header CORS. Fail-closed: apa-apa yang tidak
// sepadan tepat gagal tanpa header CORS pada respons.

export function hostSah(headerHost, port) {
  const h = String(headerHost || '').toLowerCase();
  return h === `127.0.0.1:${port}` || h === `localhost:${port}`;
}

// Padanan TEPAT sahaja — tiada padanan awalan, tiada wildcard.
export function originDibenarkan(origin, senaraiDibenarkan) {
  if (!origin) return false;
  return Array.isArray(senaraiDibenarkan) && senaraiDibenarkan.includes(origin);
}

export function tetapkanHeaderCorsAsal(res, origin) {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
}

export function tetapkanHeaderCorsPenuh(res, origin) {
  tetapkanHeaderCorsAsal(res, origin);
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, x-hadir-lokal, x-hadir-pairing');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

export function tetapkanHeaderPreflight(res, origin) {
  tetapkanHeaderCorsPenuh(res, origin);
  // Chrome/Edge "Local Network Access": membenarkan permintaan preflight
  // daripada halaman awam ke alamat loopback. Boleh memapar satu gesaan
  // kebenaran pada pelayar — didokumenkan dalam PEMASANGAN.md.
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
}
