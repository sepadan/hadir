# Blueprint HADIR — SK Paya Redan

**Versi 2.11 · 18 September 2026**

> ### 📍 Fail ini ialah **jejari**, bukan hab
>
> Ia menerangkan **dalaman HADIR sahaja**.
>
> **Hab ekosistem:** <https://sepadan.github.io/dashboard/BLUEPRINT.md>
> (dalam repo: `sepadan/dashboard` → `BLUEPRINT.md`)
>
> Baca hab dahulu. Ia memegang peraturan merentas sistem, kontrak data antara
> sistem, akaun dan rahsia, serta **daftar isu**.
>
> **Fail ini tidak menyimpan senarai isu.** Setiap perkara yang belum selesai —
> bagi mana-mana sistem — dicatat dalam **bahagian 8 hab**. Jangan mulakan satu
> di sini. Dua senarai isu bermakna dua versi kebenaran, dan yang kedua akan
> bercanggah dalam masa beberapa minggu tanpa sesiapa perasan.
>
> Fail ini juga **tidak membuat kenyataan status tentang sistem lain**.

---

## 1. Tujuan

HADIR ialah saluran web kedua bagi sistem KEHADIRAN. Ia tidak mencipta pangkalan
data kehadiran baharu: bot Telegram dan PWA membaca/menulis tab `kehadiran` yang
sama. PWA memberi aliran lebih pantas pada telefon dan bertindak sebagai
sandaran apabila Telegram lambat atau tidak sesuai digunakan.

## 2. Seni bina

