# Autohadir Cloud — Fasa 1 (SK Paya Redan, JBA5054)

Worker Cloudflare `autohadir-skpr-cloud` yang memegang **satu** sesi pelayar
Browser Run untuk pemilik sekolah, dengan panel berkunci, diagnostik agregat
dan serahan manual.

> **Perintis • Penghantaran automatik MATI.** Fasa 1 ialah panel sesi pemilik,
> **bukan** automasi kehadiran. Tiada laluan pelayan yang menulis kehadiran,
> tiada kredensial idMe disimpan, tiada sambungan GAS/AKSI/SEMAK, tiada cron.
> Aplikasi desktop Autohadir kekal laluan rasmi.

## 1. Komponen

| Fail | Peranan |
| --- | --- |
| `src/index.mjs` | Penghala Worker: pengendalian ralat global, pengepala keselamatan pada setiap respons, had badan 4 KiB, auth, relay ke DO. |
| `src/session.mjs` | Durable Object SQLite `SchoolSession` (singleton `idFromName('JBA5054')`): kitaran hayat sesi, belanjawan, had kadar, penggera. |
| `src/browser.mjs` | `acquire` dengan guardrails, Live View, pengesahan URL Live View, tangkapan skrin PNG. |
| `src/cdp.mjs` | Pembantu CDP satu-arahan dengan tamat masa dan pembersihan pendengar/soket. Hanya `Page.navigate` (URL enum), `Runtime.evaluate` (ungkapan tetap), `Page.captureScreenshot` (png). |
| `src/inspect.mjs`, `src/evaluator.mjs` | Pemilihan tab, ungkapan penilaian tetap, klasifikasi URL enum, pengesahan jenis keputusan. |
| `src/auth.mjs`, `src/crypto.mjs` | Tiket satu-kali, kuki sesi, CSRF, Origin. |
| `src/errors.mjs`, `src/http.mjs` | Ralat bertaip dengan mesej tetap; pembantu respons/badan. |
| `src/ui.mjs` | Panel BM (HTML/CSS/JS sebaris dalam modul, dihidang sebagai `/`, `/style.css`, `/app.js`). |
| `scripts/open-panel.py`, `Buka-Panel.cmd` | Pelancar pemilik Windows. |
| `scripts/check.mjs` | Semakan sintaks semua modul JS, `/app.js` yang dijana dan Python. |

Konfigurasi: `wrangler.jsonc` — akaun `dcb3aa58b278e9a5c46103139fbb3367`,
binding `BROWSER` (Browser Run), DO `SESSION` → `SchoolSession`
(`new_sqlite_classes`), `observability.enabled: false`,
`upload_source_maps: false`, tiada `triggers`, D1, KV, R2 atau `vars`.
Rahsia tunggal: `OWNER_KEY` (ditetapkan oleh pentadbir di luar repo).

## 2. Kitaran hayat sesi (DO)

Keadaan disimpan dalam storan DO (`session_state`, `daily_budget`,
`rate_gate`, `claimed_nonces`). Tiada keadaan penting dalam memori, jadi
instans DO baharu (diusir/sejuk) mematuhi semua had. Semua operasi mutasi
disirikan dalam satu giliran janji.

Fasa: `idle` → `acquiring` → `active` → `closing` → `idle`.

**Mula (`start`)**
1. Sasaran disahkan terhadap enum tetap **sebelum** apa-apa tindakan berbayar
   (`control` = `https://example.com`, `idme` = `https://idme.moe.gov.my/login`,
   `moeis` = `https://moeispel.moe.gov.my/sahsiah/kehadiran/pkhem/tabguru`).
2. `acquiring` belum tamat tempoh selamat → 409. `closing` → 409.
   `active` belum tamat → `getSession(sid)`: ada → guna semula (tiada
   pelancaran); `null`, rekod `endTime` positif yang sepadan dengan sid, atau
   mesej terminal `Session not found` daripada binding berwibawa → sesi tamat.
   Ralat lain/tamat masa → 503, sid dikekalkan, tiada pelancaran.
3. Semak had harian dan jeda 12 saat.
4. **Sebelum** `acquire` ditunggu: kiraan harian +1, cap masa had kadar,
   keadaan `acquiring` dan penggera keras (+15 minit) disimpan.
