using System.Threading.Tasks;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

public class FixtureEngineStatusSourceTests
{
    [Fact]
    public async Task GetStatusAsync_ReturnsSimulatedStatus()
    {
        var source = new FixtureEngineStatusSource();

        var status = await source.GetStatusAsync();

        Assert.True(status.IsSimulated);
        Assert.Equal(DemoLabel.SimulatedSourceLabel, status.SourceLabel);
        Assert.True(status.Ok);
        Assert.False(status.AdaRahsiaEnjin);
    }

    [Fact]
    public void SourceLabel_IsSimulated()
    {
        var source = new FixtureEngineStatusSource();

        Assert.Equal(DemoLabel.SimulatedSourceLabel, source.SourceLabel);
    }
}
