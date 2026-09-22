using System;
using System.Drawing;
using System.Windows.Forms;

namespace HadirDesktop;

/// <summary>
/// "Akaun idMe" settings dialog: masked owner entry for the idMe credential,
/// a "Simpan pada PC ini" consent checkbox (default OFF), a "Padam kredensial"
/// button, the opt-in auto-login switches (default OFF), the owner-configurable
/// consecutive-rejection guard (0 = never stop, default 5) with a one-click
/// "Cuba lagi" that clears the counter immediately, and status lines that show
/// ONLY whether a credential exists / how many rejections — never any value.
///
/// SECURITY INVARIANT: the password/phrase typed here are read from the masked
/// fields ONLY at the moment of "Simpan" and passed straight into the DPAPI
/// store. They are never logged, never echoed, never shown in any status, and
/// never re-read back into the dialog on open.
/// </summary>
public sealed class IdMeSettingsDialog : Form
{
    private readonly IKredensialIdMeStore _kredensial;
    private readonly IIdMeLoginSettingsStore _tetapan;
    private readonly IdMeLoginManager? _pengurus;

    private readonly TextBox _txtPengguna = new() { PlaceholderText = "No. Kad Pengenalan" };
    private readonly TextBox _txtKataLaluan = new() { UseSystemPasswordChar = true, PlaceholderText = "Kata laluan idMe" };
    private readonly TextBox _txtKunci = new() { UseSystemPasswordChar = true, PlaceholderText = "Frasa Kata Kunci Keselamatan" };
    private readonly Label _lblStatus = new() { AutoSize = true, ForeColor = Color.DimGray };
    private readonly CheckBox _chkSimpan = new() { Text = "Simpan pada PC ini (disulit DPAPI, akaun Windows semasa)", Checked = false };
    private readonly CheckBox _chkLoginAuto = new() { Text = "Log masuk idMe automatik atas permintaan (opt-in)", Checked = false };
    private readonly CheckBox _chkTanpaFrasa = new() { Text = "Teruskan jika frasa keselamatan tidak dapat dibaca (imej/canvas) — opt-in", Checked = false };
    private readonly NumericUpDown _numMaksPenolakan = new() { Minimum = 0, Maximum = 50, Value = 5, Width = 80 };
    private readonly Label _lblPenolakan = new() { AutoSize = true, ForeColor = Color.DimGray };
    private readonly Button _btnSimpan = new() { Text = "Simpan" };
    private readonly Button _btnPadam = new() { Text = "Padam kredensial" };
    private readonly Button _btnCubaLagi = new() { Text = "Cuba lagi (kosongkan penolakan)" };
    private readonly Button _btnTutup = new() { Text = "Tutup" };

