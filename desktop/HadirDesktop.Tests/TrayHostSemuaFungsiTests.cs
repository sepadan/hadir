using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Menu dulang 1.0.16: ikon pada setiap item perintah, item baharu "Semua
/// fungsi…", dan laluan Laksana/TetapkanTogol yang dipakai panel. Teks item
/// sedia ada dan susunannya tidak berubah.
/// </summary>
public class TrayHostSemuaFungsiTests
{
    private sealed class AutostartPalsu : IAutostartManager
    {
        public bool Berdaftar { get; set; }
        public List<string> Panggilan { get; } = new();

        public bool Ada() => Berdaftar;
        public void Daftar() { Berdaftar = true; Panggilan.Add("Daftar"); }
        public void Buang() { Berdaftar = false; Panggilan.Add("Buang"); }
    }

    private static TrayHost DulangPenuh(AutostartPalsu? autostart = null, List<bool>? tulisan = null) =>
        new(SystemIcons.Application, autostart ?? new AutostartPalsu(),
            hantarAutoBaca: () => false, hantarAutoTulis: v => tulisan?.Add(v));

    private static ToolStripMenuItem Cari(TrayHost tray, string teks) =>
        tray.ItemMenu.OfType<ToolStripMenuItem>().Single(i => i.Text == teks);

    [Fact]
    public void ItemSemuaFungsi_Wujud_SelepasTunjuk()
    {
        using var tray = DulangPenuh();

        var item = Cari(tray, DemoLabel.TraySemuaFungsi);
        Assert.Equal("Semua fungsi…", item.Text);
        Assert.Equal(DemoLabel.TrayShow, tray.ItemMenu[0].Text);
        Assert.Same(item, tray.ItemMenu[1]);
    }

    [Fact]
    public void KlikSemuaFungsi_MembangkitkanSemuaFungsiRequested()
    {
        using var tray = DulangPenuh();
        var bil = 0;
        var tunjuk = 0;
        tray.SemuaFungsiRequested += (_, _) => bil++;
        tray.ShowRequested += (_, _) => tunjuk++;

        Cari(tray, DemoLabel.TraySemuaFungsi).PerformClick();

        Assert.Equal(1, bil);
        Assert.Equal(0, tunjuk);
    }

    [Fact]
    public void SetiapItemPerintahDanTogol_AdaIkon_StatusDanSeparatorTanpaIkon()
    {
        using var tray = DulangPenuh();
        var item = tray.ItemMenu.OfType<ToolStripMenuItem>().ToList();
        var perintah = item.Where(i => i.Enabled).ToList();
        var status = item.Where(i => !i.Enabled).ToList();

        Assert.Equal(10, perintah.Count);   // 8 perintah + 2 togol
        Assert.All(perintah, i => Assert.NotNull(i.Image));
        Assert.Single(status);
        Assert.Null(status[0].Image);
        Assert.All(tray.ItemMenu.OfType<ToolStripSeparator>(), s => Assert.Null(s.Image));
    }

    [Fact]
    public void IkonItem_IalahIkonTercache()
    {
        using var tray = DulangPenuh();

        Assert.Same(IkonDulang.Tunjuk(), Cari(tray, DemoLabel.TrayShow).Image);
        Assert.Same(IkonDulang.SemuaFungsi(), Cari(tray, DemoLabel.TraySemuaFungsi).Image);
        Assert.Same(IkonDulang.Keluar(), Cari(tray, DemoLabel.TrayExit).Image);
        Assert.Same(IkonDulang.HantarAuto(), Cari(tray, DemoLabel.TrayHantarAuto).Image);
    }

    [Fact]
    public void TeksDanSusunanItemSediaAda_TidakBerubah()
    {
        using var tray = DulangPenuh();
        var teks = tray.ItemMenu.OfType<ToolStripMenuItem>().Where(i => i.Enabled)
            .Select(i => i.Text).Where(t => t != DemoLabel.TraySemuaFungsi).ToArray();

        Assert.Equal(new[]
        {
            "Tunjuk", "Tetapan Tempatan", "Akaun idMe…", "Log masuk idMe (atas permintaan)",
            "Cuba lagi (kosongkan penolakan)", "Mula bersama Windows", "Hantar ke MOEIS (automatik)",
            "Semak kemas kini…", "Keluar",
        }, teks);
    }

