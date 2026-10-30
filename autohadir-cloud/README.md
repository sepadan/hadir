# Autohadir Cloud 1.1.0 — SK Paya Redan (JBA5054)

Perintis Worker `autohadir-skpr-cloud`: satu sesi Browser Run, panel pemilik,
aliran idMe → aplikasi MOEIS → bukti DOM kehadiran dan sekolah.
**Penghantaran automatik MATI.** Tiada kod dispatch/Simpan kehadiran,
GAS, giliran sekolah, cron, D1/KV/R2 atau import vault Desktop/DPAPI.
Desktop kekal laluan operasi. Perubahan ini belum dideploy.

Ujian binding/jam sintetik bukan bukti login hidup. Gerbang portal hidup
terdahulu memaparkan **“Sekatan atas faktor keselamatan.”** Tiada akses portal,
login hidup, kredensial sebenar atau rekod sekolah digunakan dalam perubahan
ini. Ujian DOM Chromium dan dry-run Wrangler belum lulus dalam sandbox
pembangunan ini; batas bukti diterangkan di bawah.

## Panel pemilik

`Buka-Panel.cmd` membuka panel melalui tiket HMAC sekali guna dan kuki HTTPS.
**Mula Autohadir** mencipta satu run. Kemajuan empat langkah dipaparkan;
Durable Object meneruskan run melalui penggera walaupun panel ditutup.
**Henti / Tutup sesi** membatalkan run dan meminta penutupan yang disahkan.

**Akaun idMe (cloud)** ialah bahagian pilihan yang dilipat. Pemilik menaip
pengenalan, kata laluan dan Kata Kunci Keselamatan sendiri dalam medan
bertopeng serta memberi persetujuan eksplisit: kredensial diproses/disimpan
disulit dalam akaun Cloudflare pemilik, bukan PC. Tiada nilai pramuat/import,
gema nilai, localStorage, sessionStorage atau analitik. Medan dikosongkan
selepas permintaan simpan. Simpan akaun tidak memulakan login. Tidak perlu
mendaftar akaun semasa portal disekat. Jangan beri kredensial melalui chat.

Opt-in **berasingan**, lalai MATI, membenarkan frasa imej/canvas yang tidak
boleh dibaca: tiada OCR/tekaan; perlindungan kemudian bergantung pada HTTPS
+ hos tepat dan kotak semak. Frasa yang dapat dibaca tetapi berbeza sentiasa
menghentikan login. CAPTCHA/OTP/2FA sebenar menghentikan run; canvas frasa
`#captcha` bukan CAPTCHA sebenar.

Diagnostik/kawalan manual dilipat. Semasa run aktif, inspect membaca cache;
start/navigate diagnostik dan Live View ditolak 409 supaya penggera tidak
kehilangan slot kadar atau bertukar tab. Kawalan manual selepas run memerlukan
persetujuan setiap pautan: ia boleh **MENULIS** rekod di portal. Penghantaran
automatik kekal MATI; jangan tekan Simpan kehadiran.

## Aliran produksi dan keselamatan DOM

Port daripada `desktop/HadirDesktop/IdMeLoginFlow.cs`, `IdMeLoginWebView2.cs`,
`IdMeLoginSafety.cs`, `AplikasiIdMe.cs`. `src/flow-dom.mjs` mengeksport satu
deklarasi fungsi tetap. CDP menerima `Runtime.callFunctionOn` hanya untuk
deklarasi tepat itu dan hujah yang disahkan, serta `Runtime.evaluate`
`globalThis` tetap untuk pemegang konteks. Tiada JS/URL/pemilih/CDP klien.

Urutan: navigasi sebenar idMe → borang IC → isi dan lanjut sekali → frasa →
`#check_log` → kata laluan benar-benar kelihatan dalam `#submit_form` → isi
dan klik Daftar Masuk aktif sekali (abaikan dummy `#log_disbale_form`) →
papan pemuka dengan anchor aplikasi → `list_aplikasi` → anchor MOEIS sebenar
sekali → pemerhatian hos MOEIS → URL kehadiran tetap → DOM kehadiran dan
**kedua-dua** identiti `JBA5054` serta `SK Paya Redan`.

