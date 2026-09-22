using System.Text.Json;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Tolerant-parsing tests for the multi-PC device registry DTOs: valid
/// shapes, missing optional fields, and wrong types must never throw —
/// they fall back to null/defaults, mirroring EngineStatusModelTests.
/// </summary>
public class DeviceRegistryModelsTests
{
    [Fact]
    public void RekodPeranti_ParsesValidShape()
    {
        var rec = RekodPeranti.FromJson(Parse("""
        {
          "idPeranti": "peranti-1", "akaun": "akaun-a", "nama": "PC Bilik Guru",
          "status": "aktif", "generasi": 3, "diciptaMs": 1000, "dilulusMs": 1500,
          "lastSeenMs": 2000, "nyahaktifMs": null
        }
        """));

        Assert.Equal("peranti-1", rec.IdPeranti);
        Assert.Equal("akaun-a", rec.Akaun);
        Assert.Equal("PC Bilik Guru", rec.Nama);
        Assert.Equal("aktif", rec.Status);
        Assert.Equal(3, rec.Generasi);
        Assert.Equal(1000, rec.DiciptaMs);
        Assert.Equal(1500, rec.DilulusMs);
        Assert.Equal(2000, rec.LastSeenMs);
        Assert.Null(rec.NyahaktifMs);
    }

    [Fact]
    public void RekodPeranti_MissingOptionalFields_DefaultToNullOrEmpty()
    {
        var rec = RekodPeranti.FromJson(Parse("{}"));

        Assert.Equal(string.Empty, rec.IdPeranti);
        Assert.Equal(string.Empty, rec.Akaun);
        Assert.Equal(string.Empty, rec.Nama);
        Assert.Equal(string.Empty, rec.Status);
        Assert.Equal(0, rec.Generasi);
        Assert.Equal(0, rec.DiciptaMs);
        Assert.Equal(0, rec.DilulusMs);
        Assert.Null(rec.LastSeenMs);
        Assert.Null(rec.NyahaktifMs);
    }

    [Fact]
    public void RekodPeranti_WrongTypes_DoNotThrow_FallBackToDefaults()
    {
        var rec = RekodPeranti.FromJson(Parse("""
        {
          "idPeranti": 123, "akaun": true, "nama": null,
          "generasi": "tiga", "diciptaMs": "seribu", "lastSeenMs": "bukan-nombor"
        }
        """));

        Assert.Equal(string.Empty, rec.IdPeranti);
        Assert.Equal(string.Empty, rec.Akaun);
        Assert.Equal(string.Empty, rec.Nama);
        Assert.Equal(0, rec.Generasi);
        Assert.Equal(0, rec.DiciptaMs);
        Assert.Null(rec.LastSeenMs);
    }

    [Fact]
    public void RekodPeranti_NeverExposesSecretField()
    {
        // Even if a malicious/buggy backend included rahsiaHash, the DTO has
        // no such property to bind it into.
        var rec = RekodPeranti.FromJson(Parse("""{ "idPeranti": "p1", "rahsiaHash": "deadbeef" }"""));
        Assert.Equal("p1", rec.IdPeranti);
        Assert.DoesNotContain(typeof(RekodPeranti).GetProperties(), p => p.Name.Contains("Rahsia"));
    }

    [Fact]
    public void JawapanKlaim_ParsesValidShape()
    {
        var jawapan = JawapanKlaim.FromJson(Parse("""{ "ok": true, "pemimpin": "peranti-1", "generasi": 7, "leaseMs": 99999 }"""));
        Assert.True(jawapan.Ok);
        Assert.Equal("peranti-1", jawapan.Pemimpin);
        Assert.Equal(7, jawapan.Generasi);
        Assert.Equal(99999, jawapan.LeaseMs);
    }

    [Fact]
    public void JawapanKlaim_MissingFields_DefaultWithoutThrowing()
    {
        var jawapan = JawapanKlaim.FromJson(Parse("{}"));
        Assert.False(jawapan.Ok);
        Assert.Equal(string.Empty, jawapan.Pemimpin);
        Assert.Equal(0, jawapan.Generasi);
        Assert.Equal(0, jawapan.LeaseMs);
    }

