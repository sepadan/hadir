using System;
using System.Linq;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Senarai origin penjaga navigasi (fungsi tulen <see cref="MainForm.OriginsNavigasi"/>).
///
/// Paparan awal idMe dibenarkan walaupun LoginAuto mati; MOEIS kekal
/// berpagar opt-in. Penjaga dibina semasa mula supaya halaman pertama tidak
/// tersekat sebelum dialog tetapan dibuka.
/// </summary>
public class OriginsNavigasiTests
{
    [Fact]
    public void PaparanLoginManual_TidakMengakuPortalPalsuAtauAutoHantar()
    {
        Assert.Contains("idMe", DemoLabel.BannerLoginManual);
        Assert.Contains("manual", DemoLabel.BannerLoginManual, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("MOD DEMO", DemoLabel.BannerLoginManual);
        Assert.Contains("MANUAL", DemoLabel.SufiksLoginManual);
    }

    [Fact]
    public void ModBiasa_LoginAutoHidup_MengandungiIdMeDanMoeis()
    {
        var origins = MainForm.OriginsNavigasi(
            realPortalEnabled: false,
            realPortalOrigins: Array.Empty<string>(),
            loginAuto: true);

        Assert.Contains(IdMeLoginEndpoints.IdMeOrigin, origins);
        Assert.Contains(IdMeLoginEndpoints.MoeisOrigin, origins);
    }

    [Fact]
    public void ModBiasa_LoginAutoMati_IdMeBolehDibukaTetapiMoeisMasihDisekat()
    {
        var origins = MainForm.OriginsNavigasi(
            realPortalEnabled: false,
            realPortalOrigins: Array.Empty<string>(),
            loginAuto: false);

        Assert.Contains(IdMeLoginEndpoints.IdMeOrigin, origins);
        Assert.DoesNotContain(IdMeLoginEndpoints.MoeisOrigin, origins);
    }

    [Fact]
    public void HalamanMula_BiasaIdMe_FixtureHanyaUntukDebug()
    {
        const string fixture = "http://127.0.0.1:8748/";
        Assert.Equal(DemoLabel.RealPortalLoginUrl, MainForm.UrlHalamanMula(false, false, fixture));
        Assert.Equal(fixture, MainForm.UrlHalamanMula(false, true, fixture));
        Assert.Equal(DemoLabel.RealPortalLoginUrl, MainForm.UrlHalamanMula(true, false, fixture));
        Assert.Equal(DemoLabel.RealPortalLoginUrl, MainForm.UrlHalamanMula(true, true, fixture));
    }

    [Fact]
    public void OriginsPortalSebenar_SentiasaDikekalkan()
    {
        var portal = RealPortalDevMode.Create(enabled: true);

        var mati = MainForm.OriginsNavigasi(portal.Enabled, portal.AllowedOrigins, loginAuto: false);
        var hidup = MainForm.OriginsNavigasi(portal.Enabled, portal.AllowedOrigins, loginAuto: true);

        Assert.All(portal.AllowedOrigins, o => Assert.Contains(o, mati));
        Assert.All(portal.AllowedOrigins, o => Assert.Contains(o, hidup));
        Assert.Contains(IdMeLoginEndpoints.MoeisOrigin, hidup);
        Assert.DoesNotContain(IdMeLoginEndpoints.MoeisOrigin, mati);
    }

    [Fact]
    public void PortalSebenarMati_OriginDevTidakDitambah()
    {
        var origins = MainForm.OriginsNavigasi(
            realPortalEnabled: false,
            realPortalOrigins: new[] { "https://contoh.example" },
            loginAuto: false);

        Assert.Contains(IdMeLoginEndpoints.IdMeOrigin, origins);
        Assert.DoesNotContain("https://contoh.example", origins);
    }

    [Fact]
    public void PenjagaMembenarkanPaparanIdMeWalaupunLoginAutoMati()
    {
        var hidup = new NavigationGuard(MainForm.OriginsNavigasi(false, Array.Empty<string>(), loginAuto: true));
        var mati = new NavigationGuard(MainForm.OriginsNavigasi(false, Array.Empty<string>(), loginAuto: false));

        Assert.True(hidup.IsAllowed(new Uri(IdMeLoginEndpoints.IdMeOrigin + "/login")));
        Assert.True(mati.IsAllowed(new Uri(IdMeLoginEndpoints.IdMeOrigin + "/login")));
        Assert.False(mati.IsAllowed(new Uri(IdMeLoginEndpoints.MoeisOrigin + "/")));
    }
}
