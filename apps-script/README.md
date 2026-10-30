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
| `HADIR_PELBAGAI_PC` | `'1'` = ON (ciri berbilang PC); ketiadaan/nilai lain = OFF |
| `HADIR_SAMBUNG_EXEC_URL` | Pilihan pemilik: menetapkan semula URL `/exec` autoritatif bukan rahsia. Jika tiada, lalai ialah pemalar terp dalam kod (`HADIR_SAMBUNG_URL_LALAI`) yang sama tepat dengan bootstrap Desktop. Nilai tidak sah menolak Jana (gagal tertutup) |

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

Apps Script Version **110** mengekalkan API admin `senaraiGuru`, `simpanGuru`,
`nyahaktifGuru`, `uploadGuruCsv` dan `syncGuru`. Sumber setempat ialah tab
`HADIR_GURU` dengan lajur status.
Penyelarasan menggunakan `importGuru` + `pastikanAkaunGuru` dalam AKSI dan
`apiImportGuru` dalam SEMAK. Import `merge` menambah/mengemas kini sahaja;
`sync` menyamakan senarai aktif dan menanda nama yang tiada sebagai tidak aktif.
Baris, kata laluan, tugasan dan sejarah tidak dipadam atau ditindih.

## Enjin PC (Companion) — deploy semula diperlukan

### Sambungan Desktop dengan satu kod (perubahan belum diterbitkan)

Admin **Hantar ke MOEIS → Sambungan Desktop** menjana kod `HC1` yang
mengekod endpoint `/exec` autoritatif: Script Property pilihan pemilik
`HADIR_SAMBUNG_EXEC_URL` jika ditetapkan, jika tidak pemalar terp
`HADIR_SAMBUNG_URL_LALAI` (sama tepat dengan bootstrap Desktop).
Property TIDAK SAH menolak Jana (gagal tertutup); `getService().getUrl()` tidak
digunakan.
Kod **tidak luput**, sekali guna dan boleh dibatalkan. Desktop menebusnya sekali
melalui `moeisSambungTukar(kod)` untuk token `HD1` unik; rahsia bersama
`HADIR_MOEIS_ENGINE_SECRET` tidak dihantar ke PC baharu. Endpoint `/dev` ditolak.

RPC admin melalui sesi `hadirSesi_(token, true)` sedia ada:
`moeisSambungJana(token)`, `moeisSambungSenarai(token)` dan
`moeisSambungBatal('kod'|'peranti', id, token)`. Senarai hanya metadata legap.
`HADIR_SAMBUNG_V1` menyimpan hash SHA-256 kod/token; satu tulisan JSON di bawah
`ScriptLock` menggabungkan penggunaan kod dan pendaftaran peranti. Had 12 kod
belum digunakan + 12 peranti aktif, maks 8,000 bait ASCII. Kod terpakai menyimpan `idPeranti` untuk pembatalan tepat selepas balasan
hilang; sejarah bukan-menunggu tertua dibersihkan hanya apabila had kod dicapai; peranti batal dibersihkan semasa penebusan.
ID yang tiada sentiasa ditolak. Kerosakan/quota/storage-readback gagal tertutup.
Pemulihan rosak menggunakan fungsi editor persendirian dengan sandaran dan
pengesahan eksplisit; lihat prosedur pemulihan dalam kontrak Desktop.

`HADIR_SAMBUNG_KADAR_V1` mengehadkan **semua** cubaan penebusan kepada 20/minit
secara persisten di bawah kunci, termasuk kod tidak sah. Apps Script tidak
memberi IP klien yang boleh dipercayai; had ini global dan boleh menyebabkan
penolakan sementara kepada pengguna lain ketika diserang. Tiada cache sebagai
sumber benar, tiada reset pada penebusan berjaya.

Keempat-empat RPC tugasan (`Senarai/Klaim/Lepas/Selesai`) menerima token peranti
aktif atau rahsia legasi. Token hanya untuk tugas MOEIS, bukan sesi admin;
pemilik klaim mesti ID peranti token. Auth dan mutasi berada di bawah kunci
yang sama dengan revokasi. Ciri ini bebas daripada flag `HADIR_PELBAGAI_PC`;
ia tidak mengaktifkan kepimpinan/heartbeat `pc*` yang masih staged.

Sumber rawak/redirect, pemulihan dan batas revokasi:
[kontrak Sambungan Desktop](../desktop/docs/CONNECTION-CODE.md).
Tiada deployment dibuat dalam perubahan ini. Urutan penerbitan ialah GAS +
property endpoint autoritatif dahulu, kemudian Desktop. Desktop mengekalkan
fallback manual legasi di sebalik Lanjutan, tanpa meluaskan pin sasaran. PC lama boleh terus memakai rahsia legasi.

HADIR v1.11.0 menambah klaim atomik + lease bagi tugasan MOEIS: fungsi
`hadirMoeisJobKlaim_`/`hadirMoeisJobLepas_`, kaedah `moeisJobKlaim`/
`moeisJobLepas` dalam jadual `hadirDoPost_`, keputusan `tersimpan` baharu
pada `hadirMoeisJobSelesai_`, dan lajur `PEMILIK`/`LEASE_SELEPAS` (migrasi
lembut — `HADIR_MOEIS_JOB_LEBAR` naik daripada 11 ke 13, helaian sedia ada
tidak hilang data). **Backend mesti di-deploy semula (New version) sebelum
companion Windows (`companion/`) boleh menghidupkan giliran** — tanpa itu
`POST /api/mula` companion menolak dengan 409 dan giliran kekal mati
(fail-closed by design, lihat `companion/docs/PEMASANGAN.md`).

