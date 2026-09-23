using System;
using System.Linq;
using System.Threading.Tasks;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Penerbitan (tahun, kelas) daripada satu nama kelas HADIR — fungsi TULEN,
/// tiada DOM. Ini punca kegagalan hidup 23/09: "1 BIJAK" dipadankan bulat-bulat
/// terhadap senarai kelas MOEIS yang berbunyi "BIJAK".
/// </summary>
public class KelasTahunMoeisTests
{
    [Theory]
    // Bentuk sebenar dalam sistem.
    [InlineData("1 BIJAK", "TAHUN SATU", "BIJAK")]
    [InlineData("6 BIJAK", "TAHUN ENAM", "BIJAK")]
    [InlineData("3 CERDIK", "TAHUN TIGA", "CERDIK")]
    [InlineData("2 BIJAK", "TAHUN DUA", "BIJAK")]
    [InlineData("4 BIJAK", "TAHUN EMPAT", "BIJAK")]
    [InlineData("5 BIJAK", "TAHUN LIMA", "BIJAK")]
    // Token pertama bukan angka: token itu ialah tahun.
    [InlineData("PRASEKOLAH BIJAK", "PRASEKOLAH", "BIJAK")]
    // Tiada baki token: nama penuh diserahkan kepada padanan kabur sedia ada
    // (MOEIS menyenaraikan "PRASEKOLAH BIJAK" di bawah tahun PRASEKOLAH).
    [InlineData("PRASEKOLAH", "PRASEKOLAH", "PRASEKOLAH")]
    // Huruf kecil dan ruang berlebihan.
    [InlineData("1 bijak", "TAHUN SATU", "BIJAK")]
    [InlineData("prasekolah", "PRASEKOLAH", "PRASEKOLAH")]
    [InlineData("  6   bijak  ", "TAHUN ENAM", "BIJAK")]
    [InlineData("\t1\tBIJAK\n", "TAHUN SATU", "BIJAK")]
    // Nama kelas berbilang perkataan: semuanya menjadi kelas.
    [InlineData("1 BIJAK CERIA", "TAHUN SATU", "BIJAK CERIA")]
    public void Terbitkan_NamaDikenali(string nama, string tahun, string kelas)
    {
        var t = KelasTahunMoeis.Terbitkan(nama);

        Assert.True(t.Ok);
        Assert.Equal(tahun, t.Tahun);
        Assert.Equal(kelas, t.Kelas);
        Assert.Equal("", t.Sebab);
    }

    [Theory]
    [InlineData("9 BIJAK")]          // angka di luar 1..6
    [InlineData("0 BIJAK")]
    [InlineData("7")]
    [InlineData("12 BIJAK")]
    [InlineData("1A BIJAK")]         // angka bercampur huruf — bukan tekaan
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t \n")]
    [InlineData(null)]
    public void Terbitkan_NamaTidakDikenali_GagalDenganSebab(string? nama)
    {
        var t = KelasTahunMoeis.Terbitkan(nama);

        Assert.False(t.Ok);
        Assert.Equal("", t.Tahun);
        Assert.Equal("", t.Kelas);
        Assert.NotEqual("", t.Sebab);
        // Sebab mesti boleh dibaca pemilik, bukan kod ralat.
        Assert.True(t.Sebab.Length > 20, t.Sebab);
    }

    [Fact]
    public void Terbitkan_AngkaDiLuarJulat_SebabMenyebutJulat()
    {
        var t = KelasTahunMoeis.Terbitkan("9 BIJAK");

        Assert.False(t.Ok);
        Assert.Contains("9", t.Sebab);
        Assert.Contains("1", t.Sebab);
        Assert.Contains("6", t.Sebab);
    }