    [Fact]
    public void KlikSetiapItemPerintah_EventYangBetul()
    {
        using var tray = DulangPenuh();
        var log = new List<string>();
        tray.ShowRequested += (_, _) => log.Add("Tunjuk");
        tray.SemuaFungsiRequested += (_, _) => log.Add("SemuaFungsi");
        tray.OpenSettingsRequested += (_, _) => log.Add("Tetapan");
        tray.IdMeSettingsRequested += (_, _) => log.Add("IdMe");
        tray.LoginAutoRequested += (_, _) => log.Add("Login");
        tray.CubaLagiRequested += (_, _) => log.Add("CubaLagi");
        tray.SemakKemasKiniRequested += (_, _) => log.Add("KemasKini");
        tray.ExitRequested += (_, _) => log.Add("Keluar");

        foreach (var teks in new[]
        {
            DemoLabel.TrayShow, DemoLabel.TraySemuaFungsi, DemoLabel.TrayOpenSettings, DemoLabel.TrayIdMeSettings,
            DemoLabel.TrayLoginAuto, DemoLabel.TrayCubaLagi, DemoLabel.TraySemakKemasKini, DemoLabel.TrayExit,
        })
        {
            Cari(tray, teks).PerformClick();
        }

        Assert.Equal(new[] { "Tunjuk", "SemuaFungsi", "Tetapan", "IdMe", "Login", "CubaLagi", "KemasKini", "Keluar" }, log);
    }

    [Fact]
    public void Laksana_TogolBukanPerintah_TiadaEvent()
    {
        using var tray = DulangPenuh();
        var bil = 0;
        tray.ShowRequested += (_, _) => bil++;
        tray.ExitRequested += (_, _) => bil++;

        Assert.False(tray.Laksana(FungsiDulang.Autostart));
        Assert.False(tray.Laksana(FungsiDulang.HantarAuto));
        Assert.Equal(0, bil);
    }

    [Fact]
    public void TetapkanTogol_MenulisSekali_DanMenyelarasTandaDulang()
    {
        var tulisan = new List<bool>();
        var autostart = new AutostartPalsu();
        using var tray = DulangPenuh(autostart, tulisan);

        tray.TetapkanTogol(FungsiDulang.HantarAuto, true);
        tray.TetapkanTogol(FungsiDulang.Autostart, true);

        Assert.Equal(new[] { true }, tulisan);
        Assert.Equal(new[] { "Daftar" }, autostart.Panggilan);
        Assert.True(Cari(tray, DemoLabel.TrayHantarAuto).Checked);
        Assert.True(Cari(tray, DemoLabel.TrayAutostart).Checked);
        Assert.True(tray.KeadaanTogol(FungsiDulang.HantarAuto));
    }

    [Fact]
    public void TetapkanTogol_NilaiSama_TetapMenulis_SupayaStorSelaras()
    {
        // Tanda dulang boleh lapuk jika dialog idMe menukar tetapan; menulis
        // semula nilai yang dipilih menjamin stor mengikut pilihan pemilik.
        var tulisan = new List<bool>();
        using var tray = DulangPenuh(tulisan: tulisan);

        tray.TetapkanTogol(FungsiDulang.HantarAuto, false);

        Assert.Equal(new[] { false }, tulisan);
    }

    [Fact]
    public void TogolTidakDipapar_KeadaanNull_TetapkanTiadaKesan()
    {
        using var tray = new TrayHost(SystemIcons.Application);

        Assert.Null(tray.KeadaanTogol(FungsiDulang.Autostart));
        Assert.Null(tray.KeadaanTogol(FungsiDulang.HantarAuto));
        Assert.Null(tray.KeadaanTogol(FungsiDulang.Tunjuk));
        tray.TetapkanTogol(FungsiDulang.HantarAuto, true);   // tidak melontar
    }

    [Fact]
    public void TeksStatus_SamaDenganBarisStatusDulang()
    {
        using var tray = DulangPenuh();

        tray.SetPortalKeadaan(KeadaanPortal.Diam, "ujian");

        var status = tray.ItemMenu.OfType<ToolStripMenuItem>().Single(i => !i.Enabled);
        Assert.Equal(status.Text, tray.TeksStatus);
        Assert.Equal(LabelKeadaanPortal.UntukMenu(KeadaanPortal.Diam, "ujian"), tray.TeksStatus);
    }
}
