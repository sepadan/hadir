using System;
using System.Drawing;
using System.Windows.Forms;
using HadirDesktop;
using Xunit;
using Xunit.Abstractions;

namespace HadirDesktop.Tests;

/// <summary>
/// Ujian regresi bagi isu tetingkap dan bar status:
/// 1. ShowFromTray / LaksanaTunjukDariDulang mengekalkan tetingkap Maximized (tidak mengecutkan tetingkap).
/// 2. Butang Autohadir kekal kelihatan (Placement.Main) pada 1920x1020 merentas DPI (100%, 125%, 150%)
///    apabila teks Spring panjang dengan LabelStatusTerhad.
/// 3. KiraMargin ButangAutohadir memperuntukkan ruang krip pada tetingkap Normal dan meniadakan
///    ruang krip tambahan pada tetingkap Maximized (kerana WinForms tidak melukis krip pada tetingkap maximized).
/// </summary>
public class BugReproductionTests : IDisposable
{
    private readonly ITestOutputHelper _output;
    private readonly Form _form;
    private readonly StatusStrip _statusStrip;
    private readonly ToolStripButton _refreshButton;
    private readonly LabelStatusTerhad _stateLabel;
    private readonly LabelStatusTerhad _backendLabel;
    private readonly LabelStatusTerhad _kitaranLabel;
    private readonly LabelStatusTerhad _navLabel;
    private readonly ToolStripButton _autohadirButton;
    private readonly TrayHost _tray;

    public BugReproductionTests(ITestOutputHelper output)
    {
        _output = output;
        _form = new Form
        {
            Width = 1100,
            Height = 750,
            StartPosition = FormStartPosition.Manual,
            Location = new Point(0, 0),
        };

        _tray = new TrayHost(SystemIcons.Application);

        _refreshButton = new ToolStripButton { Text = "Segar semula status" };
        _stateLabel = new LabelStatusTerhad
        {
            Text = "Keadaan: Running · portal: diam",
            ToolTipText = "Keadaan: Running · portal: diam",
            AutoSize = false,
            Width = MainForm.LebarMaksKeadaan,
            TextAlign = ContentAlignment.MiddleLeft,
        };
        _backendLabel = new LabelStatusTerhad
        {
            Text = LabelBackend.Dikonfigurasikan,
            ToolTipText = LabelBackend.DikonfigurasikanPenuh,
            AutoSize = false,
            Width = MainForm.LebarMaksBackend,
            TextAlign = ContentAlignment.MiddleLeft,
        };
        _kitaranLabel = new LabelStatusTerhad
        {
            Text = "Kitaran: aktif (setiap 10 minit)",
            ToolTipText = "Kitaran: aktif (setiap 10 minit)",
            AutoSize = false,
            Width = MainForm.LebarMaksKitaran,
            TextAlign = ContentAlignment.MiddleLeft,
        };
        _navLabel = new LabelStatusTerhad
        {
            Text = string.Empty,
            Spring = true,
            TextAlign = ContentAlignment.MiddleRight,
        };

        _statusStrip = new StatusStrip();
        _statusStrip.Items.Add(_refreshButton);
        _statusStrip.Items.Add(new ToolStripSeparator());
        _statusStrip.Items.Add(_stateLabel);
        _statusStrip.Items.Add(new ToolStripSeparator());
        _statusStrip.Items.Add(_backendLabel);
        _statusStrip.Items.Add(new ToolStripSeparator());
        _statusStrip.Items.Add(_kitaranLabel);
        _statusStrip.Items.Add(_navLabel);

        _autohadirButton = ButangAutohadir.Pasang(_statusStrip, _tray);

        _form.Controls.Add(new Panel { Dock = DockStyle.Fill });
        _form.Controls.Add(new Label { Dock = DockStyle.Top, Height = 32 });
        _form.Controls.Add(_statusStrip);
    }

    public void Dispose()
    {
        _tray.MenuDulang.Close();
        _form.Dispose();
        _tray.Dispose();
    }

    // =========================================================================
    // BAHAGIAN 1: Seam ShowFromTray mengekalkan Maximized (tidak mengecilkan tetingkap)
    // =========================================================================

    [Fact]
    public void TunjukDariDulang_MengekalkanMaximized()
    {
        using var form = new Form { Width = 1100, Height = 750 };
        _ = form.Handle;
        form.WindowState = FormWindowState.Maximized;

        var showRequestedDipanggil = false;
        var updateStateDipanggil = false;

        MainForm.LaksanaTunjukDariDulang(
            form,
            onShowRequested: () => showRequestedDipanggil = true,
            onUpdateStateLabel: () => updateStateDipanggil = true);

        Assert.True(showRequestedDipanggil);
        Assert.True(updateStateDipanggil);
        Assert.Equal(FormWindowState.Maximized, form.WindowState);
    }

