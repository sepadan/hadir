using System;
using System.Windows.Forms;

namespace HadirDesktop;

/// <summary>
/// Owns the NotifyIcon + its context menu. Raises events; does not decide
/// state transitions itself (that's AppStateMachine's job via MainForm).
/// </summary>
public sealed class TrayHost : IDisposable
{
    private readonly NotifyIcon _notifyIcon;
    private bool _shownBalloonOnce;

    public event EventHandler? ShowRequested;
    public event EventHandler? OpenSettingsRequested;
    public event EventHandler? IdMeSettingsRequested;
    public event EventHandler? LoginAutoRequested;
    public event EventHandler? ExitRequested;

    public TrayHost(Icon icon)
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add(DemoLabel.TrayShow, null, (_, _) => ShowRequested?.Invoke(this, EventArgs.Empty));
        menu.Items.Add(DemoLabel.TrayOpenSettings, null, (_, _) => OpenSettingsRequested?.Invoke(this, EventArgs.Empty));
        menu.Items.Add(DemoLabel.TrayIdMeSettings, null, (_, _) => IdMeSettingsRequested?.Invoke(this, EventArgs.Empty));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(DemoLabel.TrayLoginAuto, null, (_, _) => LoginAutoRequested?.Invoke(this, EventArgs.Empty));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(DemoLabel.TrayExit, null, (_, _) => ExitRequested?.Invoke(this, EventArgs.Empty));

        _notifyIcon = new NotifyIcon
        {
            Icon = icon,
            Text = DemoLabel.WindowTitle,
            ContextMenuStrip = menu,
            Visible = true,
        };

        _notifyIcon.DoubleClick += (_, _) => ShowRequested?.Invoke(this, EventArgs.Empty);
    }

    /// <summary>Show the "still running in tray" balloon tip, but only the first time.</summary>
    public void ShowFirstHideBalloonIfNeeded()
    {
        if (_shownBalloonOnce)
        {
            return;
        }

        _shownBalloonOnce = true;
        _notifyIcon.BalloonTipTitle = DemoLabel.TrayBalloonTitle;
        _notifyIcon.BalloonTipText = DemoLabel.TrayBalloonText;
        _notifyIcon.ShowBalloonTip(3000);
    }

    public void Dispose()
    {
        _notifyIcon.Visible = false;
        _notifyIcon.Dispose();
    }
}
