using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace HadirDesktop;

/// <summary>
/// Any RPC failure against the HADIR backend (Apps Script). The message is the
/// backend's own <c>ralat</c> string or a transport description — the engine
/// secret is NEVER part of it (it only ever travels inside the request body).
/// <see cref="Sementara"/> classifies the failure so callers can tell a
/// temporary hiccup from the backend's final answer.
/// </summary>
public sealed class HadirBackendException : Exception
{
    /// <summary>
    /// True ONLY for a failure classified as temporary — timeout, a non-JSON
    /// body (Apps Script's HTML error page) or an HTTP 5xx. Those may be
    /// retried by a READ-ONLY call. A rejection (<c>ok:false</c>), a transport
    /// failure or any other answer is NOT temporary: it must never be blindly
    /// retried and must never be reported as "will heal by itself".
    /// </summary>
    public bool Sementara { get; }

    public HadirBackendException(string message, bool sementara = false) : base(message)
    {
        Sementara = sementara;
    }

    public HadirBackendException(string message, Exception inner, bool sementara = false) : base(message, inner)
    {
        Sementara = sementara;
    }
}

/// <summary>
/// The third <c>moeisJobKlaim</c> argument. The backend distinguishes THREE
/// values and a boolean coercion would corrupt the third one (see the explicit
/// warning in <c>companion/src/klien-hadir.mjs</c>: <c>!!</c> would turn
/// <c>'verifikasi'</c> into <c>true</c>, i.e. a read-only verification claim
/// into a failed-task retry claim).
/// </summary>
public enum ModKlaim
{
    /// <summary>Normal automatic loop claim — wire value <c>false</c>.</summary>
    Biasa,

    /// <summary>Retry a <c>gagal</c> task (manual/admin) — wire value <c>true</c>.</summary>
    CubaSemula,

    /// <summary>READ-ONLY claim of a <c>tersimpan</c> task — wire value <c>"verifikasi"</c>.</summary>
    Verifikasi,
}

/// <summary>
/// What <c>moeisJobKlaim</c> returns when the claim actually succeeded: the
/// task as re-read by the backend UNDER ITS SCRIPT LOCK (id, class, date, the
/// absent students, MOEIS class id). A <c>null</c> claim result means the claim
/// was REFUSED (another engine holds it, or the status does not allow it) — it
/// is never an error and never a licence to submit.
///
/// The students are rebuilt field-by-field into <see cref="MuridKerjaPenuh"/>
/// (id/nama/kategori/sebab) so an identity document number carried by the
/// backend record can never enter this process — the same allowlist rule the
/// companion applies in <c>kerjaPenuhSelamat</c>.
/// </summary>
public sealed record TugasanDiklaim(
    string Id,
    string Kelas,
    string? TarikhIso,
    string KelasMoeisId,
    IReadOnlyList<MuridKerjaPenuh> Murid);

/// <summary>
/// The four backend job RPCs the desktop needs to own a task end to end.
/// Separated as an interface so the submission cycle can be tested against an
/// in-process fake with no network and no real Apps Script.
/// </summary>
public interface IHadirBackendClient
{
    /// <summary>READ-ONLY task list. The ONLY call that is retried.</summary>
    Task<IReadOnlyList<KerjaPenuh>> SenaraiAsync(CancellationToken ct = default);

    /// <summary>Atomic claim. <c>null</c> = refused (do NOT submit). NOT retried.</summary>
    Task<TugasanDiklaim?> KlaimAsync(string id, string pemilik, ModKlaim mod, CancellationToken ct = default);

    /// <summary>Release the lease without recording a result. NOT retried.</summary>
    Task LepasAsync(string id, string pemilik, CancellationToken ct = default);

    /// <summary>
    /// Record the outcome (<c>berjaya</c> / <c>gagal</c> / <c>tersimpan</c>).
    /// NOT retried here — the caller decides (the status report is idempotent,
    /// a MOEIS write is not).
    /// </summary>
    Task SelesaiAsync(string id, string keputusan, string mesej, int? bilHadirSelepas, string pemilik, CancellationToken ct = default);
}

