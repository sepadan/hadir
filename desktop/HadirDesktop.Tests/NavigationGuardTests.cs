using System;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

public class NavigationGuardTests
{
    [Fact]
    public void Allows_ConfiguredFixtureOrigin()
    {
        var guard = new NavigationGuard(new[] { "http://192.0.2.1:5000" });

        Assert.True(guard.IsAllowed(new Uri("http://192.0.2.1:5000/portal")));
    }

    [Theory]
    [InlineData("http://127.0.0.1:8747/api/status")]
    [InlineData("http://localhost:9000/")]
    public void Allows_LoopbackOrigins(string url)
    {
        var guard = new NavigationGuard(Array.Empty<string>());

        Assert.True(guard.IsAllowed(new Uri(url)));
    }

    [Fact]
    public void Blocks_ExternalDomain()
    {
        var guard = new NavigationGuard(Array.Empty<string>());

        Assert.False(guard.IsAllowed(new Uri("https://evil.example")));
    }

    [Fact]
    public void Blocks_AboutBlank()
    {
        var guard = new NavigationGuard(Array.Empty<string>());

        Assert.False(guard.IsAllowed(new Uri("about:blank")));
    }

    [Fact]
    public void Blocks_NonLoopbackIp()
    {
        var guard = new NavigationGuard(Array.Empty<string>());

        Assert.False(guard.IsAllowed(new Uri("http://10.0.0.5:8747/api/status")));
    }

    [Fact]
    public void Blocks_NullUri()
    {
        var guard = new NavigationGuard(Array.Empty<string>());

        Assert.False(guard.IsAllowed(null));
    }
}
