using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

public class AppStateMachineTests
{
    [Fact]
    public void CloseRequested_FromRunning_MovesToHiddenToTray()
    {
        var machine = new AppStateMachine();

        var result = machine.OnCloseRequested();

        Assert.True(result);
        Assert.Equal(AppState.HiddenToTray, machine.State);
    }

    [Fact]
    public void CloseRequested_IsIdempotent_WhenAlreadyHidden()
    {
        var machine = new AppStateMachine();
        machine.OnCloseRequested();

        var result = machine.OnCloseRequested();

        Assert.True(result);
        Assert.Equal(AppState.HiddenToTray, machine.State);
    }

    [Fact]
    public void ShowRequested_FromHiddenToTray_MovesToRunning()
    {
        var machine = new AppStateMachine();
        machine.OnCloseRequested();

        var result = machine.OnShowRequested();

        Assert.True(result);
        Assert.Equal(AppState.Running, machine.State);
    }

    [Theory]
    [InlineData(AppState.Running)]
    [InlineData(AppState.HiddenToTray)]
    public void ExitRequested_FromAnyState_MovesToExiting(AppState _)
    {
        var machine = new AppStateMachine();
        if (_ == AppState.HiddenToTray)
        {
            machine.OnCloseRequested();
        }

        var result = machine.OnExitRequested();

        Assert.True(result);
        Assert.Equal(AppState.Exiting, machine.State);
    }

    [Fact]
    public void InvalidTransitions_FromExiting_DoNotChangeState()
    {
        var machine = new AppStateMachine();
        machine.OnExitRequested();

        var closeResult = machine.OnCloseRequested();
        var showResult = machine.OnShowRequested();

        Assert.False(closeResult);
        Assert.False(showResult);
        Assert.Equal(AppState.Exiting, machine.State);
    }
}
