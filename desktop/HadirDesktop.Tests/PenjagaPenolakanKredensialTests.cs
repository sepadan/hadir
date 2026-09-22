using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

public class PenjagaPenolakanKredensialTests
{
    private static (PenjagaPenolakanKredensial, System.Func<PenjagaPenolakanKredensial.Keadaan?>) BuatPenjaga(int maks = 5)
    {
        PenjagaPenolakanKredensial.Keadaan? keadaan = null;
        var penjaga = new PenjagaPenolakanKredensial(
            () => keadaan,
            k => keadaan = k,
            () => maks);
        return (penjaga, () => keadaan);
    }

    [Fact]
    public void CatatPenolakan_Meningkat_DanMembacaSemula()
    {
        var (penjaga, baca) = BuatPenjaga();
        penjaga.CatatPenolakan();
        penjaga.CatatPenolakan();
        Assert.Equal(2, baca()!.PenolakanBerturut);
        Assert.Equal(2, penjaga.BilPenolakan());
    }

    [Fact]
    public void Diblok_HanyaPadaMaks()
    {
        var (penjaga, _) = BuatPenjaga(maks: 5);
        for (var i = 0; i < 5; i++) penjaga.CatatPenolakan();
        Assert.True(penjaga.Diblok());

        var (penjaga2, _) = BuatPenjaga(maks: 5);
        for (var i = 0; i < 4; i++) penjaga2.CatatPenolakan();
        Assert.False(penjaga2.Diblok());
    }

    [Fact]
    public void CatatKejayaan_TetapkanSemulaKeSifar()
    {
        var (penjaga, _) = BuatPenjaga();
        for (var i = 0; i < 4; i++) penjaga.CatatPenolakan();
        penjaga.CatatKejayaan();
        Assert.Equal(0, penjaga.BilPenolakan());
        Assert.False(penjaga.Diblok());
    }

    [Fact]
    public void CubaLagi_KosongkanTanpaLogMasukManual()
    {
        var (penjaga, _) = BuatPenjaga();
        for (var i = 0; i < 5; i++) penjaga.CatatPenolakan();
        Assert.True(penjaga.Diblok());

        penjaga.CubaLagi();
        Assert.Equal(0, penjaga.BilPenolakan());
        Assert.False(penjaga.Diblok());
    }

    [Fact]
    public void MaksNol_TidakPernahDiblok()
    {
        var (penjaga, _) = BuatPenjaga(maks: 0);
        for (var i = 0; i < 100; i++) penjaga.CatatPenolakan();
        Assert.False(penjaga.Diblok());
    }

    [Fact]
    public void BacaCorrupt_FailOpen_TidakDiblok()
    {
        // A corrupt/unreadable counter must FAIL OPEN (never block a needed
        // login) — the whole point of the owner's "no needless safety limits".
        PenjagaPenolakanKredensial.Keadaan? keadaan = null;
        var penjaga = new PenjagaPenolakanKredensial(
            () => throw new System.Exception("corrupt state"),
            k => keadaan = k,
            () => 5);

        Assert.False(penjaga.Diblok());
        Assert.Equal(0, penjaga.BilPenolakan());
    }

    [Fact]
    public void StatusRingkas_MembawaSebabApabilaDiblok()
    {
        var (penjaga, _) = BuatPenjaga(maks: 5);
        for (var i = 0; i < 5; i++) penjaga.CatatPenolakan();

        var s = penjaga.StatusRingkas();
        Assert.True(s.Diblok);
        Assert.Equal(5, s.PenolakanBerturut);
        Assert.Equal(5, s.MaksPenolakan);
        Assert.NotNull(s.Sebab);
        Assert.Contains("Cuba lagi", s.Sebab);
    }

    [Fact]
    public void MaksPenolakan_TidakMelebihiMaks()
    {
        var (penjaga, _) = BuatPenjaga(maks: 3);
        for (var i = 0; i < 10; i++) penjaga.CatatPenolakan();
        Assert.Equal(3, penjaga.BilPenolakan());
    }
}
