using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Panel "Semua fungsi" (1.0.16). Kandungan diuji melalui pembina TULEN
/// <see cref="PanelFungsiBina"/>; tetingkap dibina tanpa dipapar dan setiap
/// butang memanggil callback palsu — tiada tetapan, tiada proses luar.
/// </summary>
public class PanelFungsiTests
{
    private static readonly string[] LabelDulang =
    {
        DemoLabel.TrayShow, DemoLabel.TraySemuaFungsi, DemoLabel.TrayOpenSettings, DemoLabel.TrayIdMeSettings,
        DemoLabel.TrayLoginAuto, DemoLabel.TrayCubaLagi, DemoLabel.TrayAutostart, DemoLabel.TrayHantarAuto,
        DemoLabel.TraySemakKemasKini, DemoLabel.TrayExit,
    };

    private static List<ItemFungsi> SemuaItem() =>
        PanelFungsiBina.Senarai().SelectMany(k => k.Item).ToList();

    // ---------- pembina TULEN ----------

    [Fact]
    public void Senarai_MeliputiSetiapLabelDulang()
    {
        var label = SemuaItem().Select(i => i.Label).ToHashSet();

        foreach (var l in LabelDulang) Assert.Contains(l, label);
        Assert.Equal(LabelDulang.Length, label.Count);
    }

    [Fact]
    public void Senarai_LabelEksplisit_TeksDulangSebenar()
    {
        var label = SemuaItem().Select(i => i.Label).ToList();

        Assert.Contains("Tunjuk", label);
        Assert.Contains("Tetapan Tempatan", label);
        Assert.Contains("Akaun idMe…", label);
        Assert.Contains("Log masuk idMe (atas permintaan)", label);
        Assert.Contains("Cuba lagi (kosongkan penolakan)", label);
        Assert.Contains("Mula bersama Windows", label);
        Assert.Contains("Hantar ke MOEIS (automatik)", label);
        Assert.Contains("Semak kemas kini…", label);
        Assert.Contains("Keluar", label);
        Assert.Contains("Semua fungsi…", label);
    }

    [Fact]
    public void Senarai_TiadaLabelAtauFungsiBerulang()
    {
        var item = SemuaItem();

        Assert.Equal(item.Count, item.Select(i => i.Label).Distinct().Count());
        Assert.Equal(item.Count, item.Select(i => i.Fungsi).Distinct().Count());
        Assert.Equal(Enum.GetValues<FungsiDulang>().Length, item.Count);
    }

    [Fact]
    public void Senarai_SetiapKelompokBertajukDanTidakKosong()
    {
        var kelompok = PanelFungsiBina.Senarai();

        Assert.Equal(new[] { "Paparan", "Tetapan", "Penghantaran", "Sistem" }, kelompok.Select(k => k.Tajuk));
        Assert.All(kelompok, k => Assert.NotEmpty(k.Item));
        Assert.All(SemuaItem(), i => Assert.False(string.IsNullOrWhiteSpace(i.Penerangan)));
    }

    [Fact]
    public void Senarai_JenisFungsi_TogolDanPanelIni()
    {
        var jenis = SemuaItem().ToDictionary(i => i.Fungsi, i => i.Jenis);

        Assert.Equal(JenisFungsi.Togol, jenis[FungsiDulang.Autostart]);
        Assert.Equal(JenisFungsi.Togol, jenis[FungsiDulang.HantarAuto]);
        Assert.Equal(JenisFungsi.PanelIni, jenis[FungsiDulang.SemuaFungsi]);
        Assert.Equal(7, jenis.Values.Count(j => j == JenisFungsi.Perintah));
    }

    [Fact]
    public void Senarai_KelompokMengikutSpesifikasi()
    {
        var peta = PanelFungsiBina.Senarai().ToDictionary(k => k.Tajuk, k => k.Item.Select(i => i.Fungsi).ToArray());

        Assert.Equal(new[] { FungsiDulang.Tunjuk, FungsiDulang.SemuaFungsi }, peta["Paparan"]);
        Assert.Equal(new[] { FungsiDulang.TetapanTempatan, FungsiDulang.AkaunIdMe, FungsiDulang.Autostart }, peta["Tetapan"]);
        Assert.Equal(new[] { FungsiDulang.LoginIdMe, FungsiDulang.CubaLagi, FungsiDulang.HantarAuto }, peta["Penghantaran"]);
        Assert.Equal(new[] { FungsiDulang.SemakKemasKini, FungsiDulang.Keluar }, peta["Sistem"]);
    }

