using System.Drawing;
using System.Windows.Forms;

namespace HadirDesktop;

/// <summary>One admin code. No portal activity or idMe credential access.</summary>
public sealed class EngineSettingsDialog : Form
{
    private readonly DpapiRahsiaEnjinStore _store;
    private readonly TextBox _kod = new() { Dock = DockStyle.Fill, UseSystemPasswordChar = true, MaxLength = 2048, Name = "kodSambungan" };
    private readonly Label _status = new() { Dock = DockStyle.Fill, ForeColor = Color.DimGray, Name = "statusSambungan" };
    private readonly PersaraanAutostartCompanion? _persaraan;
    private readonly Label _companion = new() { Dock = DockStyle.Fill };
    private readonly Button _hentikanCompanion = new() { Text = "Matikan autostart Companion lama", AutoSize = true };
    private readonly Button _pulihkanCompanion = new() { Text = "Pulihkan autostart Companion", AutoSize = true };
    private readonly Button _sambung = new() { Text = "Sambung", AutoSize = true };
    private readonly Button _pulihkan = new() { Text = "Pulihkan tetapan rosak", AutoSize = true };
    private readonly Button _tutup = new() { Text = "Tutup", AutoSize = true };
    private readonly CheckBox _semakanTidakPasti = new() { Dock = DockStyle.Fill, Name = "pemulihanBackendTidakDicapai",
        Text = "Pemulihan: backend lama tidak dapat dicapai (perlu pengesahan berasingan)", AutoSize = true };
    private bool _sibuk;
    private readonly CancellationTokenSource _lifetime = new();
    private readonly Label _sasaran = new() { Dock = DockStyle.Fill, Name = "sasaranDeployment", Text = "Sasaran deployment akan dipaparkan selepas kod ditampal." };

