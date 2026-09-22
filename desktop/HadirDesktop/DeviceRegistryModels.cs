using System.Collections.Generic;
using System.Text.Json;

namespace HadirDesktop;

/// <summary>
/// Tolerant DTOs for the HADIR "berbilang PC" (multi-PC) device registry
/// contract — the SAME JSON shapes as <c>hadir-pc/kontrak.schema.json</c> and
/// the mirrored Apps Script backend section, using the SAME camelCase field
/// names as the JS contract (RekodPeranti, JawapanKlaim, StatusAwam,
/// SenaraiPerantiAdmin, KodDaftar).
///
/// Parsing mirrors <see cref="EngineStatusModel"/>: missing or wrong-typed
/// fields fall back to null/defaults rather than throwing. The feature is
/// OFF by default and these models never carry secrets (rahsiaHash is never
/// exposed by the backend, so there is no field for it here).
/// </summary>
public sealed record RekodPeranti
{
    public string IdPeranti { get; init; } = string.Empty;
    public string Akaun { get; init; } = string.Empty;
    public string Nama { get; init; } = string.Empty;
    public string Status { get; init; } = string.Empty;
    public int Generasi { get; init; }
    public long DiciptaMs { get; init; }
    public long DilulusMs { get; init; }
    public long? LastSeenMs { get; init; }
    public long? NyahaktifMs { get; init; }

    public static RekodPeranti FromJson(JsonElement root) => new()
    {
        IdPeranti = JsonTolerant.GetString(root, "idPeranti", string.Empty),
        Akaun = JsonTolerant.GetString(root, "akaun", string.Empty),
        Nama = JsonTolerant.GetString(root, "nama", string.Empty),
        Status = JsonTolerant.GetString(root, "status", string.Empty),
        Generasi = JsonTolerant.GetInt(root, "generasi", 0),
        DiciptaMs = JsonTolerant.GetLong(root, "diciptaMs", 0),
        DilulusMs = JsonTolerant.GetLong(root, "dilulusMs", 0),
        LastSeenMs = JsonTolerant.GetNullableLong(root, "lastSeenMs"),
        NyahaktifMs = JsonTolerant.GetNullableLong(root, "nyahaktifMs"),
    };
}

/// <summary>
/// Response shape of <c>pcDegup</c> (heartbeat) — NOTE <c>pemimpin</c> here is
/// a BOOLEAN ("is this device currently the leader?"), unlike
/// <see cref="JawapanKlaim.Pemimpin"/> which is the leader's device id. Kept
/// as a distinct type so the two are never confused when parsing.
/// </summary>
public sealed record JawapanDegup
{
    public bool Ok { get; init; }
    public bool Pemimpin { get; init; }
    public int Generasi { get; init; }

    public static JawapanDegup FromJson(JsonElement root) => new()
    {
        Ok = JsonTolerant.GetBool(root, "ok", false),
        Pemimpin = JsonTolerant.GetBool(root, "pemimpin", false),
        Generasi = JsonTolerant.GetInt(root, "generasi", 0),
    };
}

public sealed record JawapanKlaim
{
    public bool Ok { get; init; }
    public string Pemimpin { get; init; } = string.Empty;
    public int Generasi { get; init; }
    public long LeaseMs { get; init; }

    public static JawapanKlaim FromJson(JsonElement root) => new()
    {
        Ok = JsonTolerant.GetBool(root, "ok", false),
        Pemimpin = JsonTolerant.GetString(root, "pemimpin", string.Empty),
        Generasi = JsonTolerant.GetInt(root, "generasi", 0),
        LeaseMs = JsonTolerant.GetLong(root, "leaseMs", 0),
    };
}

public sealed record StatusAwam
{
    public string Akaun { get; init; } = string.Empty;
    public string? Pemimpin { get; init; }
    public long? LastSeenMs { get; init; }
    public long LeaseMs { get; init; }
    public int Generasi { get; init; }

    public static StatusAwam FromJson(JsonElement root) => new()
    {
        Akaun = JsonTolerant.GetString(root, "akaun", string.Empty),
        Pemimpin = JsonTolerant.GetNullableString(root, "pemimpin"),
        LastSeenMs = JsonTolerant.GetNullableLong(root, "lastSeenMs"),
        LeaseMs = JsonTolerant.GetLong(root, "leaseMs", 0),
        Generasi = JsonTolerant.GetInt(root, "generasi", 0),
    };
}

