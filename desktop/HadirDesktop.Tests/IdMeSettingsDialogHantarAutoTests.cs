using System;
using System.IO;
using System.Linq;
using System.Windows.Forms;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Dialog "Akaun idMe" dan togol <c>HantarAuto</c>.
///
/// Pepijat sebenar yang dilindungi di sini: `Simpan()` dahulunya membina
/// <see cref="IdMeLoginTetapan"/> BAHARU tanpa <c>HantarAuto</c>, jadi opt-in
/// penghantaran MOEIS dimatikan SENYAP setiap kali pemilik menyimpan tetapan.
///
/// Stor tetapan ialah fail sementara (seam laluan fail) — tiada kredensial
/// sebenar disentuh: kotak "Simpan pada PC ini" kekal TIDAK ditanda, jadi stor
/// kredensial palsu di bawah tidak pernah ditulis.
/// </summary>
public class IdMeSettingsDialogHantarAutoTests : IDisposable
{
    private readonly string _dir;
    private readonly JsonIdMeLoginSettingsStore _stor;

    public IdMeSettingsDialogHantarAutoTests()
    {
        _dir = Path.Combine(Path.GetTempPath(), "hadir-dialog-hantarauto-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_dir);
        _stor = new JsonIdMeLoginSettingsStore(Path.Combine(_dir, "idme-login.json"));
    }

    public void Dispose()
    {
        try { if (Directory.Exists(_dir)) Directory.Delete(_dir, recursive: true); } catch { /* best-effort */ }
    }

    /// <summary>Stor kredensial palsu: tiada DPAPI, tiada nilai, tiada tulisan.</summary>
    private sealed class KredensialPalsu : IKredensialIdMeStore
    {
        public int BilSimpan { get; private set; }

        public void Simpan(string pengguna, string kataLaluan, string kunciKeselamatan) => BilSimpan++;
        public KredensialIdMe? Baca() => null;
        public KredensialStatus Status() => new();
        public bool Ada() => false;
        public void Padam() { }
    }

    private IdMeSettingsDialog BukaDialog(KredensialPalsu? kredensial = null) =>
        new(kredensial ?? new KredensialPalsu(), _stor);

    [Fact]
    public void TersimpanHidup_KotakDitanda_KekalHidup()
    {
        _stor.Simpan(new IdMeLoginTetapan { HantarAuto = true });

        using var dialog = BukaDialog();
        dialog.KotakHantarAuto.Checked = true;
        dialog.Simpan();

        Assert.True(_stor.Baca().HantarAuto);
    }

    [Fact]
    public void TersimpanHidup_KotakTidakDisentuh_KekalHidup()
    {
        _stor.Simpan(new IdMeLoginTetapan { HantarAuto = true });

        using var dialog = BukaDialog();
        // Dialog dibuka -> kotak mesti menunjukkan nilai tersimpan SEBENAR.
        Assert.True(dialog.KotakHantarAuto.Checked);
        dialog.Simpan();

        Assert.True(_stor.Baca().HantarAuto);
    }

    [Fact]
    public void KotakTidakDitanda_JadiMati()
    {
        _stor.Simpan(new IdMeLoginTetapan { HantarAuto = true });

        using var dialog = BukaDialog();
        dialog.KotakHantarAuto.Checked = false;
        dialog.Simpan();

        Assert.False(_stor.Baca().HantarAuto);
    }

    [Fact]
    public void TersimpanMati_KotakDitanda_JadiHidup()
    {
        _stor.Simpan(new IdMeLoginTetapan { HantarAuto = false });

        using var dialog = BukaDialog();
        Assert.False(dialog.KotakHantarAuto.Checked);
        dialog.KotakHantarAuto.Checked = true;
        dialog.Simpan();

        Assert.True(_stor.Baca().HantarAuto);
    }

    [Fact]
    public void MedanDialogLain_TetapDisimpan()
    {
        _stor.Simpan(new IdMeLoginTetapan { LoginAuto = true, MaksPenolakanBerturut = 3, HantarAuto = true });

        using var dialog = BukaDialog();
        dialog.Simpan();

        var dibaca = _stor.Baca();
        Assert.True(dibaca.LoginAuto);
        Assert.Equal(3, dibaca.MaksPenolakanBerturut);
        Assert.True(dibaca.HantarAuto);
    }

    [Fact]
    public void Simpan_TanpaKotakSimpanPadaPc_TidakMenulisKredensial()
    {
        var kredensial = new KredensialPalsu();

        using var dialog = BukaDialog(kredensial);
        dialog.Simpan();

        Assert.Equal(0, kredensial.BilSimpan);
    }

    [Fact]
    public void KotakHantarAuto_DipaparDenganLabelOptIn()
    {
        using var dialog = BukaDialog();

        Assert.Equal(IdMeSettingsDialog.LabelHantarAuto, dialog.KotakHantarAuto.Text);
        Assert.Contains("MOEIS", IdMeSettingsDialog.LabelHantarAuto);
        Assert.Contains("opt-in", IdMeSettingsDialog.LabelHantarAuto);
        // Kotak itu benar-benar dalam pokok kawalan dialog (bukan medan terapung).
        Assert.Contains(dialog.KotakHantarAuto, SemuaKawalan(dialog));
    }

    private static System.Collections.Generic.IEnumerable<Control> SemuaKawalan(Control akar)
    {
        foreach (Control anak in akar.Controls)
        {
            yield return anak;
            foreach (var cucu in SemuaKawalan(anak)) yield return cucu;
        }
    }
}
