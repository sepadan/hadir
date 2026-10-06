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
/// Butang "Autohadir" (1.0.20): item TERAKHIR bar status (bar bawah), kompak
/// (≤ 95 px), membuka menu dulang yang SAMA (<see cref="TrayHost.MenuDulang"/>).
///
/// Pada 1.0.17 butang tidak pernah kelihatan kerana bar terlebih muat (1126 px > 1082 px).
/// Pada 1.0.18 butang dipindahkan ke kawalan terapung. Pada 1.0.20 butang dikembalikan
/// KE DALAM bar status dengan saiz padat dan ruang krip saiz dikhaskan.
/// </summary>
public class ButangAutohadirTests
{
    private readonly Xunit.Abstractions.ITestOutputHelper? _output;

    public ButangAutohadirTests(Xunit.Abstractions.ITestOutputHelper? output = null)
    {
        _output = output;
    }
    /// <summary>Borang seperti MainForm: 1100x750, banner atas, isian, bar status.</summary>
    private sealed class BorangUjian : IDisposable
    {
        public Form Borang { get; } = new() { Width = 1100, Height = 750, StartPosition = FormStartPosition.Manual, Location = new Point(50, 50) };
        public StatusStrip Bar { get; } = new();
        public TrayHost Tray { get; } = new(SystemIcons.Application);
        public ToolStripButton Butang { get; }
        public ToolStripButton SegarButang { get; }
        public ToolStripStatusLabel KeadaanLabel { get; }
        public ToolStripStatusLabel BackendLabel { get; }
        public ToolStripStatusLabel KitaranLabel { get; }
        public ToolStripStatusLabel NavLabel { get; }

        public BorangUjian(int lebar = 1100, int tinggi = 750)
        {
            Borang.Size = new Size(lebar, tinggi);

            SegarButang = new ToolStripButton { Text = "Segar semula status" };
            KeadaanLabel = new LabelStatusTerhad
            {
                Text = "Keadaan: Running · portal: diam",
                ToolTipText = "Keadaan: Running · portal: diam — Diam — tiada tugasan belum siap hari ini; tiada portal dibuka, tiada log masuk.",
                AutoSize = false,
                Width = MainForm.LebarMaksKeadaan,
                TextAlign = ContentAlignment.MiddleLeft,
            };
            BackendLabel = new LabelStatusTerhad
            {
                Text = LabelBackend.Dikonfigurasikan,
                ToolTipText = LabelBackend.DikonfigurasikanPenuh,
                AutoSize = false,
                Width = MainForm.LebarMaksBackend,
                TextAlign = ContentAlignment.MiddleLeft,
            };
            KitaranLabel = new LabelStatusTerhad
            {
                Text = LabelKitaran.Teks(new FaktaKitaran(Aktif: false, SebabMati: KitaranAuto.SebabLuarWaktuAktif("06:30", "17:00", true)), DateTime.Now),
                ToolTipText = LabelKitaran.TeksPenuh(new FaktaKitaran(Aktif: false, SebabMati: KitaranAuto.SebabLuarWaktuAktif("06:30", "17:00", true)), DateTime.Now),
                AutoSize = false,
                Width = MainForm.LebarMaksKitaran,
                TextAlign = ContentAlignment.MiddleLeft,
            };
            NavLabel = new ToolStripStatusLabel { Text = string.Empty, Spring = true, TextAlign = ContentAlignment.MiddleRight };

            Bar.Items.Add(SegarButang);
            Bar.Items.Add(new ToolStripSeparator());
            Bar.Items.Add(KeadaanLabel);
            Bar.Items.Add(new ToolStripSeparator());
            Bar.Items.Add(BackendLabel);
            Bar.Items.Add(new ToolStripSeparator());
            Bar.Items.Add(KitaranLabel);
            Bar.Items.Add(NavLabel);

            Butang = ButangAutohadir.Pasang(Bar, Tray);

            Borang.Controls.Add(new Panel { Dock = DockStyle.Fill });
            Borang.Controls.Add(new Label { Dock = DockStyle.Top, Height = 32 });
            Borang.Controls.Add(Bar);

            // Paksa susun atur borang dan bar dijalankan
            Borang.PerformLayout();
            Bar.PerformLayout();
        }