    [Fact]
    public void JawapanDegup_PemimpinIsBoolean_DistinctFromJawapanKlaim()
    {
        var jawapan = JawapanDegup.FromJson(Parse("""{ "ok": true, "pemimpin": true, "generasi": 4 }"""));
        Assert.True(jawapan.Ok);
        Assert.True(jawapan.Pemimpin);
        Assert.Equal(4, jawapan.Generasi);
    }

    [Fact]
    public void JawapanDegup_WrongTypeForPemimpin_FallsBackToFalse()
    {
        var jawapan = JawapanDegup.FromJson(Parse("""{ "ok": true, "pemimpin": "peranti-1", "generasi": 4 }"""));
        Assert.False(jawapan.Pemimpin);
    }

    [Fact]
    public void StatusAwam_ParsesNullPemimpinAndNullLastSeen()
    {
        var status = StatusAwam.FromJson(Parse("""{ "akaun": "akaun-a", "pemimpin": null, "lastSeenMs": null, "leaseMs": 0, "generasi": 0 }"""));
        Assert.Equal("akaun-a", status.Akaun);
        Assert.Null(status.Pemimpin);
        Assert.Null(status.LastSeenMs);
        Assert.Equal(0, status.LeaseMs);
    }

    [Fact]
    public void StatusAwam_WrongTypeForPemimpin_FallsBackToNull()
    {
        var status = StatusAwam.FromJson(Parse("""{ "akaun": "akaun-a", "pemimpin": 42 }"""));
        Assert.Null(status.Pemimpin);
    }

    [Fact]
    public void KodDaftar_ParsesValidShape()
    {
        var kod = KodDaftar.FromJson(Parse("""{ "kodDaftar": "abc123", "luputMs": 5000 }"""));
        Assert.Equal("abc123", kod.KodDaftarNilai);
        Assert.Equal(5000, kod.LuputMs);
    }

    [Fact]
    public void ParseSenaraiPerantiAdmin_ValidArray_ReturnsAllRecords()
    {
        var senarai = DeviceRegistryParsing.ParseSenaraiPerantiAdmin("""
        [
          { "idPeranti": "p1", "akaun": "a", "nama": "PC1", "status": "aktif", "generasi": 1, "diciptaMs": 1, "dilulusMs": 1, "lastSeenMs": null, "nyahaktifMs": null },
          { "idPeranti": "p2", "akaun": "a", "nama": "PC2", "status": "nyahaktif", "generasi": 2, "diciptaMs": 2, "dilulusMs": 2, "lastSeenMs": 5, "nyahaktifMs": 9 }
        ]
        """);

        Assert.Equal(2, senarai.Count);
        Assert.Equal("p1", senarai[0].IdPeranti);
        Assert.Equal("p2", senarai[1].IdPeranti);
    }

    [Fact]
    public void ParseSenaraiPerantiAdmin_NonArrayPayload_ReturnsEmpty_NeverThrows()
    {
        Assert.Empty(DeviceRegistryParsing.ParseSenaraiPerantiAdmin("""{ "not": "an array" }"""));
        Assert.Empty(DeviceRegistryParsing.ParseSenaraiPerantiAdmin("not even json"));
        Assert.Empty(DeviceRegistryParsing.ParseSenaraiPerantiAdmin(""));
    }

    [Fact]
    public void ParseStatusAwam_NonArrayOrMalformed_ReturnsEmpty_NeverThrows()
    {
        Assert.Empty(DeviceRegistryParsing.ParseStatusAwam("""{ "akaun": "a" }"""));
        Assert.Empty(DeviceRegistryParsing.ParseStatusAwam("<html>error</html>"));
    }

    [Fact]
    public void ParseRekodPeranti_MalformedJson_ReturnsNull_NeverThrows()
    {
        Assert.Null(DeviceRegistryParsing.ParseRekodPeranti("not json"));
        Assert.Null(DeviceRegistryParsing.ParseRekodPeranti("[1,2,3]"));
    }

    [Fact]
    public void ParseJawapanKlaim_MalformedJson_ReturnsNull_NeverThrows()
    {
        Assert.Null(DeviceRegistryParsing.ParseJawapanKlaim("not json"));
        Assert.Null(DeviceRegistryParsing.ParseJawapanKlaim("[]"));
    }

    private static JsonElement Parse(string json) => JsonDocument.Parse(json).RootElement;
}
