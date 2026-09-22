using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

public class EngineStatusModelTests
{
    // Mirrors the ACTUAL /api/lokal/status payload shape observed from the live
    // engine (booleans/counts only — no PII, no nonce, no secrets).
    private const string LokalStatusJson = """
    {
      "ok": true,
      "versi": "1.0.0",
      "pc": "PC-01",
      "rahsiaEnjinAda": true,
      "giliran": {
        "aktif": true,
        "sedangProses": false,
        "modMula": "auto",
        "bilLangkauTerakhir": 0,
        "klaimDisokong": true
      },
      "autoMula": { "diminta": true, "bermula": true, "sebab": "auto" },
      "kalendar": { "bilangan": 53, "amaran": false, "sebab": "sah" },
      "moeis": { "sesiAda": true, "umurSesi": 219 },
      "kredensial": { "ada": true }
    }
    """;

    // /api/status (Bearer) uses adaRahsiaEnjin + pasangan instead.
    private const string StatusJson = """
    {
      "ok": true,
      "versi": "1.0.0",
      "pc": "PC-01",
      "adaRahsiaEnjin": false,
      "giliran": { "aktif": false, "modMula": "manual", "klaimDisokong": false },
      "pasangan": [ { "id": "a" }, { "id": "b" } ],
      "moeis": { "sesiAda": null, "umurSesi": null, "belumDiperiksa": true },
      "autoMula": {},
      "kalendar": {}
    }
    """;

    [Fact]
    public void ParsesLokalStatus_NestedFieldsAccurately()
    {
        var model = EngineStatusModel.FromJson(LokalStatusJson, isSimulated: false, sourceLabel: "enjin sebenar 127.0.0.1:8747");

        Assert.True(model.Ok);
        Assert.Equal("1.0.0", model.Versi);
        Assert.Equal("PC-01", model.Pc);
        Assert.True(model.AdaRahsiaEnjin);          // rahsiaEnjinAda -> true
        Assert.True(model.KlaimDisokong);
        Assert.True(model.GiliranAktif);
        Assert.Equal("auto", model.GiliranModMula);
        Assert.False(model.GiliranSedangProses);
        Assert.True(model.AutoMulaBermula);
        Assert.Equal(53, model.KalendarBilangan);
        Assert.False(model.KalendarAmaran);
        Assert.True(model.MoeisSesiAda);
        Assert.Equal(EngineStatusKind.Ok, model.Kind);
        Assert.False(model.IsSimulated);
    }

    [Fact]
    public void ParsesStatus_AdaRahsiaEnjin_AndPasangan()
    {
        var model = EngineStatusModel.FromJson(StatusJson, isSimulated: false, sourceLabel: "enjin sebenar 127.0.0.1:8747");

        Assert.False(model.AdaRahsiaEnjin);         // adaRahsiaEnjin -> false
        Assert.False(model.KlaimDisokong);
        Assert.False(model.GiliranAktif);
        Assert.Equal("manual", model.GiliranModMula);
        Assert.Equal(2, model.BilanganPasangan);
        Assert.Null(model.MoeisSesiAda);            // sesiAda null tolerated
    }

    [Fact]
    public void MissingFields_AreTolerated_AndDoNotThrow()
    {
        var model = EngineStatusModel.FromJson("{}", isSimulated: false, sourceLabel: "enjin sebenar 127.0.0.1:8747");

        Assert.False(model.Ok);
        Assert.Equal("-", model.Versi);
        Assert.Equal("-", model.Pc);
        Assert.False(model.KlaimDisokong);
        Assert.False(model.GiliranAktif);
        Assert.Equal(0, model.BilanganPasangan);
        Assert.Equal(0, model.KalendarBilangan);
    }

    [Fact]
    public void MalformedJson_DoesNotThrow_ReturnsMalformedKind()
    {
        var model = EngineStatusModel.FromJson("not json at all", isSimulated: false, sourceLabel: "enjin sebenar 127.0.0.1:8747");

        Assert.False(model.Ok);
        Assert.Equal(EngineStatusKind.Malformed, model.Kind);
        Assert.NotNull(model.Catatan);
    }

    [Fact]
    public void ErrorKinds_HaveDistinctLabels()
    {
        Assert.Equal(EngineStatusKind.Offline, EngineStatusModel.Offline("s").Kind);
        Assert.Equal(EngineStatusKind.Unauthorized, EngineStatusModel.Unauthorized("s").Kind);
        Assert.Equal(EngineStatusKind.Timeout, EngineStatusModel.Timeout("s").Kind);
        Assert.Equal(EngineStatusKind.Malformed, EngineStatusModel.Malformed("s").Kind);
    }

    [Fact]
    public void NotRunning_MapsToOffline_AndSafeDefaults()
    {
        var model = EngineStatusModel.NotRunning("enjin sebenar 127.0.0.1:8747");

        Assert.False(model.Ok);
        Assert.Equal(EngineStatusKind.Offline, model.Kind);
        Assert.False(model.IsSimulated);
        Assert.False(model.AdaRahsiaEnjin);
    }
}
