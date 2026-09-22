using System;
using System.Drawing;
using System.Security.Cryptography;
using System.Text;
using System.Windows.Forms;

namespace HadirDesktop;

/// <summary>
/// "Pendaftaran PC" panel for the HADIR multi-PC backend. This is the REAL
/// enrollment + heartbeat surface (not probe-only): the operator enters an
/// admin-issued single-use enrollment code, the panel enrolls the device
/// against the configured endpoint, stores the device secret in DPAPI, and
/// then offers a manual Start/Stop heartbeat.
///
/// Safety properties:
/// <list type="bullet">
/// <item>No automatic traffic: enrollment and heartbeat are always user-triggered.</item>
/// <item>The device secret is transient in memory and DPAPI-protected on disk;
/// it is never logged or shown in the UI.</item>
/// <item>Enrollment is refused unless the endpoint matches a known Apps Script
/// pattern (or loopback for tests) — see <see cref="HadirEndpointValidator"/>.</item>
/// <item>Leadership is reported as "Pemimpin" vs "Sedia (standby)" only; no
/// attendance writer is activated in this phase.</item>
/// </list>
/// </summary>
public sealed class DevicePanel : UserControl
{
    private readonly IDeviceRegistrationClient _client;
    private readonly IDeviceSecretStore _secretStore;
    private readonly IDeviceIdentityStore _identityStore;
    private readonly string _apiUrl;

    private Label _demoLabel = null!;
    private Label _statusLabel = null!;
    private Button _probeButton = null!;
    private TextBox _kodDaftarInput = null!;
    private TextBox _akaunInput = null!;
    private TextBox _namaInput = null!;
    private Button _daftarButton = null!;
    private Label _perantiLabel = null!;
    private Button _degupButton = null!;
    private Label _degupStatusLabel = null!;

    private HeartbeatLoop? _degupLoop;
    private string _idPeranti = string.Empty;
    private string _akaun = string.Empty;
    private string _nama = string.Empty;
    private string _rahsia = string.Empty; // transient; never logged/displayed
    private bool _berdaftar;
    private PerantiKemampuan _kemampuan = PerantiKemampuan.TiadaSokongan;

    public DevicePanel(
        IDeviceRegistrationClient client,
        string apiUrl,
        IDeviceSecretStore secretStore,
        IDeviceIdentityStore identityStore)
    {
        _client = client;
        _apiUrl = apiUrl;
        _secretStore = secretStore;
        _identityStore = identityStore;
        BuildLayout();
        MuatIdentitiTersimpan();
    }

    private void BuildLayout()
    {
        Dock = DockStyle.Bottom;
        Height = 232;
        Padding = new Padding(6, 4, 6, 4);

        _demoLabel = new Label
        {
            Dock = DockStyle.Top,
            Height = 16,
            Font = new Font(Font, FontStyle.Italic),
            Text = "Pendaftaran PC (ciri berbilang PC) — daftar dengan kod daripada pentadbir, kemudian mula degup secara manual.",
        };

        _probeButton = new Button { Dock = DockStyle.Top, Height = 24, Text = "Semak keupayaan pelayan (baca sahaja)" };
        _probeButton.Click += async (_, _) => await SemakKeupayaanAsync();

        _statusLabel = new Label { Dock = DockStyle.Top, Height = 18, Text = "Pendaftaran PC: belum disemak." };

        _kodDaftarInput = new TextBox { Dock = DockStyle.Top, Height = 22, PlaceholderText = "Kod daftar (sekali guna)" };
        _akaunInput = new TextBox { Dock = DockStyle.Top, Height = 22, PlaceholderText = "Akaun" };
        _namaInput = new TextBox { Dock = DockStyle.Top, Height = 22, PlaceholderText = "Nama peranti (cth. PC Kaunter)" };

        _daftarButton = new Button { Dock = DockStyle.Top, Height = 26, Text = "Daftar Peranti" };
        _daftarButton.Click += async (_, _) => await DaftarPerantiAsync();

        _perantiLabel = new Label { Dock = DockStyle.Top, Height = 16, Text = "Belum didaftarkan." };

        _degupButton = new Button { Dock = DockStyle.Top, Height = 26, Text = "Mula Degup (pemimpin/standby)", Enabled = false };
        _degupButton.Click += (_, _) => TogolDegup();

        _degupStatusLabel = new Label { Dock = DockStyle.Top, Height = 18, Text = string.Empty };

        Controls.Add(_degupStatusLabel);
        Controls.Add(_degupButton);
        Controls.Add(_perantiLabel);
        Controls.Add(_daftarButton);
        Controls.Add(_namaInput);
        Controls.Add(_akaunInput);
        Controls.Add(_kodDaftarInput);
        Controls.Add(_statusLabel);
        Controls.Add(_probeButton);
        Controls.Add(_demoLabel);
    }

