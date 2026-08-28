# Pemasangan backend HADIR

Backend dipasang dalam projek Apps Script **Sistem Kehadiran Sepadan** supaya
bot Telegram dan PWA menulis tab kehadiran yang sama.

1. Tambah fail skrip `HadirWeb.gs` dan salin kandungan fail ini.
2. Pada baris pertama fungsi `doPost(e)` sedia ada dalam `Code.gs`, tambah:

```javascript
if (hadirAdakahPermintaan_(e)) return hadirDoPost_(e);
```

3. Dalam Script Properties, tetapkan:

| Kunci | Nilai |
|---|---|
| `HADIR_ADMIN_PIN_HASH` | SHA-256 PIN admin daripada `hadirHashPinUntukTetapan()` |
| `HADIR_AKSI_PASSWORD` | Kata laluan admin AKSI |
| `HADIR_SEMAK_PASSWORD` | Kata laluan admin SEMAK |
| `HADIR_AKSI_ID` | Pilihan; lalai `admin` |
| `HADIR_AKSI_URL` | Pilihan; URL produksi sudah menjadi lalai |
| `HADIR_SEMAK_URL` | Pilihan; URL produksi sudah menjadi lalai |
| `SEPADAN_SYNC_SECRET` | Rahsia rawak sama dalam HADIR, AKSI dan SEMAK; jangan commit |

4. Deploy **New version** pada deployment sedia ada. Jangan cipta deployment
   kedua kerana URL webhook Telegram mesti kekal.
5. Salin URL `/exec` yang sama ke `config.js`.

## Import CSV idME

API `uploadMuridCsv` hanya menerima sesi admin. Ia menyerahkan rekod kepada
fungsi rasmi KEHADIRAN `simpanSenaraiMuridUpload`, menggunakan mod `sync` atau
`merge`, kemudian menjalankan penyelarasan AKSI dan SEMAK. Fungsi upload rasmi
itu mesti kekal dalam projek Apps Script yang sama.

PIN dan kata laluan tidak boleh dimasukkan ke repo ini. Cache PWA juga tidak
menyimpan sesi, nama murid, IC atau jawapan API.

## Tetapan Guru

Apps Script Version **107** mengekalkan API admin `senaraiGuru`, `simpanGuru`,
`uploadGuruCsv` dan `syncGuru`. Sumber setempat ialah tab `HADIR_GURU`.
Penyelarasan menggunakan `importGuru` + `pastikanAkaunGuru` dalam AKSI dan
`apiImportGuru` dalam SEMAK. Semua import ialah gabung-sahaja: guru yang tiada
dalam fail serta kata laluan sedia ada tidak dipadam atau ditindih.

## Relay tiga sistem

`terimaSyncMurid` dan `terimaSyncGuru` menerima data daripada AKSI/SEMAK hanya
selepas `SEPADAN_SYNC_SECRET` disahkan. Data murid luar sentiasa `merge` dan
data guru sentiasa gabung-sahaja. Penanda asal menghalang gelung. API rasmi
setiap sasaran masih menentukan kelas layak, cache, calon dan medan tempatan;
markah, kehadiran, kokurikulum, tugasan serta kata laluan tidak diselaraskan.
