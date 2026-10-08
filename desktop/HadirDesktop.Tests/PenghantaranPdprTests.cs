using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Ujian unit bagi penghantaran MOEIS melibatkan Kategori A: PDPR (PEMBELAJARAN DI RUMAH).
/// Menguji:
/// (i) Pembinaan tugasan bagi kelas PDPR (termasuk kelas semua-PDPR) TIDAK ditelan oleh pintasan semua-hadir,
/// (ii) Penghantaran PDPR bersendirian menandakan kotak kehadiran tidak hadir fizikal dan mengisi kategori A + sebab,
/// (iii) Pengesahan baca semula mengesahkan kategori dan sebab PDPR,
/// (iv) Penghantaran campuran (SAKIT + PDPR) mengisi kedua-dua murid secara tepat.
/// </summary>
public class PenghantaranPdprTests
{
    private static DomMoeisPalsu DomPdpr(params (string Id, bool Hadir)[] murid)
    {
        var dom = new DomMoeisPalsu { TarikhPada = "22/09/2026" };
        PenghantaranMoeisTests.IsiPilihanTahun(dom);
        dom.PilihanKelas.Add(new PilihanDropdown("", "-- Pilih Kelas --"));
        dom.PilihanKelas.Add(new PilihanDropdown("K1", "PRASEKOLAH BIJAK"));

        dom.PilihanKategori.Add(new PilihanDropdown("", "-- Pilih --"));
        dom.PilihanKategori.Add(new PilihanDropdown("A", "PDPR"));
        dom.PilihanKategori.Add(new PilihanDropdown("S", "SAKIT"));

        dom.PilihanSebab.Add(new PilihanDropdown("", "-- Pilih --"));
        dom.PilihanSebab.Add(new PilihanDropdown("A1", "PEMBELAJARAN DI RUMAH"));
        dom.PilihanSebab.Add(new PilihanDropdown("S1", "DEMAM"));

        foreach (var (id, hadir) in murid)
        {
            dom.Murid.Add(new DomMoeisPalsu.Baris { Id = id, Hadir = hadir });
        }
        dom.Simpan();
        return dom;
    }

    [Fact]
    public void BinaTugasan_KelasSemuaPdpr_BukanPintasanSemuaHadir()
    {
        // Kerja dengan 2 murid yang kedua-duanya PDPR
        var kerjaSemuaPdpr = new KerjaPenuh(
            Id: "job-pdpr-1",
            Kelas: "PRASEKOLAH",
            TarikhIso: "2026-09-22",
            Status: "menunggu",
            Mesej: "Tugasan penghantaran MOEIS dicipta untuk PRASEKOLAH (2 murid).",
            KelasMoeisId: "K1",
            Murid: new List<MuridKerjaPenuh>
            {
                new("101", "Murid Alfa", "A", "PEMBELAJARAN DI RUMAH"),
                new("102", "Murid Beta", "A", "PEMBELAJARAN DI RUMAH")
            },
            SemuaHadir: false);

        var pembinaan = PembinaTugasanPenghantaran.DaripadaKerja(kerjaSemuaPdpr);
        Assert.True(pembinaan.Boleh);
        Assert.NotNull(pembinaan.Tugasan);

        // WAJIB: Tugasan TIDAK menandakan SemuaHadir=true (yang akan memintas perubahan baris)
        Assert.False(pembinaan.Tugasan.SemuaHadir, "Tugasan dengan murid PDPR TIDAK boleh menjadi pintasan semua-hadir");
        Assert.Equal(2, pembinaan.Tugasan.TidakHadir.Count);
        Assert.Equal("101", pembinaan.Tugasan.TidakHadir[0].Id);
        Assert.Equal("A", pembinaan.Tugasan.TidakHadir[0].Kategori);
        Assert.Equal("PEMBELAJARAN DI RUMAH", pembinaan.Tugasan.TidakHadir[0].Sebab);
        Assert.Equal("102", pembinaan.Tugasan.TidakHadir[1].Id);
    }

    [Fact]
    public async Task PenghantaranPdpr_HantarDanSahkanBerjaya()
    {
        var dom = DomPdpr(("101", true), ("102", true), ("103", true));
        var tugasan = new TugasanPenghantaran
        {
            Kelas = "PRASEKOLAH",
            TarikhIso = "2026-09-22",
            TidakHadir = new List<MuridTidakHadir>
            {
                new("102", "PDPR", "PEMBELAJARAN DI RUMAH")
            }
        };

        var hasil = await new PenghantaranMoeis(dom).HantarAsync(tugasan);

        Assert.Equal("disahkan", hasil.Status);
        Assert.True(hasil.Berjaya);
        Assert.Equal(1, hasil.BilPerubahan);

        // Semak keadaan DOM selepas simpan dan muat semula
        var b101 = dom.Murid.First(m => m.Id == "101");
        var b102 = dom.Murid.First(m => m.Id == "102");
        var b103 = dom.Murid.First(m => m.Id == "103");

        Assert.True(b101.Hadir, "Murid 101 kekal hadir");
        Assert.False(b102.Hadir, "Murid 102 (PDPR) ditandakan kotak tidak hadir fizikal untuk mengisi MOEIS");
        Assert.Equal("A", b102.KategoriNilai);
        Assert.Equal("A1", b102.SebabNilai);
        Assert.True(b103.Hadir, "Murid 103 kekal hadir");
    }

    [Fact]
    public async Task PenghantaranCampuran_SakitDanPdpr_Berjaya()
    {
        var dom = DomPdpr(("101", true), ("102", true), ("103", true));
        var tugasan = new TugasanPenghantaran
        {
            Kelas = "PRASEKOLAH",
            TarikhIso = "2026-09-22",
            TidakHadir = new List<MuridTidakHadir>
            {
                new("101", "SAKIT", "DEMAM"),
                new("102", "A", "PEMBELAJARAN DI RUMAH")
            }
        };

        var hasil = await new PenghantaranMoeis(dom).HantarAsync(tugasan);

        Assert.Equal("disahkan", hasil.Status);
        Assert.True(hasil.Berjaya);
        Assert.Equal(2, hasil.BilPerubahan);

        var b101 = dom.Murid.First(m => m.Id == "101");
        var b102 = dom.Murid.First(m => m.Id == "102");
        var b103 = dom.Murid.First(m => m.Id == "103");

        Assert.False(b101.Hadir);
        Assert.Equal("S", b101.KategoriNilai);
        Assert.Equal("S1", b101.SebabNilai);

        Assert.False(b102.Hadir);
        Assert.Equal("A", b102.KategoriNilai);
        Assert.Equal("A1", b102.SebabNilai);

        Assert.True(b103.Hadir);
    }
}
