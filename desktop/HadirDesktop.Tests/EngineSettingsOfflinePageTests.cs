using System;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

public class EngineSettingsOfflinePageTests
{
    [Fact]
    public void Html_MengandungiTajuk_DanDokumenHtml()
    {
        var html = EngineSettingsOfflinePage.Html("sebab ujian");

        Assert.Contains(EngineSettingsOfflinePage.Tajuk, html);
        Assert.Contains("<html", html, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("</html>", html, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Html_MenyisipkanSebab()
    {
        var html = EngineSettingsOfflinePage.Html("Enjin tidak dapat dihubungi (offline / tidak berjalan).");

        Assert.Contains("Enjin tidak dapat dihubungi (offline / tidak berjalan).", html);
    }

    [Theory]
    [InlineData("http://")]
    [InlineData("https://")]
    public void Html_TiadaPautanKeluar(string penanda)
    {
        var html = EngineSettingsOfflinePage.Html("sebab");

        Assert.DoesNotContain(penanda, html, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData("target=\"_blank\"")]
    [InlineData("<script")]
    [InlineData("<a ")]
    [InlineData("<form")]
    [InlineData("<iframe")]
    public void Html_TiadaMekanismeNavigasiAtauSkrip(string penanda)
    {
        var html = EngineSettingsOfflinePage.Html("sebab");

        Assert.DoesNotContain(penanda, html, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void EscapeHtml_MelindungiMarkup()
    {
        var escaped = EngineSettingsOfflinePage.EscapeHtml("<script>alert('x')</script>");

        Assert.DoesNotContain("<script>", escaped);
        Assert.Contains("&lt;script&gt;", escaped);
    }

    [Fact]
    public void Html_MelindungiSebabDaripadaMarkup()
    {
        var html = EngineSettingsOfflinePage.Html("<img src=x onerror=alert(1)>");

        Assert.DoesNotContain("<img", html, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("&lt;img", html);
    }
}
