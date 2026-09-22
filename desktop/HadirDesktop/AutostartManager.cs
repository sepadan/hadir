using System;
using Microsoft.Win32;

namespace HadirDesktop;

/// <summary>
/// Abstraction over the per-user Run registry key so <see cref="AutostartManager"/>
/// can be unit-tested with a fake key instead of the real registry.
/// </summary>
public interface IRegistryRunKey
{
    string? Baca(string nama);
    void Tulis(string nama, string nilai);
    void Padam(string nama);
}

/// <summary>
/// Production <see cref="IRegistryRunKey"/> over
/// <c>HKCU\Software\Microsoft\Windows\CurrentVersion\Run</c>. Read is best-effort
/// (missing key/value -> null); write/delete create the key on demand.
/// </summary>
public sealed class RegistryRunKey : IRegistryRunKey
{
    private const string SubKey = @"Software\Microsoft\Windows\CurrentVersion\Run";

    public string? Baca(string nama)
    {
        using var kunci = Registry.CurrentUser.OpenSubKey(SubKey);
        return kunci?.GetValue(nama) as string;
    }

    public void Tulis(string nama, string nilai)
    {
        using var kunci = Registry.CurrentUser.CreateSubKey(SubKey, writable: true)
            ?? throw new InvalidOperationException("Tidak dapat membuka kunci Run (tulis).");
        kunci.SetValue(nama, nilai);
    }

    public void Padam(string nama)
    {
        using var kunci = Registry.CurrentUser.OpenSubKey(SubKey, writable: true);
        kunci?.DeleteValue(nama, throwOnMissingValue: false);
    }
}

/// <summary>Small surface the tray toggle needs; <see cref="AutostartManager"/> implements it.</summary>
public interface IAutostartManager
{
    bool Ada();
    void Daftar();
    void Buang();
}

/// <summary>
/// Registers/removes the "HadirDesktop" auto-start entry pointing at this app's
/// own executable. The registry is the single source of truth; the tray toggle
/// reads <see cref="Ada"/> and writes via <see cref="Daftar"/>/<see cref="Buang"/>.
/// Default OFF: absent until the owner opts in.
/// </summary>
public sealed class AutostartManager : IAutostartManager
{
    public const string NamaNilai = "HadirDesktop";

    private readonly IRegistryRunKey _kunci;
    private readonly string _laluanExe;

    public AutostartManager(IRegistryRunKey kunci, string? laluanExe = null)
    {
        _kunci = kunci;
        _laluanExe = laluanExe ?? Environment.ProcessPath ?? "HadirDesktop.exe";
    }

    public bool Ada() => _kunci.Baca(NamaNilai) != null;

    public void Daftar() => _kunci.Tulis(NamaNilai, _laluanExe);

    public void Buang() => _kunci.Padam(NamaNilai);
}