/// <summary>
/// Faithful C# port of <c>companion/src/klien-hadir.mjs</c> — the desktop app
/// talking DIRECTLY to the HADIR backend (Apps Script), with no Node engine in
/// between.
///
/// Wire contract (every detail here is load-bearing):
///   * POST the JSON <c>{mode:'hadir', kaedah, argumen}</c> to the Web App URL;
///   * <c>Content-Type: text/plain;charset=utf-8</c> (an Apps Script Web App
///     rejects a JSON preflight);
///   * a BROWSER <c>User-Agent</c> is MANDATORY — without it Apps Script
///     answers <c>/exec</c> with a 404 redirect whose body is not JSON (noted
///     in the reference file from moeis-bot);
///   * redirects are followed (the Web App always bounces to
///     <c>*.googleusercontent.com</c>);
///   * the reply is <c>{ok:true,hasil}</c> or <c>{ok:false,ralat}</c>; a body
///     that is not JSON is an error naming the STATUS only, never the body.
///
/// Retry policy: ONLY the read call (<see cref="SenaraiAsync"/>) may loop, at
/// most <see cref="CubaanBacaLalai"/> attempts, and ONLY for a failure
/// classified temporary (timeout / non-JSON body / HTTP 5xx), waiting
/// <see cref="JedaCubaSemulaLalai"/> (2 s, then 6 s) between attempts. A
/// rejection (<c>ok:false</c>) or any other permanent answer is attempted
/// exactly once. Claim / release / complete are state-changing and are NEVER
/// retried blindly — a blind retry on an unstable network could create a
/// double side effect. The caller decides what to do after an error. Reasons
/// stay distinct and never echo a body: "backend sibuk (masa tamat)", "backend
/// balas bukan-JSON (status N)", "backend ralat pelayan (status N)",
/// "backend tolak: ...".
///
/// The engine secret is appended as the last RPC argument and lives ONLY inside
/// the request body: it is never logged, never put into an exception message,
/// and never written anywhere by this class.
/// </summary>
public sealed class HadirBackendClient : IHadirBackendClient
{
    /// <summary>Same literal as <c>UA_PELAYAR</c> in klien-hadir.mjs.</summary>
    private const string UserAgent =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

    /// <summary>
    /// Per-call timeout. The reference client uses 20 s, but the LIVE
    /// deployment (measured 2026-09-23) answers /exec with a 302 in ~2.5 s and
    /// the echo endpoint in 1.3–2.3 s YET occasionally takes longer than 20 s
    /// for a real ~15 KB payload — so 20 s cancelled healthy calls. 60 s gives
    /// that headroom. Configurable per client instance via the constructor.
    /// </summary>
    public static readonly TimeSpan TamatMasaLalai = TimeSpan.FromSeconds(60);

    /// <summary>
    /// Backoff ladder between READ attempts: 2 s, then 6 s, then 15 s. With
    /// <see cref="CubaanBacaLalai"/> = 3 attempts only the first two rungs are
    /// ever awaited (attempt 2 waits 2 s, attempt 3 waits 6 s); the third rung
    /// is ready for a raised attempt cap instead of silently falling back to a
    /// shorter delay. Configurable per client instance via the constructor.
    /// </summary>
    public static readonly IReadOnlyList<TimeSpan> JedaCubaSemulaLalai = new[]
    {
        TimeSpan.FromSeconds(2),
        TimeSpan.FromSeconds(6),
        TimeSpan.FromSeconds(15),
    };

    /// <summary>Maximum attempts for the read-only call (1 + 2 retries).</summary>
    public const int CubaanBacaLalai = 3;

    private readonly HttpClient _http;
    private readonly string _apiUrl;
    private readonly string _rahsia;
    private readonly TimeSpan _tamatMasa;
    private readonly IReadOnlyList<TimeSpan> _jedaCubaSemula;
    private readonly Func<TimeSpan, CancellationToken, Task> _tunggu;
    private readonly int _cubaanBaca;

    public HadirBackendClient(
        HttpClient http,
        string apiUrl,
        string rahsia,
        TimeSpan? tamatMasa = null,
        IReadOnlyList<TimeSpan>? jedaCubaSemula = null,
        Func<TimeSpan, CancellationToken, Task>? tunggu = null,
        int? cubaanBaca = null)
    {
        _http = http ?? throw new ArgumentNullException(nameof(http));
        _apiUrl = apiUrl ?? throw new ArgumentNullException(nameof(apiUrl));
        _rahsia = rahsia ?? throw new ArgumentNullException(nameof(rahsia));
        _tamatMasa = tamatMasa ?? TamatMasaLalai;
        _jedaCubaSemula = jedaCubaSemula ?? JedaCubaSemulaLalai;
        _tunggu = tunggu ?? Task.Delay;
        _cubaanBaca = cubaanBaca ?? CubaanBacaLalai;
    }

