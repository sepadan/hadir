using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace HadirDesktop;

/// <summary>
/// Everything needed to talk to the HADIR backend directly: the Apps Script Web
/// App URL (from the plaintext <c>tetapan.json</c>) and the engine secret (from
/// the DPAPI-protected <c>rahsia.dat</c>). Obtained together or not at all — a
/// URL without a secret cannot authenticate and a secret without a URL has
/// nowhere safe to go.
/// </summary>
public sealed record TetapanBackendEnjin(string ApiUrl, string RahsiaEnjin);

/// <summary>
/// Read-only status for any UI/log surface: BOOLEANS ONLY. Neither the secret
/// nor the URL is ever exposed through this record.
/// </summary>
public sealed record StatusRahsiaEnjin
{
    public bool FailRahsiaAda { get; init; }
    public bool RahsiaBolehDibaca { get; init; }
    public bool ApiUrlSah { get; init; }
    /// <summary>Why it is not usable — never contains a secret or a URL.</summary>
    public string Sebab { get; init; } = "";

    public bool Sedia => FailRahsiaAda && RahsiaBolehDibaca && ApiUrlSah;
}

/// <summary>Source of the backend endpoint + engine secret. Fails CLOSED.</summary>
public interface IRahsiaEnjinStore
{
    /// <summary>
    /// The endpoint + secret, or <c>null</c> when anything at all is missing,
    /// unreadable or not allowlisted. <c>null</c> MUST mean "send nothing".
    /// </summary>
    TetapanBackendEnjin? Baca();

    /// <summary>Never-throwing status; never exposes a value.</summary>
    StatusRahsiaEnjin Status();
}

/// <summary>
/// Reads the companion engine's OWN stored configuration so the desktop app can
/// take the engine's place on the wire:
///
///   * <c>rahsia.dat</c> — a DPAPI (CurrentUser, NULL optional entropy) blob
///     whose plaintext is the JSON <c>{rahsiaEnjin, klien:[...]}</c>
///     (<c>companion/src/simpanan.mjs</c>). The exact same DPAPI shape as
///     <see cref="DpapiKredensialIdMeStore"/>, which is already proven
///     byte-compatible with the Node side on this machine.
///   * <c>tetapan.json</c> — plaintext JSON carrying <c>apiUrl</c>
///     (<c>companion/src/tetapan.mjs</c>).
///
/// Both live in <c>%LOCALAPPDATA%/HADIR-MOEIS-Companion/</c>.
///
/// FAIL CLOSED, in every direction: a missing file, a blob that will not
/// decrypt, JSON that will not parse, an empty secret, or an <c>apiUrl</c> that
/// is not an allowlisted HTTPS Apps Script host all yield <c>null</c>. There is
/// no plaintext fallback and no default URL — a corrupt config can never become
/// a submission, and a tampered <c>apiUrl</c> can never redirect the engine
/// secret to another host (the reason <c>sahkanApiUrl</c> exists on the Node
/// side; this is a faithful port of it).
///
/// This class READS only. It never writes, never re-keys, and never pairs.
/// Neither the secret nor the URL is ever logged, returned in a status string,
/// or included in an exception message.
/// </summary>
public sealed class DpapiRahsiaEnjinStore : IRahsiaEnjinStore
{
    /// <summary>Port of <c>HOS_API_DIBENARKAN</c> in companion/src/tetapan.mjs.</summary>
    public static readonly string[] HosApiDibenarkan = { "script.google.com", "script.googleusercontent.com" };

    private readonly string _laluanRahsia;
    private readonly string _laluanTetapan;

    public DpapiRahsiaEnjinStore() : this(DirDataLalai())
    {
    }

    /// <summary>Test seam: point the store at an isolated temporary data dir.</summary>
    public DpapiRahsiaEnjinStore(string dirData)
    {
        _laluanRahsia = Path.Combine(dirData, "rahsia.dat");
        _laluanTetapan = Path.Combine(dirData, "tetapan.json");
    }