**Perubahan tandatangan `moeisJobSelesai` (semakan bebas 18 September 2026):**
argumennya kini `(id, keputusan, mesej, bilHadirSelepas, pemilik, rahsia)`.
`pemilik` mestilah sama dengan lajur `PEMILIK` pada tugasan dan status semasa
mesti `sedang_dihantar` (atau `tersimpan` bagi pengesahan semula); selain itu
laporan ditolak. Ini menghalang mana-mana pemegang rahsia enjin daripada
menandakan tugasan `berjaya` tanpa memegang klaim. Enjin lama (moeis-bot
prototaip) yang masih menghantar lima argumen **tidak lagi berfungsi** —
gunakan `companion/`.

**Auto-mula berpengawal (v1.11.2):** `hadirMoeisJobSenarai_` kini memulangkan
`diciptaEpochMs` (masa penciptaan tugasan, milisaat epoch) bersama setiap
tugasan. Pengawal kesegaran auto-mula companion membaca medan ini; **tanpa
deploy semula** medan itu tiada (`null`) → auto-mula menolak semua tugasan
(gagal tertutup, selamat). Deploy **New version** pada deployment sedia ada
supaya auto-mula berfungsi.

**Pemulihan tugasan tersekat (v1.11.x):** `hadirMoeisJobKlaim_` kini menerima
tiga laluan klaim bagi tugasan `sedang_dihantar` yang ditinggalkan enjin
mati/restart — pemilik sama (ID enjin stabil companion), pemilik berlainan
selepas lease luput, dan tugasan yatim tanpa `PEMILIK` & tanpa `LEASE_SELEPAS`.
**Tanpa deploy semula** laluan ketiga (tugasan yatim) tiada; tugasan `sedang_dihantar`
tanpa pemilik/lease kekal tidak boleh dipulihkan. Deploy **New version** pada
deployment sedia ada supaya pemulihan penuh berfungsi.

## Ciri berbilang PC (pendaftaran peranti + kepimpinan)

Fungsi `pcTerbitKodDaftar`, `pcDaftarPeranti`, `pcDegup`, `pcKlaimKepimpinan`,
`pcSahkanPenulis`, `pcNyahaktifPeranti`, `pcSenaraiPerantiAdmin` dan
`pcStatusAwam` dalam `hadirDoPost_` menyokong lebih daripada satu instalasi
desktop bagi satu `akaun` (label pengelompokan legap, bukan id sebenar), dengan
tepat satu pemimpin pada satu masa (lease + pemagaran generasi monotonik).
Seluruh ciri digated oleh Script Property `HADIR_PELBAGAI_PC`:

- **OFF secara lalai** (ketiadaan/nilai selain `'1'`): SEMUA laluan tulis
  (`pcTerbitKodDaftar`, `pcDaftarPeranti`, `pcDegup`, `pcKlaimKepimpinan`,
  `pcSahkanPenulis`, `pcNyahaktifPeranti`, `pcSenaraiPerantiAdmin`) menolak
  dengan "Ciri berbilang PC dilumpuhkan." Hanya `pcStatusAwam` (baca sahaja,
  legap, awam) kekal aktif supaya klien dapat mengesan keupayaan tanpa menulis.
- Untuk menghidupkan: tetapkan `HADIR_PELBAGAI_PC = '1'` dan deploy **New
  version**. Tiada deploy kedua; URL `/exec` sedia ada mesti kekal.

Rahsia peranti (`rahsia`) disimpan HANYA sebagai `sha256` (`hadirHash_`) dan
tidak pernah dipulangkan oleh sebarang endpoint senarai/admin/awam. Kepimpinan
dalam hiris ini hanya DILAPORKAN, belum mengawal penulis kehadiran sebenar.
Lihat `BLUEPRINT.md` §5b dan `desktop/PLAN.md` untuk had jujur (tiada jaminan
sekatan rangkaian / pemagaran pelayar portal fizikal).

## Relay tiga sistem

`terimaSyncMurid` dan `terimaSyncGuru` menerima data daripada AKSI/SEMAK hanya
selepas `SEPADAN_SYNC_SECRET` disahkan. Data murid luar sentiasa `merge` dan
data guru membawa mod `merge` atau `sync`. Penanda asal menghalang gelung dan
`ScriptLock` HADIR menyusun operasi supaya operasi selesai terakhir menjadi
keadaan terkini. API rasmi
setiap sasaran masih menentukan kelas layak, cache, calon dan medan tempatan;
markah, kehadiran, kokurikulum, tugasan serta kata laluan tidak diselaraskan.


Penggantian PC menghantar ID peranti lama kepada `moeisSambungTukar` supaya
semakan tugas di bawah ScriptLock hanya menyekat pemilik itu; ID tidak diketahui
kekal konservatif. Penolakan auth lama tidak melepaskan tugas. Admin boleh
menggunakan tindakan **Asingkan tugasan untuk semakan manual** pada PC revoked,
dengan sesi dan pengesahan eksplisit. Status `semakan_manual` mengekalkan
snapshot, pemilik, lease dan status asal dalam mesej; ia bukan keputusan selesai,
tidak claimable dan masih menyekat simpan semula kelas. Lihat prosedur dan
batas pemulihan dalam [kontrak sambungan](../desktop/docs/CONNECTION-CODE.md).
