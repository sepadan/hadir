# Blueprint HADIR — SK Paya Redan

**Versi 1.3 · 24 Ogos 2026**

## 1. Tujuan

HADIR ialah saluran web kedua bagi sistem KEHADIRAN. Ia tidak mencipta pangkalan
data kehadiran baharu: bot Telegram dan PWA membaca/menulis tab `kehadiran` yang
sama. PWA memberi aliran lebih pantas pada telefon dan bertindak sebagai
sandaran apabila Telegram lambat atau tidak sesuai digunakan.

## 2. Seni bina

```text
Guru → sepadan.github.io/hadir (isi dan semak tanpa log masuk)
Admin → menu sisi → log masuk PIN → edit/import CSV idME/sync
           → doPost mode=hadir (Apps Script KEHADIRAN)
           → tab main / kehadiran
           → API rasmi AKSI importMurid
           → API rasmi SEMAK apiUploadMurid
```

`doPost` Telegram kekal. Baris penghala sahaja ditambah sebelum logik Telegram:

```javascript
if (hadirAdakahPermintaan_(e)) return hadirDoPost_(e);
```

## 3. Peraturan yang tidak boleh dilanggar

1. Tab `main` KEHADIRAN ialah sumber rasmi murid.
2. IC/MyKid ialah kunci stabil dan tidak boleh ditukar pada rekod sedia ada.
3. Penyelarasan murid tidak boleh mengubah markah SEMAK, keahlian atau rekod
   aktiviti AKSI.
4. Kemas kini murid dalam AKSI/SEMAK tidak dibuang. Penyelarasan HADIR berikutnya
   boleh menyamakan semula medan murid dengan sumber rasmi.
5. Repo awam tidak mengandungi nama/IC murid, PIN, kata laluan atau token.
6. Cache PWA hanya aset statik asal GitHub Pages. API Google, sesi, murid dan
   kehadiran tidak dipintas atau dicache.
7. Simpanan kehadiran menggunakan satu `setValues()` berkelompok di bawah
   `ScriptLock`. Semua murid aktif dalam kelas mendapat 1 atau 0.
8. Tarikh sebelum murid masuk dan tempoh arkib terus menggunakan peraturan
   sistem KEHADIRAN sedia ada.
9. Log `HADIR_LOG` hanya menyimpan masa, tindakan, peranan, kelas dan bilangan;
   tiada nama atau IC.

## 4. Keselamatan

- Guru terus membaca kelas dan menyimpan kehadiran tanpa sesi.
- Sesi rawak admin lapan jam disimpan dalam Script Properties.
- PIN admin disimpan sebagai SHA-256 (`HADIR_ADMIN_PIN_HASH`).
- Kata laluan perkhidmatan AKSI/SEMAK berada dalam Script Properties sahaja.
- Hanya admin boleh melihat/mengemas kini murid atau menjalankan sync penuh.
- Paparan guru menerima nama dan kunci harian legap; IC/MyKid tidak dihantar.

## 5. Kontrak API HADIR

Semua permintaan POST berbentuk:

```json
{"mode":"hadir","kaedah":"init","argumen":[]}
```

Kaedah: `login`, `logout`, `init`, `simpanKehadiran`, `senaraiMurid`,
`simpanMurid`, `uploadMuridCsv`, `syncSemua`.

Jawapan: `{ok:true, hasil:...}` atau `{ok:false, ralat:"..."}`.

## 6. Penyelarasan murid

- **Update Data Murid** menerima CSV idME dan menggunakan fungsi rasmi
  `simpanSenaraiMuridUpload`. Mod `sync` menjadikan fail senarai aktif penuh;
  mod `merge` hanya menambah atau mengemas kini rekod yang dihantar.
- Parser menerima tajuk idME yang sama seperti halaman upload KEHADIRAN,
  mengekalkan lajur asal dalam `semua`, dan menghadkan satu import kepada 3,000
  rekod serta fail 8 MB.
- AKSI: backend HADIR login sebagai perkhidmatan, membina CSV dalam ingatan dan
  memanggil `importMurid`. Murid hilang ditanda `TIDAK AKTIF`; data koku kekal.
- SEMAK: backend memanggil `apiUploadMurid`; sheet `MURID`, calon peperiksaan
  aktif dan revisi cache dikemas kini oleh fungsi rasmi SEMAK. Markah kekal.
- Jika salah satu sasaran gagal, perubahan tab `main` tidak dibatalkan. UI
  memaparkan sasaran yang gagal dan admin boleh tekan **Selaras Semua Aplikasi**.

