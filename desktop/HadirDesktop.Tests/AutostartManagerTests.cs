using System.Collections.Generic;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

public class AutostartManagerTests
{
    /// <summary>In-memory fake of the Run key for tests (no real registry touched).</summary>
    private sealed class RunKeyPalsu : IRegistryRunKey
    {
        private readonly Dictionary<string, string> _nilai = new();

        public string? Baca(string nama) => _nilai.TryGetValue(nama, out var v) ? v : null;

        public void Tulis(string nama, string nilai) => _nilai[nama] = nilai;

        public void Padam(string nama) => _nilai.Remove(nama);
    }

    private static (AutostartManager, RunKeyPalsu) Buat(string? laluanExe = @"C:\App\HadirDesktop.exe")
    {
        var kunci = new RunKeyPalsu();
        return (new AutostartManager(kunci, laluanExe), kunci);
    }

    [Fact]
    public void Ada_TiadaKunci_SebelahMula_Palsu()
    {
        var (m, _) = Buat();
        Assert.False(m.Ada());
    }

    [Fact]
    public void Daftar_TulisNilai_DanAdaMenjadiBenar()
    {
        var (m, kunci) = Buat();
        m.Daftar();
        Assert.True(m.Ada());
        Assert.Equal(@"C:\App\HadirDesktop.exe", kunci.Baca(AutostartManager.NamaNilai));
    }

    [Fact]
    public void Buang_PadamNilai_DanAdaMenjadiPalsu()
    {
        var (m, kunci) = Buat();
        m.Daftar();
        m.Buang();
        Assert.False(m.Ada());
        Assert.Null(kunci.Baca(AutostartManager.NamaNilai));
    }

    [Fact]
    public void Buang_TanpaDaftarTidakLontar()
    {
        var (m, _) = Buat();
        m.Buang();
        Assert.False(m.Ada());
    }

    [Fact]
    public void DefaultLaluanExe_GunaProcessPath_ApabilaTidakDiberi()
    {
        var kunci = new RunKeyPalsu();
        var m = new AutostartManager(kunci);
        m.Daftar();
        var nilai = kunci.Baca(AutostartManager.NamaNilai);
        Assert.NotNull(nilai);
        Assert.False(string.IsNullOrWhiteSpace(nilai));
    }
}