    /// <summary>
    /// <c>moeisJobSenarai(['', rahsia])</c> — the empty first argument is the
    /// ADMIN SESSION TOKEN slot: empty means "authenticate with the engine
    /// secret instead", which is the mode that returns the <c>murid</c> array.
    /// Retried up to <see cref="CubaanBacaLalai"/> attempts — ONLY for a
    /// temporary failure (timeout / non-JSON / 5xx), waiting the
    /// <see cref="JedaCubaSemulaLalai"/> ladder between attempts (read-only,
    /// no side effect). A rejection is attempted exactly once.
    /// </summary>
    public async Task<IReadOnlyList<KerjaPenuh>> SenaraiAsync(CancellationToken ct = default)
    {
        var hasil = await PanggilAsync("moeisJobSenarai", new object?[] { "", _rahsia }, bacaTulen: true, ct).ConfigureAwait(false);
        return BacaSenarai(hasil);
    }

    public async Task<TugasanDiklaim?> KlaimAsync(string id, string pemilik, ModKlaim mod, CancellationToken ct = default)
    {
        object? benarkanCubaSemula = mod switch
        {
            ModKlaim.CubaSemula => true,
            ModKlaim.Verifikasi => "verifikasi",
            _ => false,
        };

        var hasil = await PanggilAsync("moeisJobKlaim", new object?[] { id, pemilik, benarkanCubaSemula, _rahsia }, bacaTulen: false, ct)
            .ConfigureAwait(false);
        return BacaKlaim(hasil);
    }

    public Task LepasAsync(string id, string pemilik, CancellationToken ct = default) =>
        PanggilAsync("moeisJobLepas", new object?[] { id, pemilik, _rahsia }, bacaTulen: false, ct);

    public Task SelesaiAsync(string id, string keputusan, string mesej, int? bilHadirSelepas, string pemilik, CancellationToken ct = default)
    {
        // `bilHadirSelepas ?? ''` in the reference: an unknown count is the
        // EMPTY STRING, never 0 — 0 would assert "no student present".
        object bil = bilHadirSelepas.HasValue ? bilHadirSelepas.Value : "";
        return PanggilAsync("moeisJobSelesai",
            new object?[] { id, keputusan, mesej ?? "", bil, pemilik ?? "", _rahsia }, bacaTulen: false, ct);
    }

    /// <summary>
    /// PURE reader for a <c>moeisJobSenarai</c> result. Anything that is not an
    /// array of objects yields an EMPTY list only when the array itself is
    /// empty; a non-array result throws, because "unreadable" must never be
    /// presented to the caller as "no work".
    /// </summary>
    public static IReadOnlyList<KerjaPenuh> BacaSenarai(string hasilJson)
    {
        JsonDocument doc;
        try
        {
            doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(hasilJson) ? "null" : hasilJson);
        }
        catch (JsonException)
        {
            throw new HadirBackendException("Senarai tugasan HADIR tidak dapat dibaca (JSON tidak sah).");
        }