        public void Dispose()
        {
            Tray.MenuDulang.Close();
            Borang.Dispose();
            Tray.Dispose();
        }
    }

    /// <summary>
    /// Bangkitkan OnClick butang sebenar melalui refleksi.
    /// </summary>
    private static void Klik(ToolStripItem butang) =>
        typeof(ToolStripItem).GetMethod("OnClick", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)!
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

    // ---------- Butang dalam bar status (1.0.20) ----------

    [Fact]
    public void Pasang_ButangItemTerakhirBarStatus_BukanControlsBorang()
    {
        using var u = new BorangUjian();

        Assert.Same(u.Bar, u.Butang.Owner);
        Assert.Same(u.Butang, u.Bar.Items[^1]);
        Assert.DoesNotContain(u.Borang.Controls.Cast<Control>(), c => c is Button);
    }

    [Fact]
    public void Butang_Kompak_TeksIkonOverflowNeverDanLebar()
    {
        using var u = new BorangUjian();
        var butang = u.Butang;

        Assert.Equal("Autohadir", butang.Text);
        Assert.NotNull(butang.Image);
        Assert.Equal(16, butang.Image!.Width);
        Assert.Equal(16, butang.Image!.Height);
        Assert.Equal(ToolStripItemOverflow.Never, butang.Overflow);

        var saizPilihan = butang.GetPreferredSize(Size.Empty);
        // Sasaran reka bentuk: butang kompak <= ~95 px
        Assert.True(saizPilihan.Width <= 95, $"Lebar butang {saizPilihan.Width} melebihi 95 px");
    }

    [Fact]
    public void KlikButang_MembukaMenuDulangYangSama_KlikKeduaMenutup()
    {
        using var u = new BorangUjian();
        var bilItem = u.Tray.MenuDulang.Items.Count;

        Klik(u.Butang);

        Assert.True(u.Tray.MenuDulang.Visible);
        Assert.Same(u.Bar, u.Tray.MenuDulang.SourceControl);
        Assert.Equal(bilItem, u.Tray.MenuDulang.Items.Count);

        Klik(u.Butang);   // togol
        Assert.False(u.Tray.MenuDulang.Visible);
    }

    // ---------- Ujian Kawalan Wajib (Ukuran Lebar & Grip) ----------