    private void MuatIdentitiTersimpan()
    {
        var identiti = _identityStore.Baca();
        var rahsia = _secretStore.Baca();
        if (identiti is null || rahsia is null || identiti.IdPeranti.Length == 0)
        {
            return;
        }

        _idPeranti = identiti.IdPeranti;
        _akaun = identiti.Akaun;
        _nama = identiti.Nama;
        _rahsia = rahsia;
        _berdaftar = true;
        _perantiLabel.Text = $"Berdaftar: {_idPeranti} (akaun {_akaun}) — degup belum dimulakan.";
        _degupButton.Enabled = true;
        _degupButton.Text = "Mula Degup (pemimpin/standby)";
    }

    private async System.Threading.Tasks.Task SemakKeupayaanAsync()
    {
        _probeButton.Enabled = false;
        try
        {
            _kemampuan = await _client.ProbeKeupayaanAsync();
            _statusLabel.Text = "Pendaftaran PC: " + MesejKemampuan(_kemampuan);
        }
        finally
        {
            _probeButton.Enabled = true;
        }
    }

    private async System.Threading.Tasks.Task DaftarPerantiAsync()
    {
        if (!HadirEndpointValidator.BolehDaftar(_apiUrl))
        {
            _statusLabel.Text = "Titik akhir tidak dibenarkan untuk pendaftaran (bukan corak Apps Script yang sah).";
            return;
        }

        var kodDaftar = _kodDaftarInput.Text.Trim();
        var akaun = _akaunInput.Text.Trim();
        var nama = _namaInput.Text.Trim();
        if (kodDaftar.Length == 0 || akaun.Length == 0)
        {
            _statusLabel.Text = "Masukkan kod daftar dan akaun.";
            return;
        }

        var siap = MulaButang(_daftarButton, "Mendaftar…");
        try
        {
            var idPeranti = Guid.NewGuid().ToString("N");
            var rahsia = JanaRahsia();
            var rekod = await _client.DaftarAsync(kodDaftar, idPeranti, akaun, nama, rahsia);

            // Persist only AFTER the backend accepts the enrollment.
            _secretStore.Simpan(rahsia);
            _identityStore.Simpan(new DeviceIdentity { IdPeranti = idPeranti, Akaun = akaun, Nama = nama });

            _idPeranti = idPeranti;
            _akaun = akaun;
            _nama = nama;
            _rahsia = rahsia;
            _berdaftar = true;
            _perantiLabel.Text = $"Berdaftar: {idPeranti} (akaun {akaun}, generasi {rekod.Generasi}) — degup belum dimulakan.";
            _degupButton.Enabled = true;
            _degupButton.Text = "Mula Degup (pemimpin/standby)";
            _statusLabel.Text = "Peranti berdaftar. Rahsia disimpan dengan DPAPI (CurrentUser).";
            _kodDaftarInput.Clear();
        }
        catch (PerantiDilumpuhkanException)
        {
            _statusLabel.Text = "Ciri berbilang PC dilumpuhkan pada pelayan.";
        }
        catch (PerantiNyahaktifException)
        {
            _statusLabel.Text = "Pendaftaran ditolak: peranti telah dinyahaktifkan.";
        }
        catch (Exception ex)
        {
            _statusLabel.Text = "Pendaftaran gagal: " + ex.Message;
        }
        finally
        {
            siap();
        }
    }

