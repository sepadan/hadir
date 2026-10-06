using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Ujian unit bagi penghantaran MOEIS bagi kelas semua-hadir:
/// (i) bina tugasan semua-hadir diterima bila rekod lengkap,
/// (ii) ditolak bila rekod tidak lengkap/samar,
/// (iii) aliran semua-hadir tidak menyentuh baris (tiada tanda, tiada kategori/sebab diubah),
/// (iv) pengesahan selepas simpan gagal jujur bila MOEIS menunjukkan ketidakhadiran.
/// </summary>
public class PenghantaranSemuaHadirTests
{
    private static DomMoeisPalsu Dom(params (string Id, bool Hadir)[] murid)
    {
        var dom = new DomMoeisPalsu { TarikhPada = "22/09/2026" };
        PenghantaranMoeisTests.IsiPilihanTahun(dom);
        dom.PilihanKelas.Add(new PilihanDropdown("", "-- Pilih Kelas --"));
        dom.PilihanKelas.Add(new PilihanDropdown("K1", "PRASEKOLAH BIJAK"));
        dom.PilihanKategori.Add(new PilihanDropdown("", "-- Pilih --"));
        dom.PilihanKategori.Add(new PilihanDropdown("S", "SAKIT"));
        dom.PilihanSebab.Add(new PilihanDropdown("", "-- Pilih --"));
        dom.PilihanSebab.Add(new PilihanDropdown("S1", "DEMAM"));
        foreach (var (id, hadir) in murid)
        {
            dom.Murid.Add(new DomMoeisPalsu.Baris { Id = id, Hadir = hadir });
        }
        dom.Simpan();
        return dom;
    }

    [Fact]
    public void BinaTugasanSemuaHadir_DiterimaBilaRekodLengkap()
    {
        // 1. Ditegaskan melalui SemuaHadir = true
        var kerja1 = new KerjaPenuh(
            Id: "job-1",
            Kelas: "PRASEKOLAH",
            TarikhIso: "2026-09-22",
            Status: "menunggu",
            Mesej: "Semua hadir",
            KelasMoeisId: "K1",
            Murid: Array.Empty<MuridKerjaPenuh>(),
            SemuaHadir: true);

        var pembinaan1 = PembinaTugasanPenghantaran.DaripadaKerja(kerja1);
        Assert.True(pembinaan1.Boleh);
        Assert.NotNull(pembinaan1.Tugasan);
        Assert.True(pembinaan1.Tugasan.SemuaHadir);
        Assert.Empty(pembinaan1.Tugasan.TidakHadir);
        Assert.Contains("semua hadir", pembinaan1.Sebab, StringComparison.OrdinalIgnoreCase);

        // 2. Ditegaskan melalui BilMurid == BilHadir dan Murid.Count == 0
        var kerja2 = new KerjaPenuh(
            Id: "job-2",
            Kelas: "PRASEKOLAH",
            TarikhIso: "2026-09-22",
            Status: "menunggu",
            Mesej: "",
            KelasMoeisId: "K1",
            Murid: Array.Empty<MuridKerjaPenuh>(),
            BilMurid: 25,
            BilHadir: 25);

        var pembinaan2 = PembinaTugasanPenghantaran.DaripadaKerja(kerja2);
        Assert.True(pembinaan2.Boleh);
        Assert.NotNull(pembinaan2.Tugasan);
        Assert.True(pembinaan2.Tugasan.SemuaHadir);
        Assert.Empty(pembinaan2.Tugasan.TidakHadir);

        // 3. Ditegaskan melalui Mesej membawa "semua hadir" atau "semua murid hadir"
        var kerja3 = new KerjaPenuh(
            Id: "job-3",
            Kelas: "PRASEKOLAH",
            TarikhIso: "2026-09-22",
            Status: "menunggu",
            Mesej: "Semua murid hadir (25/25)",
            KelasMoeisId: "K1",
            Murid: Array.Empty<MuridKerjaPenuh>());

        var pembinaan3 = PembinaTugasanPenghantaran.DaripadaKerja(kerja3);
        Assert.True(pembinaan3.Boleh);
        Assert.NotNull(pembinaan3.Tugasan);
        Assert.True(pembinaan3.Tugasan.SemuaHadir);
    }

