using System;
using System.Collections.Generic;
using System.Globalization;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace HadirDesktop;

/// <summary>
/// Result of ONE demand probe: does HADIR have an unfinished MOEIS task TODAY?
///
/// Three honest outcomes, never a guess:
///   * <see cref="AdaKerja"/> true  — at least one task with status
///     menunggu/sedang_dihantar/tersimpan dated TODAY;
///   * <see cref="AdaKerja"/> false + <see cref="EnjinBolehDicapai"/> true
///     — the engine answered and there is genuinely nothing to send;
///   * <see cref="EnjinBolehDicapai"/> false — demand could NOT be established
///     (engine not running, nonce rejected, unreadable body). This is reported
///     as its own state so a dead/unreadable engine can never be mistaken for
///     "no work" and can never be mistaken for "there IS work".
/// </summary>
public sealed record PermintaanKerja(bool AdaKerja, bool EnjinBolehDicapai, string Sebab, int BilanganKerja = 0)
{
    public static PermintaanKerja Tiada(string sebab) => new(false, true, sebab);
    public static PermintaanKerja TidakPasti(string sebab) => new(false, false, sebab);
    public static PermintaanKerja Ada(int bilangan, string sebab) => new(true, true, sebab, bilangan);
}

/// <summary>
/// The ONE demand seam. Implementations answer read-only: no mutation, no
/// credential, no portal navigation, no login.
/// </summary>
public interface IKerjaHariIniSource
{
    Task<PermintaanKerja> SemakAsync(CancellationToken ct = default);
}

/// <summary>
/// Read-only demand probe against the LOCAL companion engine, using the SAME
/// authenticated loopback path as <see cref="LoopbackEngineStatusSource"/>:
///
///   1. GET {base}/ -> 302 to <c>/?n=&lt;nonce&gt;</c>. The nonce is read from the
///      Location header WITHOUT following the redirect, through the SAME
///      redirect allowlist (<see cref="LoopbackEngineStatusSource.TryGetNonceFromRedirect"/>);
///      it is never logged and never surfaced in any returned string.
///   2. GET {base}/api/kerja with header <c>X-HADIR-Lokal: &lt;nonce&gt;</c>.
///
/// `/api/kerja` is NOT one of the companion's `/api/lokal/*` routes, so the
/// loopback UI Origin is not an allowed Origin for it; the request therefore
/// carries the nonce header and NO Origin header (companion/src/server.mjs:
/// a request without Origin but with a matching X-HADIR-Lokal is accepted).
///
/// The endpoint only ever LISTED jobs (`kerjaSenaraiDisensor`) and needs no
/// engine secret FROM US: this client never reads, writes or touches the engine
/// secret, never pairs, and never mutates anything.
///
/// Every failure is classified and returned as a reason — this method never
/// throws to the caller (cancellation aside) and NEVER guesses "ada kerja".
/// </summary>
public sealed class LoopbackKerjaHariIniSource : IKerjaHariIniSource, IDisposable
{
    /// <summary>The ONLY statuses that mean "belum siap" for today's attendance.</summary>
    public static readonly IReadOnlySet<string> StatusBelumSiap =
        new HashSet<string>(StringComparer.Ordinal) { "menunggu", "sedang_dihantar", "tersimpan" };

    private readonly Uri _baseUri;
    private readonly HttpClient _http;
    private readonly Func<DateTime> _jam;

    public LoopbackKerjaHariIniSource(string? baseUrl = null, TimeSpan? timeout = null, Func<DateTime>? jam = null)
    {
        _baseUri = new Uri(baseUrl ?? EngineEndpoints.BaseUrl);
        _jam = jam ?? (() => DateTime.Now);
        var handler = new HttpClientHandler { AllowAutoRedirect = false };
        _http = new HttpClient(handler) { Timeout = timeout ?? TimeSpan.FromSeconds(15) };
    }