```text
Guru → sepadan.github.io/hadir (isi dan semak tanpa log masuk)
Admin → menu sisi → log masuk PIN → tetapan murid · tetapan guru · import/sync
           → doPost mode=hadir (Apps Script KEHADIRAN)
           → tab main / kehadiran
AKSI/SEMAK ↔ relay HADIR berahsia ↔ API rasmi sasaran
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
10. Penyelarasan guru mempunyai dua mod: `merge` menambah/mengemas kini sahaja;
    `sync` menjadikan muatan itu senarai aktif penuh. Guru yang tiada dalam
    `sync` ditanda `TIDAK AKTIF`, bukan dipadam secara fizikal. Kata laluan,
    tugasan dan sejarah sistem kekal.
11. Hanya data induk murid dan guru diselaraskan. Kehadiran, markah, tugasan,
    kata laluan, keahlian dan rekod kokurikulum kekal milik sistem masing-masing.
12. Upload murid dari AKSI atau SEMAK diterima oleh HADIR sebagai `merge`
    sahaja. Bagi guru, simpan/tambah menggunakan `merge` manakala operasi
    padam/nyahaktif menghantar snapshot aktif `sync`. Pengarkiban murid aktif
    hanya boleh dibuat daripada HADIR kerana AKSI/SEMAK mungkin sengaja tidak
    membawa PRA, PPKI atau kumpulan lain.
13. Setiap penghantaran membawa penanda asal `HADIR`/`AKSI`/`SEMAK`; penerima
    tidak menghantar semula ke asal. Ini mencegah gelung penyelarasan.
14. HADIR ialah penyelaras pusat. Operasi guru dipegang oleh satu `ScriptLock`
    sehingga kemas kini tempatan dan penghantaran ke aplikasi lain selesai;
    operasi yang selesai paling akhir menjadi keadaan aktif yang terkini.

## 4. Keselamatan

- Guru terus membaca kelas dan menyimpan kehadiran tanpa sesi.
- Sesi rawak admin lapan jam disimpan dalam Script Properties.
- PIN admin disimpan sebagai SHA-256 (`HADIR_ADMIN_PIN_HASH`).
- Kata laluan perkhidmatan AKSI/SEMAK berada dalam Script Properties sahaja.
- Rahsia relay bersama `SEPADAN_SYNC_SECRET` berada dalam Script Properties
  ketiga-tiga projek dan tidak boleh dimasukkan ke repo atau log.
- Hanya admin boleh melihat/mengemas kini murid atau menjalankan sync penuh.
- Paparan guru menerima nama dan kunci harian legap; IC/MyKid tidak dihantar.
- Semakan tarikh dalam tahun semasa terbuka kepada guru tanpa login atas
  keputusan pemilik sistem. Respons sejarah hanya menghantar nama murid tidak
  hadir; nama murid hadir, IC dan status RMT setiap individu tidak dihantar.
- Bilangan RMT hadir dikira di backend daripada tab `rmt` dan dihantar sebagai
  nisbah agregat kelas `hadir/jumlah`, contohnya `27/30`. Oleh sebab tab `rmt` tidak menyimpan sejarah kelayakan,
  semakan tarikh lalu menggunakan status RMT semasa.

## 5. Kontrak API HADIR

Semua permintaan POST berbentuk:

```json
{"mode":"hadir","kaedah":"init","argumen":[]}
```

Kaedah: `login`, `logout`, `init`, `semakKehadiran`, `bukaKehadiranTarikh`,
`simpanKehadiran`, `senaraiMurid`,
`simpanMurid`, `simpanTetapanMurid`, `uploadMuridCsv`, `syncSemua`,
`senaraiGuru`, `simpanGuru`, `nyahaktifGuru`, `uploadGuruCsv`, `syncGuru`, `terimaSyncMurid`,
`terimaSyncGuru`, `moeisSenaraiKelas`, `moeisSimpanSebab`, `moeisJobBuat`,
`moeisJobSenarai`, `moeisJobSelesai`, `moeisJobKlaim`, `moeisJobLepas`.

`semakKehadiran(tarikhIso)` ialah bacaan awam bagi tahun semasa. Tarikh mesti
berformat `YYYY-MM-DD`, tidak boleh melebihi hari ini, dan ditukar kepada tajuk
`DD/MM` dalam tab `kehadiran`. Respons mengandungi statistik kelas, nisbah
hadir/jumlah RMT dan nama murid tidak hadir sahaja.

`bukaKehadiranTarikh(kelas, tarikhIso)` hanya dipanggil selepas guru menekan
kad kelas bagi tarikh lama dan mengesahkan amaran. Ia menghantar senarai penuh
satu kelas dengan kunci legap khusus tarikh, tanpa IC, tetapi turut membawa
Kategori/Sebab MOEIS sedia ada bagi murid yang sudah ditanda tidak hadir.
`simpanKehadiran(kelas, senaraiSebab, token, tarikhIso)` menerima tarikh ISO
pilihan sebagai argumen keempat; tarikh mesti dalam tahun semasa dan tidak
melebihi hari ini. `senaraiSebab` ialah `[{kunci, kategori, sebab}]` bagi
setiap murid tidak hadir — lihat 5.1. Ringkasan semakan biasa kekal menghantar
nama murid tidak hadir sahaja.

`simpanTetapanMurid(tetapan, token)` hanya untuk admin. Status RMT ditulis ke
tab `rmt`; jawatan ditulis pada lajur tambahan bernama `JAWATAN MURID` dalam
tab `main`. Lajur tambahan ini dikenal melalui tajuk dan tidak mengubah susunan
11 lajur teras. Nilai jawatan yang dibenarkan ialah Pengawas, Pengawas
Perpustakaan, Ketua Kelas, Penolong Ketua Kelas dan Murid Biasa.

### 5.1 Kategori + Sebab MOEIS dan "Hantar ke MOEIS"

MOEIS (`moeispel.moe.gov.my`) mewajibkan Kategori + Sebab bagi setiap murid
tidak hadir. Senarai rasmi (12 kategori, ~80 sebab) disalin secara statik pada
dua tempat kerana projek ini tiada modul kongsi: `MOEIS_SEBAB` dalam `app.js`
(paparan) dan `hadirMoeisSebabData_()` dalam `apps-script/HadirWeb.gs`
(pengesahan pelayan — pelanggan tidak dipercayai). Kedua-dua salinan mesti
dikemas kini bersama jika MOEIS menukar senarainya.

- Apabila guru menekan seorang murid, dialog Kategori→Sebab dibuka. Membatalkan
  dialog tidak menanda murid tidak hadir — aliran pantas lalai (semua hadir)
  kekal. Murid yang sudah bertanda memaparkan sebab sedia ada dan boleh
  ditukar kembali kepada hadir daripada dialog yang sama.
- `simpanKehadiran` menyimpan Kategori/Sebab bersama rekod kehadiran dalam
  tab pelayan `HADIR_MOEIS_SEBAB` (satu baris setiap `tarikhIso`+IC), diganti
  sepenuhnya bagi kelas+tarikh itu pada setiap simpanan supaya murid yang
  kembali hadir tidak mewarisi sebab lama. `hadirBinaInit_` dan
  `hadirBukaKehadiranTarikh_` membaca semula tab ini supaya sebab sedia ada
  dipaparkan apabila guru membuka semula kelas.
- Menu admin **Hantar ke MOEIS** (selepas log masuk admin) memaparkan setiap
  kelas aktif hari ini: bilangan tidak hadir, status sebab (`Lengkap` /
  `Belum lengkap: n`, dikira oleh `hadirMoeisBelumLengkap_`) dan status
  tugasan (`Belum dihantar` / `Menunggu` / `Sedang dihantar` / `Berjaya` /
  `Gagal: <sebab>`). Admin boleh melengkapkan Kategori/Sebab mana-mana murid
  terus dari skrin ini (`moeisSimpanSebab`, menulis satu baris sahaja) tanpa
  membuka semula skrin kehadiran.
- Butang **Hantar** memanggil `moeisJobBuat(kelas, tarikhIso, token)`, yang
  disekat sepenuhnya (`hadirMoeisSahkanLengkap_`) jika ada murid tidak hadir
  tanpa Kategori/Sebab sah, atau jika tiada murid tidak hadir. Hanya
  kehadiran **hari ini** boleh dihantar. Satu tugasan tersimpan setiap
  kelas+tarikh dalam tab `HADIR_MOEIS_JOB`; tugasan pendua disekat melainkan
  tugasan sebelumnya berstatus `gagal` (`hadirMoeisBolehCiptaJob_`), yang mana
  ia boleh dicuba semula.
- HADIR **tidak pernah** menghubungi MOEIS. `moeisJobBuat` hanya menulis
  baris tugasan; enjin Playwright berasingan pada PC guru (kini **Enjin PC
  (Companion)** rasmi dalam `companion/` — lihat bahagian 5.2 — gantian
  prototaip `moeis-bot`) mengambil tugasan menerusi `moeisJobSenarai` dan
  melaporkan keputusan menerusi `moeisJobSelesai`, kedua-duanya disahkan
  dengan rahsia Script Properties `HADIR_MOEIS_ENGINE_SECRET` (corak sama
  seperti `SEPADAN_SYNC_SECRET`) — bukan token admin, kerana enjin berjalan
  tanpa pengawasan. `moeisJobSenarai` memulangkan IC dan senarai murid hanya
  pada laluan rahsia enjin; paparan admin tidak menerima IC.
- **Klaim atomik + lease (v1.11.0).** `moeisJobKlaim(id, pemilik,
  benarkanCubaSemula, rahsia)` mengesahkan dan menukar status tugasan kepada
  `sedang_dihantar` di bawah `ScriptLock`, merekod `PEMILIK` + `LEASE_SELEPAS`
  (15 minit) supaya dua enjin yang cuba tugasan yang sama serentak hanya satu
  berjaya; `moeisJobLepas(id, pemilik, rahsia)` melepaskan balik ke `menunggu`
  bagi henti bersih. Lease luput membenarkan runner lain mengambil alih jika
  runner asal mati. `moeisJobSelesai` menerima keputusan tambahan `tersimpan`
  ("Tersimpan — menunggu pengesahan": dialog Simpan MOEIS berjaya tetapi
  pengesahan selepas muat semula tidak lengkap) — ini **bukan** kejayaan dan
  tidak pernah dicuba semula secara automatik. Tab `HADIR_MOEIS_JOB` mempunyai
  13 lajur (`HADIR_MOEIS_JOB_LEBAR`); helaian lama (11 lajur) dinaik taraf
  lembut dengan menambah tajuk `PEMILIK`/`LEASE_SELEPAS` tanpa menyentuh baris
  sedia ada.
- Tugasan membawa `kelasMoeisId` pilihan (argumen keempat `moeisJobBuat`,
  lajur `KELAS_MOEIS_ID`) untuk pemetaan ID kelas MOEIS. Tiada skrin admin
  memanggil argumen ini lagi; nilainya kosong melainkan diisi terus pada tab
  `HADIR_MOEIS_JOB` atau dihantar oleh pemanggil `moeisJobBuat` itu sendiri.

Jawapan: `{ok:true, hasil:...}` atau `{ok:false, ralat:"..."}`.

### 5.2 Enjin PC (companion)

`companion/` ialah komponen Node (ESM, Node ≥ 20) yang menggantikan
penggunaan manual prototaip `moeis-bot` di terminal. Ia berjalan pada satu PC
guru Windows (Edge sistem, `playwright-core`, **headed** — MOEIS menolak
pelayar headless) dan dikawal daripada kad **Enjin PC (Companion)** dalam
menu admin **Hantar ke MOEIS**. Pemasangan penuh, aliran pemasangan mudah
alih dan had keupayaan yang diuji: [`companion/docs/PEMASANGAN.md`](companion/docs/PEMASANGAN.md).

**Sempadan keselamatan (fail-closed):**
- `server.listen(port, '127.0.0.1')` sahaja — tiada sambungan luar PC.
- Semakan `Host` (kalis DNS-rebinding) + allowlist `Origin` **tepat** (tiada
  wildcard `*`, tiada padanan awalan; lalai hanya `https://sepadan.github.io`)
  + token klien `Authorization: Bearer <token>` dibanding dengan `crypto.timingSafeEqual`.
  Origin tidak dibenarkan → 403 **tanpa** header CORS.
- Rahsia enjin, hash token klien dan metadata pasangan disulit **DPAPI**
  (`CurrentUser`) dalam `rahsia.dat`, dilindungi ACL (`icacls`) selepas
  setiap tulisan; storan gagal **tertutup** jika tiada pelindung DPAPI sah
  (tiada fallback teks biasa). `POST /api/tetapan` menolak terus medan
  `kataLaluan/password/pin/rahsia/token`.
