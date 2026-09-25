using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

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
/// HADIR Desktop's OWN backend configuration, in the same file formats the
/// companion engine used so a one-time byte copy (<see cref="MigrasiDataCompanion"/>)
/// carries it over unchanged:
///
///   * <c>rahsia.dat</c> — a DPAPI (CurrentUser, NULL optional entropy) blob
///     whose plaintext is the JSON <c>{rahsiaEnjin, klien:[...]}</c>
///     (<c>companion/src/simpanan.mjs</c>). The exact same DPAPI shape as
///     <see cref="DpapiKredensialIdMeStore"/>.
///   * <c>tetapan.json</c> — plaintext JSON carrying <c>apiUrl</c>
///     (<c>companion/src/tetapan.mjs</c>).
///
/// Both live in <c>%LOCALAPPDATA%/HadirDesktop/enjin/</c>
/// (<see cref="LaluanDataDesktop.DirEnjin"/>). The companion's folder is read
/// only by the migration, never by this store.
///
/// FAIL CLOSED, in every direction: a missing file, a blob that will not
/// decrypt, JSON that will not parse, an empty secret, or an <c>apiUrl</c> that
/// is not a complete HTTPS Apps Script Web App endpoint all yield <c>null</c>. There is
/// no plaintext fallback and no default URL — a corrupt config can never become
/// a submission, and a tampered <c>apiUrl</c> can never redirect the engine
/// secret to another host or a non-deployed path.
///
/// Settings edits preserve all other JSON properties and never touch pairings.
/// Neither the secret nor the URL is ever logged, returned in a status string,
/// or included in an exception message.
/// </summary>
public sealed class DpapiRahsiaEnjinStore : IRahsiaEnjinStore
{
    /// <summary>Stable deployed Web App host (redirect hosts are not base endpoints).</summary>
    public static readonly string[] HosApiDibenarkan = { "script.google.com" };

    private readonly string _laluanRahsia;
    private readonly string _laluanTetapan;
    private readonly string _laluanPenanda;
    private readonly string _laluanPenandaMigrasi;
    private readonly object _simpanLock = new();
    private readonly Action? _selepasPenandaDitulis;

    public DpapiRahsiaEnjinStore() : this(DirDataLalai())
    {
    }

    /// <summary>Test seam: point the store at an isolated temporary data dir.</summary>
    public DpapiRahsiaEnjinStore(string dirData)
    {
        _laluanRahsia = Path.Combine(dirData, "rahsia.dat");
        _laluanTetapan = Path.Combine(dirData, "tetapan.json");
        _laluanPenanda = Path.Combine(dirData, MigrasiDataCompanion.PenandaStoreBackend);
        _laluanPenandaMigrasi = Path.Combine(dirData, MigrasiDataCompanion.PenandaMigrasiBackend);
    }

    internal DpapiRahsiaEnjinStore(string dirData, Action selepasPenandaDitulis) : this(dirData)
    {
        _selepasPenandaDitulis = selepasPenandaDitulis;
    }

    /// <summary>Desktop-owned data dir (<c>%LOCALAPPDATA%/HadirDesktop/enjin</c>).</summary>
    public static string DirDataLalai() => LaluanDataDesktop.DirEnjin();

    /// <summary>Only the non-secret URL may be prefilled in a settings dialog.</summary>
    public string? BacaApiUrlUntukPaparan() => BacaApiUrl();