    /// <summary>Local date (the PC's own date) as the backend's yyyy-MM-dd key.</summary>
    public string TarikhHariIni() => _jam().ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    public async Task<PermintaanKerja> SemakAsync(CancellationToken ct = default)
    {
        var hariIni = TarikhHariIni();

        // 1. Nonce handshake (same allowlist as the status source).
        string nonce;
        try
        {
            using var handshake = await _http.GetAsync(new Uri(_baseUri, EngineEndpoints.SettingsPath), ct).ConfigureAwait(false);

            if (handshake.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
            {
                return PermintaanKerja.TidakPasti(
                    "Enjin menolak permintaan tempatan (401/403 pada handshake nonce); permintaan kerja tidak dihantar.");
            }

            var location = handshake.Headers.Location?.ToString();
            if (location is null || !LoopbackEngineStatusSource.TryGetNonceFromRedirect(_baseUri, location, out nonce))
            {
                return PermintaanKerja.TidakPasti(
                    "Enjin tidak memberi alihan nonce yang boleh dipercayai; permintaan kerja tidak dihantar.");
            }
        }
        catch (Exception ex) when (IsCancellation(ex, ct))
        {
            throw;
        }
        catch (Exception ex) when (IsTimeout(ex, ct))
        {
            return PermintaanKerja.TidakPasti("Masa tamat semasa menghubungi enjin tempatan; permintaan kerja tidak dihantar.");
        }
        catch (Exception ex) when (IsOffline(ex))
        {
            return PermintaanKerja.TidakPasti(
                "Enjin tempatan tidak berjalan pada " + _baseUri.GetLeftPart(UriPartial.Authority) + ".");
        }
        catch (Exception ex)
        {
            // Anything else (DNS/socket failures other than the ones classified
            // above, a torn connection, a disposed client): the contract is that
            // demand is UNCERTAIN, never "ada kerja" and never a thrown task.
            // Only the exception TYPE is reported — a message could echo the URL.
            return PermintaanKerja.TidakPasti(
                "Ralat tidak dijangka semasa menghubungi enjin tempatan (" + ex.GetType().Name + "); deman tidak dapat dipastikan.");
        }

        // 2. Read-only job list. Nonce header only — no Origin (see class note).
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, new Uri(_baseUri, EngineEndpoints.KerjaPath));
            request.Headers.Add("X-HADIR-Lokal", nonce);

            using var response = await _http.SendAsync(request, ct).ConfigureAwait(false);

            if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
            {
                return PermintaanKerja.TidakPasti(
                    "Enjin menolak permintaan senarai kerja (401/403); deman tidak dapat dipastikan.");
            }

            if (!response.IsSuccessStatusCode)
            {
                return PermintaanKerja.TidakPasti(
                    "Enjin membalas HTTP " + (int)response.StatusCode + " untuk senarai kerja; deman tidak dapat dipastikan.");
            }

            var body = await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
            var bilangan = KiraKerjaBelumSiap(body, hariIni);
            if (bilangan is null)
            {
                return PermintaanKerja.TidakPasti(
                    "Balasan enjin untuk senarai kerja tidak dapat dibaca (JSON tidak dijangka); deman tidak dapat dipastikan.");
            }

            var nota = BacaNota(body);
            if (bilangan.Value == 0)
            {
                var sebab = "Tiada tugasan MOEIS belum siap untuk " + hariIni +
                            " (status menunggu/sedang_dihantar/tersimpan).";
                if (!string.IsNullOrEmpty(nota)) sebab += " Nota enjin: " + nota;
                return PermintaanKerja.Tiada(sebab);
            }

            return PermintaanKerja.Ada(bilangan.Value,
                bilangan.Value + " tugasan MOEIS belum siap untuk " + hariIni +
                " (menunggu/sedang_dihantar/tersimpan) — enjin boleh dihubungi.");
        }
        catch (Exception ex) when (IsCancellation(ex, ct))
        {
            throw;
        }
        catch (Exception ex) when (IsTimeout(ex, ct))
        {
            return PermintaanKerja.TidakPasti("Masa tamat semasa membaca senarai kerja enjin; deman tidak dapat dipastikan.");
        }
        catch (Exception ex) when (IsOffline(ex))
        {
            return PermintaanKerja.TidakPasti(
                "Sambungan ke enjin tempatan terputus semasa membaca senarai kerja.");
        }
        catch (Exception ex)
        {
            // See the handshake note: uncertain, never "ada kerja", never thrown.
            return PermintaanKerja.TidakPasti(
                "Ralat tidak dijangka semasa membaca senarai kerja enjin (" + ex.GetType().Name + "); deman tidak dapat dipastikan.");
        }
    }

    /// <summary>
    /// PURE counter: how many entries in the engine's <c>/api/kerja</c> body are
    /// (a) status menunggu / sedang_dihantar / tersimpan AND (b) dated today.
    /// Returns <c>null</c> when the body is not the expected JSON shape — the
    /// caller MUST treat that as "tidak dapat dipastikan", never as zero work.
    /// The envelope's <c>ok</c> flag must be the boolean <c>true</c>: an error
    /// envelope (<c>ok</c> false/absent/non-boolean) is NOT an answer about the
    /// queue, so it is unreadable rather than "no work" — a silently zeroed
    /// demand signal would be far worse than an honest "unknown".
    /// </summary>
    public static int? KiraKerjaBelumSiap(string? badanJson, string tarikhHariIni)
    {
        if (string.IsNullOrWhiteSpace(badanJson)) return null;

        JsonDocument doc;
        try
        {
            doc = JsonDocument.Parse(badanJson);
        }
        catch (JsonException)
        {
            return null;
        }

        using (doc)
        {
            if (doc.RootElement.ValueKind != JsonValueKind.Object) return null;

            // An error envelope is not an answer about the queue: `ok` must be
            // the boolean true (companion/src/server.mjs answers HTTP 200 with
            // `ok:true` on its success paths, and `ok:false` only with an HTTP
            // error). Anything else is unreadable, never "no work".
            if (!doc.RootElement.TryGetProperty("ok", out var ok) || ok.ValueKind != JsonValueKind.True)
            {
                return null;
            }

            if (!doc.RootElement.TryGetProperty("senarai", out var senarai) || senarai.ValueKind != JsonValueKind.Array)
            {
                return null;
            }

            var bilangan = 0;
            foreach (var job in senarai.EnumerateArray())
            {
                if (job.ValueKind != JsonValueKind.Object) continue;

                var status = BacaTeks(job, "status");
                if (!StatusBelumSiap.Contains(status)) continue;

                if (!TarikhSama(BacaTeks(job, "tarikhIso"), tarikhHariIni)) continue;
                bilangan++;
            }

            return bilangan;
        }
    }

    /// <summary>Best-effort, non-secret <c>nota</c> from the engine (e.g. "Rahsia enjin belum ditetapkan").</summary>
    public static string BacaNota(string? badanJson)
    {
        if (string.IsNullOrWhiteSpace(badanJson)) return string.Empty;
        try
        {
            using var doc = JsonDocument.Parse(badanJson);
            if (doc.RootElement.ValueKind != JsonValueKind.Object) return string.Empty;
            return BacaTeks(doc.RootElement, "nota");
        }
        catch (JsonException)
        {
            return string.Empty;
        }
    }

    /// <summary>yyyy-MM-dd comparison, ordinal, first 10 chars only.</summary>
    private static bool TarikhSama(string tarikhIso, string tarikhHariIni)
    {
        if (tarikhIso.Length < 10 || tarikhHariIni.Length < 10) return false;
        return string.Equals(tarikhIso[..10], tarikhHariIni[..10], StringComparison.Ordinal);
    }

    private static string BacaTeks(JsonElement obj, string nama)
    {
        if (!obj.TryGetProperty(nama, out var nilai)) return string.Empty;
        return nilai.ValueKind == JsonValueKind.String ? nilai.GetString() ?? string.Empty : string.Empty;
    }

    private static bool IsTimeout(Exception ex, CancellationToken ct) =>
        ex is TaskCanceledException && !ct.IsCancellationRequested;

    private static bool IsCancellation(Exception ex, CancellationToken ct) =>
        (ex is OperationCanceledException || ex is TaskCanceledException) && ct.IsCancellationRequested;

    private static bool IsOffline(Exception ex) =>
        ex is HttpRequestException hre &&
        hre.InnerException is SocketException { SocketErrorCode: SocketError.ConnectionRefused or SocketError.ConnectionReset or SocketError.HostUnreachable };

    public void Dispose() => _http.Dispose();
}