    public IdMeSettingsDialog(IKredensialIdMeStore kredensial, IIdMeLoginSettingsStore tetapan, IdMeLoginManager? pengurus = null)
    {
        _kredensial = kredensial;
        _tetapan = tetapan;
        _pengurus = pengurus;

        Text = "Akaun idMe — HADIR Desktop";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterParent;
        ClientSize = new Size(560, 400);
        ShowInTaskbar = false;

        var panel = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(12),
            ColumnCount = 2,
            RowCount = 10,
        };
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 48));
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 52));

        void TambahLabel(string teks, int baris)
        {
            var l = new Label { Text = teks, AutoSize = true, Anchor = AnchorStyles.Left, TextAlign = ContentAlignment.MiddleLeft };
            panel.Controls.Add(l, 0, baris);
        }

        TambahLabel("ID Pengguna (No. Kad Pengenalan)", 0);
        panel.Controls.Add(_txtPengguna, 1, 0);
        TambahLabel("Kata Laluan", 1);
        panel.Controls.Add(_txtKataLaluan, 1, 1);
        TambahLabel("Frasa Kunci Keselamatan", 2);
        panel.Controls.Add(_txtKunci, 1, 2);

        _lblStatus.AutoSize = false;
        _lblStatus.Dock = DockStyle.Fill;
        _lblStatus.TextAlign = ContentAlignment.MiddleLeft;
        panel.Controls.Add(_lblStatus, 0, 3);
        panel.SetColumnSpan(_lblStatus, 2);

        panel.Controls.Add(_chkSimpan, 0, 4);
        panel.SetColumnSpan(_chkSimpan, 2);
        panel.Controls.Add(_chkLoginAuto, 0, 5);
        panel.SetColumnSpan(_chkLoginAuto, 2);
        panel.Controls.Add(_chkTanpaFrasa, 0, 6);
        panel.SetColumnSpan(_chkTanpaFrasa, 2);

        TambahLabel("Berhenti selepas penolakan kata laluan berturut-turut (0 = jangan berhenti)", 7);
        panel.Controls.Add(_numMaksPenolakan, 1, 7);

        _lblPenolakan.AutoSize = false;
        _lblPenolakan.Dock = DockStyle.Fill;
        _lblPenolakan.TextAlign = ContentAlignment.MiddleLeft;
        panel.Controls.Add(_lblPenolakan, 0, 8);
        panel.SetColumnSpan(_lblPenolakan, 2);

        var flow = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft, AutoSize = true };
        flow.Controls.Add(_btnTutup);
        flow.Controls.Add(_btnCubaLagi);
        flow.Controls.Add(_btnPadam);
        flow.Controls.Add(_btnSimpan);
        panel.Controls.Add(flow, 0, 9);
        panel.SetColumnSpan(flow, 2);

        Controls.Add(panel);

        _btnSimpan.Click += (_, _) => Simpan();
        _btnPadam.Click += (_, _) => Padam();
        _btnCubaLagi.Click += (_, _) => CubaLagi();
        _btnTutup.Click += (_, _) => Close();

        MuatSemulaStatus();
        MuatSemulaTetapan();
        MuatSemulaPenolakan();
    }

    private void MuatSemulaStatus()
    {
        var s = _kredensial.Status();
        if (s.Rosak)
        {
            _lblStatus.Text = "Kredensial: ROSAK (tidak dapat dinyahsulit) — padam dan simpan semula.";
            _lblStatus.ForeColor = Color.Firebrick;
        }
        else if (s.Ada)
        {
            _lblStatus.Text = "Kredensial: ada (pengguna " + s.PenggunaSamar + (s.KunciAda ? ", frasa disimpan" : "") + ").";
            _lblStatus.ForeColor = Color.DimGray;
        }
        else
        {
            _lblStatus.Text = "Kredensial: tiada (belum disimpan pada PC ini).";
            _lblStatus.ForeColor = Color.DimGray;
        }
    }

    private void MuatSemulaTetapan()
    {
        var t = _tetapan.Baca();
        _chkLoginAuto.Checked = t.LoginAuto;
        _chkTanpaFrasa.Checked = t.BenarkanTerusTanpaFrasa;
        _numMaksPenolakan.Value = Math.Clamp(t.MaksPenolakanBerturut, 0, 50);
    }

    private void MuatSemulaPenolakan()
    {
        if (_pengurus == null)
        {
            _lblPenolakan.Text = "";
            _btnCubaLagi.Enabled = false;
            return;
        }
        var s = _pengurus.StatusPenolakan();
        if (s.Diblok)
        {
            _lblPenolakan.Text = s.Sebab;
            _lblPenolakan.ForeColor = Color.Firebrick;
        }
        else if (s.PenolakanBerturut > 0)
        {
            _lblPenolakan.Text = $"Kata laluan ditolak {s.PenolakanBerturut} kali berturut-turut (had {s.MaksPenolakan}).";
            _lblPenolakan.ForeColor = Color.DimGray;
        }
        else
        {
            _lblPenolakan.Text = "Tiada penolakan kata laluan berturut-turut.";
            _lblPenolakan.ForeColor = Color.DimGray;
        }
    }

    private void Simpan()
    {
        // Persist the opt-in switches + rejection guard N (non-secret).
        _tetapan.Simpan(new IdMeLoginTetapan
        {
            LoginAuto = _chkLoginAuto.Checked,
            BenarkanTerusTanpaFrasa = _chkTanpaFrasa.Checked,
            MaksPenolakanBerturut = (int)_numMaksPenolakan.Value,
        });

        if (!_chkSimpan.Checked)
        {
            _lblStatus.Text = "Tetapan disimpan. Kredensial TIDAK disimpan (kotak \"Simpan pada PC ini\" tidak ditanda).";
            _lblStatus.ForeColor = Color.DimGray;
            return;
        }

        var pengguna = _txtPengguna.Text.Trim();
        var kataLaluan = _txtKataLaluan.Text;
        var kunci = _txtKunci.Text.Trim();

        if (pengguna.Length == 0 || kataLaluan.Length == 0 || kunci.Length == 0)
        {
            _lblStatus.Text = "Gagal simpan: lengkapkan ID Pengguna, Kata Laluan dan Frasa Kunci Keselamatan.";
            _lblStatus.ForeColor = Color.Firebrick;
            return;
        }

        try
        {
            _kredensial.Simpan(pengguna, kataLaluan, kunci);
            // The value lives only in the transient string above; clear the
            // fields so it is not retained in the UI.
            _txtKataLaluan.Clear();
            _txtKunci.Clear();
            MuatSemulaStatus();
            _lblStatus.ForeColor = Color.SeaGreen;
            _lblStatus.Text = _lblStatus.Text + " (disimpan).";
        }
        catch (Exception ex)
        {
            // Never echo a value; report only the failure class.
            _lblStatus.Text = "Gagal simpan: " + (ex.Message ?? "ralat DPAPI.");
            _lblStatus.ForeColor = Color.Firebrick;
        }
    }

    private void Padam()
    {
        _kredensial.Padam();
        _txtPengguna.Clear();
        _txtKataLaluan.Clear();
        _txtKunci.Clear();
        MuatSemulaStatus();
    }

    private void CubaLagi()
    {
        _pengurus?.CubaLagi();
        MuatSemulaPenolakan();
    }
}