5. `acquire` membaling / tiada `sessionId` / melebihi 30 saat → kekal
   `acquiring` (tidak pasti). Pelancaran baharu disekat sehingga 15 minit
   penuh berlalu (lebih panjang daripada `keepAlive` 5 minit). Tiada cubaan
   semula automatik.
6. `sessionId` diterima → disimpan serta-merta (`active`, tarikh akhir = masa
   tempahan + 15 minit), **kemudian** navigasi: CDP `Page.navigate` ke URL enum
   tepat pada sasaran halaman asal, atau `devtools.newTarget(sid, url)` jika
   `acquire` tidak memulangkan sasaran. Keputusan navigasi ialah
   `sent`/`failed`/`uncertain` — **bukan** "halaman dimuatkan". Hanya
   "Semak halaman" mengklasifikasi halaman yang benar-benar dicapai. Navigasi
   gagal → 502, sid dan penggera dikekalkan.

**Tutup (`close`)** memanggil `closeSession(sid)` (boleh memulangkan
`closing`), kemudian mengesahkan `getSession(sid)` ialah `null`, rekod akhir
`endTime` positif untuk sid yang sama, atau ralat terminal `Session not found`
(tingkah laku binding sebenar yang disahkan pada 30 Oktober 2026). `connectionEndTime`
sahaja bukan bukti pelayar telah tamat. Hanya selepas itu keadaan dikosongkan.
Jika belum disahkan (masih wujud atau carian gagal): fasa `closing`, sid dikekalkan, penggera cuba semula
(30 s, berganda hingga 5 minit), dan `start` disekat. Tutup semasa
`acquiring` tidak memadam tempahan (tiada sid diketahui); tempahan hanya
dibersihkan selepas tempoh selamat.

**Penggera** membaca tarikh akhir yang disimpan: tidak menutup awal (jadual
semula ke tarikh akhir), menutup apabila tamat, mencuba semula `closing`, dan
membersihkan `acquiring` yang luput.

**Had 15 minit dikuatkuasakan pada setiap tindakan**, bukan hanya oleh
penggera: `navigate`/`inspect`/`liveview` selepas tarikh akhir → penutupan
serta-merta + 409 `session-expired`, walaupun penggera lewat.

**Had**: 8 **cubaan** pelancaran sehari (termasuk yang gagal) mengikut
`Asia/Kuala_Lumpur`; jeda 12 saat antara `acquire`/`navigate`/`inspect`/
`liveview`, ditempah sebelum panggilan jauh dan kekal walaupun panggilan
gagal. Tiada pilihan pintasan dalam kod produksi; ujian menggunakan jam
disuntik. Status (`GET /api/status`) membaca storan sahaja — tiada panggilan
pelayar, tiada penulisan. Lencana kiraan bukan anggaran kos.

## 3. Semak halaman

`devtools.listTargets(sid)` (sesi sendiri sahaja) → pilih tab: tab MOEIS
(selepas popup SSO) diutamakan, kemudian tab asal, kemudian tab pertama yang
dibenarkan. Beberapa tab MOEIS, kegagalan senarai tab, atau hos DOM ≠ hos
metadata ditanda `ambiguous`. Metadata sasaran tidak menyatakan tab "aktif",
jadi panel melaporkan *tab yang diperiksa*.

Ungkapan `Runtime.evaluate` tetap memulangkan boolean (borang idMe, medan kata
laluan wujud, sekatan/Imperva, CAPTCHA/OTP), satu kiraan pemilih MOEIS (hanya
pada hos `moeispel.moe.gov.my` tepat) dan `location.href`. Worker mengesahkan
jenis setiap medan (`=== true`, integer 0–5000) dan membuang yang lain.
`href` hanya dikelaskan kepada enum (`idme-login`, `idme-other`,
`moeis-attendance`, `moeis-other`, `control`, `blank`, `disallowed`, `unknown`)
dengan URL ternormal hos + laluan dikenali (laluan lain menjadi `/…`). Tiada
tajuk, query, HTML, nama, IC, kuki atau kata laluan dipulangkan atau disimpan.
"Halaman MOEIS dicapai" **bukan** pengesahan kehadiran.

