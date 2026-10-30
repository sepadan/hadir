# Sambungan Desktop melalui satu kod

Perubahan kerja pada `feat/desktop-connection-code`, belum dideploy atau
diterbitkan. Desktop 1.0.23 / aset web 1.11.41. Pelepasan oleh penyemak induk.

Admin HADIR log masuk seperti biasa, buka **Hantar ke MOEIS → Sambungan
Desktop**, jana dan salin satu kod. Pada PC sasaran buka **Tetapan Tempatan**,
tampal kod penuh dan tekan **Sambung**. Mulakan semula Desktop selepas simpan.
Dialog memaparkan URL deployment sasaran sebelum menyambung. Sasaran mesti
URL backend yang telah dikonfigurasi pada PC itu atau URL bootstrap tepat
yang dipin dalam binaan Desktop. Corak hos Google sahaja bukan kepercayaan.
Kod daripada deployment lain ditolak sebelum sebarang HTTP atau tulisan.
Penggantian sambungan sedia ada memerlukan pengesahan eksplisit, termasuk
apabila URL baharu juga dipercayai; cap fail diperiksa sebelum exchange dan
sebelum commit supaya perubahan serentak tidak ditimpa.

Akaun idMe, suis login/hantar, vault idMe dan migrasi kredensial tidak berubah.

Kod ialah rahsia pembawa: **tiada tarikh luput dengan sengaja**, sekali guna,
boleh dibatalkan oleh admin sebelum ditebus. Setiap PC memerlukan kod sendiri.
Kod hanya dipaparkan sekali dalam DOM; tidak disimpan dalam local/session
storage atau log. Meninggalkan pane atau log keluar membersihkannya dan
menolak respons lama. Permintaan daftar bernombor memastikan respons lama
juga tidak menimpa hasil revokasi yang lebih baharu. Salin kod hanya melalui
saluran peribadi. Salinan boleh masuk ke sejarah papan klip Windows dan
penyegerakan awan; amaran ini dipaparkan sebelum butang Salin. Bersihkan
sejarah papan klip selepas digunakan jika fungsi itu dihidupkan.

Daftar admin memaparkan ID legap, status kod dan peranti berdaftar. **Batalkan**
pada peranti menolak tokennya pada panggilan backend seterusnya. Status
“Dibenarkan” bermaksud token belum dibatalkan, bukan bukti PC sedang online.
Padankan ID dalam daftar dengan **ID PC** yang dipaparkan pada dialog
Tetapan Tempatan untuk mengenal pasti PC yang hendak dibatalkan. Kod terpakai
menyimpan `idPeranti` hasil penebusan. Tindakan **Batalkan PC terpaut** membatalkan
token itu secara langsung; operasi membatalkan kod menunggu menolak kod yang
sudah digunakan dan tidak menyamarkan sejarahnya sebagai kod batal.

## Protokol dan pengesahan

- `HC1.<base64url tanpa padding>` mengekod JSON `[endpoint, rahsia64hex]`.
  Maks 2,048 aksara selepas whitespace tampalan dibuang. Endpoint berasal
  daripada Script Property autoritatif `HADIR_SAMBUNG_EXEC_URL`, tanpa
  perkhidmatan hosting/resolver tambahan. Desktop menyemak versi, pengekodan
  kanonik, bentuk JSON, rahsia dan URL sebelum sebarang permintaan dihantar.
- URL asas hanya `https://script.google.com[:443]/macros/s/<ID selamat>/exec`.
  Userinfo, query, fragment, port lain, segmen tambahan/encoded dan hos lain
  ditolak. `/dev` dan `googleusercontent` bukan endpoint asas.
- `moeisSambungTukar(kod, mengganti, idPerantiLama)` menebus kod di bawah ScriptLock. Hash kod menunggu
  mesti sepadan; satu tulisan `HADIR_SAMBUNG_V1` menandakan kod digunakan DAN
  menyimpan hash token peranti. Tiada TTL. Dua penebusan bertindih hanya boleh
  menghasilkan satu token. Kegagalan selepas tulisan tetapi sebelum balasan
  meninggalkan kod digunakan dan peranti boleh dilihat/dibatalkan oleh admin.
- Balasan `{idPeranti, tokenPeranti}` membawa `HD1.<id32hex>.<rahsia64hex>`.
  Backend hanya menyimpan SHA-256 token penuh, bukan nilainya. Hanya RPC tugas
  MOEIS menerima token; token tidak memberi sesi admin. ID pemilik RPC ialah
  ID token, dikuatkuasakan pada backend; C# memetakannya secara automatik.