Skrip menaip/klik menyemak HTTPS, hos tepat, port lalai, tiada userinfo,
sekatan dan CAPTCHA/OTP dalam skrip yang sama. Pemerhatian pra-tindakan mesti
lulus sebelum decrypt. Halaman awal yang disekat dilaporkan sebelum akaun
tiada, tanpa decrypt. URL, breadcrumb generik atau badan kosong tidak
membuktikan login. Frasa/teks/href bertoken/ralat skrip tidak keluar dalam
hasil DOM; hanya enum + boolean yang disanitasi.

Run baharu membuka idMe walaupun menggunakan sesi lama; sesi lama mendapat
tab idMe baharu milik run. Handoff memilih anchor mengikut keutamaan label
Pengurusan Murid/Modul Murid/MOEIS dan HTTPS hos tepat `moeispel.moe.gov.my`.
Href tidak disalin ke DO/log/status. Selepas popup, hanya tab milik run atau
satu tab MOEIS baharu yang tiada sebelum handoff boleh dipilih. Calon berganda
berhenti. Tiada navigasi kehadiran sebelum handoff dan pemerhatian MOEIS lulus.
Redirect tidak selamat/sekatan berhenti; tiada URL alternatif atau pintasan.

## Run berterusan dan had

`src/flow.mjs` menyimpan `login_flow`: stage, enum sebab, empat boolean
kemajuan, probeOnly, ID tab dalaman, revision akaun, masa tindakan seterusnya,
kaunter submission dan penanda in-flight. Status membaca cache sahaja.

- Satu run aktif; start pendua tidak mengubah pilihan probe.
- Satu tindakan mutasi setiap sambungan penggera; jeda 12 saat ditempah dalam
  `rate_gate` sebelum peringkat jauh, kekal merentas restart. Pemerhatian
  keselamatan dan tindakan yang dipagarnya berada dalam peringkat sama;
  tindakan seterusnya menunggu sekurang-kurangnya 12 saat lagi.
- Maksimum dua submission per run: satu IC dan satu kata laluan. Tiada
  replay submission/handoff/navigasi tidak pasti. Penanda in-flight disimpan
  sebelum dispatch; cold restart berhenti jika hasil belum direkod.
  Pemerhatian belum sedia ditinjau maksimum lima kali per stage tanpa replay.
- Simpan/padam akaun membatalkan run kredensial dan mengikat run kepada satu
  revision; IC lama tidak boleh dipasangkan dengan kata laluan baharu.
- Hanya penolakan eksplisit selepas submission kata laluan menambah
  `account_rejections`; dua penolakan tersimpan menyekat login automatik
  seterusnya. WAF/ralat rangkaian tidak menambah kiraan. Tiada API reset atau
  reset senyap ketika simpan/padam akaun.
- Cancel/close menanda pembatalan sebelum menunggu giliran. Guard diperiksa
  semula selepas await dan sebelum penghantaran CDP. Arahan yang SUDAH
  dihantar tidak boleh ditarik balik; hasil tidak pasti tidak dimainkan semula.
- Penggera memilih min(masa tindakan, deadline sesi). Acquiring tidak pasti
  dan closing retry mempunyai keutamaan. Kemajuan sejarah kekal selepas run;
  readiness tamat selepas close/expiry/navigasi diagnostik/kawalan manual.

Had sedia ada kekal: **8 cubaan pelancaran sehari KL**, hayat dinding 15 minit,
keepAlive 5 minit. Tempahan kiraan/kadar/acquiring/penggera berlaku sebelum
acquire. Acquire tidak pasti menyekat pelancaran 15 minit. Carian tidak pasti
mengekalkan sid. Close disahkan hanya oleh null, ralat terminal `Session not
found`, atau endTime positif bagi sid sama; connectionEndTime sahaja bukan
bukti. Closing mencuba sid sama selepas 30 s, berganda hingga 5 minit.
Tiada had dilonggarkan untuk ujian.

## Vault dan pengesahan

`src/vault.mjs`: WebCrypto HKDF-SHA256 daripada `OWNER_KEY`, salt
`autohadir-cloud:v1`, info/AAD `autohadir-cloud:v1:idme-vault:JBA5054`,
AES-256-GCM, IV rawak 12 bait. `cloud_account` dalam DO menyimpan revision
rawak dan envelope `{version:1,iv,ciphertext}` sahaja. Tamper/kunci salah
gagal tertutup; tiada plaintext fallback. Rotasi OWNER_KEY memerlukan
pendaftaran semula akaun. API metadata akaun hanya `{configured:boolean}`;
tiada ciphertext, pengguna, kata laluan atau frasa dipulangkan.

