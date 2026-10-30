using System.Reflection;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

public class BackendSettingsAccessTests
{
    [Theory]
    [InlineData(false, false, false, 0, 1)] // idle: no confirmation
    [InlineData(false, true, false, 1, 0)] // busy: No
    [InlineData(false, true, true, 1, 1)] // busy: Yes
    [InlineData(true, true, true, 0, 0)] // reentrancy
    [InlineData(true, false, true, 0, 0)]
    public void SettingsEntry_ConfirmationControlsOpeningWithoutStartingMainForm(
        bool open, bool busy, bool consent, int expectedPrompts, int expectedDialogs)
    {
        var method = typeof(MainForm).GetMethod("LaksanaBukaTetapanBackend", BindingFlags.Static | BindingFlags.NonPublic);
        Assert.NotNull(method);
        int prompts = 0, dialogs = 0; string? nav = null;
        method.Invoke(null, new object[] { open, busy, (Func<bool>)(() => { prompts++; return consent; }),
            (Action<string>)(s => nav = s), (Action)(() => dialogs++) });
        Assert.Equal(expectedPrompts, prompts); Assert.Equal(expectedDialogs, dialogs);
        Assert.Equal(!open && busy && !consent ? "Selesaikan tugasan/klaim aktif sebelum menukar sambungan backend." : null, nav);
        var seam = typeof(MainForm).GetProperty("PengesahanTukarBackendSemasaAktif", BindingFlags.Instance | BindingFlags.NonPublic);
        Assert.NotNull(seam); Assert.Equal(typeof(Func<bool>), seam.PropertyType);
    }

    [Fact]
    public void SaveGuard_ReadsLiveActivityEachTime_BlocksOnlyWhileActive()
    {
        var method = typeof(EngineSettingsDialog).GetMethod("BenarkanSimpanBackend", BindingFlags.Static | BindingFlags.NonPublic);
        Assert.NotNull(method);
        bool busy = true; string? status = null; int saves = 0;
        Func<bool> live = () => busy;
        void Save()
        {
            if ((bool)method.Invoke(null, new object[] { live, (Action<string>)(s => status = s) })!) saves++;
        }
        Save(); Assert.Equal(0, saves);
        Assert.Equal("Tugasan sedang berjalan \u2014 tunggu siap sebelum menyimpan sambungan baharu.", status);
        busy = false; status = null; Save(); Assert.Equal(1, saves); Assert.Null(status);
        busy = true; Save(); Assert.Equal(1, saves);
    }

    private static void OnSta(Action action)
    {
        Exception? error = null;
        var thread = new Thread(() => { try { action(); } catch (Exception e) { error = e; } });
        thread.SetApartmentState(ApartmentState.STA); thread.Start(); Assert.True(thread.Join(TimeSpan.FromSeconds(10)));
        if (error is not null) System.Runtime.ExceptionServices.ExceptionDispatchInfo.Capture(error).Throw();
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void PairingAndRestore_ActualHandlerBlocksActivityBeforePreflight(bool restore) => OnSta(() =>
    {
        var dir = Path.Combine(Path.GetTempPath(), "hadir-settings-access-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try
        {
            bool busy = true;
            using var dialog = new EngineSettingsDialog(new DpapiRahsiaEnjinStore(dir), adaAktivitiSemasa: () => busy);
            var status = Assert.IsType<System.Windows.Forms.Label>(Assert.Single(dialog.Controls.Find("statusSambungan", true)));
            dialog.SambungAsync(restore).GetAwaiter().GetResult();
            Assert.Equal("Tugasan sedang berjalan \u2014 tunggu siap sebelum menyimpan sambungan baharu.", status.Text);
            busy = false;
            dialog.SambungAsync(restore).GetAwaiter().GetResult();
            Assert.StartsWith("Kod sambungan tidak sah.", status.Text); // passed live guard, reaches code validation; no HTTP
            Assert.Empty(Directory.GetFiles(dir));
        }
        finally { Directory.Delete(dir, true); }
    });

    [Fact]
    public void LegacySave_ActualHandlerUsesSameLiveGuard() => OnSta(() =>
    {
        var dir = Path.Combine(Path.GetTempPath(), "hadir-legacy-access-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try
        {
            bool busy = true;
            using var dialog = new LegacyConnectionDialog(new DpapiRahsiaEnjinStore(dir), () => busy);
            var status = Assert.IsType<System.Windows.Forms.Label>(Assert.Single(dialog.Controls.Find("legacyStatus", true)));
            var url = Assert.IsType<System.Windows.Forms.TextBox>(Assert.Single(dialog.Controls.Find("legacyApiUrl", true)));
            var save = Assert.IsType<System.Windows.Forms.Button>(Assert.Single(dialog.Controls.Find("legacySave", true)));
            url.Text = "invalid"; // avoid confirmation/HTTP even after live activity clears
            var click = typeof(System.Windows.Forms.Button).GetMethod("OnClick", BindingFlags.Instance | BindingFlags.NonPublic)!;
            click.Invoke(save, new object[] { EventArgs.Empty });
            Assert.Equal("Tugasan sedang berjalan \u2014 tunggu siap sebelum menyimpan sambungan baharu.", status.Text);
            busy = false; click.Invoke(save, new object[] { EventArgs.Empty });
            Assert.Equal("Deployment tidak dipercayai; tiada perubahan.", status.Text);
            Assert.Empty(Directory.GetFiles(dir));
        }
        finally { Directory.Delete(dir, true); }
    });
}