    /// <summary>
    /// Save a validated URL and optionally a new secret. Empty secret keeps the
    /// existing one. Existing files must parse/decrypt; never replace damage
    /// with defaults. Each file is atomically replaced on its own volume.
    /// </summary>
    public void Simpan(string apiUrl, string? rahsiaBaharu)
    {
        if (!SahkanApiUrl(apiUrl)) throw new InvalidOperationException("URL API mesti endpoint Apps Script Web App /macros/s/{id}/exec yang sah.");
        lock (_simpanLock)
        {
            JsonObject tetapan = BacaObjekJson(_laluanTetapan, dilindungi: false);
            JsonObject rahsia = BacaObjekJson(_laluanRahsia, dilindungi: true);
            var tukarRahsia = !string.IsNullOrEmpty(rahsiaBaharu);
            if (File.Exists(_laluanPenanda) && !tukarRahsia)
                throw new InvalidOperationException("Simpanan lalu belum selesai; masukkan semula rahsia enjin untuk memulihkan tetapan.");
            if (tukarRahsia && string.IsNullOrWhiteSpace(rahsiaBaharu))
                throw new InvalidOperationException("Rahsia enjin tidak boleh ruang kosong sahaja.");
            if (!tukarRahsia && (rahsia["rahsiaEnjin"] is not JsonValue nilai ||
                !nilai.TryGetValue<string>(out var lama) || string.IsNullOrEmpty(lama)))
                throw new InvalidOperationException("Rahsia enjin belum tersedia; isi rahsia baharu.");

            tetapan["apiUrl"] = apiUrl;
            if (tukarRahsia) rahsia["rahsiaEnjin"] = rahsiaBaharu;
            // Finish serialization and DPAPI protection before touching either
            // destination. A protection failure must leave both files intact.
            var tetapanBytes = Encoding.UTF8.GetBytes(tetapan.ToJsonString());
            var rahsiaBytes = tukarRahsia
                ? ProtectedData.Protect(Encoding.UTF8.GetBytes(rahsia.ToJsonString()), null,
                    DataProtectionScope.CurrentUser)
                : null;
            Directory.CreateDirectory(Path.GetDirectoryName(_laluanTetapan)!);
            // Two files cannot share one atomic rename. A durable marker makes
            // any crash or partial write fail closed on the next Desktop start.
            var penandaSediaAda = File.Exists(_laluanPenanda);
            File.WriteAllText(_laluanPenanda, "pending", Encoding.ASCII);
            var tetapanSudahDitulis = false;
            try
            {
                _selepasPenandaDitulis?.Invoke();
                TulisAtomik(_laluanTetapan, tetapanBytes);
                tetapanSudahDitulis = true;
                if (rahsiaBytes is not null) TulisAtomik(_laluanRahsia, rahsiaBytes);
                File.Delete(_laluanPenanda);
            }
            catch
            {
                // A failed first write leaves the previous pair intact. Once
                // settings moved, retain the marker until explicit recovery.
                if (!tetapanSudahDitulis && !penandaSediaAda) File.Delete(_laluanPenanda);
                throw;
            }
        }
    }