    // ---------- tetingkap WinForms (dibina, tidak dipapar) ----------

    private sealed class Rakaman
    {
        public List<FungsiDulang> Dilaksana { get; } = new();
        public List<(FungsiDulang, bool)> Ditulis { get; } = new();
        public Dictionary<FungsiDulang, bool?> Togol { get; } = new()
        {
            [FungsiDulang.Autostart] = false,
            [FungsiDulang.HantarAuto] = true,
        };
        public string Status { get; set; } = "Portal: diam";

        public PanelFungsi Bina() => new(
            Dilaksana.Add,
            f => Togol.TryGetValue(f, out var v) ? v : null,
            (f, v) => { Ditulis.Add((f, v)); Togol[f] = v; },
            () => Status);
    }

    [Fact]
    public void Panel_BolehDibina_SatuButangBagiSetiapFungsi()
    {
        using var panel = new Rakaman().Bina();

        Assert.Equal(DemoLabel.PanelFungsiTajuk, panel.Text);
        Assert.Equal("Semua fungsi — HADIR Desktop", panel.Text);
        Assert.False(panel.Visible);
        Assert.Equal(Enum.GetValues<FungsiDulang>().Length, panel.Butang.Count);
        foreach (var item in SemuaItem())
        {
            Assert.Equal(item.Label, panel.Butang[item.Fungsi].Text);
            // Salinan persendirian (1.0.19): kandungan sama, instance milik panel.
            using var rujukan = IkonDulang.Untuk(item.Fungsi);
            var imej = panel.Butang[item.Fungsi].Image!;
            Assert.NotSame(rujukan, imej);
            Assert.Equal(IkonDulangTests.CapPiksel(rujukan), IkonDulangTests.CapPiksel(imej));
        }
    }

    [Fact]
    public void Panel_SetiapButangMemilikiSalinanIkonSendiri_DilupusBersamaPanel()
    {
        var panel = new Rakaman().Bina();
        var imej = panel.Butang.Values.Select(b => b.Image!).ToList();

        Assert.Equal(imej.Count, imej.Distinct().Count());   // tiada instance dikongsi
        panel.Dispose();

        // Imej yang dilupuskan melontar ArgumentException apabila dibaca.
        Assert.All(imej, i => Assert.Throws<ArgumentException>(() => i.Width));
    }

    [Fact]
    public void Panel_KlikButangPerintah_MemanggilCallbackSahaja()
    {
        var r = new Rakaman();
        using var panel = r.Bina();

        foreach (var item in SemuaItem().Where(i => i.Jenis == JenisFungsi.Perintah))
        {
            Klik(panel.Butang[item.Fungsi]);
        }

        Assert.Equal(SemuaItem().Where(i => i.Jenis == JenisFungsi.Perintah).Select(i => i.Fungsi), r.Dilaksana);
        Assert.Empty(r.Ditulis);
    }

    [Fact]
    public void Panel_ItemPanelIni_Dipapar_TidakBolehDiklik()
    {
        var r = new Rakaman();
        using var panel = r.Bina();

        var butang = panel.Butang[FungsiDulang.SemuaFungsi];
        Klik(butang);

        Assert.False(butang.Enabled);
        Assert.Empty(r.Dilaksana);
    }

    [Fact]
    public void Panel_TogolDibacaDaripadaCallback_TanpaMenulis()
    {
        var r = new Rakaman();
        using var panel = r.Bina();

        Assert.False(((CheckBox)panel.Butang[FungsiDulang.Autostart]).Checked);
        Assert.True(((CheckBox)panel.Butang[FungsiDulang.HantarAuto]).Checked);
        Assert.Empty(r.Ditulis);
    }

    [Fact]
    public void Panel_KlikTogol_MenulisMelaluiCallback()
    {
        var r = new Rakaman();
        using var panel = r.Bina();

        ((CheckBox)panel.Butang[FungsiDulang.Autostart]).Checked = true;
        ((CheckBox)panel.Butang[FungsiDulang.HantarAuto]).Checked = false;

        Assert.Equal(new[] { (FungsiDulang.Autostart, true), (FungsiDulang.HantarAuto, false) }, r.Ditulis);
        Assert.Empty(r.Dilaksana);
    }

