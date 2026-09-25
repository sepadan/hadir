# Kemas kini HadirDesktop

Panduan ringkas untuk PC sekolah. Semua arahan dijalankan dari folder
`desktop\` dalam repo ini, guna PowerShell.

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
- Jika tulisan MOEIS berjaya tetapi laporannya kepada HADIR gagal, status kitaran ialah `laporan-gagal`. Bacaan MOEIS yang gagal pada kitaran berikutnya tidak melaporkan kejayaan, tidak menekan Simpan dan melepaskan klaim untuk cubaan kemudian. Baris yang sudah tidak hadir mesti mempunyai kategori/sebab yang boleh dibaca dan padan; badge disahkan sahaja tidak memadai. Keadaan yang sudah betul memberi `tidak-berubah` tanpa Simpan, manakala perubahan portal hanya boleh ditulis selepas semakan konflik dan borang serta disahkan melalui baca-semula. Dengan itu tulisan pendua dielakkan apabila rekod sudah betul.
- Migrasi yang terputus tidak mengaktifkan tetapan yang separuh disalin. Kredensial idMe tanpa frasa kunci keselamatan tidak dipindahkan; isi semula dalam **Akaun idMe**.
- **Matikan autostart Companion lama** hanya dibenarkan selepas HADIR Desktop benar-benar memegang klien backend yang sah (mulakan semula selepas menyimpan tetapan). **Pulihkan** tidak menimpa entri autostart lain dan mengekalkan sandaran jika pemulihan tidak dapat disahkan. Sandaran pertama tidak pernah ditimpa; jika entri autostart berubah semasa operasi, ia tidak dipadam.
- idMe/MOEIS kekal dalam WebView2 terbenam. Tetingkap baharu dan skema luaran (cth `microsoft-edge:`) disekat.
- Tetingkap Edge dengan amaran `--no-sandbox` datang daripada Companion lama (Playwright), bukan Desktop. Untuk menghentikannya: buka **Tetapan Tempatan** → **Matikan autostart Companion lama** (sandaran disimpan; **Pulihkan autostart Companion** membatalkannya). Proses Companion yang sedang berjalan tidak dihentikan; log keluar/mula semula Windows, atau tutup proses `node` Companion secara manual.

## 1.0.12 — Tetapan Tempatan dalam HADIR Desktop

- Menu dulang **Tetapan Tempatan** membuka dialog Windows untuk URL Apps Script dan rahsia enjin. Companion dan Edge tidak diperlukan.
- URL mesti endpoint Web App penuh `https://script.google.com/macros/s/{id-deployment}/exec` tanpa query, fragment, userinfo atau port bukan lalai. URL akar hos, `/exec` sahaja dan `script.googleusercontent.com/macros/echo` ditolak; fixture migrasi Companion memakai bentuk `/macros/s/{id}/exec` yang sama. Rahsia tidak dipaparkan; biarkan kosong untuk mengekalkan nilai sedia ada. Simpanan melindungi rahsia dengan DPAPI akaun Windows semasa dan mengekalkan medan tetapan serta klien pasangan yang lain.
- Selepas menyimpan, **mulakan semula HADIR Desktop** supaya klien backend menggunakan tetapan baharu. Kitaran biasa berjalan setiap 10 minit apabila pilihan automatik dihidupkan.
- Job `menunggu` disegarkan oleh Simpan kehadiran berikutnya sebelum klaim, pada baris dan ID yang sama. Simpan semua hadir membatalkan job menunggu; job yang sudah aktif menolak perubahan kehadiran sehingga selesai.

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

Kedua-duanya disimpan dalam `%LOCALAPPDATA%\HadirDesktop\idme-login.json`.
Menukarnya berkuat kuasa **serta-merta** — tiada mula semula perlu.

### Kitaran automatik (sejak 1.0.3)

Apabila sekurang-kurangnya satu daripada dua tetapan itu HIDUP, aplikasi
menjalankan kitaran sendiri:

- satu kitaran **45 saat** selepas aplikasi dimulakan (PC yang baru dihidupkan
  tidak menunggu lama untuk kerja yang sudah menunggu);
- kemudian **setiap 10 minit** (`KitaranAuto.SelangMinit` dalam
  `HadirDesktop\KitaranAuto.cs` — ubah di situ dan terbit semula jika perlu).

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
bukan bermakna pemasa mati. Selang biasa ialah kira-kira 10 minit ditambah
masa proses; jika log berhenti dikemas kini sedangkan tetapan HIDUP, semak
keadaan aplikasi.

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