## 7. PWA dan auto-update

Versi `HADIR v1.3.0 · PWA`. `service-worker.js` mencache aset statik dan
memintas permintaan GET sama asal sahaja. Backend Apps Script berlainan asal,
maka data tidak pernah masuk Cache Storage. Service Worker menyemak binaan
baharu ketika aplikasi dibuka, tanpa muat semula paksa.

## 8. Status

- [x] Antara muka satu muka dengan dropdown kelas dibina.
- [x] Guru boleh mengisi kehadiran terus tanpa log masuk.
- [x] Log masuk admin dipindahkan ke menu sisi.
- [x] Paparan mudah alih, menu boleh ditutup dan dok simpan melekit dibina.
- [x] Menu desktop kekal terbuka seperti AKSI; menu telefon kekal buka/tutup.
- [x] Nama kelas dipilih dan bilangan murid dipaparkan dalam menu sisi.
- [x] Menu Semak Kehadiran dibina dengan pilihan Semua Kelas dan setiap kelas.
- [x] Tajuk pilihan dipadatkan kepada Kelas; Set semula diletakkan di sebelah
  tajuk dan kad ringkasan kelas lama dibuang untuk meluaskan ruang nama.
- [x] Log masuk admin diletakkan di sebelah versi; ayat tanpa log masuk dibuang.
- [x] Butang + Murid diganti dengan Update Data Murid CSV idME; edit satu murid
  kekal tersedia.
- [x] Senarai murid boleh discroll pada desktop dan telefon tanpa limpahan
  mendatar; nama panjang menggunakan elipsis dan status kekal kelihatan.
- [x] HADIR v1.2.0 diterbitkan melalui GitHub Pages run #5 untuk commit
  `8284fa6`; produksi desktop 1440×900 dan telefon 390×844 disahkan.
- [x] Pengurusan murid admin dan sync kelompok dibina.
- [x] Manifest, Service Worker, paparan luar talian dan auto-update dibina.
- [x] Backend Apps Script serta penghala Telegram serasi disediakan.
- [x] Ikon HADIR disalin dan semua saiz PWA dijana.
- [x] Backend ditampal, Script Properties ditetapkan dan deployment dikemas kini.
- [x] URL `/exec` deployment sedia ada dimasukkan ke `config.js`.
- [x] Apps Script versi 96 dan GitHub Pages run #3 untuk commit `ea910fb` diterbitkan.
- [x] Produksi telefon disahkan: 9 pilihan kelas, pemilihan kelas automatik,
  senarai murid tanpa login, menu boleh ditutup dan PWA berstatus sedia.
- [x] IC/MyKid tidak muncul pada paparan guru dan konsol tidak melaporkan ralat.
- [ ] Satu simpanan kehadiran sebenar dan sync AKSI/SEMAK disahkan oleh pengguna.

## 9. Rekod perubahan

| Tarikh | Versi | Perubahan | Data |
|---|---|---|---|
| 2026-08-24 | 1.3.0 | Tambah Semak Kehadiran semua/ikut kelas; kemaskan pilihan kelas, butang Set semula, menu dan ruang nama; tambah import CSV idME admin melalui fungsi rasmi KEHADIRAN; naikkan cache PWA | Ujian hanya membaca data produksi dan menggunakan semakan struktur/paparan; tiada kehadiran disimpan, fail murid diimport atau sync sebenar dijalankan |
| 2026-08-24 | 1.2.0 | Baiki kawasan scroll; kekalkan sidebar pada desktop; menu telefon boleh buka/tutup; paparkan kelas dipilih dalam menu; kemaskan kad nama panjang dan naikkan cache PWA; GitHub Pages run #5 (`8284fa6`) berjaya | Ujian produksi hanya membaca senarai dan menguji UI; tiada kehadiran atau data murid diubah |
| 2026-08-24 | 1.1.0 | Susun semula kepada satu muka mesra telefon; guru terus isi tanpa login; login admin sahaja dalam menu; IC awam diganti kunci harian legap; Apps Script v96 dan GitHub Pages run #3 (`ea910fb`) diterbitkan | Ujian produksi hanya membaca senarai dan menguji UI; tiada kehadiran disimpan dan tiada sync sebenar dijalankan |
| 2026-08-24 | 1.0.0 | Diterbitkan melalui GitHub Pages run #1 untuk commit `0382449`; Apps Script deployment kekal pada URL lama dan dinaikkan ke versi 95; Script Properties serta sambungan log masuk disahkan | Ujian teknikal hanya menggunakan PIN salah; tiada kehadiran atau data murid sebenar diubah |
