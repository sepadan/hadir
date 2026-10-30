using System.Drawing;
using System.Windows.Forms;

namespace HadirDesktop;

/// <summary>Explicit owner-only fallback while pairing GAS is unavailable. Never preloads a secret.</summary>
internal sealed class LegacyConnectionDialog : Form
{
    private readonly CancellationTokenSource _lifetime = new();
    private bool _busy;
    internal LegacyConnectionDialog(DpapiRahsiaEnjinStore store, Func<bool>? adaAktivitiSemasa = null)
    {
        adaAktivitiSemasa ??= () => false;
        Text = "Lanjutan — pemulihan sambungan legasi";
        StartPosition = FormStartPosition.CenterParent; FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = MinimizeBox = false; ClientSize = new Size(660, 365);
        var panel = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 7, Padding = new Padding(16) };
        foreach (var h in new[] { 70, 42, 28, 34, 30, 68, 42 }) panel.RowStyles.Add(new RowStyle(SizeType.Absolute, h));
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        panel.Controls.Add(new Label { Dock = DockStyle.Fill, Text = "Untuk pemilik yang sudah mempunyai rahsia legasi sahaja apabila GAS pairing belum tersedia. Deployment mesti backend semasa atau bootstrap dipercayai. Jangan edarkan rahsia bersama kepada PC baharu; gunakan kod selepas GAS diterbitkan." }, 0, 0);
        var url = new TextBox { Dock = DockStyle.Fill, Text = store.BacaApiUrlUntukPaparan() ?? SambunganDesktopClient.BootstrapUrl, Name = "legacyApiUrl" };
        panel.Controls.Add(url, 0, 1);
        panel.Controls.Add(new Label { Text = "Rahsia legasi (kosong mengekalkan nilai lama)", Dock = DockStyle.Fill }, 0, 2);
        var secret = new TextBox { Dock = DockStyle.Fill, UseSystemPasswordChar = true, Name = "legacySecret" };
        panel.Controls.Add(secret, 0, 3);
        var recovery = new CheckBox { Text = "Pulihkan fail rosak dengan sandaran (rahsia perlu diisi semula)", Dock = DockStyle.Fill };
        panel.Controls.Add(recovery, 0, 4);
        var status = new Label { Name = "legacyStatus", Dock = DockStyle.Fill, ForeColor = Color.DimGray };
        panel.Controls.Add(status, 0, 5);
        var buttons = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft };
        var close = new Button { Text = "Tutup", AutoSize = true };
        var save = new Button { Name = "legacySave", Text = "Simpan legasi…", AutoSize = true };
        buttons.Controls.AddRange(new Control[] { close, save }); panel.Controls.Add(buttons, 0, 6); Controls.Add(panel);
        close.Click += (_, _) => Close();
        FormClosing += (_, e) => { e.Cancel = EngineSettingsDialog.TangguhTutup(_busy, e.CloseReason); if (!e.Cancel) { _lifetime.Cancel(); secret.Clear(); } };
        save.Click += async (_, _) =>
        {
            if (_busy) return;
            if (!EngineSettingsDialog.BenarkanSimpanBackend(adaAktivitiSemasa,
                s => { status.Text = s; status.ForeColor = Color.Firebrick; })) return;
            try
            {
                var target = url.Text.Trim();
                if (!SambunganDesktopClient.SasaranDipercayai(target, store.BacaApiUrlUntukPaparan(), new[] { SambunganDesktopClient.BootstrapUrl }))
                    throw new InvalidOperationException("Deployment tidak dipercayai; tiada perubahan.");
                var cap = store.CapSimpanan();
                if (MessageBox.Show(this, "Sasaran: " + target + "\n\nSahkan simpan/ganti konfigurasi legasi? Mula semula diperlukan.",
                    "Sahkan sasaran legasi", MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2) != DialogResult.Yes) return;
                store.SahkanSimpananBolehDitulis(recovery.Checked);
                _busy = true; save.Enabled = close.Enabled = url.Enabled = secret.Enabled = recovery.Enabled = false;
                using var http = AppsScriptHttpHandler.BuatHttpClient();
                await new SambunganDesktopClient(http).PastikanTiadaKerjaAktifAsync(store, _lifetime.Token);
                _lifetime.Token.ThrowIfCancellationRequested();
                if (store.CapSimpanan() != cap) throw new InvalidOperationException("Tetapan berubah; sahkan semula sebelum menyimpan.");
                if (recovery.Checked) store.PulihkanGantiRosak(target, secret.Text);
                else store.Simpan(target, secret.Text);
                secret.Clear(); if (!IsDisposed) status.Text = "Disimpan. Mulakan semula HADIR Desktop.";
            }
            catch (InvalidOperationException e) { if (!IsDisposed) status.Text = e.Message; }
            catch { if (!IsDisposed) status.Text = "Simpanan legasi gagal; fail lama tidak dibuang."; }
            finally { _busy = false; if (!IsDisposed) save.Enabled = close.Enabled = url.Enabled = secret.Enabled = recovery.Enabled = true; }
        };
    }
}
