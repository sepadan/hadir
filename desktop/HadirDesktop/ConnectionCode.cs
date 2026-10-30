using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace HadirDesktop;

/// <summary>A connection code is a bearer secret. Never use its value in status/logs.</summary>
public sealed class KodSambungan
{
    public string ApiUrl { get; }
    internal string Kod { get; }
    private KodSambungan(string url, string kod) { ApiUrl = url; Kod = kod; }
    public override string ToString() => "Kod sambungan (dirahsiakan)";
    public static KodSambungan Baca(string kod)
    {
        try
        {
            if (kod is not null && kod.Length <= 8192) kod = Regex.Replace(kod, @"\s", "");
            if (kod is null || kod.Length > 2048 || !Regex.IsMatch(kod, @"\AHC1\.[A-Za-z0-9_-]+\z")) throw new FormatException();
            var encoded = kod[4..];
            var bytes = Convert.FromBase64String(encoded.Replace('-', '+').Replace('_', '/') + new string('=', (4 - encoded.Length % 4) % 4));
            if (Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_') != encoded) throw new FormatException();
            using var doc = JsonDocument.Parse(new UTF8Encoding(false, true).GetString(bytes));
            var a = doc.RootElement;
            if (a.ValueKind != JsonValueKind.Array || a.GetArrayLength() != 2 ||
                a[0].ValueKind != JsonValueKind.String || a[1].ValueKind != JsonValueKind.String ||
                !DpapiRahsiaEnjinStore.SahkanApiUrl(a[0].GetString()) ||
                !Regex.IsMatch(a[1].GetString()!, @"\A[a-f0-9]{64}\z")) throw new FormatException();
            return new KodSambungan(a[0].GetString()!, kod);
        }
        catch { throw new InvalidOperationException("Kod sambungan tidak sah. Salin kod penuh daripada admin HADIR."); }
    }

    public static string? IdDaripadaToken(string? token)
    {
        var m = Regex.Match(token ?? "", @"\AHD1\.([a-f0-9]{32})\.[a-f0-9]{64}\z");
        return m.Success ? m.Groups[1].Value : null;
    }
}

/// <summary>
/// Disable automatic redirects at the socket layer. Only the documented Content
/// Service 302/303 -> exact googleusercontent echo GET is allowed, once. A 307/308
/// must never replay a POST containing a code/token. Redirect URL is never logged.
/// </summary>
public sealed class AppsScriptHttpHandler : DelegatingHandler
{
    public AppsScriptHttpHandler() : this(new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false }) { }
    internal AppsScriptHttpHandler(HttpMessageHandler inner) : base(inner) { }
    public static HttpClient BuatHttpClient() => new(new AppsScriptHttpHandler());
    internal static bool EchoSah(Uri? u) => u is not null && Regex.IsMatch(u.OriginalString,
        @"\Ahttps://script\.googleusercontent\.com(?::443)?/macros/echo\?user_content_key=[A-Za-z0-9_%=.-]+&lib=[A-Za-z0-9_%=.-]+\z",
        RegexOptions.CultureInvariant);

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        if (request.Method != HttpMethod.Post || !DpapiRahsiaEnjinStore.SahkanApiUrl(request.RequestUri?.OriginalString))
            throw new HttpRequestException("Endpoint HADIR ditolak.");
        var response = await base.SendAsync(request, ct).ConfigureAwait(false);
        if ((int)response.StatusCode < 300 || (int)response.StatusCode >= 400) return response;
        var location = response.Headers.Location;
        var allowed = (response.StatusCode == HttpStatusCode.Found || response.StatusCode == HttpStatusCode.SeeOther) && EchoSah(location);
        response.Dispose();
        if (!allowed) throw new HttpRequestException("Pengalihan HADIR ditolak.");
        using var next = new HttpRequestMessage(HttpMethod.Get, location);
        next.Headers.TryAddWithoutValidation("User-Agent", request.Headers.UserAgent.ToString());
        var result = await base.SendAsync(next, ct).ConfigureAwait(false);
        if ((int)result.StatusCode >= 300 && (int)result.StatusCode < 400)
        {
            result.Dispose();
            throw new HttpRequestException("Pengalihan HADIR berulang ditolak.");
        }
        return result;
    }
}

