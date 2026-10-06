using System;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Windows.Forms;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Butang "Autohadir" (1.0.18): kawalan TERAPUNG di hujung kanan bawah, terus
/// di atas bar status, membuka menu dulang yang SAMA.
///
/// Pada 1.0.17 butang itu item StatusStrip dan tidak pernah kelihatan: kandungan
/// tetap bar (1126 px) melebihi lebarnya (1082 px) dan item yang terkeluar tidak
/// dilukis. Ujian di sini memasang butang dengan <see cref="ButangAutohadir.Pasang"/>
/// — kod yang SAMA dipanggil MainForm — pada borang 1100x750 berbentuk sama
/// (banner atas, isian, StatusStrip bawah). MainForm sendiri tidak dibina kerana
/// pembinanya membaca tetapan, stor kredensial dan registry sebenar PC; wayarnya
/// diperiksa melalui sumber (corak <see cref="BarStatusBersihTests"/>).
/// </summary>
public class ButangAutohadirTests
{
    /// <summary>Borang seperti MainForm: 1100x750, banner atas, isian, bar status.</summary>
    private sealed class BorangUjian : IDisposable
    {
        public Form Borang { get; } = new() { Width = 1100, Height = 750 };
        public StatusStrip Bar { get; } = new();
        public TrayHost Tray { get; } = new(SystemIcons.Application);
        public Button Butang { get; }

        public BorangUjian()
        {
            // Bar status sengaja PENUH (teks lebih lebar daripada borang),
            // seperti MainForm pada saiz lalai.
            Bar.Items.Add(new ToolStripButton { Text = "Segar semula status" });
            Bar.Items.Add(new ToolStripStatusLabel { Text = new string('K', 400) });
            Bar.Items.Add(new ToolStripStatusLabel { Text = string.Empty, Spring = true });
            Borang.Controls.Add(new Panel { Dock = DockStyle.Fill });   // ganti WebView2
            Borang.Controls.Add(new Label { Dock = DockStyle.Top, Height = 32 });
            Borang.Controls.Add(Bar);
            Butang = ButangAutohadir.Pasang(Borang, Bar, Tray);
        }

        public void Dispose()
        {
            Tray.MenuDulang.Close();
            Borang.Dispose();
            Tray.Dispose();
        }
    }

    /// <summary>
    /// Bangkitkan Click butang sebenar. <c>Button.PerformClick</c> tidak
    /// berbuat apa-apa pada borang yang tidak dipapar (CanSelect palsu).
    /// </summary>
    private static void Klik(Button butang) =>
        typeof(Control).GetMethod("OnClick", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)!
            .Invoke(butang, new object[] { EventArgs.Empty });

    // ---------- TrayHost: satu instance menu ----------

    [Fact]
    public void MenuDulang_BukanNull_InstanceYangMembawaItemMenu()
    {
        using var tray = new TrayHost(SystemIcons.Application);

        Assert.NotNull(tray.MenuDulang);
        Assert.Same(tray.MenuDulang, tray.MenuDulang);
        Assert.Same(tray.ItemMenu, tray.MenuDulang.Items);
        Assert.Contains(tray.MenuDulang.Items.OfType<ToolStripItem>(), i => i.Text == DemoLabel.TrayExit);
    }

    [Fact]
    public void TunjukMenu_Togol_KaliKeduaMenutup()
    {
        using var tray = new TrayHost(SystemIcons.Application);
        using var bar = new StatusStrip();
        try
        {
            Assert.True(tray.TunjukMenu(bar, Point.Empty));
            Assert.True(tray.MenuDulang.Visible);

            Assert.False(tray.TunjukMenu(bar, Point.Empty));
            Assert.False(tray.MenuDulang.Visible);
        }
        finally
        {
            tray.MenuDulang.Close();
        }
    }

    [Fact]
    public void BaruDitutupKlikLuar_PalsuSebelumSebarangPenutupan()
    {
        using var tray = new TrayHost(SystemIcons.Application);

        Assert.False(tray.BaruDitutupKlikLuar());
    }

    // ---------- butang terapung ----------

    [Fact]
    public void Pasang_ButangDalamControlsBorang_BukanItemBarStatus()
    {
        using var u = new BorangUjian();

        Assert.Same(u.Borang, u.Butang.Parent);
        Assert.Contains(u.Butang, u.Borang.Controls.Cast<Control>());
        Assert.DoesNotContain(u.Bar.Items.Cast<ToolStripItem>(), i => i.Text == DemoLabel.ButangAutohadir);
    }

