using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace HadirDesktop;

/// <summary>
/// One absent student FROM HADIR's own task record: the identifier HADIR gives
/// the student plus the mandatory MOEIS category/reason.
///
/// <see cref="Nama"/> is carried because that is the join key the companion
/// engine itself uses (see <c>companion/src/moeis/payload.mjs</c> — <c>buangIc</c>
/// keeps only name/category/reason, because MOEIS students are matched by name
/// against <c>data-namapelajar</c>/<c>data-idpelajar</c>). No identity document
/// number is ever part of this model, on the wire or in memory.
/// </summary>
public sealed record MuridKerjaPenuh(string Id, string Nama, string Kategori, string Sebab);

/// <summary>
/// One FULL HADIR task: exactly what the desktop needs to BUILD a submission
/// (class + date + the absent students), and nothing else. The companion's
/// <c>/api/lokal/kerja-penuh</c> route builds this from an allowlist of fields,
/// so a future field on the engine's record cannot silently leak through.
/// </summary>
public sealed record KerjaPenuh(
    string Id,
    string Kelas,
    string? TarikhIso,
    string Status,
    string Mesej,
    string KelasMoeisId,
    IReadOnlyList<MuridKerjaPenuh> Murid)
{
    /// <summary>True only for menunggu/sedang_dihantar/tersimpan (same rule as the demand probe).</summary>
    public bool BelumSiap => LoopbackKerjaHariIniSource.StatusBelumSiap.Contains(Status ?? "");

    /// <summary>yyyy-MM-dd ordinal comparison (first 10 chars), same rule as the demand probe.</summary>
    public bool PadaTarikh(string tarikhHariIni) =>
        TarikhSama(TarikhIso, tarikhHariIni);

    internal static bool TarikhSama(string? tarikhIso, string? tarikhHariIni)
    {
        var a = (tarikhIso ?? "").Trim();
        var b = (tarikhHariIni ?? "").Trim();
        if (a.Length < 10 || b.Length < 10) return false;
        return string.Equals(a[..10], b[..10], StringComparison.Ordinal);
    }
}

/// <summary>
/// Answer to ONE full-list read. <see cref="EnjinBolehDicapai"/> false means the
/// list could NOT be established (engine down, nonce refused, unreadable body):
/// the desktop must then submit NOTHING — an unreadable answer is never "empty
/// queue" and never "here are the students".
/// <see cref="Sementara"/> marks a TEMPORARY backend failure (timeout /
/// non-JSON / 5xx after the client's retries) so the submission pass can report
/// it as retryable instead of "enjin-luar-talian".
/// </summary>
public sealed record SenaraiKerjaPenuh(bool EnjinBolehDicapai, IReadOnlyList<KerjaPenuh> Senarai, string Sebab, bool Sementara = false)
{
    public static SenaraiKerjaPenuh TidakPasti(string sebab, bool sementara = false) => new(false, Array.Empty<KerjaPenuh>(), sebab, sementara);
    public static SenaraiKerjaPenuh Jawapan(IReadOnlyList<KerjaPenuh> senarai, string sebab) => new(true, senarai, sebab);
}

/// <summary>Read-only source of HADIR's FULL task list. Never mutates anything.</summary>
public interface IKerjaPenuhSource
{
    Task<SenaraiKerjaPenuh> SemakAsync(CancellationToken ct = default);
}