- Storan DPAPI menghantar skrip melalui STDIN `-Command -` dan muatan rahsia
  melalui pemboleh ubah persekitaran proses anak — **tidak** melalui baris arahan
  `powershell.exe` (baris arahan boleh dibaca proses lain pengguna yang sama).
- Log (`src/log.mjs`) menapis IC/MyKid, emel dan rentetan seperti token sebelum
  menyentuh cakera, termasuk stdout/stderr mentah proses anak. **Had diakui:**
  nama murid tidak dimask sepenuhnya (samaran inisial+panjang hanya pada mesej
  keputusan enjin); folder data dihadkan ACL kepada akaun Windows semasa.
- `/api/status` membaca cache sesi (30 min) dan cache sokongan klaim (5 min) — ia
  tidak melancarkan Edge atau membuat panggilan keluar pada poll rutin; hanya
  tindakan eksplisit (`/api/uji-login`, `/api/mula`, log masuk manual) berbuat begitu.
- `apiUrl` (hos `script.google.com` sahaja) dan `originDibenarkan` hanya boleh
  diubah pada PC itu sendiri (UI tempatan ber-nonce / fail tetapan); klien jauh
  tidak boleh meluaskan sempadan kepercayaannya sendiri.
- Tiada endpoint arahan sewenang-wenangnya: tiada `exec`, nama fail, URL atau
  eval daripada klien.
- Kod pasangan sekali guna (TTL 10 minit) hanya boleh dijana daripada UI
  tetapan tempatan (`http://127.0.0.1:<port>/`, nonce per-proses) — bukti
  manusia berada di PC itu. `POST /api/pair` (tiada token, had kadar ketat)
  menukar kod kepada token klien tetap.
- Giliran penghantaran **MATI secara lalai**; hanya `POST /api/mula` (admin
  sah) atau UI tempatan boleh menghidupkannya. `POST /api/mula` dan
  `POST /api/kerja-jalan` menolak dengan **409** jika backend HADIR belum
  di-deploy semula dengan `moeisJobKlaim` (lihat `apps-script/README.md`) —
  tiada mod "hantar tanpa klaim".
- Kata laluan hidup MOEIS/idMe **hanya** melalui alat vault pengguna sendiri
  atau log masuk manual pada Edge companion; companion tidak pernah menaip,
  menyalin atau menyahsulit kredensial pelayar.

**Runner giliran (`src/giliran.mjs`):** idempotent, satu kerja aktif pada
satu masa, log anak penuh (stdout+stderr, disensor) dalam
`log/kerja/<jobid>-<iso>.log`. Setiap kitaran: klaim atomik →
`mod:verifikasi` (tiada tulisan) → jika tiada perubahan, lapor `berjaya`
"tiada perubahan" (termasuk kelas "semua hadir" yang sepadan — **tidak
dilangkau**); jika konflik (MOEIS ada murid tidak hadir tambahan tiada dalam
HADIR), lapor `gagal` tanpa `--paksa` automatik; jika perlu, jalankan
`mod:hantar` dan lapor `berjaya` (disahkan) / `tersimpan` (dialog berjaya,
pengesahan tidak lengkap) / `gagal` mengikut keputusan sebenar.

**Enjin pengisian (`src/moeis/push.mjs` + `src/moeis/halaman.mjs`):**
pembetulan audit prototaip moeis-bot — tab Kehadiran Harian dibuka **sebelum**
sebarang bacaan; tarikh ditetapkan `DD/MM/YYYY` dan **disahkan** sebelum
diteruskan (menolak ISO); dialog simpan eksplisit (`.simpan` lalai,
`.simpansah` hanya dengan `--sahkan`, tiada `.confirm` generik); pengesahan
selepas muat semula membaca **identiti + kategori + sebab setiap murid**
(bukan sekadar ringkasan bilangan kelas) sebelum melapor `disahkan`. Diuji
sepenuhnya terhadap `HalamanPalsu` (DOM mini) — lihat had keupayaan dalam
`companion/docs/PEMASANGAN.md`.

## 6. Penyelarasan murid

- **Update Data Murid** menerima CSV idME dan menggunakan fungsi rasmi
  `simpanSenaraiMuridUpload`. Mod `sync` menjadikan fail senarai aktif penuh;
  mod `merge` hanya menambah atau mengemas kini rekod yang dihantar.
- Parser menerima tajuk idME yang sama seperti halaman upload KEHADIRAN,
  mengekalkan lajur asal dalam `semua`, dan menghadkan satu import kepada 3,000
  rekod serta fail 8 MB.
- AKSI: backend HADIR login sebagai perkhidmatan, membina CSV dalam ingatan dan
  memanggil `importMurid`. Token sesi yang dipulangkan oleh login dihantar pada
  sampul RPC dan pada argumen fungsi; token tetap atau token rekaan tidak
  digunakan. Murid hilang ditanda `TIDAK AKTIF`; data koku kekal.
- SEMAK: backend memanggil `apiUploadMurid`; sheet `MURID`, calon peperiksaan
  aktif dan revisi cache dikemas kini oleh fungsi rasmi SEMAK. Pembaca RPC
  menerima HTML langsung dan pembungkus `HtmlService` Google, kemudian
  mengesahkan `sumber` serta ID respons sebelum menggunakan hasil. Markah kekal.
- Jika salah satu sasaran gagal, perubahan tab `main` tidak dibatalkan. UI
  memaparkan sasaran yang gagal dan admin boleh tekan **Selaras Semua Aplikasi**.
- Upload daripada AKSI/SEMAK masuk melalui relay berahsia. HADIR menggabungkan
  data asas itu ke `main`, kemudian menghantar senarai aktif penuh kepada sistem
  ketiga. Pembuangan murid tidak disebarkan dari sumber luar HADIR.
- Semua sasaran tetap menjalankan API rasmi sendiri. Oleh itu AKSI terus
  mengecualikan kumpulan yang tidak layak kokurikulum dan SEMAK terus membina
  calon/cache mengikut peraturannya; hanya data asas yang menjadi sama.
- Data Murid memaparkan kelas sebagai `1 Bijak`, bukan `TAHUN SATU · BIJAK`.
  Seluruh kad nama boleh ditekan untuk membuka butiran baca sahaja. Butang
  **Edit** mengaktifkan medan sebelum **Simpan & Selaras** boleh ditekan.
- Tahun diambil daripada `TAHUN/TINGKATAN`. Jantina diambil mengikut turutan:
  lajur bertajuk `JANTINA`/`JENIS KELAMIN`, tab `jantina`, kemudian pariti digit
  akhir IC Malaysia sebagai sandaran.

### 6.1 Penyelarasan guru

- Tab `HADIR_GURU` menyimpan `NAMA GURU`, `JAWATAN`, masa kemas kini dan
  `STATUS` (`AKTIF`/`TIDAK AKTIF`). Skema lama dinaik taraf tanpa membuang baris.
- Tetapan Guru hanya untuk admin. Admin boleh menambah seorang guru, mencari
  senarai, mengimport CSV atau menjalankan penyelarasan semula.
