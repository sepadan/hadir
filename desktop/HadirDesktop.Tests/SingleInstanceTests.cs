using System;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

public class SingleInstanceTests
{
    [Fact]
    public void SecondAcquisitionOfSameMutexName_Fails()
    {
        var suffix = Guid.NewGuid().ToString("N");
        var mutexName = $"Local\\HadirDesktopTest.Mutex.{suffix}";
        var signalName = $"Local\\HadirDesktopTest.Signal.{suffix}";

        using var first = new SingleInstance(mutexName, signalName);
        using var second = new SingleInstance(mutexName, signalName);

        Assert.True(first.IsFirstInstance);
        Assert.False(second.IsFirstInstance);
    }

    [Fact]
    public void SignalExistingInstance_IsObservedByFirstInstance()
    {
        var suffix = Guid.NewGuid().ToString("N");
        var mutexName = $"Local\\HadirDesktopTest.Mutex.{suffix}";
        var signalName = $"Local\\HadirDesktopTest.Signal.{suffix}";

        using var first = new SingleInstance(mutexName, signalName);
        using var second = new SingleInstance(mutexName, signalName);

        second.SignalExistingInstance();

        var received = first.WaitForSignal(TimeSpan.FromSeconds(2));

        Assert.True(received);
    }
}
