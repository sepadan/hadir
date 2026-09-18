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

## Autostart (opt-in sahaja)

Tiada apa didaftarkan secara automatik. Untuk mulakan companion semasa log
masuk Windows, tekan togol **autostart** pada tetapan tempatan, atau:

```powershell
node bin/hadir-companion.mjs autostart-hidup
node bin/hadir-companion.mjs autostart-mati
```

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

Artifak ini tidak mengandungi `tetapan.json`, `rahsia.dat`, profil pelayar, log
atau data tempatan — komputer itu membina keadaannya sendiri pada penggunaan
pertama.

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
ENJIN dan HASH TOKEN klien; kod pasangan tidak pernah ditulis ke cakera, dan
kata laluan idMe tidak pernah melalui companion langsung.

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
idMe sebenar, tiada kata laluan pernah ditaip oleh kod, dan tiada kehadiran
sebenar dihantar. Kesesuaian selektor halaman MOEIS (`src/moeis/adaptorPlaywright.mjs`)
diwarisi daripada prototaip `moeis-bot` yang pernah berjaya, bukan hasil
pengesahan baharu.

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
