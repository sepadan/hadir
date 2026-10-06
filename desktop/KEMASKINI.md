# Kemas kini HadirDesktop

Panduan ringkas untuk PC sekolah. Semua arahan dijalankan dari folder
`desktop\` dalam repo ini, guna PowerShell.

## 1.0.21 — Jaminan struktural: butang Autohadir kekal kelihatan

- **Punca isu:** Pada PC pemilik dengan 1.0.20 terpasang (waktu luar tetingkap aktif), bar status terpotong selepas pemisah kedua (hanya Segar semula status, Keadaan, Backend; Kitaran, label nav dan butang Autohadir hilang). Punca dikenal pasti:
  - Teks Kitaran luar waktu aktif (`Kitaran: mati — di luar waktu aktif (06:30–17:00, Isnin–Jumaat) — disambung sendiri dalam waktu itu`) mencapai **536 px**.
  - Teks Backend langsung mencapai **244 px**.
  - Jumlah kandungan tetap langsung: 144 + 6 + 220 + 6 + 244 + 6 + 536 = **1162 px > 1082 px** (lebar bar status pada saiz tetingkap lalai 1100x750). WinForms menghentikan lukisan item yang terkeluar dari sempadan bar.
  - Ujian lama hanya menguji teks pendek dalam persekitaran ujian (Backend 63 px, Kitaran pendek) dan tidak menguji senario terburuk.
- **Jaminan struktural & had lebar label tetap:**
  - Setiap label status tetap dihadkan lebar maksimumnya melalui kelas `LabelStatusTerhad` (subkelas `ToolStripStatusLabel` dengan `AutoSize=false; Width=had; TextAlign=MiddleLeft` dan `GetPreferredSize` terhad):
    - **Keadaan (`_stateLabel`):** Had maksimum **230 px**
    - **Backend (`_backendLabel`):** Had maksimum **260 px**
    - **Kitaran (`_kitaranLabel`):** Had maksimum **230 px**
  - Pada saiz lalai 1100x750 (DisplayRectangle ~1082 px), jumlah label dibatasi + butang Autohadir (84 px) + krip (18 px) + padding + margin = ~988–1012 px <= 1050 px, menjamin sekurang-kurangnya 30 px ruang simpanan untuk label Spring `_navLabel` (didapati ~70–100 px).
- **Mesej luar waktu aktif dipendekkan + ToolTip lengkap:**
  - Teks paparan Kitaran luar waktu aktif diringkaskan: `Kitaran: mati (luar 06:30–17:00)` (~180 px, muat kemas dalam had 230 px tanpa terpotong).
  - Ayat penuh asal dikekalkan dalam `ToolTipText`: `Kitaran: mati — di luar waktu aktif (06:30–17:00, Isnin–Jumaat) — disambung sendiri dalam waktu itu`.
  - ToolTip lengkap dipasang pada semua label status (`_stateLabel`, `_backendLabel`, `_kitaranLabel`) supaya tiada maklumat hilang walau teks terpotong.
- **Butang Autohadir dikekalkan:** Item TERAKHIR bar status, 84 px, `Overflow=Never`, margin krip (18 px) kekal.
- **Ujian senario terburuk diperkukuh:**
  - Ujian kawalan kini menetapkan teks label terus kepada teks panjang penuh (536 px kitaran, backend penuh, ralat penuh) sebelum pengiraan saiz pilihan.
  - Assert mengesahkan `jumlah(GetPreferredSize bukan-spring) + RuangGrip + Padding.Horizontal <= DisplayRectangle.Width` dan `Bounds.Right <= DisplayRectangle.Width - RuangGrip`.
  - Ujian mengesahkan setiap label status mempunyai `ToolTipText` yang tidak kosong.

- **Warna status "Kredensial" (Bahagian A):**
  - Tetingkap "Akaun idMe" (`IdMeSettingsDialog`) kini menggunakan warna visual yang jelas untuk status simpanan kredensial:
    - `Kredensial: ada (pengguna …)` dipaparkan dengan warna **HIJAU** (`Color.SeaGreen`).
    - `Kredensial: tiada (belum disimpan pada PC ini).` dipaparkan dengan warna **MERAH** (`Color.Firebrick`).
    - `Tetapan disimpan. Kredensial TIDAK disimpan …` dipaparkan dengan warna **MERAH** (`Color.Firebrick`).
    - `Kredensial: ROSAK …` kekal **MERAH** (`Color.Firebrick`).
    - Mesej simpanan berjaya kekal **HIJAU** (`Color.SeaGreen`).
  - Sifat baca-sahaja `WarnaStatus` diekspos untuk ujian unit tanpa menyentuh DPAPI/kredensial sebenar.

- **Penghantaran MOEIS bagi kelas semua-hadir (Bahagian B):**
  - **Apps Script (`HadirWeb.gs`):**
    - Simpan kehadiran kelas lengkap bagi kelas semua-hadir kini **mencipta atau menyegarkan** job `menunggu` dengan senarai murid kosong (`[]`), dan TIDAK lagi membatalkan job tersebut.
    - `hadirMoeisSahkanLengkap_` membenarkan senarai kosong apabila ditandakan `semuaHadir`.
    - `hadirBacaJobPeta_` memetakan senarai kosong kepada `bilTidakHadir = 0` (bukan NaN/kosong).
    - Log audit `MOEIS_JOB_BUAT` mencatat `0 murid tidak hadir (semua hadir)`.
  - **Desktop (`PenghantaranMoeis.cs` & `KerjaPenuh.cs`):**
    - `PembinaTugasanPenghantaran.DaripadaKerja` menerima senarai ketidakhadiran kosong HANYA apabila rekod kerja menegaskan kehadiran lengkap (`MenegaskanSemuaHadir` — melalui bendera `SemuaHadir`, `BilMurid == BilHadir && BilMurid > 0`, atau mesej penegasan). Rekod yang samar atau tidak lengkap ditolak fail-closed dengan sebab jujur.
    - Tugas membawa bendera `SemuaHadir = true`.
  - **Aliran Penghantaran:**
    - Membuka halaman kelas MOEIS tanpa mengubah sebarang baris (tiada penandaan kotak atau pemilihan sebab/kategori).
    - Menekan butang Kemaskini dan Simpan / Simpan & Sahkan pada dialog pengesahan.
    - Baca semula wajib mengesahkan `bilHadir == jumlahMurid` dan `bilTidakHadir == 0`. Sekiranya portal menunjukkan sebarang murid tidak hadir, penghantaran gagal jujur tanpa paksaan.
    - Mesej keputusan dilaporkan: `Semua hadir (N murid) — disahkan tanpa perubahan baris; hadir X/N`.
  - **Kad Web (`app.js`):**
    - Kad kelas memaparkan `Selesai MOEIS` apabila job semua-hadir berjaya disahkan.

## 1.0.20 — Butang Autohadir dalam bar status (kemas dan muat)

- **Permintaan pemilik:** Butang **Autohadir** dipindahkan daripada kawalan terapung KE DALAM bar status (bar bawah) tetingkap utama sebagai item terakhir, dengan reka bentuk kemas dan saiz yang sesuai.
- **Penyelesaian ruang bar:** Pada 1.0.17 bar status terlebih muat (1126 px > 1082 px). Pada 1.0.20, label bar status dipadatkan formatnya tanpa membuang maklumat (teks penuh kekal boleh dilihat dalam ToolTip):
  - **Backend:** `Backend: konfigurasi tersedia (rahsia enjin + apiUrl sah)` (375 px) dipadatkan kepada `Backend: sedia (rahsia + apiUrl sah)` (193 px) — jimat 182 px.
  - **Kitaran:** `Kitaran: seterusnya lebih kurang 16:30 (setiap 10 minit)` (369 px) dipadatkan kepada `Kitaran: 16:30 · setiap 10 minit` (163 px) — jimat 206 px.
  - **Butang Autohadir kompak:** Ikon 16 px + teks "Autohadir" + padding kecil (84 px, ≤ 95 px) dengan `Overflow = ToolStripItemOverflow.Never`.
  - **Ruang krip saiz:** Margin kanan 20 px memperuntukkan ruang krip saiz (18 px) di penjuru kanan bawah supaya butang tidak ditutup grip. Grip seret tetingkap dikekalkan.
- **Jumlah lebar:** Kandungan tetap bar berkurang daripada 1126 px kepada 658–815 px, memberikan baki ruang luas (254–411 px) untuk label navigasi (`_navLabel`, Spring) pada saiz lalai 1100x750 (klien 1084 px, DisplayRectangle 1069 px).
- **Kawalan terapung dibuang:** Tiada lagi butang terapung yang menindih sudut laman web atau listener susun atur borang/bar.
- **Menu dulang kekal seragam:** Klik butang membuka menu dulang yang SAMA (instance `TrayHost.MenuDulang`, satu instance) ke atas, diapit dalam kawasan kerja skrin, dan klik kedua menutupnya.

## 1.0.19 — Ikon tiada lagi dikongsi antara benang

- **Punca:** sejak 1.0.16 setiap ikon menu dulang ialah satu Bitmap yang dikongsi oleh semua pengguna (menu dulang, panel **Semua fungsi**, butang **Autohadir**). GDI+ tidak membenarkan objek yang sama disentuh oleh dua benang serentak. Jika ikon dibaca di luar benang UI semasa benang lain menggunakannya, aplikasi melontar ralat `Object is currently in use elsewhere`. Ini dikesan sebagai ujian yang gagal sekali-sekala (1 daripada 10 larian).
- **Apa yang berubah:** ikon masih dilukis sekali sahaja, tetapi setiap pengguna kini menerima salinannya sendiri. Menu dulang, panel dan butang Autohadir melupuskan salinan masing-masing apabila ditutup.
- **Rupa tidak berubah:** salinan ialah bait piksel yang sama tepat dengan lukisan asal. Warna, bentuk dan saiz ikon (16x16) kekal seperti 1.0.18. Tiada perubahan pada menu, panel atau butang.

## 1.0.18 — Butang Autohadir sentiasa kelihatan

- **Pembetulan 1.0.17:** butang **Autohadir** wujud dalam aplikasi tetapi tidak pernah kelihatan. Ia diletak sebagai item terakhir bar status, dan pada saiz tetingkap lalai kandungan tetap bar itu (Segar semula, Keadaan, Backend, Kitaran) sudah 1126 px, lebih lebar daripada bar itu sendiri (1082 px). Bar status Windows tidak melukis item yang terkeluar dari tepi kanan, jadi label navigasi dan butang Autohadir hilang. Ini juga berlaku semasa tetingkap dimaksimumkan, apabila teks status panjang.
- Kini **Autohadir** ialah butang merah (warna banner, teks putih tebal, ikon grid) yang terapung di **hujung kanan bawah** tetingkap, terus di atas bar status. Ia sentiasa kelihatan pada sebarang saiz tetingkap dan mengikut sudut kanan bawah apabila tetingkap diubah saiz. Butang itu menindih sedikit sudut bawah kanan halaman portal.
- Klik butang membuka menu dulang yang **sama** seperti 1.0.17 (satu instance; tanda semak dan baris status sentiasa seragam). Menu dibuka ke atas, tidak terpotong di tepi skrin, dan klik sekali lagi menutupnya.
- Bar status tidak berubah: Segar semula status, Keadaan, Backend, Kitaran dan label navigasi kekal seperti 1.0.16.

## 1.0.17 — Butang Autohadir dalam aplikasi

- Butang **Autohadir** (ikon grid) kini berada di hujung kanan bawah bar status tetingkap utama. Klik butang itu untuk membuka menu yang sama seperti klik kanan ikon HADIR Desktop di dulang sistem.
- Menu ini ialah menu dulang yang **sama** (satu instance), bukan salinan. Tanda semak **Mula bersama Windows** / **Hantar ke MOEIS (automatik)**, baris status kelabu dan ikon sentiasa sama di kedua-dua tempat. Setiap item berfungsi sama seperti dari dulang.
- Menu dibuka **ke atas**, sejajar dengan tepi kanan butang, dan sentiasa dalam kawasan skrin (tidak terpotong di bawah atau kanan, termasuk pada monitor kedua).
- Klik **Autohadir** sekali lagi semasa menu terbuka untuk menutupnya. Esc atau klik di luar menu juga menutupnya.

## 1.0.16 — Ikon menu dulang dan panel "Semua fungsi"

- Setiap item perintah dan togol dalam menu dulang kini mempunyai ikon kecil berwarna. Teks dan susunan item sedia ada tidak berubah. Baris status kelabu dan pemisah tidak berikon.
- Item baharu **Semua fungsi…** (kedua, selepas **Tunjuk**) membuka tetingkap **Semua fungsi — HADIR Desktop**. Tetingkap itu memaparkan setiap fungsi dulang sebagai butang, dalam empat kumpulan: **Paparan**, **Tetapan**, **Penghantaran**, **Sistem**. Setiap butang ada penerangan ringkas.
- Butang panel melakukan perkara yang SAMA seperti item dulang. Tiada fungsi baharu, dan tiada medan kredensial dalam panel.
- **Mula bersama Windows** dan **Hantar ke MOEIS (automatik)** ialah butang togol (tertekan = HIDUP). Penerangannya menyatakan `Kini: HIDUP` atau `Kini: MATI`. Togol dalam panel dan tanda semak dalam menu dulang sentiasa sama.
- Baris **Status** di bawah memaparkan teks keadaan portal yang sama seperti baris kelabu menu dulang.
- **Tutup**, Esc atau butang X hanya menyembunyikan panel. Memilih **Semua fungsi…** sekali lagi membawa panel yang sama ke hadapan; tetingkap kedua tidak dibuka.

## 1.0.15 — Kitaran pintar dan waktu aktif

**Kitaran pintar (automatik, tiada tetapan).**

- Selepas setiap kitaran, HADIR Desktop melihat hasil pass penghantaran MOEIS kitaran itu. Jika ada tanda kerja belum siap — status `gagal`, `backend-sementara-gagal`, `laporan-gagal`, `enjin-luar-talian`, `tiada-pemilik`, atau ada cubaan yang tidak disahkan / tugasan hari ini yang dilangkau — kitaran seterusnya berjalan **90 saat** kemudian, bukan 10 minit. Contoh: kelas yang gagal dengan `halaman-tidak-sedia` kini dicuba semula dalam masa kira-kira satu setengah minit.
- Apabila semua cubaan disahkan (`dihantar`) atau tiada tugasan (`tiada-penghantaran`) tanpa apa-apa tertinggal, selang kembali kepada **10 minit**.
- Tiada maklumat (tiada kerja hari ini, log masuk belum sah, penghantaran automatik MATI, kitaran ditolak oleh gate) = **10 minit**. Kitaran tidak dipercepat tanpa bukti.
- Kitaran pertama 45 saat selepas lancar tidak berubah. Kitaran masih tidak bertindan: 90 saat ialah jarak antara kitaran, bukan kerja selari.
- Label **Kitaran** pada bar status memaparkan selang sebenar: `(setiap 90 saat)` atau `(setiap 10 minit)`.
- Jika tugasan dilangkau kerana masalah yang tidak hilang sendiri (contohnya klaim tanpa senarai murid), kitaran terus mencubanya setiap 90 saat. Kitaran membaca HADIR dan cuba menuntut tugasan itu, tetapi tidak menulis ke MOEIS untuknya.

**Waktu aktif (opt-in, lalai MATI).**

- Menu dulang → **Akaun idMe…** → tandakan **Hadkan masa aktif kitaran automatik (opt-in)**. Isi **Mula** dan **Tamat** dalam format `HH:mm` (lalai `06:30` dan `17:00`). **Isnin–Jumaat sahaja** (lalai ditanda) menolak kitaran pada hari Sabtu dan Ahad. Tekan **Simpan**.
- Medan masa dan kotak hari hanya boleh disunting dan hanya berkuat kuasa apabila kotak **Hadkan masa aktif** ditanda.
- Tetingkap ialah dari **Mula** (termasuk) hingga **Tamat** (tidak termasuk): dengan 06:30–17:00, kitaran pada 06:30 berjalan dan kitaran pada 17:00 ditolak. Jika Tamat lebih awal daripada Mula (contoh `22:00`–`06:30`), tetingkap itu merentasi tengah malam. Hari ditentukan oleh tarikh kalendar semasa, jadi Sabtu 02:00 tetap dikira hujung minggu.
- Di luar waktu, setiap kitaran automatik ditolak sebelum HADIR dibaca, portal dibuka atau log masuk dicuba. Label menjadi `Kitaran: mati — di luar waktu aktif (06:30–17:00, Isnin–Jumaat) — disambung sendiri dalam waktu itu`. Pemasa terus berjalan, jadi kitaran pertama dalam tetingkap berlaku dalam masa kira-kira 10 minit selepas waktu Mula. Label itu dikemas kini pada kitaran berikutnya.
- Masa yang tidak sah (contoh `7:00`, `24:00`, atau Mula sama dengan Tamat) ditolak semasa **Simpan**, dan tiada perubahan disimpan. Jika `idme-login.json` disunting dengan tangan dan mengandungi masa tidak sah semasa ciri ini hidup, semua kitaran automatik ditolak dan label memaparkan `waktu aktif tidak sah`.
- Item dulang **Log masuk idMe (atas permintaan)** ialah tindakan manual, jadi ia tidak disekat oleh waktu aktif.
- Tetapan ini disimpan dalam `idme-login.json` yang sama (`WaktuAktifDidayakan`, `WaktuAktifMula`, `WaktuAktifTamat`, `WaktuAktifIsninJumaat`). Fail daripada 1.0.14 dibaca dengan ciri ini MATI, dan tetapan lama kekal.

## 1.0.14 — Kemas kini dalam aplikasi

- Menu dulang **Semak kemas kini…** membaca manifest awam `desktop/kemas-kini/latest.json` daripada GitHub Pages repo ini. Ia hanya menghantar permintaan GET biasa — tiada rahsia, tiada kredensial, tiada data murid.
- Jika versi manifest lebih baharu, HADIR Desktop menawarkan **Muat turun dan pasang**. Fail dimuat turun ke `%LOCALAPPDATA%\HadirDesktop\kemas-kini\`, disahkan **panjang + SHA256**, dan hanya fail yang disahkan dinamakan sedia-pakai. Fail yang gagal disahkan dipadam.
- Pemasangan diserahkan kepada `update.ps1` (disalin ke folder pemasangan oleh `setup.ps1`): hentikan → sandarkan `HadirDesktop.exe.bak-<versi-lama>` → salin → sahkan SHA256 → lancar semula. Jika cincang tidak sepadan, exe lama dipulihkan dan skrip keluar dengan ralat.
- URL muat turun mesti HTTPS pada hos keluaran GitHub (`github.com`, `objects.githubusercontent.com`, `release-assets.githubusercontent.com`); URL lain ditolak sebelum sebarang muat turun.
- Pengecualian proses: hanya `PemasangKemasKini.cs` boleh melancarkan `powershell.exe`, tanpa shell, pada `update.ps1` dalam folder pemasangan.

## 1.0.13 — Data milik HADIR Desktop; Companion boleh dipersarakan

Terbitan 1.0.13. Tiada kebergantungan runtime pada Companion atau Edge.

- Semasa lancaran pertama, URL API, rahsia enjin dan kredensial idMe disalin **sekali** daripada `%LOCALAPPDATA%\HADIR-MOEIS-Companion\` ke `%LOCALAPPDATA%\HadirDesktop\enjin\`. Fail disalin bait demi bait dan disahkan dahulu. Data Desktop yang sah tidak ditimpa, dan fail Companion tidak dipadam atau diubah. Keputusan (nama sahaja) ditulis ke `hadir-desktop.log` dan dipaparkan dalam **Tetapan Tempatan**.
- Selepas itu Desktop membaca foldernya sendiri sahaja. Tetapan atau kredensial yang diubah dalam Companion **tidak** lagi diikuti; ubah dalam HADIR Desktop.
- Tiada lagi fallback ke Companion (`127.0.0.1:8747`). Tanpa konfigurasi yang sah, label Backend menyatakan klaim & hantar MATI dan tiada apa dihantar.
- Jika tetapan backend dipadam, rosak atau ditukar semasa aplikasi berjalan, HADIR Desktop tidak menghantar permintaan backend baharu (termasuk cubaan semula) dan tidak memulakan tulisan MOEIS baharu. Klaim yang sudah dipegang dilepaskan. Permintaan atau tulisan yang sudah bermula tidak boleh ditarik balik. Mulakan semula aplikasi untuk memakai tetapan baharu.
- Jika rekod migrasi tidak dapat disimpan, tetapan dan kredensial yang disalin tidak digunakan. Rekod dicuba semula pada lancaran seterusnya tanpa menyalin semula daripada Companion.
- Jika salinan terdahulu tidak dimuktamadkan dan datanya kini tiada dalam HADIR Desktop, tiada apa disalin semula secara automatik (status `PerluPemulihan`). Simpan tetapan/kredensial dalam HADIR Desktop, kemudian mulakan semula.
- Jika **Simpan** menolak kerana fail tetapan backend rosak, isi URL penuh DAN rahsia enjin, kemudian tekan **Pulihkan tetapan rosak**. Fail lama disandarkan ke folder `sandaran-pemulihan-*` dahulu, dan tiada data diambil daripada Companion. **Mulakan semula HADIR Desktop** selepas itu; tiada penghantaran sebelum mula semula.
- Selepas laporan kepada HADIR gagal, klaim dikekalkan. Kitaran seterusnya menuntut semula dan membaca MOEIS secara baharu sebelum menulis atau melapor; hanya keputusan yang baru disahkan dilaporkan. Tiada keputusan lama disimpan atau dimainkan semula. Tugasan yang dicipta semula dengan ID sama juga diperiksa terhadap keadaan portal terkini.
- Tetapan backend disemak semula sejurus sebelum butang Simpan / Simpan & Sahkan MOEIS ditekan. Jika ia berubah semasa borang diisi, butang tidak ditekan dan tugasan dilepaskan.
- Klaim ialah identiti **muktamad** tugasan. HADIR Desktop membina tugasan penghantaran daripada muatan klaim sahaja — kelas dan senarai murid yang dibaca backend di bawah kuncinya. Jika klaim membawa senarai murid kosong atau tiada kelas, tiada apa dihantar: klaim dilepaskan tanpa sebarang tulisan portal. Snapshot senarai yang lebih lama **tidak pernah** menggantikannya, jadi tugasan yang dicipta semula dengan ID sama (atau baris yang disunting) tidak boleh menyebabkan kehadiran murid lama ditulis semula.
- Jika tulisan MOEIS berjaya tetapi laporannya kepada HADIR gagal, status kitaran ialah `laporan-gagal`. Bacaan MOEIS yang gagal pada kitaran berikutnya tidak melaporkan kejayaan, tidak menekan Simpan dan melepaskan klaim untuk cubaan kemudian. Baris yang sudah tidak hadir mesti mempunyai kategori/sebab yang boleh dibaca dan padan; badge disahkan sahaja tidak memadai. Keadaan yang sudah betul memberi `tidak-berubah` tanpa Simpan, manakala perubahan portal hanya boleh ditulis selepas semakan konflik dan borang serta disahkan melalui baca-semula. Dengan itu tulisan pendua dielakkan apabila rekod sudah betul.
- Migrasi yang terputus tidak mengaktifkan tetapan yang separuh disalin. Kredensial idMe tanpa frasa kunci keselamatan tidak dipindahkan; isi semula dalam **Akaun idMe**.
- **Matikan autostart Companion lama** hanya dibenarkan selepas HADIR Desktop benar-benar memegang klien backend yang sah (mulakan semula selepas menyimpan tetapan). **Pulihkan** tidak menimpa entri autostart lain dan mengekalkan sandaran jika pemulihan tidak dapat disahkan. Sandaran pertama tidak pernah ditimpa; jika entri autostart berubah semasa operasi, ia tidak dipadam.
- idMe/MOEIS kekal dalam WebView2 terbenam. Tetingkap baharu dan skema luaran (cth `microsoft-edge:`) disekat.
- Tetingkap Edge dengan amaran `--no-sandbox` datang daripada Companion lama (Playwright), bukan Desktop. Untuk menghentikannya: buka **Tetapan Tempatan** → **Matikan autostart Companion lama** (sandaran disimpan; **Pulihkan autostart Companion** membatalkannya). Proses Companion yang sedang berjalan tidak dihentikan; log keluar/mula semula Windows, atau tutup proses `node` Companion secara manual.

## 1.0.12 — Tetapan Tempatan dalam HADIR Desktop

- Menu dulang **Tetapan Tempatan** membuka dialog Windows untuk URL Apps Script dan rahsia enjin. Companion dan Edge tidak diperlukan.
- URL mesti endpoint Web App penuh `https://script.google.com/macros/s/{id-deployment}/exec` tanpa query, fragment, userinfo atau port bukan lalai. URL akar hos, `/exec` sahaja dan `script.googleusercontent.com/macros/echo` ditolak; fixture migrasi Companion memakai bentuk `/macros/s/{id}/exec` yang sama. Rahsia tidak dipaparkan; biarkan kosong untuk mengekalkan nilai sedia ada. Simpanan melindungi rahsia dengan DPAPI akaun Windows semasa dan mengekalkan medan tetapan serta klien pasangan yang lain.
- Selepas menyimpan, **mulakan semula HADIR Desktop** supaya klien backend menggunakan tetapan baharu. Kitaran biasa berjalan setiap 10 minit apabila pilihan automatik dihidupkan.
- Job `menunggu` disegarkan oleh Simpan kehadiran berikutnya sebelum klaim, pada baris dan ID yang sama. Simpan semua hadir mencipta atau menyegarkan job menunggu (dengan senarai murid kosong) untuk dihantar dan disahkan ke MOEIS (bermula 1.0.21); job yang sudah aktif menolak perubahan kehadiran sehingga selesai.

