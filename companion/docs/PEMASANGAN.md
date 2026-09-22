# Pemasangan Companion HADIR-MOEIS (Windows)

Companion ialah program kecil yang berjalan pada **satu PC guru** (Windows,
Edge sistem terpasang) dan menghubungkan HADIR Admin ke enjin Playwright yang
mengisi MOEIS. Ia mendengar **hanya** pada `127.0.0.1` — tiada sambungan dari
luar PC ini boleh mencapainya.

## Keperluan

- Windows 10/11, PC mesti **hidup dan Windows telah log masuk**.
- Microsoft Edge (channel `msedge`) sudah terpasang.
- Node.js ≥ 20.
- Akaun MOEIS/idMe sekolah yang sah untuk log masuk manual sekali sahaja.

## Pasang

```powershell
cd companion
npm install          # hanya playwright-core, TIDAK memuat turun Chromium
node bin/hadir-companion.mjs serve
```

Skrin akan memaparkan:

```
Companion HADIR-MOEIS mendengar pada http://127.0.0.1:8747/ (loopback sahaja)
Buka tetapan tempatan: http://127.0.0.1:8747/?n=<nonce>
```

Nonce dalam URL hanya diterima untuk halaman `GET /` dan `GET /lokal.js`;
semua panggilan API tempatan (`/api/lokal/*`) memerlukan header
`X-HADIR-Lokal` yang halaman itu hantar sendiri, dan halaman memadam nonce
daripada sejarah pelayar sebaik sahaja dimuatkan.

Buka pautan **tetapan tempatan** itu pada pelayar PC yang sama. Di situ:

1. Tampal **rahsia enjin** (`HADIR_MOEIS_ENGINE_SECRET` daripada Script
   Properties projek KEHADIRAN). Rahsia disulit serta-merta dengan DPAPI
   (Scope CurrentUser) — hanya akaun Windows ini boleh menyahsulitnya semula.
   **HADIR Admin di pelayar tidak pernah melihat atau menerima rahsia ini.**
2. Tekan **Log masuk manual idMe** — tetingkap Edge terbuka, guru log masuk
   sendiri (companion tidak menaip apa-apa dan tidak mengklik kotak semak
   idMe). Sesi disimpan dalam profil Playwright berasingan PC itu.
   (Pilihan: lihat bahagian *Log masuk idMe automatik* di bawah untuk menyimpan
   kredensial dalam vault DPAPI tempatan dan mendayakan auto-login opt-in.)
3. Jana **kod pasangan** (sah 10 minit, sekali guna).

   Nota ketepatan: kod pasangan hidup **dalam memori proses companion sahaja**
   selama 10 minit dan sekali guna — ia tidak pernah ditulis ke cakera. Yang
   disulit DPAPI ialah **hash token klien** (dalam `rahsia.dat`), bukan kod
   pasangan dan bukan kata laluan idMe.

Kembali ke HADIR Admin → **Hantar ke MOEIS** → **Sambung PC** → masukkan kod.

Giliran penghantaran **MATI secara lalai**. Tekan **Mula giliran** di HADIR
Admin apabila sedia — biasanya selepas menyemak beberapa kelas menggunakan
**Uji log masuk (tanpa tulis)**.

## Sesi idMe dan pelancaran aplikasi MOEIS

Log masuk idMe sah **tidak mencukupi** dengan sendirinya: selagi aplikasi MOEIS
belum dibuka daripada portal idMe, sebarang lawatan terus ke
`moeispel.moe.gov.my` dilencongkan kembali ke dashboard idMe (bukan ke borang
log masuk). Companion menangani ini secara automatik:

- **Uji log masuk** — jika mendapati sesi idMe sah tetapi MOEIS belum dibuka,
  companion mengikut pautan aplikasi **Pengurusan Murid** pada halaman
  `idme.moe.gov.my/list_aplikasi` (pautan itu membawa token SSO sekali guna),
  kemudian menyemak semula. Hasil akhir melaporkan `dilancarkan: true`.
- **Enjin penghantaran** — jika navigasi ke halaman kehadiran dilencongkan ke
  idMe, langkah yang sama dicuba **sekali sahaja** sebelum berhenti dengan
  status *perlu campur tangan manusia*.

Ini **navigasi sahaja**: companion tidak menaip kata laluan, tidak menekan
kotak semak log masuk, dan tidak menghantar borang log masuk (disahkan oleh
ujian sumber dalam `tests/sesi.test.mjs`).

## Dua suis opt-in (autostart Windows + auto-mula giliran)

Companion ada DUA suis opt-in berasingan, kedua-duanya **lalai MATI**:

1. **Autostart Windows** — mendaftar/membuang entri Run key HKCU
   `HADIRMoeisCompanion` supaya `serve` bermula semasa logon Windows. Entri
   ditulis/dibuang terus ke registry melalui `reg.exe` (argv tetap, tiada
   shell). Togol UI tempatan memanggil `POST /api/lokal/autostart`; keadaan
   yang dilaporkan sentiasa dibaca **daripada registry sebenar (HKCU)**, bukan
   daripada flag tetapan. Subperintah CLI: `autostart-hidup` / `autostart-mati`.
2. **Auto-mula giliran** — selepas bind loopback berjaya, giliran dihidupkan
   automatik hanya jika semua pengawal di bawah lulus. Togol ini disimpan dalam
   `tetapan.json` (`autoMulaGiliran`), kekal MATI sehingga dihidupkan eksplisit
   di UI tempatan. Mematikan suis menghentikan giliran auto dan ia **tidak
   hidup semula** dalam proses yang sama. Pengawal ini **hanya** terpakai
   apabila giliran dimulakan oleh auto-mula; butang **Mula** manual di HADIR
   Admin mengekalkan kelakuan sedia ada (tiada penapis kalendar/kesegaran).

### Pengawal auto-mula (gagal tertutup)

Auto-mula dinilai **SEKALI**, selepas bind loopback `127.0.0.1` berjaya (bukan
semasa PC hidup/restart). Pengawal di bawah **hanya** terpakai kepada tugasan
yang diproses oleh giliran yang dimulakan oleh auto-mula; giliran yang dimulakan
manual dengan butang **Mula** tidak ditapis kalendar/kesegaran. Tugasan layak
diproses automatik hanya jika:

- berstatus `menunggu` ATAU `sedang_dihantar` (yatim selepas crash/restart)
  ATAU `tersimpan` (pengesahan selepas simpan tidak lengkap), untuk **TARIKH
  HARI INI** dalam zon `Asia/Kuala_Lumpur`;
- tarikh itu **ada dalam allowlist** tarikh sekolah tepat `kalendarSekolah`
  (allowlist kosong = gagal tertutup); **Sabtu/Ahad ditolak**;
- cap masa penciptaan (`diciptaEpochMs`) **sah dan bukan masa depan** (kewarasan
  cap masa dikekalkan).

