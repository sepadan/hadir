using System.Drawing;
using System.Windows.Forms;

namespace HadirDesktop;

/// <summary>Local Desktop configuration; never opens Companion or a browser.</summary>
public sealed class EngineSettingsDialog : Form
{
    private readonly DpapiRahsiaEnjinStore _store;
    private readonly TextBox _url = new() { Dock = DockStyle.Fill };
    private readonly TextBox _rahsia = new() { Dock = DockStyle.Fill, UseSystemPasswordChar = true };
    private readonly Label _status = new() { Dock = DockStyle.Fill, ForeColor = Color.DimGray };
    private readonly PersaraanAutostartCompanion? _persaraan;
    private readonly Label _companion = new() { Dock = DockStyle.Fill };
    private readonly Button _hentikanCompanion = new() { Text = "Matikan autostart Companion lama", AutoSize = true };
    private readonly Button _pulihkanCompanion = new() { Text = "Pulihkan autostart Companion", AutoSize = true };

    /// <param name="migrasi">Keputusan migrasi semasa lancar (nama keputusan sahaja dipaparkan).</param>
    /// <param name="persaraan">Tindakan autostart Companion yang eksplisit dan boleh diundur.</param>
    public EngineSettingsDialog(DpapiRahsiaEnjinStore store, HasilMigrasi? migrasi = null, PersaraanAutostartCompanion? persaraan = null)
    {
        _store = store;
        _persaraan = persaraan;
        Text = "Tetapan Tempatan — HADIR Desktop";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        StartPosition = FormStartPosition.CenterParent;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = false;
        ClientSize = new Size(610, 400);

        var panel = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(14), ColumnCount = 2, RowCount = 8 };
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 135));
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 40));
        panel.Controls.Add(new Label { Text = "URL API Apps Script", AutoSize = true, Anchor = AnchorStyles.Left }, 0, 0);
        panel.Controls.Add(_url, 1, 0);
        panel.Controls.Add(new Label { Text = "Rahsia enjin", AutoSize = true, Anchor = AnchorStyles.Left }, 0, 1);
        panel.Controls.Add(_rahsia, 1, 1);
        panel.Controls.Add(new Label { Text = "Biarkan rahsia kosong untuk mengekalkan nilai sedia ada. Nilai tersimpan tidak dipaparkan.", Dock = DockStyle.Fill }, 0, 2);
        panel.SetColumnSpan(panel.GetControlFromPosition(0, 2)!, 2);
        _status.Text = "Simpan tetapan, kemudian mulakan semula HADIR Desktop untuk menggunakannya.";
        panel.Controls.Add(_status, 0, 3);
        panel.SetColumnSpan(_status, 2);
        var buttons = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft };
        var tutup = new Button { Text = "Tutup", AutoSize = true };
        var simpan = new Button { Text = "Simpan", AutoSize = true };
        var pulihkan = new Button { Text = "Pulihkan tetapan rosak", AutoSize = true };
        tutup.Click += (_, _) => Close();
        simpan.Click += (_, _) => Simpan();
        pulihkan.Click += (_, _) => PulihkanRosak();
        buttons.Controls.Add(tutup);
        buttons.Controls.Add(simpan);
        buttons.Controls.Add(pulihkan);
        panel.Controls.Add(buttons, 0, 4);
        panel.SetColumnSpan(buttons, 2);

        // Data dan Companion lama: status migrasi (nama keputusan sahaja) dan
        // persaraan autostart yang hanya berlaku apabila pemilik menekan butang.
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
        panel.RowStyles.Add(new RowStyle(SizeType.Absolute, 40));
        var migrasiTeks = new Label
        {
            Dock = DockStyle.Fill,
            ForeColor = Color.DimGray,
            Text = "Data disimpan dalam folder HADIR Desktop sendiri. " +
                (migrasi is null ? "" : "Migrasi daripada Companion: backend " + migrasi.Backend.Keputusan +
                    ", kredensial " + migrasi.Kredensial.Keputusan + "."),
        };
        panel.Controls.Add(migrasiTeks, 0, 5);
        panel.SetColumnSpan(migrasiTeks, 2);
        panel.Controls.Add(_companion, 0, 6);
        panel.SetColumnSpan(_companion, 2);
        var butangCompanion = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft };
        butangCompanion.Controls.Add(_pulihkanCompanion);
        butangCompanion.Controls.Add(_hentikanCompanion);
        panel.Controls.Add(butangCompanion, 0, 7);
        panel.SetColumnSpan(butangCompanion, 2);
        _hentikanCompanion.Click += (_, _) => HentikanCompanion();
        _pulihkanCompanion.Click += (_, _) => Jalankan(_persaraan!.Pulihkan());

        Controls.Add(panel);
        AcceptButton = simpan;
        CancelButton = tutup;
        _url.Text = _store.BacaApiUrlUntukPaparan() ?? "";
        KemasKiniCompanion();
    }

    /// <summary>
    /// Pemulihan EKSPLISIT fail backend Desktop yang rosak/separa. Memerlukan URL
    /// penuh dan rahsia enjin yang dimasukkan semula; fail lama disandarkan dahulu.
    /// Tidak membaca Companion. Tiada klien backend dibina dalam proses ini.
    /// </summary>
    private void PulihkanRosak()
    {
        if (string.IsNullOrWhiteSpace(_rahsia.Text))
        {
            _status.ForeColor = Color.Firebrick;
            _status.Text = "Pemulihan memerlukan URL penuh DAN rahsia enjin yang dimasukkan semula.";
            return;
        }
        var jawapan = MessageBox.Show(this,
            "Fail tetapan backend HADIR Desktop sedia ada akan disandarkan, kemudian diganti dengan URL dan rahsia enjin yang anda masukkan.\n\n" +
            "Tiada data diambil daripada Companion. HADIR Desktop MESTI dimulakan semula selepas ini.\n\nTeruskan?",
            "Pulihkan tetapan rosak", MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2);
        if (jawapan != DialogResult.Yes) return;
        try
        {
            var sandaran = _store.PulihkanGantiRosak(_url.Text.Trim(), _rahsia.Text);
            _rahsia.Clear();
            _status.ForeColor = Color.DarkGreen;
            _status.Text = "Tetapan dipulihkan (fail lama dalam " + sandaran + "). MULAKAN SEMULA HADIR Desktop; tiada penghantaran sebelum itu.";
        }
        catch (InvalidOperationException error)
        {
            _status.ForeColor = Color.Firebrick;
            _status.Text = error.Message;
        }
        catch (Exception error)
        {
            _status.ForeColor = Color.Firebrick;
            _status.Text = "Pemulihan gagal (" + error.GetType().Name + "); fail lama tidak dibuang. Tiada rahsia dipaparkan.";
        }
    }

    private void KemasKiniCompanion()
    {
        if (_persaraan is null)
        {
            _companion.Text = "";
            _hentikanCompanion.Visible = _pulihkanCompanion.Visible = false;
            return;
        }

        _companion.Text = _persaraan.TeksStatus();
        _hentikanCompanion.Enabled = _persaraan.AutostartAda();
        _pulihkanCompanion.Enabled = !_persaraan.AutostartAda() && _persaraan.SandaranAda();
    }

    private void HentikanCompanion()
    {
        var jawapan = MessageBox.Show(this,
            "Ini memadam entri autostart Windows untuk Companion lama (sandaran disimpan; boleh dipulihkan).\n\n" +
            "Proses Companion yang sedang berjalan TIDAK dihentikan dan tiada fail Companion dipadam.\n\n" +
            "Teruskan?",
            "Matikan autostart Companion lama", MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2);
        if (jawapan == DialogResult.Yes) Jalankan(_persaraan!.Hentikan());
    }

    private void Jalankan(HasilPersaraan hasil)
    {
        _status.ForeColor = hasil.Berjaya ? Color.DarkGreen : Color.Firebrick;
        _status.Text = hasil.Mesej;
        KemasKiniCompanion();
    }

    private void Simpan()
    {
        try
        {
            _store.Simpan(_url.Text.Trim(), _rahsia.Text);
            _rahsia.Clear();
            _status.ForeColor = Color.DarkGreen;
            _status.Text = "Disimpan. Mulakan semula HADIR Desktop untuk menggunakan tetapan baharu.";
        }
        catch (InvalidOperationException error)
        {
            _status.ForeColor = Color.Firebrick;
            _status.Text = error.Message;
        }
        catch (Exception)
        {
            _status.ForeColor = Color.Firebrick;
            _status.Text = "Simpanan gagal. Semak URL dan fail tetapan tempatan; tiada rahsia dipaparkan.";
        }
    }
}