## 4. Lihat sahaja dan kawalan manual

**Lihat sahaja** (`mode: readonly`): memohon `getLiveView` dengan
`guardrails: { mode: 'readonly' }`. Dokumentasi menyatakan guardrails Live View
ialah ciri REST sahaja, jadi URL hanya dipulangkan jika respons menggemakan
`options.guardrails.mode === 'readonly'` **dan** URL lulus pengesahan asal.
Jika tidak, panel jatuh balik kepada **tangkapan skrin statik**
(`Page.captureScreenshot`, PNG disahkan tandatangan dan ≤ 3 MiB):
`{ mode: 'snapshot', image: 'data:image/png;base64,…', warning }`. Tiada URL
interaktif dikeluarkan di bawah label baca-sahaja. Imej tidak disimpan
dalam DO, tidak dilog, dan dihantar `no-store`; panel memaparkannya dalam
modal dengan butang muat semula (tertakluk jeda 12 saat). Tangkapan gagal →
503.

**Kawalan manual** (`mode: manual`): memerlukan `manualConsent === true` pada
setiap permintaan (kotak semak dinyahtanda selepas setiap pautan). Pautan
memberi **kawalan penuh yang boleh MENULIS rekod** di portal; panel
menyatakannya dengan jelas. Tiada kata laluan dikendalikan oleh backend.
Panel tidak pernah klik apa-apa secara automatik.

URL Live View (kedua-dua mod) mesti bermula `https://live.browser.run/ui/`,
HTTPS, tanpa userinfo/port; `javascript:`, asal lain dan userinfo ditolak
502. URL ialah kredensial: tidak disimpan, tidak dilog, dibuka hanya melalui
pautan `rel="noopener noreferrer"` yang dibina dengan DOM dan dibuang selepas
60 saat. Pautan sah 60 saat (`expiresInMs`).

## 5. Pengesahan pemilik

**Tiket** = `b64url(JSON) + "." + b64url(HMAC-SHA256(OWNER_KEY ASCII, b64url(JSON)))`
dengan JSON `{"kind":"owner-login","nonce":<≥16 aksara [A-Za-z0-9_-]>,"iat":<s>,"exp":iat+90}`.
`POST /auth/exchange` (hanya `application/x-www-form-urlencoded`, medan
`ticket` tunggal) menyemak tandatangan (WebCrypto), jenis, iat/exp integer,
`iat ≤ now+5`, `exp ≤ now+120`, kemudian menuntut nonce secara atomik dalam
DO (maksimum 64 nonce hidup; luput dicantas). Kuki `__Host-autohadir`
(`HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`, `kind:
owner-session`) dan halaman `location.replace('/')` dengan nonce CSP.

Semua `POST` mutasi (`/api/session/*`, `/auth/logout`) memerlukan `Origin`
sama-asal tepat dan `X-Autohadir-CSRF` = `HMAC(OWNER_KEY, "csrf:"+nonce sesi)`.
`GET`/`HEAD` tidak pernah memulakan sesi.

**Sempadan input**: badan dibaca mengikut bait sebenar (pembaca dibatalkan
melebihi 4 KiB → 413). JSON ketat: kosong → `{}`, mesti objek, kunci di luar
senarai tindakan → 400 — disemak di Worker **dan** di DO. JSON rosak → 400.

**Ralat**: kod bertaip (`src/errors.mjs`) dengan mesej tetap; ralat tidak
dikenali → 500 generik. Mesej hulu (CDP, Browser Run) tidak pernah
dipulangkan. Setiap respons (termasuk 404/ralat) membawa `X-Frame-Options:
DENY`, `nosniff`, `Referrer-Policy: no-referrer`, CSP `frame-ancestors 'none'`;
API dan HTML `no-store`. `OWNER_KEY` tiada/pendek → 503 terkunci tanpa
butiran.

## 6. Pelancar pemilik (Windows)

