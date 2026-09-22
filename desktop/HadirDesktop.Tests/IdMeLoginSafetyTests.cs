using System.Collections.Generic;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

public class IdMeLoginSafetyTests
{
    // --- SahkanHos (anti-phishing host check) ---

    [Fact]
    public void SahkanHos_HTTPS_HosTepat_Ok()
    {
        var k = IdMeLoginSafety.SahkanHos("https://idme.moe.gov.my/login");
        Assert.True(k.Ok);
        Assert.Equal("idme.moe.gov.my", k.Hos);
    }

    [Fact]
    public void SahkanHos_HTTP_Ditolak()
    {
        var k = IdMeLoginSafety.SahkanHos("http://idme.moe.gov.my/login");
        Assert.False(k.Ok);
    }

    [Fact]
    public void SahkanHos_SubdomainJahat_Ditolak()
    {
        var k = IdMeLoginSafety.SahkanHos("https://idme.moe.gov.my.evil.com/login");
        Assert.False(k.Ok);
    }

    [Fact]
    public void SahkanHos_UserInfo_Ditolak()
    {
        var k = IdMeLoginSafety.SahkanHos("https://user:pass@idme.moe.gov.my/login");
        Assert.False(k.Ok);
    }

    [Fact]
    public void SahkanHos_PortBukan443_Ditolak()
    {
        var k = IdMeLoginSafety.SahkanHos("https://idme.moe.gov.my:8080/login");
        Assert.False(k.Ok);
    }

    [Fact]
    public void SahkanHos_BukanIdMe_Ditolak()
    {
        var k = IdMeLoginSafety.SahkanHos("https://moeispel.moe.gov.my/kehadiran");
        Assert.False(k.Ok);
    }

    // --- SemakFrasa (security-phrase decision) ---

    [Fact]
    public void SemakFrasa_Padan()
    {
        Assert.Equal(IdMeLoginSafety.KeputusanFrasa.Padan,
            IdMeLoginSafety.SemakFrasa("BUNGA RAYA", "BUNGA RAYA", false));
    }

    [Fact]
    public void SemakFrasa_TidakPadan()
    {
        Assert.Equal(IdMeLoginSafety.KeputusanFrasa.TidakPadan,
            IdMeLoginSafety.SemakFrasa("BUNGA MELUR", "BUNGA RAYA", false));
    }

    [Fact]
    public void SemakFrasa_Tiada_TanpaBenarkan()
    {
        Assert.Equal(IdMeLoginSafety.KeputusanFrasa.Tiada,
            IdMeLoginSafety.SemakFrasa(null, "BUNGA RAYA", false));
    }

    [Fact]
    public void SemakFrasa_Tiada_DenganBenarkan()
    {
        Assert.Equal(IdMeLoginSafety.KeputusanFrasa.TiadaDibenarkan,
            IdMeLoginSafety.SemakFrasa(null, "BUNGA RAYA", true));
    }

    // --- TentukanStatusSelepasHantar (post-submit session classification) ---

    [Fact]
    public void SelepasHantar_MOEIS_DenganKehadiran_SesiSah()
    {
        var k = IdMeLoginSafety.TentukanStatusSelepasHantar("moeispel.moe.gov.my", false, false, true, false);
        Assert.Equal("sesi-sah", k.Status);
    }

    [Fact]
    public void SelepasHantar_MOEIS_TanpaKehadiran_SesiTamat()
    {
        var k = IdMeLoginSafety.TentukanStatusSelepasHantar("moeispel.moe.gov.my", false, false, false, false);
        Assert.Equal("sesi-tamat", k.Status);
    }

    [Fact]
    public void SelepasHantar_KredensialDitolak_Diutamakan()
    {
        var k = IdMeLoginSafety.TentukanStatusSelepasHantar("idme.moe.gov.my", true, false, false, true);
        Assert.Equal("kredensial-ditolak", k.Status);
    }

    [Fact]
    public void SelepasHantar_IdMeDashboard_SesiSah()
    {
        var k = IdMeLoginSafety.TentukanStatusSelepasHantar("idme.moe.gov.my", false, true, false, false);
        Assert.Equal("sesi-sah", k.Status);
    }

