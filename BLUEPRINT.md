# Blueprint HADIR — SK Paya Redan

**Versi 2.18 · 23 September 2026**

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
  baris tugasan; enjin pada PC guru — **shell desktop** `desktop/` (bahagian
  5.3), dengan `companion/` Node sebagai enjin lama (bahagian 5.2), berikutan
  prototaip `moeis-bot` — mengambil tugasan menerusi `moeisJobSenarai` dan
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
  runner asal mati. **Pemulihan tugasan tersekat:** tugasan `sedang_dihantar`
  yang ditinggalkan enjin mati/restart boleh diklaim semula melalui tiga laluan
  — (a) pemilik sama (ID enjin **stabil** merentasi restart, disimpan di
  `<dirData>/id-enjin.json` sebagai UUID tempatan, bukan `hostname:pid`) menuntut
  semula **serta-merta**; (b) pemilik berlainan selepas lease 15 minit luput;
  (c) tugasan yatim tanpa `PEMILIK` & tanpa `LEASE_SELEPAS` (tugasan lama/manual).
  Poll giliran companion kini mempertimbangkan status `sedang_dihantar` (bukan
  hanya `menunggu`) supaya pemulihan ini benar-benar dicuba; backend kekal
  penentu atomik di bawah `ScriptLock` — klaim tidak dibenarkan pulang `null`
  dan tugasan dilangkau tanpa kesan. `moeisJobSelesai` menerima keputusan tambahan `tersimpan`
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
pelayar headless). **Enjin rasmi kini shell desktop `desktop/` (bahagian
5.3); kad kawalan web companion dan butang "Jalankan sekarang (Companion)"
sudah DIBUANG (23/09/2026)** — PC sekolah tidak lagi menyambung ke loopback
8747, jadi kad itu hanya menghasilkan `Failed to fetch`. Pemasangan penuh,
aliran pemasangan mudah alih dan had keupayaan yang diuji: [`companion/docs/PEMASANGAN.md`](companion/docs/PEMASANGAN.md).

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
- **Vault kredensial idMe tempatan (`src/kredensial.mjs`, `kredensial.dat`).**
  Selepas kelulusan pemilik (Sept 2026), PC guru **kini menyimpan kredensial
  log masuk idMe** (pengguna + kata laluan + frasa "Kata Kunci Keselamatan")
  apabila guru memilih menyimpannya. Ini bertentangan dengan dakwaan lama
  "companion tidak pernah menyimpan kata laluan" — dakwaan itu DIBUANG.
  Fakta semasa: nilai disulit **DPAPI `CurrentUser`** (hanya akaun Windows
  yang sama boleh nyahsulit), ditulis atomik, folder dikunci ACL `icacls`;
  **tiada** teks biasa pada cakera, tiada env var/argumen CLI, tidak pernah
  digemakan (status/UI hanya boolean + pengguna tersamar `X***`).
- **Model ancaman kredensial (had jujur):** (1) *Penyerang tempatan dengan
  akaun Windows yang sama* boleh memanggil DPAPI atas nama pengguna itu
  (mis. melalui proses lain pada sesi sama) dan berpotensi nyahsulit vault —
  DPAPI melindungi *semasa rehat* dan daripada *akaun lain*, bukan daripada
  proses yang berjalan sebagai pengguna sama. (2) *Akaun Windows lain* tidak
  boleh nyahsulit (CurrentUser). (3) *Sandaran/cakera klon* tidak memindahkan
  kunci DPAPI pengguna; nilai kekal tidak boleh dibaca tanpa konteks pengguna
  asal (sandaran profil pengguna + kunci master Windows boleh memindahkan
  keupayaan itu). (4) *Crash dump / hibernasi / memory swap* mungkin
  mengandungi nilai sementara dalam ingatan proses; mitigasi: nilai hanya
  wujud sementara dalam proses anak `login-auto.mjs` semasa `.fill()` dan
  tidak pernah dicetak/disimpan. (5) *Log* tidak pernah menerima nilai (hasil
  login-auto hanya status+sebab generik; `simpan()` menolak mesej ralat
  berisi nilai). (6) *UI/XSS*: UI tempatan dibuka loopback+nonce, di-frame
  `DENY`, CSP `frame-ancestors 'none'`; nilai kata laluan dibersihkan sejurus
  simpan. (7) *Nonce*: `/api/lokal/kredensial*` hanya menerima header
  `X-HADIR-Lokal` bernonce + Origin loopback tepat; halaman pembuka HTTPS→HTTP
  tidak boleh membaca nonce. (8) *Risiko kunci akaun*: maks **2** cubaan
  log masuk automatik **per proses** dengan backoff; selepas itu perlu
  manusia; tiada gelung tanpa hujung. (Ini ialah had ASAL yang diluluskan
  pemilik. Modul bebas `src/moeis/had-login.mjs` menawarkan siling KADAR
  PERSISTEN merentas restart, tetapi ia TIDAK disambungkan dalam pengeluaran
  kerana ia mengubah rejim kadar yang pemilik belum luluskan — ia kekal
  sebagai modul beruji untuk semakan masa depan.)
- **Log masuk idMe automatik (`src/moeis/login-auto.mjs`) ialah OPT-IN**
  (suis `loginAuto`, lalai MATI, berasingan daripada `autoMulaGiliran`).
  **Aliran DUA PERINGKAT (diperbetulkan 21 Sept 2026 — lihat pepijat di
  bawah):** idMe memaparkan medan IC pada halaman log masuk; frasa "Kata
  Kunci Keselamatan" hanya wujud SELEPAS IC dihantar, pada halaman
  `/loginverification`, bersama kotak semak "Ya, ini adalah Kata Kunci
  Keselamatan saya." yang tidak ditanda — medan kata laluan tersembunyi
  sehingga kotak itu ditanda. Companion mengikut urutan: navigasi → semak
  CAPTCHA/OTP awal → semak hos ketat → **isi IC** → **lanjut ke
  /loginverification** → **baca frasa** → keputusan frasa → **tanda kotak
  semak** → **isi kata laluan** → hantar → semak OTP/CAPTCHA selepas hantar →
  sahkan sesi. Keputusan frasa membezakan TIGA status jujur: `sesi-sah`
  (frasa padan, teruskan), `kunci-tidak-padan` (frasa dibaca tetapi berbeza —
  kemungkinan pancingan sebenar), dan `kunci-tiada` (frasa tidak dapat dibaca
  sebagai teks sama sekali, kemungkinan dipaparkan sebagai imej) — status
  kedua dan ketiga kedua-duanya ABORT dengan `perluManusia:true`, TIADA kotak
  semak ditanda, TIADA kata laluan ditaip, tetapi mesejnya tidak boleh
  disamakan (satu ialah "tidak padan", satu lagi ialah "tidak dapat dibaca").
  **INVARIAN KESELAMATAN (kekal, dinyatakan lebih tepat):** KATA LALUAN hanya
  ditaip SELEPAS frasa dibaca dan padan DAN kotak semak ditanda; IC ditaip
  lebih awal kerana idMe memerlukannya untuk memaparkan frasa itu — ini bukan
  pelemahan anti-pancing (frasa kekal satu-satunya pengawal yang membenarkan
  kata laluan ditaip). CAPTCHA/OTP tidak dikesan dan had 2 cubaan belum
  tercapai kekal syarat wajib. OTP/CAPTCHA/2FA **tidak pernah** dipintas —
  berhenti dengan `perluManusia:true`. **Pepijat asal yang dibetulkan:** versi
  sebelum ini membaca frasa SEBELUM menghantar IC (pada halaman yang tidak
  pernah memaparkannya) dan mengisi satu borang tunggal `isiBorangLogMasuk`
  — frasa sentiasa `null` dan runtuh menjadi `kunci-tidak-padan` yang
  mengelirukan, dan medan kata laluan (checkbox-gated) tidak wujud lagi untuk
  diisi. Diganti dengan kaedah adapter berperingkat
  (`isiPenggunaIdMe`/`lanjutkanPengesahan`/`bacaKunciKeselamatan`/
  `tandakanKunciKeselamatan`/`isiKataLaluanIdMe`/`hantarBorangLogMasuk`).
  Aliran ini **belum disahkan terhadap idMe hidup** — selektor DOM sebenar
  (kedudukan medan IC, butang lanjut/seterusnya, label kotak semak, sama ada
  frasa dipaparkan sebagai imej) semuanya andaian belum terbukti; pengesahan
  hidup berlaku kemudian dengan kehadiran pemilik.
- **Suis `benarkanTerusTanpaFrasa` (opt-in BERASINGAN, lalai MATI, diluluskan
  pemilik 21 Sept 2026).** Lalai MATI: apabila frasa "Kata Kunci Keselamatan"
  tidak dapat dibaca sebagai teks (kemungkinan dipaparkan sebagai imej), aliran
  ABORT seperti biasa (`kunci-tiada`). Apabila suis ini DIHIDUPKAN secara
  eksplisit oleh pemilik, log masuk automatik **diteruskan** dalam keadaan itu
  sahaja — status baharu `kunci-tiada-dibenarkan` (`perluManusia:false`,
  `sesiSah:true` apabila sesi disahkan) — dan kotak semak pengesahan tetap
  ditanda serta kata laluan tetap ditaip seperti aliran biasa. **Risiko
  dinyatakan dengan jujur:** semakan frasa DILANGKAU dalam keadaan ini, jadi
  perlindungan anti-pancing kemudian bergantung **sepenuhnya** pada semakan
  HTTPS + hos idMe yang ketat (`sahkanHos`, sudah lulus lebih awal dalam
  aliran) dan pada kotak semak pengesahan — bukan pada frasa. Frasa imej
  **TIDAK PERNAH** di-OCR atau diteka; nilainya kekal `null`, hanya keputusan
  mengenainya yang berubah. Frasa yang **dibaca tetapi tidak padan**
  (`kunci-tidak-padan`, pancingan sebenar) kekal ABORT **TANPA MENGIRA** suis
  ini — isyarat anti-pancing utama tidak pernah dilonggarkan. Suis ini
  local-only (`/api/lokal/tetapan`, medan UI berasingan dengan amaran
  eksplisit dalam UI tempatan) dan boleh dimatikan semula bila-bila masa.
- **Pembetulan langkah kotak semak pengesahan (`tandakanKunciKeselamatan`,
  adaptorPlaywright.mjs + login-auto.mjs) — disahkan terhadap DOM idMe SEBENAR
  (bundle diagnostik pemilik 2026-09-21, bukan lagi andaian).** Halaman
  pengesahan idMe sebenar membawa kotak semak `<input id="check_log"
  class="form-check-input" name="check" type="checkbox">` di dalam `<label>
  "Ya, ini adalah Kata Kunci Keselamatan saya."`; medan kata laluan
  `<input id="password">` berada di dalam kontena `<div id="submit_form"
  style="display:none">` yang didedahkan oleh pengendali jQuery halaman
  (`$("#check_log").click(...)`) apabila kotak ditanda. Adapter kini menyasar
  id `#check_log` yang DIKENALI dahulu (fallback `name="check"` dan heuristik
  label), menanda melalui aksi Playwright `.check()` idempotent (bukan
  `element.click()` mentah dalam `evaluate` yang tidak mencetuskan pengendali
  jQuery dengan boleh dipercayai), dan mengesahkan kata laluan benar-benar
  kelihatan sebelum memulangkan `true`. **Pepijat yang dibetulkan:**
  `jalankanLoginAuto` SEBELUM ini MENGABAIKAN nilai pulangan
  `tandakanKunciKeselamatan()` dan terus ke `isiKataLaluanIdMe()` — apabila
  kotak gagal mendedahkan kata laluan, `fill()` melontar Timeout Playwright
  mentah (30s) yang bocor sebagai "ralat teknikal" (bukti bundle diagnostik).
  Kini `jalankanLoginAuto` menyemak `=== true` dan ABORT dengan status baharu
  **`kotak-pengesahan-gagal`** (`perluManusia:true`, sebab jelas, `bukti:
  ['kotak-pengesahan-gagal']`) — TIADA kata laluan ditaip, TIADA hantar.
  Invarian keselamatan sedia ada (anti-pancing, CAPTCHA/OTP, had cubaan,
  HTTPS+hos) kekal tidak disentuh.
- **Pembetulan langkah hantar (`hantarBorangLogMasuk`, adaptorPlaywright.mjs)
  — DUA butang "Daftar Masuk" pada idMe sebenar.** Halaman pengesahan idMe
  membawa placeholder disabled/hidden `#log_disbale_form` (sentiasa lebih awal
  dalam DOM) DAN satu butang sebenar aktif+kelihatan; `.first()` membuta
  memilih placeholder dan melontar Timeout Playwright mentah (30s) yang bocor
  ke log companion sebagai "ralat teknikal". Diganti dengan imbasan
  BERSEMPADAN (~8 saat, tinjau setiap ~250ms) yang mengklik HANYA calon
  kelihatan **DAN** aktif; jika tiada calon sedemikian selepas had masa,
  pulangkan `{ok:false, status:'tiada-butang-hantar', sebab:<jelas>}`
  (TIDAK PERNAH throw). `jalankanLoginAuto` kini menyemak `ok===true` sebelum
  meneruskan; kegagalan berhenti `perluManusia:true` dengan sebab yang sama
  (invarian sedia ada — anti-pancing, had cubaan, dsb. — tidak disentuh).
  Segera sebelum klik, adapter log 3 BOOLEAN sahaja (kotak semak ditanda,
  kata laluan tidak kosong, kata laluan kelihatan) — TIDAK PERNAH nilai.
  **Bundle diagnostik LOKAL SAHAJA** (`tulisDiagnostikKegagalan`) ditulis ke
  `<dirData>/log/diagnostik-login-<masa>/` pada MANA-MANA kegagalan log masuk:
  DOM disanitasi (`sanitasiDomLoginGagal` — nilai setiap input/textarea
  dibuang, medan hidden/CSRF/token dibuang sepenuhnya, frasa keselamatan
  digantikan `[FRASA-DISAMARKAN]` dengan struktur tag/kelas dikekalkan),
  tangkapan skrin VIEWPORT, dan sebab (turut melalui `sensor()` log.mjs).
  Bundle ini **TIDAK PERNAH** dimuat naik/dilampirkan/dihantar ke mana-mana
  model atau perkhidmatan luar — ia kekal pada cakera PC companion sahaja,
  dalam folder log yang ACL-nya sudah dihadkan kepada akaun Windows semasa.
- **Ketahanan log masuk automatik terhadap halaman lambat/separa dimuatkan**
  (`adaptorPlaywright.mjs` + `login-auto.mjs`). Dua kegagalan HIDUP pemilik
  (2026-09-21) berkongsi gejala sama: `.first().fill()/.click()` pada medan IC
  / kata laluan / butang yang belum dirender melontar *Timeout* Playwright
  mentah (30s) yang bocor ke log sebagai "ralat teknikal". Adapter kini
  **menunggu** setiap elemen log masuk menjadi **sedia** (hadir + kelihatan +
  aktif) secara **bersempadan** (lalai ~15s, tinjau ~250ms) sebelum
  berinteraksi — `isiPenggunaIdMe`, `lanjutkanPengesahan`,
  `bacaKunciKeselamatan` (frasa dibaca daripada fungsi tulen baharu
  `bacaFrasaKunciKeselamatan`, ditinjau sehingga muncul), `tandakanKunciKeselamatan`
  dan `isiKataLaluanIdMe`. `isiPenggunaIdMe`/`isiKataLaluanIdMe` kini
  memulangkan `{ok,sebab}` dan `jalankanLoginAuto` menyemak pulangan itu,
  ABORT dengan status `medan-ic-tiada` / `medan-kata-laluan-tiada` dan sebab
  Bahasa Melayu yang jelas (bukan Timeout mentah). Invarian keselamatan
  (anti-pancing, CAPTCHA/OTP, had 2 cubaan) TIDAK disentuh; had masa boleh
  dikecilkan dalam ujian melalui opsyen `masaSediaMs`/`jedaPollMs` adapter.
- **Pemulihan giliran auto (bounded, `pasangPemulihanAutoMula` dalam
  `src/orchestrasi-auto.mjs`).** Jika auto-mula startup gagal (cth sesi idMe
  tidak sah semasa bind) tetapi suis `autoMulaGiliran` masih ON, companion
  memasang gelung pemulihan (lalai setiap 5 minit, unref) yang setiap kitaran:
  berhenti serta-merta jika suis dimatikan ATAU giliran sudah aktif; jika
  tidak, cuba `cubaLoginAutoKerja` (job-time, cache-sahaja, terikat had 2
  cubaan sedia ada) kemudian panggil semula `cubaAutoMula` PENUH (menilai
  semula SEMUA pengawal — kalendar/hujung minggu/sempadan aktivasi opt-in
  dari awal, TIDAK dilonggarkan langsung); berhenti sebaik giliran bermula.
  `sesiDisahkan` yang disuntik ke `cubaAutoMula` dalam gelung ini MESTI
  `sesiKerjaDisahkan` (cache-sahaja) — BUKAN semakan startup yang boleh
  melancarkan pelayar sendiri — supaya gelung pemulihan tidak menjadi laluan
  kedua yang membuka Edge tanpa sebab.

**Dua suis opt-in (autostart + auto-mula), kedua-duanya lalai MATI:**
- **Autostart Windows** — satu entri Run key HKCU `HADIRMoeisCompanion`
  (`src/autostart-windows.mjs`, `reg.exe` argv tetap, tiada shell).
  `POST /api/lokal/autostart` (UI tempatan, nonce sah) melaporkan keadaan
  **sebenar daripada registry HKCU**, bukan flag tetapan; subperintah CLI
  `autostart-hidup`/`autostart-mati`. Tiada lagi laluan jauh
  `POST /api/autostart` — autostart hanya boleh diubah dari PC itu sendiri.
- **Auto-mula giliran** — dinilai **sekali** selepas bind loopback berjaya
  (`src/permulaan.mjs` → `src/orchestrasi-auto.mjs`), bukan semasa PC restart.
  Pengawal kelayakan ini **hanya** terpakai apabila giliran dimulakan oleh
  auto-mula; butang **Mula** manual (`POST /api/mula`) mengekalkan kelakuan
  sedia ada — tiada penapis kalendar/kesegaran dan tiada cubaan semula
  automatik dalam poll (`giliran.mjs` menghantar `automatik` berdasarkan
  `state.modMula === 'auto'`).
  Pengawal kelayakan (`src/auto-mula.mjs`): tugasan `menunggu` ATAU
  `sedang_dihantar` (yatim selepas crash/restart) ATAU `tersimpan`
  (pengesahan selepas simpan tidak lengkap) untuk tarikh **hari ini**
  (`Asia/Kuala_Lumpur`) yang ada dalam allowlist tarikh sekolah tepat
  `kalendarSekolah` (kosong = gagal tertutup; Sabtu/Ahad ditolak). Had umur
  15 minit dan sempadan startup/aktivasi DIBUANG (polisi baharu, diluluskan
  pemilik) — tugasan hari ini yang belum selesai diteruskan selepas restart
  walaupun dicipta sebelum enjin bermula. Kewarasan cap masa dikekalkan (nilai
  mesti sah, bukan masa depan). `sedang_dihantar` TIDAK dihantar buta: klaim
  atomik + lease (backend `moeisJobKlaim_`) memutuskan pemilikan (lease aktif
  tidak dirampas) dan verifikasi-baca-dahulu memastikan padan => berjaya tanpa
  tulis, konflik => berhenti (perlu penyesuaian manusia). Tugasan `tersimpan`
  juga diambil oleh giliran automatik (bukan manual) dan dipulihkan
  **baca-sahaja sahaja**: klaim mod `'verifikasi'` (status KEKAL `tersimpan`
  di backend), jalankan HANYA mod `verifikasi` — TIDAK PERNAH mod `hantar`;
  padan (`tidak-berubah`) => `berjaya` tanpa tulis MOEIS, `konflik`/`perlu-hantar`
  => `gagal` dengan mesej tindakan manusia, kegagalan teknikal => lepas lease
  tanpa rekod (cuba semula selepas restart). Tiada cubaan semula automatik untuk
  `gagal`/`berjaya`; satu tugasan sekali sepanjang hayat proses; kelayakan
  diperiksa semula sebelum klaim dan sebelum mutasi MOEIS; mematikan suis
  menghentikan giliran auto tanpa hidup semula dalam proses sama.
- **Amaran tamat kalendar + editor allowlist (UI tempatan).** Fungsi tulen
  `ringkasanKalendar()` (`src/auto-mula.mjs`, eksport `AMARAN_HARI_KALENDAR = 7`)
  meringkaskan `kalendarSekolah` menjadi `{ bilangan, pertama, terakhir,
  hariTinggal, amaran, sebab }`. `hariTinggal` dikira dalam **hari penuh**
  (Asia/Kuala_Lumpur) ke tarikh sah **terakhir**; `amaran` benar apabila
  allowlist kosong, sudah tamat, atau tarikh terakhir dalam ambang 7 hari;
  `sebab` ialah ayat Melayu pendek yang menyatakan kes tepat (tarikh + hari
  tinggal). Amaran ini **baca sahaja** — ia TIDAK mengubah keputusan pengawal
  auto-mula; ia wujud supaya pemilik sempat menambah tarikh sebelum auto-mula
  gagal tertutup pada hari yang tidak lagi dilindungi allowlist. Dipaparkan
  sebagai object `kalendar` dalam `/api/lokal/status` dan `/api/status`, serta
  sebagai banner jelas (merah) dalam UI tetapan tempatan. Editor allowlist
  dalam UI tempatan (tambah satu tarikh + `Buang` setiap tarikh + `Simpan
  kalendar`) menghantar senarai penuh ke `/api/lokal/tetapan` (header nonce
  sahaja, medan local-only) — pengesahan kekal `sahkanKalendarSekolah`
  (sebarang entri bukan tarikh tepat `YYYY-MM-DD` menolak seluruh senarai;
  mesej server dipaparkan verbatim). Editor TIDAK boleh mengubah
  `originDibenarkan`/`apiUrl` dan tidak boleh dipandu dari asal jauh.
