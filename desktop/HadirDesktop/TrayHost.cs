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
    private readonly ToolStripMenuItem _stateItem;
    private bool _shownBalloonOnce;

    public event EventHandler? ShowRequested;
    public event EventHandler? OpenSettingsRequested;
    public event EventHandler? IdMeSettingsRequested;
    public event EventHandler? LoginAutoRequested;
    public event EventHandler? CubaLagiRequested;
    public event EventHandler? ExitRequested;

    /// <param name="hantarAutoBaca">Baca togol "hantar ke MOEIS" tersimpan.</param>
    /// <param name="hantarAutoTulis">Simpan togol "hantar ke MOEIS".</param>
    /// <remarks>
    /// Dua callback itu menjaga TrayHost tanpa pengetahuan tentang stor tetapan.
    /// Tanpa KEDUA-DUA callback, item togol langsung tidak dipapar.
    /// </remarks>
    public TrayHost(
        Icon icon,
        IAutostartManager? autostart = null,
        Func<bool>? hantarAutoBaca = null,
        Action<bool>? hantarAutoTulis = null)
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add(DemoLabel.TrayShow, null, (_, _) => ShowRequested?.Invoke(this, EventArgs.Empty));
        menu.Items.Add(DemoLabel.TrayOpenSettings, null, (_, _) => OpenSettingsRequested?.Invoke(this, EventArgs.Empty));
        menu.Items.Add(DemoLabel.TrayIdMeSettings, null, (_, _) => IdMeSettingsRequested?.Invoke(this, EventArgs.Empty));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(DemoLabel.TrayLoginAuto, null, (_, _) => LoginAutoRequested?.Invoke(this, EventArgs.Empty));
        menu.Items.Add(DemoLabel.TrayCubaLagi, null, (_, _) => CubaLagiRequested?.Invoke(this, EventArgs.Empty));
        menu.Items.Add(new ToolStripSeparator());

        // Read-only status row (disabled item): the portal lifecycle state in
        // words. Never a command, never a credential — text only.
        _stateItem = new ToolStripMenuItem(LabelKeadaanPortal.UntukMenu(KeadaanPortal.Diam, null))
        {
            Enabled = false,
        };
        menu.Items.Add(_stateItem);
        menu.Items.Add(new ToolStripSeparator());

        // Auto-start toggle. CheckOnClick flips Checked before CheckedChanged
        // fires, so reading Checked here always yields the NEW state. Absent a
        // manager (tests) the item is simply not shown.
        if (autostart != null)
        {
            var itemAutostart = new ToolStripMenuItem(DemoLabel.TrayAutostart)
            {
                CheckOnClick = true,
                Checked = autostart.Ada(),
            };
            itemAutostart.CheckedChanged += (_, _) =>
            {
                if (itemAutostart.Checked) autostart.Daftar();
                else autostart.Buang();
            };
            menu.Items.Add(itemAutostart);
            menu.Items.Add(new ToolStripSeparator());
        }

        // Togol penghantaran automatik ke MOEIS. Corak sama seperti autostart:
        // Checked diset SEBELUM langgan CheckedChanged, jadi memaparkan menu
        // tidak pernah menulis tetapan — hanya klik pemilik yang menulis.
        if (hantarAutoBaca != null && hantarAutoTulis != null)
        {
            var itemHantar = new ToolStripMenuItem(DemoLabel.TrayHantarAuto)
            {
                CheckOnClick = true,
                Checked = hantarAutoBaca(),
            };
            itemHantar.CheckedChanged += (_, _) => hantarAutoTulis(itemHantar.Checked);
            menu.Items.Add(itemHantar);
            menu.Items.Add(new ToolStripSeparator());
        }

        menu.Items.Add(DemoLabel.TrayExit, null, (_, _) => ExitRequested?.Invoke(this, EventArgs.Empty));

        _notifyIcon = new NotifyIcon
        {
            Icon = icon,
            Text = LabelKeadaanPortal.UntukDulang(KeadaanPortal.Diam),
            ContextMenuStrip = menu,
            Visible = true,
        };

        _notifyIcon.DoubleClick += (_, _) => ShowRequested?.Invoke(this, EventArgs.Empty);
    }

    /// <summary>
    /// Item menu dulang — untuk ujian/diagnostik sahaja. Membaca sahaja; tiada
    /// keadaan diubah dengan mengaksesnya.
    /// </summary>
    public ToolStripItemCollection ItemMenu => _notifyIcon.ContextMenuStrip!.Items;

    /// <summary>
    /// Reflects the portal lifecycle state in the tray: the tooltip (truncated to
    /// the WinForms 63-char limit by <see cref="LabelKeadaanPortal"/>, so a long
    /// status line can never throw) and the disabled status row. Called on state
    /// changes only — the tray never polls.
    /// </summary>
    public void SetPortalKeadaan(KeadaanPortal keadaan, string? sebab = null)
    {
        _stateItem.Text = LabelKeadaanPortal.UntukMenu(keadaan, sebab);
        _notifyIcon.Text = LabelKeadaanPortal.UntukDulang(keadaan);
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