    /// <summary>companion/src/tetapan.mjs <c>NAMA_FOLDER_DATA</c>.</summary>
    public static string DirDataLalai() => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "HADIR-MOEIS-Companion");

    public TetapanBackendEnjin? Baca()
    {
        var rahsia = BacaRahsia();
        if (string.IsNullOrEmpty(rahsia)) return null;

        var apiUrl = BacaApiUrl();
        if (apiUrl is null) return null;

        return new TetapanBackendEnjin(apiUrl, rahsia);
    }

    public StatusRahsiaEnjin Status()
    {
        var ada = File.Exists(_laluanRahsia);
        if (!ada)
        {
            return new StatusRahsiaEnjin
            {
                FailRahsiaAda = false,
                Sebab = "Fail rahsia enjin tiada pada PC ini; tiada penghantaran.",
            };
        }

        var rahsiaOk = !string.IsNullOrEmpty(BacaRahsia());
        var apiOk = BacaApiUrl() is not null;

        var sebab = rahsiaOk
            ? (apiOk ? "" : "apiUrl dalam tetapan.json tiada atau bukan hos Apps Script yang dibenarkan; tiada penghantaran.")
            : "Fail rahsia enjin tidak dapat dinyahsulit/dibaca pada akaun Windows ini; tiada penghantaran.";

        return new StatusRahsiaEnjin
        {
            FailRahsiaAda = true,
            RahsiaBolehDibaca = rahsiaOk,
            ApiUrlSah = apiOk,
            Sebab = sebab,
        };
    }

    /// <summary>The engine secret, or <c>null</c>. NEVER logged by any caller.</summary>
    private string? BacaRahsia()
    {
        try
        {
            if (!File.Exists(_laluanRahsia)) return null;
            var dilindungi = File.ReadAllBytes(_laluanRahsia);
            // NULL optional entropy == the companion's PowerShell `$null`.
            var mentah = ProtectedData.Unprotect(dilindungi, null, DataProtectionScope.CurrentUser);
            return AmbilRahsiaEnjin(Encoding.UTF8.GetString(mentah));
        }
        catch
        {
            // Strict no-fallback: unprotect/parse failure -> null (fail closed).
            return null;
        }
    }

    /// <summary>
    /// PURE reader of the decrypted <c>rahsia.dat</c> plaintext: takes ONLY the
    /// <c>rahsiaEnjin</c> string and ignores everything else in the blob (the
    /// <c>klien</c> pairing array is none of this app's business).
    /// </summary>
    public static string? AmbilRahsiaEnjin(string? jsonNyahsulit)
    {
        if (string.IsNullOrWhiteSpace(jsonNyahsulit)) return null;
        try
        {
            using var doc = JsonDocument.Parse(jsonNyahsulit);
            if (doc.RootElement.ValueKind != JsonValueKind.Object) return null;
            if (!doc.RootElement.TryGetProperty("rahsiaEnjin", out var el)) return null;
            if (el.ValueKind != JsonValueKind.String) return null;
            var nilai = el.GetString();
            return string.IsNullOrEmpty(nilai) ? null : nilai;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private string? BacaApiUrl()
    {
        try
        {
            if (!File.Exists(_laluanTetapan)) return null;
            return AmbilApiUrl(File.ReadAllText(_laluanTetapan, Encoding.UTF8));
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// PURE reader + validator of <c>tetapan.json</c>. Port of
    /// <c>sahkanApiUrl</c>: HTTPS, no userinfo, host on the allowlist. Anything
    /// else is <c>null</c> — the engine secret is never sent to an unknown host.
    /// </summary>
    public static string? AmbilApiUrl(string? jsonTetapan)
    {
        if (string.IsNullOrWhiteSpace(jsonTetapan)) return null;

        string? mentah;
        try
        {
            using var doc = JsonDocument.Parse(jsonTetapan);
            if (doc.RootElement.ValueKind != JsonValueKind.Object) return null;
            if (!doc.RootElement.TryGetProperty("apiUrl", out var el) || el.ValueKind != JsonValueKind.String) return null;
            mentah = el.GetString();
        }
        catch (JsonException)
        {
            return null;
        }

        return SahkanApiUrl(mentah) ? mentah : null;
    }

    /// <summary>Faithful port of <c>sahkanApiUrl</c> (companion/src/tetapan.mjs).</summary>
    public static bool SahkanApiUrl(string? nilai)
    {
        if (string.IsNullOrWhiteSpace(nilai)) return false;
        if (!Uri.TryCreate(nilai, UriKind.Absolute, out var u)) return false;
        if (u.Scheme != Uri.UriSchemeHttps) return false;
        if (!string.IsNullOrEmpty(u.UserInfo)) return false;
        foreach (var hos in HosApiDibenarkan)
        {
            if (string.Equals(u.Host, hos, StringComparison.OrdinalIgnoreCase)) return true;
        }
        return false;
    }
}

/// <summary>
/// The claim OWNER id this PC uses with <c>moeisJobKlaim</c> /
/// <c>moeisJobLepas</c> / <c>moeisJobSelesai</c>.
///
/// It MUST be stable across restarts — the backend lets the SAME owner re-claim
/// a task it left in <c>sedang_dihantar</c> immediately, while a different owner
/// must wait for the 15-minute lease to expire (see <c>hadirMoeisJobKlaim_</c>).
/// A fresh id on every launch would therefore strand the app's own interrupted
/// task for a quarter of an hour.
///
/// Source order:
///   1. the multi-PC enrollment device id, when this PC is enrolled — one
///      identity for the machine rather than two;
///   2. otherwise a locally generated random id persisted in
///      <c>%LOCALAPPDATA%/HadirDesktop/id-pemilik.json</c>, mirroring the
///      companion's own <c>id-enjin.json</c>.
///
/// The id is an opaque random value: not a secret, but also not a serial, a
/// username, or anything else identifying a person.
/// </summary>
public sealed class PemilikTugasanStore
{
    private readonly IDeviceIdentityStore? _identiti;
    private readonly string _laluan;

    public PemilikTugasanStore(IDeviceIdentityStore? identiti = null, string? laluan = null)
    {
        _identiti = identiti;
        _laluan = laluan ?? LaluanLalai();
    }

    private static string LaluanLalai() => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "HadirDesktop", "id-pemilik.json");

    /// <summary>
    /// The stable owner id, or an EMPTY string when one could neither be read
    /// nor persisted. Empty means "do not claim" — an owner id that does not
    /// survive a restart is worse than none.
    /// </summary>
    public string Dapatkan()
    {
        try
        {
            var identiti = _identiti?.Baca();
            if (identiti is not null && !string.IsNullOrWhiteSpace(identiti.IdPeranti))
            {
                return identiti.IdPeranti.Trim();
            }
        }
        catch
        {
            // Fall through to the local id.
        }

        try
        {
            if (File.Exists(_laluan))
            {
                var sedia = BacaId(File.ReadAllText(_laluan, Encoding.UTF8));
                if (!string.IsNullOrEmpty(sedia)) return sedia!;
            }

            var baharu = "pc-" + Guid.NewGuid().ToString("N");
            var direktori = Path.GetDirectoryName(_laluan);
            if (!string.IsNullOrEmpty(direktori)) Directory.CreateDirectory(direktori);
            File.WriteAllText(_laluan, JsonSerializer.Serialize(new { idPemilik = baharu }), Encoding.UTF8);
            return baharu;
        }
        catch
        {
            // Could not persist: return empty rather than a per-run id that
            // would strand this PC's own tasks behind a 15-minute lease.
            return "";
        }
    }

    /// <summary>PURE reader for the persisted owner-id file.</summary>
    public static string? BacaId(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Object) return null;
            if (!doc.RootElement.TryGetProperty("idPemilik", out var el) || el.ValueKind != JsonValueKind.String) return null;
            var nilai = (el.GetString() ?? "").Trim();
            return nilai.Length == 0 ? null : nilai;
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