    [Fact]
    public void BinaTugasanSemuaHadir_DitolakBilaRekodTidakLengkapAtauSamar()
    {
        // Senarai murid kosong tanpa penegasan kehadiran lengkap ditolak fail-closed
        var kerjaSamar = new KerjaPenuh(
            Id: "job-samar",
            Kelas: "PRASEKOLAH",
            TarikhIso: "2026-09-22",
            Status: "menunggu",
            Mesej: "",
            KelasMoeisId: "K1",
            Murid: Array.Empty<MuridKerjaPenuh>(),
            BilMurid: null,
            BilHadir: null,
            SemuaHadir: null);

        var pembinaanSamar = PembinaTugasanPenghantaran.DaripadaKerja(kerjaSamar);
        Assert.False(pembinaanSamar.Boleh);
        Assert.Null(pembinaanSamar.Tugasan);
        Assert.Contains("tidak menegaskan kehadiran lengkap", pembinaanSamar.Sebab);
        Assert.Contains("kehadiran TIDAK direka", pembinaanSamar.Sebab);

        // Senarai murid kosong tetapi BilHadir != BilMurid (misalnya tidak sepadan)
        var kerjaTidakSepadan = new KerjaPenuh(
            Id: "job-tak-sepadan",
            Kelas: "PRASEKOLAH",
            TarikhIso: "2026-09-22",
            Status: "menunggu",
            Mesej: "",
            KelasMoeisId: "K1",
            Murid: Array.Empty<MuridKerjaPenuh>(),
            BilMurid: 25,
            BilHadir: 20,
            SemuaHadir: false);

        var pembinaanTidakSepadan = PembinaTugasanPenghantaran.DaripadaKerja(kerjaTidakSepadan);
        Assert.False(pembinaanTidakSepadan.Boleh);
        Assert.Null(pembinaanTidakSepadan.Tugasan);
        Assert.Contains("tidak menegaskan kehadiran lengkap", pembinaanTidakSepadan.Sebab);
    }

    [Fact]
    public async Task AliranSemuaHadir_TidakMenyentuhBaris_Disahkan()
    {
        // 3 murid di MOEIS semuanya bertanda hadir (true)
        var dom = Dom(("101", true), ("102", true), ("103", true));
        var tugasan = new TugasanPenghantaran
        {
            Kelas = "PRASEKOLAH",
            TarikhIso = "2026-09-22",
            SemuaHadir = true,
            TidakHadir = Array.Empty<MuridTidakHadir>(),
            Sahkan = true,
        };

        var hasil = await new PenghantaranMoeis(dom).HantarAsync(tugasan);

        Assert.True(hasil.Berjaya);
        Assert.Equal("disahkan", hasil.Status);
        Assert.Equal(3, hasil.BilMurid);
        Assert.Equal(0, hasil.BilPerubahan);
        Assert.Equal(0, hasil.BilDilangkau);
        Assert.Equal("simpansah", hasil.TindakanSimpan);

        // Pastikan format mesej penghantaran tepat:
        // "Semua hadir (3 murid) — disahkan tanpa perubahan baris; hadir 3/3."
        Assert.Equal("Semua hadir (3 murid) — disahkan tanpa perubahan baris; hadir 3/3.", hasil.Sebab);

        // PENTING: Tiada baris yang ditanda atau kategori/sebab diubah!
        Assert.DoesNotContain(dom.Panggilan, p => p.StartsWith("tanda:", StringComparison.Ordinal));
        Assert.DoesNotContain(dom.Panggilan, p => p.StartsWith("kategori:", StringComparison.Ordinal));
        Assert.DoesNotContain(dom.Panggilan, p => p.StartsWith("sebab:", StringComparison.Ordinal));

        // Melakukan kemaskini, simpan-sah dan muat-semula
        Assert.Equal(1, dom.BilKemaskini);
        Assert.Equal(1, dom.BilSimpanSah);
        Assert.Equal(1, dom.BilMuatSemula);
    }

    [Fact]
    public async Task AliranSemuaHadir_MoeisMenunjukkanTidakHadir_GagalJujur()
    {
        // MOEIS menunjukkan seorang murid tidak hadir ("102" Hadir = false)
        var dom = Dom(("101", true), ("102", false), ("103", true));
        var tugasan = new TugasanPenghantaran
        {
            Kelas = "PRASEKOLAH",
            TarikhIso = "2026-09-22",
            SemuaHadir = true,
            TidakHadir = Array.Empty<MuridTidakHadir>(),
            Sahkan = true,
        };

        var hasil = await new PenghantaranMoeis(dom).HantarAsync(tugasan);

        Assert.False(hasil.Berjaya);
        Assert.Equal("gagal", hasil.Status);
        Assert.Contains("konflik-semua-hadir", hasil.Bukti);
        Assert.Contains("MOEIS menunjukkan 1 murid tidak hadir; HADIR menyatakan semuanya hadir; tiada paksaan", hasil.Sebab);

        // Tiada pemaksaan baris
        Assert.DoesNotContain(dom.Panggilan, p => p.StartsWith("tanda:", StringComparison.Ordinal));
        Assert.DoesNotContain(dom.Panggilan, p => p.StartsWith("kategori:", StringComparison.Ordinal));
        Assert.DoesNotContain(dom.Panggilan, p => p.StartsWith("sebab:", StringComparison.Ordinal));
    }
}
