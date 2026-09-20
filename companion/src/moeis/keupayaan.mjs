// Companion standalone tidak mempunyai integrasi browser_vault_* yang
// diluluskan. Jangan tambah bacaan profil/cookie/kredensial atau medan kata
// laluan sebagai jalan pintas; sesi SSO persisten dan login manusia kekal.
export function keupayaanLogMasuk() {
  return {
    automatik: false,
    mod: 'manual',
    sebab: 'Tiada integrasi vault pelayar diluluskan; log masuk idMe kekal manual.'
  };
}

