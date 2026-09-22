using System;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

public class WebView2RuntimeCheckTests
{
    private sealed class SemakPalsu : IWebView2RuntimeCheck
    {
        private readonly Func<string?> _hasil;
        public SemakPalsu(Func<string?> hasil) => _hasil = hasil;
        public string? VersiTersedia() => _hasil();
    }

    [Fact]
    public void RuntimeAda_Benar_BilaVersiDikembalikan()
    {
        var guard = new WebView2RuntimeGuard(new SemakPalsu(() => "120.0.2210.91"));
        Assert.True(guard.RuntimeAda());
        Assert.Equal("120.0.2210.91", guard.VersiTersedia());
    }

    [Fact]
    public void RuntimeAda_Palsu_BilaNull()
    {
        var guard = new WebView2RuntimeGuard(new SemakPalsu(() => null));
        Assert.False(guard.RuntimeAda());
    }

    [Fact]
    public void RuntimeAda_Palsu_BilaSemakLontar()
    {
        var guard = new WebView2RuntimeGuard(new SemakPalsu(() => throw new InvalidOperationException("tiada runtime")));
        Assert.False(guard.RuntimeAda());
    }

    [Fact]
    public void TeksAmaran_MengandungiPautanMuatTurun()
    {
        Assert.Contains(WebView2RuntimeGuard.MuatTurunUrl, WebView2RuntimeGuard.TeksAmaran);
    }

    [Fact]
    public void AmaranJikaTiada_TidakLontar_BilaRuntimeTiada()
    {
        // A missing runtime must only warn (via the injected display callback),
        // never throw. The default MessageBox path is not exercised here.
        string? ditunjuk = null;
        var guard = new WebView2RuntimeGuard(new SemakPalsu(() => null), teks => ditunjuk = teks);
        guard.AmaranJikaTiada();
        Assert.Equal(WebView2RuntimeGuard.TeksAmaran, ditunjuk);
    }

    [Fact]
    public void AmaranJikaTiada_TidakDitunjuk_BilaRuntimeAda()
    {
        var dipanggil = false;
        var guard = new WebView2RuntimeGuard(new SemakPalsu(() => "120.0.2210.91"), _ => dipanggil = true);
        guard.AmaranJikaTiada();
        Assert.False(dipanggil);
    }
}