Tiket sekali guna 90 s, kuki `__Host-autohadir` HttpOnly/Secure/SameSite=Strict
8 jam dan CSRF HMAC per-sesi kekal. Mutasi flow/vault memerlukan sesi pemilik,
Origin sama-asal tepat dan CSRF di **Worker dan DO**; header asal diteruskan.
Whitelist JSON, jenis dan panjang disemak di kedua-dua sempadan, badan
maksimum 4 KiB. Ralat tetap tidak membawa mesej hulu. HTML/API no-store, CSP,
DENY, nosniff, no-referrer kekal. Observability dan source maps MATI;
allowedDomains tidak diluaskan: idMe, MOEIS dan example.com tepat sahaja.

## Kontrak API 1.1

Semua POST JSON memerlukan kuki pemilik, `Origin` tepat dan
`X-Autohadir-CSRF` daripada GET `/api/status`. Medan tambahan ditolak 400.

| Kaedah/laluan | Badan | Hasil |
| --- | --- | --- |
| GET `/api/status` | — | status sesi + `flow`, `account`, `csrf`, `version`, `automaticSending:false`; tiada tindakan pelayar |
| GET `/api/account/status` | — | `{ok:true,account:{configured:boolean}}` |
| POST `/api/account/save` | `{identifier,password,phrase,consent:true,allowUnreadablePhrase:boolean}` | `{ok:true,account:{configured:true}}`; tiada auto-login |
| POST `/api/account/delete` | `{}` | `{ok:true,account:{configured:false}}` |
| POST `/api/flow/start` | `{}` atau `{probeOnly:boolean}` | `{ok:true,reused:boolean}` segera; kerja melalui penggera |
| POST `/api/flow/cancel` | `{}` | `{ok:true}`; tiada lagi tindakan run, sesi masih boleh ditutup |
| POST `/api/session/close` | `{}` | `closed`, `closing`, `idle` atau `acquire-uncertain`; turut membatalkan run |

Panjang identifier 1–128, password 1–512, phrase 1–160; string bukan kosong,
aksara kawalan ditolak. Identifier/phrase ditrim; password dikekalkan.
consent mesti boolean true; allowUnreadablePhrase mesti boolean.

`flow`: null atau `{status,stage,reason,probeOnly,submissions,steps,startedAt,
nextAt,ready}`. Status `running|stopped`. Stage:
`begin|login|identifier|verification|password|dashboard|applications|
application-list|handoff|handoff-result|attendance-result`.
Sebab terminal termasuk `ready`, `login-form-ready`, `probe-complete`,
`needs-account`, `portal-blocked`, `human-required`, `phrase-mismatch`,
`phrase-unreadable`, `credential-rejected`, `vault-unavailable`,
`account-changed`, `action-uncertain`, `page-not-ready`, `ambiguous-tab`,
`school-mismatch`, `untrusted-page`, `cancelled`, `expired`, `session-ended`.
Sebab lain juga enum tetap, tidak pernah rentetan portal.

**Probe pemilik:** POST `/api/flow/start` `{probeOnly:true}`. Ia membuka idMe
dan menjalankan guards sama tetapi **tidak pernah** decrypt, isi IC/password,
tanda kotak, submit atau handoff SSO walaupun akaun disimpan semasa run.
Borang login → `login-form-ready`; halaman lain → `probe-complete`; sekatan
mengatasi kedua-duanya. Tiada dakwaan auth. Start pendua tidak menukar probe
menjadi login; cancel kemudian start baharu eksplisit diperlukan.

API diagnostik lama `/api/session/start {target}`, `/navigate {target}`,
`/inspect {}`, `/liveview {mode,manualConsent}` kekal. Target hanya enum
`control|idme|moeis`, bukan URL klien. Readonly memerlukan gema
`options.guardrails.mode==='readonly'`; jika tiada, fallback PNG ≤3 MiB.
URL hanya `https://live.browser.run/ui/…`, tidak dilog/disimpan; pautan UI
dibuang selepas 60 s. Laluan penghantaran kekal 404/405.

## Ujian dan bukti pembangunan

