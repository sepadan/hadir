using System;
using System.IO;
using System.Text;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// DPAPI device-secret store tests. Every test uses an isolated temporary file
/// with a SYNTHETIC secret — never the real per-user vault
/// (<c>LocalApplicationData/HadirDesktop/device-secret.bin</c>), which must
/// remain untouched by the test run.
/// </summary>
public class DeviceSecretStoreTests : IDisposable
{
    private readonly string _laluan;
    private readonly string _dir;

    public DeviceSecretStoreTests()
    {
        _dir = Path.Combine(Path.GetTempPath(), "hadir-secret-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_dir);
        _laluan = Path.Combine(_dir, "device-secret.bin");
    }

    public void Dispose()
    {
        try { if (Directory.Exists(_dir)) Directory.Delete(_dir, recursive: true); } catch { /* best-effort */ }
    }

    [Fact]
    public void SimpanKemudianBaca_Berjaya()
    {
        var kedai = new DpapiDeviceSecretStore(_laluan);
        kedai.Simpan("rahsia-sintetik-123456");

        Assert.Equal("rahsia-sintetik-123456", kedai.Baca());
    }

    [Fact]
    public void FailTidakAda_MemulangkanNull()
    {
        var kedai = new DpapiDeviceSecretStore(_laluan);
        Assert.Null(kedai.Baca());
    }

    [Fact]
    public void GumpalRosak_MemulangkanNull_TanpaMelontar()
    {
        File.WriteAllBytes(_laluan, new byte[] { 1, 2, 3, 4, 5, 6, 7, 8 });
        var kedai = new DpapiDeviceSecretStore(_laluan);
        Assert.Null(kedai.Baca());
    }

    [Fact]
    public void Padam_MenghapusRahsia()
    {
        var kedai = new DpapiDeviceSecretStore(_laluan);
        kedai.Simpan("rahsia-x");
        kedai.Padam();
        Assert.Null(kedai.Baca());
    }

    [Fact]
    public void RahsiaTidakDisimpanSebagaiTeksBiasa()
    {
        var kedai = new DpapiDeviceSecretStore(_laluan);
        kedai.Simpan("rahsia-sintetik-123456");

        var baitAtasCakera = File.ReadAllBytes(_laluan);
        var teks = Encoding.UTF8.GetString(baitAtasCakera);
        Assert.DoesNotContain("rahsia-sintetik", teks);
    }
}
