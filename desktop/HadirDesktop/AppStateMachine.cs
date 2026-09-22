namespace HadirDesktop;

public enum AppState
{
    Running,
    HiddenToTray,
    Exiting,
}

/// <summary>
/// Pure, unit-testable state machine for the app's window lifecycle.
/// Holds no Windows Forms / UI references.
/// </summary>
public sealed class AppStateMachine
{
    public AppState State { get; private set; } = AppState.Running;

    /// <summary>User clicked the window close (X) button.</summary>
    public bool OnCloseRequested()
    {
        return TryTransition(AppState.Running, AppState.HiddenToTray)
            || TryTransition(AppState.HiddenToTray, AppState.HiddenToTray);
    }

    /// <summary>User asked to show the window again (tray "Tunjuk" or icon click).</summary>
    public bool OnShowRequested()
    {
        return TryTransition(AppState.HiddenToTray, AppState.Running)
            || TryTransition(AppState.Running, AppState.Running);
    }

    /// <summary>User asked to exit for real, from any state.</summary>
    public bool OnExitRequested()
    {
        if (State == AppState.Exiting)
        {
            return true;
        }

        State = AppState.Exiting;
        return true;
    }

    private bool TryTransition(AppState from, AppState to)
    {
        if (State != from)
        {
            return false;
        }

        State = to;
        return true;
    }
}
