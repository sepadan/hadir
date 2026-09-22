using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

public class RealPortalObservationTests
{
    [Fact]
    public void SanitizeUrl_StripsQueryAndFragment()
    {
        Assert.Equal(
            "https://idme.moe.gov.my/login",
            RealPortalObservation.SanitizeUrl("https://idme.moe.gov.my/login?code=SECRET&state=XYZ#frag"));
    }

    [Fact]
    public void SanitizeUrl_KeepsSchemeHostAndPath()
    {
        Assert.Equal(
            "https://idme.moe.gov.my/list_aplikasi",
            RealPortalObservation.SanitizeUrl("https://idme.moe.gov.my/list_aplikasi"));
    }

    [Fact]
    public void SanitizeUrl_BlankBecomesPlaceholder()
    {
        Assert.Equal("(empty)", RealPortalObservation.SanitizeUrl(null));
        Assert.Equal("(empty)", RealPortalObservation.SanitizeUrl(""));
        Assert.Equal("(empty)", RealPortalObservation.SanitizeUrl("   "));
    }

    [Fact]
    public void SanitizeUrl_NonHttpSchemeCollapsesToSchemeName()
    {
        Assert.Equal("about:…", RealPortalObservation.SanitizeUrl("about:blank"));
        Assert.Equal("data:…", RealPortalObservation.SanitizeUrl("data:text/html,<script>alert(1)</script>"));
        Assert.Equal("javascript:…", RealPortalObservation.SanitizeUrl("javascript:alert('x')"));
    }

    [Fact]
    public void FormatLine_ContainsNoQueryString()
    {
        var line = RealPortalObservation.FormatLine(
            "new-window-requested",
            "https://idme.moe.gov.my/sso?token=SECRET&code=ABC",
            allowed: false);

        Assert.Contains("new-window-requested", line);
        Assert.Contains("allowed=False", line);
        Assert.DoesNotContain("SECRET", line);
        Assert.DoesNotContain("token=", line);
        Assert.DoesNotContain("code=ABC", line);
    }
}
