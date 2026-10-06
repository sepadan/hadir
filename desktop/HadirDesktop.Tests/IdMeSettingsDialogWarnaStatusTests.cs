using System;
using System.Drawing;
using System.IO;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Ujian warna status kredensial pada <see cref="IdMeSettingsDialog"/>:
///   - Ada: Color.SeaGreen (hijau)
///   - Tiada: Color.Firebrick (merah)
///   - Rosak: Color.Firebrick (merah)
///   - Simpan tanpa tanda kotak: Color.Firebrick (merah)
///   - Simpan berjaya: Color.SeaGreen (hijau)
/// Tiada DPAPI atau kredensial sebenar disentuh.
/// </summary>
public class IdMeSettingsDialogWarnaStatusTests : IDisposable
{
    private readonly string _dir;
    private readonly JsonIdMeLoginSettingsStore _storTetapan;

    public IdMeSettingsDialogWarnaStatusTests()
    {
        _dir = Path.Combine(Path.GetTempPath(), "hadir-dialog-warnastatus-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_dir);
        _storTetapan = new JsonIdMeLoginSettingsStore(Path.Combine(_dir, "idme-login.json"));
    }

    public void Dispose()
    {
        try { if (Directory.Exists(_dir)) Directory.Delete(_dir, recursive: true); } catch { /* best-effort */ }
    }

    private sealed class KredensialPalsu : IKredensialIdMeStore
    {
        public bool AdaKredensial { get; set; }
        public bool RosakKredensial { get; set; }
        public string PenggunaSamar { get; set; } = "8***";
        public bool KunciAda { get; set; } = true;
        public int BilSimpan { get; private set; }

        public void Simpan(string pengguna, string kataLaluan, string kunciKeselamatan)
        {
            BilSimpan++;
            AdaKredensial = true;
            RosakKredensial = false;
        }

        public KredensialIdMe? Baca() => null;

        public KredensialStatus Status() => new()
        {
            Ada = AdaKredensial,
            Rosak = RosakKredensial,
            PenggunaSamar = PenggunaSamar,
            KunciAda = KunciAda
        };

        public bool Ada() => AdaKredensial;
        public void Padam()
        {
            AdaKredensial = false;
            RosakKredensial = false;
        }
    }

    [Fact]
    public void StatusAda_WarnaIalahSeaGreen()
    {
        var store = new KredensialPalsu { AdaKredensial = true, RosakKredensial = false };
        using var dialog = new IdMeSettingsDialog(store, _storTetapan);

        Assert.Contains("ada", dialog.TeksStatus, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(Color.SeaGreen, dialog.WarnaStatus);
    }

    [Fact]
    public void StatusTiada_WarnaIalahFirebrick()
    {
        var store = new KredensialPalsu { AdaKredensial = false, RosakKredensial = false };
        using var dialog = new IdMeSettingsDialog(store, _storTetapan);

        Assert.Contains("tiada", dialog.TeksStatus, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(Color.Firebrick, dialog.WarnaStatus);
    }

    [Fact]
    public void StatusRosak_WarnaIalahFirebrick()
    {
        var store = new KredensialPalsu { AdaKredensial = true, RosakKredensial = true };
        using var dialog = new IdMeSettingsDialog(store, _storTetapan);

        Assert.Contains("ROSAK", dialog.TeksStatus, StringComparison.Ordinal);
        Assert.Equal(Color.Firebrick, dialog.WarnaStatus);
    }

    [Fact]
    public void SimpanTanpaTandaKotakSimpan_WarnaIalahFirebrick()
    {
        var store = new KredensialPalsu { AdaKredensial = false };
        using var dialog = new IdMeSettingsDialog(store, _storTetapan);
        dialog.KotakSimpan.Checked = false;
        dialog.Simpan();

        Assert.Contains("TIDAK disimpan", dialog.TeksStatus);
        Assert.Equal(Color.Firebrick, dialog.WarnaStatus);
    }

    [Fact]
    public void SimpanBerjaya_WarnaIalahSeaGreen()
    {
        var store = new KredensialPalsu { AdaKredensial = false };
        using var dialog = new IdMeSettingsDialog(store, _storTetapan);
        dialog.KotakSimpan.Checked = true;
        dialog.MedanPengguna.Text = "pengguna123";
        dialog.MedanKataLaluan.Text = "rahsia123";
        dialog.MedanKunci.Text = "frasa-keselamatan";

        dialog.Simpan();

        Assert.Contains("(disimpan)", dialog.TeksStatus);
        Assert.Equal(Color.SeaGreen, dialog.WarnaStatus);
    }
}