    [Fact]
    public void BarStatus_LebarPilihanItemDanGrip_MuatDalamDisplayRectangle_SaizLalai()
    {
        using var u = new BorangUjian(1100, 750);
        var bar = u.Bar;

        // SENARIO TERBURUK: Tetapkan teks label secara langsung kepada rentetan panjang penuh
        // termasuk ayat luar waktu aktif (536 px) dan backend penuh sebelum pengiraan.
        u.KeadaanLabel.Text = "Keadaan: Running · portal: backend-sementara-gagal";
        u.KeadaanLabel.ToolTipText = "Keadaan: Running · portal: backend-sementara-gagal — Backend HADIR gagal sementara (masa tamat/bukan-JSON/5xx); deman belum dipastikan — akan dicuba semula pada kitaran seterusnya. Tiada portal dibuka.";

        u.BackendLabel.Text = "Backend: sedia (rahsia + apiUrl sah)";
        u.BackendLabel.ToolTipText = LabelBackend.DikonfigurasikanPenuh;

        u.KitaranLabel.Text = "Kitaran: mati — di luar waktu aktif (06:30–17:00, Isnin–Jumaat) — disambung sendiri dalam waktu itu";
        u.KitaranLabel.ToolTipText = "Kitaran: mati — di luar waktu aktif (06:30–17:00, Isnin–Jumaat) — disambung sendiri dalam waktu itu";

        u.Borang.PerformLayout();
        bar.PerformLayout();

        // Klien 1084 px, DisplayRectangle.Width ~1082 px
        var displayWidth = bar.DisplayRectangle.Width;
        Assert.True(displayWidth >= 1060, $"DisplayRectangle terlalu kecil: {displayWidth}");

        // Kira jumlah GetPreferredSize() semua item bukan-spring + margin
        var jumlahTetap = 0;
        foreach (ToolStripItem item in bar.Items)
        {
            if (item is ToolStripStatusLabel { Spring: true }) continue;
            var saiz = item.GetPreferredSize(Size.Empty).Width;
            _output?.WriteLine($"Item: '{item.Text}' (Type: {item.GetType().Name}) => PreferredWidth: {saiz}, Margin: {item.Margin}");
            jumlahTetap += saiz + item.Margin.Horizontal;
        }

        const int grip = ButangAutohadir.RuangGrip;
        var jumlahDenganGripDanPadding = jumlahTetap + grip + bar.Padding.Horizontal;
        var bakiNav = displayWidth - jumlahTetap;

        _output?.WriteLine($"jumlahTetap: {jumlahTetap}, grip: {grip}, padding: {bar.Padding.Horizontal}, jumlahDenganGripDanPadding: {jumlahDenganGripDanPadding}, displayWidth: {displayWidth}, bakiNav: {bakiNav}");

        // WAJIB: Jaminan struktural <= 1050 px (sekurang-kurangnya 30 px simpanan untuk label Spring _navLabel)
        Assert.True(
            jumlahDenganGripDanPadding <= 1050,
            $"Jumlah item + grip + padding = {jumlahDenganGripDanPadding} melebihi had jaminan struktural 1050 px");

        // WAJIB: Jumlah preferred size semua item + grip + padding <= DisplayRectangle.Width
        Assert.True(
            jumlahDenganGripDanPadding <= displayWidth,
            $"Jumlah item ({jumlahTetap}) + grip ({grip}) + padding ({bar.Padding.Horizontal}) = {jumlahDenganGripDanPadding} melebihi DisplayRectangle {displayWidth}");

        // WAJIB: Bounds.Right butang Autohadir <= DisplayRectangle.Width - grip
        Assert.True(
            u.Butang.Bounds.Right <= displayWidth - grip,
            $"Bounds.Right ({u.Butang.Bounds.Right}) melebihi sempadan selamat grip ({displayWidth - grip})");

        // Ruang baki untuk navLabel (Spring) mestilah sekurang-kurangnya 30 px
        Assert.True(bakiNav >= 30, $"Baki ruang navLabel mesti sekurang-kurangnya 30 px, didapati: {bakiNav}");
    }

    [Fact]
    public void LabelStatus_SetiapLabelMempunyaiToolTipTextTidakKosong()
    {
        using var u = new BorangUjian(1100, 750);

        Assert.False(string.IsNullOrWhiteSpace(u.KeadaanLabel.ToolTipText), "ToolTipText KeadaanLabel tidak boleh kosong");
        Assert.False(string.IsNullOrWhiteSpace(u.BackendLabel.ToolTipText), "ToolTipText BackendLabel tidak boleh kosong");
        Assert.False(string.IsNullOrWhiteSpace(u.KitaranLabel.ToolTipText), "ToolTipText KitaranLabel tidak boleh kosong");
        Assert.False(string.IsNullOrWhiteSpace(u.Butang.ToolTipText), "ToolTipText ButangAutohadir tidak boleh kosong");
    }

