using System;

namespace HadirDesktop;

/// <summary>
/// Pure helpers for the dev-only real-portal observation log. Sanitizes URLs to
/// scheme+host+path so query strings and fragments (which can carry SSO/CSRF
/// tokens or session data) are never written. No secrets leave the machine.
/// </summary>
public static class RealPortalObservation
{
    /// <summary>
    /// Keeps scheme://authority/path only for http/https; strips query and
    /// fragment. Any other scheme (data:, javascript:, about:, …) is collapsed to
    /// its scheme name so embedded payloads never leak. Non-absolute or blank
    /// input becomes a safe placeholder.
    /// </summary>
    public static string SanitizeUrl(string? url)
    {
        if (string.IsNullOrWhiteSpace(url)) return "(empty)";
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) return "(not-absolute)";
        var scheme = uri.Scheme;
        if (!string.Equals(scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(scheme, Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase))
        {
            return scheme + ":…";
        }
        return uri.GetLeftPart(UriPartial.Path);
    }

    /// <summary>One tab-separated, timestamped line for the local observation log.</summary>
    public static string FormatLine(string kind, string? url, bool allowed) =>
        $"{DateTimeOffset.UtcNow:O}\t{kind}\tallowed={allowed}\t{SanitizeUrl(url)}";
}