public sealed record KodDaftar
{
    public string KodDaftarNilai { get; init; } = string.Empty;
    public long LuputMs { get; init; }

    public static KodDaftar FromJson(JsonElement root) => new()
    {
        KodDaftarNilai = JsonTolerant.GetString(root, "kodDaftar", string.Empty),
        LuputMs = JsonTolerant.GetLong(root, "luputMs", 0),
    };
}

/// <summary>
/// Parsing entry points for the array-shaped contract responses
/// (<c>SenaraiPerantiAdmin</c> is an array of <see cref="RekodPeranti"/>;
/// <c>pcStatusAwam</c> returns an array of <see cref="StatusAwam"/>). Tolerant:
/// a malformed/non-array payload yields an empty list, never a thrown
/// exception to the caller.
/// </summary>
public static class DeviceRegistryParsing
{
    public static IReadOnlyList<RekodPeranti> ParseSenaraiPerantiAdmin(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Array) return System.Array.Empty<RekodPeranti>();
            var hasil = new List<RekodPeranti>();
            foreach (var item in doc.RootElement.EnumerateArray())
            {
                if (item.ValueKind == JsonValueKind.Object) hasil.Add(RekodPeranti.FromJson(item));
            }
            return hasil;
        }
        catch (JsonException)
        {
            return System.Array.Empty<RekodPeranti>();
        }
    }

    public static IReadOnlyList<StatusAwam> ParseStatusAwam(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Array) return System.Array.Empty<StatusAwam>();
            var hasil = new List<StatusAwam>();
            foreach (var item in doc.RootElement.EnumerateArray())
            {
                if (item.ValueKind == JsonValueKind.Object) hasil.Add(StatusAwam.FromJson(item));
            }
            return hasil;
        }
        catch (JsonException)
        {
            return System.Array.Empty<StatusAwam>();
        }
    }

    public static RekodPeranti? ParseRekodPeranti(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            return doc.RootElement.ValueKind == JsonValueKind.Object ? RekodPeranti.FromJson(doc.RootElement) : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    public static JawapanKlaim? ParseJawapanKlaim(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            return doc.RootElement.ValueKind == JsonValueKind.Object ? JawapanKlaim.FromJson(doc.RootElement) : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    public static JawapanDegup? ParseJawapanDegup(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            return doc.RootElement.ValueKind == JsonValueKind.Object ? JawapanDegup.FromJson(doc.RootElement) : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }
}

/// <summary>Small tolerant-read helpers shared by the multi-PC DTOs above.</summary>
internal static class JsonTolerant
{
    public static bool GetBool(JsonElement element, string name, bool fallback)
    {
        if (element.TryGetProperty(name, out var value) && IsBool(value)) return value.GetBoolean();
        return fallback;
    }

    public static string GetString(JsonElement element, string name, string fallback)
    {
        if (element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String)
        {
            return value.GetString() ?? fallback;
        }
        return fallback;
    }

    public static string? GetNullableString(JsonElement element, string name)
    {
        if (!element.TryGetProperty(name, out var value)) return null;
        return value.ValueKind == JsonValueKind.String ? value.GetString() : null;
    }

    public static int GetInt(JsonElement element, string name, int fallback)
    {
        if (element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number)
        {
            return value.TryGetInt32(out var n) ? n : fallback;
        }
        return fallback;
    }

    public static long GetLong(JsonElement element, string name, long fallback)
    {
        if (element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number)
        {
            return value.TryGetInt64(out var n) ? n : fallback;
        }
        return fallback;
    }

    public static long? GetNullableLong(JsonElement element, string name)
    {
        if (!element.TryGetProperty(name, out var value)) return null;
        if (value.ValueKind == JsonValueKind.Null) return null;
        return value.ValueKind == JsonValueKind.Number && value.TryGetInt64(out var n) ? n : null;
    }

    private static bool IsBool(JsonElement value) =>
        value.ValueKind == JsonValueKind.True || value.ValueKind == JsonValueKind.False;
}
