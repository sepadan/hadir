using System;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace HadirDesktop;

/// <summary>
/// Thrown when the backend answered with <c>ok:false</c> and a "ciri
/// berbilang PC dilumpuhkan" reason — a DISTINCT outcome from every other RPC
/// failure so callers never confuse "feature off" with "rejected"/"offline".
/// </summary>
public sealed class PerantiDilumpuhkanException : Exception
{
    public PerantiDilumpuhkanException(string message) : base(message)
    {
    }
}

/// <summary>
/// Thrown when the backend rejects a call because this specific device has
/// been revoked (<c>nyahaktif</c>). Distinct from
/// <see cref="PerantiDilumpuhkanException"/> (the whole feature is OFF) so a
/// heartbeat loop can stop permanently and surface "revoked" to the user.
/// </summary>
public sealed class PerantiNyahaktifException : Exception
{
    public PerantiNyahaktifException(string message) : base(message)
    {
    }
}

/// <summary>
/// Narrow RPC surface the desktop panel needs, so tests can inject a fake
/// without a real <see cref="HttpClient"/>.
/// </summary>
public interface IDeviceRegistrationClient
{
    Task<PerantiKemampuan> ProbeKeupayaanAsync();
    Task<RekodPeranti> DaftarAsync(string kodDaftar, string idPeranti, string akaun, string nama, string rahsia);
    Task<JawapanDegup> DegupAsync(string idPeranti, string akaun, string rahsia);
    Task<JawapanKlaim> KlaimKepimpinanAsync(string idPeranti, string akaun, string rahsia);
    Task<RekodPeranti> NyahaktifPerantiAsync(string idPeranti, string akaun, string token);
    Task<System.Collections.Generic.IReadOnlyList<RekodPeranti>> SenaraiPerantiAdminAsync(string akaun, string token);
    Task<System.Collections.Generic.IReadOnlyList<StatusAwam>> StatusAwamAsync();
}

/// <summary>
/// RPC client for the HADIR multi-PC device registry backend
/// (<c>apps-script/HadirWeb.gs</c> "Peranti dan kepimpinan berbilang PC"
/// section), mirroring the same wire convention as
/// <c>hadir-pc/klien-peranti.mjs</c>: POST <c>{mode:'hadir', kaedah, argumen}</c>
/// with a browser User-Agent, response parsed as <c>{ok, hasil|ralat}</c>.
///
/// Read-only probing (<see cref="ProbeKeupayaanAsync"/>) is safe to call
/// speculatively; every OTHER method here is a real (or state-changing) RPC
/// and is NEVER called automatically by this class — no polling, no
/// heartbeat loop, no auto-retry on state-changing calls (mirrors the
/// no-auto-retry comment in klien-hadir.mjs: a retried register/claim could
/// double-submit against a single-use code or a fenced lease). The secret
/// (`rahsia`) is passed through to the request body only — it is never
/// logged, never included in an exception message, and never written
/// anywhere by this class.
/// </summary>
public sealed class DeviceRegistrationClient : IDeviceRegistrationClient
{
    private const string UserAgent =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

    private readonly HttpClient _http;
    private readonly string _apiUrl;

    public DeviceRegistrationClient(HttpClient http, string apiUrl)
    {
        _http = http;
        _apiUrl = apiUrl;
    }

    /// <summary>
    /// Read-only capability probe via <c>pcStatusAwam</c> (never gated by the
    /// feature flag on the backend, so this call alone cannot distinguish
    /// "off" from "on but empty" — it only tells us whether the backend knows
    /// the RPC at all). Never throws; unknown/network outcomes are treated as
    /// unsupported rather than fabricating success.
    /// </summary>
    public async Task<PerantiKemampuan> ProbeKeupayaanAsync()
    {
        try
        {
            var (ok, _, ralat) = await PanggilAsync("pcStatusAwam", Array.Empty<object>()).ConfigureAwait(false);
            if (ok) return PerantiKemampuan.Tersedia;
            return PerantiKemampuan.TiadaSokongan;
        }
        catch
        {
            return PerantiKemampuan.TiadaSokongan;
        }
    }

    public async Task<RekodPeranti> DaftarAsync(string kodDaftar, string idPeranti, string akaun, string nama, string rahsia)
    {
        var (ok, hasil, ralat) = await PanggilAsync("pcDaftarPeranti", new object[] { kodDaftar, idPeranti, akaun, nama, rahsia }).ConfigureAwait(false);
        if (!ok) throw KesalahanDaripadaRalat(ralat);
        return DeviceRegistryParsing.ParseRekodPeranti(hasil) ?? throw new InvalidOperationException("Bentuk balasan RekodPeranti tidak sah.");
    }

    public async Task<JawapanDegup> DegupAsync(string idPeranti, string akaun, string rahsia)
    {
        var (ok, hasil, ralat) = await PanggilAsync("pcDegup", new object[] { idPeranti, akaun, rahsia }).ConfigureAwait(false);
        if (!ok) throw KesalahanDaripadaRalat(ralat);
        return DeviceRegistryParsing.ParseJawapanDegup(hasil) ?? throw new InvalidOperationException("Bentuk balasan JawapanDegup tidak sah.");
    }

