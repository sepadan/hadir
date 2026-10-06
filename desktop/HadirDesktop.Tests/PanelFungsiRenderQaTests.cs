using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

public class PanelFungsiRenderQaTests
{
    [Fact]
    public void Render()
    {
        var dir = Path.Combine(Path.GetTempPath(), "hadir-ikon-semak");
        Directory.CreateDirectory(dir);
        var fungsi = Enum.GetValues<FungsiDulang>();
        foreach (var latar in new[] { Color.White, Color.FromArgb(32, 32, 32) })
        {
            using var besar = new Bitmap(fungsi.Length * 20 * 6, 20 * 6);
            using (var g = Graphics.FromImage(besar))
            {
                g.Clear(latar);
                g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.NearestNeighbor;
                g.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.Half;
                for (var i = 0; i < fungsi.Length; i++)
                {
                    g.DrawImage(IkonDulang.Untuk(fungsi[i]), new Rectangle(i * 120 + 12, 12, 96, 96));
                }
            }
            besar.Save(Path.Combine(dir, latar == Color.White ? "terang.png" : "gelap.png"), ImageFormat.Png);
        }

        using var panel = new PanelFungsi(_ => { }, f => f == FungsiDulang.HantarAuto ? true : f == FungsiDulang.Autostart ? false : null, (_, _) => { }, () => "Portal: diam");
        panel.StartPosition = System.Windows.Forms.FormStartPosition.Manual;
        panel.Location = new Point(-4000, -4000);
        panel.ShowInTaskbar = false;
        panel.Show();
        System.Windows.Forms.Application.DoEvents();
        var saiz = panel.Size;
        File.WriteAllText(Path.Combine(dir, "saiz.txt"), saiz.ToString() + " client=" + panel.ClientSize);
        using var bmp = new Bitmap(saiz.Width, saiz.Height);
        panel.DrawToBitmap(bmp, new Rectangle(Point.Empty, saiz));
        bmp.Save(Path.Combine(dir, "panel.png"), ImageFormat.Png);
    }
}