    [Fact]
    public void Pasang_AnchorBawahKanan_DanPalingAtasDalamTertibZ()
    {
        using var u = new BorangUjian();

        Assert.True(u.Butang.Anchor.HasFlag(AnchorStyles.Bottom));
        Assert.True(u.Butang.Anchor.HasFlag(AnchorStyles.Right));
        Assert.Equal(0, u.Borang.Controls.GetChildIndex(u.Butang));   // di atas WebView
    }

    [Fact]
    public void Pasang_SaizLalai_TerusDiAtasBarStatus_RataKanan_DalamKlien()
    {
        using var u = new BorangUjian();
        var b = u.Butang.Bounds;
        var klien = u.Borang.ClientSize;

        Assert.True(u.Bar.Top > 0);
        Assert.True(b.Bottom <= u.Bar.Top, $"butang {b} menindih bar status (atas {u.Bar.Top})");
        Assert.Equal(u.Bar.Top, b.Bottom);
        Assert.Equal(klien.Width - ButangAutohadir.JarakKanan, b.Right);
        Assert.True(b.Left >= 0 && b.Top >= 0 && b.Right <= klien.Width && b.Bottom <= klien.Height);
        Assert.True(b.Width > 0 && b.Height > 0);
    }

    [Theory]
    [InlineData(420, 320)]
    [InlineData(800, 600)]
    [InlineData(1100, 750)]
    [InlineData(1920, 1040)]
    public void SebarangSaizBorang_ButangKekalKelihatan_DiAtasBarStatus(int lebar, int tinggi)
    {
        using var u = new BorangUjian();

        u.Borang.Size = new Size(lebar, tinggi);
        var b = u.Butang.Bounds;
        var klien = u.Borang.ClientSize;

        Assert.Equal(u.Bar.Top, b.Bottom);
        Assert.Equal(klien.Width - ButangAutohadir.JarakKanan, b.Right);
        Assert.True(b.Left >= 0 && b.Right <= klien.Width, $"butang {b} di luar klien {klien}");
    }

    [Fact]
    public void Butang_TeksIkonGayaDanTip()
    {
        using var u = new BorangUjian();
        var butang = u.Butang;

        Assert.Equal("Autohadir", butang.Text);
        Assert.NotNull(butang.Image);
        Assert.Same(IkonDulang.SemuaFungsi(), butang.Image);
        Assert.Equal(FlatStyle.Flat, butang.FlatStyle);
        Assert.Equal(Color.Firebrick, butang.BackColor);
        Assert.Equal(Color.White, butang.ForeColor);
        Assert.True(butang.Font.Bold);
        Assert.Contains("dulang", butang.AccessibleDescription);
    }

    [Fact]
    public void KlikButang_MembukaMenuDulangYangSama_KlikKeduaMenutup()
    {
        using var u = new BorangUjian();
        var bilItem = u.Tray.MenuDulang.Items.Count;

        Klik(u.Butang);

        Assert.True(u.Tray.MenuDulang.Visible);
        Assert.Same(u.Butang, u.Tray.MenuDulang.SourceControl);
        Assert.Equal(bilItem, u.Tray.MenuDulang.Items.Count);

        Klik(u.Butang);   // togol
        Assert.False(u.Tray.MenuDulang.Visible);
    }

    [Fact]
    public void KedudukanButang_TetingkapSangatKecil_TidakNegatif()
    {
        var p = ButangAutohadir.KedudukanButang(new Size(110, 30), new Size(60, 20), 10);

        Assert.Equal(new Point(0, 0), p);
    }

    [Fact]
    public void KedudukanButang_BawahButang_AtasBarStatus_KananKurangJarak()
    {
        var p = ButangAutohadir.KedudukanButang(new Size(110, 30), new Size(1084, 711), 689);

        Assert.Equal(new Point(1084 - ButangAutohadir.JarakKanan - 110, 689 - 30), p);
    }

    // ---------- kedudukan menu (TULEN) ----------

    private static readonly Rectangle Kerja = new(0, 0, 1920, 1040);