Tiada lagi had umur 15 minit atau sempadan startup/aktivasi — tugasan hari ini
yang belum selesai **diteruskan selepas restart** walaupun dicipta sebelum enjin
bermula. `sedang_dihantar` TIDAK dihantar buta: klaim atomik + lease (backend)
memutuskan pemilikan (lease aktif tidak dirampas), dan verifikasi-baca-dahulu
memastikan padan => berjaya tanpa tulis, konflik => berhenti (perlu penyesuaian
manusia).

Tugasan `tersimpan` dipulihkan **baca-sahaja sahaja**: klaim dengan mod
`'verifikasi'` (status KEKAL `tersimpan` di backend) dan jalankan HANYA mod
`verifikasi` — **TIDAK PERNAH** mod `hantar`. Padan (`tidak-berubah`) =>
`berjaya` tanpa tulis MOEIS; `konflik`/`perlu-hantar` => `gagal` dengan mesej
tindakan manusia; kegagalan teknikal => lepaskan lease tanpa merekod hasil
(boleh dicuba semula selepas restart). `berjaya`/`gagal` kekal TIDAK diproses
automatik.

Kelayakan ini diperiksa semula **sebelum klaim dan tepat sebelum mutasi
MOEIS** — pertukaran tarikh/kalendar/togol semasa kerja tidak dicache.

### Amaran tamat kalendar + editor allowlist (UI tempatan)

Allowlist `kalendarSekolah` ialah senarai tarikh sekolah tepat (`YYYY-MM-DD`).
Amaran kalendar ialah **amaran awal** sahaja — ia **tidak mengubah** keputusan
pengawal auto-mula. Apabila allowlist kosong, sudah tamat, atau tarikh
terakhirnya dalam **7 hari**, banner **merah** muncul di bahagian atas halaman
tetapan tempatan bersama ayat Melayu yang menyatakan kes tepat (tarikh terakhir
+ berapa hari tinggal). Apabila selamat, banner hijau memaparkan tarikh tamat
dan hari tinggal.

**Cara pemilik menambah/membuang tarikh sekolah (tanpa menyentuh fail atau
meminta agen):**

1. Pada PC guru sendiri, buka pautan **tetapan tempatan** (loopback + nonce).
2. Di bahagian **Automasi tempatan**, taip satu tarikh tepat (`YYYY-MM-DD`,
   cth `2026-12-05`) dan tekan **Tambah** — tarikh muncul dalam senarai.
3. Untuk membuang, tekan **Buang** di sebelah tarikh itu.
4. Tekan **Simpan kalendar** untuk menghantar senarai penuh ke
   `POST /api/lokal/tetapan` (header nonce sahaja — hanya PC ini boleh
   mengubahnya). Jika mana-mana tarikh bukan tarikh tepat, server menolak
   seluruh senarai dan memaparkan mesejnya **verbatim**; tiada tarikh yang
   hilang senyap — senarai yang disimpan ialah tepat apa yang dipaparkan.

**Maksud amaran:** apabila banner merah muncul, auto-mula akan **gagal
tertutup** (tidak memproses apa-apa) pada hari yang tidak lagi dilindungi
allowlist. Tambah tarikh baharu dan tekan **Simpan kalendar** sebelum hari itu
untuk mengekalkan auto-mula berjalan.

### Pemulihan giliran auto (bounded, tidak melonggarkan pengawal)

Jika auto-mula startup gagal (cth sesi idMe tidak sah semasa bind loopback)
tetapi suis `autoMulaGiliran` masih ON, companion memasang gelung pemulihan
(`pasangPemulihanAutoMula`, `src/orchestrasi-auto.mjs`) — lalai setiap 5
minit, unref (tidak menahan proses daripada keluar). Setiap kitaran:

- Berhenti serta-merta jika suis `autoMulaGiliran` dimatikan, ATAU jika
  giliran sudah aktif (cth admin menekan **Mula** secara manual).
- Jika tidak, cuba log masuk automatik job-time (`cubaLoginAutoKerja` —
  cache-sahaja, terikat had 2 cubaan sedia ada; no-op jika sesi cache sudah
  sah), kemudian panggil semula `cubaAutoMula` PENUH — menilai semula SEMUA
  pengawal (kalendar, hujung minggu, sempadan aktivasi opt-in) daripada awal.
  Tiada pengawal dilonggarkan untuk laluan pemulihan ini.
- Berhenti sebaik giliran bermula.

`sesiDisahkan` yang disuntik ke `cubaAutoMula` dalam gelung ini ialah
`sesiKerjaDisahkan` (cache-sahaja) — BUKAN semakan startup yang boleh
melancarkan pelayar sendiri — supaya gelung pemulihan tidak menjadi laluan
kedua yang membuka Edge tanpa sebab.

### Tiada cubaan semula automatik

- Tiada cubaan semula automatik untuk `gagal`, `tersimpan` atau `berjaya`.
- Satu tugasan hanya dicuba **sekali secara automatik** sepanjang hayat proses;
  cubaan semula memerlukan tindakan manual admin.

### Pemulihan tugasan tersekat (`sedang_dihantar` oleh enjin mati/restart)

Apabila proses companion mati atau dimulakan semula di tengah-tengah kerja,
tugasan itu boleh tertinggal berstatus `sedang_dihantar`. Pemulihan berlaku
pada **poll manual** (butang **Mula** / **Jalankan sekarang**) DAN pada
**auto-mula** (polisi baharu — auto-mula turut memulihkan yatim `sedang_dihantar`
hari ini). Kedua-duanya TIDAK hantar buta: klaim atomik + lease memutuskan
pemilikan, dan verifikasi-baca-dahulu membaca keadaan MOEIS sebenar dahulu
(padan => berjaya tanpa tulis, konflik => berhenti untuk manusia):

- **ID enjin stabil.** `pemilik` klaim bukan lagi `hostname:pid`; ia ialah UUID
  rawak tempatan yang disimpan di `<dirData>/id-enjin.json`. Apabila companion
  dimulakan semula, ID **sama** dikemukakan, jadi ia menuntut semula tugasan
  `sedang_dihantar` yang ditinggalkan proses sebelumnya **serta-merta** (klaim
  pemilik sama) tanpa menunggu lease 15 minit.
- **Poll mempertimbangkan `sedang_dihantar`.** Giliran (manual dan auto) kini
  cuba klaim tugasan `menunggu` DAN `sedang_dihantar`; backend (Apps Script)
  memutuskan secara atomik sama ada klaim dibenarkan — pemilik sama, lease
  luput, atau tugasan yatim tanpa pemilik/lease. Klaim tidak dibenarkan pulang
  `null` dan tugasan itu dilangkau tanpa kesan (tugasan yang masih dipegang
  enjin hidup tidak pernah dirampas).
- `id-enjin.json` bukan rahsia dan tidak mengandungi sebarang data murid; ia
  hanyalah pengecam mesin tempatan.

### Log masuk idMe automatik (opt-in, lalai MATI)

Companion kini mempunyai **vault kredensial idMe tempatan sendiri** dan log
masuk automatik **opt-in** (suis `loginAuto`, lalai MATI, berasingan daripada
`autoMulaGiliran`). Tanpa `loginAuto`, tiada apa-apa berubah — log masuk kekal
manual (guru log masuk sendiri pada tetingkap Edge).

