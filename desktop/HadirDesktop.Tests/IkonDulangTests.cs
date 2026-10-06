using System;
using System.Drawing;
using System.Linq;
using System.Security.Cryptography;
using System.Threading.Tasks;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Ikon menu dulang yang dilukis dalam kod (1.0.16). Tiada fail imej: setiap
/// ikon mesti wujud, bersaiz 16x16, dan berbeza antara fungsi.
///
/// Sejak 1.0.19 <see cref="IkonDulang.Untuk"/> memulangkan SALINAN PERSENDIRIAN
/// (bukan Bitmap dikongsi): satu Bitmap dikongsi antara benang ujian selari
/// pernah melontar "Object is currently in use elsewhere". Ujian di sini
/// menyemak KANDUNGAN (piksel) yang sama dan instance yang BERBEZA.
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
        using var ikon = IkonDulang.Untuk(fungsi);

        Assert.NotNull(ikon);
        Assert.Equal(new Size(16, 16), ikon.Size);
    }

    [Fact]
    public void PenamaIkon_KandunganSamaDenganUntuk()
    {
        Func<Image>[] penama =
        {
            IkonDulang.Tunjuk, IkonDulang.SemuaFungsi, IkonDulang.TetapanTempatan, IkonDulang.AkaunIdMe,
            IkonDulang.Autostart, IkonDulang.LoginIdMe, IkonDulang.CubaLagi, IkonDulang.HantarAuto,
            IkonDulang.SemakKemasKini, IkonDulang.Keluar,
        };
        FungsiDulang[] fungsi =
        {
            FungsiDulang.Tunjuk, FungsiDulang.SemuaFungsi, FungsiDulang.TetapanTempatan, FungsiDulang.AkaunIdMe,
            FungsiDulang.Autostart, FungsiDulang.LoginIdMe, FungsiDulang.CubaLagi, FungsiDulang.HantarAuto,
            FungsiDulang.SemakKemasKini, FungsiDulang.Keluar,
        };

        for (var i = 0; i < penama.Length; i++)
        {
            using var dariPenama = penama[i]();
            using var dariUntuk = IkonDulang.Untuk(fungsi[i]);
            Assert.NotSame(dariUntuk, dariPenama);
            Assert.Equal(CapPiksel(dariUntuk), CapPiksel(dariPenama));
        }
    }

    [Fact]
    public void Untuk_SetiapPanggilanSalinanPersendirian_KandunganSama()
    {
        using var a = IkonDulang.Untuk(FungsiDulang.Keluar);
        using var b = IkonDulang.Untuk(FungsiDulang.Keluar);

        Assert.NotSame(a, b);
        Assert.Equal(a.Size, b.Size);
        Assert.Equal(CapPiksel(a), CapPiksel(b));
    }

    [Theory]
    [MemberData(nameof(SetiapFungsi))]
    public void Untuk_RupaSamaTepatDenganLukis(FungsiDulang fungsi)
    {
        using var salinan = IkonDulang.Untuk(fungsi);
        using var lukisan = IkonDulang.Lukis(fungsi);

        Assert.Equal(CapPiksel(lukisan), CapPiksel(salinan));
    }

    [Fact]
    public void MelupuskanSalinan_TidakMenjejaskanPanggilanBerikutnya()
    {
        var pertama = IkonDulang.Untuk(FungsiDulang.HantarAuto);
        var cap = CapPiksel(pertama);
        pertama.Dispose();

        using var kedua = IkonDulang.Untuk(FungsiDulang.HantarAuto);

        Assert.Equal(16, kedua.Width);
        Assert.Equal(cap, CapPiksel(kedua));
    }

    [Fact]
    public void BanyakBenangSerentak_TiadaObjekDikongsi()
    {
        // Pepijat 1.0.18: bacaan Size/Width selari pada Bitmap dikongsi melontar
        // "Object is currently in use elsewhere". Setiap benang kini memegang
        // salinannya sendiri, jadi tiada pengecualian.
        var fungsi = Enum.GetValues<FungsiDulang>();
        Parallel.For(0, 400, new ParallelOptions { MaxDegreeOfParallelism = 8 }, i =>
        {
            using var ikon = IkonDulang.Untuk(fungsi[i % fungsi.Length]);
            Assert.Equal(16, ikon.Width);
            Assert.Equal(16, ikon.Height);
            using var sasaran = new Bitmap(4, 4);
            using var g = Graphics.FromImage(sasaran);
            g.DrawImage(ikon, 0, 0);
        });
    }

    [Fact]
    public void SetiapFungsi_IkonBerbeza()
    {
        var cap = Enum.GetValues<FungsiDulang>()
            .Select(f => { using var ikon = IkonDulang.Untuk(f); return CapPiksel(ikon); })
            .ToList();

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
    public void IkonKekalSah_SelepasTrayPanelDanButangMelupuskanSalinanMereka()
    {
        // Dulang, panel dan butang Autohadir kini MELUPUSKAN salinan ikon
        // mereka sendiri; itu tidak boleh merosakkan cache untuk pemanggil lain.
        using (new TrayHost(SystemIcons.Application)) { }
        using (new PanelFungsi(_ => { }, _ => null, (_, _) => { }, () => "")) { }
        using (var tray = new TrayHost(SystemIcons.Application))
        using (ButangAutohadir.Bina(tray)) { }

        using var tunjuk = IkonDulang.Tunjuk();
        using var hantar = IkonDulang.Untuk(FungsiDulang.HantarAuto);
        Assert.Equal(16, tunjuk.Width);
        Assert.Equal(16, hantar.Height);
    }

    /// <summary>Cap SHA-256 bagi piksel ARGB — kesamaan KANDUNGAN, bukan identiti.</summary>
    internal static string CapPiksel(Image imej)
    {
        var bmp = (Bitmap)imej;
        var bait = new byte[bmp.Width * bmp.Height * 4];
        var n = 0;
        for (var y = 0; y < bmp.Height; y++)
        for (var x = 0; x < bmp.Width; x++)
        {
            var p = bmp.GetPixel(x, y);
            bait[n++] = p.A; bait[n++] = p.R; bait[n++] = p.G; bait[n++] = p.B;
        }
        return Convert.ToHexString(SHA256.HashData(bait));
    }
}
