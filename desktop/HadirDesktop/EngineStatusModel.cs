using System.Text.Json;

namespace HadirDesktop;

/// <summary>
/// Classifies the outcome of a read-only engine status fetch so the UI can
/// distinguish "engine healthy" from "offline / not running" from
/// "reachable but rejected us" from "timed out" from "returned garbage".
/// </summary>
public enum EngineStatusKind
{
    Ok,
    Offline,
    Unauthorized,
    Timeout,
    Malformed,
}

/// <summary>
/// Immutable DTO parsed from the engine's read-only status payloads
/// (GET /api/status, and GET /api/lokal/status via the nonce handshake).
/// Fields are deliberately shallow: booleans / labels / small counts only —
/// no PII, no tokens, no nonce, no secrets. Parsing is tolerant: missing or
/// odd fields default rather than throwing.
/// </summary>
public sealed record EngineStatusModel
{
    public bool Ok { get; init; }
    public string Versi { get; init; }
    public string Pc { get; init; }
    public bool AdaRahsiaEnjin { get; init; }
    public bool KlaimDisokong { get; init; }
    public bool GiliranAktif { get; init; }
    public string GiliranModMula { get; init; }
    public bool GiliranSedangProses { get; init; }
    public bool AutoMulaBermula { get; init; }
    public int KalendarBilangan { get; init; }
    public bool KalendarAmaran { get; init; }
    public bool? MoeisSesiAda { get; init; }
    public int BilanganPasangan { get; init; }
    public EngineStatusKind Kind { get; init; }
    public bool IsSimulated { get; init; }
    public string SourceLabel { get; init; }
    public string? Catatan { get; init; }

    public EngineStatusModel()
    {
        Versi = "-";
        Pc = "-";
        GiliranModMula = "-";
        SourceLabel = string.Empty;
    }

    /// <summary>Engine is reachable and the payload parsed cleanly.</summary>
    public static EngineStatusModel FromJson(string json, bool isSimulated, string sourceLabel)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            var ok = TryGetBool(root, "ok", false);
            var versi = TryGetString(root, "versi", "-");
            var pc = TryGetString(root, "pc", "-");

            // /api/status exposes `adaRahsiaEnjin`; /api/lokal/status exposes
            // `rahsiaEnjinAda`. Accept either so the model works for both.
            var adaRahsiaEnjin = root.TryGetProperty("adaRahsiaEnjin", out var rahsia)
                ? IsBool(rahsia) && rahsia.GetBoolean()
                : root.TryGetProperty("rahsiaEnjinAda", out var rahsiaLokal) && IsBool(rahsiaLokal) && rahsiaLokal.GetBoolean();

            var klaimDisokong = false;
            var aktif = false;
            var modMula = "-";
            var sedangProses = false;
            if (root.TryGetProperty("giliran", out var giliran) && giliran.ValueKind == JsonValueKind.Object)
            {
                klaimDisokong = TryGetBool(giliran, "klaimDisokong", false);
                aktif = TryGetBool(giliran, "aktif", false);
                modMula = TryGetString(giliran, "modMula", "-");
                sedangProses = TryGetBool(giliran, "sedangProses", false);
            }

            var autoMulaBermula = false;
            if (root.TryGetProperty("autoMula", out var autoMula) && autoMula.ValueKind == JsonValueKind.Object)
            {
                autoMulaBermula = TryGetBool(autoMula, "bermula", false);
            }

            var kalendarBilangan = 0;
            var kalendarAmaran = false;
            if (root.TryGetProperty("kalendar", out var kalendar) && kalendar.ValueKind == JsonValueKind.Object)
            {
                kalendarBilangan = TryGetInt(kalendar, "bilangan", 0);
                kalendarAmaran = TryGetBool(kalendar, "amaran", false);
            }

