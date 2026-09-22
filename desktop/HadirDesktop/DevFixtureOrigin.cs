namespace HadirDesktop;

/// <summary>Pure origin predicate for the dev/test WebView2 message bridge.</summary>
public static class DevFixtureOrigin
{
    public static bool IsDevFixture(string? currentSource, string devBaseUrl)
    {
        if (string.IsNullOrEmpty(currentSource) || string.IsNullOrEmpty(devBaseUrl)) return false;
        if (!Uri.TryCreate(currentSource, UriKind.Absolute, out var cur)) return false;
        if (!Uri.TryCreate(devBaseUrl, UriKind.Absolute, out var dev)) return false;
        if (!string.Equals(cur.Scheme, dev.Scheme, StringComparison.OrdinalIgnoreCase)) return false;
        if (!string.Equals(cur.Host, dev.Host, StringComparison.OrdinalIgnoreCase)) return false;
        if (cur.Port != dev.Port) return false;
        var path = cur.AbsolutePath;
        return string.Equals(path, dev.AbsolutePath, StringComparison.OrdinalIgnoreCase)
            || path.StartsWith(dev.AbsolutePath.TrimEnd('/') + "/", StringComparison.OrdinalIgnoreCase);
    }
}
