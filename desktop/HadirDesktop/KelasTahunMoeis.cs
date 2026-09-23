using System;
using System.Globalization;

namespace HadirDesktop;

/// <summary>
/// Hasil penerbitan (tahun, kelas) MOEIS daripada SATU nama kelas HADIR.
/// <c>Ok=false</c> bermakna nama itu tidak dapat difahami — <see cref="Sebab"/>
/// menerangkan kenapa. Tiada tekaan senyap: pemanggil yang gagal tidak boleh
/// meneruskan dengan separuh jawapan.
/// </summary>
public sealed record TerbitanKelasMoeis(bool Ok, string Tahun, string Kelas, string Sebab);

/// <summary>
/// HADIR menyimpan satu label sahaja ("PRASEKOLAH", "1 BIJAK", "6 BIJAK"),
/// tetapi halaman MOEIS memisahkannya kepada DUA dropdown:
///
///   <c>#txtThnting</c>  — PRASEKOLAH / TAHUN SATU … TAHUN ENAM / KELAS KHAS RENDAH
///   <c>#txtNamakelas</c> — nama kelas SAHAJA selepas tahun dipilih (cth "BIJAK")
///
/// Tanpa pemisahan ini, "1 BIJAK" dipadankan bulat-bulat terhadap senarai kelas
/// yang berbunyi "BIJAK" dan tiada apa-apa yang padan (kegagalan hidup 23/09:
/// <c>status=kelas-tidak-dipilih, sebab=kelas tidak dijumpai dalam senarai
/// MOEIS: 1 BIJAK</c>).
///
/// Fungsi ini TULEN: tiada DOM, tiada rangkaian, tiada keadaan.
/// </summary>
public static class KelasTahunMoeis
{
    public const int TahunMin = 1;
    public const int TahunMaks = 6;

    /// <summary>Teks pilihan <c>#txtThnting</c> mengikut angka 1..6 (disahkan terhadap DOM sebenar).</summary>
    private static readonly string[] LabelTahun =
    {
        "TAHUN SATU", "TAHUN DUA", "TAHUN TIGA", "TAHUN EMPAT", "TAHUN LIMA", "TAHUN ENAM",
    };

    /// <summary>
    /// Peraturan:
    /// <list type="number">
    /// <item>token pertama angka 1..6 → tahun "TAHUN SATU".."TAHUN ENAM";</item>
    /// <item>token pertama bukan angka (cth PRASEKOLAH) → tahun = token itu;</item>
    /// <item>kelas = baki token selepas token tahun; jika tiada baki, kelas =
    /// nama penuh supaya padanan kabur sedia ada (<see cref="PadananDropdown"/>)
    /// yang menentukan — cth "PRASEKOLAH" padan awalan dengan "PRASEKOLAH BIJAK";</item>
    /// <item>apa-apa yang lain (angka di luar 1..6, angka bercampur huruf,
    /// rentetan kosong) → <c>Ok=false</c> dengan sebab yang jelas.</item>
    /// </list>
    /// Semua keluaran huruf besar dan ruang berlebihan dikecilkan kepada satu.
    /// </summary>
    public static TerbitanKelasMoeis Terbitkan(string? namaKelasHadir)
    {
        var token = (namaKelasHadir ?? "")
            .ToUpperInvariant()
            .Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);

        if (token.Length == 0)
        {
            return new TerbitanKelasMoeis(false, "", "",
                "Nama kelas HADIR kosong; tahun/kelas MOEIS tidak dapat diterbitkan.");
        }

        var pertama = token[0];
        var penuh = string.Join(" ", token);
        var baki = token.Length > 1 ? string.Join(" ", token, 1, token.Length - 1) : "";
        // Tiada baki (cth "PRASEKOLAH") = serahkan nama penuh kepada padanan kabur.
        var kelas = baki.Length > 0 ? baki : penuh;

        if (pertama[0] < '0' || pertama[0] > '9')
        {
            return new TerbitanKelasMoeis(true, pertama, kelas, "");
        }

        // Token bermula dengan angka: ia mesti angka SEMATA-MATA dan dalam 1..6.
        foreach (var c in pertama)
        {
            if (c < '0' || c > '9')
            {
                return new TerbitanKelasMoeis(false, "", "",
                    $"Nama kelas HADIR \"{penuh}\" bermula dengan angka bercampur huruf; tahun MOEIS tidak dapat diterbitkan.");
            }
        }

        if (!int.TryParse(pertama, NumberStyles.None, CultureInfo.InvariantCulture, out var angka)
            || angka < TahunMin || angka > TahunMaks)
        {
            return new TerbitanKelasMoeis(false, "", "",
                $"Tahun \"{pertama}\" dalam nama kelas HADIR \"{penuh}\" di luar julat {TahunMin}–{TahunMaks}; tahun MOEIS tidak dapat diterbitkan.");
        }

        return new TerbitanKelasMoeis(true, LabelTahun[angka - 1], kelas, "");
    }
}