- CSV menerima `NAMA GURU`/`NAMA`; `JAWATAN` adalah pilihan, maksimum 1,000
  rekod dan 4 MB. Nama pendua dalam fail diproses sekali.
- Import menawarkan `merge` dan `sync`. `merge` tidak menyentuh guru yang tiada;
  `sync` menyahaktifkan guru yang tiada selepas pratonton dan pengesahan admin.
  Nyahaktif bukan padam fizikal, dan guru boleh diaktifkan semula oleh import
  atau tambah berikutnya. Jawatan kosong tidak menindih jawatan sedia ada.
- AKSI menerima objek `{nama,jawatan}` melalui `importGuru`. Mod `sync`
  menyamakan status aktif pada tab `GURU`; akaun, kata laluan, tugasan dan
  sejarah kokurikulum lama dikekalkan.
- SEMAK menerima `apiImportGuru`, menyimpan status dalam tab `GURU`, menambah
  nama baharu dengan kata laluan lalai serta mengekalkan kata laluan, tugasan,
  markah dan sejarah guru yang dinyahaktifkan.
- Setiap aplikasi masih mengekalkan kawalan kemas kini gurunya sendiri.
- Tambah/upload guru dalam AKSI atau SEMAK turut dihantar kepada HADIR dan
  aplikasi ketiga. Tambah/edit menggunakan `merge`; nyahaktif atau sync penuh
  menggunakan snapshot aktif `sync`. Kata laluan/tugasan tempatan tidak ikut
  penyelarasan.
- Bagi pemasangan lama, pengguna mengesahkan senarai SEMAK ialah yang paling
  baharu. Jika `HADIR_GURU` kosong, **Selaras** mengambil SEMAK sebagai benih;
  AKSI hanya menjadi sandaran apabila SEMAK gagal atau kosong. Senarai itu
  digabung di HADIR dan dihantar melalui API rasmi. Selepas benih wujud, aliran
  dua hala biasa digunakan.
- Respons RPC SEMAK kadangkala menukar padding Base64 `=` kepada `\x3d`.
  Pembaca HADIR menormalkan kedua-dua bentuk sebelum menyemak sumber dan ID.

## 7. PWA dan auto-update

Versi aplikasi `HADIR v1.11.0`. Label kaki menu sengaja tidak menulis `PWA`,
tetapi manifest, pemasangan homescreen dan auto-update kekal aktif.
`service-worker.js` memintas permintaan GET sama asal sahaja. Backend Apps
Script berlainan asal, maka data tidak pernah masuk Cache Storage.

### Strategi cache — kod berbeza daripada ikon

| Jenis | Strategi | Sebab |
|---|---|---|
| Halaman (navigate) | Rangkaian dahulu | Guru sentiasa mendapat HTML terbaharu |
| `.js` `.css` `.webmanifest` | **Rangkaian dahulu** | Kod lapuk merosakkan aplikasi sepenuhnya |
| Ikon dan gambar | Cache dahulu | Besar, dan tidak pernah berubah |

> Pada 25 Ogos 2026, `index.html` dikemas kini tetapi nombor versi pada
> `app.js?v=` tidak dinaikkan. Strategi cache-first ketika itu menghidangkan
> `app.js` lama bersama HTML baharu. Elemen `menuClassName` sudah dibuang dari
> HTML tetapi masih dicari oleh JavaScript lama, jadi aplikasi mati dengan
> *"Cannot set properties of null"* — guru tidak boleh mengisi kehadiran
> mahupun log masuk.
>
> Bergantung pada manusia mengingati tiga nombor versi dalam tiga fail ialah
> reka bentuk yang rapuh. Kod kini diambil dari rangkaian dahulu, dan cache
> menjadi sandaran luar talian sahaja.

### Senarai semak WAJIB bagi setiap perubahan aset

Ketiga-tiganya dalam **commit yang sama**, atau jangan buat langsung:

1. `index.html` — naikkan `?v=` pada `styles.css`, `config.js`, `app.js`, `manifest.webmanifest`
2. `service-worker.js` — naikkan `?v=` yang sama dalam `APP_SHELL`
3. `service-worker.js` — naikkan `CACHE_VERSION`, supaya cache lama dibuang

Nombor versi dalam `config.js` (`versi:`) dinaikkan sekali supaya guru nampak
versi sebenar di kaki menu sisi.

### Laluan awal pantas dan tahan beban

`init` ialah bacaan sahaja. Ia tidak boleh memanggil `sediakanLajurSahaja()`
atau menjalankan kerja tulis; lajur hari ini hanya disediakan ketika guru
menyimpan kehadiran. Respons `init` disimpan selama 60 saat dalam
`CacheService` Apps Script untuk menyerap pembukaan serentak pada waktu pagi.
Cache ini berada di pelayan dan dibuang selepas kehadiran atau data murid
berubah.

Untuk masa paparan yang konsisten, respons `init` terakhir bagi **hari semasa**
turut disimpan dalam `localStorage` peranti. Pada pembukaan seterusnya, sembilan
kad kelas dipaparkan segera daripada salinan itu sementara data terkini diminta
di latar. Salinan mengandungi nama dan status kehadiran yang memang boleh dibaca
oleh guru, tetapi tidak mengandungi IC, PIN, token atau hak admin; ia dipaksa ke
peranan guru dan dibuang secara automatik apabila tarikh berubah. Cache Storage
Service Worker tetap tidak menyimpan respons API. Kad cache bersifat baca sahaja
sehingga kemas kini latar selesai, supaya data lama tidak boleh digunakan untuk
menimpa rekod kehadiran yang lebih baharu.

Frontend mengehadkan cubaan pertama kepada 12 saat dan mencuba sekali lagi
secara automatik. Jika kedua-duanya gagal, punca sebenar dipaparkan bersama
butang **Cuba semula** pada muka depan.

### Pemasangan berdaya tahan

`cache.addAll()` menolak keseluruhan janji jika **satu** fail gagal diambil —
satu ikon tersalah nama bermakna Service Worker langsung tidak dipasang dan PWA
mati senyap. Setiap fail kini diambil berasingan dengan `cache.add().catch()`.

## 8. Status pembinaan

Senarai ini merekod **apa yang sudah dibina**, sebagai sejarah. Ia bukan senarai
isu — perkara yang masih tertunggak dicatat dalam bahagian 8 hab.

- [x] Antara muka satu muka dengan dropdown kelas dibina.
- [x] Guru boleh mengisi kehadiran terus tanpa log masuk.
- [x] Log masuk admin dipindahkan ke menu sisi.
- [x] Paparan mudah alih, menu boleh ditutup dan dok simpan melekit dibina.
- [x] Menu desktop kekal terbuka seperti AKSI; menu telefon kekal buka/tutup.
- [x] Kad kelas berulang dibuang daripada menu sisi; kelas dan bilangan murid
  kekal jelas dalam dropdown utama.
- [x] Menu Semak Kehadiran dibina dengan pilihan Semua Kelas dan setiap kelas.
- [x] Semak Kehadiran menjadi muka depan. Kad kelas boleh ditekan untuk
  membuka pengisian kehadiran hari ini dengan kelas itu terus dipilih.
