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
    private readonly ToolStripMenuItem? _itemAutostart;
    private readonly Action<bool>? _tulisAutostart;
    private readonly ToolStripMenuItem? _itemHantar;
    private readonly Action<bool>? _tulisHantar;
    /// <summary>Benar semasa <see cref="TetapkanTogol"/> menyelaras Checked — handler klik tidak menulis.</summary>
    private bool _menyelarasTogol;
    private bool _shownBalloonOnce;

    public event EventHandler? ShowRequested;
    public event EventHandler? SemuaFungsiRequested;
    public event EventHandler? OpenSettingsRequested;
    public event EventHandler? IdMeSettingsRequested;
    public event EventHandler? LoginAutoRequested;
    public event EventHandler? CubaLagiRequested;
    public event EventHandler? SemakKemasKiniRequested;
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
        // Setiap item perintah membawa ikon (IkonDulang, dicache) dan memanggil
        // Laksana — laluan yang SAMA dipakai butang PanelFungsi.
        var menu = new ContextMenuStrip();
        menu.Items.Add(DemoLabel.TrayShow, IkonDulang.Tunjuk(), (_, _) => Laksana(FungsiDulang.Tunjuk));
        menu.Items.Add(DemoLabel.TraySemuaFungsi, IkonDulang.SemuaFungsi(), (_, _) => Laksana(FungsiDulang.SemuaFungsi));
        menu.Items.Add(DemoLabel.TrayOpenSettings, IkonDulang.TetapanTempatan(), (_, _) => Laksana(FungsiDulang.TetapanTempatan));
        menu.Items.Add(DemoLabel.TrayIdMeSettings, IkonDulang.AkaunIdMe(), (_, _) => Laksana(FungsiDulang.AkaunIdMe));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(DemoLabel.TrayLoginAuto, IkonDulang.LoginIdMe(), (_, _) => Laksana(FungsiDulang.LoginIdMe));
        menu.Items.Add(DemoLabel.TrayCubaLagi, IkonDulang.CubaLagi(), (_, _) => Laksana(FungsiDulang.CubaLagi));
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
                Image = IkonDulang.Autostart(),
            };
            Action<bool> tulisAutostart = hidup =>
            {
                if (hidup) autostart.Daftar();
                else autostart.Buang();
            };
            _tulisAutostart = tulisAutostart;
            itemAutostart.CheckedChanged += (_, _) =>
            {
                if (!_menyelarasTogol) tulisAutostart(itemAutostart.Checked);
            };
            _itemAutostart = itemAutostart;
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
                Image = IkonDulang.HantarAuto(),
            };
            _tulisHantar = hantarAutoTulis;
            itemHantar.CheckedChanged += (_, _) =>
            {
                if (!_menyelarasTogol) hantarAutoTulis(itemHantar.Checked);
            };
            _itemHantar = itemHantar;
            menu.Items.Add(itemHantar);
            menu.Items.Add(new ToolStripSeparator());
        }

        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(DemoLabel.TraySemakKemasKini, IkonDulang.SemakKemasKini(), (_, _) => Laksana(FungsiDulang.SemakKemasKini));
        menu.Items.Add(DemoLabel.TrayExit, IkonDulang.Keluar(), (_, _) => Laksana(FungsiDulang.Keluar));

        _notifyIcon = new NotifyIcon
        {
            Icon = icon,
            Text = LabelKeadaanPortal.UntukDulang(KeadaanPortal.Diam, VersiAplikasi.Versi),
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

    /// <summary>Teks baris status dulang semasa (keadaan portal) — baca sahaja.</summary>
    public string TeksStatus => _stateItem.Text ?? string.Empty;

    /// <summary>
    /// Bangkitkan event bagi satu fungsi PERINTAH — sama seperti klik item
    /// dulangnya. Togol bukan perintah: guna <see cref="TetapkanTogol"/>.
    /// </summary>
    /// <returns><c>false</c> jika <paramref name="fungsi"/> bukan perintah.</returns>
    public bool Laksana(FungsiDulang fungsi)
    {
        switch (fungsi)
        {
            case FungsiDulang.Tunjuk: ShowRequested?.Invoke(this, EventArgs.Empty); return true;
            case FungsiDulang.SemuaFungsi: SemuaFungsiRequested?.Invoke(this, EventArgs.Empty); return true;
            case FungsiDulang.TetapanTempatan: OpenSettingsRequested?.Invoke(this, EventArgs.Empty); return true;
            case FungsiDulang.AkaunIdMe: IdMeSettingsRequested?.Invoke(this, EventArgs.Empty); return true;
            case FungsiDulang.LoginIdMe: LoginAutoRequested?.Invoke(this, EventArgs.Empty); return true;
            case FungsiDulang.CubaLagi: CubaLagiRequested?.Invoke(this, EventArgs.Empty); return true;
            case FungsiDulang.SemakKemasKini: SemakKemasKiniRequested?.Invoke(this, EventArgs.Empty); return true;
            case FungsiDulang.Keluar: ExitRequested?.Invoke(this, EventArgs.Empty); return true;
            default: return false;
        }
    }

    /// <summary>
    /// Keadaan togol seperti yang dipapar dulang, atau <c>null</c> jika togol
    /// itu tidak dipapar (tiada callback/pengurus) atau bukan togol.
    /// </summary>
    public bool? KeadaanTogol(FungsiDulang fungsi) => ItemTogol(fungsi)?.Checked;

    /// <summary>
    /// Tetapkan togol dari luar menu (panel "Semua fungsi"): tanda semak dulang
    /// diselaraskan TANPA handler klik, kemudian nilai ditulis SEKALI melalui
    /// callback yang sama seperti klik dulang. Togol yang tidak dipapar = tiada
    /// apa-apa berlaku.
    /// </summary>
    public void TetapkanTogol(FungsiDulang fungsi, bool hidup)
    {
        var item = ItemTogol(fungsi);
        var tulis = fungsi == FungsiDulang.Autostart ? _tulisAutostart : _tulisHantar;
        if (item == null || tulis == null) return;

        _menyelarasTogol = true;
        try { item.Checked = hidup; }
        finally { _menyelarasTogol = false; }
        tulis(hidup);
    }

    private ToolStripMenuItem? ItemTogol(FungsiDulang fungsi) => fungsi switch
    {
        FungsiDulang.Autostart => _itemAutostart,
        FungsiDulang.HantarAuto => _itemHantar,
        _ => null,
    };

    /// <summary>
    /// Reflects the portal lifecycle state in the tray: the tooltip (truncated to
    /// the WinForms 63-char limit by <see cref="LabelKeadaanPortal"/>, so a long
    /// status line can never throw) and the disabled status row. Called on state
    /// changes only — the tray never polls.
    /// </summary>
    public void SetPortalKeadaan(KeadaanPortal keadaan, string? sebab = null)
    {
        _stateItem.Text = LabelKeadaanPortal.UntukMenu(keadaan, sebab);
        _notifyIcon.Text = LabelKeadaanPortal.UntukDulang(keadaan, VersiAplikasi.Versi);
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