    /// <summary>
    /// PEMULIHAN EKSPLISIT oleh pemilik bagi fail backend Desktop yang rosak,
    /// separa, atau ditinggalkan oleh simpanan yang terputus. Tidak pernah
    /// dipanggil secara automatik, dan tidak pernah membaca atau mengimport
    /// data Companion — stor ini hanya mengenali folder Desktopnya sendiri.
    ///
    /// Syarat: URL Apps Script PENUH yang sah DAN rahsia enjin yang BARU
    /// dimasukkan (tiada "kekalkan rahsia lama"). Susunan:
    ///   1. sahkan input dan siapkan DPAPI sebelum menyentuh cakera;
    ///   2. salin fail sedia ada (termasuk penanda simpanan) ke folder
    ///      <c>sandaran-pemulihan-*</c> dan sahkan bait demi bait;
    ///   3. tulis penanda simpanan, ganti <c>tetapan.json</c> dan
    ///      <c>rahsia.dat</c> secara atomik;
    ///   4. baca semula pasangan itu dan bandingkan; hanya kemudian penanda
    ///      simpanan dibuang.
    /// Medan yang MASIH boleh dibaca (cth pasangan <c>klien</c>) dikekalkan.
    /// Penanda migrasi TIDAK disentuh: selagi ia wujud, <see cref="Baca"/> kekal
    /// null, tiada klien backend dalam proses ini, dan lancaran seterusnya yang
    /// memuktamadkan data Desktop yang sah ini.
    /// </summary>
    /// <returns>Nama folder sandaran (bukan rahsia).</returns>
    public string PulihkanGantiRosak(string apiUrl, string rahsiaBaharu)
    {
        if (!SahkanApiUrl(apiUrl)) throw new InvalidOperationException("URL API mesti endpoint Apps Script Web App /macros/s/{id}/exec yang sah.");
        if (string.IsNullOrWhiteSpace(rahsiaBaharu))
            throw new InvalidOperationException("Pemulihan memerlukan rahsia enjin yang dimasukkan semula.");

        lock (_simpanLock)
        {
            // Bahagian yang masih boleh dibaca dikekalkan; yang rosak diganti.
            JsonObject tetapan, rahsia;
            try { tetapan = BacaObjekJson(_laluanTetapan, dilindungi: false); } catch { tetapan = new JsonObject(); }
            try { rahsia = BacaObjekJson(_laluanRahsia, dilindungi: true); } catch { rahsia = new JsonObject(); }
            tetapan["apiUrl"] = apiUrl;
            rahsia["rahsiaEnjin"] = rahsiaBaharu;
            var tetapanBytes = Encoding.UTF8.GetBytes(tetapan.ToJsonString());
            var rahsiaBytes = ProtectedData.Protect(Encoding.UTF8.GetBytes(rahsia.ToJsonString()), null,
                DataProtectionScope.CurrentUser);

            var dir = Path.GetDirectoryName(_laluanTetapan)!;
            Directory.CreateDirectory(dir);

            // Sandaran DISAHKAN sebelum apa-apa diganti.
            var namaSandaran = "sandaran-pemulihan-" + DateTime.UtcNow.ToString("yyyyMMdd'T'HHmmss'Z'",
                System.Globalization.CultureInfo.InvariantCulture) + "-" + Guid.NewGuid().ToString("N")[..8];
            var dirSandaran = Path.Combine(dir, namaSandaran);
            Directory.CreateDirectory(dirSandaran);
            foreach (var sumber in new[] { _laluanTetapan, _laluanRahsia, _laluanPenanda })
            {
                if (!File.Exists(sumber)) continue;
                var asal = File.ReadAllBytes(sumber);
                var sasaran = Path.Combine(dirSandaran, Path.GetFileName(sumber));
                File.WriteAllBytes(sasaran, asal);
                if (!asal.AsSpan().SequenceEqual(File.ReadAllBytes(sasaran)))
                    throw new InvalidOperationException("Sandaran fail tetapan tidak dapat disahkan; tiada fail diganti.");
            }

            var penandaSediaAda = File.Exists(_laluanPenanda);
            File.WriteAllText(_laluanPenanda, "pending", Encoding.ASCII);
            var tetapanSudahDitulis = false;
            try
            {
                _selepasPenandaDitulis?.Invoke();
                TulisAtomik(_laluanTetapan, tetapanBytes);
                tetapanSudahDitulis = true;
                TulisAtomik(_laluanRahsia, rahsiaBytes);

                // Baca semula SEBELUM penanda dibuang; tidak sepadan = kekal gagal-tertutup.
                if (!string.Equals(BacaApiUrl(), apiUrl, StringComparison.Ordinal)
                    || !string.Equals(BacaRahsia(), rahsiaBaharu, StringComparison.Ordinal))
                    throw new InvalidOperationException("Tetapan yang dipulihkan tidak sepadan selepas dibaca semula; penanda dikekalkan.");
                File.Delete(_laluanPenanda);
            }
            catch
            {
                // Gagal sebelum penggantian pertama: fail lama kekal utuh, dan
                // penanda kekal seperti sebelum ini. Selepas itu: penanda kekal.
                if (!tetapanSudahDitulis && !penandaSediaAda) File.Delete(_laluanPenanda);
                throw;
            }
            return namaSandaran;
        }
    }