- **Keupayaan log masuk idMe** (`src/moeis/keupayaan.mjs`): `automatik: true`,
  `mod: 'automatik-optin'`. Companion kini mempunyai vault kredensial DPAPI
  tempatan sendiri dan log masuk automatik OPT-IN (`loginAuto`, lalai MATI).
  Pengawal kekal ketat (frasa kunci keselamatan mesti padan, CAPTCHA/OTP/2FA
  memerlukan manusia, maks 2 cubaan automatik/proses) dan aliran **belum
  disahkan terhadap idMe hidup**. Tanpa `loginAuto`, log masuk kekal manual
  (manusia log masuk sendiri pada Edge companion).

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

**Kumpulan pelayar (Option 2) — SATU konteks Edge dikongsi per-kitaran giliran:**
Daripada satu Edge sejuk per tugasan, `giliran.mjs` kini mengikut laluan
kumpulan: `src/moeis/kumpulan-pelayar.mjs` (glu kunci eksklusif +
dispatcher + laluan sejuk) membuka **satu** dispatcher IPC pada panggilan
pertama `jalankanTugasanAnak` dan memegang kunci pelayar label `kumpulan`
merentas hayat kitaran (dilepaskan hanya oleh `tutupKumpulanPelayar()`).
`src/moeis/dispatcher-kumpulan.mjs` melancarkan `bin/pekerja-batch.mjs`
sebagai proses anak **berterusan** (bukan execFile satu-tembakan) yang
memproses berbilang tugasan berurutan terhadap **satu** konteks dikongsi
(`src/moeis/pekerja-batch.mjs`); setiap tugasan tetap menerima **halaman
baharu + adapter baharu** (tidak pernah mempercayai kelas/tarikh/senarai
murid halaman sebelumnya). Protokol NDJSON satu-baris:
induk→anak `{"id","job","opsyen"}` melalui stdin, anak→induk
`HASIL:{"id","hasil"}` melalui stdout (baris lain diabaikan); IC dibuang
oleh `buangIc` SEBELUM ditulis ke stdin (invarian sama seperti laluan sejuk).
Gelung protokol NDJSON itu sendiri difaktorkan ke modul BERSAMA
`src/moeis/pekerja-ndjson.mjs` (diimport oleh `bin/pekerja-batch.mjs` produksi
DAN oleh fixture ujian) supaya pelari produksi yang sama diuji — bukan salinan
palsu berasingan.
Kegagalan membuka konteks dilaporkan `{status:'gagal', pembukaanGagal:true}`
(bukan lontaran) supaya `kumpulan-pelayar.mjs` menutup kumpulan, melepas
kunci dan **jatuh balik ke laluan sejuk** untuk tugasan itu sahaja (job/opsyen
asal, tanpa perubahan). Sempadan penutupan: `giliran.mjs` memanggil
`tutupKumpulanPelayar()` pada akhir setiap kitaran/tugasan (finally) dan
**sebelum** memanggil pengurus log masuk induk apabila sesi tamat dikesan
(elak deadlock kunci reentrant); pelayar gantian dibuka semula lewat selepas
penutupan.

**Pengetatan hayat/penutupan (penemuan semakan bebas Astra — enam penyekat):**
(1) **stderr pekerja kini disalirkan** ke bufer bersempadan (~4 KB) + sanitasi
(aksara kawalan dibuang) — sebelum ini stderr tidak pernah dikonsumsi,
berisiko deadlock paip dan menghilangkan diagnostik; tiada PII mentah dilog.
(2) **Setiap permintaan ada masa tamat bersempadan** (lalai 15 minit, padan
laluan sejuk) dan **ralat stdin (EPIPE) tidak lagi ditelan** — kedua-duanya
menyelesaikan promise tertunda secara **jujur** (`{status:'gagal',
tidakDiketahui:true}`, tiada main-semula membuta) dan menamatkan pekerja
milik sendiri. (3) **`tutup()` kini membersihkan pokok proses MILIK pekerja**
— `bunuhPokokProses` (`taskkill /PID <pid> /T /F` pada Windows, disuntik)
membunuh keturunan Edge/Playwright pekerja apabila ia tidak keluar dalam
`graceMs`, **tidak pernah** mengimbas/membunuh Edge peribadi pengguna.
(4) **`state.sedangProses` kekal benar sepanjang penutupan kumpulan** (set
palsu hanya dalam `finally` selepas `tutupKumpulan()` selesai) — sebelum ini
ia diset palsu sebelum `await`, membuka tetingkap tugasan baharu semasa
kumpulan masih ditutup; kegagalan penutupan direkod (gagal-tertutup), tidak
ditelan senyap. (5) **Mesin keadaan eksplisit** `ditutup|dibuka|menutup|gagal`
dalam `kumpulan-pelayar.mjs`: `buatDispatcher()` yang melontar melepas kunci
(tiada apa dilancarkan); `d.tutup()` yang gagal **mengekalkan kunci**
(gagal-tertutup — Edge yatim mungkin masih memegang profil) dan tugasan
berikutnya dilangkau (`pastiTiadaSpawn:true`), bukan melancarkan pelayar kedua
atau melepas kunci senyap; tutup serentak diserikan (janji tutup berkongsi).
(6) **Cangkuk hayat pemberhentian** (`giliran.berhenti()` + pengendali
`SIGINT`/`SIGTERM` dalam `bin/hadir-companion.mjs`): berhenti tanpa
mengganggu tulisan sedang berjalan (bounded tunggu), **tiada tugasan
seterusnya selepas berhenti**, dan menutup kumpulan/pelayan sekali.

**Pengetatan hayat/penutupan — PUSINGAN KEDUA (semakan semula Astra, penyekat**
**yang tertinggal oleh tuntutan "semua selesai" sebelum ini):** (1) **Bunuh
pokok DAHULU sebelum kill langsung** — `bunuhPokokProses` (taskkill /T) kini
dipanggil SEBELUM `kill()` langsung supaya keturunan Edge/Playwright tidak
menjadi yatim (diparurkan semula) sebelum pokok ditemui; selepas itu tunggu
pengesahan keluar (bounded). (2) **Pembersihan mesti DISAHKAN, bukan dianggap**
— `tutup()` kini MENOLAK (gagal-tertutup) jika akar tidak terbukti keluar ATAU
bunuh pokok disuntik tetapi GAGAL (keturunan mungkin yatim); handle anak
dikekalkan sehingga pembersihan terbukti, dan kejatuhan SEMULA JADI (crash)
pekerja mengekalkan handle supaya `tutup()` boleh cuba bunuh pokok keturunan
yatim — jika tidak dapat disahkan, tutup menolak dan kunci dikekalkan.
(3) **Keadaan RACUN TERMINAL** — keluar/putus/ralat stdin/tamat masa/limpaan
protokol menetapkan dispatcher gagal kekal; `hantar()` seterusnya pulang
`{status:'gagal', tidakDiketahui:true}` TANPA spawn automatik baharu (spawn
semula boleh memegang semula profil dan menulis semula tugasan yang hasilnya
tidak diketahui). (4) **Satu anak ditangkap (`a`) dalam SEMUA handler**, bukan
pemboleh ubah `anak` boleh-ubah — keluar LEWAT pekerja lama diabaikan
(`a !== anak`) dan tidak mengosongkan keadaan proses baharu. (5) **Ralat stdin
(EPIPE) kini MENAMATKAN pekerja**, bukan hanya buang handle — pekerja yang
mungkin masih hidup mesti dibunuh supaya profil Edge tidak kekal dipegang
sementara kunci dilepas. (6) **stderr TIDAK PERNAH dilog mentah** — hanya kod
diagnostik allowlist (`BERHENTI`, `KUMPULAN_PELAYAR_*`) diekstrak + kiraan
bait; kandungan mentah (boleh membawa nama/token/IC) dibuang selepas dikira
(penyekat asal hanya menapis aksara kawalan — TIDAK menghapus PII). (7)
**stdout BERSEMPADAN** — penimbal baris melebihi 1 MiB = limpaan protokol →
gagal tertutup (racun + tamatkan pekerja), bukan penimbal tanpa had sehingga
newline tiba.

**Pengetatan penutupan — PUSINGAN KETIGA (handshake pembersihan bersih):**
Sebelum ini handler `exit` membuang `anak` (set null) serta-merta apabila
`ditutup` ATAU `diracun`, dan `tutup()` menganggap sebarang keluar dalam
`graceMs` (termasuk kod bukan sifar / terpaksa dibunuh) sebagai bersih —
sekali gus pengurus melepaskan kunci walaupun pembunuhan pokok keturunan
sebenarnya GAGAL. Kini: (1) handler `exit` hanya **REKOD** keluar (`kod` +
`_sudahKeluar`), **tidak pernah** membuang handle; (2) penutupan bersih
memerlukan **ack `BERSIH:`** daripada pekerja (dipancarkan oleh pelari NDJSON
produksi HANYA selepas `context.close` selesai) **DAN** keluar kod 0 — tanpa
kedua-duanya, `tutup()` membunuh pokok + kill (melalui **satu janji
pembersihan dikongsi** antara racun dan tutup, jadi kill/pembunuhan pokok
berlaku **tepat sekali** — tiada bunuh berulang / guna-semula PID akar) dan
MENOLAK jika tidak disahkan; (3) panggilan balik bunuh pokok **dibatasi masa**.
Ujian membuktikan: EPIPE+bunuh pokok gagal → tutup MENOLAK; tutup serentak
dengan bunuh pokok lewat ditolak → MENOLAK; keluar bukan sifar semasa grace
TIDAK dikira bersih; ack+keluar 0 melepas handle tanpa kill; kill berjaya
berlaku tepat sekali.

**Ujian IPC span SEBENAR (`tests/dispatcher-kumpulan-sebenar.test.mjs`):**
Dispatcher produksi diuji terhadap proses anak Node **sebenar** (spawn
`node`) yang bercakap protokol NDJSON penuh tetapi dengan kebergantungan
pelayar **palsu tempatan** (`tests/fixtures/pekerja-batch-palsu.mjs` —
`buatPekerjaBatch` dengan `buatHalamanPalsu`, tiada Playwright/Edge/MOEIS).
Mod ujian fixture (`--mod-*`) mensimulasikan banjir stderr (>64 KB), gantung
(tiada balasan), crash, dan baris `HASIL:` rosak; mod `--mod-echo` membuktikan
end-to-end bahawa IC tidak pernah sampai ke stdin pekerja. **Lalai produksi
TIDAK berubah** — mod palsu wujud hanya sebagai fail fixture ujian, tiada
laluan boleh-pilih jauh/tidak selamat.

### 5.3 Shell desktop (desktop/)

`desktop/` ialah shell Windows tray (WinForms `net8.0-windows` + WebView2)
yang mengehoskan pandangan portal enjin dalam satu permukaan WebView2 terbenam
(bukan tetingkap Edge pop-out). Ia ialah **penyesuai pengangkutan/cecangkerang**:
peraturan kehadiran, tulisan MOEIS dan auth idMe kekal eksklusif dalam
`companion/`, bukan di sini.

- **Baca sahaja, ber-autentikasi.** Status enjin dibaca melalui
  `LoopbackEngineStatusSource` yang melakukan jabat tangan nonce sebenar
  (`GET /` → `302 /?n=<nonce>`), sahkan redirect kekal pada **origin loopback
  yang sama** (skim+hos+port), kemudian `GET /api/lokal/status` dengan
  `X-HADIR-Lokal: <nonce>` + `Origin` loopback tepat. Nonce **tidak pernah**
  dilog/diikuti. Hasil diklasifikasi berasingan: `Ok / Offline / Unauthorized /
  Timeout / Malformed` — tidak diruntuhkan kepada satu "tidak berjalan".
- **Tiada kawalan enjin.** Tiada start/stop/restart, tiada tulisan tetapan,
  tiada log masuk/idMe sebenar — DEMO memuatkan fixture tempatan sahaja.
- **Tetapan tempatan** membuka UI tetapan enjin sebenar (ber-nonce) dalam
  WebView2 terbenam — navigasi sahaja, tiada tulisan dari pihak shell.
- **CDP hanya mod dev opt-in, dengan get pintu masuk asal ketat.**
  `--remote-debugging-port` (loopback, port rawak, profil `webview2-dev-*`
  terasing) dihidupkan **hanya** bila `HADIR_DEV_DEBUG=1`; mod normal tidak
  pernah menghantarnya (disahkan secara luaran oleh
  `verify-normal-mode.mjs`). Jambatan mesej dev
  (`MainForm.CoreWebView2_WebMessageReceived`) hanya menerima mesej daripada
  asal fixture dev yang TEPAT (`DevFixtureOrigin.IsDevFixture`) — UI tetapan
  enjin sebenar atau halaman SSO masa depan yang dimuatkan dalam WebView2
  yang sama TIDAK BOLEH menggerakkan tetingkap hos. Playwright
  `connectOverCDP` terbukti (bukan semakan lompong) memandu adaptor produksi
  (`buatAdaptorPlaywright`) terhadap fixture MOEIS-serupa yang dihidangkan,
  merentas 3 kelas rekaan berturutan, sambil tetingkap diminimumkan —
  fingerprint proses/baris-perintah sebenar dan pengesahan ikatan loopback
  sebenar (`netstat`), bukan andaian — lihat
  `desktop/docs/PLAYWRIGHT-CDP-REPORT.md`. **Keserasian idMe SSO TIDAK
  disahkan.**
- **Mod dev portal sebenar (lalai MATI, `HADIR_DEV_REAL_PORTAL=1`).** Halaman
  log masuk idMe sebenar (`https://idme.moe.gov.my/login`) TELAH diperhatikan
  hidup di dalam WebView2 terbenam (baca sahaja — navigasi + pemerhatian DOM,
  tiada kredensial, tiada hantar): tajuk `Sistem Pengurusan IDentiti (idMe)`,
  borang dua-langkah (medan IC sahaja pada `/login`; kata laluan + frasa
  keselamatan hanya pada `/loginverification` selepas IC dihantar), tiada
  CAPTCHA/OTP pada halaman awal, sifar `new-window-requested`/popup SSO semasa
  muat, dan Playwright `connectOverCDP` berjaya membaca DOM (tajuk/URL/medan IC/
  butang "Daftar Masuk"). Dalam mod ini SAHAJA pengangkutan CDP loopback
  sementara yang sama dihidupkan (port rawak, profil terasing
  `webview2-dev-<port>`, fail port); mod normal kekal fixture + tiada
  `--remote-debugging-port` (disahkan semula oleh `verify-normal-mode.mjs`).
  **MASIH BELUM TERBUKTI:** rantaian penuh log masuk + redirect SSO melepasi
  halaman `/login` pertama (langkah `/loginverification`, redirect SSO ke hos
  lain, cabaran anti-bot/CAPTCHA yang dicetus semasa HANTAR) — tiada apa-apa
  dihantar, jadi log masuk kredensial sebenar di dalam aplikasi memerlukan
  manusia dan di luar skop. Bukti: `desktop/PROGRESS.md` (2026-09-22).
- **Kitaran automatik PEMBANGUN (lalai MATI, `HADIR_DEV_AUTO_KITARAN`).** Alat
  ujian hidup sahaja: bila truthy (`1`/`true`/`ya`/`yes`/`on`), SATU kitaran
  `CubaLoginAutoAtasPermintaanAsync()` dijalankan sekali pada penghujung
  `MainForm_Load` (selepas borang siap DAN WebView2 bersedia), supaya penguji
  tidak perlu klik menu dulang setiap kali. Kitaran itu ialah laluan pengeluaran
  yang SAMA — semua penjaga kekal: opt-in pemilik `LoginAuto`, siasatan deman,
  pagar penolakan kredensial, allowlist navigasi. MATI atau tidak ditetapkan =
  tingkah laku pengeluaran TIDAK berubah langsung: tiada pemasa, tiada kitaran
  automatik, tiada fail log. Keputusan env ialah fungsi TULEN
  (`DevAutoKitaran.PatutAutoKitaran`), diuji tanpa WinForms. Dalam mod ini
  SAHAJA satu log diagnostik ditulis (append) ke
  `%LOCALAPPDATA%/HadirDesktop/dev-kitaran.log`: satu baris setiap kitaran tamat
  (masa ISO + keadaan portal + sebab penuh kitaran + sebab aliran penghantaran)
  dan satu baris setiap langkah klaim/hantar/selesai (id tugasan, nama kelas,
  status). **Tiada kredensial, IC, token atau URL bertoken masuk ke log** — hanya
  teks keadaan/sebab yang memang sudah dipaparkan pada UI. Penulisan log
  gagal-tertutup (dibungkus try/catch): kegagalan I/O tidak pernah menjatuhkan
  aplikasi.
- **Versi + laluan kemas kini.** Nombor versi hidup di SATU tempat:
  `<Version>`/`<InformationalVersion>` dalam `HadirDesktop.csproj`.
  `VersiAplikasi.cs` membacanya semula daripada assembly
  (`AssemblyInformationalVersionAttribute`, jatuh balik ke `AssemblyVersion`,
  akhiran `+hash` dibuang) dan itulah satu-satunya sumber untuk tajuk tetingkap,
  nota dulang, baris versi dalam `%LOCALAPPDATA%/HadirDesktop/hadir-desktop.log`
  (satu baris setiap lancaran, penulis gagal-tertutup yang SAMA seperti log
  pembangun) dan bendera `--versi`. `--versi` diperiksa SEBELUM mutex satu-tika:
  ia mencetak versi ke stdout dan keluar 0 tanpa membuka tetingkap atau WebView2,
  jadi skrip boleh menyoal exe yang terpasang walaupun satu tika sedang berjalan.
  `update.ps1` + `hentikan-hadir.ps1` (fungsi kongsi, juga dipakai `setup.ps1`)
  menghentikan aplikasi dengan sopan sebelum menyalin (tutup tetingkap → tunggu
  20 s → `Stop-Process` → tunggu kunci fail dilepaskan), membaca versi sebelum,
  menyandar `HadirDesktop.exe.bak-<versi>`, menyalin, dan **mengesahkan SHA256**
  sumber lawan destinasi — tidak sepadan = sandaran dipulihkan + keluar
  bukan-sifar. Folder pemasangan BERKONGSI dengan fail data pengguna, jadi
  skrip itu menulis `HadirDesktop.exe` (dan sandarannya) SAHAJA: tiada padam
  rekursif, tiada nama fail data dalam mana-mana arahan, dan
  `%LOCALAPPDATA%/HADIR-MOEIS-Companion/` (termasuk `profil-pelayar/` yang
  memegang sesi MOEIS) tidak disentuh langsung. Panduan pengguna + rollback:
  `desktop/KEMASKINI.md`.
