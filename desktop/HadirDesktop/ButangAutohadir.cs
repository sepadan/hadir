using System;
using System.Drawing;
using System.Windows.Forms;

namespace HadirDesktop;

/// <summary>
/// Butang "Autohadir" pada bar status tetingkap utama: membuka menu dulang
/// yang SAMA (<see cref="TrayHost.MenuDulang"/>) — tiada menu kedua, tiada item
/// disalin, jadi tanda semak, baris status kelabu dan ikon sentiasa seragam.
///
/// Butang terletak di dasar tetingkap, jadi menu dibuka KE ATAS, sejajar ke
/// kanan dengan butang, dan diapit dalam kawasan kerja skrin supaya tidak
/// terpotong.
/// </summary>
public static class ButangAutohadir
{
    public static ToolStripButton Bina(TrayHost tray)
    {
        var butang = new ToolStripButton
        {
            Text = DemoLabel.ButangAutohadir,
            Image = IkonDulang.Untuk(FungsiDulang.SemuaFungsi),
            DisplayStyle = ToolStripItemDisplayStyle.ImageAndText,
            ToolTipText = DemoLabel.ButangAutohadirTip,
        };

        // Togol: jika menu terbuka semasa tetikus ditekan, klik ini menutupnya.
        // Penapis menu WinForms biasanya sudah menutup menu sebelum MouseDown
        // sampai ke butang, jadi "baru ditutup oleh klik luar" dikira juga.
        var menutup = false;
        butang.MouseDown += (_, _) => menutup = tray.MenuDulang.Visible || tray.BaruDitutupKlikLuar();
        butang.Click += (_, _) =>
        {
            if (menutup)
            {
                menutup = false;
                if (tray.MenuDulang.Visible) tray.MenuDulang.Close();
                return;
            }
            Tunjuk(tray, butang);
        };
        return butang;
    }

    /// <summary>Buka (atau tutup — togol) menu dulang di atas <paramref name="butang"/>.</summary>
    internal static bool Tunjuk(TrayHost tray, ToolStripItem butang)
    {
        var bar = butang.Owner;
        if (bar == null) return false;

        var butangSkrin = bar.RectangleToScreen(butang.Bounds);
        var saizMenu = tray.MenuDulang.GetPreferredSize(Size.Empty);
        var kawasan = Screen.FromControl(bar).WorkingArea;
        var kiriAtas = KedudukanMenu(butangSkrin, saizMenu, kawasan);
        return tray.TunjukMenu(bar, bar.PointToClient(kiriAtas));
    }

    /// <summary>
    /// Sudut kiri-atas menu (koordinat skrin) — fungsi TULEN. Menu diletakkan
    /// TERUS DI ATAS butang dengan tepi kanannya sejajar tepi kanan butang
    /// (sudut kanan-bawah menu = sudut kanan-atas butang), kemudian diapit
    /// dalam <paramref name="kawasanKerja"/>: tidak terkeluar di kanan/bawah,
    /// dan jika terlalu tinggi/lebar, tepi atas/kiri diutamakan.
    /// </summary>
    public static Point KedudukanMenu(Rectangle butangSkrin, Size saizMenu, Rectangle kawasanKerja)
    {
        var x = butangSkrin.Right - saizMenu.Width;
        var y = butangSkrin.Top - saizMenu.Height;

        x = Math.Max(kawasanKerja.Left, Math.Min(x, kawasanKerja.Right - saizMenu.Width));
        y = Math.Max(kawasanKerja.Top, Math.Min(y, kawasanKerja.Bottom - saizMenu.Height));
        return new Point(x, y);
    }
}