```powershell
cd autohadir-cloud
npm.cmd test
npm.cmd run check
npm.cmd run build
node --test tests/flow.test.mjs tests/vault.test.mjs tests/flow-command.test.mjs
node --test tests/dom-browser.test.mjs
```

`tests/helpers/fakes.mjs` menyuntik jam/storage/binding; tiada pintasan
produksi. `flow.test.mjs` memajukan jam ke alarm tersimpan dan mencipta DO
baharu pada setiap tick. `dom-browser.test.mjs` memanggil deklarasi DOM
produksi melalui CDP dalam Chrome baharu dengan profil temp terasing,
Fetch interception bagi setiap fixture dan abort URL lain. Ia ditulis untuk
rantaian dua peringkat, tab MOEIS lama, popup, frasa/canvas, checkbox/password
tersembunyi, butang dummy, sekatan/OTP, DOM tidak jelas dan paparan 390 px.
`FIXTURE_CHROMIUM` boleh memilih executable Chromium setempat. Tiada profil
pengguna diimport, `--no-sandbox` atau perubahan fingerprint produksi.

Bukti sebenar di `evidence/` (diabaikan git):

- `flow-red-01.log` → `flow-green-01.log`: vault dan start persisten.
- `flow-red-02.log` → `flow-green-02.log`: mesin keadaan/pembatalan/probe.
- `flow-api-ui-red.log` → `flow-api-ui-green.log`: API dan UI.
- `flow-popup-red.log` → `flow-popup-green.log`: target popup menjadi target sesi.
- `flow-cdp-context-red.log` → `flow-cdp-context-green.log`: pemegang objek DOM
  digunakan pada sambungan CDP yang sama, dengan pengawal cancel sebelum send.
- `flow-extended.log`: guard tambahan, ralat/tamper dan cancel sebelum send.
- `test-final.log`, `check-final.log`, `web-final.log`, `build.log`: keputusan akhir.

Semakan pelaksana dalam sandbox asal memang gagal memulakan renderer dan
bundler. Semakan ketua di luar sandbox kemudian **menjalankan semuanya**:
`npm test` lulus tanpa skip, termasuk Chromium sebenar bagi rantaian login,
popup/tab sama, sekolah salah/footer/picker, spoof hos, CAPTCHA/OTP dan
paparan 390 px. `npm run check`, dry-run Wrangler dan regresi web/Python
pelancar turut lulus. Profil ujian terasing menggunakan proxy loopback mati
serta resolver deny-all di samping Fetch interception; fixture tidak boleh
menghubungi portal sebenar.

Semakan Opus dan ketua menemui serta membaiki dua kecacatan yang tidak
tertangkap fake awal: objectId CDP mesti kekal pada satu sambungan, dan
`keep_names:false` diperlukan supaya serialisasi fungsi DOM tiada helper
`__name` luar. Kedua-duanya diuji dengan skrip produksi/bundle dalam Chromium.
Cubaan akaun kini ditempah secara persisten **sebelum tindakan kredensial**;
hasil timeout/tidak pasti tetap menggunakan belanjawan dua cubaan, walaupun
run dimulakan semula. Ia hanya dipulihkan melalui enrollment eksplisit atau
bukti dashboard sah. Tiada dakwaan bahawa ujian fixture membuktikan login
portal hidup; penerimaan idMe/MOEIS mesti disahkan berasingan.

## Keputusan produksi — 30 Oktober 2026

Versi **1.1.0 sudah diterbitkan** ke Worker sekolah yang sama; deployment
100% disahkan semula melalui API Cloudflare. Satu run `probeOnly:true`
berjalan autonomi melalui alarm DO dan Browser Run sebenar. idMe `/login`
masih menunjukkan **“Sekatan atas faktor keselamatan.”** Aliran berhenti
sebelum login; tiada decrypt/fill/submit/SSO dalam mod probe, tiada akaun
cloud didaftarkan dan tiada kehadiran dihantar. Sesi ujian ditutup dan idle
disahkan. Panel telefon, keselamatan API dan pelancar DPAPI → HTTPS lulus.

Kod aliran login/SSO kini dibina dan diuji, **bukan bukti portal menerima
login cloud**. Jangan isi kredensial untuk cuba mengatasi halaman sekatan.
HADIR Desktop kekal laluan operasi; penghantaran cloud masih MATI.
