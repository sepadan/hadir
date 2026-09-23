using System;
using System.Linq;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Senarai origin penjaga navigasi (fungsi tulen <see cref="MainForm.OriginsNavigasi"/>).
///
/// Pepijat sebenar yang dilindungi di sini: penjaga dibina dengan senarai KOSONG
/// semasa mula, jadi PC yang restart dengan <c>LoginAuto</c> sudah HIDUP tidak
/// dibenarkan navigasi ke idMe/MOEIS sampai dialog "Akaun idMe…" dibuka.
/// </summary>
public class OriginsNavigasiTests
{
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
    public void ModBiasa_LoginAutoMati_TiadaIdMeAtauMoeis()
    {
        var origins = MainForm.OriginsNavigasi(
            realPortalEnabled: false,
            realPortalOrigins: Array.Empty<string>(),
            loginAuto: false);

        Assert.Empty(origins);
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
    public void PortalSebenarMati_OriginnyaTidakDitambah()
    {
        var origins = MainForm.OriginsNavigasi(
            realPortalEnabled: false,
            realPortalOrigins: new[] { "https://contoh.example" },
            loginAuto: false);

        Assert.Empty(origins);
    }

    [Fact]
    public void PenjagaDibinaDariSenaraiIni_MembenarkanIdMeBilaLoginAutoHidup()
    {
        var hidup = new NavigationGuard(MainForm.OriginsNavigasi(false, Array.Empty<string>(), loginAuto: true));
        var mati = new NavigationGuard(MainForm.OriginsNavigasi(false, Array.Empty<string>(), loginAuto: false));

        Assert.True(hidup.IsAllowed(new Uri(IdMeLoginEndpoints.IdMeOrigin + "/login")));
        Assert.False(mati.IsAllowed(new Uri(IdMeLoginEndpoints.IdMeOrigin + "/login")));
    }
}