`Buka-Panel.cmd` memilih CPython bukan Microsoft Store (runtime Hermes jika ada,
kemudian `python` yang lulus `--check-runtime`) dan menjalankan pelancar dengan `-I`.
Python Microsoft Store mengalihkan `LOCALAPPDATA` ke salinan maya; ia ditolak
supaya kunci DPAPI dan konfigurasi sentiasa dibaca dari laluan Windows sebenar.

- Konfigurasi awam: `%LOCALAPPDATA%\AutohadirCloud\config.json`
  `{"baseUrl": "https://autohadir-skpr-cloud.sekolah-3458-cm1.workers.dev"}`.
  `baseUrl` mesti tepat asal yang dibenarkan (HTTPS, tiada laluan/query/port/
  userinfo). Tiada nilai lalai senyap — konfigurasi tiada atau salah →
  ralat jelas, tiada tiket dijana.
- Kunci: `%LOCALAPPDATA%\AutohadirCloud\owner-key.dpapi` = output
  `CryptProtectData` (CurrentUser) bagi kunci ASCII mentah (bukan JSON).
  Dinyahsulit melalui ctypes dengan `argtypes`/`restype` eksplisit; penimbal
  dikekalkan hidup; output dikosongkan dan `LocalFree`.
- Pelayan sekali-guna pada `127.0.0.1:<rawak>/<laluan rawak>`: semakan Host
  (421), laluan lain 404, kaedah lain 405, tiada CORS, tiada log permintaan,
  `no-store`, CSP `script-src 'nonce-…'` + `form-action <asal>/auth/exchange`,
  `no-referrer`. Berhenti selepas satu hidangan atau 90 saat (gelung
  `handle_request`, tiada perlumbaan shutdown).
- Kunci dan tiket tidak pernah dicetak. Tiada mod CLI yang menerima kunci.

## 7. Operasi

```powershell
cd autohadir-cloud
npm ci
npm test          # ujian Node (termasuk ujian unit Python melalui python -I)
npm run check     # sintaks semua modul + /app.js dijana + Python
npm run build     # wrangler deploy --dry-run --outdir dist (wrangler 4.156.0 dipin)
```

Bukti RED/GREEN berada dalam `evidence/` (diabaikan git; data rekaan sahaja).

## 8. Had yang diketahui (belum dibuktikan / tidak dilaksanakan)

- **Perintis langsung 30 Oktober 2026:** Worker diterbitkan dan diuji dengan
  Browser Run sebenar: acquire, navigasi ke example.com, CDP inspect, guna semula
  sesi, Live View baca-sahaja dan penutupan yang disahkan lulus. Binding sebenar
  menggemakan `options.guardrails.mode === 'readonly'`; fallback PNG kekal diuji
  dengan fixture. Pelancar DPAPI → localhost sekali-guna → kuki HTTPS pemilik
  turut lulus hujung-ke-hujung; panel 390 px tiada limpahan/ralat JavaScript.
- **Gerbang portal BELUM lulus:** Live View idMe memaparkan
  **“Sekatan atas faktor keselamatan.”** dalam sesi ujian ini. URL yang betul
  bukan bukti borang login dicapai. Diagnostik mengesan frasa sekatan BM itu.
  Ini bukan bukti semua hos awan atau semua permintaan Cloudflare akan disekat.
  Tiada cubaan memintas, tiada login portal, tiada rekod kehadiran dihantar.
  Desktop kekal laluan operasi; cloud belum boleh menggantikannya.
- Log masuk idMe manual mungkin memerlukan hos tambahan (SSO/CDN) yang tidak
  ada dalam `allowedDomains`; ia akan disekat oleh guardrails dan dilaporkan,
  bukan diluaskan.
- Pengesanan tab "aktif" tidak boleh dipastikan daripada metadata sasaran;
  panel melaporkan tab yang diperiksa dan menanda keadaan samar-samar.
- Tiada pengesahan bahawa sesi Browser Run tidak terbiar selepas `acquire`
  yang tidak pasti; reka bentuk bergantung pada `keepAlive` 5 minit dan
  sekatan 15 minit, bukan pada senarai sesi akaun.
- Tiada penghantaran kehadiran, tiada penyimpanan kredensial idMe, tiada
  sambungan GAS/AKSI/SEMAK, tiada cron, tiada pintasan CAPTCHA/OTP.
