using System;
using System.Drawing;
using System.Windows.Forms;

namespace HadirDesktop;

/// <summary>
/// Butang "Autohadir" di hujung KANAN BAWAH tetingkap utama: membuka menu
/// dulang yang SAMA (<see cref="TrayHost.MenuDulang"/>) — tiada menu kedua,
/// tiada item disalin, jadi tanda semak, baris status kelabu dan ikon sentiasa
/// seragam.
///
/// Sejak 1.0.18 ia KAWALAN TERAPUNG anak borang, terus di atas bar status —
/// bukan item bar status. Pada 1.0.17 ia item terakhir StatusStrip, tetapi
/// kandungan tetap bar itu (1126 px) sudah melebihi lebarnya pada saiz lalai
/// (1082 px); StatusStrip tidak melukis item yang terkeluar, jadi butang itu
/// tidak pernah kelihatan. Kawalan terapung tidak bergantung pada ruang bar.
///
/// Butang berada di dasar tetingkap, jadi menu dibuka KE ATAS, sejajar ke kanan
/// dengan butang, dan diapit dalam kawasan kerja skrin supaya tidak terpotong.
/// </summary>
public static class ButangAutohadir
{
    /// <summary>Jarak dari tepi kanan klien borang (ruang untuk krip saiz).</summary>
    public const int JarakKanan = 8;

    /// <summary>
    /// Bina butang, tambah ke <paramref name="borang"/> di atas semua kawalan
    /// lain (termasuk WebView), dan letakkan terus di atas <paramref name="bar"/>.
    /// Kedudukan dikira semula setiap kali borang atau bar status berubah saiz.
    /// </summary>
    public static Button Pasang(Form borang, StatusStrip bar, TrayHost tray)
    {
        var butang = BinaTerapung(tray);
        borang.Controls.Add(butang);
        butang.BringToFront();

        void LetakSemula() => Letak(butang, borang.ClientSize, bar.Top);
        LetakSemula();
        borang.Layout += (_, _) => LetakSemula();
        bar.SizeChanged += (_, _) => LetakSemula();
        bar.LocationChanged += (_, _) => LetakSemula();
        butang.SizeChanged += (_, _) => LetakSemula();
        return butang;
    }

    /// <summary>
    /// Butang terapung: latar Firebrick (warna banner), teks putih tebal dan
    /// ikon grid — jelas di atas halaman portal terang atau gelap.
    /// </summary>
    public static Button BinaTerapung(TrayHost tray)
    {
        var butang = new Button
        {
            Text = DemoLabel.ButangAutohadir,
            Image = IkonDulang.Untuk(FungsiDulang.SemuaFungsi),
            ImageAlign = ContentAlignment.MiddleLeft,
            TextImageRelation = TextImageRelation.ImageBeforeText,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.Firebrick,
            ForeColor = Color.White,
            UseVisualStyleBackColor = false,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            Padding = new Padding(6, 2, 6, 2),
            Anchor = AnchorStyles.Bottom | AnchorStyles.Right,
            Cursor = Cursors.Hand,
            AccessibleName = DemoLabel.ButangAutohadir,
            AccessibleDescription = DemoLabel.ButangAutohadirTip,
        };
        butang.Font = new Font(butang.Font, FontStyle.Bold);
        butang.FlatAppearance.BorderColor = Color.DarkRed;
        butang.FlatAppearance.MouseOverBackColor = Color.FromArgb(200, 50, 50);
        butang.FlatAppearance.MouseDownBackColor = Color.DarkRed;

        var tip = new ToolTip();
        tip.SetToolTip(butang, DemoLabel.ButangAutohadirTip);
        butang.Disposed += (_, _) => tip.Dispose();

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
    /// Letak butang rata kanan (<see cref="JarakKanan"/>) dan terus di atas bar
    /// status (<paramref name="atasBarStatus"/>), dalam koordinat klien borang.
    /// </summary>
    public static void Letak(Control butang, Size klien, int atasBarStatus) =>
        butang.Location = KedudukanButang(butang.Size, klien, atasBarStatus);

    /// <summary>
    /// Sudut kiri-atas butang (koordinat klien) — fungsi TULEN. Bawah butang =
    /// atas bar status; kanan butang = klien − <see cref="JarakKanan"/>. Tidak
    /// pernah negatif, jadi butang kekal dalam klien walaupun tetingkap sangat kecil.
    /// </summary>
    public static Point KedudukanButang(Size saizButang, Size klien, int atasBarStatus) =>
        new(Math.Max(0, klien.Width - JarakKanan - saizButang.Width),
            Math.Max(0, atasBarStatus - saizButang.Height));

    /// <summary>Buka (atau tutup — togol) menu dulang di atas <paramref name="butang"/>.</summary>
    internal static bool Tunjuk(TrayHost tray, Control butang)
    {
        var butangSkrin = butang.RectangleToScreen(butang.ClientRectangle);
        var saizMenu = tray.MenuDulang.GetPreferredSize(Size.Empty);
        var kawasan = Screen.FromControl(butang).WorkingArea;
        var kiriAtas = KedudukanMenu(butangSkrin, saizMenu, kawasan);
        return tray.TunjukMenu(butang, butang.PointToClient(kiriAtas));
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