    [Fact]
    public void Panel_Segarkan_MengikutKeadaanBaharu_TanpaMenulis()
    {
        var r = new Rakaman();
        using var panel = r.Bina();

        r.Togol[FungsiDulang.HantarAuto] = false;
        r.Status = "Portal: log masuk";
        panel.Segarkan();

        Assert.False(((CheckBox)panel.Butang[FungsiDulang.HantarAuto]).Checked);
        Assert.Contains("Portal: log masuk", panel.LabelStatus.Text);
        Assert.Empty(r.Ditulis);
    }

    [Fact]
    public void Panel_TogolTidakTersedia_Dilumpuhkan()
    {
        var r = new Rakaman();
        r.Togol[FungsiDulang.Autostart] = null;
        using var panel = r.Bina();

        Assert.False(panel.Butang[FungsiDulang.Autostart].Enabled);
        Assert.True(panel.Butang[FungsiDulang.HantarAuto].Enabled);
    }

    [Fact]
    public void Panel_StatusSamaDenganTeksDulang()
    {
        using var tray = new TrayHost(SystemIcons.Application);
        tray.SetPortalKeadaan(KeadaanPortal.Diam, "ujian");
        using var panel = new PanelFungsi(_ => { }, tray.KeadaanTogol, tray.TetapkanTogol, () => tray.TeksStatus);

        Assert.Contains(tray.TeksStatus, panel.LabelStatus.Text);
    }

    [Fact]
    public void Panel_DisambungKeDulang_ButangMembangkitkanEventDulang()
    {
        using var tray = new TrayHost(SystemIcons.Application, hantarAutoBaca: () => false, hantarAutoTulis: _ => { });
        var log = new List<string>();
        tray.ShowRequested += (_, _) => log.Add("Tunjuk");
        tray.ExitRequested += (_, _) => log.Add("Keluar");
        using var panel = new PanelFungsi(f => tray.Laksana(f), tray.KeadaanTogol, tray.TetapkanTogol, () => tray.TeksStatus);

        Klik(panel.Butang[FungsiDulang.Tunjuk]);
        Klik(panel.Butang[FungsiDulang.Keluar]);
        ((CheckBox)panel.Butang[FungsiDulang.HantarAuto]).Checked = true;

        Assert.Equal(new[] { "Tunjuk", "Keluar" }, log);
        Assert.True(tray.ItemMenu.OfType<ToolStripMenuItem>().Single(i => i.Text == DemoLabel.TrayHantarAuto).Checked);
    }

    [Fact]
    public void Panel_TiadaMedanTeksAtauKataLaluan()
    {
        using var panel = new Rakaman().Bina();

        Assert.Empty(SemuaKawalan(panel).OfType<TextBoxBase>());
    }

    [Fact]
    public void Panel_LebarMunasabah()
    {
        using var panel = new Rakaman().Bina();
        var saiz = panel.PreferredSize;

        Assert.InRange(saiz.Width, 440, 620);
        Assert.True(saiz.Height > 200);
    }

    // ---------- susun atur: tiada pemotongan, lajur dan baris seragam ----------

    [Fact]
    public void Butang_LebarMemuatkanLabelTerpanjang_TanpaPemotongan()
    {
        using var panel = new Rakaman().Bina();

        foreach (var butang in panel.Butang.Values)
        {
            var teks = TextRenderer.MeasureText(butang.Text, butang.Font, Size.Empty, TextFormatFlags.SingleLine).Width;
            // Teks + ikon + Padding butang + sempadan/jarak (anggaran longgar 12px).
            Assert.True(teks + butang.Image!.Width + butang.Padding.Horizontal + 12 <= butang.Width,
                $"'{butang.Text}' terpotong: teks {teks}px, butang {butang.Width}px");
        }
    }

    [Fact]
    public void Butang_LabelTerpanjangIalahLogMasukIdMe_DanMuat()
    {
        using var panel = new Rakaman().Bina();
        var terpanjang = panel.Butang.Values
            .OrderByDescending(b => TextRenderer.MeasureText(b.Text, b.Font).Width).First();

        Assert.Equal(DemoLabel.TrayLoginAuto, terpanjang.Text);
        Assert.True(panel.LebarLajurButang >=
            TextRenderer.MeasureText(DemoLabel.TrayLoginAuto, terpanjang.Font).Width + IkonDulang.Saiz);
    }