    [Fact]
    public void Kedudukan_DiAtasButang_SejajarKanan()
    {
        var butang = new Rectangle(1500, 900, 100, 22);

        var p = ButangAutohadir.KedudukanMenu(butang, new Size(260, 300), Kerja);

        Assert.Equal(new Point(1600 - 260, 900 - 300), p);   // kanan-bawah menu = kanan-atas butang
    }

    [Fact]
    public void Kedudukan_ButangDiHujungKananSkrin_TidakTerpotongDiKanan()
    {
        var butang = new Rectangle(1880, 1010, 100, 22);   // terkeluar sedikit di kanan

        var p = ButangAutohadir.KedudukanMenu(butang, new Size(260, 300), Kerja);

        Assert.True(p.X + 260 <= Kerja.Right);
        Assert.Equal(1010 - 300, p.Y);
    }

    [Fact]
    public void Kedudukan_ButangDiBawahKawasanKerja_TidakTerpotongDiBawah()
    {
        // Tetingkap separuh di bawah bar tugas: butang di luar kawasan kerja.
        var butang = new Rectangle(1500, 1400, 100, 22);

        var p = ButangAutohadir.KedudukanMenu(butang, new Size(260, 300), Kerja);

        Assert.Equal(Kerja.Bottom - 300, p.Y);
    }

    [Fact]
    public void Kedudukan_MenuTerlaluTinggi_TepiAtasDiutamakan()
    {
        var butang = new Rectangle(1500, 200, 100, 22);

        var p = ButangAutohadir.KedudukanMenu(butang, new Size(260, 2000), Kerja);

        Assert.Equal(Kerja.Top, p.Y);
    }

    [Fact]
    public void Kedudukan_ButangDiKiri_TidakTerkeluarDiKiri()
    {
        var butang = new Rectangle(10, 900, 60, 22);

        var p = ButangAutohadir.KedudukanMenu(butang, new Size(260, 300), Kerja);

        Assert.Equal(Kerja.Left, p.X);
    }

    [Fact]
    public void Kedudukan_MonitorKedua_DiapitDalamKawasannya()
    {
        var kedua = new Rectangle(1920, 0, 1280, 984);
        var butang = new Rectangle(3150, 960, 100, 22);

        var p = ButangAutohadir.KedudukanMenu(butang, new Size(260, 300), kedua);

        Assert.InRange(p.X, kedua.Left, kedua.Right - 260);
        Assert.InRange(p.Y, kedua.Top, kedua.Bottom - 300);
    }

    // ---------- wayar MainForm (pengawal sumber) ----------

    private static string Sumber(string fail)
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null && !File.Exists(Path.Combine(dir.FullName, "publish.ps1"))) dir = dir.Parent;
        Assert.NotNull(dir);
        return BarStatusBersihTests.BuangKomen(File.ReadAllText(Path.Combine(dir!.FullName, "HadirDesktop", fail)));
    }

    [Fact]
    public void MainForm_BarStatusKekalSeperti1016_TanpaButangAutohadir()
    {
        var s = Sumber("MainForm.cs");

        var item = Regex.Matches(s, @"_statusStrip\.Items\.Add\(([^;]*)\);")
            .Select(m => m.Groups[1].Value.Trim()).ToArray();

        Assert.Equal(new[]
        {
            "_refreshButton", "new ToolStripSeparator()", "_stateLabel", "new ToolStripSeparator()",
            "_backendLabel", "new ToolStripSeparator()", "_kitaranLabel", "_navLabel",
        }, item);
    }

    [Fact]
    public void MainForm_ButangDipasangTerapung_SelepasBarStatusDitambah()
    {
        var s = Sumber("MainForm.cs");
        const string pasang = "_autohadirButton = ButangAutohadir.Pasang(this, _statusStrip, _tray);";

        Assert.Contains("private Button _autohadirButton = null!;", s);
        Assert.Contains(pasang, s);
        Assert.True(s.IndexOf("Controls.Add(_statusStrip);", StringComparison.Ordinal)
            < s.IndexOf(pasang, StringComparison.Ordinal));
    }

    [Fact]
    public void MainForm_ButangMemakaiMenuTrayHost_TiadaMenuKedua()
    {
        var s = Sumber("MainForm.cs");

        Assert.DoesNotContain("new ContextMenuStrip", s);
        Assert.DoesNotContain("new ContextMenuStrip", Sumber("ButangAutohadir.cs"));
        Assert.Single(Regex.Matches(Sumber("TrayHost.cs"), @"new ContextMenuStrip"));
    }
}