**Cara pemilik memasukkan kredensial dengan selamat:**

1. Pada PC guru sendiri, buka pautan **tetapan tempatan** (loopback+nonce).
2. Di bahagian **Kredensial idMe**, isi **Pengguna idMe**, **Kata laluan idMe**
   (medan bertitik `type=password`), dan **frasa "Kata Kunci Keselamatan" idMe
   yang dijangka** — frasa tepat yang dipaparkan semasa log masuk (anti-pancing).
3. Tekan **Simpan kredensial**. Nilai disulit serta-merta dengan DPAPI
   (CurrentUser) ke `kredensial.dat`; medan dibersihkan sejurus simpan dan
   nilai **tidak pernah dipaparkan semula**. Status hanya memaparkan boolean
   + pengguna tersamar (cth `a***`).
4. (Pilihan) Hidupkan suis **Log masuk idMe automatik** untuk membolehkan
   auto-login; biarkan MATI untuk log masuk manual. Suis ini juga membolehkan
   enjin mencuba semula log masuk automatik **semasa giliran berjalan** (lihat
   *Bila enjin akan dan tidak akan log masuk automatik* di bawah).

**Cara memadam kredensial:** tekan **Padam kredensial** pada bahagian yang sama,
atau padam fail `kredensial.dat` dalam folder data (`node bin/hadir-companion.mjs status`
memaparkan laluan folder data). Tiada salinan di mana-mana: tiada dalam Git,
artifak bina, log, env var atau baris arahan.

**Aliran DUA PERINGKAT idMe (diperbetulkan 21 Sept 2026):** idMe memaparkan
medan IC pada halaman log masuk; frasa "Kata Kunci Keselamatan" hanya muncul
**selepas** IC dihantar, pada halaman pengesahan (`/loginverification`),
bersama kotak semak "Ya, ini adalah Kata Kunci Keselamatan saya." yang tidak
ditanda — medan kata laluan tersembunyi sehingga kotak itu ditanda. Companion
mengikut urutan: isi IC → lanjut ke halaman pengesahan → **baca frasa di
situ** → jika padan, tandakan kotak semak → isi kata laluan → hantar.

**Had & pengawal (gagal tertutup):**

- Log masuk automatik menaip **kata laluan** hanya selepas frasa "Kata Kunci
  Keselamatan" (dibaca pada halaman pengesahan, BUKAN halaman IC) **padan**
  dengan yang disimpan DAN kotak semak ditanda. Keputusan frasa membezakan
  DUA kegagalan jujur, bukan satu: **tidak padan** (dibaca tetapi berbeza —
  kemungkinan pancingan sebenar, status `kunci-tidak-padan`) berbeza daripada
  **tidak dapat dibaca** (frasa kosong/tiada sebagai teks, kemungkinan
  dipaparkan sebagai imej, status `kunci-tiada`) — kedua-duanya ABORT dengan
  `perluManusia:true`, TIADA kotak semak ditanda, TIADA kata laluan ditaip,
  tetapi mesejnya tidak disamakan supaya pemilik tahu punca sebenar. IC ditaip
  lebih awal (sebelum frasa dibaca) kerana idMe memerlukannya untuk memaparkan
  frasa — ini bukan pelemahan anti-pancing (frasa tetap satu-satunya pengawal
  yang membenarkan kata laluan ditaip). CAPTCHA/OTP/2FA **tidak pernah
  dipintas** (berhenti `perluManusia:true`); maks **2 cubaan automatik per
  proses** dengan backoff (perlindungan kunci akaun) — selepas itu manusia.
- Aliran automatik **belum disahkan terhadap idMe hidup**; selektor DOM
  peringkat pengesahan (butang lanjut/seterusnya, label kotak semak, dan sama
  ada frasa sebenarnya dipaparkan sebagai imej) kekal **andaian belum
  terbukti**. Pengesahan hidup dilakukan kemudian dengan kehadiran pemilik.
- DPAPI `CurrentUser` bermakna hanya akaun Windows yang sama boleh nyahsulit;
  DPAPI tidak melindungi daripada proses lain yang berjalan sebagai pengguna
  yang sama (lihat model ancaman dalam `BLUEPRINT.md`).

### Suis `benarkanTerusTanpaFrasa` (opt-in berasingan, lalai MATI)

Lalai tingkah laku di atas: apabila frasa "Kata Kunci Keselamatan" **tidak
dapat dibaca sebagai teks** (kemungkinan dipaparkan sebagai imej), companion
**berhenti** (`kunci-tiada`, `perluManusia:true`) — ini kekal selagi suis
`benarkanTerusTanpaFrasa` MATI (lalai).

Pemilik boleh menghidupkan suis **berasingan** ini di UI tempatan (bahagian
**Automasi tempatan**, kotak semak sendiri dengan amaran) untuk membenarkan
log masuk automatik **meneruskan** apabila frasa tidak dapat dibaca —
companion menandakan kotak semak pengesahan dan menaip kata laluan seperti
biasa, kemudian melaporkan status baharu `kunci-tiada-dibenarkan` jika sesi
berjaya disahkan.

**Risiko yang mesti difahami sebelum menghidupkan suis ini:**

- Semakan frasa **dilangkau sepenuhnya** dalam keadaan ini. Perlindungan
  anti-pancing kemudian bergantung **hanya** pada dua perkara: (1) semakan
  HTTPS + hos idMe yang ketat (`idme.moe.gov.my` tepat, sudah disemak lebih
  awal dalam aliran sebelum apa-apa ditaip), dan (2) kotak semak pengesahan
  "Ya, ini adalah Kata Kunci Keselamatan saya." ditanda secara automatik.
- Frasa yang dipaparkan sebagai imej **tidak pernah** di-OCR atau diteka oleh
  companion — tiada percubaan membaca kandungan imej itu langsung. Suis ini
  hanya mengubah **keputusan** apabila frasa tidak dapat dibaca, bukan cara
  frasa dibaca.
- Frasa yang **dibaca tetapi tidak padan** (kemungkinan halaman pancingan
  sebenar, status `kunci-tidak-padan`) kekal ABORT **tanpa mengira suis ini**
  — suis ini hanya melonggarkan kes "tidak dapat dibaca", bukan kes "tidak
  padan".
- Suis ini boleh dimatikan semula bila-bila masa di UI tempatan yang sama;
  mematikannya mengembalikan tingkah laku lalai (`kunci-tiada`, ABORT) dengan
  serta-merta pada percubaan log masuk automatik berikutnya.
- Seperti `loginAuto`, suis ini **local-only** — hanya boleh diubah daripada
  PC companion sendiri (UI tempatan bernonce); klien jauh (`POST
  /api/tetapan`) ditolak jika cuba menetapkannya.

### Pembetulan langkah hantar: dua butang "Daftar Masuk" pada idMe sebenar

