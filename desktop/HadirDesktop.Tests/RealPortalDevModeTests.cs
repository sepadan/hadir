using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

public class RealPortalDevModeTests
{
    [Theory]
    [InlineData("1")]
    [InlineData("true")]
    [InlineData("yes")]
    [InlineData("on")]
    [InlineData(" TRUE ")]
    [InlineData("On")]
    public void IsTruthy_AcceptsTruthyValues(string raw)
    {
        Assert.True(RealPortalDevMode.IsTruthy(raw));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("0")]
    [InlineData("no")]
    [InlineData("off")]
    [InlineData("false")]
    public void IsTruthy_RejectsNonTruthyValues(string? raw)
    {
        Assert.False(RealPortalDevMode.IsTruthy(raw));
    }

    [Fact]
    public void Create_Disabled_HasNoAllowedOrigins()
    {
        var mode = RealPortalDevMode.Create(enabled: false);

        Assert.False(mode.Enabled);
        Assert.Empty(mode.AllowedOrigins);
    }

    [Fact]
    public void Create_Enabled_AllowsExactIdMeOrigin()
    {
        var mode = RealPortalDevMode.Create(enabled: true);

        Assert.True(mode.Enabled);
        Assert.Contains(RealPortalDevMode.IdMeOrigin, mode.AllowedOrigins);
        Assert.Single(mode.AllowedOrigins);
    }

    [Fact]
    public void NavigationGuard_WithRealPortalOrigins_AllowsIdMeLogin()
    {
        var mode = RealPortalDevMode.Create(enabled: true);
        var guard = new NavigationGuard(mode.AllowedOrigins);

        Assert.True(guard.IsAllowed(new Uri("https://idme.moe.gov.my/login")));
        Assert.True(guard.IsAllowed(new Uri("https://idme.moe.gov.my/")));
    }

    [Fact]
    public void NavigationGuard_WithRealPortalOrigins_BlocksOtherExternalDomains()
    {
        var mode = RealPortalDevMode.Create(enabled: true);
        var guard = new NavigationGuard(mode.AllowedOrigins);

        Assert.False(guard.IsAllowed(new Uri("https://example.com")));
        Assert.False(guard.IsAllowed(new Uri("https://login.microsoftonline.com/")));
    }

    [Fact]
    public void NavigationGuard_DisabledMode_BlocksIdMe()
    {
        var mode = RealPortalDevMode.Create(enabled: false);
        var guard = new NavigationGuard(mode.AllowedOrigins);

        Assert.False(guard.IsAllowed(new Uri("https://idme.moe.gov.my/login")));
    }

    [Fact]
    public void LoginUrl_IsTheRealIdMeLoginPage()
    {
        Assert.Equal("https://idme.moe.gov.my/login", DemoLabel.RealPortalLoginUrl);
        Assert.Equal("https://idme.moe.gov.my/login", RealPortalDevMode.LoginUrl);
    }
}