    [Fact]
    public void LajurButang_SamaLebar_DalamSetiapKelompok()
    {
        using var panel = new Rakaman().Bina();

        Assert.Equal(PanelFungsiBina.Senarai().Count, panel.Grid.Count);
        foreach (var grid in panel.Grid)
        {
            Assert.Equal(2, grid.ColumnStyles.Count);
            Assert.All(grid.ColumnStyles.Cast<ColumnStyle>(), c => Assert.Equal(SizeType.Absolute, c.SizeType));
            Assert.Equal(panel.LebarLajurButang, grid.ColumnStyles[0].Width);
            Assert.Equal(PanelFungsi.LebarPenerangan, grid.ColumnStyles[1].Width);
        }
        Assert.Single(panel.Butang.Values.Select(b => b.Width).Distinct());
    }

    [Fact]
    public void Baris_SamaTinggi_DanPeneranganMuatDalamBaris()
    {
        using var panel = new Rakaman().Bina();

        foreach (var grid in panel.Grid)
        {
            Assert.All(grid.RowStyles.Cast<RowStyle>(), r =>
            {
                Assert.Equal(SizeType.Absolute, r.SizeType);
                Assert.Equal(panel.TinggiBaris, r.Height);
            });
            foreach (Control c in grid.Controls)
            {
                // Tiada kawalan berlabuh atas/bawah = ditengahkan menegak.
                Assert.Equal(AnchorStyles.None, c.Anchor & (AnchorStyles.Top | AnchorStyles.Bottom));
                Assert.True(c.GetPreferredSize(new Size(c.MaximumSize.Width, 0)).Height + c.Margin.Vertical <= panel.TinggiBaris,
                    $"'{c.Text}' lebih tinggi daripada baris");
            }
        }
    }

    [Fact]
    public void SusunAtur_TepiKananButangSegaris_DanTengahMenegakSama()
    {
        using var panel = new Rakaman().Bina();
        panel.PerformLayout();
        foreach (var grid in panel.Grid) grid.PerformLayout();

        var kanan = panel.Butang.Values.Select(b => b.Right).Distinct().ToList();
        Assert.Single(kanan);
        foreach (var grid in panel.Grid)
        {
            for (var r = 0; r < grid.RowCount; r++)
            {
                var butang = grid.GetControlFromPosition(0, r)!;
                var teks = grid.GetControlFromPosition(1, r)!;
                var tengahButang = butang.Top + butang.Height / 2.0;
                var tengahTeks = teks.Top + teks.Height / 2.0;
                Assert.InRange(Math.Abs(tengahButang - tengahTeks), 0, 1.0);
            }
        }
    }

    [Fact]
    public void KiraLebarButang_FonLebihBesar_ButangLebihLebar()
    {
        using var kecil = new Font(FontFamily.GenericSansSerif, 9f);
        using var besar = new Font(FontFamily.GenericSansSerif, 14f);
        var senarai = PanelFungsiBina.Senarai();

        Assert.True(PanelFungsi.KiraLebarButang(besar, senarai) > PanelFungsi.KiraLebarButang(kecil, senarai));
        Assert.True(PanelFungsi.KiraTinggiBaris(besar, senarai) > PanelFungsi.KiraTinggiBaris(kecil, senarai));
    }

    /// <summary>
    /// Bangkitkan event Click butang sebenar. <c>Button.PerformClick</c> tidak
    /// berbuat apa-apa pada tetingkap yang tidak dipapar (CanSelect palsu), dan
    /// ujian ini sengaja tidak memaparkan tetingkap.
    /// </summary>
    private static void Klik(ButtonBase butang) =>
        typeof(Control).GetMethod("OnClick", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)!
            .Invoke(butang, new object[] { EventArgs.Empty });

    private static IEnumerable<Control> SemuaKawalan(Control induk)
    {
        foreach (Control c in induk.Controls)
        {
            yield return c;
            foreach (var anak in SemuaKawalan(c)) yield return anak;
        }
    }
}
