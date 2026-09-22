using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

public class DevFixtureOriginTests
{
    private const string DevBase = "http://127.0.0.1:54321/dev";

    [Fact]
    public void Allows_ExactDevFixtureUrl()
    {
        Assert.True(DevFixtureOrigin.IsDevFixture("http://127.0.0.1:54321/dev", DevBase));
    }

    [Fact]
    public void Allows_DevFixtureSubPath()
    {
        Assert.True(DevFixtureOrigin.IsDevFixture("http://127.0.0.1:54321/dev/kelas/2", DevBase));
    }

    [Fact]
    public void Blocks_NormalFixtureRoot()
    {
        Assert.False(DevFixtureOrigin.IsDevFixture("http://127.0.0.1:54321/", DevBase));
    }

    [Fact]
    public void Blocks_DifferentPort()
    {
        Assert.False(DevFixtureOrigin.IsDevFixture("http://127.0.0.1:8747/dev", DevBase));
    }

    [Fact]
    public void Blocks_DifferentHost()
    {
        Assert.False(DevFixtureOrigin.IsDevFixture("http://localhost:54321/dev", DevBase));
    }

    [Fact]
    public void Blocks_DifferentScheme()
    {
        Assert.False(DevFixtureOrigin.IsDevFixture("https://127.0.0.1:54321/dev", DevBase));
    }

    [Fact]
    public void Blocks_UnrelatedPathThatMerelyStartsWithSameCharacters()
    {
        Assert.False(DevFixtureOrigin.IsDevFixture("http://127.0.0.1:54321/devious", DevBase));
    }

    [Fact]
    public void Blocks_EngineSettingsOrigin()
    {
        Assert.False(DevFixtureOrigin.IsDevFixture("http://127.0.0.1:8747/", DevBase));
    }

    [Fact]
    public void Blocks_NullCurrentSource()
    {
        Assert.False(DevFixtureOrigin.IsDevFixture(null, DevBase));
    }

    [Fact]
    public void Blocks_EmptyDevBaseUrl()
    {
        Assert.False(DevFixtureOrigin.IsDevFixture("http://127.0.0.1:54321/dev", string.Empty));
    }

    [Fact]
    public void Blocks_NonAbsoluteCurrentSource()
    {
        Assert.False(DevFixtureOrigin.IsDevFixture("about:blank", DevBase));
    }

    [Fact]
    public void IsCaseInsensitiveForHostAndPath()
    {
        Assert.True(DevFixtureOrigin.IsDevFixture("HTTP://127.0.0.1:54321/DEV", DevBase));
    }
}