            bool? moeisSesiAda = null;
            if (root.TryGetProperty("moeis", out var moeis) && moeis.ValueKind == JsonValueKind.Object)
            {
                moeisSesiAda = moeis.TryGetProperty("sesiAda", out var sesiAda) && IsBool(sesiAda)
                    ? sesiAda.GetBoolean()
                    : null;
            }

            var bilanganPasangan = 0;
            if (root.TryGetProperty("pasangan", out var pasangan) && pasangan.ValueKind == JsonValueKind.Array)
            {
                bilanganPasangan = pasangan.GetArrayLength();
            }

            return new EngineStatusModel
            {
                Ok = ok,
                Versi = versi,
                Pc = pc,
                AdaRahsiaEnjin = adaRahsiaEnjin,
                KlaimDisokong = klaimDisokong,
                GiliranAktif = aktif,
                GiliranModMula = modMula,
                GiliranSedangProses = sedangProses,
                AutoMulaBermula = autoMulaBermula,
                KalendarBilangan = kalendarBilangan,
                KalendarAmaran = kalendarAmaran,
                MoeisSesiAda = moeisSesiAda,
                BilanganPasangan = bilanganPasangan,
                Kind = EngineStatusKind.Ok,
                IsSimulated = isSimulated,
                SourceLabel = sourceLabel,
                Catatan = null,
            };
        }
        catch (JsonException)
        {
            return Malformed(sourceLabel);
        }
    }

    /// <summary>Engine not reachable (connection refused / nothing listening).</summary>
    public static EngineStatusModel Offline(string sourceLabel) => Error(EngineStatusKind.Offline, sourceLabel, "Enjin tidak dapat dihubungi (offline / tidak berjalan).");

    /// <summary>Engine reachable but rejected our request (no/invalid nonce, origin denied, or 401/403).</summary>
    public static EngineStatusModel Unauthorized(string sourceLabel) => Error(EngineStatusKind.Unauthorized, sourceLabel, "Enjin menolak permintaan (nonce/Origin tidak sah).");

    /// <summary>Request did not complete in time.</summary>
    public static EngineStatusModel Timeout(string sourceLabel) => Error(EngineStatusKind.Timeout, sourceLabel, "Enjin tidak membalas dalam masa ditetapkan (timeout).");

    /// <summary>Reachable but the payload was not valid JSON.</summary>
    public static EngineStatusModel Malformed(string sourceLabel) => Error(EngineStatusKind.Malformed, sourceLabel, "Respons enjin tidak dapat dihurai (bukan JSON sah).");

    /// <summary>Back-compat name for "engine not running" — now maps to Offline.</summary>
    public static EngineStatusModel NotRunning(string sourceLabel) => Offline(sourceLabel);

    private static EngineStatusModel Error(EngineStatusKind kind, string sourceLabel, string catatan) =>
        new()
        {
            Ok = false,
            Versi = "-",
            Pc = "-",
            AdaRahsiaEnjin = false,
            KlaimDisokong = false,
            GiliranAktif = false,
            GiliranModMula = "-",
            GiliranSedangProses = false,
            AutoMulaBermula = false,
            KalendarBilangan = 0,
            KalendarAmaran = false,
            MoeisSesiAda = null,
            BilanganPasangan = 0,
            Kind = kind,
            IsSimulated = false,
            SourceLabel = sourceLabel,
            Catatan = catatan,
        };

    private static bool TryGetBool(JsonElement element, string name, bool fallback)
    {
        if (element.TryGetProperty(name, out var value) && IsBool(value))
        {
            return value.GetBoolean();
        }

        return fallback;
    }

    private static string TryGetString(JsonElement element, string name, string fallback)
    {
        if (element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String)
        {
            return value.GetString() ?? fallback;
        }

        return fallback;
    }

    private static int TryGetInt(JsonElement element, string name, int fallback)
    {
        if (element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number)
        {
            return value.TryGetInt32(out var n) ? n : fallback;
        }

        return fallback;
    }

    private static bool IsBool(JsonElement value) =>
        value.ValueKind == JsonValueKind.True || value.ValueKind == JsonValueKind.False;
}
