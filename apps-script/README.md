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
| `HADIR_GURU_PIN_HASH` | SHA-256 PIN guru |
| `HADIR_AKSI_PASSWORD` | Kata laluan admin AKSI |
| `HADIR_SEMAK_PASSWORD` | Kata laluan admin SEMAK |
| `HADIR_AKSI_ID` | Pilihan; lalai `admin` |
| `HADIR_AKSI_URL` | Pilihan; URL produksi sudah menjadi lalai |
| `HADIR_SEMAK_URL` | Pilihan; URL produksi sudah menjadi lalai |

4. Deploy **New version** pada deployment sedia ada. Jangan cipta deployment
   kedua kerana URL webhook Telegram mesti kekal.
5. Salin URL `/exec` yang sama ke `config.js`.

PIN dan kata laluan tidak boleh dimasukkan ke repo ini. Cache PWA juga tidak
menyimpan sesi, nama murid, IC atau jawapan API.