/// <summary>No retry on exchange: an uncertain response may already have consumed the code.</summary>
public sealed class SambunganDesktopClient
{
    // Non-secret release bootstrap. A host-pattern match is not a trust decision.
    public const string BootstrapUrl = "https://script.google.com/macros/s/AKfycbzqppwOPHQZz7dZe9OW3Hbhf1nA5wdfqBeQUUXmOxrt1ILDezw_HsLE4wgpbKMt8hbe/exec";
    private readonly HttpClient _http;
    private readonly IReadOnlyCollection<string> _bootstrap;
    private readonly Func<TetapanBackendEnjin, CancellationToken, Task<bool>> _adaKerjaAktif;
    public SambunganDesktopClient(HttpClient http) : this(http, new[] { BootstrapUrl }, SemakKerjaAktifAsync) { }
    internal SambunganDesktopClient(HttpClient http, IReadOnlyCollection<string> bootstrap,
        Func<TetapanBackendEnjin, CancellationToken, Task<bool>>? adaKerjaAktif = null)
    { _http = http; _bootstrap = bootstrap.ToArray(); _adaKerjaAktif = adaKerjaAktif ?? SemakKerjaAktifAsync; }

    public string SahkanSasaran(string kod, DpapiRahsiaEnjinStore store)
    {
        var url = KodSambungan.Baca(kod).ApiUrl;
        if (!SasaranDipercayai(url, store.BacaApiUrlUntukPaparan(), _bootstrap))
            throw new InvalidOperationException("Deployment dalam kod tidak dipercayai. Sambungan tidak diubah; minta kod daripada admin backend sekolah.");
        return url;
    }
    internal static bool SasaranDipercayai(string url, string? dikonfigurasi, IReadOnlyCollection<string> bootstrap)
        => DpapiRahsiaEnjinStore.SahkanApiUrl(url) &&
            (string.Equals(url, dikonfigurasi, StringComparison.Ordinal) || bootstrap.Contains(url, StringComparer.Ordinal));