## 1.0.11 — Tetapan tempatan kekal dalam HADIR Desktop

- Log masuk manual idMe dalam Tetapan Tempatan kini menavigasi WebView2 HADIR Desktop yang sama; kawalan yang melancarkan Edge dari halaman itu dibuang.
- Pada 1.0.11, skrin tetapan menggunakan halaman Companion; 1.0.12 menggantikannya dengan dialog Windows tempatan.
- Ujian regresi Companion dan Desktop dijalankan sebelum penerbitan.

## Versi

Nombor versi tinggal di satu tempat sahaja: `<Version>` dalam
`HadirDesktop\HadirDesktop.csproj`. Untuk tahu binaan mana yang terpasang:

```powershell
& "$env:LOCALAPPDATA\HadirDesktop\HadirDesktop.exe" --versi
```

Versi juga dipapar pada tajuk tetingkap dan pada nota (tooltip) ikon dulang
sistem, dan ditulis satu baris setiap lancaran ke
`%LOCALAPPDATA%\HadirDesktop\hadir-desktop.log`.

Tajuk membezakan mod: **LOG MASUK MANUAL** apabila halaman idMe sebenar
sekadar dipaparkan tetapi kedua-dua suis automatik MATI; **SISTEM SEBENAR**
apabila ciri automatik dihidupkan; **MOD DEMO** hanya pada fixture pembangun.
Membuka halaman idMe **tidak** menaip kata laluan atau menghantar MOEIS.
Jika anda mahu aliran automatik, buka menu dulang → "Akaun idMe…" dan hidupkan
suis yang dikehendaki; lihat jadual di bawah.

