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
/// Butang "Autohadir" (1.0.17): hujung kanan bar status, membuka menu dulang
/// yang SAMA. MainForm memerlukan message-loop untuk dibina, jadi wayarnya
/// diperiksa melalui sumber (corak <see cref="BarStatusBersihTests"/>);
/// butang itu sendiri dibina dan diklik pada StatusStrip yang tidak dipapar.
/// </summary>
public class ButangAutohadirTests
{
    private static ToolStripButton BinaPadaBar(TrayHost tray, out StatusStrip bar)
    {
        bar = new StatusStrip();
        bar.Items.Add(new ToolStripStatusLabel { Spring = true });
        var butang = ButangAutohadir.Bina(tray);
        bar.Items.Add(butang);
        return butang;
    }

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

    // ---------- butang ----------

    [Fact]
    public void Butang_TeksIkonDanTip()
    {
        using var tray = new TrayHost(SystemIcons.Application);
        using var butang = ButangAutohadir.Bina(tray);

        Assert.Equal("Autohadir", butang.Text);
        Assert.Same(IkonDulang.SemuaFungsi(), butang.Image);
        Assert.Equal(ToolStripItemDisplayStyle.ImageAndText, butang.DisplayStyle);
        Assert.Contains("dulang", butang.ToolTipText);
    }

    [Fact]
    public void KlikButang_MembukaMenuDulangYangSama_TanpaSalinan()
    {
        using var tray = new TrayHost(SystemIcons.Application);
        var butang = BinaPadaBar(tray, out var bar);
        using var dilupus = bar;
        var bilItem = tray.MenuDulang.Items.Count;
        try
        {
            butang.PerformClick();

            Assert.True(tray.MenuDulang.Visible);
            Assert.Same(bar, tray.MenuDulang.SourceControl);
            Assert.Equal(bilItem, tray.MenuDulang.Items.Count);

            butang.PerformClick();   // togol
            Assert.False(tray.MenuDulang.Visible);
        }
        finally
        {
            tray.MenuDulang.Close();
        }
    }

    [Fact]
    public void Butang_TanpaBar_TidakMembukaApaApa()
    {
        using var tray = new TrayHost(SystemIcons.Application);
        using var butang = ButangAutohadir.Bina(tray);

        Assert.False(ButangAutohadir.Tunjuk(tray, butang));
        Assert.False(tray.MenuDulang.Visible);
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
    public void MainForm_ButangAutohadirIalahItemTerakhirBarStatus_SelepasNavLabel()
    {
        var s = Sumber("MainForm.cs");

        var item = Regex.Matches(s, @"_statusStrip\.Items\.Add\(([^;]*)\);")
            .Select(m => m.Groups[1].Value.Trim()).ToArray();

        Assert.Equal(new[]
        {
            "_refreshButton", "new ToolStripSeparator()", "_stateLabel", "new ToolStripSeparator()",
            "_backendLabel", "new ToolStripSeparator()", "_kitaranLabel", "_navLabel", "_autohadirButton",
        }, item);
    }

    [Fact]
    public void MainForm_ButangMemakaiMenuTrayHost_TiadaMenuKedua()
    {
        var s = Sumber("MainForm.cs");

        Assert.Contains("_autohadirButton = ButangAutohadir.Bina(_tray);", s);
        Assert.DoesNotContain("new ContextMenuStrip", s);
        Assert.DoesNotContain("new ContextMenuStrip", Sumber("ButangAutohadir.cs"));
        Assert.Single(Regex.Matches(Sumber("TrayHost.cs"), @"new ContextMenuStrip"));
    }
}
