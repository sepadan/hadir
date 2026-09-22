using System;
using System.Diagnostics;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace HadirDesktop;

/// <summary>
/// One idMe credential: the owner's idMe user id (No. Kad Pengenalan), the
/// password, and the anti-phishing "Kata Kunci Keselamatan" phrase. This is the
/// EXACT on-disk shape of the companion engine's shared credential vault
/// (<c>companion/src/kredensial.mjs</c>), serialized as JSON with the same
/// camelCase field names. The password/phrase never leave this object's own
/// lifetime in any log, status string, or UI surface.
/// </summary>
public sealed record KredensialIdMe
{
    [JsonPropertyName("pengguna")]
    public string Pengguna { get; init; } = "";

    [JsonPropertyName("kataLaluan")]
    public string KataLaluan { get; init; } = "";

    [JsonPropertyName("kunciKeselamatan")]
    public string KunciKeselamatan { get; init; } = "";
}

/// <summary>
/// Read-only credential status for the settings UI. Carries ONLY booleans and a
/// masked user label (<c>8***</c>) — never the password or phrase value.
/// </summary>
public sealed record KredensialStatus
{
    public bool Ada { get; init; }
    public bool Rosak { get; init; }
    public string PenggunaSamar { get; init; } = "";
    public bool KunciAda { get; init; }
}

/// <summary>Shared idMe credential store (read/write the SAME DPAPI entry as the companion).</summary>
public interface IKredensialIdMeStore
{
    /// <summary>Persist the credential. Throws if any field is missing. Returns no value.</summary>
    void Simpan(string pengguna, string kataLaluan, string kunciKeselamatan);

    /// <summary>
    /// Full credential object (plaintext). INTERNAL ONLY — used exclusively by the
    /// auto-login driver to type the credential into the idMe page. Never exposed
    /// through any status/UI/log path.
    /// </summary>
    KredensialIdMe? Baca();

    /// <summary>Never-throwing status; never exposes a value.</summary>
    KredensialStatus Status();

    /// <summary>Existence check WITHOUT decrypting or loading the value into memory.</summary>
    bool Ada();

    void Padam();
}

/// <summary>
/// DPAPI (CurrentUser) credential store, SHARED with the companion engine.
///
/// The companion (Node) writes <c>kredensial.dat</c> under
/// <c>LocalApplicationData/HADIR-MOEIS-Companion/</c> using PowerShell
/// <c>[System.Security.Cryptography.ProtectedData]::Protect($b, $null,
/// [DataProtectionScope]::CurrentUser)</c> — i.e. DPAPI CurrentUser with NULL
/// optional entropy. This store reads/writes the SAME file with .NET 8
/// <see cref="ProtectedData"/> passing <c>null</c> entropy, so the two stores
/// are byte-compatible (verified empirically against the live blob: decrypts,
/// JSON parses, all three fields present). There is NO plaintext fallback: a
/// failed unprotect/parse yields <c>null</c> / <c>Rosak=true</c>, never a guess.
/// </summary>
public sealed class DpapiKredensialIdMeStore : IKredensialIdMeStore
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    private readonly string _laluan;

    public DpapiKredensialIdMeStore() : this(LaluanLalai())
    {
    }

    /// <summary>Test seam: point the store at an isolated temporary file.</summary>
    public DpapiKredensialIdMeStore(string laluan)
    {
        _laluan = laluan;
    }

    /// <summary>
    /// Companion's shared data dir + file (companion/src/tetapan.mjs
    /// NAMA_FOLDER_DATA = "HADIR-MOEIS-Companion"; companion/src/kredensial.mjs).
    /// </summary>
    private static string LaluanLalai() => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "HADIR-MOEIS-Companion", "kredensial.dat");

    public void Simpan(string pengguna, string kataLaluan, string kunciKeselamatan)
    {
        if (string.IsNullOrWhiteSpace(pengguna) || string.IsNullOrEmpty(kataLaluan) || string.IsNullOrWhiteSpace(kunciKeselamatan))
        {
            // Message names WHICH field is missing, never any value.
            throw new ArgumentException("Pengguna, kata laluan dan frasa kunci keselamatan idMe diperlukan.");
        }

        var objek = new KredensialIdMe
        {
            Pengguna = pengguna.Trim(),
            KataLaluan = kataLaluan,
            KunciKeselamatan = kunciKeselamatan.Trim(),
        };
        var json = JsonSerializer.Serialize(objek, JsonOpts);
        var raw = Encoding.UTF8.GetBytes(json);

        // NULL optional entropy == the companion's PowerShell `$null` — same blob.
        var dilindungi = ProtectedData.Protect(raw, null, DataProtectionScope.CurrentUser);

        var direktori = Path.GetDirectoryName(_laluan);
        if (!string.IsNullOrEmpty(direktori)) Directory.CreateDirectory(direktori);

        // Atomic write (temp + move), mirroring the companion's tmp+rename.
        var sementara = _laluan + ".tmp-" + Environment.ProcessId + "-" + DateTime.UtcNow.Ticks;
        File.WriteAllBytes(sementara, dilindungi);
        File.Move(sementara, _laluan, overwrite: true);

        if (!string.IsNullOrEmpty(direktori)) KunciFolder(direktori);
    }

    public KredensialIdMe? Baca()
    {
        try
        {
            if (!File.Exists(_laluan)) return null;
            var dilindungi = File.ReadAllBytes(_laluan);
            var raw = ProtectedData.Unprotect(dilindungi, null, DataProtectionScope.CurrentUser);
            return JsonSerializer.Deserialize<KredensialIdMe>(Encoding.UTF8.GetString(raw), JsonOpts);
        }
        catch
        {
            // Strict no-fallback: any unprotect/parse failure -> null.
            return null;
        }
    }

    public KredensialStatus Status()
    {
        if (!File.Exists(_laluan))
        {
            return new KredensialStatus { Ada = false, Rosak = false, PenggunaSamar = "", KunciAda = false };
        }

        var k = Baca();
        if (k is null)
        {
            // File exists but cannot be decrypted/parsed: report corrupt so the
            // UI can offer delete — never a value.
            return new KredensialStatus { Ada = true, Rosak = true, PenggunaSamar = "", KunciAda = false };
        }

        return new KredensialStatus
        {
            Ada = true,
            Rosak = false,
            PenggunaSamar = SamarkanPengguna(k.Pengguna),
            KunciAda = !string.IsNullOrEmpty(k.KunciKeselamatan),
        };
    }

    public bool Ada() => File.Exists(_laluan);

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

    /// <summary>First character + "***" only — never reveals the idMe user id.</summary>
    public static string SamarkanPengguna(string pengguna)
    {
        var s = (pengguna ?? "").Trim();
        return s.Length > 0 ? s[0] + "***" : "";
    }

    /// <summary>
    /// Best-effort icacls lock to the current Windows account, mirroring the
    /// companion's <c>kunciFolderIcacls</c>. Failure never blocks the store (the
    /// blob is already DPAPI-protected), and never leaks anything to logs.
    /// </summary>
    private static void KunciFolder(string direktori)
    {
        var pengguna = Environment.UserName;
        if (string.IsNullOrEmpty(pengguna)) return;
        try
        {
            var psi = new ProcessStartInfo("icacls.exe")
            {
                ArgumentList = { direktori, "/inheritance:r", "/grant:r", pengguna + ":(OI)(CI)F" },
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            };
            using var p = Process.Start(psi);
            p?.WaitForExit(5000);
        }
        catch
        {
            // icacls is not required for core function; never leak to console/log.
        }
    }
}