    [Fact]
    public void TunjukDariDulang_MemulihkanMinimizedKeNormal()
    {
        using var form = new Form { Width = 1100, Height = 750 };
        _ = form.Handle;
        form.WindowState = FormWindowState.Minimized;

        var showRequestedDipanggil = false;
        var updateStateDipanggil = false;

        MainForm.LaksanaTunjukDariDulang(
            form,
            onShowRequested: () => showRequestedDipanggil = true,
            onUpdateStateLabel: () => updateStateDipanggil = true);

        Assert.True(showRequestedDipanggil);
        Assert.True(updateStateDipanggil);
        Assert.Equal(FormWindowState.Normal, form.WindowState);
    }

    [Fact]
    public void TunjukDariDulang_MengekalkanNormal()
    {
        using var form = new Form { Width = 1100, Height = 750 };
        _ = form.Handle;
        form.WindowState = FormWindowState.Normal;

        MainForm.LaksanaTunjukDariDulang(form);

        Assert.Equal(FormWindowState.Normal, form.WindowState);
    }

    [Fact]
    public void BukaTetapan_DariTetingkapMaximized_MengekalkanKeadaanMaximized()
    {
        using var form = new Form { Width = 1100, Height = 750 };
        _ = form.Handle;
        form.WindowState = FormWindowState.Maximized;

        // Simulasi pembukaan dialog tetapan tempatan dari tetingkap yang dimaksimumkan:
        // ShowFromTray dipanggil dahulu, kemudian dialog dibuka.
        MainForm.LaksanaTunjukDariDulang(form);

        Assert.Equal(FormWindowState.Maximized, form.WindowState);
    }

    // =========================================================================
    // BAHAGIAN 2: LabelStatusTerhad Spring GetPreferredSize
    // =========================================================================

    [Fact]
    public void LabelStatusTerhad_Spring_GetPreferredSize_PulangLebarSifar()
    {
        var label = new LabelStatusTerhad("Mesej ralat panjang yang melebihi 500 piksel...")
        {
            Spring = true
        };

        var saiz = label.GetPreferredSize(Size.Empty);

        Assert.Equal(0, saiz.Width);
        Assert.True(saiz.Height > 0);
    }

    [Fact]
    public void LabelStatusTerhad_BukanSpring_MenghormatiLebarTetap()
    {
        var label = new LabelStatusTerhad("Teks panjang...")
        {
            Spring = false,
            AutoSize = false,
            Width = 230
        };

        var saiz = label.GetPreferredSize(Size.Empty);

        Assert.Equal(230, saiz.Width);
    }

    // =========================================================================
    // BAHAGIAN 3: ButangAutohadir KiraMargin (Dinamik Grip vs Maximized)
    // =========================================================================

    [Fact]
    public void KiraMargin_NormalDenganSizingGrip_MemperuntukkanRuangKrip()
    {
        using var form = new Form();
        using var bar = new StatusStrip { SizingGrip = true };
        form.Controls.Add(bar);
        form.WindowState = FormWindowState.Normal;

        var margin = ButangAutohadir.KiraMargin(bar);

        Assert.Equal(ButangAutohadir.RuangGrip + 2, margin.Right);
    }

    [Fact]
    public void KiraMargin_Maximized_TiadaRuangKripTambahan()
    {
        using var form = new Form();
        using var bar = new StatusStrip { SizingGrip = true };
        form.Controls.Add(bar);
        form.WindowState = FormWindowState.Maximized;

        var margin = ButangAutohadir.KiraMargin(bar);

        Assert.Equal(2, margin.Right);
    }

    [Fact]
    public void KiraMargin_SizingGripMati_TiadaRuangKripTambahan()
    {
        using var form = new Form();
        using var bar = new StatusStrip { SizingGrip = false };
        form.Controls.Add(bar);
        form.WindowState = FormWindowState.Normal;

        var margin = ButangAutohadir.KiraMargin(bar);

        Assert.Equal(2, margin.Right);
    }

    [Fact]
    public void ButangAutohadir_Pasang_MenyesuaikanMarginSemasaResizeBorang()
    {
        using var form = new Form { Width = 1100, Height = 750 };
        using var bar = new StatusStrip { Dock = DockStyle.Bottom, SizingGrip = true };
        using var tray = new TrayHost(SystemIcons.Application);

        var butang = ButangAutohadir.Pasang(bar, tray);
        form.Controls.Add(bar);
        _ = form.Handle;
        form.Show();
        Application.DoEvents();

        // Keadaan asal: Normal -> ruang krip diperuntukkan
        Assert.Equal(ButangAutohadir.RuangGrip + 2, butang.Margin.Right);

        // Tukar ke Maximized -> ruang krip ditiadakan secara dinamik
        form.WindowState = FormWindowState.Maximized;
        Application.DoEvents();
        Assert.Equal(2, butang.Margin.Right);

        // Pulih ke Normal -> ruang krip dikembalikan
        form.WindowState = FormWindowState.Normal;
        Application.DoEvents();
        Assert.Equal(ButangAutohadir.RuangGrip + 2, butang.Margin.Right);
    }

