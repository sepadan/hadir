# Arahan kerja — HADIR

1. `BLUEPRINT.md` ialah rujukan utama untuk dalaman HADIR.
2. Repo ini awam. Jangan commit nama murid, IC/MyKid, PIN, token atau URL yang
   mengandungi rahsia.
3. Cache PWA hanya untuk aset statik. Permintaan API, sesi dan data murid tidak
   boleh dimasukkan ke Cache Storage.
4. Tab `main` KEHADIRAN ialah sumber rasmi murid. Penyelarasan ke AKSI/SEMAK
   mesti berkelompok, berlog dan tidak menyentuh markah atau rekod kokurikulum.
5. Fungsi kemas kini murid dalam aplikasi asal kekal tersedia.
6. Jalankan ujian dan kemas kini `BLUEPRINT.md` sebelum commit.

---

## Hab ekosistem

Sistem ini sebahagian daripada ekosistem data SK Paya Redan. Hab dokumentasi
memegang peraturan merentas sistem, kontrak antara sistem, akaun, dan **daftar
isu tunggal**:

**<https://sepadan.github.io/dashboard/BLUEPRINT.md>**

Baca hab sebelum menyentuh apa-apa yang menjejaskan sistem lain.

`BLUEPRINT.md` dalam repo ini ialah **jejari** — dalaman sistem ini sahaja.

### Dua peraturan yang mudah dilanggar tanpa sedar

**Isu dicatat di hab sahaja.** Jangan mulakan senarai "belum selesai", "langkah
seterusnya" atau "status" dalam repo ini. Empat senarai isu bermakna empat versi
kebenaran, dan percanggahan itu senyap.

**Jangan percaya `raw.githubusercontent.com`.** Ia pernah memulangkan salinan
seminggu lapuk dan menyesatkan satu sesi penuh. Untuk mengetahui keadaan
sebenar: `git ls-files` selepas `git pull`, atau baca melalui
`https://sepadan.github.io/<repo>/<fail>`.