- **Kredensial idMe + log masuk automatik atas-permintaan (lalai MATI).**
  Shell kini berkongsi storan kredensial companion (`kredensial.dat`, DPAPI
  CurrentUser entropy null — format SERASI, disahkan baca-sahaja tanpa cetak
  nilai). Dialog "Akaun idMe" (medan bertopeng, "Simpan pada PC ini", "Padam
  kredensial", status pengguna tersamar) + aliran tulen `IdMeLoginFlow` +
  jambatan `WebView2IdMeLoginDom` memandu log masuk DALAM WebView2 terbenam
  dengan pintu keselamatan yang sama. Permintaan sahaja (`IdMeLoginDemand`):
  isyarat tugas HADIR menunggu ialah SATU-SATUNYA pencetus — baris kosong =
  sifar aktiviti portal/login, tiada timer/keepalive. Satu-satunya hentian
  ialah penjaga penolakan kredensial berturut-turut (lalai 5, boleh konfigurasi
  0=tiada henti, "Cuba lagi" sekali-klik); kegagalan sementara diulang tanpa
  had dengan backoff eksponen. Semua lalai MATI; tiada tulisan produksi, tiada
  profil/cookies/vault companion disentuh, tiada restart enjin.
- **Deman sebenar + kitaran hayat portal (lalai MATI).** Isyarat "ada kerja
  menunggu" TIDAK LAGI placeholder: `KerjaHariIni.cs` menyiasat `GET /api/kerja`
  melalui laluan loopback bernonce yang SAMA seperti status (`GET /` → nonce
  daripada alihan yang disenarai-benar; header `X-HADIR-Lokal` SAHAJA, TIADA
  `Origin` kerana `/api/kerja` bukan laluan `/api/lokal/*`; GET sahaja, tiada
  mutasi/rahsia/pasangan) dan mengira HANYA entri berstatus
  `menunggu`/`sedang_dihantar`/`tersimpan` yang bertarikh HARI INI. Tiga jawapan
  jujur: ada kerja / tiada kerja / deman TIDAK dapat dipastikan (enjin tiada,
  401/403, HTTP lain, badan tidak boleh dibaca, tamat masa) — jawapan ketiga
  tidak pernah dikira sebagai "ada kerja" dan tidak pernah dibuka portal.
  `PortalLifecycle.cs` memiliki SATU-SATUNYA keputusan membuka WebView2 ke
  portal, mengikut turutan: suis opt-in pemilik → siasatan deman → pagar
  penolakan kredensial → buka portal → log masuk. Keadaan yang dipaparkan
  (`Diam` / `AdaKerja` / `SedangLogin` / `PerluTindakanManusia` /
  `EnjinLuarTalian`) muncul dalam dulang sistem (baris keadaan + tooltip) dan
  jalur status; baris kosong = sifar navigasi, sifar probe sesi, sifar log masuk.
  "Cuba lagi" dalam dulang mengosongkan pagar penolakan dan menjalankan satu
  kitaran semula. Tunggal-penerbangan, tiada timer/keepalive.

  Semakan bebas (22 Sep 2026) menambah tiga pembetulan pada lapisan ini:
  (1) **buka portal yang GAGAL mesti dilaporkan sebagai kegagalan, bukan
  kejayaan senyap.** `OpenPortalDemandAsync` dahulunya `return
  Task.CompletedTask` apabila WebView2 belum siap atau allowlist menolak URL
  MOEIS — dan `PortalLifecycle` membaca pulangan biasa sebagai "portal sudah
  dibuka", lalu meneruskan ke peringkat log masuk terhadap halaman yang TIDAK
  pernah dinavigasi. Kerana kegagalan sementara dicuba semula TAK TERHINGGA,
  itu menjadi gelung tanpa hujung yang memegang slot tunggal-penerbangan
  selama hayat proses (dulang memaparkan "sedang-login") sambil mengetuk halaman
  yang salah. Kini kedua-dua penolakan MELONTAR, jadi kitaran melaporkan
  "Portal tidak dapat dibuka" dengan SIFAR kredensial ditaip — laluan yang
  memang sudah diuji. (2) **Kitaran boleh dibatalkan semasa penutupan sebenar:**
  `MainForm` memiliki `CancellationTokenSource` yang dibatalkan dalam
  `FormClosing` sebelum WebView2/HttpClient dilepaskan; tanpa itu gelung cubaan
  semula (dan penyerahan kredensialnya) terus berjalan selepas tetingkap
  dimusnahkan. Pembatalan diperhatikan ANTARA cubaan sahaja. (3) **Amplop ralat
  bukan jawapan:** `KiraKerjaBelumSiap` kini menolak badan yang `ok`-nya bukan
  boolean `true` (pulangan `null` = tidak dapat dipastikan), supaya amplop
  `ok:false` tidak boleh muncul sebagai "tiada kerja" yang mematikan isyarat
  deman secara senyap.
- **Opt-in penghantaran MOEIS milik pemilik (lalai MATI).** Togol
  `IdMeLoginTetapan.HantarAuto` (JSON bukan rahsia, gagal-tertutup: fail hilang
  atau rosak = MATI) menentukan sama ada sesi idMe yang sah diikuti tulisan
  sebenar ke MOEIS. Ia bebas daripada `LoginAuto`: HIDUP + `HantarAuto` MATI
  bermakna log masuk sahaja, tiada tulisan. Togol itu boleh dikawal dari DUA
  tempat yang membaca/menulis medan yang SAMA — menu dulang dan kotak semak
  dalam dialog "Akaun idMe". Peraturan yang mengikat kedua-duanya: penulis mesti
  `Baca()` dahulu dan mengubah HANYA medan yang ia kawal. (Ujian hidup 23 Sep
  2026 menemui pelanggaran peraturan itu: `Simpan()` dialog membina rekod tetapan
  baharu tanpa `HantarAuto`, jadi opt-in dimatikan senyap setiap kali pemilik
  menyimpan tetapan.)
- **Langkah "pilih aplikasi" (handoff SSO idMe → MOEIS) — WAJIB.** Log masuk
  idMe yang sah **tidak mencukupi**: sesi MOEIS hanya terbentuk apabila pautan
  aplikasi MOEIS pada `idme.moe.gov.my/list_aplikasi` diikuti (pautan itu membawa
  token SSO sekali guna). Peraturan ini sudah lama dipegang oleh companion
  (`companion/src/moeis/aplikasi.mjs`, bahagian 5.2) tetapi HILANG daripada shell
  desktop sehingga 23 Sep 2026: `WebView2IdMeLoginDom.SahkanSesiSelepasLogin()`
  terus menavigasi ke `moeispel.../tabguru`, MOEIS melencongkannya ke
  `idme.moe.gov.my/login`, dan aplikasi log masuk semula tanpa henti (ujian hidup
  `HADIR_DEV_REAL_PORTAL=1`, 3 pusingan). Pembetulan:
  `SahkanSesiSelepasLogin()` TIDAK LAGI menavigasi — ia hanya mengklasifikasi
  halaman yang sedang dibuka. Handoff menjadi langkah 13 yang EKSPLISIT dalam
  `IdMeLoginFlow`: bila sesi sah tetapi hos masih idMe, buka senarai aplikasi,
  pilih pautan MOEIS dengan pemilih TULEN `AplikasiIdMe.PilihPautanAplikasiMoeis`
  (port setia companion — label "Pengurusan Murid/MOEIS" ialah keutamaan, hos
  ialah kebenaran), ikut pautan itu, buka halaman kehadiran, BARU sahkan
  `#kehadiran`.
  Sempadan keselamatan kekal: handoff ialah **navigasi sahaja** (tiada kredensial
  ditaip, tiada kotak semak, tiada borang dihantar), `PautanMoeisSah` menuntut
  HTTPS + hos TEPAT + tiada userinfo + port lalai (jadi anchor yang berlabel
  "Pengurusan Murid" pada hos penyerang tidak boleh dipilih), dan adaptor
  mengesahkan semula href itu sendiri sebelum menavigasi. Handoff gagal =
  `handoff-moeis-gagal`, **SEMENTARA** (dicuba semula, bukan strike kredensial,
  bukan henti-untuk-manusia) dan **tidak pernah** diakui sebagai sesi sah.
  **BELUM DISAHKAN HIDUP:** DOM sebenar `list_aplikasi` belum pernah dibaca dari
  aplikasi ini — pemilih diambil daripada companion, bukan diterbit semula.
- **Handoff bergantung pada SESI, bukan pada URL penghubung.** Ujian hidup
  kedua (23 Sep 2026) menunjukkan langkah handoff memang berjalan — pautan
  aplikasi diikuti ke `https://moeispel.moe.gov.my/` — tetapi pelayan MOEIS
  membalas **302 ke `http://moeispel.moe.gov.my/`** (HTTP tidak selamat). Pagar
  navigasi menyekat lompatan itu, dan **itu betul; pagar TIDAK dilonggarkan.**
  Pepijatnya ialah syarat yang salah di sebelah kita: adaptor menuntut tetingkap
  utama KEKAL pada hos MOEIS sejurus selepas mengikut pautan, jadi sekatan yang
  betul dilaporkan sebagai handoff gagal. Kini: ikut pautan bertoken **sekali
  sahaja** (kuki sesi sudah ditetapkan oleh respons HTTPS yang pertama; token
  `token_idms` sekali guna tidak diulang), tunggu rantaian pengalihan mereda,
  kemudian navigasi TERUS ke `moeispel.../sahsiah/kehadiran/pkhem/tabguru` dan
  sahkan di situ. Peraturan itu ialah fungsi tulen
  `AplikasiIdMe.HandoffBerjaya(hosPenghubung, hosHalamanKehadiran)` yang
  mengabaikan hos penghubung SECARA SENGAJA. Kalau halaman kehadiran melencong
  balik ke hos idMe, barulah `handoff-moeis-gagal` (sementara). Bukti sesi MOEIS
  kekal `#kehadiran`, disahkan berasingan di hulu.
- **Sesi idMe yang SUDAH sah dikenali, bukan dianggap kegagalan.** Apabila profil
  WebView2 masih memegang sesi idMe yang sah, idMe melencongkan `/login` ke
  `/home`: borang IC tidak pernah muncul. Aliran dahulu membaca itu sebagai
  "medan IC tiada" (sementara) dan mengulang tanpa henti — gelung
  `/login → /home → /login → /home …` dalam ujian hidup 23 Sep 2026. Langkah 3b
  yang baharu (selepas semakan hos ketat, sebelum apa-apa ditaip) mengklasifikasi
  halaman permulaan dengan fungsi tulen `IdMeLoginSafety.TentukanKeadaanMasuk`
  daripada penanda OBJEKTIF sahaja (boolean; tiada nilai, tiada teks halaman):
  medan IC/kata laluan yang aktif dan kelihatan = **borang** (laluan menaip biasa,
  keutamaan pertama); anchor `a[href*="list_aplikasi"]` atau laluan `/home` /
  `/list_aplikasi` = **sesi sah** (langkah kredensial DILANGKAU sepenuhnya, terus
  ke handoff SSO); selain itu **tidak jelas** = sementara, seperti dahulu.
  Pagar tidak dilemahkan: sesi hanya boleh diakui pada HTTPS + hos idMe/MOEIS
  yang dibenarkan (tiada userinfo, port lalai), laluan "sesi sedia ada" menggunakan
  EKOR YANG SAMA seperti laluan menaip (`IdMeLoginFlow.SelepasSesiSahAsync`), jadi
  ia tidak boleh melangkau handoff mahupun bukti `#kehadiran`, dan **tiada apa-apa
  ditaip ke halaman yang tidak memintanya**.
- **Fail-safe CAPTCHA/OTP tidak boleh dicapai (dibaiki 23 Sep 2026).**
  `WebView2IdMeLoginDom.SemakCaptchaOtp()` menghurai hasil `ExecuteScriptAsync`
  terus sebagai objek JSON, sedangkan skrip memulangkan RENTETAN JS — jadi
  `ExecuteScriptAsync` memulangkan pengekodan JSON bagi rentetan itu, setiap
  halaman diklasifikasi `JsonValueKind.String`, dan fungsi itu sentiasa menjawab
  "tiada CAPTCHA". Cabaran OTP/2FA sebenar tidak akan pernah menghentikan aliran.
  Kini ia melalui `EvalStringAsync` seperti pengamatan sesi.
- **Allowlist navigasi dibina semasa MULA, bukan hanya selepas dialog.** Senarai
  origin ialah satu fungsi tulen (`MainForm.OriginsNavigasi`): origin mod dev
  portal-sebenar + origin idMe/MOEIS apabila (dan hanya apabila) `LoginAuto`
  HIDUP; loopback dibenarkan oleh `NavigationGuard` sendiri. Penjaga dibina
  dalam pembina `MainForm` DAN selepas dialog ditutup — tanpa binaan semasa mula,
  PC yang restart dengan `LoginAuto` sudah HIDUP disekat daripada origin
  idMe/MOEIS sampai seseorang membuka dialog (ujian hidup 23 Sep 2026).

## 5b. Ciri berbilang PC (pendaftaran peranti + kepimpinan berpagar, staged, OFF secara lalai)

Ciri ini membenarkan lebih daripada satu instalasi desktop bagi SATU akaun
idMe/sekolah, dengan tepat SATU peranti menjadi "pemimpin" (leader) pada bila-
bila masa. Ia dikawal sepenuhnya oleh Script Property `HADIR_PELBAGAI_PC`
(`'1'` = ON; ketiadaan/apa-apa nilai lain = OFF). **OFF secara lalai** —
tiada kod pengeluaran menggunakan ciri ini sehingga dinyalakan secara eksplisit,
dan status ini belum pernah dinyalakan dalam produksi.

Kontrak (sumber tunggal: `hadir-pc/kontrak.schema.json`, dicerminkan — bukan
diimport, kerana Apps Script tidak boleh mengimport ESM — dalam
`apps-script/HadirWeb.gs`, dan disemak semula oleh `hadir-pc/klien-peranti.mjs`
serta model C# tolerap `desktop/HadirDesktop/DeviceRegistryModels.cs`):

- **Rahsia setiap peranti**: dijana rawak oleh klien semasa pendaftaran;
  backend HANYA menyimpan `sha256(rahsia)`. Rahsia sekolah/enjin yang sedia ada
  tidak pernah didedahkan kepada laluan ini.
- **`akaun` ialah kunci kumpulan LEGAP**: ia ialah label pengelompokan sekolah
  yang dikonfigurasi oleh pentadbir, TIDAK PERNAH id akaun idMe sebenar, alamat
  e-mel, nombor IC guru, atau kata laluan. Kerana `pcStatusAwam` mendedahkan
  `akaun` secara awam, nilai itu MESTI kekal legap dan tidak boleh dipetakan
  balik kepada identiti/kredensial sebenar.
- **Kod pendaftaran sekali guna**: admin menerbitkan kod pendek berumur pendek
  (`hadirPcTerbitKodDaftar_`, TTL lalai 15 minit); kod itu ditandakan
  `digunakan` selepas satu pendaftaran berjaya dan tidak boleh diguna semula.
- **Tepat satu pemimpin bagi setiap akaun**: rekod `akaun:<akaun>` menyimpan
  `{ pemimpin, leaseMs, generasi }`. `klaimKepimpinan` menolak peranti yang
  belum berdaftar/`nyahaktif`; jika pemegang lease semasa masih sah ia
  ditolak; jika lease telah tamat DAN tiada tugasan aktif dipegang oleh
  pemimpin lama, pengambilalihan dibenarkan.
- **Pemagaran generasi monotonik (fencing)**: setiap tindakan mutasi (`degup`,
  `klaimKepimpinan`, dan get gerbang `sahkanPenulis`) mesti mengesahkan
  `generasi` penulis berbanding `generasi` semasa akaun/peranti. Penulis yang
  dipagar (contohnya bekas pemimpin selepas `nyahaktifPeranti` atau selepas
  pengambilalihan) ditolak — tiada tulisan menimpa terma yang lebih baharu.
- **Sekatan pengambilalihan tugasan aktif**: sebelum membenarkan
  pengambilalihan kepimpinan selepas lease tamat, backend menyemak
  `HADIR_MOEIS_JOB` bagi baris berstatus `sedang_dihantar`/`tersimpan` yang
  dimiliki pemimpin lama — jika wujud, pengambilalihan ditolak supaya kerja
  yang masih berjalan tidak diganggu.
- **Status awam legap**: `pcStatusAwam` (tiada gate ciri/pentadbir secara
  sengaja) hanya mendedahkan id peranti legap + cap masa nampak kali terakhir
  + keadaan lease + generasi bagi setiap akaun — TIDAK PERNAH serial, nama,
  akaun sebenar sebagai PII, atau rahsia. `senaraiPerantiAdmin` (admin sahaja,
  via `hadirSesi_`) turut tidak pernah mendedahkan `rahsiaHash`.
- **Klasifikasi keadaan** (`kelaskanKeadaanPeranti` dalam `hadir-pc/kontrak.mjs`,
  dicerminkan semula inline dalam `app.js`) membezakan `tidak_diketahui` /
  `luar_talian` / `luput` / `aktif` HANYA daripada cap masa berbanding sekarang
  — tiada dakwaan "PC online" yang direka-reka.

**Had jujur (tidak boleh diselesaikan oleh reka bentuk semasa):**
Apps Script TIDAK BOLEH memagar pelayar portal fizikal secara transaksional.
Pelayar lama yang masih aktif mesti berhenti menulis apabila kehilangan
kepimpinan atas inisiatifnya sendiri (backend tidak boleh memaksa proses luar
berhenti); tulisan yang sedang berjalan semasa kehilangan lease berada dalam
keadaan tidak pasti — model penyelesaian ialah "baca dahulu" (sahkan semula
generasi/pemimpin sebelum mempercayai tulisan berjaya), bukan transaksi
teragih; dan tiada jaminan sekatan rangkaian (network partition) dibuat atau
disiratkan di mana-mana dalam ciri ini.

### Status pelaksanaan hujung-ke-hujung (bukan probe sahaja)

Selepas audit hujung-ke-hujung (22 Sep 2026), hiris ini kini merangkumi laluan
lengkap — bukan lagi sekadar "probe baca sahaja" — tetapi **masih OFF secara
lalai dan tidak pernah dideploy / dihidupkan dalam produksi**:

- **DIBUANG daripada frontend pada 23/09/2026** — pane `Peranti PC` dan item
  menunya sudah tiada dalam `app.js`/`index.html` (ciri masih OFF lalai dan
  tidak pernah dideploy). Fungsi backend `pc*` kekal dan masih diuji di bawah.
  Rekod reka bentuk asal: **UI admin (`app.js` + `index.html`, pane
  `Peranti PC`)**: admin (dengan
  token sesi) boleh menerbitkan kod daftar sekali guna (`pcTerbitKodDaftar`)
  dan menyahaktifkan peranti aktif (`pcNyahaktifPeranti`). Setiap butang ialah
  aksi sebenar, bukannya placeholder; gated oleh `state.token`; Bahasa Melayu
  sepenuhnya.
- **Desktop (C#)**: `DevicePanel` ialah panel pendaftaran sebenar — daftar
  dengan kod + akaun + nama, simpan rahsia peranti melalui `DpapiDeviceSecretStore`
  (DPAPI `CurrentUser`, tiada fallback teks biasa; fail hilang/rosak → `null`),
  dan gelung degup `HeartbeatLoop` opt-in (mula/henti manual, bersiri, tiada
  gelung pendua, backoff eksponen bersempadan + set semula, tamat terminal
  bila peranti dinyahaktifkan/ciri dilumpuhkan, batal semasa `Dispose`).
  Pendaftaran menolak sebarang titik akhir yang bukan corak Apps Script
  (`HadirEndpointValidator`) — loopback dibenarkan untuk ujian tempatan sahaja.
- **Rahsia peranti tidak pernah** dipulangkan oleh mana-mana endpoint
  senarai/admin, tidak pernah dilog, dan tidak pernah disimpan sebagai teks
  biasa pada klien.
- **Kepimpinan hanya DILAPORKAN** (Pemimpin / Sedia-standby), bukan
  dilaksanakan: fasa ini TIDAK mengaktifkan sebarang penulis kehadiran. Pemagaran
  generasi/generation mesti akhirnya mengawal penulis sebenar pada fasa akan
  datang; penulis lama yang masih aktif kekal wujud bersebelahan buat sementara
  (lihat "Had jujur" di atas) dan belum disambung kepada gerbang ini.
- **UI kekal skop kelulusan manual**: pendaftaran memerlukan kod yang diterbitkan
  pentadbir; tiada laluan di mana pengguna memilih sendiri peranan/akaun
  istimewa atau dipetakan secara automatik daripada registry OS.
- **Ujian**: `tests/hadir-pc-vm.test.cjs` (29 kes) menjalankan fungsi SEBENAR
  `apps-script/HadirWeb.gs` dalam VM Node dengan Spreadsheet/Properties/Lock/
  Auth palsu — pendaftaran atomik, sekali guna, output degup bersanitasi,
  pemagaran generasi pengambilalihan serentak, flag OFF melumpuhkan semua
  tulisan, status awam tanpa penciptaan helaian, dan auth admin pada laluan.
  Ujian desktop (`dotnet test`, 99 kes) meliputi DPAPI (rahsia sintetik terpencil),
  gelung degup, dan integrasi HTTP palsu (daftar → simpan rahsia → degup →
  nyahaktif → tamat terminal) melalui loopback.

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

Versi aplikasi `HADIR v1.11.34`. Label kaki menu sengaja tidak menulis `PWA`,
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
- [x] **Dua opt-in tempatan companion + auto-mula berpengawal.** Autostart
  Windows (entri HKCU `HADIRMoeisCompanion`, keadaan dibaca daripada registry
  sebenar, bukan flag tetapan) dan auto-mula giliran selepas bind loopback
  (allowlist tarikh sekolah tepat, hujung minggu ditolak, kesegaran 15 minit,
  sempadan aktivasi+startup, tiada cubaan semula automatik, kelayakan diperiksa
  semula sebelum klaim dan sebelum mutasi MOEIS). Log masuk idMe automatik
  kini tersedia **opt-in** (vault kredensial DPAPI tempatan, suis `loginAuto`
  lalai MATI) tetapi **belum disahkan terhadap idMe hidup**. Backend
  memulangkan `diciptaEpochMs` dalam `moeisJobSenarai` untuk pengawal kesegaran
  (perlu deploy semula).
- [x] **Auto-mula teruskan tugasan hari ini selepas restart (polisi baharu,
  diluluskan pemilik).** Pengawal kelayakan (`nilaiKelayakanTugasan`) tidak
  lagi menolak tugasan `menunggu` yang dicipta SEBELUM enjin bermula (sempadan
  startup/aktivasi dibuang) atau lebih lama 15 minit (had umur dibuang);
  `sedang_dihantar` (yatim selepas crash/restart) kini turut diterima untuk
  pemulihan auto — melalui klaim atomik + lease (backend memutuskan pemilikan,
  lease aktif tidak dirampas) dan verifikasi-baca-dahulu (tidak hantar buta:
  padan => `berjaya` tanpa tulis, konflik => `gagal` berhenti untuk manusia).
  Kewarasan cap masa (sah, bukan masa depan), tarikh-hari-ini, allowlist
  kalendar, gerbang opt-in, klaim atomik + lease, kunci pelayar eksklusif dan
  Simpan&Sahkan + verifikasi muat-semula dikekalkan. `gagal`/`tersimpan`/
  `berjaya` kekal tidak dicuba semula secara auto.
- [x] **Pepijat aliran log masuk automatik dibetulkan: dua peringkat idMe
  (IC → /loginverification → frasa), status `kunci-tiada` baharu berasingan
  daripada `kunci-tidak-padan`, dan pemulihan giliran auto bounded**
  (`pasangPemulihanAutoMula`) apabila startup gagal tetapi suis masih ON.
  Butiran penuh dalam rekod perubahan 21 September 2026 (1.11.6) di bawah.

**Baki pengesahan:** satu simpanan kehadiran sebenar dan satu sync AKSI/SEMAK
masih perlu dijalankan oleh pengguna. Dicatat sebagai **isu #20 dalam hab** —
ujian itu akan mengubah data sekolah sebenar, jadi hanya pengguna boleh
memutuskan bila. Tambahan companion: backend HADIR **perlu di-deploy semula**
sebelum companion boleh menghidupkan giliran (lihat `apps-script/README.md`);
`uji-login`, log masuk manual idMe dan pengesanan sesi idMe **sudah
diimplementasi** (`companion/src/moeis/sesi.mjs`, `bin/uji-login.mjs`,
`bin/log-masuk-manual.mjs`) dan diuji terhadap double halaman, tetapi **belum
pernah dijalankan terhadap MOEIS/idMe hidup** — larangan kerja ini. Log masuk
idMe automatik opt-in (`loginAuto`, lalai MATI) juga **belum disahkan hidup**;
tanpa `loginAuto`, log masuk kekal MANUAL oleh manusia pada PC itu. Had penuh:
`companion/docs/PEMASANGAN.md`.

## 9. Rekod perubahan

| Tarikh | Versi | Perubahan | Data |
|---|---|---|---|
| 23 September 2026 | 1.11.34 (desktop 1.0.4) | **Shell desktop: positif palsu pengesahan penghantaran — muat semula tidak pernah ditunggu.** Kejadian sebenar 23/09: penghantaran kelas 1 BIJAK melaporkan `disahkan` ("Pengesahan selepas muat semula berjaya") dan backend menandakan tugasan itu `berjaya`, tetapi MOEIS kekal **28/28 hadir** — ketidakhadiran itu tidak pernah masuk. HADIR sendiri masih menyimpan 4 tidak hadir untuk kelas itu, dan kelas yang padan di MOEIS (19/23, 31/32, 18/21) ialah kerja manual guru kelas, bukan sistem ini. Punca: `WebView2DomMoeis.MuatSemula()` memanggil `Reload()` lalu kembali selepas satu `Delay` TETAP; dalam WebView2 DOM kekal dokumen LAMA sehingga dokumen baharu commit, jadi `SahkanSelepasMuatSemulaAsync` membaca semula tanda yang aplikasi SENDIRI baru tulis — lalu melaporkan kejayaan yang tidak wujud. Kerana laporan itu, backend mengunci tugasan sebagai `berjaya` dan ia tidak dicuba semula. Pembetulan: seam `IPelayarMuat` + `PengendaliMuat.TungguNavigasiSelesaiAsync` (fail baharu `PelayarMuat.cs`) melanggan `NavigationCompleted` SEBELUM `Reload()` dan menunggu kejayaan ATAU had masa; tiga klasifikasi jujur `HasilMuat.Selesai`/`Gagal`/`TamatMasa`, tiada kejayaan senyap. `MuatSemula()` kini memulangkan klasifikasi itu, dan `SahkanSelepasMuatSemulaAsync` memeriksanya DAHULU: jika bukan `Selesai`, halaman TIDAK dibaca semula dan keputusan ialah `tersimpan` — bukan `disahkan` — dengan sebab boleh baca (`muat-semula-gagal` / `muat-semula-tamat-masa`) dan `BilMurid` kekal null. Pagar navigasi 20 s sengaja jauh lebih longgar daripada 4 s lama: ia pagar sahaja (tunggu tamat serta-merta pada kejayaan), dan had yang ketat akan menyembunyikan kejayaan sebenar sebagai `tersimpan`. Jeda AJAX 1.5 s hanya selepas dokumen BAHARU commit. | Tiada data murid. 11 ujian baharu (8 seam + 3 penjaga aliran): 647 → **658 lulus / 0 gagal**, dijalankan sendiri dua kali termasuk selepas pembetulan pagar. Ujian stub dalam-memori sahaja — tiada CoreWebView2, pelayar, portal, rangkaian atau backend sebenar. Tertunggak: kesan masa sebenar pada portal hidup belum diukur |
| 23 September 2026 | 1.11.34 | **PWA admin: panel enjin lama dibuang — punca sebenar `Failed to fetch` ialah kad "Enjin PC (Companion)" yang menunggu enjin Node loopback `127.0.0.1:8747` yang tidak lagi berjalan.** Enjin PC kini aplikasi `desktop/` yang membaca backend terus dan tidak membuka sebarang port, jadi kad Companion (7 butang: Sambung PC, Uji sambungan, Uji log masuk, Mula/Hentikan giliran, Buka tetapan tempatan, Putuskan pasangan) dan butang "Jalankan sekarang (Companion)" pada setiap kad kelas sentiasa gagal. Semuanya dibuang daripada `index.html`/`app.js`, bersama pane `Peranti PC` dan item menunya (ciri berbilang PC masih OFF lalai dan tidak pernah dideploy; fungsi backend `pc*` kekal). Diganti dengan satu nota jujur dalam skrin Hantar ke MOEIS: "Tugasan diambil secara automatik oleh aplikasi HADIR Desktop pada PC sekolah dalam masa kira-kira 10 minit; HADIR tidak pernah bersambung terus ke MOEIS." Laluan yang digunakan kekal: kad kelas + Hantar (`moeisJobBuat`) + Lengkapkan. Penjaga regresi frontend DITERBALIKKAN, bukan dibuang — ujian kini mengesahkan KETIADAAN `companionPanggil`, `KUNCI_COMPANION_SESI`, port `8747`, `companionSambungBtn`/`companionPairDialog`/`companionPane`, dan seluruh UI `devicePc*`. Ujian versi kini invarian (semua aset mesti seragam dengan `versi` dalam `config.js`) dan bukan nombor mati yang perlu disunting setiap kali naik versi. | Tiada data murid. `node tests/hadir.test.cjs` exit 0; `node tests/hadir-pc-vm.test.cjs` 29/29 lulus; `node --check` lulus pada ketiga-tiga fail JS; halaman dimuatkan dalam pelayar sebenar dengan SIFAR ralat konsol pada lebar 375 px (tiada skrol mendatar, nota bergaya betul). Aset dinaikkan serentak: `?v=1.11.34` di keempat-empat fail HTML, `CACHE_VERSION = 'hadir-shell-v1.11.34-20260923-1'` dan APP_SHELL service worker |
| 23 September 2026 | 1.11.33 | **Shell desktop: versi satu-sumber-kebenaran + kemas kini yang selamat.** Sebelum ini tiada cara mengetahui binaan mana yang terpasang, dan `setup.ps1` menyalin exe TANPA menghentikan aplikasi — aplikasi yang hidup mengunci exe, jadi kemas kini gagal atau separuh tulis. Kini: `<Version>1.0.0</Version>` dalam `HadirDesktop.csproj` ialah satu-satunya nombor versi; `VersiAplikasi.cs` membacanya semula daripada assembly untuk tajuk tetingkap (`HADIR Desktop 1.0.0 — MOD DEMO`), nota dulang, satu baris log setiap lancaran (`hadir-desktop.log`), dan bendera `--versi` yang diperiksa SEBELUM mutex satu-tika (cetak + keluar 0; tiada tetingkap, tiada WebView2). `desktop/update.ps1` + `desktop/hentikan-hadir.ps1` (fungsi kongsi, dipakai `setup.ps1` juga): henti sopan → had masa 20 s → `Stop-Process` → tunggu kunci fail; baca versi sebelum; sandar `.bak-<versi>`; salin; **sahkan SHA256** (tidak sepadan = pulihkan sandaran + keluar bukan-sifar); lapor `sebelum -> selepas` (termasuk amaran "binaan TIDAK berubah"); lancar semula HANYA jika tadinya berjalan. **Dua pepijat ditemui semasa larian sebenar dan dibaiki:** (a) membaca versi menjalankan exe itu sendiri dan Windows melepaskan kunci imej LEWAT sedikit selepas proses mati — salinan seterusnya gagal `file is being used by another process`; kini ada pagar `Wait-ExeBolehTulis` antara bacaan versi dan salinan; (b) Windows PowerShell 5.1 membaca `.ps1` tanpa BOM sebagai ANSI, dan bait ketiga sengkang panjang (`—`) menjadi petikan pintar CP1252 yang MENAMATKAN rentetan berpetikan dua — skrip gagal huraian; ketiga-tiga skrip kini ber-BOM UTF-8 (dikunci oleh ujian). Panduan pengguna + rollback: `desktop/KEMASKINI.md`. | Tiada data murid. Folder pemasangan berkongsi dengan fail data pengguna, jadi skrip menulis `HadirDesktop.exe` + sandarannya SAHAJA — tiada padam rekursif, tiada nama fail data dalam arahan, `HADIR-MOEIS-Companion/profil-pelayar/` (sesi MOEIS) tidak disentuh. Disahkan dengan larian sebenar dalam `LOCALAPPDATA` sandbox berisi fail data umpan: fail umpan utuh, kod keluar 0 |
| 23 September 2026 | 1.11.32 | **Shell desktop: pepijat BLOK benang UI — penghantaran MOEIS gagal dalam &lt;1 s dengan `CoreWebView2 can only be accessed from the UI thread`.** Ujian hidup 11:59 (`dev-kitaran.log`): `PENGHANTARAN_MULA kelas=1 BIJAK` → `PENGHANTARAN_TAMAT status=gagal`. Log masuk berjaya penuh, jadi bukan rangkaian/sesi/pemilih DOM. Punca: `AliranPenghantaranMoeis` menunggu I/O backend dengan `ConfigureAwait(false)`, jadi kesinambungan yang memanggil adaptor berjalan di benang KOLAM, dan `WebView2DomMoeis` menyentuh `CoreWebView2` tanpa marshalling sendiri — membaca harta `WebView2.CoreWebView2` itu sendiri sudah melontar di luar benang UI. Pembetulan: seam `IMarshalUi` baharu (`desktop/HadirDesktop/MarshalUi.cs`) disuntik ke `WebView2DomMoeis`/`PenghantaranMoeisWebView2` sebagai parameter **WAJIB** (tiada lalai senyap), dan KETIGA-TIGA primitif yang menyentuh CoreWebView2 (`ExecuteScriptAsync`, `Navigate`, `Reload`) dibalut dengannya — jadi setiap kaedah seam, termasuk kaedah baharu kelak, mewarisi jaminan benang. `MainForm` membekalkan `MarshalUiBorang` yang hanya menghantar semula ke `PadaUiAsync` sedia ada. `ConfigureAwait(false)` TIDAK dibuang di mana-mana: sempadan modul yang menyentuh WebView2 menjamin benangnya sendiri. Pemilih DOM tidak disentuh; lalai MATI, allowlist navigasi, dan pagar kredensial kekal. | Tiada data murid. Ujian menggunakan stub `Func<CoreWebView2?>` terikat-benang — tiada WebView2, pelayar, portal atau backend sebenar. |
| 23 September 2026 | 1.11.31 | **Shell desktop: alat PEMBANGUN `HADIR_DEV_AUTO_KITARAN` (lalai MATI) — satu kitaran automatik + log diagnostik.** `desktop/HadirDesktop/DevAutoKitaran.cs` (baharu): keputusan env TULEN `PatutAutoKitaran` (truthy `1`/`true`/`ya`/`yes`/`on`; null/kosong/apa-apa lain = MATI), laluan log, pembentuk baris, dan penulis append gagal-tertutup. Bila HIDUP, `MainForm_Load` menjalankan SATU `CubaLoginAutoAtasPermintaanAsync()` selepas WebView2 bersedia (laluan pengeluaran yang sama; semua penjaga kekal) dan menulis `%LOCALAPPDATA%/HadirDesktop/dev-kitaran.log`: satu baris per kitaran (masa ISO + keadaan portal + sebab + hasil aliran penghantaran) + satu baris per langkah klaim/hantar/selesai. `AliranPenghantaranMoeis` kini melaporkan `KLAIM_OK`/`KLAIM_DITOLAK`/`KLAIM_RALAT`/`SELESAI_OK` melalui callback `log` pilihan yang sedia ada (id tugasan/kelas/status sahaja). MATI = tiada perubahan langsung pada pengeluaran. | Tiada data murid. Log pembangun hanya menerima teks keadaan/sebab yang sudah dipaparkan pada UI — tiada kredensial, IC, token atau URL bertoken. |
| 23 September 2026 | 1.11.30 | **Shell desktop: langkah "pilih aplikasi" (handoff SSO idMe → MOEIS) yang HILANG — pepijat BLOK daripada ujian hidup.** Log navigasi sebenar (`HADIR_DEV_REAL_PORTAL=1`): `/login` → `POST /daftarawam/semakanverification` → `/loginverification/...` (kredensial DITERIMA) → `moeispel.../tabguru` → `idme.moe.gov.my/login` → ulang tanpa henti. Punca: `WebView2IdMeLoginDom.SahkanSesiSelepasLogin()` menavigasi terus ke `IdMeLoginEndpoints.KehadiranUrl` sedangkan MOEIS belum ada sesi — sesi MOEIS hanya terbentuk selepas pautan aplikasi pada `idme.moe.gov.my/list_aplikasi` (token SSO sekali guna) diikuti. Peraturan ini sudah dipegang companion sejak awal (`companion/src/moeis/aplikasi.mjs`) tetapi tidak pernah diport ke shell. Pembetulan: (a) `SahkanSesiSelepasLogin()` TIDAK LAGI menavigasi — ia hanya mengklasifikasi halaman semasa, dengan tinjauan bersempadan sehingga halaman menjadi muktamad; (b) `desktop/HadirDesktop/AplikasiIdMe.cs` (baharu) ialah port TULEN `aplikasi.mjs`: `PautanMoeisSah` (HTTPS + hos TEPAT `moeispel.moe.gov.my` + tiada userinfo + port lalai), `PilihPautanAplikasiMoeis` (label "Pengurusan Murid/MOEIS" ialah KEUTAMAAN, hos ialah KEBENARAN), `HuraiSenarai` (huraian toleran, bentuk tidak dijangka = senarai kosong); (c) `IIdMeLoginDom` mendapat dua kaedah handoff — `SenaraiAplikasiIdMe()` dan `IkutPautanAplikasiMoeis(href)` — dan `IdMeLoginFlow` mendapat langkah 13 yang EKSPLISIT: sesi sah tetapi hos masih idMe → buka senarai aplikasi → pilih pautan MOEIS (tulen) → ikut → tunggu origin `moeispel` → buka halaman kehadiran → BARU sahkan `#kehadiran`. Handoff ialah **navigasi sahaja**: tiada kredensial ditaip, tiada kotak semak ditanda, tiada borang dihantar; adaptor mengesahkan semula href sebelum menavigasi (tidak bergantung pada pemanggil). Handoff gagal = `handoff-moeis-gagal` = **SEMENTARA** (dicuba semula tanpa had, BUKAN strike kredensial, BUKAN henti-untuk-manusia) dan tidak pernah diakui sebagai sesi sah — termasuk kes "handoff ok tetapi `#kehadiran` tidak dapat dibuktikan". Dibaiki sekali: `SemakCaptchaOtp()` menghurai hasil `ExecuteScriptAsync` sebagai objek sedangkan skrip memulangkan RENTETAN, jadi fail-safe OTP/2FA itu TIDAK PERNAH boleh menyala; kini melalui `EvalStringAsync`. Semua lalai MATI tidak disentuh | Ujian: `dotnet build desktop/HadirDesktop.sln` BERJAYA 0 ralat (1 amaran `CS8619` pada `MainForm.cs` — sudah wujud pada HEAD `bf31a19`); `dotnet test desktop/HadirDesktop.sln` **469 lulus / 0 gagal** (naik daripada 430; +39 — `AplikasiIdMePemilihTests` 29: URL senarai sama seperti companion, hos tepat diterima, http/subdomain-tipu/substring-dalam-query/substring-dalam-laluan/awalan/userinfo/port-bukan-lalai/relatif/`javascript:`/kosong/null DITOLAK, label diutamakan, tanpa label ambil MOEIS pertama, label "Pengurusan Murid" pada hos penyerang TIDAK dipilih, JSON rosak/bukan-array/tanpa href = senarai kosong; `HandoffAplikasiMoeisTests` 10: papan pemuka idMe → handoff TEPAT sekali + href MOEIS betul + sesi disahkan SEMULA selepas handoff, handoff tidak menaip apa-apa, sudah di MOEIS = SIFAR handoff, pautan tiada/dilencongkan/`#kehadiran` tidak terbukti/kekal di papan pemuka = `handoff-moeis-gagal` sementara dan BUKAN sesi sah, `KlasifikasiHasilLogin` mengesahkan Transient, mod tanpa frasa masih perlu handoff, kredensial ditolak = SIFAR handoff). Bukti ujian tidak lompong: dengan langkah 13 dilumpuhkan, 6 daripada 10 ujian aliran GAGAL; pembetulan dipulihkan selepas itu. **BELUM DISAHKAN HIDUP:** DOM sebenar `list_aplikasi` belum pernah dibaca dari aplikasi ini — pemilih diambil daripada companion, bukan diterbit semula; tiada portal sebenar disentuh dan tiada kredensial sebenar ditaip dalam mana-mana ujian |
| 23 September 2026 | 1.11.29 | **Shell desktop: kitaran KLAIM → HANTAR → SELESAI terus ke backend Apps Script (tanpa enjin Node; lalai MATI).** `desktop/HadirDesktop/HadirBackendClient.cs` (baharu) ialah port setia `companion/src/klien-hadir.mjs`: POST `{mode:'hadir', kaedah, argumen}` dengan `Content-Type: text/plain;charset=utf-8` + User-Agent PELAYAR (wajib — tanpanya Apps Script memulangkan alihan 404 berbadan bukan-JSON), balasan `{ok:true,hasil}`/`{ok:false,ralat}`. Kaedah: `moeisJobSenarai(['',rahsia])`, `moeisJobKlaim([id,pemilik,mod,rahsia])`, `moeisJobLepas`, `moeisJobSelesai`. Dasar cuba semula DIPORT TEPAT: hanya BACAAN (`senarai`) dicuba 3 kali; klaim/lepas/selesai TIDAK PERNAH diulang membuta (elak kesan sampingan berganda). `ModKlaim {Biasa,CubaSemula,Verifikasi}` memelihara ketiga-tiga nilai wayar (`false`/`true`/`'verifikasi'`) — perangkap `!!` yang disebut dalam fail rujukan tidak boleh berlaku dalam C#. Rekod murid DIBINA SEMULA daripada senarai putih `{id,nama,kategori,sebab}`, jadi `ic` daripada backend tiada tempat untuk mendarat. `desktop/HadirDesktop/RahsiaEnjinStore.cs` (baharu) membaca konfigurasi enjin SEDIA ADA: `rahsia.dat` (DPAPI CurrentUser, entropy `null` — corak SAMA seperti `KredensialIdMeStore`) untuk `rahsiaEnjin`, dan `tetapan.json` untuk `apiUrl` yang disahkan dengan port setia `sahkanApiUrl` (HTTPS, tiada userinfo, hos hanya `script.google.com`/`script.googleusercontent.com`) supaya rahsia enjin tidak boleh dilencongkan ke hos lain. GAGAL TERTUTUP sepenuhnya: fail tiada/rosak/rahsia kosong/apiUrl tidak sah = `null` = tiada penghantaran; `Status()` memulangkan BOOLEAN sahaja. `PemilikTugasanStore` memberi id pemilik klaim yang STABIL merentas restart (id peranti pendaftaran, jika tiada satu id rawak tempatan berterusan) — kerana backend membenarkan pemilik SAMA menuntut semula tugasan `sedang_dihantar` serta-merta manakala pemilik lain mesti menunggu lease 15 minit. `AliranPenghantaranMoeis` kini memiliki kitaran penuh apabila klien backend diberi: KLAIM DAHULU (atomik di backend) — klaim ditolak (`null`) = tugasan DILANGKAU, tidak pernah dihantar; tugasan dibina daripada MUATAN KLAIM (salinan yang backend baca semula di bawah kuncinya), bukan snapshot senarai; hanya keputusan DISAHKAN dilaporkan `berjaya`; `tersimpan` dilaporkan sebagai `tersimpan` dan TIDAK dilepaskan (pelepasan akan menjemput penghantaran semula tulisan yang mungkin sudah ada di MOEIS — peraturan sama seperti `giliran.mjs`); apa-apa kegagalan lain melepaskan lease; tugasan yang diklaim tetapi tidak boleh dibina secara jujur dilepaskan semula (tiada lease terkandas). Laporan `selesai` dicuba 3 kali (kemas kini status IDEMPOTEN — sebab sebenar `giliran.mjs` berbuat demikian selepas pepijat 18 Sep 2026), tulisan MOEIS tidak pernah diulang. Tiada id pemilik stabil = `tiada-pemilik` = tiada klaim dan tiada penghantaran. Lalai MATI dikekalkan; `LoginAuto` TIDAK disentuh; `MainForm` belum diwayarkan kepada backend (larian biasa = SIFAR trafik backend); `rahsiaEnjin`/`apiUrl` tidak pernah dilog, tidak pernah dalam mesej ralat, tidak pernah dalam URL | Ujian: `dotnet build desktop/HadirDesktop.sln` BERJAYA 0 ralat; `dotnet test desktop/HadirDesktop.sln --no-restore` **376 lulus / 0 gagal** (naik daripada 313; +63 — `HadirBackendClientTests` 24 terhadap backend palsu `HttpListener` dalam-proses: bentuk wayar/header/UA, argumen mengikut tertib, `'verifikasi'` kekal rentetan, senarai dicuba 3×, klaim/lepas/selesai TEPAT sekali, `hasil:null` = klaim ditolak bukan ralat, badan bukan-JSON = "Balasan bukan JSON (status 404)" tanpa menggemakan badan, `ic` digugurkan, rahsia tiada dalam laluan/query; `RahsiaEnjinStoreTests` 22: round-trip DPAPI dalam direktori temp terpencil, blob rosak/fail tiada/rahsia kosong/tetapan rosak = `null`, senarai putih hos `apiUrl`, status tidak pernah mendedahkan nilai, id pemilik stabil merentas "restart"; `KitaranPenghantaranTests` 17: tertib senarai→klaim→hantar→selesai, selesai HANYA selepas hantaran disahkan, gagal→lepas, adaptor melontar→lepas, `tersimpan`→lapor tanpa lepas, klaim ditolak/melontar→tiada hantaran langsung, senarai kosong→tiada klaim, tugasan siap/bukan hari ini→tiada klaim, laporan gagal 3× tanpa lepas, lalai MATI→backend tidak disentuh). Semua palsu: tiada backend/Apps Script sebenar dipanggil, tiada klaim atau penghantaran sebenar dijalankan, tiada rahsia enjin sebenar digunakan |
| 22 September 2026 | 1.11.28 | **Shell desktop: padanan murid HADIR mengikut NAMA (`data-namapelajar`) + kawalan konflik.** `desktop/HadirDesktop/PenghantaranMoeis.cs` kini menyelesaikan id halaman MOEIS untuk rekod HADIR yang hanya membawa `{nama,kategori,sebab}` tanpa `data-idpelajar`. Kelas tulen baharu `PadananNama` (port setia `normNama` dalam `companion/src/moeis/push.mjs`: huruf besar, apa-apa selain A-Z/ruang jadi ruang, ruang diruntuh; aksen TIDAK dijambat ke asas ASCII — gagal tertutup). `BarisMurid` kini membawa `Nama`; `SkripMoeis.BacaSenaraiMurid` memancar `nama` daripada `data-namapelajar` dan `WebView2DomMoeis` menghurainya. `PenghantaranMoeisFlow` membina indeks nama dan menyelesaikan setiap murid tugasan mengikut id ATAU nama ternormal: nama tidak padan = `nama-tidak-padan` (gagal jujur), satu nama padan >1 baris halaman = `nama-ambigu` (BERHENTI, tidak meneka — lebih ketat daripada companion yang senyap ambil baris terakhir). Selepas penyelesaian, semak KONFLIK seperti `push.mjs`: MOEIS sudah menanda murid tidak hadir yang TIADA dalam HADIR = `konflik`, berhenti tanpa simpan (desktop tiada `--paksa`, sentiasa henti keras). `PembinaTugasanPenghantaran` tidak lagi menolak murid tanpa id (terima nama sahaja). Lalai kekal MATI; `LoginAuto` TIDAK disentuh; kehadiran TIDAK PERNAH direka (senarai kosong = tiada penghantaran) | Ujian: `dotnet test` desktop **313 lulus / 0 gagal** (baharu: `PadananNama` normalisasi huruf besar/ruang/aksen; padanan nama tepat menyelesaikan id betul; nama tiada padanan gagal; nama ambigu berhenti; konflik berhenti tanpa simpan). Fixture DOM sahaja — tiada MOEIS/idMe hidup |
| 22 September 2026 | 1.11.27 | **Shell desktop: seam deman DIWAYARKAN ke enjin + kitaran hayat portal dengan 5 keadaan (lalai MATI).** Placeholder deman yang hardcoded `false` dibuang. `desktop/HadirDesktop/KerjaHariIni.cs` (baharu) menyiasat `GET /api/kerja` melalui laluan loopback BERSAMA yang sudah ada dalam `LoopbackEngineStatusSource`: handshake nonce `GET /` dengan senarai-benar alihan YANG SAMA (`TryGetNonceFromRedirect`; nonce tidak pernah dilog/ dikembalikan), kemudian header `X-HADIR-Lokal` SAHAJA — TANPA `Origin`, kerana `/api/kerja` bukan laluan `/api/lokal/*` jadi Origin UI loopback TIDAK dibenarkan untuknya (companion/src/server.mjs). GET sahaja: tiada mutasi, tiada rahsia enjin dibaca/ditulis, tiada pasangan. Kiraan: entri dikira HANYA jika `status` ialah tepat `menunggu`/`sedang_dihantar`/`tersimpan` DAN `tarikhIso` (10 aksara pertama) sama dengan tarikh tempatan PC hari ini. Tiga jawapan jujur, tiada tekaan: ada kerja / tiada kerja (enjin menjawab) / `EnjinBolehDicapai=false` (enjin tidak berjalan, 401/403, HTTP lain, badan tidak boleh dibaca, tamat masa) — keadaan ketiga TIDAK PERNAH dibaca sebagai "ada kerja" mahupun "tiada kerja". `desktop/HadirDesktop/PortalLifecycle.cs` (baharu) memutuskan SATU-SATUNYA soalan "perlukah WebView2 terbenam dibuka ke portal": 1) suis opt-in pemilik (lalai MATI — enjin tidak ditanya pun); 2) siasatan deman — luar talian/tidak boleh dibaca = `enjin-luar-talian` dengan SIFAR aktiviti portal, tiada tugasan hari ini = `diam` dengan SIFAR aktiviti (tiada navigasi, tiada probe sesi, tiada log masuk); 3) pagar penolakan kredensial yang sudah dicapai = `perlu-tindakan-manusia` SEBELUM portal disentuh; 4) hanya kemudian: `ada-kerja` → buka portal → `sedang-login` → pengurus log masuk (probe sesi, backoff tak terhingga, pagar penolakan) → berjaya = `ada-kerja`, perlu-manusia = `perlu-tindakan-manusia`, sementara = `ada-kerja` (dicuba semula). Tunggal-penerbangan, tiada timer/keepalive. Tray (`TrayHost`) memaparkan baris keadaan tanpa-aksi + item "Cuba lagi (kosongkan penolakan)"; tooltip dipotong kepada had 63 aksara WinForms supaya status panjang tidak boleh melontar. `IdMeLoginDemand.CubaAutoDenganPermintaanAsync()` (baharu) menggunakan deman yang sudah disiasat tanpa menanyakan enjin dua kali. **Pepijat ditemui oleh ujian dan dibaiki:** kitaran yang SEMUA await-nya selesai secara segerak tamat di dalam panggilan itu sendiri, jadi `finally` mengosongkan penanda tunggal-penerbangan SEBELUM pemanggil menyimpannya — meninggalkan tugasan lapuk yang menjadikan SETIAP kitaran/cubaan seterusnya no-op; dibaiki dengan `await Task.Yield()` sebelum sebarang kerja dalam `PortalLifecycle.TerasAsync` dan `IdMeLoginManager.TerasAsync` (+ ujian regresi). Semua lalai MATI; tiada commit. **Semakan bebas + pembetulan (sesi kedua):** tiga pepijat dilaporkan/dibaiki — (a) `MainForm.OpenPortalDemandAsync` melaporkan "portal dibuka" walaupun WebView2 belum siap atau allowlist menolak URL MOEIS, jadi kitaran masuk peringkat log masuk terhadap halaman yang tidak pernah dinavigasi dan (kerana kegagalan sementara dicuba TAK TERHINGGA) berputar tanpa hujung sambil memegang slot tunggal-penerbangan — kini kedua-dua penolakan MELONTAR, jadi kitaran melaporkan "Portal tidak dapat dibuka" dengan sifar kredensial ditaip; (b) kitaran tidak boleh dibatalkan, jadi gelung cubaan semula terus hidup selepas tetingkap dimusnahkan — kini `MainForm` memiliki `CancellationTokenSource` yang dibatalkan dalam `FormClosing` (pembatalan diperhatikan antara cubaan), dan `CubaLoginAutoAtasPermintaanAsync` menangkap `OperationCanceledException` kerana ia dipanggil dari pengendali dulang `async void`; (c) `KiraKerjaBelumSiap` menerima amplop ralat (`ok` bukan boolean `true`) sebagai "tiada kerja" — kini ia pulangan `null` (tidak dapat dipastikan). Semakan juga mengesahkan yang BAIK: nonce tidak pernah bocor ke label/log/`Sebab`; badan rosak/tamat masa/401/403/HTTP lain tidak pernah menjadi "ada kerja"; LoginAuto MATI, enjin luar talian dan baris kosong menghasilkan SIFAR aktiviti portal; tiada dua log masuk serentak (tunggal-penerbangan di bawah kunci, dan `await Task.Yield()` menjadikan pelaksanaan segerak mustahil). Had YANG DIKEKALKAN atas keputusan pemilik (bukan pepijat): tiada siling jam/hari, probe sesi tanpa bajet, cubaan semula sementara tanpa had + backoff, pagar penolakan kredensial lalai 5 / 0 = tidak berhenti, dan frasa keselamatan ialah langkah biasa (OTP/CAPTCHA fail-closed). TIDAK diubah (perlu keputusan pemilik): allowlist navigasi masih hanya membenarkan origin MOEIS/idMe dalam mod portal sebenar (`RealPortalDevMode`), jadi dengan LoginAuto HIDUP dalam binaan biasa portal disekat — kini ia gagal SELAMAT (tiada portal, tiada log masuk) dan bukan senyap | Ujian: `dotnet build desktop/HadirDesktop.sln` BERJAYA 0 amaran/0 ralat; `dotnet test desktop/HadirDesktop.sln --no-restore` **249 lulus / 0 gagal** (naik daripada 189; +60 — `PortalLifecycleTests` 23: baris kosong = sifar aktiviti portal/login/probe sesi, satu tugasan menunggu = TEPAT satu cubaan log masuk, enjin luar talian = `enjin-luar-talian` tanpa log masuk, pagar dicapai = berhenti sehingga `Cuba lagi` dan 0 = tidak pernah berhenti, tunggal-penerbangan, kitaran dibatalkan menyebar + tidak menyekat kitaran seterusnya, label/limit tooltip; `KerjaHariIniSourceTests` 36: peraturan kiraan tulen + integrasi HTTP sebenar terhadap pelayan ganti companion dalam-proses — laluan yang dipanggil, nonce dalam HEADER, TIADA Origin, 401/403/500, badan tidak boleh dibaca, amplop ralat `ok:false` dengan tugasan hari ini, tamat masa, enjin tiada, handshake gagal, pembatalan, nonce tidak bocor; +1 regresi pengurus). Semua palsu: tiada enjin/idMe/MOEIS hidup, tiada nilai kredensial, tiada pasangan, tiada rahsia enjin. BELUM disahkan hidup: `GET /api/kerja` belum pernah dijalankan terhadap enjin companion sebenar dari aplikasi ini, dan laluan buka-portal/log masuk belum pernah dijalankan hujung-ke-hujung |
| 22 September 2026 | 1.11.26 | **Shell desktop: storan kredensial idMe DPAPI berkongsi + log masuk automatik atas-permintaan dalam WebView2 terbenam (lalai MATI).** `desktop/HadirDesktop/KredensialIdMeStore.cs` membaca/menulis `kredensial.dat` YANG SAMA seperti companion (DPAPI CurrentUser, entropy `null`, JSON `{pengguna,kataLaluan,kunciKeselamatan}`) — disahkan dengan probe baca-sahaja .NET 8 (`ProtectedData.Unprotect(bytes, null, CurrentUser)`) ke atas blob companion sebenar: `boleh-nyahsulit=True`, `json-sah=True`, medan lengkap, pengguna tersamar `8***` — TANPA mencetak nilai (blob SERASI, tiada perlu taip semula). Dialog `IdMeSettingsDialog` ("Akaun idMe"): medan bertopeng (`UseSystemPasswordChar`), "Simpan pada PC ini", "Padam kredensial", baris status hanya pengguna tersamar (tidak pernah nilai). Aliran tulen `IdMeLoginFlow` (port setia `jalankanLoginAutoTeras`) + `WebView2IdMeLoginDom` (jambatan `ExecuteScriptAsync`) memandu log masuk DALAM WebView2 terbenam dengan pintu keselamatan sama (HTTPS+hos sebelum menaip, frasa/kotak semak, fail-safe CAPTCHA/OTP dengan perincian tersanitasi URL+elemen). **Polisi pemilik muktamad:** tiada siling sejam/harian — siasatan pra-penerbangan dan kegagalan sementara TIDAK memakan sebarang bajet, diulang SEMULA tanpa had dengan backoff eksponen (tidak pernah gelung ketat); SATU-SATUNYA hentian ialah `PenjagaPenolakanKredensial` (N penolakan kredensial EKSPLISIT berturut-turut, lalai 5, 0=tiada henti, konfigurasi dalam aplikasi, "Cuba lagi" sekali-klik). Permintaan sahaja (`IdMeLoginDemand`): isyarat tugas HADIR menunggu adalah SATU-SATUNYA pencetus — baris kosong = sifar aktiviti portal/login, tiada timer/keepalive. Semua lalai MATI. Tiada tulisan produksi, tiada profil/cookies/vault companion disentuh, tiada restart enjin, tiada commit (pintu induk) | Ujian: `dotnet test` desktop **189 lulus / 0 gagal** (baharu: stor kredensial round-trip/tersamar/rosak/tiada-teks-biasa/format-kongsi; keselamatan hos/frasa/sesi/klasifikasi; penjaga penolakan; pengurus backoff-transient/tanpa-bajet/5-penolakan/cuba-lagi; aliran berperingkat dengan DOM palsu — hos-salah tiada taip, frasa-tidak-padan abort, kotak-gagal tiada kata laluan, OTP berhenti; permintaan baris-kosong = sifar aktiviti). Fixture palsu sahaja — tiada idMe/MOEIS hidup |
| 22 September 2026 | 1.11.25 | **Auto-mula kini turut memulihkan tugasan `tersimpan` (dialog Simpan berjaya tetapi pengesahan tidak lengkap) secara automatik — baca-sahaja sahaja, tidak pernah hantar.** `nilaiKelayakanTugasan` (`src/auto-mula.mjs`) menerima status `tersimpan` (tarikh hari ini, allowlist kalendar, cap masa sah bukan masa depan; opt-in `autoMulaGiliran` tidak berubah); `berjaya`/`gagal` kekal tidak layak. `giliran.mjs` mengambil `tersimpan` HANYA dalam giliran automatik (`state.modMula === 'auto'`, bukan manual) dan mengklaimnya dengan mod read-only `'verifikasi'` (status KEKAL `tersimpan` di backend `moeisJobKlaim_`), kemudian jalankan HANYA mod `verifikasi` — TIDAK PERNAH mod `hantar`. Pemetaan keputusan dikongsi melalui fungsi tulen baharu `petakanKeputusanVerifikasiSahaja()` dengan `sahkanTugasan` (F3) supaya keputusan SAMA: `tidak-berubah` => `berjaya` tanpa tulis MOEIS; `konflik`/`perlu-hantar` => `gagal` dengan mesej tindakan manusia; kegagalan teknikal => lepas lease tanpa merekod hasil (boleh dicuba semula selepas restart). Guard satu-cubaan-setiap-proses (`pernahDiklaimAutomatik`) + klaim atomik/lease kekal. Tiada perubahan backend/status baharu; kelakuan `menunggu`/`sedang_dihantar` dan kitaran log masuk/batch tidak disentuh. UI tempatan (`render.mjs`), README dan PEMASANGAN dikemas kini pada senarai status layak | Ujian: `node --test companion/tests/*.test.mjs` 465 ujian — 463 lulus, 2 dilangkau, 0 gagal (5 ujian baharu: tersimpan layak/`berjaya`+`gagal` tidak/tarikh lain ditolak dalam `auto-mula.test.mjs`; tersimpan diklaim `'verifikasi'` sahaja + tiada hantar + padan=>berjaya + perlu-hantar=>gagal-manusia + teknikal=>lepas-lease-tanpa-rekod + manual-tidak-ambil-tersimpan dalam `giliran.test.mjs`); `node companion/tests/asap-e2e.mjs` 53/53; `node tests/hadir.test.cjs` 23/23, exit 0. Fake backends dan fixture tempatan sahaja — tiada MOEIS hidup, tiada kredensial/DPAPI/registry disentuh |
| 22 September 2026 | 1.11.24 | **Auto-mula teruskan tugasan hari ini selepas restart (polisi diluluskan pemilik).** Buang sempadan startup/aktivasi dan had umur 15 minit dalam `nilaiKelayakanTugasan` (`src/auto-mula.mjs`): tugasan `menunggu` hari ini yang dicipta SEBELUM enjin bermula (atau lebih lama 15 minit) kini layak, dan `sedang_dihantar` (yatim selepas crash/restart) turut diterima untuk pemulihan auto. Pemulihan `sedang_dihantar` TIDAK hantar buta — klaim atomik + lease (backend `moeisJobKlaim_`) menolak lease aktif, dan verifikasi-baca-dahulu (`mod:'verifikasi'`) memastikan padan => `berjaya` tanpa tulis (tiada pendua), konflik => `gagal` (berhenti, perlu penyesuaian manusia). `gagal`/`tersimpan`/`berjaya` kekal tidak dicuba semula secara auto. Kewarasan cap masa (sah, bukan masa depan), tarikh-hari-ini, allowlist kalendar, gerbang opt-in, klaim atomik + lease, kunci pelayar eksklusif dan Simpan&Sahkan + verifikasi muat-semula dikekalkan | Ujian: `node --test companion/tests/*.test.mjs` 461 ujian — 459 lulus, 2 dilangkau, 0 gagal (ujian kelayakan auto-mula ditulis semula: sebelum-start layak, >15 minit layak, sedang_dihantar layak, status selesai ditolak, kewarasan cap masa dikekalkan; + 2 ujian pemulihan auto `sedang_dihantar` baharu dalam `giliran.test.mjs`); `node companion/tests/asap-e2e.mjs` 53/53; `node tests/hadir.test.cjs` 23/23, exit 0. Tiada MOEIS/kredensial/data sebenar disentuh |
| 22 September 2026 | 1.11.23 | **Pembetulan pusingan semakan induk atas 1.11.22 — wiring probe sesi TIDAK PERNAH disambungkan (`sesiSahProbeLangsung` cache-dahulu lama kekal aktif walaupun `src/moeis/probe-sesi.mjs` cache-less sudah wujud) + gerbang giliran.sedangProses generik menyekat pemulihan paksa + regex penolakan kredensial masih membawa frasa generik.** Tiga jurang konkrit: (1) **Stale-positive cache tidak pernah dibetulkan.** `bin/hadir-companion.mjs` masih mewayarkan `sesiSahProbeLangsung` (baca cache TTL 30 minit DAHULU, hanya jatuh ke uji-login sebenar jika cache lapuk) sebagai `sesiSah` kepada `buatPengurusLoginAuto` — ini ialah cache STALE yang SAMA yang `cubaLoginAutoKerja(paksa:true)` (dipanggil selepas tugasan mendedahkan sesi-tamat) sudah tolak melalui laluan `paksa`; probe itu tidak pernah membetulkan sesi yang sebenarnya masih sah/tamat hidup. Digantikan dengan `buatProbeSesiLangsung` (`probe-sesi.mjs`, sudah wujud tetapi tidak disambungkan) — TIADA kebergantungan cache langsung (satu-satunya input ialah `probeLangsung`), setiap panggilan menjalankan siasatan SEBENAR; hasil `{status:'sesi-sah'}` sahaja memintas gerbang had kadar. (2) **Laluan pemulihan dalaman disekat oleh isyarat generik.** `pastikanProfilBebas()` (guard sedia ada di dalam `jalankanUjiLoginSebenar`) menyemak `giliran.status().sedangProses` — isyarat itu KEKAL benar sepanjang tempoh `bersihkanSelepasKitaran` (sengaja, sejak 1.11.18, elak race tugasan baharu), tetapi `giliran.cubaLoginAutoPaksa()` memanggil `tutupKumpulanPelayar()` (melepaskan kunci pelayar SEBENAR) SEBELUM `cubaLoginAutoKerja(paksa:true)` — jadi profil Edge SEBENARNYA bebas pada titik probe dipanggil, walaupun `sedangProses` masih melapor benar. Menyemak isyarat generik itu di gerbang probe akan menyekat pemulihan tepat pada masa ia paling diperlukan. **Pembetulan sempit (bukan pelonggaran umum):** fungsi BAHARU `jalankanUjiLoginIntern()` (tiada `pastikanProfilBebas()`) disuntik sebagai `probeLangsung` HANYA untuk `probeSesiLangsung`; gerbang KESELAMATAN sebenar (TOCTOU-selamat, `kunciPelayar.cubaKunci`) di dalam `jalankanAnakSkrip` kekal berkuat kuasa tanpa berubah — jika profil BENAR-BENAR sibuk atas sebab lain, panggilan masih ditolak dengan betul (`ralat.langkau`) dan dipetakan kepada `{ada:false, tangguh:true}` (tangguh, SIFAR belanjawan). Endpoint MANUSIA (`ujiLogin`/log-masuk-manual/startup/segar-cache/penjaga-sesi) KEKAL menggunakan `jalankanUjiLoginSebenar` — pengawal `sedangProses` sedia ada TIDAK disentuh untuk laluan itu. (3) **Regex penolakan kredensial masih generik.** `adaptorPlaywright.mjs` (v1.11.22 Gap 1) memadankan `log masuk (tidak sah|gagal)` dan `invalid (password|credentials|login)` — frasa GENERIK yang turut muncul bagi sesi tamat/ralat rangkaian/halaman separuh dimuatkan, berpotensi mengira strike palsu terhadap had 3-kegagalan-berturut. Set dipindah ke sumber TUNGGAL `SUMBER_REGEX_PENOLAKAN_KREDENSIAL` (`sesi.mjs`, rentetan — dihantar sebagai hujah `page.evaluate()` kerana konteks DOM tidak boleh mengimport modul Node) dan diketatkan kepada HANYA frasa yang secara literal menamakan kata laluan/no. KP sebagai salah/tidak betul (cth "kata laluan tidak betul", "no. kad pengenalan ... salah", "incorrect/invalid password"); frasa generik yang dibuang kini fail-safe ke `sesi-tidak-dapat-disahkan` (BUKAN strike). Heuristik ini KEKAL belum disahkan terhadap idMe hidup. Tiada log masuk hidup/kredensial/portal/pelayar sebenar disentuh; tiada perubahan pada siling 6/jam, 24/hari, semantik kejayaan atau selang polling | Ujian: `node --test companion/tests/*.test.mjs` 457 ujian — 455 lulus, 2 dilangkau, 0 gagal (naik daripada 446/444/2/0 — baharu: `probe-sesi.test.mjs` (5 ujian tulen: tiada kebergantungan cache secara struktur, stale-positive live-expired menang berbanding cache luar, live-valid, unknown/busy->tangguh, status lain->tiada tangguh); `login-auto.test.mjs` 3 ujian hujung-ke-hujung `buatProbeSesiLangsung`+`buatPengurusLoginAuto`+`buatHadKadarLogin` SEBENAR (live-valid SIFAR belanjawan, unknown/busy SIFAR belanjawan, stale-positive dielakkan — cache luar palsu mendakwa sesi-sah tetapi probe live melapor sesi-tamat, belanjawan digunakan sebenar); `sesi.test.mjs` 2 ujian regex (frasa eksplisit dipadankan, frasa generik "log masuk gagal"/"invalid login" TIDAK dipadankan); `giliran.test.mjs` 1 ujian timing (log masuk paksa menunggu `tutupKumpulanPelayar` SELESAI sepenuhnya sebelum dipanggil, walaupun `sedangProses()` giliran kekal benar sepanjang tempoh itu — pra-syarat yang membuktikan wiring lama tidak selamat dipercayai). `node companion/tests/asap-e2e.mjs` 53/53; `node tests/hadir.test.cjs` 23/23, exit 0. **Had jujur:** wiring gabungan sebenar (`pastikanProfilBebas`/`kunciPelayar`/`cubaLoginAutoPaksa` dalam `bin/hadir-companion.mjs`) tiada harness ujian bersepadu langsung (fail itu ialah punca komposisi CLI, tiada eksport dalaman) — keyakinan datang daripada gabungan ujian unit `kunci-pelayar.test.mjs` (semantik `sibuk()` tepat masa-nyata) + ujian timing `giliran.test.mjs` baharu + semakan kod manual; tiada pelayar/portal/kredensial sebenar disentuh dalam mana-mana ujian |
| 22 September 2026 | 1.11.22 | **Pembetulan 8 jurang klasifikasi/pemulihan had kadar selepas semakan induk atas 1.11.21 — 5 jurang teras + 3 pendawaian/pemulihan.** (1) `klasifikasiHasilLogin` dahulu masih mengira status/bukti `sesi-tamat`/`sesi-tidak-sah` sebagai `penolakan-kredensial` — tetapi `jalankanLoginAutoTeras` langkah 12 menghasilkan bukti itu untuk MANA-MANA kegagalan mengesahkan sesi selepas hantar (termasuk ralat rangkaian/halaman separuh dimuatkan), BUKAN bukti kredensial salah. Tambah isyarat POSITIF `kredensial-ditolak` (status baharu `tentukanStatusSelepasHantar`, `sesi.mjs`, parameter `kredensialDitolak`; dikesan `adaptorPlaywright.mjs` melalui regex ketat frasa penolakan EKSPLISIT sahaja — cth "kata laluan tidak betul/salah" — TIDAK PERNAH memadankan "sesi tamat"/ralat generik; **heuristik ini BELUM disahkan terhadap idMe hidup**). Susunan klasifikasi baharu: berjaya → `kredensial-ditolak` (SATU-SATUNYA strike) → bendera keras perlu-manusia (OTP/CAPTCHA/frasa/hos/kotak/medan, MENDAHULUI fallback supaya bukti bercampur tidak diturunkan taraf) → selebihnya `transient`. Langkah 12 kini tiga cabang jujur: sesi-sah / kredensial-ditolak (`perluManusia:true`) / `sesi-tidak-dapat-disahkan` (`perluManusia:false`, BUKAN strike, cuba semula bersempadan). (2) `laksana()` (pengurus cubaan) kini gagal-selamat terhadap `jalankan()` yang memulangkan null/rentetan/nilai bukan-objek (tanpa melontar) — sebelum ini menulis `.kelas` ke atas nilai sedemikian melontar TypeError tidak dikendalikan. (3) Had SEJAM (6) dan HARIAN (24) kini `transient` (`perluManusia:false`, kelas `transient`, medan `cubaSemula` retry-after — `tetingkap-jam`+`selepasMs` atau `hari-baharu`+`hariIso`) — SEBELUM ini kedua-duanya dilaporkan `perluManusia:true` sama seperti sekatan 3-strike KEKAL, jadi `pasangPemulihanAutoMula` berhenti KEKAL walaupun belanjawan sepatutnya pulih dengan sendirinya selepas tetingkap/hari gelongsor. Hanya `kegagalan-berturut` (3-strike) dan gagal tertutup (`rosak`/`gulung-balik`) kekal `perluManusia:true` (sekatan keselamatan kekal). `had-login.mjs` `statusRingkas()` kini mendedahkan `jenisSekat` + `cubaSemulaSelepasMs`/`cubaSemulaHariIso` dikira daripada snapshot yang SAMA seperti `bolehCuba()` — tiada perubahan pada belanjawan 6/jam, 24/hari atau semantik `bolehCuba()`. (4) `buatPengurusLoginAuto` menerima kebergantungan opsyenal baharu `sesiSah` (probe langsung `() => {ada}`) disemak SEBELUM gerbang had kadar — permintaan Hantar yang tiba selepas sesi sebenarnya sudah pulih boleh guna-semula sesi itu tanpa disekat oleh belanjawan habis, dan TANPA menggunakan sebarang belanjawan (disambungkan kepada `sesiSahProbeLangsung` baharu dalam `bin/hadir-companion.mjs` — cache DAHULU, `jalankanUjiLoginSebenar` (uji-login SEBENAR, baca-sahaja) apabila cache lapuk/tidak sah, `{ada:false}` fail-selamat pada profil-sibuk/ralat; BUKAN `sesiKerjaDisahkan` cache-sahaja — pembetulan sempit selepas semakan induk mendapati wiring asal 1.11.22 menyambung semula cache STALE yang sama yang `cubaLoginAutoKerja` sudah tolak, jadi probe itu tidak pernah membetulkan sesi yang sebenarnya masih sah hidup — hanya untuk rejim `hadKadarLogin`). (5) Tindakan pemulihan PEMILIK TEMPATAN baharu `tetapkanSemulaLatch()` (`had-login.mjs`) mengosongkan HANYA latch `kegagalanBerturut`, KEKALKAN tetingkap sejam + siling harian (berbeza daripada `catatKejayaan()`); disambungkan melalui endpoint baharu `POST /api/lokal/had-kadar-tetapkan-semula` (nonce+loopback, POST sahaja, wajib `{sah:true}` eksplisit — 400 tanpanya, tiada tindakan senyap) dan butang UI tempatan (kelihatan HANYA semasa `jenisSekat==='kegagalan-berturut'`, gerbang `confirm()`). TIADA migrasi/tetapan-semula automatik pada bila-bila baca — nilai legasi >had kekal dilaporkan jujur sehingga tindakan ini dipanggil secara eksplisit; tindakan TIDAK memberi belanjawan tambahan. Tiada perubahan pada siling 6/jam, 24/hari Malaysia atau semantik kejayaan; tiada log masuk hidup/kredensial/portal/pelayar sebenar disentuh — semua ujian guna storan/adapter/konteks palsu | Ujian: `node --test companion/tests/*.test.mjs` 446 ujian — 444 lulus, 2 dilangkau, 0 gagal (naik daripada 414/412/2/0 — baharu: `kredensialDitolak` (3 ujian `sesi.test.mjs`), klasifikasi susunan penuh + bendera-keras-mendahului-transient + null/undefined (`login-auto.test.mjs`), 2 ujian hasil malformed/null daripada `jalankan()`, 5 ujian `jenisSekat` (tetingkap-jam/siling-harian/kegagalan-berturut/rosak/gulung-balik) dalam `had-login.test.mjs`, 3 ujian `tetapkanSemulaLatch` (mengekalkan kiraan, keadaan legasi, tiada migrasi senyap), 4 ujian pengurus `hadKadar` had sejam/harian/3-strike/rosak menghasilkan `cubaSemula`/`perluManusia` yang betul, 3 ujian probe `sesiSah` (memintas gerbang tanpa belanjawan, gerbang biasa apabila tiada sesi, diabaikan tanpa `hadKadar`), 1 ujian WIRING pemulihan latch → aliran normal bersempadan, 3 ujian `pasangPemulihanAutoMula` (had-kadar/had-harian tidak berhenti, had-kegagalan-berturut berhenti), 5 ujian endpoint `/api/lokal/had-kadar-tetapkan-semula` (`had-kadar-reset-lokal.test.mjs` baharu — pengesahan wajib, POST sahaja, nonce wajib, remote ditolak); 2 ujian sedia ada dikemas kini (klasifikasi `sesi-tamat`→transient bukan penolakan-kredensial, had-sejam `perluManusia:false` bukan `true`) selaras semantik baharu yang BETUL. `node companion/tests/asap-e2e.mjs` 53/53; `node tests/hadir.test.cjs` 23/23, exit 0. **Had fixture-vs-hidup dinyatakan jujur:** heuristik regex penolakan kredensial `adaptorPlaywright.mjs` BELUM disahkan terhadap idMe hidup (frasa sebenar mungkin berbeza — kesan fail-selamat: penolakan sebenar yang tidak dipadankan jatuh ke `sesi-tidak-dapat-disahkan`, BUKAN strike, bukan sebaliknya); SEMUA ujian menggunakan storan/adapter/konteks dalam ingatan, tiada log masuk/kredensial/portal sebenar disentuh |
| 22 September 2026 | 1.11.21 | **Pembetulan latch salah "had-kegagalan-berturut" (4>3) semakan Astra: tiada single-flight pada `cubaAuto` + setiap kegagalan (termasuk ralat sementara) dikira strike kredensial.** Punca dasar BERGANDA: (1) `buatPengurusLoginAuto.cubaAuto()` menyemak `hadKadar.bolehCuba()` di ATAS tetapi TIDAK mengunci pelaksanaan — dua panggilan serentak (kitaran giliran lambat bertindih dengan setInterval seterusnya, kerana `jalankanSatuKitaran` menunggu `cubaLoginAutoKerja` SEBELUM menetapkan `sedangProses=true`) boleh kedua-duanya lulus `bolehCuba()` pada nilai `kegagalanBerturut` yang sama dan baca-ubah-tulis limiter tidak-atomik secara bebas, menolak pembilang MELEBIHI had 3 (diperhatikan hidup: 4>3, `hasilTerakhir:'had-kegagalan-berturut', diblok:true` kekal selama-lamanya). (2) `cubaAuto()` mengira SETIAP hasil bukan-kejayaan (termasuk ralat rangkaian/teknikal `status:'gagal'`/`bukti:['ralat-teknikal']`, dan `langkau` profil-sibuk yang dilontar) sebagai `hadKadar.catatKegagalan()` — ralat sementara TIDAK sepatutnya melatch sekatan akaun 3-strike. **Pembetulan:** (a) pengurus log masuk kini tunggal-penerbangan (`dalamPenerbangan`) — panggilan `cubaAuto()` serentak berkongsi SATU pelaksanaan (`laksana()`), tiada lagi baca-ubah-tulis limiter berganda; (b) pengelas tulen baharu `klasifikasiHasilLogin()` (`login-auto.mjs`) mengelaskan setiap hasil kepada `berjaya`/`penolakan-kredensial`/`perlu-manusia`/`transient` — HANYA `penolakan-kredensial` (bukti `sesi-tidak-sah` atau status `sesi-tamat`, penolakan idMe eksplisit) dikira strike; `transient` (ralat teknikal/rangkaian/`langkau`) dan `perlu-manusia` (OTP/CAPTCHA/frasa/kotak) TIDAK menambah `kegagalanBerturut` — ralat sementara kini cuba semula pada kitaran seterusnya dengan backoff sedia ada, tiada latch kekal; (c) `langkau`/lontaran teknikal dalam `laksana()` kini ditangkap try/catch dan diklasifikasikan sebagai `transient`, tidak lagi merebak sebagai pengecualian tidak dikendali. (d) `laksana()` kini MENORMALKAN `hasil.perluManusia` mengikut kelas — `transient`/`berjaya` = false (pemulihan auto-mula dan cubaan-semula tugasan TIDAK berhenti), `penolakan-kredensial`/`perlu-manusia` = true — menutup celah di mana ralat sementara (`status:'gagal'` dengan `perluManusia:true` daripada pembungkus `jalankanLoginAuto`) masih menghentikan gelung pemulihan kerana hanya `perluManusia` yang disemak. **Pertahanan-mendalam:** `catatKegagalan()` (`had-login.mjs`) kini mengunci `kegagalanBerturut` pada had (`Math.min(...+1, hadKegagalanBerturut)`) supaya pembilang TIDAK PERNAH boleh melebihi 3 walaupun dipanggil terus tanpa gerbang `bolehCuba()`. Keadaan legasi tersimpan >3 (cth 4) KEKAL dikekalkan/diblok seperti sedia ada dan dipulihkan HANYA melalui log masuk manual berjaya (`catatKejayaan()`, yang mengekalkan `bilHariIni`) — tiada migrasi/tetapan-semula automatik. Tiada perubahan pada siling 6/jam atau 24/hari Malaysia, tiada perubahan semantik kejayaan, tiada perubahan selang polling, tiada log masuk hidup/kredensial/pelayar sebenar disentuh — semua ujian guna storan/adapter palsu | Ujian: `node --test companion/tests/*.test.mjs` 417 ujian — 415 lulus, 2 dilangkau, 0 gagal (naik daripada 405/403/2/0 — 12 ujian baharu: `klasifikasiHasilLogin` mengelaskan 4 kategori dengan betul, kegagalan transient berulang 5x tidak melatch (`kegagalanBerturut===0`, `bolehCuba()===true`), HANYA penolakan kredensial dikira strike (3 kali disekat, tidak boleh jadi 4), single-flight dua panggilan serentak berkongsi satu pelaksanaan (`jalankan` dipanggil tepat sekali), sesi cache sah -> tiada cubaan kredensial walaupun hadKadar disekat 3-strike, ujian WIRING kebergantungan sebenar (`buatHadKadarLogin`+`buatPengurusLoginAuto`+`jalankanLoginAuto` sebenar), `catatKegagalan` dipanggil terus 10x dikunci pada had, keadaan legasi kegagalanBerturut:4 dikekalkan+blok+pulih bersih kekalkan bilHariIni, kumpulan pelayar ditutup SEBELUM log masuk paksa, hasil transient dinormalkan kepada perluManusia:false (pemulihan tidak berhenti), penolakan kredensial kekal perluManusia:true, pemulihan auto-mula TIDAK berhenti pada log masuk transient; 2 ujian sedia ada dikemaskini fixturenya daripada `status:'perlu-manusia'` generik kepada penolakan kredensial eksplisit `bukti:['sesi-tidak-sah']` selaras klasifikasi baharu); `node companion/tests/asap-e2e.mjs` 53/53; `node tests/hadir.test.cjs` 23/23, exit 0. Tiada log masuk hidup/kredensial/rangkaian/registry/pelayar sebenar disentuh; laluan sejuk dan pengawal keselamatan (frasa, HTTPS+hos, CAPTCHA/OTP, kotak semak) kekal tidak berubah |
| 21 September 2026 | 1.11.20 | **Pengetatan penutupan — PUSINGAN KETIGA semakan Astra (handshake pembersihan bersih / ack `BERSIH:`).** Sebelum ini handler `exit` membuang handle `anak` (set null) serta-merta apabila `ditutup`/`diracun`, dan `tutup()` menganggap sebarang keluar dalam `graceMs` (termasuk kod bukan sifar / terpaksa dibunuh) sebagai bersih — pengurus melepaskan kunci walaupun pembunuhan pokok keturunan sebenarnya GAGAL. Kini: (1) handler `exit` hanya REKOD keluar (`kod` + `_sudahKeluar`), tidak pernah membuang handle; (2) penutupan bersih memerlukan ack `BERSIH:` daripada pekerja (dipancarkan oleh pelari NDJSON HANYA selepas `context.close` selesai) DAN keluar kod 0 — tanpa kedua-duanya, `tutup()` bunuh pokok + kill (melalui satu janji pembersihan DIKONGSI antara racun dan tutup, jadi kill/pembunuhan pokok berlaku TEPAT SEKALI, tiada guna-semula PID akar) dan MENOLAK jika tidak disahkan; (3) panggilan balik bunuh pokok DIBATASI MASA. Semantik sedia ada dikekalkan: tulisan separuh/tidak diketahui TIDAK PERNAH diulang secara automatik | Ujian: `node --test companion/tests/*.test.mjs` 405 ujian — 403 lulus, 2 dilangkau, 0 gagal (7 ujian baharu dispatcher: ack BERSIH + keluar 0 lepas handle tanpa kill; kill berjaya tepat sekali; keluar bukan sifar semasa grace tidak dikira bersih; tamat masa + tutup serentak dengan bunuh pokok lewat ditolak; EPIPE + bunuh pokok gagal → tutup menolak; kejatuhan semula jadi + bunuh pokok gagal → tutup menolak; keluar lewat pendua ialah no-op); `node companion/tests/asap-e2e.mjs` 53/53; `node tests/hadir.test.cjs` 23/23, exit 0. Tiada log masuk hidup/kredensial/rangkaian/registry/pelayar sebenar disentuh; laluan sejuk dan pengawal keselamatan kekal tidak berubah |
| 21 September 2026 | 1.11.19 | **Pembetulan PUSINGAN KEDUA semakan Astra ke atas 1.11.18 — tuntutan semua-penyekat-selesai sebelum ini TIDAK tepat; tujuh penyekat konkrit + refaktor pelari NDJSON dibaiki.** (1) Bunuh pokok (taskkill /T) kini DAHULU sebelum kill langsung (sebelum ini kill dahulu → keturunan Edge/Playwright boleh yatim sebelum pokok ditemui). (2) `tutup()` MENOLAK (gagal-tertutup) jika pembersihan tidak dapat disahkan — akar mesti terbukti keluar DAN bunuh pokok mesti berjaya (jika disuntik); kejatuhan semula jadi (crash) mengekalkan handle supaya `tutup()` boleh cuba bunuh pokok keturunan yatim. (3) Keadaan RACUN TERMINAL — keluar/putus/EPIPE/tamat-masa/limpaan = tiada spawn automatik baharu; hantar seterusnya `tidakDiketahui:true`. (4) Satu anak ditangkap (`a`) dalam SEMUA handler (bukan `anak` boleh-ubah) — keluar LEWAT pekerja lama diabaikan. (5) Ralat stdin (EPIPE) kini MENAMATKAN pekerja (bukan buang handle) supaya profil tidak kekal dipegang. (6) stderr TIDAK PERNAH dilog mentah — hanya kod allowlist (BERHENTI, KUMPULAN_PELAYAR_*) + kiraan bait (penapis aksara kawalan asal TIDAK menghapus PII). (7) stdout bersempadan 1 MiB — limpaan protokol = gagal tertutup. Pelari NDJSON difaktorkan ke `src/moeis/pekerja-ndjson.mjs` diimport oleh `bin/pekerja-batch.mjs` produksi DAN fixture ujian (ujian span sebenar kini menguji pelari produksi, bukan salinan palsu) + ujian smoke bin `tests/pekerja-batch-bin.test.mjs` (EOF → tutup → exit 0, tanpa pelayar/portal). `bunuhPokokProses` async yang ditolak dinormalkan kepada false (tidak membocorkan ralat dalaman) | Ujian: `node --test companion/tests/*.test.mjs` 398 ujian — 396 lulus, 2 dilangkau, 0 gagal (baharu: `pekerja-ndjson.test.mjs` 6, `pekerja-batch-bin.test.mjs` 2, `dispatcher-kumpulan.test.mjs` diperluas kepada 19 — susunan bunuh-pokok-dahulu, tolak pembersihan-tidak-sah, racun terminal, keluar lewat, EPIPE-menamatkan, stderr-tiada-rahsia, limpaan stdout); `node companion/tests/asap-e2e.mjs` 53/53; `node tests/hadir.test.cjs` 23/23, exit 0. Tiada log masuk hidup/kredensial/rangkaian/registry/pelayar sebenar disentuh; laluan sejuk dan pengawal keselamatan kekal tidak berubah |
| 21 September 2026 | 1.11.18 | **Kumpulan pelayar (Option 2) + pengetatan hayat/penutupan selepas semakan bebas Astra (enam penyekat).** Guna-semula pelayar Edge per-kitaran giliran: `src/moeis/kumpulan-pelayar.mjs` (glu kunci+dispatcher+laluan sejuk), `src/moeis/dispatcher-kumpulan.mjs` (IPC NDJSON, spawn berterusan), `src/moeis/pekerja-batch.mjs` (satu konteks dikongsi, halaman+adapter baharu per tugasan), `bin/pekerja-batch.mjs` (pekerja anak berterusan). Enam penyekat Astra dibaiki: (1) stderr pekerja kini disalirkan ke bufer bersempadan+disanitasi (elak deadlock paip, tiada PII mentah); (2) masa tamat permintaan bersempadan + ralat stdin (EPIPE) tidak ditelan → penyelesaian jujur `tidakDiketahui`, tiada main-semula membuta; (3) `tutup()` membersihkan pokok proses MILIK pekerja (`bunuhPokokProses` taskkill `/T /F`, disuntik — tidak pernah Edge peribadi); (4) `sedangProses` kekal benar sepanjang penutupan (elak race tugasan baharu semasa tutup); (5) mesin keadaan `ditutup|dibuka|menutup|gagal` — buatDispatcher melontar melepas kunci, d.tutup gagal mengekalkan kunci (gagal-tertutup); (6) `giliran.berhenti()` + pengendali SIGINT/SIGTERM (tiada tugasan selepas berhenti, tanpa abort pertengahan-tulis). Ujian IPC span SEBENAR baharu (spawn node sebenar + kebergantungan pelayar palsu tempatan; mod fixture `--mod-*` sahaja, lalai produksi tidak berubah) | Ujian: `node --test companion/tests/*.test.mjs` 383 ujian — 381 lulus, 2 dilangkau, 0 gagal (naik daripada 366/364/2/0 — 17 ujian baharu: dispatcher stderr/EPIPE/tamat-masa/tiada-main-semula/bunuh-pokok; kumpulan-pelayar buatDispatcher-lontar/tutup-gagal/tutup-serentak; giliran sedangProses-tetap-benar/berhenti/gagal-tutup-direkod; + 7 ujian IPC span sebenar); `node companion/tests/asap-e2e.mjs` 53/53; `node tests/hadir.test.cjs` 23/23, exit 0. Tiada log masuk hidup/kredensial sebenar/rangkaian/registry disentuh; laluan sejuk lama dan pengawal keselamatan kekal tidak berubah |
| 21 September 2026 | 1.11.17 | **Pembetulan selepas semakan bebas keluarga model berbeza (DeepSeek) atas 1.11.16 — satu pepijat TERUK yang menjadikan jaminan keselamatan palsu, ditambah tiga pengetatan.** (1) TERUK: `bin/hadir-companion.mjs` menyambung limiter melalui `bacaJson`, yang MENELAN ralat `JSON.parse` dan memulangkan `null` — jadi fail `had-login.json` yang ROSAK disalah anggap sebagai "larian pertama" dan siling kadar **diset semula secara senyap**, walaupun kontrak `had-login.mjs` menuntut `baca` MELONTAR untuk menandakan `rosak`. Pembetulan: pembaca baharu `bacaJsonKetat` (`src/tetapan.mjs`) — `null` HANYA apabila fail tiada (ENOENT), MELONTAR pada fail yang ada tetapi rosak. (2) Laluan pemulihan `catatKejayaan()` hanya wujud pada laluan HTTP; perintah CLI `hadir-companion log-masuk-manual` kini juga mengosongkan limiter selepas log masuk manual berjaya, supaya blok 3-kegagalan/korup tidak boleh kekal selama-lamanya. (3) Sempadan hari siling harian ditukar daripada hari UTC kepada hari kalendar MALAYSIA (UTC+8): sebelum ini siling 24 "diset semula" pada 08:00 pagi waktu tempatan, iaitu tengah hari persekolahan. (4) `statusRingkas()` tidak lagi melaporkan angka TEPU rekaan (24/6/3) apabila keadaan tidak boleh dibaca — pembilang dilaporkan `null` dan UI memaparkan `?`, dengan `sebab` menjelaskan keadaan sebenar (UI tidak boleh menunjukkan angka palsu seolah-olah ia diukur). Tiada pengawal lain disentuh: OTP/CAPTCHA kekal berhenti, pengawal HTTPS+hos kekal sebelum menaip, suis kekal local-only dan lalai MATI | Ujian: `node --test companion/tests/*.test.mjs` 337 ujian — 335 lulus, 2 dilangkau, 0 gagal (3 ujian baharu dalam `had-login.test.mjs`: fail rosak SEBENAR melalui `bacaJsonKetat` mesti BLOK + pembilang `null`, fail tiada mesti lulus dan benar-benar ditulis, sempadan hari MYT mengosongkan siling harian); `node companion/tests/asap-e2e.mjs` 53/53; `node tests/hadir.test.cjs` 23/23, exit 0. Semakan bebas DeepSeek: keputusan LULUS BERSYARAT dengan pepijat TERUK di atas, kini dibetulkan |
| 21 September 2026 | 1.11.16 | **Had kadar login auto idMe BERTERUSAN (kelulusan pemilik eksplisit), opt-in `hadKadarLogin` (lalai MATI).** `had-login.mjs` dikembangkan daripada siling sejuk 15 minit tidak disambungkan kepada polisi persisten sepanjang hari: 6 cubaan/jam gelongsor, siling harian 24 (TIDAK dikosongkan oleh kejayaan — hanya hari baharu UTC atau tetapan semula manual), berhenti serta-merta selepas 3 kegagalan berturut-turut (hanya log masuk manual berjaya memulihkan). Gagal tertutup dikekalkan/diperluas: fail keadaan rosak ATAU jam digulung ke belakang merentas sempadan hari = BLOK. `login-auto.mjs` memasang limiter ini pada KEDUA-DUA laluan (startup + job-time) HANYA apabila `hadKadarLogin:true`; apabila MATI, had ASAL 2 cubaan per proses kekal tidak berubah. OTP/CAPTCHA/2FA kekal berhenti untuk manusia, tidak pernah dipintas; pengawal HTTPS+hos idMe kekal sebelum menaip. UI tempatan (`render.mjs`) mendedahkan suis + amaran kesan keselamatan + status sebenar (hari ini X/24, tetingkap sejam Y/6, kegagalan berturut Z/3); `/api/lokal/status` mendedahkan `hadKadarLoginStatus`, dan `/api/tetapan` (klien jauh) menolak medan ini dengan 400 sama seperti `jagaSesi` | Ujian: `node --test companion/tests/*.test.mjs` 334 ujian — 332 lulus, 2 dilangkau, 0 gagal; `node companion/tests/asap-e2e.mjs` 53/53; `node tests/hadir.test.cjs` 23/23, exit 0. BELUM disahkan terhadap idMe/MOEIS hidup — semua ujian guna double storan/halaman dalam ingatan |
| 21 September 2026 | 1.11.15 | **Baiki pemilihan kelas MOEIS apabila HADIR dan MOEIS menamakan kelas SAMA secara berbeza (kes hidup: `PRASEKOLAH` lawan `PRASEKOLAH BIJAK`).** `pilihDropdown` (`adaptorPlaywright.mjs`) sebelum ini menuntut padanan teks TEPAT, jadi pemetaan `petakanKelasMoeis('PRASEKOLAH')` → kelas `PRASEKOLAH` gagal walaupun kelas itu wujud dalam senarai MOEIS; `bacaRingkasanKelas` turut menapis baris ringkasan dengan padanan tepat yang sama, jadi `pilihKonteksDanStabil` tidak dapat mengesahkan kestabilan jadual murid dan pengesahan `badge` akan gagal walaupun pemilihan berjaya. Kini KEDUA-DUA menggunakan peraturan sama: (1) padanan **TEPAT** dahulu (perilaku lama dikekalkan sepenuhnya), (2) jika tiada, padanan **AWALAN yang TIDAK AMBIGU** — satu calon sahaja selepas normalisasi (huruf besar, buang bukan alfanumerik) — dan (3) jika dua calon atau lebih, **BERHENTI** (`padanan-ambigu`, tiada pemilihan/tiada baris) supaya kelas tidak pernah diteka. Perubahan tempatan pada padanan sahaja: tiada pengawal keselamatan, had log masuk, pengesahan selepas simpan atau invarian tulisan disentuh. Punca dasar dinyatakan jujur: nama kelas HADIR untuk prasekolah kehilangan bahagian kelas (`BIJAK`) semasa penciptaan/perolehan kelas, jadi padanan tahan-nama ini menyelesaikan kes hari ini tanpa meneka | Ujian: `node --test companion/tests/*.test.mjs` 324 ujian — 322 lulus, 2 dilangkau, 0 gagal (naik daripada 319/317/2/0 — 5 ujian baharu terhadap DOM pelayar SEBENAR dalam `adaptor-playwright.test.mjs`: `pilihKelas` menerima awalan tidak ambigu, `pilihKelas` berhenti pada padanan ambigu, `pilihKelas` mengutamakan tepat, `bacaRingkasanKelas` menerima baris `PRASEKOLAH BIJAK` untuk permintaan `PRASEKOLAH`, `bacaRingkasanKelas` pulang null pada padanan ambigu); `node companion/tests/asap-e2e.mjs` 53/53; `node tests/hadir.test.cjs` 23/23, exit 0. Tiada log masuk hidup/kredensial sebenar/rangkaian/registry disentuh |
| 21 September 2026 | 1.11.14 | **Baiki pepijat 1.11.13: tugasan `langkau` automatik terkunci SELAMA-LAMANYA dalam pernahDiklaimAutomatik.** `giliran.mjs` menambah id ke `pernahDiklaimAutomatik` SEBELUM mengetahui hasilnya; laluan `langkau` (kunci pelayar sibuk) melepaskan lease dan pulang `null` tetapi TIDAK PERNAH membuang id semula — kitaran auto seterusnya melangkau tugasan itu buat selama-lamanya walaupun profil Edge sudah bebas dan langkau bukan kegagalan sebenar. Pembetulan: id kini dibuang HANYA apabila KEDUA-DUA syarat dipenuhi — (a) launcher DIPERCAYAI (`bin/hadir-companion.mjs`) menjamin SECARA EKSPLISIT medan `pastiTiadaSpawn:true` (fungsi pulang sebelum sebarang `execFile`/tulisan; ditetapkan hanya pada laluan kunci-gagal-serta-merta `jalankanTugasanAnak`), DAN (b) `klien.lepas()` benar-benar berjaya. Launcher yang tidak menetapkan medan itu (termasuk semua double ujian sedia ada) dianggap tidak menjamin apa-apa; pelepasan lease yang gagal turut mengekalkan guard — tulisan separuh/tidak diketahui TIDAK PERNAH dianggap layak cuba semula (`lepasSelepasLangkau` baharu dalam `giliran.mjs`). Turut mengeraskan `bin/hadir-companion.mjs`: `jalankanTugasanAnak`/`jalankanAnakSkrip` kini membungkus pelancaran `execFile` dalam try/catch supaya lontaran SEGERA (bukan melalui panggil balik) membebaskan kunci pelayar (sebelum ini kunci tersekat selama-lamanya jika `execFile()` melontar segera); kegagalan penyirian STDIN kini membunuh proses anak segera dan bukan menunggu had masa 15 minit. Tiada perubahan pada had 2 cubaan log masuk atau lalai MATI `jagaSesi`/`autoMulaGiliran` | Ujian: `node --test companion/tests/*.test.mjs` 319 ujian — 317 lulus, 2 dilangkau, 0 gagal (naik daripada 316/314/2/0 — 3 ujian baharu dalam `giliran.test.mjs`: DUA kitaran auto sebenar terkunci-lepas-cuba-semula-berjaya, pelepasan lease gagal mengekalkan guard, tiada jaminan eksplisit mengekalkan guard); `node companion/tests/asap-e2e.mjs` 53/53; `node tests/hadir.test.cjs` 23/23, exit 0. Tiada log masuk hidup/kredensial sebenar/rangkaian/registry disentuh |
| 21 September 2026 | 1.11.13 | **Tambah penjaga sesi (keep-alive) BERSEMPADAN opt-in + kunci eksklusif pelayar; kekalkan had log masuk ASAL 2 cubaan per proses.** (1) Penjaga sesi `buatPenjagaSesi` (`src/moeis/jaga-sesi.mjs`) menyentuh sesi MOEIS (siasatan baca-sahaja uji-login, TIADA kredensial) setiap `JEDA_JAGA_SESI_MS=5 minit` — DIKUNCI di sebalik suis opt-in `jagaSesi` (lalai MATI, local-only). Ia hanya poke semasa giliran AKTIF, dilangkau semasa tugasan diproses (profil Edge digunakan), tiada pertindihan (rantai `setTimeout`), lantai selang keras 1 minit, timer `unref`; kegagalan poke tidak menghalang kitaran. Klasifikasi kesihatan JUJUR: `sihatTerakhir` BENAR HANYA apabila poke memulangkan `status:'sesi-sah'`; `sesi-tamat`/`perlu-manusia`/`langkau`/`ralat` = TIDAK sihat (promise selesai BUKAN kejayaan). **Kepastian jujur:** "luput ~15-20 minit" ialah PEMERHATIAN pemilik, BUKAN masa tamat tetap yang diukur; sama ada poke sebenarnya menghalang luput BELUM disahkan terhadap idMe hidup. (2) Kunci eksklusif pelayar `buatKunciPelayar` (`src/kunci-pelayar.mjs`) menyambung kepada KEDUA-DUA fungsi pelancar anak (`jalankanAnakSkrip`/`jalankanTugasanAnak`) supaya pemeriksaan-dan-set atomik — menutup tetingkap TOCTOU antara semakan `sedangProses` dan pelancaran pelayar kedua; tugasan yang berlanggar menghasilkan `langkau` (lepaskan lease, cuba semula) dan bukannya paksa-bunuh pelayar aktif. (3) Had log masuk automatik KEKAL had ASAL **2 cubaan per proses**; siling KADAR persisten (`had-login.mjs`) TIDAK disambungkan dalam pengeluaran (ia mengubah rejim kadar yang pemilik belum luluskan; disimpan sebagai modul beruji). | Ujian: `node --test companion/tests/*.test.mjs` 316 ujian — 314 lulus, 2 dilangkau, 0 gagal (baharu: `kunci-pelayar.test.mjs`, klasifikasi kesihatan `jaga-sesi.test.mjs`, sempadan `jagaSesi` local-only, readback `jagaSesi`, penolakan `jagaSesi` klien jauh, laluan `langkau` dalam `giliran.test.mjs`). Tiada log masuk hidup/kredensial sebenar/rangkaian/registry disentuh |
| 21 September 2026 | 1.11.12 | **Baiki pepijat cache sesi lapuk: tugasan yang terkena sesi idMe tamat kini mencetuskan log masuk automatik SEBENAR (PAKSA, memintas gerbang cache), bukan dilangkau oleh cache.** Sebelum ini `cubaLoginAutoKerja()` dirujuk pada isyarat `punca:'sesi-tamat'` tetapi berunding dengan `sesiKerjaDisahkan` (cache-sahaja) yang masih mengaku sesi sah, jadi log masuk dilangkau (`LOGIN_AUTO: dilangkau: Sesi idMe sudah sah`) dan cubaan semula gagal serupa 11 saat kemudian (kegagalan hidup pemilik 2026-09-21T03:47Z, job b5c55dc2; tiada data ditulis ke MOEIS). Kini `cubaLoginAutoKerja({paksa:true})` memintas gerbang cache SAHAJA sambil menghormati SEMUA pengawal lain (suis `loginAuto` MATI, kredensial tiada, had 2 cubaan dikongsi dengan startup melalui `cubaSekaliLogin`/`buatPengurusLoginAuto.cubaAuto`, HTTPS+hos ketat sebelum menaip, gerbang kotak semak, CAPTCHA/OTP berhenti `perluManusia` tanpa cuba semula, tingkah laku suis frasa). Sempadan dikekalkan: paling banyak SATU log masuk paksa + SATU cubaan semula tugasan per tugasan (`sudahCubaLoginSemula`); log masuk paksa yang `perluManusia`/gagal TIDAK dicuba semula tugasan secara senyap — tugasan gagal dengan sebab jelas. Cache sesi turut disegarkan pada selang bersempadan `TTL_SEGAR_SESI_MS = 10 minit` (padan kadar luput idMe ~10 min) melalui siasatan uji-login baca-sahaja (`segarkanSesiCache` → `jalankanUjiLoginSebenar`, tiada kredensial ditaip) paling banyak sekali setiap selang dan hanya semasa giliran aktif, supaya keputusan masa-kitaran tidak kekal lapuk tanpa had | Ujian: `node --test companion/tests/*.test.mjs` 265 ujian — 263 lulus, 2 dilangkau, 0 gagal (naik daripada 256/254/2/0 — 9 ujian baharu: paksa memintas cache sah, paksa menghormati suis MATI/kredensial tiada, cap dikongsi dengan startup, `{paksa:true}` dihantar pada isyarat sesi-tamat, perlu-manusia → tiada cubaan semula senyap, segaran cache dithrottle); `node companion/tests/asap-e2e.mjs` 52/52; `node tests/hadir.test.cjs` exit ...
| 21 September 2026 | 1.11.11 | **Baiki pengesanan kejayaan selepas hantar "Daftar Masuk": log masuk idMe yang BERJAYA tidak lagi disalah laporkan sebagai `perlu-manusia`.** Dahulu `sahkanSesiSelepasLogin` (adapter) menilai kejayaan SEMATA-MATA dengan membanding hos semasa == `moeispel.moe.gov.my`. Log masuk idMe yang berjaya sebenarnya mendarat pada papan pemuka idMe (`idme.moe.gov.my`) — borang log masuk (#check_log/#password) hilang, navigasi Aplikasi/Laporan/breadcrumb muncul — dan MOEIS dicapai kemudian melalui pautan Aplikasi/SSO (disahkan oleh semakan sesi berasingan). Jadi laporan menjadi `perlu-manusia` pada kejayaan, dan `PEMULIHAN_AUTO_MULA` berhenti ("Log masuk automatik memerlukan manusia … pemulihan berhenti"). Klasifikasi kini dipusatkan dalam fungsi tulen baharu `tentukanStatusSelepasHantar()` (`sesi.mjs`): (a) hos MOEIS + `#kehadiran` → `sesi-sah` (laluan sedia ada kekal), (b) borang log masuk hilang + penanda papan pemuka idMe → `sesi-sah` WALAUPUN hos masih idMe (hos MESTI `idme.moe.gov.my` — hos sewenang bukan idMe/moeispel seperti portal captive TIDAK diakui kejayaan), (c) selain itu → `sesi-tamat` dengan sebab yang menamakan apa yang ditemui (borang masih ada / hos idMe tanpa papan pemuka). Adapter (`sahkanSesiSelepasLogin`) membaca DOM (borang + penanda dashboard) dan menyerah keputusan kepada fungsi tulen ini. SEMUA pengawal sedia ada tidak disentuh: HTTPS+hos ketat sebelum menaip, CAPTCHA/OTP berhenti tanpa cuba semula, gerbang kotak semak sebelum kata laluan, tingkah laku suis frasa, had 2 cubaan dikongsi. `hasil.perluManusia:false` untuk kejayaan memastikan `PEMULIHAN_AUTO_MULA` meneruskan ke `cubaAutoMula` dan bukannya berhenti | Ujian: `node --test companion/tests/*.test.mjs` 256 ujian — 254 lulus, 2 dilangkau, 0 gagal (naik daripada 246/244/2/0 — 10 ujian baharu: dashboard idMe selepas hantar → sesi-sah bukan perlu-manusia, borang masih ada → perlu-manusia dengan sebab menamakan penemuan, hos idme tanpa borang/dashboard → perlu-manusia, 6 ujian unit `tentukanStatusSelepasHantar` dalam sesi.test.mjs termasuk hos captive bukan idMe/moeispel TIDAK diakui kejayaan, 1 ujian pemulihan log masuk berjaya tidak menghentikan gelung). Tiada log masuk hidup/kredensial sebenar/rangkaian/registry disentuh |
| 21 September 2026 | 1.11.10 | **Baiki langkah kotak semak pengesahan idMe: nilai pulangan `tandakanKunciKeselamatan()` kini disemak; disahkan terhadap DOM idMe SEBENAR (bundle diagnostik pemilik 2026-09-21, bukan lagi andaian).** Halaman pengesahan idMe sebenar membawa kotak semak `<input id="check_log" class="form-check-input" name="check" type="checkbox">` dalam `<label>` "Ya, ini adalah Kata Kunci Keselamatan saya."; kata laluan `<input id="password">` berada dalam `<div id="submit_form" style="display:none">` yang didedahkan oleh pengendali jQuery `$("#check_log").click(...)`. `tandakanKunciKeselamatan()` (`adaptorPlaywright.mjs`) kini menyasar `#check_log` dahulu (fallback `name="check"` + heuristik label), menanda melalui aksi Playwright `.check()` idempotent (bukan `element.click()` mentah dalam `evaluate`), dan mengesahkan kata laluan kelihatan sebelum `true`. **Pepijat:** `jalankanLoginAuto` dahulu MENGABAIKAN nilai pulangan dan terus ke `isiKataLaluanIdMe()` — `fill()` pada medan tersembunyi melontar Timeout Playwright mentah (30s) bocor sebagai "ralat teknikal" (bukti `sebab.txt` bundle). Kini menyemak `=== true` dan ABORT dengan status baharu **`kotak-pengesahan-gagal`** (`perluManusia:true`, sebab jelas, tiada kata laluan/hantar); `ayatLoginAuto` turut meliputi status ini | Ujian: `node --test companion/tests/*.test.mjs` 246 ujian — 244 lulus, 2 dilangkau, 0 gagal (naik daripada 241/239/2/0 — 5 ujian baharu: kotak semak gagal → `kotak-pengesahan-gagal` tanpa kata laluan/hantar, benarkanTerusTanpaFrasa HIDUP + kotak gagal → masih abort, ayat `kotak-pengesahan-gagal`, dan 3 ujian adapter pelayar sebenar terhadap DOM `#check_log`/`#submit_form` idMe sebenar: dedah kata laluan, idempotent, tiada pengendali → false fail-tertutup). Tiada log masuk hidup/kredensial sebenar/rangkaian/registry disentuh |
| 21 September 2026 | 1.11.9 | **Baiki langkah hantar log masuk idMe: DUA butang "Daftar Masuk" pada halaman pengesahan sebenar.** idMe membawa placeholder disabled/hidden `#log_disbale_form` (sentiasa lebih awal dalam DOM) DAN satu butang aktif sebenar; `.first()` membuta lama memilih placeholder dan `click()` melontar Timeout Playwright mentah (30s) yang bocor ke log sebagai "ralat teknikal". `hantarBorangLogMasuk()` (`adaptorPlaywright.mjs`) kini mengimbas BERSEMPADAN (~8s, tinjau ~250ms) dan klik hanya calon KELIHATAN+AKTIF, TIDAK PERNAH `.first()` membuta; jika tiada calon sedemikian, pulangkan `{ok:false, status:'tiada-butang-hantar', sebab:<jelas>}` tanpa throw. `jalankanLoginAuto` (`login-auto.mjs`) kini menyemak `ok===true` sebelum meneruskan — kegagalan berhenti `perluManusia:true` dengan sebab yang sama; SEMUA pengawal sedia ada (frasa, CAPTCHA/OTP, had cubaan, HTTPS+hos) kekal tidak disentuh. Tambah pengawal pra-klik (log 3 boolean sahaja — kotak semak/kata laluan tidak kosong/kelihatan — TIDAK PERNAH nilai) dan bundle diagnostik LOKAL SAHAJA (`tulisDiagnostikKegagalan`, `<dirData>/log/diagnostik-login-<masa>/`: DOM disanitasi via `sanitasiDomLoginGagal` — nilai input dibuang, medan hidden/CSRF/token dibuang, frasa digantikan `[FRASA-DISAMARKAN]` dengan struktur dikekalkan — tangkapan skrin viewport, dan sebab tersensor) pada mana-mana kegagalan log masuk; bundle ini tidak pernah dimuat naik ke mana-mana model/perkhidmatan luar | Ujian: `node --test companion/tests/*.test.mjs` 241 ujian — 239 lulus, 2 dilangkau, 0 gagal (naik daripada 237/235/2/0 — 4 ujian baharu: klik butang aktif bukan placeholder disabled/hidden [~5s, termasuk jeda 5000ms sedia ada], tiada butang aktif → ok:false bersempadan ~8s tanpa raw Timeout, sanitizer DOM tulen menerhadap halaman tempatan sebenar, hantar gagal → perlu-manusia tanpa sahkanSesiSelepasLogin). RED→GREEN disahkan: ujian baharu gagal sebelum pembetulan (232 ujian, 2 gagal — fail import `sanitasiDomLoginGagal` tiada + hasil salah `sesi-sah` bukan `perlu-manusia`), lulus selepas. Tiada log masuk hidup/kredensial sebenar/rangkaian disentuh |
| 21 September 2026 | 1.11.8 | Tambah suis opt-in **`benarkanTerusTanpaFrasa`** (lalai MATI, berasingan daripada `loginAuto`, diluluskan pemilik). Apabila frasa "Kata Kunci Keselamatan" tidak dapat dibaca sebagai teks (imej), tingkah laku lalai kekal `kunci-tiada` (ABORT). Menghidupkan suis ini membenarkan `jalankanLoginAuto` (`src/moeis/login-auto.mjs`) **meneruskan** dalam keadaan itu sahaja — status baharu `kunci-tiada-dibenarkan` (`perluManusia:false`, `sesiSah:true`) — dengan kotak semak pengesahan tetap ditanda dan kata laluan tetap ditaip seperti aliran biasa; frasa imej **tidak pernah** di-OCR/diteka. Frasa yang **dibaca tetapi tidak padan** (`kunci-tidak-padan`, pancingan sebenar) kekal ABORT **tanpa mengira suis ini**. Risiko dinyatakan jujur: apabila suis ini HIDUP dan frasa tidak dapat dibaca, perlindungan bergantung sepenuhnya pada semakan HTTPS+hos idMe ketat dan kotak semak pengesahan sahaja. Suis local-only (`tetapan.mjs` `MEDAN_TETAPAN_LOKAL_DIBENARKAN`, `server.mjs` `MEDAN_LOKAL_SAHAJA` menolak klien jauh) dengan kotak semak + amaran berasingan dalam UI tempatan (`src/ui/render.mjs`), boleh dimatikan semula bila-bila masa | Ujian: `node --test companion/tests/*.test.mjs` 237 ujian — 235 lulus, 2 dilangkau, 0 gagal (naik daripada 231/229/2/0 — 6 ujian baharu: suis HIDUP+frasa tidak dapat dibaca → teruskan penuh, suis MATI (lalai) → tetap berhenti, suis HIDUP tetapi frasa TIDAK PADAN → tetap berhenti (anti-pancing tidak dilonggarkan), suis HIDUP + OTP selepas hantar → perlu-manusia, tiada kredensial dalam hasil, snapshot `benarkanTerusTanpaFrasa` mencerminkan tetapan). Tiada log masuk hidup/kredensial sebenar/rangkaian/registry disentuh |
| 21 September 2026 | 1.11.7 | **Baiki empat kecacatan log masuk automatik yang ditemui dalam semakan kod.** (1) `waitForFunction(fn, {timeout})` dalam adapter kini bentuk 3-arg `waitForFunction(fn, undefined, {timeout})` — sebelum ini `{timeout}` terlepas ke `arg` dan dilupus senyap (`lanjutkanPengesahan`, `tandakanKunciKeselamatan`, `dialogBerjayaKelihatan`). (2) `tandakanKunciKeselamatan` idempotent (klik hanya jika belum ditanda — tidak lagi menanggalkan tanda), kenal pasti kotak semak pengesahan secara khusus (tiada fallback ke kotak semak pertama sewenang), dan sahkan kata laluan benar-benar kelihatan sebelum pulangkan `true`. (3) `pasangPemulihanAutoMula` kini benar-benar bersempadan (`hadKitaran` lalai 12), tanpa pertindihan (rantai `setTimeout` + pengawal `sedangBerjalan`, bukan `setInterval`), berhenti-untuk-manusia (log masuk `perluManusia:true` berhenti serta-merta tanpa cubaan semula senyap), dan menilai pengawal hari (`bolehHariIni`/`bolehHariSekolah`) SEBELUM mencuba log masuk (tiada log masuk pada hari tidak dibenarkan). (4) `bacaKunciKeselamatan` baca frasa daripada kotak putih, bukan label "Kata Kunci Keselamatan" (elak label/nextElementSibling), dan jujur pulangkan `null` untuk frasa imej (tiada OCR/fabrikasi). Tambah **ujian adapter pelayar SEBENAR** (`tests/adaptor-playwright.test.mjs`) yang melancarkan Chrome/Edge headless + fixture HTML sanitized (frasa dalam kotak putih, amaran italic, kotak semak, kata laluan tersembunyi) — membuktikan adapter PRODUKSI mengekstrak frasa/tanda kotak/lanjutkan pengesahan terhadap DOM sebenar, bukan adapter palsu | Ujian: `node --test companion/tests/*.test.mjs` 231 ujian — 229 lulus, 2 dilangkau, 0 gagal. Tiada log masuk hidup/kredensial sebenar/rangkaian/registry disentuh; selektor DOM pengesahan kekal belum disahkan terhadap idMe hidup |
| 21 September 2026 | 1.11.6 | **Baiki pepijat aliran log masuk idMe automatik: dua peringkat (IC → /loginverification → frasa), bukan satu.** Versi lama membaca frasa "Kata Kunci Keselamatan" SEBELUM menghantar IC — halaman itu tidak pernah memaparkan frasa, jadi bacaan sentiasa `null` dan runtuh menjadi status `kunci-tidak-padan` yang mengelirukan (dilaporkan sebagai "pancingan" walaupun sebenarnya "belum sampai ke halaman yang betul"); ia juga mengisi satu borang tunggal (`isiBorangLogMasuk`) walaupun kata laluan sebenar tersembunyi di sebalik kotak semak yang belum ditanda. `jalankanLoginAuto` (`src/moeis/login-auto.mjs`) kini mengikut urutan: isi IC → `lanjutkanPengesahan()` (tunggu `/loginverification`) → baca frasa → keputusan TIGA status (`sesi-sah`/`kunci-tidak-padan`/**`kunci-tiada`** baharu, untuk frasa yang tidak dapat dibaca sebagai teks — kemungkinan imej) → tandakan kotak semak → isi kata laluan → hantar. Invarian keselamatan dikekalkan dan dinyatakan lebih tepat: kata laluan hanya ditaip selepas frasa PADAN dan kotak DITANDA. Adapter (`src/moeis/adaptorPlaywright.mjs`) `isiBorangLogMasuk` digantikan kaedah berperingkat `isiPenggunaIdMe`/`lanjutkanPengesahan`/`tandakanKunciKeselamatan`/`isiKataLaluanIdMe`; `hantarBorangLogMasuk` kini menyasarkan "Daftar Masuk" secara khusus (selektor berlainan daripada butang lanjut). Fixture ujian (`tests/fixtures/halamanPalsuLogin.mjs`) kini stateful (`peringkat`) untuk memodel dua peringkat sebenar. Tambah **pemulihan giliran auto bounded** (`pasangPemulihanAutoMula`, `src/orchestrasi-auto.mjs`) — jika startup auto-mula gagal (cth sesi tidak sah semasa bind) tetapi suis masih ON, gelung 5 minit (unref) menilai semula SEMUA pengawal setiap kitaran melalui `cubaAutoMula` yang sama (guna `sesiKerjaDisahkan` cache-sahaja, bukan startup) sehingga giliran bermula atau suis dimatikan | Ujian: `node --test companion/tests/*.test.mjs` 219 ujian — 217 lulus, 2 dilangkau, 0 gagal (naik daripada 211/209/2/0 — 8 ujian baharu: regresi urutan frasa-selepas-lanjut, kata laluan digerbang kotak semak, status `kunci-tiada` berasingan daripada `kunci-tidak-padan`, laluan penuh berjaya, 4 ujian `pasangPemulihanAutoMula`); `node tests/hadir.test.cjs` exit 0. Tiada log masuk hidup/kredensial sebenar/rangkaian/registry disentuh — selektor DOM peringkat pengesahan (butang lanjut, label kotak semak, kemungkinan imej frasa) kekal **belum disahkan terhadap idMe hidup** |
| 20 September 2026 | 1.11.5 | Tambah **log masuk idMe automatik JOB-TIME** (`cubaLoginAutoKerja`, kongsi had 2 cubaan/proses yang SAMA dengan `cubaLoginAutoStartup`) — sebelum ini log masuk automatik hanya dicuba SEKALI semasa startup; jika sesi tamat semasa giliran berjalan, tugasan gagal terus dengan "sesi tamat" walaupun `loginAuto` ON. Dipicu pada DUA titik yang profil Edge dijamin bebas: (a) permulaan setiap `jalankanSatuKitaran` (sebelum klaim), (b) selepas `push.mjs` anak keluar dengan `punca:'sesi-tamat'` semasa verifikasi ATAU hantar — **satu** percubaan log masuk + **satu** cubaan semula tugasan sahaja per tugasan (`sudahCubaLoginSemula`), tiada gelung. `punca` (`src/moeis/push.mjs`, dikira daripada hos URL sebenar `berkaitanIdMe`) ialah satu-satunya isyarat yang membezakan sesi tamat (boleh cuba semula) daripada CAPTCHA (`punca:'captcha'`, TIDAK PERNAH dicuba semula automatik). **`giliran.sahkanTugasan` (F3, laluan pemulihan baca-sahaja bagi tugasan 'tersimpan') SENGAJA tidak disentuh** — ia tidak pernah menekan hantar walau apa pun, jadi tiada sesi untuk dipulihkan sebelum mutasi; menambah log masuk automatik di situ akan melanggar invarian baca-sahaja F3 tanpa faedah. Visibiliti: `buatStatusLoginAuto`/`snapshotLoginAutoStatus`/`ayatLoginAuto` (`src/moeis/login-auto.mjs`) mendedahkan `loginAutoStatus` (`diminta, adaKredensial, sesiSah, percubaan, had, hasilTerakhir, sebab`) dalam `/api/status` DAN `/api/lokal/status`; UI tempatan memaparkan ayat status di bawah suis `loginAuto` dan kedua-dua suis opt-in (`loginAuto`, `autoMulaGiliran`) kini simpan-sendiri melalui pendengar `change` (pepijat pemilik: dahulu hanya tersimpan melalui butang "Simpan tetapan") | Ujian: `node --test companion/tests/*.test.mjs` 211 ujian — 209 lulus, 2 dilangkau, 0 gagal; `node companion/tests/asap-e2e.mjs` 52/52; `node tests/hadir.test.cjs` exit 0. Tiada suis/tetapan diubah nilainya, tiada log masuk hidup/kredensial sebenar/rangkaian disentuh |
| 20 September 2026 | 1.11.4 | Tambah **amaran awal tamat kalendar sekolah + editor allowlist dalam UI tempatan** (diluluskan pemilik). `ringkasanKalendar()` tulen dalam `src/auto-mula.mjs` (eksport `AMARAN_HARI_KALENDAR = 7`) memulangkan `{ bilangan, pertama, terakhir, hariTinggal, amaran, sebab }` — `hariTinggal` dikira dalam **hari penuh** (Asia/Kuala_Lumpur) ke tarikh sah **terakhir**; `amaran` benar apabila allowlist kosong, sudah tamat, tarikh terakhir dalam 7 hari, atau entri tidak sah; `sebab` ayat Melayu menyatakan kes tepat. Amaran **baca sahaja** (tidak mengubah keputusan pengawal auto-mula) dan dipaparkan sebagai object `kalendar` dalam `/api/lokal/status` + `/api/status` serta banner jelas (merah apabila amaran, hijau apabila selamat) dalam UI tempatan. Editor allowlist dalam UI tempatan (tambah satu tarikh + `Buang` setiap tarikh + `Simpan kalendar`) menghantar senarai penuh ke `POST /api/lokal/tetapan` (header nonce sahaja, medan local-only); pengesahan kekal `sahkanKalendarSekolah` (entri bukan tarikh tepat menolak seluruh senarai; mesej server dipaparkan verbatim; suntingan setempat dikekalkan pada kegagalan simpan — tiada tarikh hilang senyap) | Ujian: `node --test companion/tests/*.test.mjs` 196 ujian — 194 lulus, 2 dilangkau, 0 gagal; `node companion/tests/asap-e2e.mjs` 52/52; `node tests/hadir.test.cjs` exit 0. Semakan bebas keluarga berbeza (Claude) **LULUS** — 4 semakan keselamatan (editor tidak lemahkan pengesahan, tidak boleh dipandu asal jauh, tidak hilang tarikh senyap, amaran tidak boleh "selamat" palsu) semua PASS; 1 pembetulan UX (suntingan dikekalkan pada simpan gagal) digunakan. Tiada suis/tetapan diubah, tiada kehadiran/login/registry disentuh |
| 20 September 2026 | 1.11.3 | Tambah **vault kredensial idMe tempatan + log masuk idMe automatik opt-in** (`loginAuto`, lalai MATI, berasingan daripada `autoMulaGiliran`). `src/kredensial.mjs` menyimpan (pengguna + kata laluan + frasa "Kata Kunci Keselamatan") dalam `kredensial.dat` disulit DPAPI CurrentUser (corak sama `simpanan.mjs`: tulis atomik + ACL icacls, gagal tertutup tanpa fallback teks biasa); `status()` hanya boolean + pengguna tersamar `X***`; tiada nilai dalam env/CLI/log/respons. `src/moeis/login-auto.mjs` menaip kredensial **hanya** selepas frasa anti-pancing padan + tiada CAPTCHA/OTP + had 2 cubaan/proses (backoff); OTP/CAPTCHA/2FA berhenti `perluManusia:true` tanpa pintas. Endpoint `/api/lokal/kredensial*` (nonce+loopback sahaja), UI tempatan dengan medan `type=password` tanpa gema nilai, orkestrasi startup (selepas bind: loginAuto ON + kredensial + sesi tidak sah → SATU cubaan, kemudian auto-mula giliran dinilai). `keupayaan.mjs` kini JUJUR `automatik:true, mod:'automatik-optin'` (belum disahkan hidup). Dakwaan lama "companion tidak pernah menyimpan kata laluan" DIBUANG daripada BLUEPRINT. Artifak bina tidak menyertakan `kredensial.dat` | Ujian: `node --test companion/tests/*.test.mjs` 177 ujian — 175 lulus, 2 dilangkau, 0 gagal; `node tests/hadir.test.cjs` 23/23; `node companion/tests/asap-e2e.mjs` 51/52 (1 gagal lingkungan sedia ada: entri HKCU autostart memang sudah didaftar pada mesin ini). Semakan bebas keluarga berbeza (Claude) atas pengendalian kredensial — lihat lampiran. Tiada log masuk hidup, tiada kredensial sebenar, tiada registry/kehadiran disentuh |
| 20 September 2026 | 1.11.2 | Tambah **dua opt-in tempatan companion**: (a) autostart Windows — satu entri Run key HKCU `HADIRMoeisCompanion` diurus `src/autostart-windows.mjs` (`reg.exe` argv tetap, tiada shell); `POST /api/lokal/autostart` melaporkan keadaan **sebenar daripada registry HKCU**, laluan jauh `POST /api/autostart` dibuang; (b) auto-mula giliran selepas bind loopback berjaya — pengawal kelayakan fail-closed (`src/auto-mula.mjs`): allowlist tarikh sekolah tepat `kalendarSekolah` (kosong = gagal tertutup), Sabtu/Ahad ditolak, kesegaran 15 minit, `diciptaEpochMs` mesti lebih baharu daripada sempadan aktivasi opt-in DAN masa mula proses, tiada cubaan semula automatik, satu tugasan sekali sepanjang hayat proses, kelayakan diperiksa semula sebelum klaim dan sebelum mutasi MOEIS. Log masuk idMe automatik **disekat** (`src/moeis/keupayaan.mjs`: manual; tiada vault pelayar diluluskan). Backend `hadirMoeisJobSenarai_` kini memulangkan `diciptaEpochMs` (perlu deploy semula — tanpa itu auto-mula gagal tertutup). Buang kod mati `tulisAutostartRegistryLamaTidakDigunakan` | Ujian: `node tests/hadir.test.cjs` exit 0; `node --test companion/tests/*.test.mjs` 149 ujian — 148 lulus, 1 dilangkau, 0 gagal; `node companion/tests/asap-e2e.mjs` 50/50 lulus (fixture palsu sahaja). Semakan bebas keluarga berbeza (Claude) mula-mula GAGAL (1 penemuan TINGGI): poll yang sama menapis giliran MANUAL juga kerana `automatik` dipaksa `true`; dibetulkan (`state.modMula === 'auto'`) dengan ujian regresi, lalu semakan semula LULUS. Tiada kehadiran ditulis, tiada registry/pelayar/rangkaian sebenar disentuh |
| 18 September 2026 | 1.11.1 | Pembetulan companion selepas ujian pelayar sebenar: (a) **UI tetapan tempatan tidak boleh menyimpan apa-apa** — pelayar menghantar `Origin: http://127.0.0.1:<port>` pada setiap POST tempatan dan header `X-HADIR-Lokal` mencetuskan preflight, tetapi semakan Origin menolaknya sebelum semakan nonce; origin loopback kini diterima **hanya** untuk `/api/lokal/*` yang masih mewajibkan nonce sah, laluan lain kekal 403. (b) Subperintah CLI `kod-pasangan` sentiasa gagal (kod hidup dalam memori proses `serve` sahaja) — kini mengarahkan pengguna ke UI tempatan, bukan mencetak kod palsu. (c) Selang giliran lalai 20→**90 saat** dan had bawah 10→**30 saat**: 180 permintaan/jam mencetuskan sekatan sementara Google pada titik pemulangan data untuk IP PC itu | Ujian regresi baharu `tests/origin-lokal-ui.test.mjs` (6 ujian) **disahkan gagal tanpa pembetulan (a)** dan lulus dengannya; disahkan juga dalam pelayar sebenar (kod pasangan dijana). Suite companion 108 ujian: 107 lulus, 1 dilangkau; asap 43/43. Tiada kehadiran dihantar dan tiada rekod murid disentuh semasa ujian |
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
