# HADIR

PWA satu muka untuk kehadiran pantas SK Paya Redan.

- Guru terus memilih kelas dan mengisi kehadiran tanpa log masuk.
- Semua murid dianggap hadir; tekan nama hanya untuk menanda tidak hadir.
- Satu butang menyimpan seluruh kelas secara kelompok.
- Menu **Semak Kehadiran** memaparkan ringkasan semua kelas atau satu kelas
  yang dipilih, termasuk nama murid yang tidak hadir.
- Log masuk admin berada di sebelah nombor versi dalam menu sisi.
- Admin boleh mengemas kini senarai murid secara kelompok menggunakan CSV idME
  atau terus mengedit satu rekod murid seperti biasa.
- Admin boleh menambah, nyahaktif atau upload CSV guru melalui **Tetapan Guru**.
  Mod **Gabung** tidak menyentuh nama yang tiada; mod **Sync penuh** menjadikan
  fail sebagai senarai aktif dan menyahaktifkan nama yang tiada selepas
  pratonton/pengesahan. Rekod tidak dipadam secara fizikal, jadi kata laluan,
  tugasan dan sejarah kekal.
  Jika sumber `HADIR_GURU` masih kosong, butang penyelarasan mengambil senarai
  guru paling baharu daripada SEMAK; AKSI digunakan sebagai sandaran sahaja.
- Upload murid atau guru di HADIR, AKSI atau SEMAK disalurkan ke sistem lain.
  Bagi guru, tambah/edit menggunakan gabung manakala nyahaktif/sync penuh
  menyamakan senarai aktif pada ketiga-tiga sistem.
  Hanya data asas dikongsi; markah, kehadiran, kokurikulum, tugasan dan kata
  laluan kekal mengikut peraturan aplikasi masing-masing.
- Pada desktop, menu sisi kekal terbuka seperti AKSI; pada telefon menu boleh
  dibuka dan ditutup. Nama kelas semasa turut dipaparkan dalam menu.
- Senarai murid mempunyai scroll sendiri dan nama panjang dipendekkan dengan
  kemas tanpa menyembunyikan butang status.
- Tab `main` KEHADIRAN kekal sumber rasmi dan boleh menyelaraskan senarai aktif
  ke AKSI serta SEMAK.
- Bot Telegram dan fungsi kemas kini dalam aplikasi sedia ada terus berfungsi.
- Menu admin **Hantar ke MOEIS** mengurus Kategori/Sebab wajib dan giliran
  tugasan MOEIS. HADIR Desktop pada PC sekolah mengambil tugasan apabila
  automasi dihidupkan. Menu dulang **Tetapan Tempatan** membuka dialog Windows
  untuk URL Apps Script dan rahsia enjin; Companion tidak diperlukan untuk
  skrin tetapan ini. Kitaran produksi kekal 10 minit.
- Companion mempunyai dua opt-in tempatan yang berasingan: autostart Windows
  dan auto-mula giliran berpengawal. Kedua-duanya lalai MATI; auto-mula
  menerima kerja `menunggu`, `sedang_dihantar` (yatim) atau `tersimpan`
  (pengesahan tidak lengkap) untuk tarikh sekolah allowlist hari ini, termasuk
  yang dicipta sebelum enjin bermula. Tugasan `tersimpan` dipulihkan dengan
  pengesahan **baca-sahaja** (mod `verifikasi` sahaja, tidak pernah `hantar`):
  padan => berjaya tanpa tulis MOEIS; masih perlu perubahan/konflik => gagal
  (tindakan manusia).
  Log masuk idMe automatik ialah opt-in berasingan (`loginAuto`, lalai MATI)
  melalui vault kredensial DPAPI tempatan; frasa kunci keselamatan mesti padan
  dan CAPTCHA/OTP/2FA memerlukan manusia.

## Update Data Murid

Butang **Update Data Murid** menerima fail CSV idME sehingga 8 MB. Pilihan
**Senarai aktif penuh** menggunakan fail sebagai senarai rasmi semasa; murid
lama yang tiada dalam fail akan diarkibkan. Pilihan **Tambah/kemas kini sahaja**
tidak mengarkibkan murid yang tiada dalam fail.

Import menggunakan fungsi rasmi KEHADIRAN yang sama seperti halaman upload
sedia ada, kemudian meminta penyelarasan AKSI dan SEMAK. Pratonton bilangan
rekod dipaparkan sebelum admin mengesahkan import. Upload dari AKSI/SEMAK
digabung ke sumber induk tanpa mengarkib murid yang tidak dibawa oleh fail;
pengarkiban senarai penuh hanya dibuat dari HADIR.

## PWA

PWA menyimpan **aset paparan sahaja**. Nama murid, IC, sesi, jawapan API dan
kehadiran tidak dimasukkan ke Cache Storage. Versi baharu diperiksa setiap kali
aplikasi dibuka dan tidak memuat semula secara paksa ketika guru sedang menanda.

Paparan kehadiran awam tidak menerima IC/MyKid. Backend menggantikannya dengan
kunci harian legap supaya nombor pengenalan tidak dihantar ke pelayar guru.

Android: pilih **Install app**. iPhone: **Share → Add to Home Screen**.

## Struktur

```text
index.html / styles.css / app.js   PWA GitHub Pages
manifest.webmanifest               Maklumat pemasangan
service-worker.js                  Cache cangkerang statik
offline.html                       Paparan selamat tanpa internet
icons/                             Ikon HADIR Android/iOS
apps-script/HadirWeb.gs            Backend dalam projek KEHADIRAN
apps-script/README.md               Langkah pemasangan backend
companion/                         Enjin PC (Companion) MOEIS — lihat companion/docs/PEMASANGAN.md
BLUEPRINT.md                       Kontrak dan rekod keputusan
tests/hadir.test.cjs               Ujian tanpa data sebenar
```

## Ujian

```powershell
node tests/hadir.test.cjs
node --test companion/tests/*.test.mjs

# Ujian asap E2E companion: pelayan loopback + storan DPAPI sebenar,
# tiada pelayar dan tiada MOEIS (lihat companion/docs/PEMASANGAN.md)
node companion/tests/asap-e2e.mjs
```

Guna bentuk glob (`companion/tests/*.test.mjs`) — `node --test companion/tests/`
tanpa glob gagal di bawah git-bash/MSYS kerana terjemahan laluan.
