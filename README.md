# HADIR

PWA satu muka untuk kehadiran pantas SK Paya Redan.

- Guru terus memilih kelas dan mengisi kehadiran tanpa log masuk.
- Semua murid dianggap hadir; tekan nama hanya untuk menanda tidak hadir.
- Satu butang menyimpan seluruh kelas secara kelompok.
- Log masuk admin berada dalam menu sisi untuk menambah atau mengemas kini murid.
- Tab `main` KEHADIRAN kekal sumber rasmi dan boleh menyelaraskan senarai aktif
  ke AKSI serta SEMAK.
- Bot Telegram dan fungsi kemas kini dalam aplikasi sedia ada terus berfungsi.

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
BLUEPRINT.md                       Kontrak dan rekod keputusan
tests/hadir.test.cjs               Ujian tanpa data sebenar
```

## Ujian

```powershell
node tests/hadir.test.cjs
```
