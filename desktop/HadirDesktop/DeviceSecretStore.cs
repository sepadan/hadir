using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace HadirDesktop;

/// <summary>
/// Persistence for the per-installation device secret (the <c>rahsia</c> used
/// to authenticate this device to the HADIR multi-PC backend). The secret is
/// held in memory only transiently by the caller; the only durable form is the
/// DPAPI-protected blob below. There is NO plaintext fallback: a missing file
/// or a failed unprotect yields <c>null</c>, never a guess.
/// </summary>
public interface IDeviceSecretStore
{
    void Simpan(string rahsia);
    string? Baca();
    void Padam();
}

/// <summary>
/// DPAPI (CurrentUser) device secret store. The secret is encrypted with
/// <see cref="ProtectedData.Protect"/> under a fixed, app-specific entropy blob
/// (the entropy is NOT the secret and is safe to hardcode). Stored under
/// <c>LocalApplicationData/HadirDesktop/device-secret.bin</c>.
/// </summary>
public sealed class DpapiDeviceSecretStore : IDeviceSecretStore
{
    private static readonly byte[] Entropi = Encoding.UTF8.GetBytes("HADIR-desktop-device-secret-v1");

    private readonly string _laluan;

    public DpapiDeviceSecretStore() : this(LaluanLalai())
    {
    }

    /// <summary>Test seam: point the store at an isolated temporary file.</summary>
    public DpapiDeviceSecretStore(string laluan)
    {
        _laluan = laluan;
    }

    private static string LaluanLalai() => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "HadirDesktop", "device-secret.bin");

    public void Simpan(string rahsia)
    {
        var raw = Encoding.UTF8.GetBytes(rahsia);
        var dilindungi = ProtectedData.Protect(raw, Entropi, DataProtectionScope.CurrentUser);
        var direktori = Path.GetDirectoryName(_laluan);
        if (!string.IsNullOrEmpty(direktori)) Directory.CreateDirectory(direktori);
        File.WriteAllBytes(_laluan, dilindungi);
    }

    public string? Baca()
    {
        try
        {
            if (!File.Exists(_laluan)) return null;
            var dilindungi = File.ReadAllBytes(_laluan);
            var raw = ProtectedData.Unprotect(dilindungi, Entropi, DataProtectionScope.CurrentUser);
            return Encoding.UTF8.GetString(raw);
        }
        catch
        {
            // Strict no-fallback: any unprotect/read failure -> null. We never
            // return a plaintext guess and never partially decrypt.
            return null;
        }
    }

    public void Padam()
    {
        try
        {
            if (File.Exists(_laluan)) File.Delete(_laluan);
        }
        catch
        {
            // Best-effort only.
        }
    }
}

/// <summary>Non-secret enrollment identity (device id, account, friendly name).</summary>
public sealed record DeviceIdentity
{
    public string IdPeranti { get; init; } = string.Empty;
    public string Akaun { get; init; } = string.Empty;
    public string Nama { get; init; } = string.Empty;
}

/// <summary>
/// Persistence for the NON-secret device identity. Unlike the device secret,
/// this contains no credential — <c>akaun</c> is an opaque account label that
/// the backend already exposes in its public status endpoint, so it is safe to
/// store as plain JSON. Kept in a separate file so the secret blob stays
/// secret-only.
/// </summary>
public interface IDeviceIdentityStore
{
    void Simpan(DeviceIdentity identiti);
    DeviceIdentity? Baca();
    void Padam();
}

public sealed class JsonDeviceIdentityStore : IDeviceIdentityStore
{
    private readonly string _laluan;

    public JsonDeviceIdentityStore() : this(LaluanLalai())
    {
    }

    public JsonDeviceIdentityStore(string laluan)
    {
        _laluan = laluan;
    }

    private static string LaluanLalai() => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "HadirDesktop", "device-identiti.json");

    public void Simpan(DeviceIdentity identiti)
    {
        var direktori = Path.GetDirectoryName(_laluan);
        if (!string.IsNullOrEmpty(direktori)) Directory.CreateDirectory(direktori);
        File.WriteAllText(_laluan, JsonSerializer.Serialize(identiti), Encoding.UTF8);
    }

    public DeviceIdentity? Baca()
    {
        try
        {
            if (!File.Exists(_laluan)) return null;
            return JsonSerializer.Deserialize<DeviceIdentity>(File.ReadAllText(_laluan, Encoding.UTF8));
        }
        catch
        {
            return null;
        }
    }

    public void Padam()
    {
        try
        {
            if (File.Exists(_laluan)) File.Delete(_laluan);
        }
        catch
        {
            // Best-effort only.
        }
    }
}