Halaman pengesahan idMe membawa **DUA** butang berlabel "Daftar Masuk": satu
placeholder `disabled`/tersembunyi (`#log_disbale_form`, sentiasa hadir lebih
awal dalam struktur halaman) dan satu butang **sebenar aktif+kelihatan**.
Mengklik butang pertama yang dijumpai tanpa semakan boleh tersilap memilih
placeholder dan gagal senyap/tergantung.

Companion kini mengimbas **bersempadan** (~8 saat, tinjau setiap ~250ms) dan
mengklik **hanya** calon yang kelihatan **dan** aktif. Jika tiada butang
sedemikian dijumpai dalam tempoh itu, companion **berhenti dengan sebab jelas**
(cth borang belum lengkap, kotak semak pengesahan belum ditanda, atau kata
laluan tidak diterima) — ia **tidak pernah** tergantung atau melaporkan ralat
teknikal mentah yang mengelirukan.

**Bundle diagnostik tempatan pada kegagalan log masuk.** Apabila log masuk
automatik gagal atas sebarang sebab, companion menulis satu bundle ke
`log/diagnostik-login-<masa>/` dalam folder data (folder yang sama seperti
`companion.log`, ACL dihadkan kepada akaun Windows semasa):

- `dom-sanitasi.html` — struktur halaman pada masa kegagalan, dengan nilai
  **setiap** medan input/textarea dibuang, medan hidden/CSRF/token dibuang
  sepenuhnya, dan frasa keselamatan yang dipaparkan digantikan dengan
  `[FRASA-DISAMARKAN]` (struktur tag/kelas dikekalkan untuk diagnostik reka
  bentuk halaman).
- `skrin.png` — tangkapan skrin **viewport** (bukan skrin penuh) pada masa
  kegagalan.
- `sebab.txt` — sebab kegagalan dalam Bahasa Melayu, turut melalui penapis
  log sedia ada.

Bundle ini **tidak pernah dimuat naik, dilampirkan atau dihantar ke mana-mana
model AI atau perkhidmatan luar** — ia kekal semata-mata pada cakera PC
companion untuk pemeriksaan manual oleh pemilik. Ini penting kerana penapis
log sedia ada (`src/log.mjs`) **tidak** memask kata laluan — membuang nilai
medan input pada peringkat sanitasi DOM ialah pertahanan yang disengajakan.

### Ketahanan terhadap halaman lambat / separa dimuatkan

Log masuk automatik pernah gagal pada halaman idMe yang **lambat atau separa
dimuatkan**: langkah mengisi IC / kata laluan / menekan butang menggunakan
`.first().fill()/.click()` yang, apabila elemen belum dirender, melontar
*Timeout* Playwright mentah (30s) yang bocor ke log sebagai "ralat teknikal".

Kini adapter **menunggu** setiap elemen log masuk menjadi **sedia** (hadir +
kelihatan + aktif) secara **bersempadan** (lalai ~15s, tinjau setiap ~250ms)
sebelum berinteraksi:

- **Medan IC** (`isiPenggunaIdMe`) — tunggu medan KAD PENGENALAN sedia sebelum
  mengisi; jika tidak muncul, pulangkan status `medan-ic-tiada` (bukan throw).
- **Butang lanjut** (`lanjutkanPengesahan`) — tunggu butang Seterusnya sedia
  sebelum mengklik (bukan `.first()` membuta).
- **Frasa keselamatan** (`bacaKunciKeselamatan`) — tinjau DOM sehingga frasa
  muncul (bukan sekali baca yang boleh pulang `null` sebelum render selesai).
- **Kotak semak** (`tandakanKunciKeselamatan`) — tinjau sehingga kotak semak
  muncul sebelum menanda.
- **Medan kata laluan** (`isiKataLaluanIdMe`) — tunggu medan sedia sebelum
  mengisi; jika tidak muncul, pulangkan status `medan-kata-laluan-tiada`.

Setiap kegagalan pulang **sebab jelas dalam Bahasa Melayu** (bukan *Timeout*
mentah) dan aliran berhenti dengan `perluManusia:true` — tiada kata laluan
ditaip, tiada hantar — mengekalkan semua invarian keselamatan (anti-pancing,
CAPTCHA/OTP, had 2 cubaan).

### Bila enjin akan (dan TIDAK akan) log masuk automatik

Sebelum ini, enjin hanya cuba log masuk automatik **sekali semasa startup**. Jika
sesi idMe tamat kemudian (enjin masih berjalan), tugasan beratur gagal dengan
"sesi tamat" dan guru perlu log masuk manual. Sekarang, apabila `loginAuto`
HIDUP dan kredensial wujud, enjin juga cuba log masuk automatik pada masa-masa
ini:

- **Pada permulaan setiap kitaran giliran** (sebelum mengambil/memproses
  tugasan) — jika sesi idMe tidak sah menurut cache tempatan.
- **Apabila tugasan melaporkan "sesi tamat"** semasa verifikasi ATAU hantar —
  enjin cuba log masuk automatik **secara PAKSA** (cache sesi yang lapuk tidak
  boleh menyekatnya) sekali, kemudian mencuba tugasan itu sekali lagi. Jika
  log masuk itu **berjaya**, tugasan disambung semula; jika log masuk itu
  **memerlukan manusia atau gagal** (CAPTCHA/OTP/frasa tidak padan/had
  cubaan), tugasan **TIDAK dicuba semula secara senyap** — ia gagal dengan
  sebab jelas kepada guru.

Enjin **TIDAK** log masuk automatik apabila:

- Suis `loginAuto` **MATI** (lalai).
- Kredensial idMe **belum disimpan** pada PC itu.
- Sesi idMe **sudah sah** (tiada keperluan).
- CAPTCHA/OTP/2FA dikesan (sentiasa `perlu manusia`, tiada cubaan semula).
- Frasa "Kata Kunci Keselamatan" pada halaman idMe **tidak padan** (anti-pancing).
- **Had 2 cubaan** automatik per proses **sudah dicapai**
  (lihat bahagian *Had 2 cubaan (per proses)* di bawah).

### Isyarat "sesi tamat" dan segaran cache sesi

Apabila tugasan melaporkan "sesi tamat", enjin melakukan log masuk automatik
**PAKSA** yang memintas cache sesi (cache lapuk tidak boleh menyekatnya),
tetapi masih menghormati semua pengawal lain (suis `loginAuto`, kredensial,
had 2 cubaan dikongsi, HTTPS+hos ketat, kotak semak, CAPTCHA/OTP, frasa).
Jika log masuk paksa berjaya, cache sesi dikemas kini dan tugasan dicuba
semula; jika ia memerlukan manusia/gagal, tugasan gagal dengan sebab jelas
dan **TIDAK** dicuba semula secara senyap.

Keputusan sesi masa-kitaran menggunakan cache tempatan supaya enjin tidak
membuka Edge pada setiap poll. Supaya cache itu tidak kekal lapuk, enjin
menyegarkannya melalui siasatan **uji-login baca-sahaja** (tiada kredensial
ditaip) paling banyak **sekali setiap 10 minit** dan hanya semasa giliran
aktif. Selang 10 minit dipilih kerana ia padan dengan kadar luput sesi idMe
yang diperhatikan (~10 minit).