- [x] Semak Kehadiran berada paling atas dalam menu dan kembali kepada hari
  semasa setiap kali halaman dimuat semula atau menu itu dibuka. Kad tidak
  mempunyai footer teks/anak panah; seluruh kad kekal sebagai sasaran tekan.
- [x] Kad tarikh lama memaparkan amaran sebelum membuka senarai penuh kelas
  bagi tarikh dipilih. Guru masih boleh mengubah dan menyimpan tarikh itu;
  respons ringkasan tidak mendedahkan nama murid hadir atau IC.
- [x] Bacaan awal tidak lagi menyediakan lajur. Cache pelayan 60 saat, salinan
  data hari ini pada peranti dan cubaan semula automatik mengelakkan barisan
  panjang serta memaparkan muka depan segera pada penggunaan seterusnya.
- [x] Semak Kehadiran mempunyai pilihan tarikh bagi tahun semasa, boleh dibuka
  guru tanpa login, dan hanya menyenaraikan nama murid tidak hadir.
- [x] Kehadiran hari ini dan Semak Kehadiran memaparkan bilangan murid RMT
  hadir/jumlah sebagai agregat, contohnya `27/30`; status RMT individu tidak
  dihantar ke paparan guru.
- [x] Admin mempunyai Tetapan Murid mengikut kelas untuk RMT dan jawatan.
- [x] Admin mempunyai Tetapan Guru untuk tambah, nyahaktif, carian dan upload
  CSV mod gabung/sync penuh dengan pratonton; AKSI/SEMAK disamakan tanpa
  memadam kata laluan, tugasan atau sejarah.
- [x] Data Murid menggunakan kad nama boleh tekan, paparan awal baca sahaja,
  kelas `1 Bijak`, serta tahun dan jantina yang dilengkapkan daripada data sedia ada.
- [x] Log keluar admin dipindahkan ke kaki menu di sebelah versi HADIR.
- [x] Tajuk pilihan dipadatkan kepada Kelas; Set semula diletakkan di sebelah
  tajuk dan kad ringkasan kelas lama dibuang untuk meluaskan ruang nama.
- [x] Log masuk admin diletakkan di sebelah versi; ayat tanpa log masuk dibuang.
- [x] Butang + Murid diganti dengan Update Data Murid CSV idME; edit satu murid
  kekal tersedia.
- [x] Bar atas dan mesej luar talian menghormati `safe-area-inset-top` supaya
  status/notch iPhone tidak menindih logo, masa atau tajuk PWA homescreen.
- [x] Nama hari dan bulan pada bar atas dipaparkan sepenuhnya dalam Bahasa
  Melayu pada pelayar dan PWA, tanpa bergantung pada locale Apps Script.
- [x] Senarai murid boleh discroll pada desktop dan telefon tanpa limpahan
  mendatar; nama panjang menggunakan elipsis dan status kekal kelihatan.
- [x] HADIR v1.2.0 diterbitkan melalui GitHub Pages run #5 untuk commit
  `8284fa6`; produksi desktop 1440×900 dan telefon 390×844 disahkan.
- [x] Pengurusan murid admin dan sync kelompok dibina.
- [x] Manifest, Service Worker, paparan luar talian dan auto-update dibina.
- [x] Backend Apps Script serta penghala Telegram serasi disediakan; pembaikan
  penyelarasan diterbitkan pada deployment versi 98 menggunakan URL yang sama.
- [x] Ikon HADIR disalin dan semua saiz PWA dijana.
- [x] Backend ditampal, Script Properties ditetapkan dan deployment dikemas kini.
- [x] URL `/exec` deployment sedia ada dimasukkan ke `config.js`.
- [x] Apps Script versi 96 dan GitHub Pages run #3 untuk commit `ea910fb` diterbitkan.
- [x] Produksi telefon disahkan: 9 pilihan kelas, pemilihan kelas automatik,
  senarai murid tanpa login, menu boleh ditutup dan PWA berstatus sedia.
- [x] IC/MyKid tidak muncul pada paparan guru dan konsol tidak melaporkan ralat.
- [x] Kategori + Sebab MOEIS wajib ketika menanda tidak hadir, disahkan di
  pelayan dan disimpan bersama rekod kehadiran. Menu admin **Hantar ke
  MOEIS** menyenaraikan kelas hari ini, mengesan "Belum lengkap", membenarkan
  admin melengkapkan sebab terus dari skrin itu, dan mencipta satu tugasan
  giliran setiap kelas+tarikh (elak pendua melainkan tugasan lalu gagal).
  HADIR tidak menghubungi MOEIS; tugasan diambil dan dilaporkan oleh enjin
  `moeis-bot` berasingan menerusi rahsia `HADIR_MOEIS_ENGINE_SECRET`.
- [x] **Enjin PC (Companion)** rasmi (`companion/`) menggantikan penggunaan
  manual terminal: pelayan loopback (Host+Origin+token fail-closed, tiada
  wildcard CORS), storan rahsia DPAPI, pasangan kod sekali guna, klaim
  atomik + lease pada backend (`moeisJobKlaim`/`moeisJobLepas`, status
  `tersimpan` baharu), runner giliran idempotent (MATI lalai), dan enjin
  pengisian yang membetulkan audit prototaip moeis-bot (tab dibuka dahulu,
  tarikh disahkan, dialog simpan eksplisit, pengesahan identiti+kategori+sebab
  penuh selepas muat semula). Kad admin **Enjin PC (Companion)** dalam
  **Hantar ke MOEIS** menyambung, menguji dan mengawal PC itu.
  Ujian asap E2E tempatan companion (loopback sebenar, DPAPI sebenar,
  tiada pelayar, tiada rangkaian MOEIS): 43/43 pemeriksaan lulus — empangan
  nonce UI tempatan, Origin/Host (anti DNS-rebinding), preflight CORS tidak
  wildcard, pasangan kod sekali guna, penolakan medan rahsia pada
  `/api/tetapan`, giliran MATI lalai, `/api/mula` 409 (fail-closed), laporan
  jujur `adaRahsiaEnjin`/`klaimDisokong`, sekatan kadar auth 429. Ujian ini
  mendedahkan dan mengesahkan pembetulan satu pepijat sebenar: PowerShell 5.1
  TIDAK memuatkan `System.Security` secara automatik, jadi protector DPAPI
  mesti `Add-Type -AssemblyName System.Security` — tanpa itu pasangan pertama
  guru akan gagal walaupun semua ujian unit lulus (protector palsu disuntik
  dalam ujian unit). `sahkanProtectorBerfungsi()` kini menjalankan bulat-pusing
  probe semasa permulaan supaya kegagalan DPAPI muncul serta-merta.