    private static async Task<bool> SemakKerjaAktifAsync(TetapanBackendEnjin t, CancellationToken ct)
    {
        // Preserve existing job transport/redirect behaviour, including legacy installs.
        using var http = new HttpClient();
        return await SemakKerjaAktifAsync(t, http, ct);
    }
    internal static async Task<bool> SemakKerjaAktifAsync(TetapanBackendEnjin t, HttpClient http, CancellationToken ct)
    {
        var list = await new HadirBackendClient(http, t.ApiUrl, t.RahsiaEnjin).SenaraiAsync(ct);
        // Device ownership is checked atomically by exchange, not inferred from a school-wide list.
        return KodSambungan.IdDaripadaToken(t.RahsiaEnjin) is null && list.Any(j => j.Status is "sedang_dihantar" or "tersimpan");
    }
    internal async Task PastikanTiadaKerjaAktifAsync(DpapiRahsiaEnjinStore store, CancellationToken ct,
        bool pairingDikawalBackend = false, bool sahkanSemakanTidakPasti = false)
    {
        var lama = store.Baca();
        if (lama is null) return;
        bool aktif;
        try { aktif = await _adaKerjaAktif(lama, ct).ConfigureAwait(false); }
        catch (HadirBackendException e) when (pairingDikawalBackend && e.AuthDitolak) { return; }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch
        {
            if (pairingDikawalBackend && sahkanSemakanTidakPasti) return;
            throw new RalatSambunganSelamat("Semakan tugasan lama gagal; kod belum ditebus dan konfigurasi tidak diubah. Untuk backend tidak dapat dicapai, gunakan pengesahan pemulihan eksplisit; semakan backend sasaran tetap wajib.");
        }
        if (aktif) throw new RalatSambunganSelamat("Tugasan masih aktif. Selesaikan atau lepaskan klaim dahulu; kod belum ditebus.");
    }
    public async Task<string> SambungAsync(string kod, DpapiRahsiaEnjinStore store, bool pulihkan = false, CancellationToken ct = default,
        bool sahkanPenggantian = false, string? capDiluluskan = null, bool sahkanSemakanTidakPasti = false)
    {
        var value = KodSambungan.Baca(kod);
        SahkanSasaran(kod, store);
        var cap = store.CapSimpanan();
        if (store.AdaFailBackend && (!sahkanPenggantian || capDiluluskan != cap))
            throw new InvalidOperationException("Pengesahan penggantian diperlukan. Semak deployment sasaran dan sahkan semula.");
        // Both paths trial DPAPI and durable encrypted write BEFORE burning a code.
        store.SahkanSimpananBolehDitulis(pulihkan);
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(ct);
        budget.CancelAfter(TimeSpan.FromSeconds(60));
        string? id = null;
        try
        {
            await PastikanTiadaKerjaAktifAsync(store, budget.Token, pairingDikawalBackend: true,
                sahkanSemakanTidakPasti: sahkanSemakanTidakPasti && sahkanPenggantian && capDiluluskan == cap).ConfigureAwait(false);
            if (store.CapSimpanan() != cap) throw new RalatSambunganSelamat("Tetapan berubah semasa semakan; kod belum ditebus.");
            using var request = new HttpRequestMessage(HttpMethod.Post, value.ApiUrl)
            {
                Content = new StringContent(JsonSerializer.Serialize(new { mode = "hadir", kaedah = "moeisSambungTukar", argumen = new object?[] { value.Kod, store.AdaFailBackend || pulihkan,
                    store.Baca()?.ApiUrl == value.ApiUrl ? KodSambungan.IdDaripadaToken(store.Baca()?.RahsiaEnjin) : null } }), Encoding.UTF8, "text/plain")
            };
            request.Headers.TryAddWithoutValidation("User-Agent", HadirBackendClient.UserAgent);
            using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, budget.Token).ConfigureAwait(false);
            response.EnsureSuccessStatusCode();
            using var stream = await response.Content.ReadAsStreamAsync(budget.Token).ConfigureAwait(false);
            var bytes = new byte[16385];
            var length = 0;
            while (length < bytes.Length)
            {
                var read = await stream.ReadAsync(bytes.AsMemory(length), budget.Token).ConfigureAwait(false);
                if (read == 0) break;
                length += read;
            }
            if (length > 16384) throw new FormatException();
            using var doc = JsonDocument.Parse(bytes.AsMemory(0, length));
            var root = doc.RootElement;
            if (!root.GetProperty("ok").GetBoolean())
                throw new RalatSambunganSelamat(RalatSambunganSelamat.DaripadaBackend(root.TryGetProperty("ralat", out var e) ? e.GetString() : null));
            var result = root.GetProperty("hasil");
            var token = result.GetProperty("tokenPeranti").GetString();
            id = KodSambungan.IdDaripadaToken(token);
            if (id is null || id != result.GetProperty("idPeranti").GetString()) throw new FormatException();
            if (store.CapSimpanan() != cap) throw new FormatException();
            if (pulihkan) store.PulihkanGantiRosak(value.ApiUrl, token!);
            else store.Simpan(value.ApiUrl, token!);
            // Migration markers deliberately remain; restart finalizes migration.
            return id;
        }
        catch (RalatSambunganSelamat e) { throw new InvalidOperationException(e.Message); }
        catch
        {
            throw new InvalidOperationException(id is null
                ? "Sambungan gagal atau hasil tidak pasti. Semak daftar di HADIR; batalkan peranti yang tidak digunakan dan jana kod baharu."
                : "Token peranti tidak dapat disimpan. Batalkan peranti baharu dalam HADIR dan jana kod baharu; semak pemulihan tetapan.");
        }
    }
}

internal sealed class RalatSambunganSelamat(string message) : InvalidOperationException(message)
{
    internal static string DaripadaBackend(string? raw)
    {
        var code = Regex.Match(raw ?? "", @"\A\[SAMBUNG_([A-Z_]+)\]").Groups[1].Value;
        return code switch
        {
            "AUTH" => "Sesi admin tamat. Log masuk semula pada HADIR.",
            "ENDPOINT" => "Admin perlu mengkonfigurasi URL /exec autoritatif pada backend.",
            "INVALID_CODE" => "Kod tidak sah atau dibatalkan. Minta kod baharu.",
            "USED_CODE" => "Kod sudah digunakan. Semak peranti terpaut dalam daftar admin.",
            "ACTIVE_JOB" => "Tugasan masih aktif. Selesaikan klaim dahulu; kod belum ditebus.",
            "RATE" => "Had kadar dicapai. Tunggu seminit sebelum mencuba lagi.",
            "LIMIT" => "Had daftar dicapai. Admin perlu membatalkan rekod tidak digunakan.",
            "CORRUPT" => "Storan backend rosak. Pemilik perlu mengikuti prosedur pemulihan storan.",
            "BUSY" => "Backend sibuk. Semak daftar sebelum mencuba lagi.",
            _ => "Sambungan gagal atau hasil tidak pasti. Semak daftar admin sebelum menjana kod baharu."
        };
    }
}