**Penjaga sesi (keep-alive bersempadan) — OPT-IN, lalai MATI.** Sesi
idMe/MOEIS diperhatikan luput selepas kira-kira **15-20 minit** tidak aktif.
**Penting — kepastian jujur:** "15-20 minit" ialah **pemerhatian pemilik,
BUKAN masa tamat tetap yang diukur**; idMe/MOEIS tidak mendokumenkan had itu
secara rasmi, dan ia mungkin berbeza mengikut sesi. Penjaga ini MENYENTUH sesi
MOEIS secara berkala melalui siasatan baca-sahaja yang sama setiap **5 minit**
(`JEDA_JAGA_SESI_MS`) supaya sesi tidak mati di tengah baris tugasan yang
panjang — tetapi **keberkesanannya BELUM disahkan terhadap idMe hidup**: sama
ada poke baca-sahaja benar-benar menghalang luput belum dibuktikan sehingga
ujian hidup dilakukan dengan kehadiran pemilik.

Penjaga ini **DIKUNCI di sebalik suis `jagaSesi`** (lalai MATI, local-only,
berasingan daripada `loginAuto`): ia tidak menyentuh apa-apa sehingga pemilik
menghidupkannya dalam tetapan tempatan. Apabila ON, ia hanya bertindak semasa
giliran aktif, dilangkau semasa satu tugasan sedang diproses (profil Edge
digunakan), tidak bertindih dengan kitaran lain, dan selangnya mempunyai lantai
keras 1 minit. Ia dimulakan selepas companion mendengar pada loopback; suis
`jagaSesi` MATI bermakna tiada poke langsung. Kegagalan siasatan tidak
menghalang kitaran seterusnya. Klasifikasi kesihatan **jujur**: poke hanya
dilaporkan sihat apabila hasil ialah `sesi-sah`; `sesi-tamat`/`perlu-manusia`/
`langkau`/`ralat` semuanya TIDAK sihat — penjaga tidak mengaku berjaya hanya
kerana siasatan selesai. Keadaan penjaga (cubaan, langkau, hasil terakhir,
sihat/tidak sihat, `didayakan`) boleh dilihat dalam `/api/status` dan
`/api/lokal/status` (medan `jagaSesi`), serta dipaparkan di bawah suis dalam UI
tetapan tempatan.

**Kunci eksklusif pelayar.** Satu profil Edge dikongsi oleh SEMUA operasi
pelayar companion (uji-login, log-masuk-manual, login-auto, dan tugasan
push.mjs). Kunci proses-tunggal (`src/kunci-pelayar.mjs`) diperoleh secara
atomik sebelum mana-mana pelancaran anak, supaya dua operasi tidak pernah
bertembung pada kunci profil Playwright. Siasatan/log masuk yang mendapati
profil digunakan dilangkau dengan mesej jelas; tugasan yang berlanggar
dilangkau (`langkau`) dan cuba semula pada kitaran seterusnya — **tiada
paksa-bunuh pelayar aktif**.

**Apa yang pemilik lihat apabila ini berlaku:** baris
`LOGIN_AUTO: dipaksa: Isyarat sesi-tamat hidup...` dalam `companion.log`;
tugasan berakhir `gagal` dengan mesej seperti "Sesi idMe tamat dan log masuk
automatik memerlukan manusia: CAPTCHA dikesan. Tiada cubaan semula
automatik." Tiada data ditulis ke MOEIS dalam keadaan itu.

### Had cubaan log masuk automatik dan apa perlu buat apabila enjin berhenti untuk manusia

Ada **DUA rejim had**, dipilih oleh suis opt-in `hadKadarLogin` (lalai MATI)
dalam tetapan tempatan:

**MATI (lalai) — had ASAL 2 cubaan per proses.** Had ialah 2 cubaan automatik
per proses, **dikongsi** antara cubaan startup dan semua cubaan semasa tugasan
— bukan 2 setiap tugasan. Kaunter berada dalam ingatan proses dan ditetapkan
semula pada setiap restart. Selepas 2 cubaan gagal (cth OTP diperlukan, frasa
tidak padan, atau sesi masih tidak sah), enjin **berhenti mencuba** sehingga
salah satu daripada ini berlaku: log masuk manual sekali, atau proses
companion dimulakan semula.

**HIDUP (opt-in, kelulusan pemilik eksplisit 2026-09-21) — had kadar
BERTERUSAN.** Menggantikan had 2/proses dengan siling kadar PERSISTEN
merentas restart DAN merentas hari (`src/moeis/had-login.mjs`,
`buatHadKadarLogin`), disimpan dalam fail bukan rahsia `had-login.json` (cap
masa + pembilang sahaja, tiada kredensial):

- maksimum **6 cubaan** dalam tetingkap **sejam gelongsor**;
- siling **HARIAN 24 cubaan**, **TIDAK dikosongkan oleh kejayaan** — hanya
  **hari baharu kalendar MALAYSIA (UTC+8)** atau log masuk manual yang berjaya
  mengosongkannya;
- **berhenti serta-merta** (tiada cubaan semula) selepas **3 kegagalan
  berturut-turut**; hanya log masuk manual yang berjaya memulihkannya;
- gagal tertutup dikekalkan: fail keadaan rosak/tidak boleh dibaca ATAU jam
  sistem digulung ke belakang merentas sempadan hari = **BLOK**, bukan reset.
  Fail rosak **benar-benar** memblok: pembaca `bacaJsonKetat` memulangkan
  `null` HANYA apabila fail tiada dan MELONTAR apabila fail rosak (pembaca
  `bacaJson` yang menelan ralat tidak boleh digunakan di sini — ia menjadikan
  jaminan ini palsu).

**Cara memulihkan selepas enjin diblok (3 kegagalan berturut atau fail rosak):**
log masuk idMe **secara manual** sekali — sama ada melalui butang
**"Buka Edge untuk log masuk"** dalam tetapan tempatan, atau perintah
`node bin/hadir-companion.mjs log-masuk-manual`. Log masuk manual yang berjaya
**mengosongkan** pembilang (KEDUA-DUA laluan melakukan ini). Jika anda hanya
memadam `had-login.json` secara manual, itu juga berkesan tetapi tidak
diperlukan.

**Nota menukar suis (diketahui, bukan pepijat):** mematikan suis
`hadKadarLogin` TIDAK memindahkan keadaan had antara mod — mod MATI mempunyai
kaunter 2-cubaan/proses yang berasingan dan bermula dari sifar. Menukar suis
ialah tindakan pemilik (tempatan sahaja), jadi ia dianggap penarikan balik
perlindungan yang disengajakan, bukan jalan pintas. Biarkan suis HIDUP supaya
had berterusan benar-benar terpakai.

