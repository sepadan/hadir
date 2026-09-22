using System;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

public class DevDebugTransportGatingTests
{
    [Fact]
    public void FromEnvironment_NoFlags_ReturnsNull()
    {
        // Neither HADIR_DEV_DEBUG nor HADIR_DEV_REAL_PORTAL is set in the test
        // process environment, so the transport must stay OFF (no CDP, no port
        // file write, no profile dir creation).
        var transport = DevDebugTransport.FromEnvironment();

        Assert.Null(transport);
    }
}
