# Bukti pengesahan sambungan Desktop

Branch kerja `feat/desktop-connection-code`, belum commit/deploy/push.
Ujian hanya data sintetik, stor sementara, handler HTTP palsu atau paip
stdin/stdout ke GAS dalam VM. Tiada portal, kredensial sebenar, pemasangan,
cloud source atau worktree lain disentuh. Tiada rangkaian digunakan dalam
pembetulan semakan ini; ujian pelayan tempatan lama dibatasi sandbox.

## Bukti sebelum pembetulan semakan

Penulis asal menjalankan Node 60/60 dan ujian pairing Desktop 20/20 melalui
jalan Roslyn/VSTest. Suite alternatif tempatan ketika itu mempunyai 45
kegagalan fixture HttpListener. **Parent kemudian melaporkan** perintah
standard `dotnet test desktop/HadirDesktop.sln` di luar sandbox lulus
sepenuhnya, 0 gagal/skip dan exit 0, bersama suite Node dan diff check.
Itu bukti parent bagi revisi sebelum pembetulan semakan, bukan dakwaan
bahawa pembetulan selepasnya telah diuji parent.

Review Opus 5.5 memberi keputusan belum sedia. Regresi baharu bagi endpoint
autoritatif, kaitan kod→PC dan alasan ralat mula-mula menghasilkan Node
7 lulus/3 gagal sebelum kod diperbetulkan. Ujian C# awal turut merekod
penolakan pada aliran positif lama yang belum memberikan persetujuan;
fixture positif kini memberikan persetujuan yang nyata, sementara ujian
negatif memastikan ketiadaan persetujuan atau pin tidak boleh dilangkau.
Tiada assert keselamatan lama dibuang untuk menghijaukan suite.

## Hasil pembetulan semakan

Pembetulan meliputi pin backend semasa/bootstrap, sasaran dan pengesahan
penggantian, cap fail sebelum/selepas exchange, sekatan tugas aktif,
endpoint GAS autoritatif, fallback manual legasi eksplisit, skop handler
exchange sahaja, kaitan kod terpakai→PC, preflight DPAPI/tulisan pada kedua-dua
mod, whitespace tampalan, CloseReason shutdown, respons daftar bernombor,
amaran papan klip, ralat tetap bersanitasi dan pemulihan storan oleh pemilik.
Ujian perlumbaan kini menyelitkan pesaing pada commit **registry**, bukan
pada tulisan had kadar. Bacaan helaian diuji tanpa ScriptLock, dengan
revokasi semasa bacaan menolak hasil dan mutasi seterusnya.

Perintah menggunakan aset NuGet yang parent telah restore; tiada restore
atau rangkaian diperlukan:

```powershell
node --test tests/*.cjs
node --check app.js
node --check service-worker.js
git diff --check

dotnet build desktop/HadirDesktop.sln --no-restore --verbosity minimal -p:TargetPlatformMoniker=Windows%2CVersion=7.0 -p:TargetPlatformDisplayName=Windows

dotnet test desktop/HadirDesktop.sln --no-restore --filter 'FullyQualifiedName~ConnectionCodeTests|FullyQualifiedName~PagarKonfigurasiBackendTests|FullyQualifiedName~PemulihanTetapanTests|FullyQualifiedName~RahsiaEnjinStoreTests|FullyQualifiedName~BarStatus_SenarioTerburuk' --verbosity minimal -p:TargetPlatformMoniker=Windows%2CVersion=7.0 -p:TargetPlatformDisplayName=Windows

dotnet test desktop/HadirDesktop.sln --no-restore --filter 'FullyQualifiedName!~BenderaVersi_ExeSebenar' --verbosity minimal -p:TargetPlatformMoniker=Windows%2CVersion=7.0 -p:TargetPlatformDisplayName=Windows --logger 'trx;LogFileName=review-final.trx' --results-directory desktop/HadirDesktop.Tests/bin/review-evidence
```

Parameter platform mengelakkan carian SDK pada profil pengguna yang tidak
boleh dibaca dalam sandbox; ia tidak mengubah SDK, profil atau produk.
Percubaan standard tanpa parameter tersebut masih memberi `MSB4184` pada
`GetPlatformSDKDisplayName` kerana direktori SDK profil tidak boleh diakses.
Kompilasi pembetulan menggunakan MSBuild/dotnet sebenar, bukan stub Roslyn.

Hasil direkod bagi larian semakan:

- `node --test tests/*.cjs`: 69 lulus, 0 gagal/skip.
- Binaan dotnet di atas: 0 ralat; 1 amaran CS8619 sedia ada pada MainForm.
- Filter ujian pairing/pagar/pemulihan/stor dan satu regresi layout lama: 119 lulus, 0 gagal/skip.
- Suite desktop luas, mengecualikan pelancaran exe `--versi`: 1,169 lulus,
  45 gagal, 0 skip daripada 1,214. Kesemuanya ialah
  `System.Net.HttpListenerException: The handle is invalid` pada
  `HttpListener.Start()`. Larian pertengahan turut menunjukkan satu kegagalan
  layout bar status lama (expected 260, actual 1); ia lulus dalam filter fokus
  dan tidak berulang pada larian luas akhir ini.