/// <summary>
/// NOT WIRED at runtime: MainForm uses <see cref="BackendKerjaPenuhSource"/>
/// or the fail-closed <see cref="TiadaBackendSource"/> and never contacts the
/// companion. Kept for its pure reader and existing tests.
///
/// Read-only full-list probe against the LOCAL companion engine, using the SAME
/// authenticated loopback path as <see cref="LoopbackKerjaHariIniSource"/>:
///
///   1. GET {base}/ -> 302 to <c>/?n=&lt;nonce&gt;</c>; the nonce is read from the
///      Location header WITHOUT following it, through the SAME redirect
///      allowlist; it is never logged and never surfaced in a returned string.
///   2. GET {base}/api/lokal/kerja-penuh with header
///      <c>X-HADIR-Lokal: &lt;nonce&gt;</c> — a nonce-only /api/lokal/* route
///      (no Bearer token, no Origin, GET only).
///
/// The route answers with an ALLOWLISTED record (class/date/status + the absent
/// students' id/name/category/reason). It carries no identity document number,
/// no engine secret and no owner lease: this client never reads or touches the
/// engine secret, never pairs, and never mutates anything.
///
/// Every failure is classified and returned as a reason — this method never
/// throws to the caller (cancellation aside) and NEVER guesses a student list.
/// </summary>
public sealed class LoopbackKerjaPenuhSource : IKerjaPenuhSource, IDisposable
{
    private readonly Uri _baseUri;
    private readonly HttpClient _http;
    private readonly Func<DateTime> _jam;

    public LoopbackKerjaPenuhSource(string? baseUrl = null, TimeSpan? timeout = null, Func<DateTime>? jam = null)
    {
        _baseUri = new Uri(baseUrl ?? EngineEndpoints.BaseUrl);
        _jam = jam ?? (() => DateTime.Now);
        var handler = new HttpClientHandler { AllowAutoRedirect = false };
        _http = new HttpClient(handler) { Timeout = timeout ?? TimeSpan.FromSeconds(15) };
    }