- [x] **Semakan bebas oleh model keluarga berbeza (DeepSeek)**, bukan penulis
  kod: LULUS BERSYARAT dengan 9 penemuan, semuanya dibetulkan dan dikunci
  dengan ujian regresi berlabel `[penemuan N]` dalam
  `companion/tests/pembetulan-semakan.test.mjs`:
  1. (TINGGI) `log-masuk-manual.mjs` menulis cookie sesi idMe ke `sesi.json`
     teks biasa — penulisan dibuang; sesi hidup dalam profil Edge berasingan
     (disulit DPAPI oleh Chromium). 2. Payload murid (termasuk IC) dihantar
     sebagai argumen CLI — kini melalui STDIN dan medan `ic` dibuang
     (`src/moeis/payload.mjs`). 3. `moeisJobSelesai` menerima laporan daripada
     mana-mana pemegang rahsia enjin — kini `pemilik` + status semasa mesti
     sepadan di bawah `ScriptLock`. 4. `apiUrl`/`originDibenarkan` boleh
     diubah oleh klien jauh — kini `apiUrl` hos sahaja + UI tempatan, dan
     `originDibenarkan` hanya melalui fail tetapan (disahkan ketat).
  5. `/api/status` melancarkan Edge pada setiap poll — kini cache sesi 30 min
     + cache sokongan klaim 5 min; pelayar hanya dilancarkan pada tindakan
     eksplisit. 6. Had kadar auth global boleh lockout silang — kini baldi
     berasingan (pasangan vs token). 7. Heuristik sokongan klaim terlalu
     longgar — kini hanya `Tugasan tidak ditemui` = disokong. 8. Regex hos
     idMe longgar dalam adapter — kini `adalahHosIdMe()` (HTTPS + hos tepat).
  9. Heartbeat lease gagal senyap — kini direkod sebagai had yang diakui
     (`LEASE_HEARTBEAT_GAGAL`), bukan didakwa sempurna.
- [x] **Pusingan pengesahan bebas kedua (DeepSeek)** mengesahkan pembetulan 1–4
  **ditutup** dan angka ujian tepat. Tiga penemuan baharu daripadanya turut
  dibetulkan: (a) [SED] rahsia pernah dibina ke dalam baris arahan
  `powershell.exe` — kini skrip melalui STDIN (`-Command -`) dan muatan melalui
  pemboleh ubah persekitaran proses anak (`HADIR_PS_DATA`); ujian tingkah laku
  memeriksa argv/env sebenar. (b) [RENDAH] penapis lapisan log sebenar ditambah
  (IC/emel/token dimask sebelum menyentuh cakera, termasuk stdout/stderr anak)
  dan had diakui secara jujur: nama murid TIDAK dimask sepenuhnya. (c) [RENDAH]
  ujian penemuan 1/3 dinaikkan daripada imbas kod sumber kepada ujian tingkah
  laku (senarai fail sebenar pada cakera selepas aliran pasangan; klien
  menghantar `pemilik` dalam `moeisJobSelesai`) — hanya bentuk `HadirWeb.gs`
  kekal ujian struktur kerana Apps Script tidak boleh dijalankan dalam Node.
  Pepijat ketiga ditemui oleh ujian DPAPI nyata: `powershell -Command -`
  melaksanakan STDIN baris demi baris, jadi skrip berbilang baris gagal SENYAP
  (status 0, keluaran kosong) — skrip kini satu baris dan keluaran kosong
  dianggap kegagalan (fail tertutup).

**Baki pengesahan:** satu simpanan kehadiran sebenar dan satu sync AKSI/SEMAK
masih perlu dijalankan oleh pengguna. Dicatat sebagai **isu #20 dalam hab** —
ujian itu akan mengubah data sekolah sebenar, jadi hanya pengguna boleh
memutuskan bila. Tambahan companion: backend HADIR **perlu di-deploy semula**
sebelum companion boleh menghidupkan giliran (lihat `apps-script/README.md`);
`uji-login`, log masuk manual idMe dan pengesanan sesi idMe **sudah
diimplementasi** (`companion/src/moeis/sesi.mjs`, `bin/uji-login.mjs`,
`bin/log-masuk-manual.mjs`) dan diuji terhadap double halaman, tetapi **belum
pernah dijalankan terhadap MOEIS/idMe hidup** — larangan kerja ini. Log masuk
idMe kekal MANUAL oleh manusia pada PC itu; companion tidak menaip kata laluan
dan tidak mengklik kotak semak. Had penuh: `companion/docs/PEMASANGAN.md`.

## 9. Rekod perubahan