    public EngineSettingsDialog(DpapiRahsiaEnjinStore store, HasilMigrasi? migrasi = null, PersaraanAutostartCompanion? persaraan = null)
    {
        _store = store;
        _persaraan = persaraan;
        Text = "Tetapan Tempatan — HADIR Desktop";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        StartPosition = FormStartPosition.CenterParent;
        MaximizeBox = MinimizeBox = ShowInTaskbar = false;
        AutoScaleMode = AutoScaleMode.Dpi;
        ClientSize = new Size(660, 540);
        var panel = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(16), ColumnCount = 1, RowCount = 9, AutoScroll = true };
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        foreach (var height in new[] { 70, 28, 34, 60, 78, 42, 52, 52, 42 }) panel.RowStyles.Add(new RowStyle(SizeType.Absolute, height));
        panel.Controls.Add(new Label { Dock = DockStyle.Fill, Text = "Dalam HADIR, buka Hantar ke MOEIS → Sambungan Desktop → Jana kod. Tampal satu kod penuh di bawah. Kod tiada tarikh luput, sekali guna dan boleh dibatalkan oleh admin. Akaun idMe diurus secara berasingan." }, 0, 0);
        panel.Controls.Add(new Label { Dock = DockStyle.Fill, Text = "Kod sambungan", TextAlign = ContentAlignment.MiddleLeft }, 0, 1);
        panel.Controls.Add(_kod, 0, 2);
        panel.Controls.Add(_sasaran, 0, 3);
        _kod.TextChanged += (_, _) =>
        {
            try
            {
                var value = KodSambungan.Baca(_kod.Text);
                var trusted = SambunganDesktopClient.SasaranDipercayai(value.ApiUrl, _store.BacaApiUrlUntukPaparan(), new[] { SambunganDesktopClient.BootstrapUrl });
                _sasaran.Text = (trusted ? "Sasaran dipercayai: " : "DITOLAK — sasaran tidak dipercayai: ") + value.ApiUrl;
                _sasaran.ForeColor = trusted ? Color.DarkGreen : Color.Firebrick;
            }
            catch { _sasaran.Text = "Tampal kod penuh untuk melihat deployment sasaran."; }
        };
        _status.Text = _store.Status().Sedia
            ? "Sambungan sedia ada dikekalkan. Gunakan kod baharu hanya untuk menggantinya. Mulakan semula selepas menyambung."
            : "Belum ada sambungan yang boleh digunakan. Sambung dengan kod daripada admin, kemudian mulakan semula Desktop.";
        var idSedia = KodSambungan.IdDaripadaToken(_store.Baca()?.RahsiaEnjin);
        if (idSedia is not null) _status.Text = "ID PC: " + idSedia + ". " + _status.Text;
        panel.Controls.Add(_status, 0, 4);
        var buttons = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft };
        buttons.Controls.AddRange(new Control[] { _tutup, _sambung, _pulihkan });
        var lanjutan = new Button { Text = "Lanjutan (legasi)…", AutoSize = true };
        buttons.Controls.Add(lanjutan);
        lanjutan.Click += (_, _) => { if (!_sibuk) { using var d = new LegacyConnectionDialog(_store); d.ShowDialog(this); } };
        panel.Controls.Add(buttons, 0, 5);
        panel.Controls.Add(_semakanTidakPasti, 0, 6);
        panel.Controls.Add(_companion, 0, 7);
        var legacy = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft };
        legacy.Controls.AddRange(new Control[] { _pulihkanCompanion, _hentikanCompanion });
        panel.Controls.Add(legacy, 0, 8);
        Controls.Add(panel);
        AcceptButton = _sambung; CancelButton = _tutup;
        _tutup.Click += (_, _) => Close();
        _sambung.Click += async (_, _) => await SambungAsync(false);
        _pulihkan.Click += async (_, _) => await SambungAsync(true);
        _hentikanCompanion.Click += (_, _) => HentikanCompanion();
        _pulihkanCompanion.Click += (_, _) => Jalankan(_persaraan!.Pulihkan());
        FormClosing += (_, e) => { e.Cancel = TangguhTutup(_sibuk, e.CloseReason); if (!e.Cancel) { _lifetime.Cancel(); _kod.Clear(); } };
        KemasKiniCompanion();
    }
    internal static bool TangguhTutup(bool sibuk, CloseReason reason) => sibuk && reason == CloseReason.UserClosing;

    private async Task SambungAsync(bool pulihkan)
    {
        if (_sibuk) return;
        string sasaran, cap;
        try
        {
            using var previewHttp = AppsScriptHttpHandler.BuatHttpClient();
            sasaran = new SambunganDesktopClient(previewHttp).SahkanSasaran(_kod.Text, _store);
            cap = _store.CapSimpanan();
        }
        catch (InvalidOperationException e) { _status.Text = e.Message; _status.ForeColor = Color.Firebrick; return; }
        catch { _status.Text = "Tetapan tempatan tidak dapat diperiksa; tiada kod ditebus."; return; }
        var mengganti = _store.AdaFailBackend;
        if ((pulihkan || mengganti) && MessageBox.Show(this,
            "Sasaran: " + sasaran + "\n\nSambungan semasa: " + (_store.BacaApiUrlUntukPaparan() ?? "tiada/tidak dapat dibaca") +
            "\n\nGanti sambungan pada PC ini? Tugasan aktif mesti selesai dahulu. Pemulihan rosak menyandarkan fail asal. Mulakan semula selepas selesai.",
            "Sahkan penggantian sambungan", MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2) != DialogResult.Yes) return;
        var pulihTidakPasti = _semakanTidakPasti.Checked && mengganti;
        if (pulihTidakPasti && MessageBox.Show(this,
            "Semakan backend lama mungkin gagal. Ini bukan bukti bahawa tugasan belum dihantar. " +
            "Semak PC lama dihentikan dan hasil tidak pasti dengan admin. Jangan hantar semula kehadiran. " +
            "Backend sasaran tetap menyekat tugasan aktif pemilik lama (atau semua pemilik jika ID/deployment lama tidak diketahui). " +
            "Jika deployment berubah, admin mesti menyemak tugasan pada backend lama secara berasingan. Teruskan pemulihan?",
            "Sahkan pemulihan tanpa semakan lama", MessageBoxButtons.YesNo, MessageBoxIcon.Warning,
            MessageBoxDefaultButton.Button2) != DialogResult.Yes) return;
        var kod = _kod.Text; _kod.Clear();
        _sibuk = true;
        _semakanTidakPasti.Enabled = _kod.Enabled = _sambung.Enabled = _pulihkan.Enabled = _tutup.Enabled = false;
        _hentikanCompanion.Enabled = _pulihkanCompanion.Enabled = false;
        _status.ForeColor = Color.DimGray; _status.Text = "Menyambung… Tunggu keputusan sebelum menutup dialog.";
        try
        {
            using var http = AppsScriptHttpHandler.BuatHttpClient();
            var id = await new SambunganDesktopClient(http).SambungAsync(kod, _store, pulihkan, _lifetime.Token, mengganti || pulihkan, cap, sahkanSemakanTidakPasti: pulihTidakPasti);
            if (IsDisposed) return;
            _status.ForeColor = Color.DarkGreen;
            _status.Text = "ID PC: " + id + ". Sambungan disimpan. MULAKAN SEMULA HADIR Desktop untuk menggunakan token peranti baharu. Akaun idMe kekal berasingan.";
        }
        catch (InvalidOperationException e) { if (!IsDisposed) { _status.ForeColor = Color.Firebrick; _status.Text = e.Message; } }
        catch { if (!IsDisposed) { _status.ForeColor = Color.Firebrick; _status.Text = "Sambungan tidak dapat disimpan. Semak daftar peranti dalam HADIR sebelum menjana kod baharu."; } }
        finally
        {
            _sibuk = false;
            if (!IsDisposed) { _semakanTidakPasti.Enabled = _kod.Enabled = _sambung.Enabled = _pulihkan.Enabled = _tutup.Enabled = true; KemasKiniCompanion(); }
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
        if (MessageBox.Show(this,
            "Ini memadam entri autostart Companion lama dengan sandaran yang boleh dipulihkan. Proses berjalan dan fail Companion tidak dipadam. Teruskan?",
            "Matikan autostart Companion lama", MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2) == DialogResult.Yes)
            Jalankan(_persaraan!.Hentikan());
    }

    private void Jalankan(HasilPersaraan hasil)
    {
        _status.ForeColor = hasil.Berjaya ? Color.DarkGreen : Color.Firebrick;
        _status.Text = hasil.Mesej;
        KemasKiniCompanion();
    }
}