Tiada pelancaran Program/MainForm Desktop dilakukan; ujian yang melancarkan
exe `--versi` dikecualikan secara eksplisit. Ujian dialog sintetik luar skrin
bukan startup Desktop dan tidak mengakses profil WebView2/idMe. Laporan
sebenar disimpan dalam folder diabaikan Git
`desktop/HadirDesktop.Tests/bin/review-evidence/`, dan log suite luas ialah
`desktop/HadirDesktop.Tests/bin/review-final.log`.

Bukti paparan asal: Edge fixture 390×844 mempunyai `innerWidth=390` dan
`scrollWidth=390`; jana/sembunyi kod diperhatikan. Browser tool ketika itu
tersekat pada confirm fixture revoke. Pembetulan semakan ini tidak membuka
browser atau portal lagi. Layout dialog dipastikan semula melalui ujian
luar skrin; ia memaparkan sasaran dan Lanjutan. Redirect exchange Google,
GAS sebenar dan penggunaan produksi bukan dibuktikan oleh fixture. Kontrak
release GAS-dahulu dinyatakan dalam [kontrak sambungan](CONNECTION-CODE.md).


## Fail berkaitan

Web/backend: `app.js`, `index.html`, `styles.css`, `config.js`,
`service-worker.js`, `apps-script/HadirWeb.gs`.

Desktop: `ConnectionCode.cs`, `EngineSettingsDialog.cs`,
`LegacyConnectionDialog.cs`, `HadirBackendClient.cs`, `MainForm.cs`,
`PagarKonfigurasiBackend.cs`, `RahsiaEnjinStore.cs`, `HadirDesktop.csproj`
dalam `desktop/HadirDesktop/`.

Regresi: `desktop/HadirDesktop.Tests/ConnectionCodeTests.cs`,
`tests/connection-code.test.cjs`, `tests/connection-rpc.test.cjs`,
`tests/connection-ui.test.cjs`, serta fixture sintetik dalam `tests/fixtures/`.
Blueprint, README backend/akar, panduan pemasang/kemas kini dan dokumentasi
sambungan dikemas kini dalam perubahan yang sama.


## Pembetulan delta: re-pair kredensial lama dibatalkan/rosak

Parent melaporkan standard penuh `dotnet test desktop/HadirDesktop.sln` dan
Node lulus selepas perubahan semakan terdahulu, sebelum delta ini. Itu bukti
larian parent bagi revision sebelumnya, bukan dakwaan standard penuh dijalankan
semula di sandbox ini.

RED: dua regresi RPC baharu gagal (unrelated owner dan quarantine tiada); ujian
C# revoke -> re-pair sebenar gagal dengan `Semakan tugasan lama gagal`.
Regresi klasifikasi rahsia legasi belum ditetapkan turut gagal sebelum pemetaan
tepat ditambah. Regresi lease luput revoked gagal kerana enjin lain mendapat
klaim; guard revoked membetulkannya. Tiada ujian lama dilonggarkan; liputan
Simpan aktif diperluas kepada `semakan_manual`.

GREEN delta, data sintetik sahaja:

- `node --test tests/*.cjs`: 74 lulus, 0 gagal/skip.
- Filter fokus sama seperti perintah di atas: 128 lulus, 0 gagal/skip.
  Termasuk tiga integrasi dispatcher GAS sebenar -> C# -> DPAPI: token revoked,
  token masih sah dengan owner lain aktif, dan backend lama tidak dicapai dengan
  persetujuan pemulihan. Ketiganya menyambung token baharu pada stor PC sama,
  mengekalkan idMe dan menolak token lama selepas penggantian.
- `dotnet build` dengan `--no-restore` dan parameter platform di atas:
  0 ralat, 0 amaran pada binaan incremental akhir. Kompilasi sebelumnya masih
  menunjukkan CS8619 sedia ada pada MainForm.
- Suite desktop luas dengan filter tidak melancarkan exe: 1,176 lulus,
  45 gagal, 0 skip daripada 1,221. Semua 45 mesej kegagalan tepat
  `System.Net.HttpListenerException : The handle is invalid.` pada fixture
  HttpListener sandbox. Dua variasi integrasi C# terakhir ditambah selepas
  larian luas dan disahkan dalam filter fokus 128; kod produk tidak berubah.
- `node --check app.js`, `node --check service-worker.js`, `git diff --check` lulus.

Log sebenar (diabaikan Git): `desktop/HadirDesktop.Tests/bin/delta-node.log`,
`delta-focused.log`, `delta-final.log`, dan
`desktop/HadirDesktop.Tests/bin/delta-evidence/delta-final.trx`.
Layout dialog sintetik luar skrin dilihat semula: checkbox pemulihan dan semua
butang muat dalam 660x540. UI web quarantine diuji melalui DOM sintetik dengan
penolakan confirm, confirm sah, token sesi dan label PC terpaut; browser 390px
tidak dibuka semula dalam delta ini. Row sedia ada menggunakan flex-wrap dan
label ID overflow-wrap. Tiada startup Desktop, vault sebenar atau rangkaian.

Authority Script Property, smoke redirect hidup dan GAS-dahulu kekal syarat
release oleh parent seperti kontrak; tiada deploy/commit/push dibuat.