| Tarikh | Versi | Perubahan | Data |
|---|---|---|---|
| 18 September 2026 | 1.11.0 | Tambah **Enjin PC (Companion)** rasmi (`companion/`, Node ESM) menggantikan penggunaan manual terminal `moeis-bot`: pelayan loopback fail-closed (Host+Origin allowlist tepat+token Bearer timingSafeEqual, tiada wildcard CORS, had kadar auth), storan rahsia DPAPI (CurrentUser, ACL icacls, gagal tertutup tanpa fallback teks biasa), pasangan kod sekali guna, UI tetapan tempatan (nonce), CLI, skrip pemasangan/artifak. Backend: klaim atomik + lease (`moeisJobKlaim`/`moeisJobLepas`, `ScriptLock`), status tugasan baharu `sedang_dihantar`/`tersimpan`, migrasi lembut `HADIR_MOEIS_JOB_LEBAR` 11→13 (lajur `PEMILIK`/`LEASE_SELEPAS`). Runner giliran idempotent (MATI lalai, satu kerja sesaat, log anak penuh disensor). Enjin pengisian membetulkan audit prototaip moeis-bot: tab Kehadiran Harian dibuka sebelum bacaan, tarikh `DD/MM/YYYY` disahkan sebelum diteruskan, dialog simpan eksplisit (`.simpan`/`.simpansah`, tiada `.confirm` generik), pengesahan selepas muat semula membaca identiti+kategori+sebab setiap murid (bukan ringkasan bilangan sahaja). Kad admin **Enjin PC (Companion)** baharu dalam **Hantar ke MOEIS**: sambung/uji/mula/henti/jalankan-semula/putuskan. Aset dan cache PWA dinaikkan serentak | Ujian automatik (`node --test companion/tests/`) menggunakan double halaman (`HalamanPalsu`) dan double storan/klien HADIR sahaja — **tiada pelayar/rangkaian sebenar, tiada data murid sebenar**. Backend HADIR perlu di-deploy semula untuk `moeisJobKlaim`/`moeisJobLepas` sebelum companion boleh menghidupkan giliran (fail-closed 409 jika belum). Ujian asap E2E tempatan (loopback+DPAPI sebenar, tiada pelayar/MOEIS): 43/43 lulus (suite unit/integrasi companion: 102 ujian, 101 lulus, 1 dilangkau); ia menemui dan mengesahkan pembetulan pepijat DPAPI (PowerShell 5.1 perlukan `Add-Type -AssemblyName System.Security`) dan pepijat UI tempatan (nonce tidak boleh dihantar melalui `<script src>` — halaman kini dibuka dengan `?n=<nonce>`, header hanya untuk `/api/lokal/*`). `uji-login`, log masuk manual dan pengesanan sesi idMe sudah diimplementasi dan diuji hanya terhadap double halaman — **belum disahkan terhadap MOEIS/idMe hidup**; log masuk idMe kekal manual oleh manusia. Semakan bebas keluarga model berbeza (DeepSeek) memberi LULUS BERSYARAT dengan 9 penemuan (1 tinggi, 4 sederhana, 4 rendah) — semuanya dibetulkan: cookie sesi tidak lagi ditulis ke fail teks biasa, payload murid melalui STDIN tanpa IC, `moeisJobSelesai` kini memerlukan pemilik+status klaim sepadan, apiUrl/Origin allowlist tidak lagi boleh diluaskan oleh klien jauh, `/api/status` tidak melancarkan pelayar (cache), had kadar auth dibahagikan mengikut baldi, pengesanan sokongan klaim ketat, semakan hos idMe ketat, dan heartbeat lease direkod apabila gagal |
| 17 September 2026 | 1.10.0 | Tambah Kategori + Sebab MOEIS wajib ketika menanda tidak hadir (senarai rasmi disalin statik pada frontend dan backend; pengesahan sentiasa di pelayan), disimpan bersama kehadiran dalam tab baharu `HADIR_MOEIS_SEBAB`. Tambah menu admin **Hantar ke MOEIS**: status "Lengkap"/"Belum lengkap: n" setiap kelas hari ini, kemas kini sebab terus dari skrin itu, dan `moeisJobBuat`/`moeisJobSenarai`/`moeisJobSelesai` mencipta serta menjejak tugasan giliran dalam tab baharu `HADIR_MOEIS_JOB` (elak pendua melainkan tugasan lalu gagal). HADIR hanya menyediakan data — enjin `moeis-bot` berasingan pada PC guru yang menghantar ke MOEIS, disahkan dengan rahsia Script Properties `HADIR_MOEIS_ENGINE_SECRET`. Aset dan cache PWA dinaikkan serentak | Tiada nama/IC murid sebenar disentuh dalam ujian; ujian automatik mengesahkan pengesahan kategori/sebab, pengiraan belum lengkap, sekatan hantar tidak lengkap dan elak pendua tugasan. Penghantaran sebenar ke MOEIS oleh enjin PC belum disahkan pengguna |
| 30 Ogos 2026 | audit repo | Login admin kini dihadkan kepada lima cubaan PIN gagal dan disekat 15 minit. `ScriptProperties` ialah sumber benar yang tahan pelucutan cache; semak, tambah, sekat, reset dan cipta sesi dilaksanakan sebagai satu peralihan atomik di bawah `ScriptLock`. Suite HADIR menjalankan simulasi tingkah laku lima kegagalan, penolakan ketika sekatan dan pemulihan selepas luput | Tiada PIN/token/data sekolah sebenar dibaca atau diubah; Apps Script Version 111 diterbitkan pada URL sedia ada |
| 29 Ogos 2026 | 1.9.0 | Penyelarasan guru autoritatif dari mana-mana sistem: tambah/edit `merge`, nyahaktif/sync penuh menghantar snapshot aktif, status disimpan tanpa padam fizikal, dan satu kunci pusat HADIR menyusun operasi bertindih. CSV HADIR mempunyai pratonton serta pengesahan sebelum menyahaktifkan nama yang tiada. Apps Script Version 110 diterbitkan pada URL sama; AKSI v1.5.0 Version 11 dan SEMAK v1.2.0 Version 61 menerima kontrak yang sama | Kata laluan, tugasan, markah, kokurikulum dan sejarah tidak dipindah atau dipadam. Pengesahan teknikal tidak menambah/menyahaktif guru produksi |
| 28 Ogos 2026 | 1.8.2 | Tetapkan SEMAK sebagai sumber migrasi guru paling baharu seperti disahkan pengguna; AKSI hanya sandaran jika SEMAK gagal/kosong. Paparan menerangkan sumber ini dan cache PWA dinaikkan serentak | Penyelarasan kekal nama/jawatan sahaja; kata laluan, tugasan dan rekod sistem tidak dipadam |
| 28 Ogos 2026 | 1.8.1 | Baiki migrasi awal guru: jika `HADIR_GURU` kosong, butang Selaras membina kesatuan senarai sedia ada daripada AKSI dan SEMAK, menggabung nama/jawatan di bawah `ScriptLock`, kemudian menyebarkannya melalui aliran rasmi. Kata laluan dan tetapan tempatan tidak disentuh | Ujian kontrak memastikan tarikan hanya berlaku ketika HADIR kosong, AKSI menggunakan token sesi sebenar, dan SEMAK hanya menghantar nama tanpa kata laluan |
| 28 Ogos 2026 | 1.8.0 | Jadikan upload murid dan guru dua hala melalui relay HADIR berahsia. Upload pada HADIR, AKSI atau SEMAK menyelaraskan data asas ke aplikasi lain menggunakan API rasmi, penanda asal mencegah gelung, murid sumber luar digabung tanpa mengarkib kumpulan yang tiada, dan syarat domain setiap sistem kekal | Ujian kontrak, rahsia Script Properties, merge-only dan pencegahan gelung lulus; tiada nama, IC atau rahsia dimasukkan ke repo/log |
| 28 Ogos 2026 | 1.7.0 | Tambah Tetapan Guru admin: senarai/carian, tambah seorang, upload CSV dan selaras semula. Backend menyimpan sumber `HADIR_GURU`, menggabung tanpa memadam, mengekalkan kata laluan/tempatan AKSI dan SEMAK, serta menulis secara pukal di bawah kunci. Pembaikan tambahan menerima padding Base64 Google `\x3d`. Apps Script Version 106 diterbitkan pada URL sama; AKSI Version 9 dan SEMAK Version 59 menerima kontrak import guru baharu. Aset dan cache PWA dinaikkan serentak | Ujian sintaks, parser CSV, kontrak merge-only, kunci dan penghala lulus. Produksi diuji dengan token/kata laluan palsu sahaja; penolakan berlaku sebelum tulisan, maka tiada data guru sebenar diubah |
| 26 Ogos 2026 | 1.6.3 | Kemaskan Semak Kehadiran: buang footer `Isi kehadiran` dan anak panah daripada kad, jadikan seluruh kad sasaran tekan, kekang input tarikh pada lebar telefon, susun Semak Kehadiran sebelum Kehadiran dan paksa semakan kembali ke hari semasa apabila dibuka semula. Tarikh lama kini memberi amaran, memuat satu kelas melalui kunci legap khusus tarikh dan boleh disimpan ke tarikh dipilih. GitHub commit `4cf3c0a` dan Apps Script versi 104 diterbitkan pada URL sedia ada; produksi disahkan memuat aset/cache v1.6.3 dan mengenali laluan tarikh lama | Ringkasan sejarah kekal hanya menghantar nama murid tidak hadir. Muatan suntingan satu kelas tidak membawa IC; pengesahan produksi menggunakan permintaan tidak sah yang baca sahaja, maka tiada rekod sebenar diubah semasa pembangunan dan ujian |
| 26 Ogos 2026 | 1.6.2 | Konsistenkan muatan awal: cache pelayan dilanjutkan kepada 60 saat dan data `init` hari ini dipaparkan segera daripada `localStorage` sambil kemas kini rangkaian berjalan di latar. Cache peranti luput pada pertukaran tarikh dan sentiasa dipaksa ke mod guru. GitHub commit `6d02adf` dan Apps Script versi 103 diterbitkan. Lima muatan produksi berturut-turut memaparkan 9 kelas dalam 0.265–0.446 saat; lima eksekusi cache pelayan selesai dalam 0.505–0.866 saat | Salinan peranti mengandungi data paparan guru hari semasa sahaja; tiada IC, PIN, token atau hak admin disimpan. Kad kekal baca sahaja sehingga kemas kini latar selesai |
| 26 Ogos 2026 | 1.6.1 | Baiki kegagalan rawak waktu pagi: log produksi menunjukkan satu `doPost` mengambil 123.924 saat dan beberapa panggilan berikutnya 10–11 saat kerana `init` melakukan kerja penyediaan lajur. Keluarkan kerja tulis daripada `init`, tambah cache pelayan 15 saat dengan pembatalan selepas perubahan, cuba semula automatik dan butang Cuba semula; naikkan versi aset/cache PWA serentak | Cache berada dalam Apps Script dan singkat; Service Worker/telefon kekal tidak menyimpan nama, IC atau respons API |
| 26 Ogos 2026 | 1.6.0 | Jadikan Semak Kehadiran muka depan bagi guru dan admin; setiap kad kelas kini boleh ditekan untuk membuka halaman pengisian dengan kelas berkenaan terus dipilih; padatkan kepala semakan, kawalan, statistik dan kad kelas pada telefon; tambah keadaan memuat/gagal pada muka depan; naikkan semua versi aset dan cache PWA serentak | Perubahan frontend sahaja; tiada rekod kehadiran atau data murid diubah semasa pembangunan |
| 25 Ogos 2026 | 1.5.0 | Tambah Tetapan Murid mengikut kelas untuk status RMT dan jawatan; ubah Data Murid kepada kad nama boleh tekan dengan paparan baca sahaja sebelum Edit; lengkapkan tahun/jantina; pindah Log Keluar ke kaki menu; papar RMT sebagai nisbah hadir/jumlah; naikkan semua versi aset dan cache PWA serentak. GitHub commit `9e05fc4` dan Apps Script versi 101 diterbitkan. Produksi memuat 9 kelas dan Semak Kehadiran 24 Ogos memaparkan RMT `26/33` tanpa ralat konsol | Struktur menyimpan RMT dalam tab `rmt` dan jawatan pada lajur `JAWATAN MURID`; ujian automatik dan paparan tidak mengubah rekod murid sebenar |
| 25 Ogos 2026 | 1.4.0 | Tambah pilihan tarikh baca sahaja dalam Semak Kehadiran untuk guru tanpa login. Semakan dihadkan kepada tahun semasa dan hanya menghantar nama murid tidak hadir. Tambah bilangan agregat RMT hadir pada aliran hari ini serta semakan kelas; status RMT individu tidak dihantar. Semua versi aset dan cache PWA dinaikkan serentak. GitHub commit `8641245` dan Apps Script versi 100 diterbitkan; produksi 24 Ogos memuat 9 kelas, 31 tidak hadir dan 26 RMT hadir tanpa ralat konsol | Ujian produksi hanya membaca rekod 24 Ogos dan menukar penapis kelas; tiada kehadiran disimpan |
| 25 Ogos 2026 | 1.3.1 backend | Nama hari dan bulan pada bar atas ditukar kepada Bahasa Melayu melalui pemetaan tarikh berasaskan zon `Asia/Kuala_Lumpur`; contoh ujian `Selasa, 25 Ogos 2026`. Pemformat tidak lagi bergantung pada locale Inggeris `Utilities.formatDate` | Tiada data diubah |
| 25 Ogos 2026 | 1.3.1 backend | **Penghubung penyelarasan dibaiki dan diterbitkan pada Apps Script versi 98.** AKSI kini menerima token sesi sebenar pada sampul RPC selepas login perkhidmatan. Pembaca SEMAK kini menerima respons langsung dan pembungkus `HtmlService` Google serta menyemak sumber/ID respons. Ujian regresi turut mengesahkan kedua-dua format dan membuang jangkaan lama terhadap kad kelas menu yang sudah dibuang | Ujian tidak menulis data; satu sync produksi sebenar kekal sebagai pengesahan pengguna dalam isu #20 hab |
| 25 Ogos 2026 | 1.3.1 | **Regresi cache dibaiki.** Kod (`.js`/`.css`/`.webmanifest`) kini diambil rangkaian-dahulu; ikon kekal cache-dahulu. `CACHE_VERSION` dan semua `?v=` dinaikkan ke `1.3.1`. Pemasangan Service Worker tidak lagi gagal sepenuhnya kalau satu aset hilang. Senarai semak tiga langkah ditambah di bahagian 7 | Tiada data diubah |
| 25 Ogos 2026 | 1.3.1 | **Pepijat keadaan lalai dibaiki.** `Number(m.nilai) === 0` menandakan setiap murid yang belum ditanda sebagai tidak hadir, kerana `Number('')` ialah `0` dalam JavaScript. Pada pagi hari baru seluruh kelas kelihatan merah dan kaunter berbunyi "24 tidak hadir". Diganti dengan pembandingan ketat melalui `tidakHadirAsal_()`. Kaunter memaparkan "Semua hadir" apabila sifar. Kotak "KELAS DIPILIH" dibuang dari menu sisi — nama kelas sudah ada dalam dropdown | Tiada data diubah; pepijat hanya pada paparan, tetapi satu ketikan Simpan boleh merekod seluruh kelas tidak hadir |
| 2026-08-24 | 1.3.0 | Tambah Semak Kehadiran semua/ikut kelas; kemaskan pilihan kelas, butang Set semula, menu dan ruang nama; tambah import CSV idME admin melalui fungsi rasmi KEHADIRAN; lindungi bar atas PWA homescreen dengan ruang selamat iPhone; naikkan cache PWA | Ujian hanya membaca data produksi dan menggunakan semakan struktur/paparan; tiada kehadiran disimpan, fail murid diimport atau sync sebenar dijalankan |
| 2026-08-24 | 1.2.0 | Baiki kawasan scroll; kekalkan sidebar pada desktop; menu telefon boleh buka/tutup; paparkan kelas dipilih dalam menu; kemaskan kad nama panjang dan naikkan cache PWA; GitHub Pages run #5 (`8284fa6`) berjaya | Ujian produksi hanya membaca senarai dan menguji UI; tiada kehadiran atau data murid diubah |
| 2026-08-24 | 1.1.0 | Susun semula kepada satu muka mesra telefon; guru terus isi tanpa login; login admin sahaja dalam menu; IC awam diganti kunci harian legap; Apps Script v96 dan GitHub Pages run #3 (`ea910fb`) diterbitkan | Ujian produksi hanya membaca senarai dan menguji UI; tiada kehadiran disimpan dan tiada sync sebenar dijalankan |
| 2026-08-24 | 1.0.0 | Diterbitkan melalui GitHub Pages run #1 untuk commit `0382449`; Apps Script deployment kekal pada URL lama dan dinaikkan ke versi 95; Script Properties serta sambungan log masuk disahkan | Ujian teknikal hanya menggunakan PIN salah; tiada kehadiran atau data murid sebenar diubah |