- Admin jana/senarai/batal menggunakan auth admin sedia ada di bawah kunci.
  Semakan token dan mutasi tugas berkongsi kunci dengan revokasi. Bacaan
  helaian senarai berada di luar kunci: semakan auth singkat sebelum bacaan,
  diikuti semakan token sekali lagi sebelum hasil peranti dipulangkan.
  Rahsia `HADIR_MOEIS_ENGINE_SECRET` terus diterima untuk instalasi lama dan
  tidak pernah dipulangkan melalui pairing. Tiada kaitan dengan leadership
  `pc*` yang masih dikawal flag sedia ada.
  Instalasi legasi belum mempunyai token individu dalam daftar ini; revokasi
  per-PC hanya terpakai selepas PC itu menggunakan pairing baharu.

## Rawak dan redirect: bukti platform

[Google Utilities](https://developers.google.com/apps-script/reference/utilities/utilities#getUuid())
menyatakan `getUuid()` setara dengan Java `UUID.randomUUID()`;
[Java](https://docs.oracle.com/javase/8/docs/api/java/util/UUID.html#randomUUID--)
menetapkan PRNG kriptografi. Pelaksanaan menggabungkan tiga UUID v4 (366 bit
rawak sebelum SHA-256), menyemak bentuk versi/variant serta pendua, kemudian
menghasilkan rahsia 256 bit. Tiada `Math.random`, seed masa, WebCrypto GAS
yang direka-reka atau perkhidmatan rawak jauh. Ini bergantung pada kontrak
platform yang didokumenkan; bukan audit pelaksanaan PRNG Google.

[Google Content Service](https://developers.google.com/apps-script/guides/content#redirects)
memerlukan redirect ke URL sekali guna `script.googleusercontent.com`.
`AppsScriptHttpHandler` **hanya untuk exchange pairing**, bukan trafik job
legasi/peranti yang sedia ada. Pengangkutan job biasa tidak diubah. Handler
exchange mematikan auto-redirect pada socket. Satu 302/303
sahaja diterima menuju HTTPS hos tepat `/macros/echo` dengan query
`user_content_key` + `lib` beraksara terhad, tiada userinfo/fragment/port lain.
Lompatan itu GET tanpa badan asal, token, kod, Authorization atau kuki.
307/308, hos/laluan lain dan redirect kedua ditolak. Bentuk echo tersebut
diuji dengan transport sintetik; tiada probe deployment sebenar dibuat.

## Storan, had dan pemulihan

Pada Windows, token menggantikan medan dalaman `rahsiaEnjin` dalam blob
DPAPI **CurrentUser** `rahsia.dat` milik Desktop. Nama medan dikekalkan untuk
keserasian stor/migrasi/pagar konfigurasi. Tiada plaintext fallback. URL
bukan rahsia kekal dalam `tetapan.json`; nilai token tidak pernah dipaparkan
semula. `ToString` konfigurasi dirahsiakan. Fail besar/JSON pendua/token
rosak gagal tertutup. JSON lain termasuk `klien` dikekalkan.

Sebelum exchange biasa **dan pemulihan**, Desktop menguji protect/unprotect
DPAPI CurrentUser serta tulisan fail probe disulit, flush tahan lama,
bacaan semula dan pembersihan. Ia juga menguji akses tulis fail sasaran;
probe tidak mengubah konfigurasi atau vault idMe. Kegagalan preflight tidak
menebus kod. Kegagalan cakera selepas preflight masih mungkin dan dilaporkan
sebagai hasil tidak pasti, dengan pautan kod?PC untuk pembatalan tepat.

Fail lama mesti boleh dibaca sebelum exchange biasa. Simpanan menggunakan
penggantian atomik setiap fail + penanda simpanan terputus dan bacaan semula.
**Pulihkan tetapan rosak** menggunakan kod baharu selepas pengesahan pemilik;
fail asal disandarkan dan disahkan sebelum diganti. Penanda migrasi tidak
dipadam oleh pairing; mula semula memuktamadkan data Desktop seperti dahulu.
Tiada import semula Companion atau perubahan idMe semasa pairing.

Penggantian disekat semasa kitaran/klaim tempatan aktif; sementara dialog
tetapan dibuka, tiada kitaran baharu boleh bermula. Penolakan auth eksplisit
(`Akses enjin MOEIS ditolak.` atau rahsia legasi belum ditetapkan) bermaksud
kredensial lama tidak lagi berfungsi, bukan bukti tugas sudah selesai. Ia
membenarkan pairing meneruskan ke semakan backend; ralat lain tidak dianggap
auth ditolak. Untuk token HD1, senarai tugas sekolah bukan bukti pemilikan:
exchange menghantar ID peranti lama (bukan token/rahsia) dan memeriksa hanya
`sedang_dihantar`/`tersimpan` milik ID itu di bawah ScriptLock yang sama dengan
klaim/revokasi. Tugas pemilik lain tidak menyekat PC ini. Token lama dibatalkan
dalam commit penggantian yang sama. Kod kekal sekali guna tanpa luput.

Timeout, rangkaian, balasan rosak dan ralat tidak dikenali menolak sebelum
kod ditebus secara lalai. Checkbox **Pemulihan: backend lama tidak dapat
dicapai** memerlukan pengesahan kedua, amaran hasil penghantaran tidak pasti,
PC lama dihentikan dan semakan admin. Pengesahan ini hanya membenarkan
semakan lama yang gagal dilangkaui; hasil semakan yang menunjukkan tugas aktif
tidak dilangkaui, dan guard backend sasaran masih wajib. Jika ID lama tidak
boleh dibaca, kredensial legasi atau deployment berubah, guard sasaran kekal
konservatif untuk semua tugas aktif kerana pemilik lama tidak dapat dipastikan.
Backend baharu tidak boleh membuktikan keadaan deployment lama: admin mesti
menyemaknya secara berasingan sebelum pemulihan. Tiada fail perlu dipadam dan
vault idMe tidak disentuh. Fallback manual legasi tidak mendapat bypass ini.

Admin membatalkan PC lama dahulu, menghentikan proses PC lama, kemudian
menekan **Asingkan tugasan untuk semakan manual** pada rekod PC dibatalkan.
Dialog pengesahan menerangkan bahawa kehadiran mungkin sudah tersimpan.
`moeisSambungAsingTugas(idPeranti, 'ASINGKAN TUGASAN UNTUK SEMAKAN MANUAL', tokenAdmin)`
memerlukan sesi admin sah dan menolak peranti yang masih aktif, di bawah
ScriptLock. Hanya tugas aktif milik ID tersebut menjadi `semakan_manual`;
status asal dicatat dalam mesej bersama amaran jangan hantar semula. Snapshot,
kehadiran, mesej asal, pemilik, lease dan masa selesai asal dikekalkan. Tugas
ini tidak boleh diklaim, dilengkapkan atau dicipta semula; simpan semula kelas
juga disekat. Pairing PC baharu boleh diteruskan, tetapi tiada tugas lama
dilepas ke giliran, tiada keputusan berjaya/gagal direka dan tiada penghantaran
automatik semula. Pemilik menyemak hasil sebenar secara manual dan mengarkibkan
bukti/snapshot sebelum sebarang pembetulan berasingan; tindakan quarantine
sendiri tidak menyelesaikan semakan itu. Tiada RPC automatik untuk menyahasing.

Rekod revoked yang masih memiliki tugas aktif dikekalkan dalam daftar supaya
tindakan admin ini kekal tersedia walaupun PC lain dipair. Had 12 rekod peranti
masih fail-closed; rekod revoked tanpa tugas aktif boleh dibuang ketika
exchange. Lease luput bagi pemilik peranti yang dibatalkan juga tidak boleh
diambil alih secara senyap, termasuk laluan verifikasi `tersimpan`.
Dialog sibuk hanya menangguh `UserClosing`, bukan shutdown Windows atau
penutupan aplikasi; penutupan itu membatalkan HTTP.

**Lanjutan (legasi)?** mengekalkan fallback manual URL + rahsia sedia ada,
dengan pin sasaran, pengesahan dan preflight yang sama. Ia untuk pemilik
instalasi legasi apabila GAS pairing belum tersedia, bukan pengedaran rahsia
bersama kepada PC baharu.

Exchange tidak dicuba semula secara automatik. Jika rangkaian terputus atau
DPAPI/cakera gagal selepas token dikeluarkan, semak daftar HADIR, batalkan
peranti baharu yang tidak digunakan dan jana kod baharu. Jangan padam stor
yang rosak untuk mendapatkan lalai. Konfigurasi lama yang sah terus berjalan
sehingga diganti; kegagalan separa ditandakan dan menghentikan penghantaran.

Registry terhad kepada 12 kod belum digunakan dan 12 peranti aktif, satu
property ASCII maks 8,000 bait (di bawah had property Google 9 KB). Semua
penebusan berkongsi had persisten 20/minit, termasuk kod salah; GAS tidak
menyediakan IP klien yang boleh dipercayai. Kerosakan atau kegagalan quota/
readback menolak operasi. Metadata kod terpakai/batal dikekalkan sebagai sejarah sehingga had 12
rekod kod memerlukan rekod bukan-menunggu tertua dibersihkan; peranti batal pada exchange seterusnya; hash yang tiada
tetap ditolak. Had global boleh digunakan untuk mengganggu pairing sementara.

DPAPI tidak melindungi daripada proses lain dengan akaun Windows yang sama.
Revokasi backend tidak boleh menarik balik HTTP atau tulisan portal yang
sudah bermula, atau secara fizikal menghentikan pelayar PC terputus rangkaian.
Token yang dibatalkan tidak boleh menyenaraikan, mengklaim, melepas atau
melaporkan tugas lagi. Tugas tidak pasti milik PC dibatalkan memerlukan semakan manual eksplisit; lease luput tidak menghalalkan penghantaran semula.

## Kontrak penerbitan dan pemulihan backend

GAS pairing diterbitkan dahulu pada deployment sekolah yang sedia ada,
dan pemilik menetapkan Script Property **bukan rahsia**
`HADIR_SAMBUNG_EXEC_URL` kepada URL `/exec` tepat yang diluluskan. Ketiadaan,
URL `/dev`, bentuk Workspace `/a/macros/?` atau URL tidak sah menolak Jana.
`getService().getUrl()` tidak digunakan. Exchange juga memerlukan authority
yang sah dan sepadan dengan endpoint dalam kod; perubahan konfigurasi
authority bukan luput masa, dan kod lama tidak boleh menukar sasaran sendiri. Desktop baharu diterbitkan hanya
selepas backend itu tersedia; URL bootstrap binaan dipadankan dengan URL
release. Perubahan URL bootstrap ialah keputusan release, bukan input kod
atau pilihan konfigurasi yang boleh meluaskan allowlist secara senyap.
Keserasian redirect exchange sebenar bukan dibuktikan oleh fixture sintetik;
pengangkutan job legasi tidak bergantung pada pengesahan baharu ini.

Ralat `[SAMBUNG_AUTH/ENDPOINT/INVALID_CODE/USED_CODE/ACTIVE_JOB/LIMIT/RATE/CORRUPT/BUSY/STORAGE]`
ialah kod tetap. UI memetakannya kepada mesej tetap yang berguna, tanpa
menggemakan teks backend mentah. Ralat tugas peranti mengekalkan alasan
server yang diketahui seperti tugas tiada, keputusan tidak sah dan klaim
bukan miliknya; teks tidak dikenali disanitasi.

Pemulihan storan GAS hanya oleh **pemilik projek dengan akses editor**, bukan
RPC awam atau tindakan biasa admin web. Hentikan kitaran Desktop dan pastikan
kesan tugas aktif diselesaikan dahulu. Fungsi persendirian
`hadirSambungPulihStoranPemilik_` mengambil ScriptLock, menyandar nilai mentah
ke `HADIR_SAMBUNG_PEMULIHAN_KADAR` atau `HADIR_SAMBUNG_PEMULIHAN_DAFTAR`,
membaca semula sandaran, kemudian menulis keadaan sah dan mengesahkannya.
Kegagalan quota/sandaran tidak mengosongkan rekod asal. Sandaran terdahulu
yang berbeza tidak ditimpa: eksportnya secara peribadi, semak dan arkibkan
sebelum pemilik membuang property sandaran itu untuk pemulihan berikutnya.
Jangan cetak atau log kandungan property.

Untuk kerosakan kadar sahaja, pemilik menjalankan wrapper editor sendiri
yang memanggil:

```javascript
hadirSambungPulihStoranPemilik_('kadar', 'SET SEMULA HAD KADAR DESKTOP');
```

Ini hanya memulihkan had kadar; kod/token sedia ada tidak diubah. Untuk
daftar rosak yang tidak boleh dipercayai, tindakan eksplisit ialah:

```javascript
hadirSambungPulihStoranPemilik_('daftar', 'BATALKAN SEMUA KOD DAN TOKEN DESKTOP');
```

Ini membatalkan **semua** kod dan token peranti dengan daftar kosong. Ia tidak
memainkan semula snapshot lama yang mungkin menghidupkan token dibatalkan.
Admin kemudian menjana kod baharu untuk setiap PC. Rahsia legasi, endpoint
autoritatif, sesi admin, data kehadiran dan vault idMe tidak disentuh. Jika
kedua-dua property rosak, setiap jenis dipulihkan secara eksplisit. Tiada
laluan pemulihan ini berada dalam jadual `hadirDoPost_`.

## Bukti ujian

`node --test tests/*.cjs` menjalankan GAS sebenar dalam VM dengan stor/kunci/
helaian sintetik. Ujian perlumbaan menyelitkan penebusan kedua tepat pada
commit daftar, selepas kod digunakan dan peranti ditulis bersama; penebusan
selepas pelepasan kunci turut ditolak. Liputan termasuk tiada luput (masa
20 tahun), endpoint autoritatif, revokasi, pemulihan, status kod terpakai,
had kadar, URL, response lapuk dan legasi.

`ConnectionCodeTests` meliputi pin bootstrap/backend semasa, persetujuan dan
cap konfigurasi, tugas aktif, whitespace, shutdown, redirect, preflight
normal/pemulihan, DPAPI sintetik terpencil serta C#?GAS sebenar melalui
stdin/stdout tanpa portal. Bukti perintah dan hasil ialah
[laporan pengesahan](CONNECTION-CODE-VERIFICATION.md).
