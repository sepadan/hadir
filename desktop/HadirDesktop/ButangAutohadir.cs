using System;
using System.Drawing;
using System.Windows.Forms;

namespace HadirDesktop;

/// <summary>
/// Butang "Autohadir" — item TERAKHIR bar status (hujung kanan bawah): membuka
/// menu dulang yang SAMA (<see cref="TrayHost.MenuDulang"/>) — tiada menu kedua,
/// tiada item disalin, jadi tanda semak, baris status kelabu dan ikon seragam.
///
/// Sejarah: 1.0.17 meletakkannya dalam bar status tanpa pengurusan ruang —
/// kandungan tetap bar (1126 px) melebihi lebarnya (1082 px) dan StatusStrip
/// tidak melukis item yang terkeluar, jadi butang tidak pernah kelihatan.
/// 1.0.18 menjadikannya kawalan terapung. 1.0.20 mengembalikannya KE DALAM bar:
/// item-item bar dipadatkan formatnya (teks penuh dalam tip alat), butang
/// kompak (≤95 px) dengan Overflow.Never, dan ruang krip saiz dikhaskan supaya
/// krip penjuru tidak menutup butang.
///
/// Menu dibuka KE ATAS, sejajar ke kanan dengan butang, dan diapit dalam
/// kawasan kerja skrin supaya tidak terpotong.
/// </summary>
public static class ButangAutohadir
{
    /// <summary>Ruang di tepi kanan bar untuk krip saiz (px logik, 96 DPI).</summary>
    public const int RuangGrip = 18;

    /// <summary>
    /// Butang kompak: ikon 16 px + "Autohadir" + padding kecil (≤ ~95 px).
    /// Tidak pernah dihantar ke limpahan (<see cref="ToolStripItemOverflow.Never"/>).
    /// Margin kanan memperuntukkan ruang krip saiz di penjuru kanan bawah.
    /// </summary>
    public static ToolStripButton Bina(TrayHost tray)
    {
        var butang = new ToolStripButton
        {
            Text = DemoLabel.ButangAutohadir,
            Image = IkonDulang.Untuk(FungsiDulang.SemuaFungsi),
            DisplayStyle = ToolStripItemDisplayStyle.ImageAndText,
            TextImageRelation = TextImageRelation.ImageBeforeText,
            ImageScaling = ToolStripItemImageScaling.SizeToFit,
            ToolTipText = DemoLabel.ButangAutohadirTip,
            AutoToolTip = false,
            Overflow = ToolStripItemOverflow.Never,
            Padding = new Padding(2, 0, 2, 0),
            Margin = new Padding(2, 2, RuangGrip + 2, 0),
            AccessibleName = DemoLabel.ButangAutohadir,
            AccessibleDescription = DemoLabel.ButangAutohadirTip,
        };

        // Ikon ialah salinan milik butang ini (IkonDulang.Untuk) — dilupus bersamanya.
        var ikon = butang.Image;
        butang.Disposed += (_, _) => ikon?.Dispose();

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

    /// <summary>
    /// Tambah butang Autohadir sebagai item TERAKHIR <paramref name="bar"/>
    /// dan pastikan ruang krip saiz dikhaskan.
    /// </summary>
    public static ToolStripButton Pasang(StatusStrip bar, TrayHost tray)
    {
        bar.ShowItemToolTips = true;
        var butang = Bina(tray);
        bar.Items.Add(butang);
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
