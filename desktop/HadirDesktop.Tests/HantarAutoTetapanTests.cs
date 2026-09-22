using System;
using System.IO;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Togol pemilik "Hantar ke MOEIS (automatik)" pada peringkat TETAPAN: lalai
/// MATI, kekal merentas restart (serialisasi), dan gagal-tertutup apabila fail
/// hilang atau rosak. Tiada kredensial, tiada rahsia — tetapan bukan rahsia.
/// </summary>
public class HantarAutoTetapanTests : IDisposable
{
    private readonly string _dir;
    private readonly string _laluan;

    public HantarAutoTetapanTests()
    {
        _dir = Path.Combine(Path.GetTempPath(), "hadir-hantarauto-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_dir);
        _laluan = Path.Combine(_dir, "idme-login.json");
    }

    public void Dispose()
    {
        try { if (Directory.Exists(_dir)) Directory.Delete(_dir, recursive: true); } catch { /* best-effort */ }
    }

    [Fact]
    public void Lalai_HantarAutoMati()
    {
        Assert.False(new IdMeLoginTetapan().HantarAuto);
    }

    [Fact]
    public void FailTiada_BacaMati()
    {
        var stor = new JsonIdMeLoginSettingsStore(_laluan);

        Assert.False(stor.Baca().HantarAuto);
    }

    [Fact]
    public void FailRosak_BacaMati()
    {
        File.WriteAllText(_laluan, "{ bukan json sah");

        Assert.False(new JsonIdMeLoginSettingsStore(_laluan).Baca().HantarAuto);
    }

    [Fact]
    public void Simpan_Lalu_Baca_MengekalkanHantarAuto()
    {
        new JsonIdMeLoginSettingsStore(_laluan).Simpan(new IdMeLoginTetapan { HantarAuto = true });

        // Stor BAHARU pada laluan sama = simulasi restart aplikasi.
        Assert.True(new JsonIdMeLoginSettingsStore(_laluan).Baca().HantarAuto);
    }

    [Fact]
    public void Simpan_Mati_DibacaSemulaSebagaiMati()
    {
        var stor = new JsonIdMeLoginSettingsStore(_laluan);
        stor.Simpan(new IdMeLoginTetapan { HantarAuto = true });
        stor.Simpan(new IdMeLoginTetapan { HantarAuto = false });

        Assert.False(new JsonIdMeLoginSettingsStore(_laluan).Baca().HantarAuto);
    }

    [Fact]
    public void HantarAutoBebasDaripadaLoginAuto()
    {
        var stor = new JsonIdMeLoginSettingsStore(_laluan);
        stor.Simpan(new IdMeLoginTetapan { LoginAuto = true, HantarAuto = false });

        var dibaca = stor.Baca();
        Assert.True(dibaca.LoginAuto);
        Assert.False(dibaca.HantarAuto);

        stor.Simpan(new IdMeLoginTetapan { LoginAuto = false, HantarAuto = true });
        dibaca = stor.Baca();
        Assert.False(dibaca.LoginAuto);
        Assert.True(dibaca.HantarAuto);
    }

    [Fact]
    public void MedanLainTidakHilangApabilaHantarAutoDisimpan()
    {
        var stor = new JsonIdMeLoginSettingsStore(_laluan);
        stor.Simpan(new IdMeLoginTetapan { LoginAuto = true, MaksPenolakanBerturut = 3 });

        // Corak yang sama seperti MainForm.HantarAutoTetapkan: baca semula,
        // ubah satu medan, simpan.
        var tetapan = stor.Baca();
        tetapan.HantarAuto = true;
        stor.Simpan(tetapan);

        var dibaca = new JsonIdMeLoginSettingsStore(_laluan).Baca();
        Assert.True(dibaca.HantarAuto);
        Assert.True(dibaca.LoginAuto);
        Assert.Equal(3, dibaca.MaksPenolakanBerturut);
    }
}