    [Fact]
    public void SelepasHantar_BorangMasihAda_SesiTamat()
    {
        var k = IdMeLoginSafety.TentukanStatusSelepasHantar("idme.moe.gov.my", true, false, false, false);
        Assert.Equal("sesi-tamat", k.Status);
    }

    // --- KlasifikasiHasilLogin (the owner's final retry policy) ---

    [Fact]
    public void Klasifikasi_SesiSah_Berjaya()
    {
        Assert.Equal(IdMeLoginSafety.KelasLogin.Berjaya,
            IdMeLoginSafety.KlasifikasiHasilLogin("sesi-sah", false, null));
    }

    [Fact]
    public void Klasifikasi_KredensialDitolak_Penolakan()
    {
        Assert.Equal(IdMeLoginSafety.KelasLogin.PenolakanKredensial,
            IdMeLoginSafety.KlasifikasiHasilLogin("kredensial-ditolak", false, new[] { "kredensial-ditolak" }));
    }

    [Fact]
    public void Klasifikasi_Captcha_PerluManusia()
    {
        Assert.Equal(IdMeLoginSafety.KelasLogin.PerluManusia,
            IdMeLoginSafety.KlasifikasiHasilLogin("perlu-manusia", false, new[] { "otp-selepas-hantar" }));
    }

    [Fact]
    public void Klasifikasi_FrasaTidakPadan_PerluManusia()
    {
        Assert.Equal(IdMeLoginSafety.KelasLogin.PerluManusia,
            IdMeLoginSafety.KlasifikasiHasilLogin("kunci-tidak-padan", false, new[] { "kunci-tidak-padan" }));
    }

    [Fact]
    public void Klasifikasi_SesiTidakDapatDisahkan_Transient()
    {
        Assert.Equal(IdMeLoginSafety.KelasLogin.Transient,
            IdMeLoginSafety.KlasifikasiHasilLogin("sesi-tidak-dapat-disahkan", false, new[] { "sesi-tidak-dapat-disahkan" }));
    }

    [Fact]
    public void Klasifikasi_HosTidakSah_Transient()
    {
        Assert.Equal(IdMeLoginSafety.KelasLogin.Transient,
            IdMeLoginSafety.KlasifikasiHasilLogin("hos-tidak-sah", false, new[] { "hos-tidak-sah" }));
    }

    [Fact]
    public void Klasifikasi_HalamanTidakSedia_Transient()
    {
        Assert.Equal(IdMeLoginSafety.KelasLogin.Transient,
            IdMeLoginSafety.KlasifikasiHasilLogin("halaman-tidak-sedia", false, new[] { "medan-ic-tiada" }));
    }

    [Fact]
    public void Klasifikasi_TiadaKredensial_PerluManusia()
    {
        Assert.Equal(IdMeLoginSafety.KelasLogin.PerluManusia,
            IdMeLoginSafety.KlasifikasiHasilLogin("tiada-kredensial", false, new[] { "kredensial-tidak-lengkap" }));
    }

    // --- AdakahKredensialDitolak (explicit rejection regex, narrow on purpose) ---

    [Fact]
    public void Regex_KataLaluanSalah_KenalPasti()
    {
        Assert.True(IdMeLoginSafety.AdakahKredensialDitolak("Kata laluan tidak betul. Sila cuba semula."));
        Assert.True(IdMeLoginSafety.AdakahKredensialDitolak("incorrect password"));
    }

    [Fact]
    public void Regex_LogMasukGagalGenerik_TidakDikira()
    {
        // Generic "login failed" must NOT be a credential rejection (could be a
        // transient/session-expired page) — this is what avoids false strikes.
        Assert.False(IdMeLoginSafety.AdakahKredensialDitolak("Log masuk gagal. Sila cuba semula kemudian."));
        Assert.False(IdMeLoginSafety.AdakahKredensialDitolak("Sesi telah tamat."));
    }
}
