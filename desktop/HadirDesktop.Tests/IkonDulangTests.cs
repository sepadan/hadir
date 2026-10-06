using System;
using System.Drawing;
using System.Linq;
using System.Security.Cryptography;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Ikon menu dulang yang dilukis dalam kod (1.0.16). Tiada fail imej: setiap
/// ikon mesti wujud, bersaiz 16x16, dicache, dan berbeza antara fungsi.
/// </summary>
public class IkonDulangTests
{
    public static TheoryData<FungsiDulang> SetiapFungsi()
    {
        var data = new TheoryData<FungsiDulang>();
        foreach (var f in Enum.GetValues<FungsiDulang>()) data.Add(f);
        return data;
    }

    [Theory]
    [MemberData(nameof(SetiapFungsi))]
    public void SetiapIkon_BukanNull_16x16(FungsiDulang fungsi)
    {
        var ikon = IkonDulang.Untuk(fungsi);

        Assert.NotNull(ikon);
        Assert.Equal(new Size(16, 16), ikon.Size);
    }

    [Fact]
    public void PenamaIkon_SamaDenganUntuk()
    {
        Assert.Same(IkonDulang.Untuk(FungsiDulang.Tunjuk), IkonDulang.Tunjuk());
        Assert.Same(IkonDulang.Untuk(FungsiDulang.SemuaFungsi), IkonDulang.SemuaFungsi());
        Assert.Same(IkonDulang.Untuk(FungsiDulang.TetapanTempatan), IkonDulang.TetapanTempatan());
        Assert.Same(IkonDulang.Untuk(FungsiDulang.AkaunIdMe), IkonDulang.AkaunIdMe());
        Assert.Same(IkonDulang.Untuk(FungsiDulang.Autostart), IkonDulang.Autostart());
        Assert.Same(IkonDulang.Untuk(FungsiDulang.LoginIdMe), IkonDulang.LoginIdMe());
        Assert.Same(IkonDulang.Untuk(FungsiDulang.CubaLagi), IkonDulang.CubaLagi());
        Assert.Same(IkonDulang.Untuk(FungsiDulang.HantarAuto), IkonDulang.HantarAuto());
        Assert.Same(IkonDulang.Untuk(FungsiDulang.SemakKemasKini), IkonDulang.SemakKemasKini());
        Assert.Same(IkonDulang.Untuk(FungsiDulang.Keluar), IkonDulang.Keluar());
    }

    [Fact]
    public void Ikon_Dicache_TidakDijanaSemula()
    {
        Assert.Same(IkonDulang.Untuk(FungsiDulang.Keluar), IkonDulang.Untuk(FungsiDulang.Keluar));
    }

    [Fact]
    public void SetiapFungsi_IkonBerbeza()
    {
        var cap = Enum.GetValues<FungsiDulang>().Select(CapPiksel).ToList();

        Assert.Equal(cap.Count, cap.Distinct().Count());
    }

    [Fact]
    public void Padding1px_SudutDanTepiLutSinar_TengahBerisi()
    {
        using var bmp = IkonDulang.Lukis(FungsiDulang.Tunjuk);

        for (var i = 0; i < 16; i++)
        {
            Assert.Equal(0, bmp.GetPixel(i, 0).A);
            Assert.Equal(0, bmp.GetPixel(0, i).A);
            Assert.Equal(0, bmp.GetPixel(i, 15).A);
            Assert.Equal(0, bmp.GetPixel(15, i).A);
        }
        Assert.Equal(255, bmp.GetPixel(3, 8).A);
    }

    [Fact]
    public void IkonCache_KekalSah_SelepasTrayDanPanelDilupus()
    {
        // Item menu dan butang tidak memiliki Bitmap yang dikongsi: melupuskan
        // dulang/panel tidak boleh merosakkan cache untuk instance berikutnya.
        using (new TrayHost(SystemIcons.Application)) { }
        using (new PanelFungsi(_ => { }, _ => null, (_, _) => { }, () => "")) { }

        Assert.Equal(16, IkonDulang.Tunjuk().Width);
        Assert.Equal(16, IkonDulang.Untuk(FungsiDulang.HantarAuto).Height);
    }

    private static string CapPiksel(FungsiDulang fungsi)
    {
        using var bmp = IkonDulang.Lukis(fungsi);
        var bait = new byte[16 * 16 * 4];
        var n = 0;
        for (var y = 0; y < 16; y++)
        for (var x = 0; x < 16; x++)
        {
            var p = bmp.GetPixel(x, y);
            bait[n++] = p.A; bait[n++] = p.R; bait[n++] = p.G; bait[n++] = p.B;
        }
        return Convert.ToHexString(SHA256.HashData(bait));
    }
}