        using (doc)
        {
            if (doc.RootElement.ValueKind != JsonValueKind.Array)
            {
                throw new HadirBackendException("Senarai tugasan HADIR bukan tatasusunan; senarai tidak dapat dipastikan.");
            }

            var senarai = new List<KerjaPenuh>();
            foreach (var job in doc.RootElement.EnumerateArray())
            {
                if (job.ValueKind != JsonValueKind.Object) continue;
                var tarikh = Teks(job, "tarikhIso");
                senarai.Add(new KerjaPenuh(
                    Teks(job, "id"),
                    Teks(job, "kelas"),
                    tarikh.Length == 0 ? null : tarikh,
                    Teks(job, "status"),
                    Teks(job, "mesej"),
                    Teks(job, "kelasMoeisId"),
                    BacaMurid(job)));
            }
            return senarai;
        }
    }

    /// <summary>
    /// PURE reader for a <c>moeisJobKlaim</c> result. JSON <c>null</c> = the
    /// claim was REFUSED (returns <c>null</c>); an object without an id is a
    /// broken answer and throws rather than pretending a claim was held.
    /// </summary>
    public static TugasanDiklaim? BacaKlaim(string hasilJson)
    {
        JsonDocument doc;
        try
        {
            doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(hasilJson) ? "null" : hasilJson);
        }
        catch (JsonException)
        {
            throw new HadirBackendException("Balasan klaim tugasan tidak dapat dibaca (JSON tidak sah).");
        }

        using (doc)
        {
            if (doc.RootElement.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined) return null;
            if (doc.RootElement.ValueKind != JsonValueKind.Object)
            {
                throw new HadirBackendException("Balasan klaim tugasan bukan objek; klaim tidak dapat dipastikan.");
            }

            var id = Teks(doc.RootElement, "id");
            if (id.Length == 0)
            {
                throw new HadirBackendException("Balasan klaim tugasan tiada id; klaim tidak dapat dipastikan.");
            }

            var tarikh = Teks(doc.RootElement, "tarikhIso");
            return new TugasanDiklaim(
                id,
                Teks(doc.RootElement, "kelas"),
                tarikh.Length == 0 ? null : tarikh,
                Teks(doc.RootElement, "kelasMoeisId"),
                BacaMurid(doc.RootElement));
        }
    }

    /// <summary>
    /// Allowlisted student rebuild: id / nama / kategori / sebab ONLY. Built as
    /// a NEW object (never by deleting keys), so a future field on the backend
    /// record — <c>ic</c> above all — fails closed instead of leaking through.
    /// </summary>
    private static IReadOnlyList<MuridKerjaPenuh> BacaMurid(JsonElement job)
    {
        var murid = new List<MuridKerjaPenuh>();
        if (!job.TryGetProperty("murid", out var senarai) || senarai.ValueKind != JsonValueKind.Array) return murid;
        foreach (var m in senarai.EnumerateArray())
        {
            if (m.ValueKind != JsonValueKind.Object) continue;
            murid.Add(new MuridKerjaPenuh(Teks(m, "id"), Teks(m, "nama"), Teks(m, "kategori"), Teks(m, "sebab")));
        }
        return murid;
    }

    private static string Teks(JsonElement obj, string nama)
    {
        if (!obj.TryGetProperty(nama, out var nilai)) return string.Empty;
        return nilai.ValueKind switch
        {
            JsonValueKind.String => nilai.GetString() ?? string.Empty,
            JsonValueKind.Number => nilai.ToString(),
            _ => string.Empty,
        };
    }

    /// <summary>
    /// The RPC itself. Returns the RAW JSON text of <c>hasil</c> so each caller
    /// parses its own shape. Every failure — transport, non-JSON body,
    /// <c>ok:false</c> — becomes a <see cref="HadirBackendException"/> whose
    /// <see cref="HadirBackendException.Sementara"/> flag classifies it.
    ///
    /// RETRY GATE (both conditions, no exception): <paramref name="bacaTulen"/>
    /// must be true (only the read call may loop) AND the failure must be
    /// classified temporary. Everything else — a rejection, a transport error,
    /// and every state-changing call (klaim / lepas / selesai) — is attempted
    /// EXACTLY once. Between read attempts it waits the exponential ladder
    /// (2 s, then 6 s).
    /// </summary>
    private async Task<string> PanggilAsync(string kaedah, object?[] argumen, bool bacaTulen, CancellationToken ct)
    {
        var cubaanMaks = bacaTulen ? _cubaanBaca : 1;
        Exception? ralatTerakhir = null;

        for (var cubaan = 1; cubaan <= cubaanMaks; cubaan++)
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                return await SekaliAsync(kaedah, argumen, ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ralat)
            {
                ralatTerakhir = ralat;
                var sementara = ralat is HadirBackendException { Sementara: true };
                // Permanent failure, or the last attempt: stop immediately.
                if (!sementara || cubaan >= cubaanMaks) break;

                // Wait BEFORE the next read attempt. The wait honours caller
                // cancellation, so shutdown is never blocked by a backoff.
                var jeda = JedaSelepasCubaan(cubaan);
                if (jeda > TimeSpan.Zero)
                    await _tunggu(jeda, ct).ConfigureAwait(false);
            }
        }

        throw ralatTerakhir as HadirBackendException
            ?? new HadirBackendException(
                "Panggilan HADIR '" + kaedah + "' gagal: " + (ralatTerakhir?.GetType().Name ?? "tiada butiran"),
                ralatTerakhir ?? new InvalidOperationException("tiada butiran"));
    }

    /// <summary>Wait before attempt N+1: rung N of the ladder, clamped to the last rung.</summary>
    private TimeSpan JedaSelepasCubaan(int cubaan)
    {
        if (_jedaCubaSemula.Count == 0) return TimeSpan.Zero;
        var indeks = cubaan - 1;
        if (indeks >= _jedaCubaSemula.Count) indeks = _jedaCubaSemula.Count - 1;
        return _jedaCubaSemula[indeks];
    }

    private async Task<string> SekaliAsync(string kaedah, object?[] argumen, CancellationToken ct)
    {
        var badan = JsonSerializer.Serialize(new { mode = "hadir", kaedah, argumen });

        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(_tamatMasa);

        using var request = new HttpRequestMessage(HttpMethod.Post, _apiUrl)
        {
            // text/plain;charset=utf-8 — exactly the reference header.
            Content = new StringContent(badan, Encoding.UTF8, "text/plain"),
        };
        request.Headers.UserAgent.Clear();
        request.Headers.TryAddWithoutValidation("User-Agent", UserAgent);

        HttpResponseMessage response;
        try
        {
            response = await _http.SendAsync(request, cts.Token).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (OperationCanceledException ralat)
        {
            // Caller cancellation was filtered above: this is the per-call
            // timeout — temporary, and the reason says exactly that.
            throw new HadirBackendException(
                "backend sibuk (masa tamat) semasa memanggil HADIR '" + kaedah + "'.", ralat, sementara: true);
        }
        catch (HttpRequestException ralat)
        {
            // The TYPE only — a transport message can echo the URL.
            throw new HadirBackendException("Sambungan ke HADIR gagal untuk '" + kaedah + "' (HttpRequestException).", ralat);
        }

        using (response)
        {
            string teks;
            try
            {
                teks = await response.Content.ReadAsStringAsync(cts.Token).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (OperationCanceledException ralat)
            {
                // The per-call budget covered the body too: a stalled ~15 KB
                // payload is the same temporary condition as a stalled call.
                throw new HadirBackendException(
                    "backend sibuk (masa tamat) semasa membaca balasan HADIR '" + kaedah + "'.", ralat, sementara: true);
            }
            catch (Exception ralat)
            {
                throw new HadirBackendException("Balasan HADIR untuk '" + kaedah + "' tidak dapat dibaca.", ralat);
            }

            var status = (int)response.StatusCode;

            // HTTP 5xx: the backend (or Google's front end) had a temporary
            // problem — classified before anything is parsed, body never echoed.
            if (status >= 500)
            {
                throw new HadirBackendException(
                    "backend ralat pelayan (status " + status + ") semasa memanggil HADIR '" + kaedah + "'.",
                    sementara: true);
            }

            JsonDocument doc;
            try
            {
                doc = JsonDocument.Parse(teks);
            }
            catch (JsonException)
            {
                // Apps Script's blocking symptom: an HTML error page (the 404
                // redirect, a 403 block). TEMPORARY — a read call retries it.
                // The BODY is never echoed — only the status number.
                throw new HadirBackendException(
                    "backend balas bukan-JSON (status " + status + ") semasa memanggil HADIR '" + kaedah + "'.",
                    sementara: true);
            }

            using (doc)
            {
                if (doc.RootElement.ValueKind != JsonValueKind.Object)
                {
                    throw new HadirBackendException("Balasan HADIR bukan objek (status " + status + ").");
                }

                var ok = doc.RootElement.TryGetProperty("ok", out var okEl) && okEl.ValueKind == JsonValueKind.True;
                if (!ok)
                {
                    var ralat = doc.RootElement.TryGetProperty("ralat", out var ralatEl) && ralatEl.ValueKind == JsonValueKind.String
                        ? ralatEl.GetString() ?? ""
                        : "";
                    // The backend's FINAL answer (bad secret, unknown task…):
                    // distinct wording, NOT temporary, never retried.
                    throw new HadirBackendException(
                        "backend tolak: " + (ralat.Length > 0 ? ralat : "Permintaan HADIR gagal."));
                }

                return doc.RootElement.TryGetProperty("hasil", out var hasilEl) ? hasilEl.GetRawText() : "null";
            }
        }
    }
}

/// <summary>
/// The FULL task list read straight from the HADIR backend, presented through
/// the same <see cref="IKerjaPenuhSource"/> seam the submission pass already
/// consumes. This is what makes the desktop a replacement for the Node engine
/// rather than a client of it: the list no longer comes from the loopback
/// companion route, it comes from Apps Script.
///
/// A failed read is <see cref="SenaraiKerjaPenuh.TidakPasti"/> — never an empty
/// list — so a broken backend can never be read as "nothing to send".
/// </summary>
public sealed class BackendKerjaPenuhSource : IKerjaPenuhSource
{
    private readonly IHadirBackendClient _klien;

    public BackendKerjaPenuhSource(IHadirBackendClient klien)
    {
        _klien = klien ?? throw new ArgumentNullException(nameof(klien));
    }

    public async Task<SenaraiKerjaPenuh> SemakAsync(CancellationToken ct = default)
    {
        try
        {
            var senarai = await _klien.SenaraiAsync(ct).ConfigureAwait(false);
            return SenaraiKerjaPenuh.Jawapan(senarai, senarai.Count + " tugasan HADIR dibaca terus daripada backend.");
        }
        catch (Exception ex) when (ex is OperationCanceledException && ct.IsCancellationRequested)
        {
            throw;
        }
        catch (HadirBackendException ex)
        {
            return SenaraiKerjaPenuh.TidakPasti(
                "Senarai tugasan HADIR tidak dapat dibaca: " + ex.Message
                + (ex.Sementara ? " (kegagalan sementara — boleh dicuba semula)" : ""),
                sementara: ex.Sementara);
        }
        catch (Exception ex)
        {
            return SenaraiKerjaPenuh.TidakPasti(
                "Ralat tidak dijangka semasa membaca senarai tugasan HADIR (" + ex.GetType().Name + ").");
        }
    }
}

/// <summary>
/// The DEMAND seam read straight from the HADIR backend — the same "is there an
/// unfinished MOEIS task TODAY?" answer <see cref="LoopbackKerjaHariIniSource"/>
/// gives, but answered by Apps Script through <see cref="IHadirBackendClient"/>,
/// so the desktop needs no companion engine. This is the last loopback
/// dependency to fall: with both demand and submission on the backend client,
/// the Node engine can be switched off.
///
/// A failed read is <see cref="PermintaanKerja.TidakPasti"/> — never "no work" —
/// so a broken backend can never be read as "nothing to send".
/// </summary>
public sealed class BackendKerjaHariIniSource : IKerjaHariIniSource
{
    private readonly IHadirBackendClient _klien;
    private readonly Func<DateTime> _jam;

    public BackendKerjaHariIniSource(IHadirBackendClient klien, Func<DateTime>? jam = null)
    {
        _klien = klien ?? throw new ArgumentNullException(nameof(klien));
        _jam = jam ?? (() => DateTime.Now);
    }

    public async Task<PermintaanKerja> SemakAsync(CancellationToken ct = default)
    {
        var hariIni = _jam().ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);
        try
        {
            var senarai = await _klien.SenaraiAsync(ct).ConfigureAwait(false);
            var bilangan = senarai.Count(k => k.BelumSiap && k.PadaTarikh(hariIni));

            if (bilangan == 0)
            {
                return PermintaanKerja.Tiada(
                    "Tiada tugasan MOEIS belum siap untuk " + hariIni +
                    " (status menunggu/sedang_dihantar/tersimpan, dibaca terus daripada backend).");
            }

            return PermintaanKerja.Ada(bilangan,
                bilangan + " tugasan MOEIS belum siap untuk " + hariIni +
                " (menunggu/sedang_dihantar/tersimpan) — backend boleh dihubungi.");
        }
        catch (Exception ex) when (ex is OperationCanceledException && ct.IsCancellationRequested)
        {
            throw;
        }
        catch (HadirBackendException ex)
        {
            // A TEMPORARY failure says so, in words: the lifecycle must see it
            // is retryable instead of labelling a backend blip as
            // "enjin-luar-talian". The flag travels on PermintaanKerja.Sementara.
            return PermintaanKerja.TidakPasti(
                "Senarai tugasan HADIR tidak dapat dibaca daripada backend: " + ex.Message
                + (ex.Sementara ? " (kegagalan sementara — boleh dicuba semula)" : ""),
                sementara: ex.Sementara);
        }
        catch (Exception ex)
        {
            return PermintaanKerja.TidakPasti(
                "Ralat tidak dijangka semasa membaca senarai tugasan HADIR daripada backend (" + ex.GetType().Name + "); deman tidak dapat dipastikan.");
        }
    }
}
