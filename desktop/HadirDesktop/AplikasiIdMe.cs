using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace HadirDesktop;

/// <summary>
/// One anchor read from idMe's application list: label + href ONLY. The href of
/// the MOEIS entry carries a single-use SSO token (<c>token_idms=...</c>), so
/// this record is never logged, never shown in the UI, and never persisted.
/// </summary>
public sealed record PautanAplikasi(string Teks, string Href);

/// <summary>
/// Result of the idMe -> MOEIS SSO handoff navigation. <see cref="Hos"/> is a
/// host name only (never a URL with the SSO token in its query).
/// </summary>
public sealed record KeputusanHandoff(bool Ok, string Hos, string Sebab = "");

/// <summary>
/// PURE logic for the idMe application-list ("pilih aplikasi") step — a faithful
/// C# port of <c>companion/src/moeis/aplikasi.mjs</c>, which the Node engine has
/// been using for this exact problem:
///
///   a valid idMe login is NOT enough. Until the MOEIS application is opened
///   FROM the idMe portal, any direct visit to <c>moeispel.moe.gov.my</c> is
///   redirected back to idMe — the MOEIS session only comes into existence when
///   the application link (which carries a single-use SSO token) is followed.
///
/// This is NAVIGATION only: nothing here types a credential, ticks a login
/// checkbox, or submits a form.
/// </summary>
public static class AplikasiIdMe
{
    public const string UrlSenaraiAplikasi = "https://idme.moe.gov.my/list_aplikasi";

    /// <summary>
    /// Label preference for the MOEIS entry, identical to the companion's
    /// (<c>pilihPautanAplikasiMoeis</c>). BELUM DISAHKAN HIDUP for this app: the
    /// real DOM of <c>list_aplikasi</c> has never been read from the desktop
    /// app, so the label wording is taken from the companion and not re-derived.
    /// A label that does not match is NOT fatal — the first structurally valid
    /// MOEIS link still wins.
    /// </summary>
    private static readonly Regex LabelMoeis =
        new("pengurusan murid|modul murid|moeis", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    /// <summary>
    /// Only HTTPS + the EXACT host <c>moeispel.moe.gov.my</c> is accepted — not a
    /// prefix match, not a substring, no userinfo, default port only — so an
    /// attacker-controlled anchor injected into the page can never be the one we
    /// follow. Same posture as <see cref="IdMeLoginSafety.SahkanHos"/>, which
    /// guards the idMe side.
    /// </summary>
    public static bool PautanMoeisSah(string? href)
    {
        if (!Uri.TryCreate(href, UriKind.Absolute, out var u)) return false;
        if (u.Scheme != Uri.UriSchemeHttps) return false;
        if (!string.IsNullOrEmpty(u.UserInfo)) return false;
        if (!u.IsDefaultPort) return false;
        return u.Host.ToLowerInvariant() == IdMeLoginSafety.HOS_MOEIS_SAH;
    }

    /// <summary>
    /// Pick the MOEIS application link out of the anchors read from the page.
    /// Prefer an entry whose label names MOEIS / "Pengurusan Murid"; otherwise
    /// the first structurally valid MOEIS link. Returns <c>null</c> when there is
    /// none — the caller must then report a NON-valid session, never guess.
    /// </summary>
    public static PautanAplikasi? PilihPautanAplikasiMoeis(IEnumerable<PautanAplikasi>? senarai)
    {
        var calon = (senarai ?? Enumerable.Empty<PautanAplikasi>())
            .Where(x => x != null && PautanMoeisSah(x.Href))
            .ToList();
        return calon.FirstOrDefault(x => LabelMoeis.IsMatch(x.Teks ?? "")) ?? calon.FirstOrDefault();
    }

    /// <summary>
    /// Tolerant parse of the <c>[{teks,href}]</c> array the DOM bridge returns.
    /// Malformed JSON, a non-array, or an entry without a usable href yields an
    /// EMPTY list — never a throw, never a partial guess.
    /// </summary>
    public static IReadOnlyList<PautanAplikasi> HuraiSenarai(string? json)
    {
        var hasil = new List<PautanAplikasi>();
        if (string.IsNullOrWhiteSpace(json)) return hasil;
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Array) return hasil;
            foreach (var e in doc.RootElement.EnumerateArray())
            {
                if (e.ValueKind != JsonValueKind.Object) continue;
                var teks = e.TryGetProperty("teks", out var t) && t.ValueKind == JsonValueKind.String ? (t.GetString() ?? "") : "";
                var href = e.TryGetProperty("href", out var h) && h.ValueKind == JsonValueKind.String ? (h.GetString() ?? "") : "";
                if (href.Length == 0) continue;
                hasil.Add(new PautanAplikasi(teks, href));
            }
        }
        catch
        {
            hasil.Clear();
        }
        return hasil;
    }
}
