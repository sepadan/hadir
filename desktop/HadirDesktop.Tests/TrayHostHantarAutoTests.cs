using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Togol dulang "Hantar ke MOEIS (automatik)". TrayHost tidak tahu apa-apa
/// tentang stor tetapan — ia hanya memanggil dua callback. Ujian ini memastikan
/// item itu tidak wujud tanpa callback (selamat untuk pemanggil sedia ada), dan
/// bahawa hanya klik pemilik yang menulis.
/// </summary>
public class TrayHostHantarAutoTests
{
    private static ToolStripMenuItem? CariTogol(TrayHost tray) =>
        tray.ItemMenu.OfType<ToolStripMenuItem>()
            .FirstOrDefault(i => i.Text == DemoLabel.TrayHantarAuto);

    [Fact]
    public void TanpaCallback_TogolTidakDipapar()
    {
        using var tray = new TrayHost(SystemIcons.Application);

        Assert.Null(CariTogol(tray));
    }

    [Fact]
    public void SatuCallbackSahaja_TogolTidakDipapar()
    {
        using var hanyaBaca = new TrayHost(SystemIcons.Application, hantarAutoBaca: () => true);
        using var hanyaTulis = new TrayHost(SystemIcons.Application, hantarAutoTulis: _ => { });

        Assert.Null(CariTogol(hanyaBaca));
        Assert.Null(CariTogol(hanyaTulis));
    }

    [Fact]
    public void DuaCallback_TogolDipaparMengikutNilaiTersimpan()
    {
        using var mati = new TrayHost(SystemIcons.Application, hantarAutoBaca: () => false, hantarAutoTulis: _ => { });
        using var hidup = new TrayHost(SystemIcons.Application, hantarAutoBaca: () => true, hantarAutoTulis: _ => { });

        var itemMati = CariTogol(mati);
        var itemHidup = CariTogol(hidup);

        Assert.NotNull(itemMati);
        Assert.NotNull(itemHidup);
        Assert.False(itemMati!.Checked);
        Assert.True(itemHidup!.Checked);
    }

    [Fact]
    public void MembinaMenu_TidakPernahMenulis()
    {
        var tulisan = new List<bool>();
        using var tray = new TrayHost(SystemIcons.Application, hantarAutoBaca: () => true, hantarAutoTulis: tulisan.Add);

        Assert.Empty(tulisan);
    }

    [Fact]
    public void KlikMenghidupkan_MenulisBenar()
    {
        var tulisan = new List<bool>();
        using var tray = new TrayHost(SystemIcons.Application, hantarAutoBaca: () => false, hantarAutoTulis: tulisan.Add);

        CariTogol(tray)!.PerformClick();

        Assert.Equal(new[] { true }, tulisan);
    }

    [Fact]
    public void KlikSemula_MematikanSemula()
    {
        var tulisan = new List<bool>();
        using var tray = new TrayHost(SystemIcons.Application, hantarAutoBaca: () => false, hantarAutoTulis: tulisan.Add);
        var item = CariTogol(tray)!;

        item.PerformClick();
        item.PerformClick();

        Assert.Equal(new[] { true, false }, tulisan);
        Assert.False(item.Checked);
    }

    [Fact]
    public void KlikDariKeadaanHidup_MematikanDahulu()
    {
        var tulisan = new List<bool>();
        using var tray = new TrayHost(SystemIcons.Application, hantarAutoBaca: () => true, hantarAutoTulis: tulisan.Add);

        CariTogol(tray)!.PerformClick();

        Assert.Equal(new[] { false }, tulisan);
    }
}