    public async Task<JawapanKlaim> KlaimKepimpinanAsync(string idPeranti, string akaun, string rahsia)
    {
        var (ok, hasil, ralat) = await PanggilAsync("pcKlaimKepimpinan", new object[] { idPeranti, akaun, rahsia }).ConfigureAwait(false);
        if (!ok) throw KesalahanDaripadaRalat(ralat);
        return DeviceRegistryParsing.ParseJawapanKlaim(hasil) ?? throw new InvalidOperationException("Bentuk balasan JawapanKlaim tidak sah.");
    }

    /// <summary>
    /// Admin-only revoke of a device (<c>pcNyahaktifPeranti</c>). The desktop
    /// installation itself never calls this (it has no admin token) — it is
    /// exercised by the admin web UI and by the fake-HTTP end-to-end test.
    /// </summary>
    public async Task<RekodPeranti> NyahaktifPerantiAsync(string idPeranti, string akaun, string token)
    {
        var (ok, hasil, ralat) = await PanggilAsync("pcNyahaktifPeranti", new object[] { idPeranti, akaun, token }).ConfigureAwait(false);
        if (!ok) throw KesalahanDaripadaRalat(ralat);
        return DeviceRegistryParsing.ParseRekodPeranti(hasil) ?? throw new InvalidOperationException("Bentuk balasan RekodPeranti tidak sah.");
    }

    public async Task<System.Collections.Generic.IReadOnlyList<RekodPeranti>> SenaraiPerantiAdminAsync(string akaun, string token)
    {
        var (ok, hasil, ralat) = await PanggilAsync("pcSenaraiPerantiAdmin", new object[] { akaun, token }).ConfigureAwait(false);
        if (!ok) throw KesalahanDaripadaRalat(ralat);
        return DeviceRegistryParsing.ParseSenaraiPerantiAdmin(hasil);
    }

    public async Task<System.Collections.Generic.IReadOnlyList<StatusAwam>> StatusAwamAsync()
    {
        var (ok, hasil, ralat) = await PanggilAsync("pcStatusAwam", Array.Empty<object>()).ConfigureAwait(false);
        if (!ok) throw KesalahanDaripadaRalat(ralat);
        return DeviceRegistryParsing.ParseStatusAwam(hasil);
    }

    private static Exception KesalahanDaripadaRalat(string ralat)
    {
        if (ralat.IndexOf("nyahaktif", StringComparison.OrdinalIgnoreCase) >= 0)
        {
            return new PerantiNyahaktifException(ralat);
        }
        if (ralat.IndexOf("dilumpuhkan", StringComparison.OrdinalIgnoreCase) >= 0)
        {
            return new PerantiDilumpuhkanException(ralat);
        }
        return new InvalidOperationException(string.IsNullOrEmpty(ralat) ? "Permintaan peranti PC gagal." : ralat);
    }

    private async Task<(bool ok, string hasil, string ralat)> PanggilAsync(string kaedah, object[] argumen)
    {
        var badan = JsonSerializer.Serialize(new { mode = "hadir", kaedah, argumen });
        using var request = new HttpRequestMessage(HttpMethod.Post, _apiUrl)
        {
            Content = new StringContent(badan, Encoding.UTF8, "text/plain"),
        };
        request.Headers.UserAgent.Clear();
        request.Headers.TryAddWithoutValidation("User-Agent", UserAgent);

        using var response = await _http.SendAsync(request).ConfigureAwait(false);
        var teks = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

        using var doc = JsonDocument.Parse(teks);
        var root = doc.RootElement;
        var ok = root.TryGetProperty("ok", out var okEl) && okEl.ValueKind == JsonValueKind.True;
        var ralat = root.TryGetProperty("ralat", out var ralatEl) && ralatEl.ValueKind == JsonValueKind.String
            ? ralatEl.GetString() ?? string.Empty
            : string.Empty;
        var hasil = root.TryGetProperty("hasil", out var hasilEl) ? hasilEl.GetRawText() : "null";
        return (ok, hasil, ralat);
    }
}

/// <summary>
/// Guards which endpoints a desktop installation is allowed to ENROLL against.
/// Real enrollment is only permitted against the known Apps Script Web App
/// pattern (<c>script.google.com</c> / <c>script.googleusercontent.com</c>);
/// loopback hosts are permitted for local fake/tests only. Everything else is
/// rejected up front so a mistyped or attacker-supplied endpoint can never
/// receive an enrollment code + device secret.
/// </summary>
public static class HadirEndpointValidator
{
    public static bool BolehDaftar(string url)
    {
        if (string.IsNullOrWhiteSpace(url)) return false;
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) return false;
        if (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp) return false;

        var hos = uri.Host;
        if (hos == "script.google.com" || hos.EndsWith(".googleusercontent.com", StringComparison.OrdinalIgnoreCase))
        {
            return uri.Scheme == Uri.UriSchemeHttps;
        }

        // Loopback only for local fake backends / tests.
        return uri.IsLoopback;
    }
}