## Tetapan yang WAJIB dihidupkan (paling kerap tertinggal)

Aplikasi ini **sengaja tidak melakukan apa-apa sehingga pemilik opt-in**. Ini
sebab paling kerap seseorang menyangka ia "rosak":

| Tetapan | Di mana | Apa yang berlaku jika MATI |
|---|---|---|
| `LoginAuto` | Menu dulang → "Akaun idMe…" | Log masuk automatik MATI; halaman idMe masih boleh dibuka untuk log masuk manual dalam WebView2 HADIR Desktop. Redirect ke MOEIS/automasi kekal berpagar. |
| `HantarAuto` | Menu dulang → "Hantar ke MOEIS (automatik)" | Kitaran boleh log masuk, tetapi tidak pernah menghantar kehadiran |
| `WaktuAktifDidayakan` (pilihan, 1.0.15) | Menu dulang → "Akaun idMe…" → "Hadkan masa aktif" | Tiada had waktu; kitaran berjalan sepanjang hari (tingkah laku asal) |

Kedua-duanya disimpan dalam `%LOCALAPPDATA%\HadirDesktop\idme-login.json`.
Menukarnya berkuat kuasa **serta-merta** — tiada mula semula perlu.

### Kitaran automatik (sejak 1.0.3)

Apabila sekurang-kurangnya satu daripada dua tetapan itu HIDUP, aplikasi
menjalankan kitaran sendiri:

- satu kitaran **45 saat** selepas aplikasi dimulakan (PC yang baru dihidupkan
  tidak menunggu lama untuk kerja yang sudah menunggu);
- kemudian **setiap 10 minit** (`KitaranAuto.SelangMinit` dalam
  `HadirDesktop\KitaranAuto.cs` — ubah di situ dan terbit semula jika perlu);
- sejak 1.0.15, **setiap 90 saat** (`KitaranAuto.SelangCepatSaat`) selepas
  kitaran yang meninggalkan kerja belum siap (lihat seksyen 1.0.15 di atas);
- jika **waktu aktif** dihidupkan, kitaran di luar waktu itu ditolak.

Kitaran itu **tidak** membuka portal apabila tiada tugasan MOEIS yang belum
siap: ia cuma membaca senarai tugasan (murah) dan berhenti. Ia juga tidak
bertindan dengan dirinya sendiri.

Setiap kitaran meninggalkan satu baris bukti dalam
`%LOCALAPPDATA%\HadirDesktop\hadir-desktop.log`:

```
2026-09-23T13:07:27+08:00 keadaan=diam sebab=Tiada tugasan MOEIS belum siap untuk
2026-09-23 … Tiada portal dibuka, tiada probe sesi, tiada log masuk dicuba.
```

