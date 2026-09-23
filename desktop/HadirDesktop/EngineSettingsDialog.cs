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

    public EngineSettingsDialog(DpapiRahsiaEnjinStore store)
    {
        _store = store;
        Text = "Tetapan Tempatan — HADIR Desktop";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        StartPosition = FormStartPosition.CenterParent;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = false;
        ClientSize = new Size(610, 250);

        var panel = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(14), ColumnCount = 2, RowCount = 5 };
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
        tutup.Click += (_, _) => Close();
        simpan.Click += (_, _) => Simpan();
        buttons.Controls.Add(tutup);
        buttons.Controls.Add(simpan);
        panel.Controls.Add(buttons, 0, 4);
        panel.SetColumnSpan(buttons, 2);
        Controls.Add(panel);
        AcceptButton = simpan;
        CancelButton = tutup;
        _url.Text = _store.BacaApiUrlUntukPaparan() ?? "";
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
