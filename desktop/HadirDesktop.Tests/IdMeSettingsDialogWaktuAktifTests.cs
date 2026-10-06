using System;
using System.IO;
using System.Windows.Forms;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Dialog "Akaun idMe" dan tetingkap waktu aktif (1.0.15).
///
/// Peraturan dialog yang sama seperti togol HantarAuto: Simpan() membaca
/// dahulu dan mengubah HANYA medan yang dialog ini kawal. Tambahan untuk
/// waktu aktif: masa yang tidak sah semasa kotak semak dihidupkan DITOLAK
/// sebelum apa-apa ditulis — tiada tetapan separuh disimpan.
///
/// Stor tetapan ialah fail sementara; tiada kredensial sebenar disentuh
/// (kotak "Simpan pada PC ini" kekal tidak ditanda).
/// </summary>
public class IdMeSettingsDialogWaktuAktifTests : IDisposable
{
    private readonly string _dir;
    private readonly JsonIdMeLoginSettingsStore _stor;

    public IdMeSettingsDialogWaktuAktifTests()
    {
        _dir = Path.Combine(Path.GetTempPath(), "hadir-dialog-waktuaktif-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_dir);
        _stor = new JsonIdMeLoginSettingsStore(Path.Combine(_dir, "idme-login.json"));
    }

    public void Dispose()
    {
        try { if (Directory.Exists(_dir)) Directory.Delete(_dir, recursive: true); } catch { /* best-effort */ }
    }

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
    public void DibukaTanpaFail_KotakMati_MedanLalai_MedanTidakAktif()
    {
        using var dialog = BukaDialog();

        Assert.False(dialog.KotakWaktuAktif.Checked);
        Assert.Equal("06:30", dialog.MedanWaktuMula.Text);
        Assert.Equal("17:00", dialog.MedanWaktuTamat.Text);
        Assert.True(dialog.KotakIsninJumaat.Checked);
        // Medan hanya berkuat kuasa apabila kotak semak dihidupkan.
        Assert.False(dialog.MedanWaktuMula.Enabled);
        Assert.False(dialog.MedanWaktuTamat.Enabled);
        Assert.False(dialog.KotakIsninJumaat.Enabled);
    }

    [Fact]
    public void DibukaDenganNilaiTersimpan_DipaparkanSebenar()
    {
        _stor.Simpan(new IdMeLoginTetapan
        {
            WaktuAktifDidayakan = true,
            WaktuAktifMula = "07:15",
            WaktuAktifTamat = "13:45",
            WaktuAktifIsninJumaat = false,
        });

        using var dialog = BukaDialog();

        Assert.True(dialog.KotakWaktuAktif.Checked);
        Assert.Equal("07:15", dialog.MedanWaktuMula.Text);
        Assert.Equal("13:45", dialog.MedanWaktuTamat.Text);
        Assert.False(dialog.KotakIsninJumaat.Checked);
        Assert.True(dialog.MedanWaktuMula.Enabled);
        Assert.True(dialog.MedanWaktuTamat.Enabled);
        Assert.True(dialog.KotakIsninJumaat.Enabled);
    }

    [Fact]
    public void TogolKotak_MengaktifkanMedan()
    {
        using var dialog = BukaDialog();

        dialog.KotakWaktuAktif.Checked = true;
        Assert.True(dialog.MedanWaktuMula.Enabled);

        dialog.KotakWaktuAktif.Checked = false;
        Assert.False(dialog.MedanWaktuMula.Enabled);
    }

    [Fact]
    public void Hidupkan_DanSimpan_Disimpan()
    {
        using var dialog = BukaDialog();
        dialog.KotakWaktuAktif.Checked = true;
        dialog.MedanWaktuMula.Text = "07:00";
        dialog.MedanWaktuTamat.Text = "16:30";
        dialog.KotakIsninJumaat.Checked = false;
        dialog.Simpan();

        var t = _stor.Baca();
        Assert.True(t.WaktuAktifDidayakan);
        Assert.Equal("07:00", t.WaktuAktifMula);
        Assert.Equal("16:30", t.WaktuAktifTamat);
        Assert.False(t.WaktuAktifIsninJumaat);
    }

    [Fact]
    public void RuangDiHujung_DipangkasSebelumDisimpan()
    {
        using var dialog = BukaDialog();
        dialog.KotakWaktuAktif.Checked = true;
        dialog.MedanWaktuMula.Text = " 07:00 ";
        dialog.Simpan();

        Assert.Equal("07:00", _stor.Baca().WaktuAktifMula);
    }

    [Fact]
    public void TersimpanHidup_KotakTidakDisentuh_KekalHidup()
    {
        _stor.Simpan(new IdMeLoginTetapan { WaktuAktifDidayakan = true, WaktuAktifMula = "08:00" });

        using var dialog = BukaDialog();
        dialog.Simpan();

        var t = _stor.Baca();
        Assert.True(t.WaktuAktifDidayakan);
        Assert.Equal("08:00", t.WaktuAktifMula);
    }

    [Fact]
    public void Matikan_DanSimpan_JadiMati()
    {
        _stor.Simpan(new IdMeLoginTetapan { WaktuAktifDidayakan = true });

        using var dialog = BukaDialog();
        dialog.KotakWaktuAktif.Checked = false;
        dialog.Simpan();

        Assert.False(_stor.Baca().WaktuAktifDidayakan);
    }

    /// <summary>
    /// Masa tidak sah semasa kotak HIDUP: tiada apa-apa ditulis (termasuk
    /// medan lain), dan pemilik diberitahu kenapa.
    /// </summary>
    [Theory]
    [InlineData("7:00", "17:00")]
    [InlineData("07:00", "25:00")]
    [InlineData("", "17:00")]
    [InlineData("pagi", "petang")]
    [InlineData("08:00", "08:00")]
    public void Hidup_MasaTidakSah_DitolakTanpaMenulis(string mula, string tamat)
    {
        _stor.Simpan(new IdMeLoginTetapan { LoginAuto = false, HantarAuto = true });

        using var dialog = BukaDialog();
        dialog.KotakWaktuAktif.Checked = true;
        dialog.MedanWaktuMula.Text = mula;
        dialog.MedanWaktuTamat.Text = tamat;
        dialog.KotakHantarAuto.Checked = false;   // perubahan lain juga TIDAK disimpan
        dialog.Simpan();

        var t = _stor.Baca();
        Assert.False(t.WaktuAktifDidayakan);
        Assert.True(t.HantarAuto);
        Assert.Contains("HH:mm", dialog.TeksStatus);
    }

    /// <summary>
    /// Kotak MATI: medan tidak berkuat kuasa, jadi teks rosak di situ tidak
    /// menghalang Simpan — dan tidak menimpa nilai tersimpan yang sah.
    /// </summary>
    [Fact]
    public void Mati_MasaTidakSah_TidakMenghalang_DanTidakMenimpa()
    {
        _stor.Simpan(new IdMeLoginTetapan { WaktuAktifMula = "06:45", HantarAuto = false });

        using var dialog = BukaDialog();
        dialog.MedanWaktuMula.Text = "rosak";
        dialog.KotakHantarAuto.Checked = true;
        dialog.Simpan();

        var t = _stor.Baca();
        Assert.False(t.WaktuAktifDidayakan);
        Assert.Equal("06:45", t.WaktuAktifMula);
        Assert.True(t.HantarAuto);
    }

    [Fact]
    public void MedanLama_KekalSelepasSimpanWaktuAktif()
    {
        _stor.Simpan(new IdMeLoginTetapan
        {
            LoginAuto = true,
            BenarkanTerusTanpaFrasa = true,
            MaksPenolakanBerturut = 3,
            HantarAuto = true,
        });

        using var dialog = BukaDialog();
        dialog.KotakWaktuAktif.Checked = true;
        dialog.Simpan();

        var t = _stor.Baca();
        Assert.True(t.LoginAuto);
        Assert.True(t.BenarkanTerusTanpaFrasa);
        Assert.Equal(3, t.MaksPenolakanBerturut);
        Assert.True(t.HantarAuto);
        Assert.True(t.WaktuAktifDidayakan);
    }

    [Fact]
    public void Simpan_WaktuAktif_TidakMenulisKredensial()
    {
        var kredensial = new KredensialPalsu();

        using var dialog = BukaDialog(kredensial);
        dialog.KotakWaktuAktif.Checked = true;
        dialog.Simpan();

        Assert.Equal(0, kredensial.BilSimpan);
    }

    [Fact]
    public void KawalanWaktuAktif_BenarBenarDalamDialog_DenganLabel()
    {
        using var dialog = BukaDialog();

        Assert.Equal(IdMeSettingsDialog.LabelWaktuAktif, dialog.KotakWaktuAktif.Text);
        Assert.StartsWith("Hadkan masa aktif", IdMeSettingsDialog.LabelWaktuAktif);
        Assert.Equal(IdMeSettingsDialog.LabelIsninJumaat, dialog.KotakIsninJumaat.Text);
        Assert.Contains("Isnin–Jumaat", IdMeSettingsDialog.LabelIsninJumaat);

        var semua = new System.Collections.Generic.List<Control>(SemuaKawalan(dialog));
        Assert.Contains(dialog.KotakWaktuAktif, semua);
        Assert.Contains(dialog.MedanWaktuMula, semua);
        Assert.Contains(dialog.MedanWaktuTamat, semua);
        Assert.Contains(dialog.KotakIsninJumaat, semua);
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