    // =========================================================================
    // BAHAGIAN 4: Ujian 1920x1020 Tanpa Screen Clipping Merentas DPI (100%, 125%, 150%)
    // =========================================================================

    [Theory]
    [InlineData(1.0f, "")]
    [InlineData(1.0f, "Portal: SedangLogin — Membuka portal MOEIS dan mengesahkan sesi idMe bagi kehadiran sekolah...")]
    [InlineData(1.0f, "Portal: PerluTindakanManusia — Ralat teknikal: Sesi idMe telah tamat tempoh dan tidak dapat dipulihkan secara automatik. Sila log masuk semula secara manual melalui pelayar sekolah. Ini adalah mesej yang sangat panjang untuk menguji tingkah laku status strip dalam keadaan terburuk apabila ralat berlaku berulang kali.")]
    [InlineData(1.25f, "")]
    [InlineData(1.25f, "Portal: SedangLogin — Membuka portal MOEIS...")]
    [InlineData(1.25f, "Portal: Diam — tiada tugasan belum siap hari ini; tiada portal dibuka, tiada log masuk.")]
    [InlineData(1.25f, "Portal: PerluTindakanManusia — Ralat teknikal: Sesi idMe telah tamat tempoh dan tidak dapat dipulihkan secara automatik. Sila log masuk semula secara manual melalui pelayar sekolah.")]
    [InlineData(1.5f, "")]
    [InlineData(1.5f, "Portal: Diam — tiada tugasan belum siap hari ini; tiada portal dibuka, tiada log masuk.")]
    [InlineData(1.5f, "Portal: PerluTindakanManusia — Ralat teknikal: Sesi idMe telah tamat tempoh dan tidak dapat dipulihkan secara automatik. Sila log masuk semula secara manual melalui pelayar sekolah. Ini adalah mesej yang sangat panjang untuk menguji tingkah laku status strip dalam keadaan terburuk apabila ralat berlaku berulang kali.")]
    public void StatusStrip_1920_TanpaScreenClipping_AutohadirKekalKelihatan(float scale, string text)
    {
        // Fixture luar skrin (Panel 1920x1020) mengelakkan pemotongan skrin fizikal OS
        using var font = new Font("Segoe UI", 9f * scale);
        using var panel = new Panel { Size = new Size(1920, 1020) };
        using var bar = new StatusStrip { Font = font, Dock = DockStyle.Bottom };
        using var tray = new TrayHost(SystemIcons.Application);

        var refBtn = new ToolStripButton { Text = "Segar semula status", Font = font };
        var stLabel = new LabelStatusTerhad
        {
            Text = "Keadaan: Running · portal: diam",
            AutoSize = false,
            Width = (int)(MainForm.LebarMaksKeadaan * scale),
            Font = font
        };
        var beLabel = new LabelStatusTerhad
        {
            Text = LabelBackend.Dikonfigurasikan,
            AutoSize = false,
            Width = (int)(MainForm.LebarMaksBackend * scale),
            Font = font
        };
        var kitLabel = new LabelStatusTerhad
        {
            Text = "Kitaran: aktif (setiap 10 minit)",
            AutoSize = false,
            Width = (int)(MainForm.LebarMaksKitaran * scale),
            Font = font
        };
        var nLabel = new LabelStatusTerhad
        {
            Text = text,
            Spring = true,
            Font = font
        };

        bar.Items.Add(refBtn);
        bar.Items.Add(new ToolStripSeparator());
        bar.Items.Add(stLabel);
        bar.Items.Add(new ToolStripSeparator());
        bar.Items.Add(beLabel);
        bar.Items.Add(new ToolStripSeparator());
        bar.Items.Add(kitLabel);
        bar.Items.Add(nLabel);

        var btnAuto = ButangAutohadir.Pasang(bar, tray);
        btnAuto.Font = font;

        panel.Controls.Add(bar);
        _ = panel.Handle;
        _ = bar.Handle;

        bar.PerformLayout();

        _output.WriteLine($"Scale={scale}, Text='{text.Substring(0, Math.Min(30, text.Length))}...', BarWidth={bar.Width}, DisplayRect={bar.DisplayRectangle.Width}");
        _output.WriteLine($"  NavLabel: Placement={nLabel.Placement}, Bounds={nLabel.Bounds}");
        _output.WriteLine($"  BtnAuto: Placement={btnAuto.Placement}, Bounds={btnAuto.Bounds}");

        // Butang Autohadir dan NavLabel mestilah sentiasa kelihatan pada bar utama (bukan None)
        Assert.Equal(ToolStripItemPlacement.Main, btnAuto.Placement);
        Assert.True(btnAuto.Visible);
        Assert.Equal(ToolStripItemPlacement.Main, nLabel.Placement);
        Assert.True(nLabel.Visible);
        Assert.True(btnAuto.Bounds.Right <= bar.DisplayRectangle.Right);
    }
}