Suis ini boleh dimatikan semula bila-bila masa tanpa kehilangan had ASAL
2/proses (kedua-dua rejim sedia dalam kod; suis hanya menentukan mana yang
aktif). OTP/CAPTCHA/2FA kekal berhenti untuk manusia dalam KEDUA-DUA rejim,
tidak pernah dipintas; pengawal HTTPS + hos idMe kekal sebelum menaip apa-apa.
**Nota kejujuran:** had kadar berterusan mengurangkan kekerapan companion
berhenti untuk manusia semasa hari sekolah, tetapi ia **tidak menjamin** sesi
idMe akan berjaya dipulihkan — OTP/CAPTCHA/frasa tidak padan masih memerlukan
campur tangan manusia setiap kali, dan siling harian/kegagalan berturut-turut
tetap boleh menghentikan pemulihan automatik pada hari yang teruk.

Baris status di bawah suis `loginAuto` dalam tetapan tempatan memaparkan keadaan
semasa (cth "Diminta tetapi sesi idMe sudah sah", "Kredensial idMe tiada",
"Berjaya", "Had 2 cubaan log masuk automatik per proses dicapai", "Perlu
manusia: OTP"); baris berasingan di bawah suis `hadKadarLogin` memaparkan
"hari ini X/24, tetingkap sejam Y/6, kegagalan berturut Z/3" apabila rejim
berterusan HIDUP. Setiap keputusan (dilangkau atau dicuba) juga ditulis ke
`companion.log` (tag `LOGIN_AUTO`), tanpa sebarang nilai kredensial.

**Apabila enjin berhenti untuk manusia:** pada PC itu, tekan **Buka Edge untuk
log masuk**, log masuk idMe sendiri, kemudian tekan **Uji log masuk** sehingga
status menunjukkan sesi sah. Selepas itu giliran boleh disambung semula seperti
biasa. Untuk membenarkan cubaan automatik semula, sama ada mulakan semula
companion, atau log masuk manual berjaya.

### Aliran pengguna (autostart + auto-mula)

PC logon (autostart ON) → `serve` bind 127.0.0.1 → auto-mula dinilai → giliran
bermula jika semua pengawal lulus → guru tekan **Hantar** di telefon → tugasan
fresh `menunggu` dicipta → tugasan itu diambil oleh giliran auto.

### Keperluan deploy backend (medan `diciptaEpochMs`)

Pengawal kesegaran membaca `diciptaEpochMs` daripada `hadirMoeisJobSenarai_`
(`apps-script/HadirWeb.gs`). **Tanpa deploy semula** backend, medan ini tiada →
auto-mula menolak semua tugasan (gagal tertutup, selamat). Deploy **New
version** pada deployment sedia ada (lihat `apps-script/README.md`).

## Bina artifak mudah alih

```powershell
node bin/hadir-companion.mjs bina-artifak
```

Menghasilkan `dist/hadir-moeis-companion-<versi>.zip` yang mengandungi kod
sumber, dokumentasi, skrip pemasangan, `BACA-DULU.txt`, DAN `playwright-core`
yang di-**vendor** (jika ditemui pada mesin yang membina, atau dipasang melalui
npm semasa membina). Salin zip itu ke PC guru, buka, dan klik dua kali
`install\Jalankan-Companion.cmd` — **tiada npm atau muat turun diperlukan**
apabila `playwright-core` di-vendor. Guna `-TanpaVendor` untuk menghasilkan zip
tanpa pergantungan (PC guru perlu `npm install --omit=dev` sekali).

Artifak ini tidak mengandungi `tetapan.json`, `rahsia.dat`, `kredensial.dat`,
profil pelayar, log atau data tempatan — komputer itu membina keadaannya
sendiri pada penggunaan pertama.

## Had keupayaan yang diuji (kejujuran)

Ini **bukan** senarai lengkap ciri — ini senarai apa yang **belum** disahkan
kerana larangan keras brief pelaksanaan menegah pelayar sebenar menyentuh
MOEIS/idMe semasa pembangunan:

- **Tidak diuji terhadap MOEIS/idMe hidup.** Semua ujian automatik
  (`node --test companion/tests/`) menggunakan double halaman (`HalamanPalsu`)
  — DOM mini dalam ingatan — bukan pelayar sebenar. Selektor dalam
  `src/moeis/adaptorPlaywright.mjs` diwarisi daripada prototaip `moeis-bot`
  yang pernah berjaya, tetapi gabungan penuh (buka tab → tarikh → pilih →
  isi → simpan → sahkan) pada halaman MOEIS sebenar **belum disahkan** oleh
  kerja ini.
- **`/api/uji-login` hanya mengesahkan hos + kunci keselamatan anti-phishing +
  keadaan sesi** — ia tidak pernah mengisi atau membaca kata laluan, dan tidak
  cuba menyelesaikan CAPTCHA/OTP sebenar (kes itu dilaporkan `perlu-manusia`).
  Ia **sudah diimplementasi** (`src/moeis/sesi.mjs`, `bin/uji-login.mjs`) dan
  diuji terhadap double halaman (URL idMe palsu, kunci keselamatan palsu,
  CAPTCHA palsu) — termasuk ujian yang mengesahkan kod itu **tidak pernah**
  mengklik simpan/kemaskini atau mengisi kata laluan. Ia **belum pernah**
  dijalankan terhadap MOEIS/idMe hidup.
- **`/api/lokal/log-masuk-manual`, `adaSesiMoeis` dan `statusSesiMoeis` sudah
  diimplementasi** (`bin/log-masuk-manual.mjs`, `src/moeis/pelayar.mjs`).
  Menguji sama ada sesi wujud memerlukan pelancaran Edge sebenar pada PC itu;
  itulah sebabnya `/api/status` melaporkan `sesiAda` dan `/api/mula` menolak
  dengan 409 apabila sesi tiada. Langkah ini belum pernah dijalankan terhadap
  idMe hidup, jadi anggap "sesi disahkan" sebagai belum terbukti sehingga guru
  menjalankan **Uji log masuk (tanpa tulis)** sekali pada PC sebenar.
- **Chrome/Edge boleh memaparkan gesaan kebenaran "akses rangkaian tempatan"**
  sekali sahaja apabila HADIR Admin (https) mula-mula bercakap dengan
  `127.0.0.1`. Ini normal (ciri Local Network Access pelayar) — bukan amaran
  keselamatan companion.
- **Heartbeat lease semasa kerja panjang** (`giliran.mjs`, setiap 5 minit)
  cuba memperbaharui klaim tetapi ia **tidak menghentikan** proses anak
  `jalan-push.mjs` yang sudah berjalan jika pembaharuan gagal — proses
  berasingan tidak menerima isyarat henti pertengahan. Ini had reka bentuk,
  bukan pepijat; lease yang luput hanya membenarkan runner **lain**
  mengambil alih selepas proses lama benar-benar mati.
- **Autostart tidak diaktifkan secara lalai** dan PC mesti hidup + Windows
  log masuk — companion bukan perkhidmatan Windows.
- Jangan sekali-kali anggap satu tugasan `disahkan` bermakna semua murid
  benar-benar disemak oleh manusia — ia bermakna borang MOEIS mengesahkan
  padanan selepas muat semula, bukan pengesahan pedagogi/pentadbiran.

## Ujian yang sudah dijalankan (dan apa maksudnya)

```powershell
# Ujian unit + integrasi (double halaman/storan/klien, tiada pelayar/rangkaian)
cd companion && npm test          # atau: node --test tests/

# Ujian asap E2E tempatan: pelayan loopback SEBENAR + storan DPAPI SEBENAR,
# masih tiada pelayar dan tiada MOEIS. Memerlukan Node dan Windows.
node tests/asap-e2e.mjs
```

Ujian asap E2E itu memeriksa: empangan nonce UI tempatan, penolakan Origin/Host
(termasuk anti DNS-rebinding), preflight CORS tanpa wildcard, pasangan kod
sekali guna, penolakan medan rahsia pada `/api/tetapan`, giliran MATI secara
lalai, `/api/mula` gagal tertutup, laporan `adaRahsiaEnjin`/`klaimDisokong`
yang jujur, dan sekatan kadar auth berasingan. Ia menemui satu pepijat sebenar yang tidak
dapat dilihat oleh ujian unit: PowerShell 5.1 tidak memuatkan `System.Security`
secara automatik, jadi storan DPAPI gagal sebelum baris `Add-Type` ditambah.

Angka tepat pada 18 September 2026 (selepas pusingan pembetulan semakan bebas):
suite unit/integrasi companion **102 ujian — 101 lulus, 1 dilangkau** (ujian
DPAPI nyata dilangkau pada bukan Windows), ujian asap E2E **43/43 lulus**, dan
suite HADIR (`node tests/hadir.test.cjs`) lulus sepenuhnya. Angka-angka ini
disemak semula selepas setiap pusingan pembetulan.

Had penyahpekaan log yang diakui (jangan dakwa lebih): penapis lapisan log
(`src/log.mjs`) memask IC/MyKid, emel dan rentetan seperti token **sebelum**
apa-apa ditulis ke cakera, termasuk stdout/stderr mentah proses anak. Nama
murid TIDAK disamarkan sepenuhnya — enjin menyamarkan nama dalam mesej keputusan
(inisial + panjang, cth `A***11`), dan log kerja boleh mengandungi nama penuh
jika halaman MOEIS mencetaknya. Dalam kelas yang kecil, samaran inisial+panjang
masih boleh mengenal pasti murid. Itulah sebabnya folder data dihadkan ACL
kepada akaun Windows semasa, dan log tidak pernah dihantar ke rangkaian.

Storan DPAPI (`src/simpanan.mjs`): skrip PowerShell dihantar melalui STDIN
(`-Command -`) dan muatan rahsia melalui pemboleh ubah persekitaran proses anak
(`HADIR_PS_DATA`) — **bukan** melalui baris arahan, kerana baris arahan proses
boleh dibaca proses lain pengguna yang sama. `rahsia.dat` menyimpan RAHSIA
ENJIN dan HASH TOKEN klien; `kredensial.dat` menyimpan kredensial idMe
(pengguna + kata laluan + frasa anti-pancing) yang disulit DPAPI — kod pasangan
tidak pernah ditulis ke cakera, dan nilai kredensial **tidak pernah** melalui
env var, baris arahan, log, atau respons API (status hanya boolean + pengguna
tersamar).

Pepijat lain yang ditemui dan dibetulkan oleh ujian asap yang sama: halaman
tetapan tempatan tidak boleh menerima nonce melalui `<script src="/lokal.js">`
(pelayar tidak boleh menetapkan header pada tag skrip), jadi halaman itu
sebelum ini tidak dapat memuatkan JavaScript-nya langsung.

Pepijat ketiga ditemui oleh ujian DPAPI nyata selepas pembetulan pusingan 2:
`powershell -Command -` melaksanakan input STDIN **baris demi baris**, jadi
skrip berbilang baris (panggilan `Protect(` yang dipisah dua baris) gagal
SECARA SENYAP dengan status 0 dan keluaran kosong. Skrip kini satu baris, dan
keluaran kosong dianggap kegagalan (fail tertutup).

**Yang masih TIDAK boleh diklaim:** tiada langkah di atas menyentuh MOEIS atau
idMe sebenar, dan tiada kata laluan pernah ditaip oleh kod terhadap idMe hidup
(penaipan automatik hanya berlaku dalam aliran opt-in `loginAuto` yang **belum
disahkan hidup**). Kesesuaian selektor halaman MOEIS
(`src/moeis/adaptorPlaywright.mjs`) diwarisi daripada prototaip `moeis-bot`
yang pernah berjaya, bukan hasil pengesahan baharu.

## Hasil semakan bebas (model keluarga berbeza)

Kod ini disemak oleh pusingan semakan bebas (DeepSeek, bukan model yang
menulis kod) terhadap salinan baca sahaja repo + diff. Keputusan: **LULUS
BERSYARAT, 9 penemuan**, semuanya dibetulkan dalam kod ini:

| # | Tahap | Penemuan | Pembetulan |
|---|---|---|---|
| 1 | TINGGI | `log-masuk-manual.mjs` menulis cookie sesi idMe ke `sesi.json` teks biasa | Penulisan dibuang; sesi hanya dalam profil Edge berasingan profil (disulit DPAPI oleh Chromium) |
| 2 | Sederhana | Payload murid (termasuk IC) dihantar sebagai argumen CLI | Payload melalui STDIN; medan `ic` dibuang sebelum dihantar |
| 3 | Sederhana | `moeisJobSelesai` menerima laporan daripada mana-mana pemegang rahsia enjin | `pemilik` + status semasa mesti sepadan di bawah `ScriptLock` |
| 4 | Sederhana | `apiUrl`/`originDibenarkan` boleh diubah oleh klien jauh | `apiUrl` hos sahaja (UI tempatan); `originDibenarkan` hanya fail tetapan, disahkan ketat |
| 5 | Sederhana | `/api/status` melancarkan Edge + panggilan keluar setiap poll | Cache sesi 30 min + cache klaim 5 min; pelayar hanya pada tindakan eksplisit |
| 6 | Rendah | Had kadar auth global boleh lockout silang | Baldi berasingan (pasangan vs token) |
| 7 | Rendah | Heuristik sokongan klaim terlalu longgar | Hanya `Tugasan tidak ditemui` dianggap disokong |
| 8 | Rendah | Regex hos idMe longgar dalam adapter | `adalahHosIdMe()` — HTTPS + hos tepat |
| 9 | Rendah | Heartbeat lease gagal senyap | Direkod (`LEASE_HEARTBEAT_GAGAL`) dan diakui sebagai had dalam dokumen ini |

Setiap penemuan dikunci dengan ujian regresi berlabel `[penemuan N]` dalam
`tests/pembetulan-semakan.test.mjs`.

Pusingan pengesahan kedua (DeepSeek) menyemak khusus pembetulan 1–4: keempat-empatnya
dinyatakan **ditutup**, angka ujian disahkan tepat terhadap kod, dan tiga penemuan
baharu dibetulkan dalam pusingan yang sama: (a) rahsia tidak lagi melalui baris
arahan `powershell.exe` (STDIN + env proses anak), (b) penapis lapisan log sebenar
ditambah untuk IC/emel/token dengan had nama diakui secara jujur, (c) ujian
penemuan 1 dan 3 dinaikkan daripada imbas kod sumber kepada ujian tingkah laku
(cakera selepas aliran sebenar; klien menghantar `pemilik`) — hanya semakan bentuk
`HadirWeb.gs` kekal sebagai ujian struktur kerana Apps Script tidak boleh dijalankan
dalam Node.

### Semakan bebas kredensial (Claude, keluarga model berbeza)

Vault kredensial + log masuk automatik ini disemak oleh **Claude** (keluarga
model berbeza daripada pelaksana) khusus atas pengendalian kredensial, dengan
model ancaman meliputi penyerang tempatan, akaun Windows lain, sandaran, crash
dump, log, UI/XSS, nonce dan risiko kunci akaun. Keputusan:
**LULUS BERSYARAT** (tiada penemuan TINGGI; tiada laluan yang log/gema/simpan
nilai kredensial dalam teks biasa). Dua nota:

1. **Sederhana (had diakui pada masa semakan ini — kini DISELESAIKAN, lihat
   nota 2026-09-21 di bawah):** pembilang 2 cubaan automatik adalah *per
   proses* dan ditetapkan semula pada setiap mula semula proses. Satu siling
   KADAR persisten merentas restart telah dibangunkan (`buatHadKadarLogin`,
   `src/moeis/had-login.mjs`) dan diuji, tetapi pada masa semakan ini **TIDAK
   disambungkan dalam pengeluaran**: ia mengubah rejim kadar (2 cubaan per
   tetingkap 15 minit, dikosongkan pada kejayaan) yang pemilik belum
   luluskan. Had ASAL 2 cubaan per proses dikekalkan. Lihat bahagian *Had
   cubaan log masuk automatik* di atas.
2. **Rendah (had diakui, corak sedia ada):** kegagalan `icacls` (ACL folder)
   ditelan senyap secara sengaja supaya tiada maklumat bocor ke log; kini
   melindungi direktori yang turut memuatkan `kredensial.dat`, jadi lapisan
   kedua (selain DPAPI CurrentUser) boleh terdegradasi tanpa isyarat. Corak
   sedia ada daripada `simpanan.mjs`, bukan regresi baharu.

### Semakan bebas had kadar + penjaga sesi (Codex, keluarga model berbeza)

Perubahan **had kadar log masuk** (`had-login.mjs`) dan **penjaga sesi
keep-alive** (`jaga-sesi.mjs`) asalnya disemak secara bebas oleh **Codex
(OpenAI, keluarga model berbeza)** — read-only, menilai `git diff` dan modul
baharu. Semakan itu menilai empat penemuan (gulung-balik jam, fail korup,
akses profil Edge tidak saling eksklusif, rantaian timer) yang semuanya
dibetulkan dalam kod modul.

**Namun semakan induk berikutnya MENYEKAT pelepasan** dan membetulkan perkara
yang semakan Codex terlepas; kerja dikerjakan semula di sini:

1. **Had kadar persisten dibuang daripada pengeluaran (pada masa semakan
   ini).** Penyambungan `hadKadar` yang tanpa syarat menggantikan had asal "2
   cubaan per proses" dengan siling kadar yang lebih longgar secara agregat
   (2 cubaan per tetingkap 15 minit, dikosongkan pada kejayaan) — peningkatan
   kadar senyap yang pemilik tidak luluskan pada masa itu. Modul
   `had-login.mjs` kekal sebagai modul bebas beruji, tetapi **TIDAK
   disambungkan**; had asal 2 cubaan per proses dikekalkan.
   >
   > **Nota 2026-09-21 — pemilik meluluskan had kadar BERTERUSAN secara
   > eksplisit.** `had-login.mjs` dikembangkan kepada polisi baharu (6
   > cubaan/jam gelongsor, siling harian 24 TIDAK dikosongkan oleh kejayaan,
   > berhenti serta-merta selepas 3 kegagalan berturut-turut) dan disambungkan
   > pada KEDUA-DUA laluan login melalui suis opt-in `hadKadarLogin` (lalai
   > MATI). Ini BUKAN pengulangan kesilapan yang disekat di atas: rejim baharu
   > lebih ketat pada dimensi kegagalan berturut-turut (3, bukan tiada had),
   > kekal opt-in eksplisit (bukan tanpa syarat), dan diluluskan pemilik
   > secara bertulis sebelum disambungkan — bukan keputusan pelaksana
   > sendirian. Lihat bahagian *Had cubaan log masuk automatik* di atas dan
   > baris changelog 1.11.16 dalam `BLUEPRINT.md`.
2. **Penjaga sesi dijadikan opt-in eksplisit `jagaSesi` (lalai MATI).** Sebelum
   ini penjaga dimulakan tanpa syarat selepas bind. Kini ia hanya poke apabila
   suis `jagaSesi` HIDUP (local-only), dan klasifikasi kesihatannya jujur
   (`sesi-sah` sahaja = sihat; `sesi-tamat`/`perlu-manusia`/`langkau`/`ralat` =
   tidak sihat — promise selesai bukan kejayaan).
3. **Kunci eksklusif pelayar baharu** (`src/kunci-pelayar.mjs`) menutup
   tetingkap TOCTOU yang Codex tandakan: semakan `sedangProses` sahaja tidak
   menghalang tugasan bermula di tengah siasatan. Kunci diperoleh atomik dalam
   kedua-dua pelancar anak; perlanggaran dilangkau (`langkau`), bukan
   paksa-bunuh pelayar aktif.

**Kepastian jujur tentang keep-alive:** "luput ~15-20 minit" ialah pemerhatian
pemilik, BUKAN masa tamat tetap yang diukur; sama ada poke baca-sahaja
benar-benar menghalang luput **belum disahkan terhadap idMe hidup** sehingga
ujian hidup dilakukan dengan kehadiran pemilik.

### Nota pengesanan kejayaan selepas hantar (post-submit)

Selepas klik "Daftar Masuk", log masuk idMe yang **berjaya** biasanya mendarat
pada papan pemuka idMe (`idme.moe.gov.my`) — borang log masuk (#check_log/
#password) hilang dan navigasi Aplikasi/Laporan/breadcrumb muncul — dan MOEIS
(`moeispel.moe.gov.my`) dicapai kemudian melalui pautan Aplikasi/SSO. Jadi
`hos == moeispel` **bukan** satu-satunya isyarat kejayaan. Klasifikasi
dipusatkan dalam fungsi tulen `tentukanStatusSelepasHantar()` (`src/moeis/sesi.mjs`):
borang hilang + papan pemuka idMe wujud → `sesi-sah` (walaupun hos masih idMe);
sebaliknya `sesi-tamat` dengan sebab yang menamakan apa yang sebenarnya ditemui.
Ini masih **belum disahkan terhadap idMe hidup** (larangan keras brief) — tanda
papan pemuka disemak secara longgar (pautan `list_aplikasi`, kelas breadcrumb,
teks Aplikasi/Laporan/Dashboard/Pengurusan).