    [Fact]
    public void BarStatus_SenarioTerburuk_KonfigurasiTergendalaDanLuarWaktu_ButangKekalKelihatan()
    {
        using var u = new BorangUjian(1100, 750);
        var bar = u.Bar;

        // Senario teks terpanjang yang mungkin terjadi serentak
        u.KeadaanLabel.Text = "Keadaan: PerluTindakanManusia · portal: backend-sementara-gagal";
        u.BackendLabel.Text = "Backend: klaim & hantar MATI — konfigurasi bertukar selepas lancar — mulakan semula aplikasi untuk menggunakannya.";
        u.KitaranLabel.Text = "Kitaran: mati — di luar waktu aktif (06:30–17:00, Isnin–Jumaat) — disambung sendiri dalam waktu itu";

        u.Borang.PerformLayout();
        bar.PerformLayout();

        var displayWidth = bar.DisplayRectangle.Width;
        const int grip = ButangAutohadir.RuangGrip;

        // AutoSize=false mengehadkan saiz ke lebar had maksimum
        Assert.Equal(MainForm.LebarMaksKeadaan, u.KeadaanLabel.GetPreferredSize(Size.Empty).Width);
        Assert.Equal(MainForm.LebarMaksBackend, u.BackendLabel.GetPreferredSize(Size.Empty).Width);
        Assert.Equal(MainForm.LebarMaksKitaran, u.KitaranLabel.GetPreferredSize(Size.Empty).Width);

        // Butang Autohadir kekal tersedia dan berada dalam batas bar status
        Assert.True(u.Butang.Available);
        Assert.True(u.Butang.Bounds.Width > 0);
        Assert.True(u.Butang.Bounds.Right <= displayWidth - grip);
    }

    [Theory]
    [InlineData(1100, 750)]
    [InlineData(1280, 800)]
    [InlineData(1920, 1080)]
    public void BarStatus_MuatDanTidakDitutupGrip_PadaPelbagaiLebar(int lebar, int tinggi)
    {
        using var u = new BorangUjian(lebar, tinggi);
        var bar = u.Bar;
        const int grip = ButangAutohadir.RuangGrip;
        var displayWidth = bar.DisplayRectangle.Width;

        // Bounds.Right butang Autohadir mesti <= DisplayRectangle.Width - grip
        Assert.True(
            u.Butang.Bounds.Right <= displayWidth - grip,
            $"Pada {lebar}x{tinggi}: Bounds.Right ({u.Butang.Bounds.Right}) melebihi {displayWidth - grip}");
    }

    [Theory]
    [InlineData(420, 320)]
    [InlineData(800, 600)]
    public void LebarKecil_ButangAutohadirDiutamakan_KekalTersedia(int lebar, int tinggi)
    {
        using var u = new BorangUjian(lebar, tinggi);

        // Pada lebar kecil, butang Autohadir mempunyai Overflow.Never supaya ia diutamakan
        Assert.Equal(ToolStripItemOverflow.Never, u.Butang.Overflow);
        Assert.True(u.Butang.Available);
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
    public void MainForm_BarStatusMengandungiButangAutohadirSebagaiItemTerakhir()
    {
        var s = Sumber("MainForm.cs");

        var item = Regex.Matches(s, @"_statusStrip\.Items\.Add\(([^;]*)\);")
            .Select(m => m.Groups[1].Value.Trim()).ToArray();

        Assert.Equal(new[]
        {
            "_refreshButton", "new ToolStripSeparator()", "_stateLabel", "new ToolStripSeparator()",
            "_backendLabel", "new ToolStripSeparator()", "_kitaranLabel", "_navLabel",
        }, item);

        // Butang dipasang ke bar status sebagai item terakhir
        Assert.Contains("_autohadirButton = ButangAutohadir.Pasang(_statusStrip, _tray);", s);
        Assert.Contains("private ToolStripButton _autohadirButton = null!;", s);
    }

    [Fact]
    public void MainForm_TiadaKawalanTerapungAutohadir()
    {
        var s = Sumber("MainForm.cs");

        Assert.DoesNotContain("Controls.Add(_autohadirButton)", s);
        Assert.DoesNotContain("ButangAutohadir.Pasang(this,", s);
        Assert.DoesNotContain("private Button _autohadirButton", s);
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