Baris `keadaan=diam` bermaksud kitaran BERJALAN dan memutuskan tiada kerja —
bukan bermakna pemasa mati. Selang biasa ialah kira-kira 10 minit (atau 90
saat selepas kerja yang belum siap). Jika log berhenti dikemas kini sedangkan
tetapan HIDUP, semak keadaan aplikasi. Kitaran yang ditolak kerana di luar waktu
aktif tidak menulis baris log. Rujuk label **Kitaran** untuk melihat keadaannya.

## Di mana data disimpan — dan apa yang KEKAL

Kemas kini hanya menulis `HadirDesktop.exe` (dan fail sandaran exe). Tiada fail
lain disalin, dipadam atau ditulis. Semua yang di bawah ini KEKAL selepas
kemas kini:

`%LOCALAPPDATA%\HadirDesktop\` — folder yang sama dengan exe:

- `idme-login.json` — tetapan log masuk idMe
- `id-pemilik.json` — id pemilik tugasan
- `penolakan-kredensial.json` — keadaan pagar penolakan kredensial
- `real-portal-evidence\` — bukti larian dev
- `*.log` — log aplikasi dan log dev
- `webview2-*` — folder profil WebView2

`%LOCALAPPDATA%\HADIR-MOEIS-Companion\` — folder BERASINGAN, tidak disentuh
langsung oleh mana-mana skrip di sini:

- `kredensial.dat` (DPAPI), `had-login.json`, `id-enjin.json`, `log\`
- **`profil-pelayar\` — folder ini menyimpan SESI LOG MASUK MOEIS yang sebenar.
  JANGAN PADAM.** Kehilangannya memaksa log masuk MOEIS semula dari kosong.

## Langkah kemas kini

```powershell
git pull
.\publish.ps1
.\update.ps1
```

`update.ps1` akan:

1. mengesan HadirDesktop yang sedang berjalan dari folder pemasangan;
2. memintanya tutup dengan sopan, tunggu 20 saat, baru hentikan paksa;
3. membaca versi exe terpasang (`--versi`) sebelum menggantinya;
4. menyandarkan exe lama sebagai `HadirDesktop.exe.bak-<versi-lama>`;
5. menyalin binaan baharu dan **mengesahkan SHA256** sumber lawan destinasi —
   jika tidak sepadan, exe lama dipulihkan dan skrip keluar dengan ralat;
6. mencetak `Versi: sebelum -> selepas` (dan memberitahu dengan jelas jika
   nombor versi tidak berubah);
7. melancarkan semula aplikasi **hanya jika** ia berjalan sebelum ini.

Untuk pemasangan baharu (belum pernah dipasang), guna `.\setup.ps1` — ia juga
menghentikan aplikasi yang sedang berjalan dahulu dan mencetak versi yang
dipasang.

## Rollback

Sandaran ada dalam folder pemasangan. Tutup aplikasi, kemudian:

```powershell
$dir = "$env:LOCALAPPDATA\HadirDesktop"
Get-ChildItem "$dir\HadirDesktop.exe.bak-*"          # lihat sandaran yang ada
Copy-Item "$dir\HadirDesktop.exe.bak-1.0.0" "$dir\HadirDesktop.exe" -Force
& "$dir\HadirDesktop.exe" --versi                    # sahkan versi lama kembali
```

Tukar `1.0.0` kepada versi sandaran yang dikehendaki. Rollback ialah salinan
fail exe sahaja — data pengguna tidak berubah.

## Penyelenggaraan

Folder `webview2-dev-*` dalam `%LOCALAPPDATA%\HadirDesktop\` bertimbun satu
per larian dev dan boleh dipadam dengan selamat apabila aplikasi ditutup.
**Jangan padam `webview2-*` yang digunakan pengeluaran** (cth
`webview2-demo`) — dan jangan sekali-kali sentuh
`%LOCALAPPDATA%\HADIR-MOEIS-Companion\profil-pelayar\`.

Fail `HadirDesktop.exe.bak-*` lama boleh dipadam satu per satu apabila anda
pasti tidak perlu rollback ke versi itu lagi.