    [Fact]
    public void Terbitkan_Kosong_SebabMenyebutKosong()
    {
        Assert.Contains("kosong", KelasTahunMoeis.Terbitkan("   ").Sebab, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Terbitkan_SetiapAngka1Hingga6_MempunyaiLabelTahunTersendiri()
    {
        var label = Enumerable.Range(1, 6)
            .Select(i => KelasTahunMoeis.Terbitkan(i + " BIJAK"))
            .ToList();

        Assert.All(label, t => Assert.True(t.Ok));
        Assert.Equal(6, label.Select(t => t.Tahun).Distinct(StringComparer.Ordinal).Count());
        Assert.All(label, t => Assert.StartsWith("TAHUN ", t.Tahun, StringComparison.Ordinal));
    }
}

/// <summary>
/// Aliran penghantaran: tahun DAN kelas kini dipilih daripada satu nama kelas
/// HADIR. Fixture membawa senarai <c>#txtThnting</c> / <c>#txtNamakelas</c>
/// yang sebenar (73=TAHUN SATU, 1149831=BIJAK).
/// </summary>
public class PenghantaranTahunKelasTests
{
    private static DomMoeisPalsu DomTahunSatu(params string[] idHadir)
    {
        var dom = new DomMoeisPalsu { TarikhPada = "22/09/2026" };
        PenghantaranMoeisTests.IsiPilihanTahun(dom);
        // Senarai kelas seperti MOEIS memaparkannya SELEPAS tahun dipilih:
        // nama kelas sahaja, tanpa angka tahun.
        dom.PilihanKelas.Add(new PilihanDropdown("", "-- Pilih Kelas --"));
        dom.PilihanKelas.Add(new PilihanDropdown("1149831", "BIJAK"));
        dom.PilihanKategori.Add(new PilihanDropdown("", "-- Pilih --"));
        dom.PilihanKategori.Add(new PilihanDropdown("S", "SAKIT"));
        dom.PilihanSebab.Add(new PilihanDropdown("", "-- Pilih --"));
        dom.PilihanSebab.Add(new PilihanDropdown("S1", "DEMAM"));
        foreach (var id in idHadir) dom.Murid.Add(new DomMoeisPalsu.Baris { Id = id });
        dom.Simpan();
        return dom;
    }

    private static TugasanPenghantaran Tugasan(string kelas, params MuridTidakHadir[] murid) => new()
    {
        Kelas = kelas,
        TarikhIso = "2026-09-22",
        TidakHadir = murid,
    };

    private static MuridTidakHadir Sakit(string id) => new(id, "SAKIT", "DEMAM");

    [Fact]
    public async Task KelasHadir1Bijak_MemilihTahunSatuDanKelasBijak()
    {
        // Regresi LANGSUNG bagi kegagalan hidup 23/09 12:13:
        // status=kelas-tidak-dipilih, sebab=kelas tidak dijumpai ... : 1 BIJAK.
        var dom = DomTahunSatu("101", "102");

        var hasil = await new PenghantaranMoeis(dom).HantarAsync(Tugasan("1 BIJAK", Sakit("101")));

        Assert.Equal("disahkan", hasil.Status);
        Assert.True(hasil.Berjaya);
        Assert.Equal("73", dom.TahunDipilih);
        Assert.Equal("1149831", dom.KelasDipilih);
        // Tahun dipilih SEBELUM kelas — senarai kelas hanya terisi selepas itu.
        var iTahun = dom.Panggilan.IndexOf("dropdown:" + PenghantaranMoeisFlow.SelektorTahun + "=73");
        var iKelas = dom.Panggilan.IndexOf("dropdown:" + PenghantaranMoeisFlow.SelektorKelas + "=1149831");
        Assert.True(iTahun >= 0 && iKelas > iTahun);
    }

    [Fact]
    public async Task KelasHadir6Bijak_MemilihTahunEnam()
    {
        var dom = DomTahunSatu("101");
        dom.PilihanKelas.Clear();
        dom.PilihanKelas.Add(new PilihanDropdown("1149900", "BIJAK"));

        var hasil = await new PenghantaranMoeis(dom).HantarAsync(Tugasan("6 BIJAK", Sakit("101")));

        Assert.True(hasil.Berjaya);
        Assert.Equal("78", dom.TahunDipilih);
        Assert.Equal("1149900", dom.KelasDipilih);
    }

    [Fact]
    public async Task KelasHadirPrasekolah_MemilihTahunPrasekolah_KelasIkutPadananKabur()
    {
        var dom = DomTahunSatu("101");
        dom.PilihanKelas.Clear();
        dom.PilihanKelas.Add(new PilihanDropdown("K1", "PRASEKOLAH BIJAK"));

        var hasil = await new PenghantaranMoeis(dom).HantarAsync(Tugasan("PRASEKOLAH", Sakit("101")));

        Assert.True(hasil.Berjaya);
        Assert.Equal("102", dom.TahunDipilih);
        Assert.Equal("K1", dom.KelasDipilih);
    }

    [Fact]
    public async Task NamaKelasTidakDikenali_Berhenti_TiadaTahunTiadaKelasTiadaSimpan()
    {
        var dom = DomTahunSatu("101");

        var hasil = await new PenghantaranMoeis(dom).HantarAsync(Tugasan("9 BIJAK", Sakit("101")));

        Assert.Equal("kelas-tidak-dipilih", hasil.Status);
        Assert.False(hasil.Berjaya);
        Assert.Contains("9", hasil.Sebab);
        Assert.Null(dom.TahunDipilih);
        Assert.Null(dom.KelasDipilih);
        Assert.Equal(0, dom.BilSimpan);
        Assert.DoesNotContain(dom.Panggilan, p => p.StartsWith("tanda:", StringComparison.Ordinal));
    }

    [Fact]
    public async Task TahunTiadaDalamSenaraiMoeis_Berhenti_TiadaSimpan()
    {
        var dom = DomTahunSatu("101");
        dom.PilihanTahun.Clear();   // halaman belum sedia / senarai tahun kosong

        var hasil = await new PenghantaranMoeis(dom).HantarAsync(Tugasan("1 BIJAK", Sakit("101")));

        Assert.Equal("kelas-tidak-dipilih", hasil.Status);
        Assert.Contains("tahun", hasil.Sebab, StringComparison.OrdinalIgnoreCase);
        Assert.Null(dom.TahunDipilih);
        Assert.Null(dom.KelasDipilih);
        Assert.Equal(0, dom.BilSimpan);
    }

    [Fact]
    public async Task TahunDiberiSecaraEksplisit_DipakaiSepertiAdanya()
    {
        // Tugasan yang sudah membawa Tahun tidak diterbitkan semula: label yang
        // diberi menang, dan Kelas kekal seperti yang diberi.
        var dom = DomTahunSatu("101");
        dom.PilihanKelas.Clear();
        dom.PilihanKelas.Add(new PilihanDropdown("1149831", "BIJAK"));

        var tugasan = new TugasanPenghantaran
        {
            Kelas = "BIJAK",
            Tahun = "TAHUN DUA",
            TarikhIso = "2026-09-22",
            TidakHadir = new[] { Sakit("101") },
        };

        var hasil = await new PenghantaranMoeis(dom).HantarAsync(tugasan);

        Assert.True(hasil.Berjaya);
        Assert.Equal("74", dom.TahunDipilih);
        Assert.Equal("1149831", dom.KelasDipilih);
    }

    [Fact]
    public async Task BacaSemulaMemilihTahunDanKelasYangSama()
    {
        var dom = DomTahunSatu("101");

        var hasil = await new PenghantaranMoeis(dom).HantarAsync(Tugasan("1 BIJAK", Sakit("101")));

        Assert.True(hasil.Berjaya);
        // Sekali sebelum simpan, sekali selepas muat semula — nilai yang SAMA.
        Assert.Equal(2, dom.Panggilan.Count(p => p == "dropdown:" + PenghantaranMoeisFlow.SelektorTahun + "=73"));
        Assert.Equal(2, dom.Panggilan.Count(p => p == "dropdown:" + PenghantaranMoeisFlow.SelektorKelas + "=1149831"));
        Assert.Equal(1, dom.BilMuatSemula);
    }
}
