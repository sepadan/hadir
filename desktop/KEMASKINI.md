# Kemas kini HadirDesktop

Panduan ringkas untuk PC sekolah. Semua arahan dijalankan dari folder
`desktop\` dalam repo ini, guna PowerShell.

## 1.0.11 — Tetapan tempatan kekal dalam HADIR Desktop

- Log masuk manual idMe dalam Tetapan Tempatan kini menavigasi WebView2 HADIR Desktop yang sama; kawalan yang melancarkan Edge dari halaman itu dibuang.
- Jika Companion belum berjalan, Desktop memaparkan panduan ringkas di dalam WebView2 dan bukannya halaman ralat sambungan.
- Companion mesti berjalan untuk menyimpan tetapan tempatan; halaman offline menerangkan perkara itu dan tidak membuka pelayar luar.
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
bukan bermakna pemasa mati. Jika tiada baris baharu selama lebih 10 minit
sedangkan tetapan HIDUP, barulah ada masalah.

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
