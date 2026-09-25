# HADIR Desktop — pemasangan di PC sekolah

Pakej ini mengandungi **HADIR Desktop** sahaja. Tiada Node, tiada Companion,
tiada Edge automatik, tiada data rahsia di dalamnya.

## Kemas kini selepas dipasang

Selepas dipasang, aplikasi ini boleh menerima keluaran baharu sendiri:

1. Klik kanan ikon **HADIR Desktop** dalam dulang sistem.
2. Pilih **Semak kemas kini…**.
3. Jika ada versi baharu, tekan **Yes** pada tawaran itu. Fail dimuat turun dan
   disahkan (panjang + SHA256), kemudian aplikasi ditutup, exe lama disandarkan
   sebagai `HadirDesktop.exe.bak-<versi>`, exe baharu dipasang, dan aplikasi
   dibuka semula.

Kemas kini hanya datang daripada manifest awam
`https://sepadan.github.io/hadir/desktop/kemas-kini/latest.json` dan aset
keluaran GitHub repo `sepadan/hadir`. Tiada rahsia, kredensial atau data murid
dihantar semasa semakan — ia hanya permintaan GET biasa.

## Apa yang ada dalam pakej

| Fail | Guna |
|---|---|
| `HadirDesktop.exe` | Aplikasi (self-contained — tiada pemasangan .NET diperlukan) |
| `PASANG.cmd` | **Klik dua kali fail ini** untuk memasang |
| `setup.ps1` | Pemasangan sebenar (dijalankan oleh `PASANG.cmd`) |
| `update.ps1` | Kemas kini kemudian (ganti exe, dengan sandaran + SHA256) |
| `hentikan-hadir.ps1` | Fungsi kongsi untuk `setup.ps1`/`update.ps1` |
| `KEMASKINI.md` | Panduan kemas kini, rollback dan penyelenggaraan penuh |

## Langkah pemasangan (PC baharu)

1. **Salin folder pakej ini ke PC itu** (kunci USB atau muat turun).
2. **Klik dua kali `PASANG.cmd`.**
   - Ia menghentikan HADIR Desktop yang sedang berjalan (jika ada).
   - Ia menyalin exe ke `%LOCALAPPDATA%\HadirDesktop\`.
   - Ia mencipta pintasan **HadirDesktop** di Desktop.
   - Ia bertanya sama ada mahu mula bersama Windows — jawab `y` untuk PC
     kehadiran, `n` jika tidak mahu autostart.
   - Ia melancarkan aplikasi sekali.
3. **Isi tetapan sambungan pada PC itu sendiri** (tidak boleh disalin dari PC
   lain):
   - Klik ikon dulang HADIR Desktop → **Tetapan Tempatan**.
   - **URL API**: endpoint Web App penuh
     `https://script.google.com/macros/s/<id-deployment>/exec`
   - **Rahsia enjin**: nilai `HADIR_MOEIS_ENGINE_SECRET` daripada
     *Script Properties* projek Apps Script HADIR.
   - Simpan, kemudian **mulakan semula HADIR Desktop**.
4. **Masuk akaun idMe** melalui ikon dulang → **Akaun idMe…** (login dibuat
   dalam tetingkap terbenam HADIR Desktop sendiri).
5. **Sahkan**: label Backend pada tetingkap utama mesti menunjukkan klaim &
   hantar **AKTIF**, dan masa **Kitaran seterusnya** muncul.

## Perkara yang perlu ada pada PC itu

- Windows 10/11 (64-bit).
- **Microsoft Edge WebView2 Runtime** — sudah ada pada Windows 11 dan pada
  Windows 10 yang dikemas kini. Jika tiada, pasang "Evergreen Standalone
  Installer" daripada Microsoft, kemudian jalankan `PASANG.cmd` semula.
- Ruang cakera ~200 MB.

## Jangan salin fail rahsia antara PC

Jangan sekali-kali menyalin `rahsia.dat`, `kredensial.dat`, `tetapan.json`
atau folder `%LOCALAPPDATA%\HADIR-MOEIS-Companion\` daripada PC ini ke PC
sekolah:

- Blob DPAPI hanya boleh dibaca oleh **akaun Windows yang membuatnya** — pada
  PC lain ia gagal dinyahsulit dan aplikasi akan gagal-tertutup.
- Rahsia backend ialah **satu rahsia sepasukan**; ia ditaip pada setiap PC,
  tidak diedarkan sebagai fail.

Setiap PC mempunyai keahlian sendiri. Desktop **tidak** menyalin apa-apa
daripada Companion pada PC yang tiada Companion — tiada Companion, tiada
masalah.