    /// <summary>Local date (the PC's own date) as the backend's yyyy-MM-dd key.</summary>
    public string TarikhHariIni() => _jam().ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);

    public async Task<SenaraiKerjaPenuh> SemakAsync(CancellationToken ct = default)
    {
        // 1. Nonce handshake (same allowlist as the status source).
        string nonce;
        try
        {
            using var handshake = await _http.GetAsync(new Uri(_baseUri, EngineEndpoints.SettingsPath), ct).ConfigureAwait(false);

            if (handshake.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
            {
                return SenaraiKerjaPenuh.TidakPasti(
                    "Enjin menolak permintaan tempatan (401/403 pada handshake nonce); senarai penuh tidak dihantar.");
            }

            var location = handshake.Headers.Location?.ToString();
            if (location is null || !LoopbackEngineStatusSource.TryGetNonceFromRedirect(_baseUri, location, out nonce))
            {
                return SenaraiKerjaPenuh.TidakPasti(
                    "Enjin tidak memberi alihan nonce yang boleh dipercayai; senarai penuh tidak dihantar.");
            }
        }
        catch (Exception ex) when (IsCancellation(ex, ct))
        {
            throw;
        }
        catch (Exception ex) when (IsTimeout(ex, ct))
        {
            return SenaraiKerjaPenuh.TidakPasti("Masa tamat semasa menghubungi enjin tempatan; senarai penuh tidak dihantar.");
        }
        catch (Exception ex) when (IsOffline(ex))
        {
            return SenaraiKerjaPenuh.TidakPasti(
                "Enjin tempatan tidak berjalan pada " + _baseUri.GetLeftPart(UriPartial.Authority) + ".");
        }
        catch (Exception ex)
        {
            // Only the exception TYPE is reported — a message could echo the URL.
            return SenaraiKerjaPenuh.TidakPasti(
                "Ralat tidak dijangka semasa menghubungi enjin tempatan (" + ex.GetType().Name + "); senarai penuh tidak dapat dipastikan.");
        }

        // 2. Read-only full list. Nonce header only — no Origin (see class note).
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, new Uri(_baseUri, EngineEndpoints.KerjaPenuhPath));
            request.Headers.Add("X-HADIR-Lokal", nonce);

            using var response = await _http.SendAsync(request, ct).ConfigureAwait(false);

            if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
            {
                return SenaraiKerjaPenuh.TidakPasti(
                    "Enjin menolak permintaan senarai penuh (401/403); senarai tidak dapat dipastikan.");
            }

            if (!response.IsSuccessStatusCode)
            {
                return SenaraiKerjaPenuh.TidakPasti(
                    "Enjin membalas HTTP " + (int)response.StatusCode + " untuk senarai penuh; senarai tidak dapat dipastikan.");
            }

            var body = await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
            var senarai = BacaSenaraiPenuh(body);
            if (senarai is null)
            {
                return SenaraiKerjaPenuh.TidakPasti(
                    "Balasan enjin untuk senarai penuh tidak dapat dibaca (JSON tidak dijangka); senarai tidak dapat dipastikan.");
            }

            var nota = LoopbackKerjaHariIniSource.BacaNota(body);
            var sebab = senarai.Count + " tugasan HADIR dibaca daripada enjin.";
            if (!string.IsNullOrEmpty(nota)) sebab += " Nota enjin: " + nota;
            return SenaraiKerjaPenuh.Jawapan(senarai, sebab);
        }
        catch (Exception ex) when (IsCancellation(ex, ct))
        {
            throw;
        }
        catch (Exception ex) when (IsTimeout(ex, ct))
        {
            return SenaraiKerjaPenuh.TidakPasti("Masa tamat semasa membaca senarai penuh enjin; senarai tidak dapat dipastikan.");
        }
        catch (Exception ex) when (IsOffline(ex))
        {
            return SenaraiKerjaPenuh.TidakPasti("Sambungan ke enjin tempatan terputus semasa membaca senarai penuh.");
        }
        catch (Exception ex)
        {
            return SenaraiKerjaPenuh.TidakPasti(
                "Ralat tidak dijangka semasa membaca senarai penuh enjin (" + ex.GetType().Name + "); senarai tidak dapat dipastikan.");
        }
    }

    /// <summary>
    /// PURE reader for the engine's <c>/api/lokal/kerja-penuh</c> body. Returns
    /// <c>null</c> when the body is not the expected shape — the caller MUST
    /// treat that as "tidak dapat dipastikan", never as an empty list (an empty
    /// queue and an unreadable answer are different facts, and conflating them
    /// would let the desktop claim "nothing to send" from a broken engine).
    /// The envelope's <c>ok</c> flag must be the boolean <c>true</c>.
    /// </summary>
    public static IReadOnlyList<KerjaPenuh>? BacaSenaraiPenuh(string? badanJson)
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
            if (!doc.RootElement.TryGetProperty("ok", out var ok) || ok.ValueKind != JsonValueKind.True) return null;
            if (!doc.RootElement.TryGetProperty("senarai", out var senarai) || senarai.ValueKind != JsonValueKind.Array) return null;

            var hasil = new List<KerjaPenuh>();
            foreach (var job in senarai.EnumerateArray())
            {
                if (job.ValueKind != JsonValueKind.Object) continue;

                var murid = new List<MuridKerjaPenuh>();
                if (job.TryGetProperty("murid", out var senaraiMurid) && senaraiMurid.ValueKind == JsonValueKind.Array)
                {
                    foreach (var m in senaraiMurid.EnumerateArray())
                    {
                        if (m.ValueKind != JsonValueKind.Object) continue;
                        murid.Add(new MuridKerjaPenuh(
                            Teks(m, "id"), Teks(m, "nama"), Teks(m, "kategori"), Teks(m, "sebab")));
                    }
                }

                var tarikh = Teks(job, "tarikhIso");
                hasil.Add(new KerjaPenuh(
                    Teks(job, "id"),
                    Teks(job, "kelas"),
                    tarikh.Length == 0 ? null : tarikh,
                    Teks(job, "status"),
                    Teks(job, "mesej"),
                    Teks(job, "kelasMoeisId"),
                    murid));
            }

            return hasil;
        }
    }

    private static string Teks(JsonElement obj, string nama)
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