    private static JsonObject BacaObjekJson(string laluan, bool dilindungi)
    {
        if (!File.Exists(laluan)) return new JsonObject();
        try
        {
            var bytes = File.ReadAllBytes(laluan);
            if (dilindungi) bytes = ProtectedData.Unprotect(bytes, null, DataProtectionScope.CurrentUser);
            var json = Encoding.UTF8.GetString(bytes).TrimStart('\uFEFF');
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Object) throw new JsonException();
            var seen = new System.Collections.Generic.HashSet<string>(StringComparer.Ordinal);
            foreach (var property in doc.RootElement.EnumerateObject())
                if (!seen.Add(property.Name)) throw new JsonException();
            return JsonNode.Parse(json) as JsonObject ?? throw new JsonException();
        }
        catch
        {
            // Never include file contents, path, URL, or DPAPI error text.
            throw new InvalidOperationException("Fail tetapan sedia ada rosak atau tidak dapat dibaca; simpanan dibatalkan. " +
                "Gunakan \"Pulihkan tetapan rosak\" dengan URL dan rahsia enjin yang dimasukkan semula.");
        }
    }

    private static void TulisAtomik(string laluan, byte[] bytes)
    {
        var sementara = laluan + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            File.WriteAllBytes(sementara, bytes);
            File.Move(sementara, laluan, overwrite: true);
        }
        finally
        {
            if (File.Exists(sementara)) File.Delete(sementara);
        }
    }

    /// <summary>
    /// Null juga apabila penanda migrasi Companion masih wujud: pasangan yang
    /// disalin tetapi belum dimuktamadkan tidak pernah diaktifkan.
    /// </summary>
    public TetapanBackendEnjin? Baca()
    {
        if (File.Exists(_laluanPenandaMigrasi)) return null;
        return BacaPasangan();
    }

    /// <summary>
    /// Bacaan pasangan TANPA semakan penanda migrasi — untuk pengesahan salinan
    /// oleh <see cref="MigrasiDataCompanion"/> sahaja. Tidak boleh dipakai untuk
    /// membina klien.
    /// </summary>
    internal TetapanBackendEnjin? BacaPasangan()
    {
        if (File.Exists(_laluanPenanda)) return null;
        var rahsia = BacaRahsia();
        if (string.IsNullOrEmpty(rahsia)) return null;

        var apiUrl = BacaApiUrl();
        if (apiUrl is null) return null;

        return new TetapanBackendEnjin(apiUrl, rahsia);
    }

    public StatusRahsiaEnjin Status()
    {
        if (File.Exists(_laluanPenandaMigrasi))
            return new StatusRahsiaEnjin { Sebab = "Migrasi backend daripada Companion belum dimuktamadkan; tiada penghantaran." };
        if (File.Exists(_laluanPenanda))
            return new StatusRahsiaEnjin { Sebab = "Simpanan tetapan tempatan belum selesai; tiada penghantaran." };
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
            ? (apiOk ? "" : "apiUrl dalam tetapan.json tiada atau bukan endpoint Apps Script Web App yang sah; tiada penghantaran.")
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
    /// PURE reader + validator of <c>tetapan.json</c>: a full deployed Web App
    /// endpoint, with HTTPS, safe deployment ID and no extra URL components. Anything
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

    /// <summary>Accept only a complete deployed Apps Script Web App endpoint.</summary>
    public static bool SahkanApiUrl(string? nilai)
    {
        if (string.IsNullOrWhiteSpace(nilai)) return false;
        if (!Uri.TryCreate(nilai, UriKind.Absolute, out var u)) return false;
        if (u.Scheme != Uri.UriSchemeHttps) return false;
        if (!string.IsNullOrEmpty(u.UserInfo)) return false;
        if (!u.IsDefaultPort || !string.Equals(u.Host, "script.google.com", StringComparison.OrdinalIgnoreCase))
            return false;
        // Match the original input: Uri normalization must not turn an unsafe
        // encoded/whitespace path into an apparently valid deployment ID.
        return System.Text.RegularExpressions.Regex.IsMatch(nilai,
            @"\Ahttps://script\.google\.com(?::443)?/macros/s/[A-Za-z0-9_-]+/exec\z",
            System.Text.RegularExpressions.RegexOptions.CultureInvariant);
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