    private void TogolDegup()
    {
        if (_degupLoop is { Berjalan: true })
        {
            HentiDegup();
            return;
        }
        MulaDegup();
    }

    private void MulaDegup()
    {
        if (!_berdaftar || _rahsia.Length == 0)
        {
            return;
        }

        var idPeranti = _idPeranti;
        var akaun = _akaun;
        var rahsia = _rahsia;

        _degupLoop?.Dispose();
        _degupLoop = new HeartbeatLoop(
            ct => _client.DegupAsync(idPeranti, akaun, rahsia),
            selang: TimeSpan.FromSeconds(30),
            backoffMaks: TimeSpan.FromMinutes(5));
        _degupLoop.KeadaanBerubah += PadaDegup;
        _degupLoop.TamatTerminal += PadaDegupTerminal;
        _degupLoop.Start();

        _degupButton.Text = "Henti Degup";
        _degupStatusLabel.Text = "Degup dimulakan (menunggu jawapan pertama)…";
    }

    private void HentiDegup()
    {
        _degupLoop?.Stop();
        _degupLoop?.Dispose();
        _degupLoop = null;
        _degupButton.Text = "Mula Degup (pemimpin/standby)";
        _degupStatusLabel.Text = "Degup dihentikan.";
    }

    private void PadaDegup(DegupKeadaan keadaan)
    {
        // Marshal onto the UI thread (heartbeat fires from a background loop).
        if (InvokeRequired)
        {
            BeginInvoke(new Action(() => PadaDegup(keadaan)));
            return;
        }
        _degupStatusLabel.Text = keadaan.Pemimpin
            ? $"Pemimpin — memegang lease (generasi {keadaan.Generasi})."
            : $"Sedia (standby) — bukan pemimpin semasa (generasi {keadaan.Generasi}).";
    }

    private void PadaDegupTerminal(string sebab)
    {
        if (InvokeRequired)
        {
            BeginInvoke(new Action(() => PadaDegupTerminal(sebab)));
            return;
        }
        _degupLoop?.Dispose();
        _degupLoop = null;
        _degupButton.Text = "Mula Degup (pemimpin/standby)";
        _degupStatusLabel.Text = "Degup berhenti: " + sebab;
    }

    private static string JanaRahsia()
    {
        var bait = RandomNumberGenerator.GetBytes(32);
        var sb = new StringBuilder(bait.Length * 2);
        foreach (var b in bait) sb.Append(b.ToString("x2"));
        return sb.ToString();
    }

    private static string MesejKemampuan(PerantiKemampuan kemampuan) => kemampuan switch
    {
        PerantiKemampuan.TiadaSokongan => "Tiada sokongan pelayan",
        PerantiKemampuan.Dilumpuhkan => "Ciri dilumpuhkan",
        PerantiKemampuan.Tersedia => "Tersedia",
        _ => "Tidak diketahui",
    };

    private static Action MulaButang(Button btn, string label)
    {
        var asal = btn.Text;
        btn.Enabled = false;
        btn.Text = label;
        return () =>
        {
            btn.Enabled = true;
            btn.Text = asal;
        };
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _degupLoop?.Dispose();
            _degupLoop = null;
        }
        base.Dispose(disposing);
    }

    // Test seams (InternalsVisibleTo "HadirDesktop.Tests"): read-only views so
    // an STA-hosted wiring test can assert the panel state without reflection.
    internal bool BerdaftarUntukUjian => _berdaftar;
    internal string IdPerantiUntukUjian => _idPeranti;
    internal Button DegupButtonUntukUjian => _degupButton;
    internal string DegupStatusUntukUjian => _degupStatusLabel.Text;
}
