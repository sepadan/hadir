using System.Collections.Generic;
using System.Threading.Tasks;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Staged flow tests against a scripted fake DOM (no WebView2, no real idMe).
/// These prove the SAFETY-GATE SEQUENCING: host check before typing, phrase/
/// checkbox handling, and OTP/CAPTCHA stop — the same gates the companion
/// enforces.
/// </summary>
public class IdMeLoginFlowTests
{
    private static readonly KredensialIdMe Kred = new()
    {
        Pengguna = "881234567890",
        KataLaluan = "kata-laluan-fixture",
        KunciKeselamatan = "BUNGA RAYA",
    };

    [Fact]
    public async Task HosTidakSah_TiadaKredensialDitaip_DanTransient()
    {
        var dom = new PalsuIdMeLoginDom { Url = "http://idme.moe.gov.my.evil.com/login" };

        var hasil = await IdMeLoginFlow.JalankanAsync(dom, Kred, benarkanTerusTanpaFrasa: false);

        Assert.Equal("hos-tidak-sah", hasil.Status);
        Assert.False(hasil.PerluManusia);           // transient → will be retried
        Assert.Equal(0, dom.IsiPenggunaDipanggil);  // no credential typed on wrong host
        Assert.Equal(0, dom.IsiKataLaluanDipanggil);
    }

    [Fact]
    public async Task CaptchaAwal_BerhentiSebelumMenaip()
    {
        var dom = new PalsuIdMeLoginDom { CaptchaAwal = new AmatanCaptcha(true, "Dikesan pada https://idme.moe.gov.my — elemen: input#otp.") };

        var hasil = await IdMeLoginFlow.JalankanAsync(dom, Kred, benarkanTerusTanpaFrasa: false);

        Assert.Equal("perlu-manusia", hasil.Status);
        Assert.True(hasil.PerluManusia);
        Assert.Equal(0, dom.IsiPenggunaDipanggil);
        Assert.Contains("otp", hasil.Sebab);
    }

    [Fact]
    public async Task FrasaTidakPadan_TiadaKotakDanTiadaKataLaluan()
    {
        var dom = new PalsuIdMeLoginDom { KunciSebenar = "BUNGA MELUR" };

        var hasil = await IdMeLoginFlow.JalankanAsync(dom, Kred, benarkanTerusTanpaFrasa: false);

        Assert.Equal("kunci-tidak-padan", hasil.Status);
        Assert.True(hasil.PerluManusia);        // anti-phishing → stop for owner
        Assert.Equal(0, dom.TandakanDipanggil); // checkbox NOT ticked
        Assert.Equal(0, dom.IsiKataLaluanDipanggil);
    }

    [Fact]
    public async Task FrasaTiada_TanpaBenarkan_Abort()
    {
        var dom = new PalsuIdMeLoginDom { KunciSebenar = null };

        var hasil = await IdMeLoginFlow.JalankanAsync(dom, Kred, benarkanTerusTanpaFrasa: false);

        Assert.Equal("kunci-tiada", hasil.Status);
        Assert.True(hasil.PerluManusia);
        Assert.Equal(0, dom.IsiKataLaluanDipanggil);
    }

    [Fact]
    public async Task FrasaTiada_DenganBenarkan_TerusTanpaFrasa()
    {
        var dom = new PalsuIdMeLoginDom { KunciSebenar = null };

        var hasil = await IdMeLoginFlow.JalankanAsync(dom, Kred, benarkanTerusTanpaFrasa: true);

        Assert.Equal("kunci-tiada-dibenarkan", hasil.Status);
        Assert.True(hasil.SesiSah);
        Assert.Equal(1, dom.IsiKataLaluanDipanggil);
        Assert.Equal(1, dom.HantarDipanggil);
    }

    [Fact]
    public async Task KotakGagal_TiadaKataLaluanDitaip_DanTransient()
    {
        var dom = new PalsuIdMeLoginDom { Kotak = false };

        var hasil = await IdMeLoginFlow.JalankanAsync(dom, Kred, benarkanTerusTanpaFrasa: false);

        Assert.Equal("halaman-tidak-sedia", hasil.Status);
        Assert.False(hasil.PerluManusia);          // page not ready → retry
        Assert.Equal(0, dom.IsiKataLaluanDipanggil);
    }

    [Fact]
    public async Task OtpSelepasHantar_Berhenti()
    {
        var dom = new PalsuIdMeLoginDom { CaptchaAkhir = new AmatanCaptcha(true, "Dikesan pada https://idme.moe.gov.my — elemen: input#otp.") };

        var hasil = await IdMeLoginFlow.JalankanAsync(dom, Kred, benarkanTerusTanpaFrasa: false);

        Assert.Equal("perlu-manusia", hasil.Status);
        Assert.True(hasil.PerluManusia);
        Assert.Equal(1, dom.HantarDipanggil);
    }

    [Fact]
    public async Task Berjaya_SesiSah_DanKataLaluanDitaipSelepasSemuaPintu()
    {
        var dom = new PalsuIdMeLoginDom();

        var hasil = await IdMeLoginFlow.JalankanAsync(dom, Kred, benarkanTerusTanpaFrasa: false);

        Assert.Equal("sesi-sah", hasil.Status);
        Assert.True(hasil.SesiSah);
        Assert.Equal(1, dom.NavigasiDipanggil);
        Assert.Equal(1, dom.IsiPenggunaDipanggil);
        Assert.Equal("881234567890", dom.PenggunaDiterima);
        Assert.Equal(1, dom.TandakanDipanggil);
        Assert.Equal(1, dom.IsiKataLaluanDipanggil);
        Assert.Equal("kata-laluan-fixture", dom.KataLaluanDiterima);
    }

    [Fact]
    public async Task KredensialDitolak_Eksplisit()
    {
        var dom = new PalsuIdMeLoginDom
        {
            Sesi = new IdMeLoginSafety.KeputusanSelepasHantar("kredensial-ditolak", "idme.moe.gov.my", "Kata laluan tidak betul."),
        };

        var hasil = await IdMeLoginFlow.JalankanAsync(dom, Kred, benarkanTerusTanpaFrasa: false);

        Assert.Equal("kredensial-ditolak", hasil.Status);
        Assert.True(hasil.PerluManusia);
    }

    [Fact]
    public async Task KredensialTidakLengkap_Abort()
    {
        var dom = new PalsuIdMeLoginDom();
        var kred = new KredensialIdMe { Pengguna = "", KataLaluan = "", KunciKeselamatan = "" };

        var hasil = await IdMeLoginFlow.JalankanAsync(dom, kred, benarkanTerusTanpaFrasa: false);

        Assert.Equal("tiada-kredensial", hasil.Status);
        Assert.Equal(0, dom.NavigasiDipanggil);   // nothing navigated
    }
}

/// <summary>Scripted fake of the embedded-WebView2 DOM adapter (no browser).</summary>
public sealed class PalsuIdMeLoginDom : IIdMeLoginDom
{
    public AmatanCaptcha CaptchaAwal = new(false);
    public AmatanCaptcha CaptchaAkhir = new(false);
    public string Url = "https://idme.moe.gov.my/login";

    /// <summary>
    /// Halaman permulaan. Lalai = borang log masuk idMe sebenar (medan IC
    /// kelihatan, tiada pautan papan pemuka) supaya setiap ujian sedia ada
    /// mengikut laluan menaip kredensial yang sama seperti dahulu.
    /// </summary>
    public IdMeLoginSafety.AmatanMasuk Masuk = new(AdaMedanIc: true);

    public KeputusanDom IsiIc = new(true);
    public KeputusanDom Lanjut = new(true);
    public string? KunciSebenar = "BUNGA RAYA";
    public bool Kotak = true;
    public KeputusanDom IsiPwd = new(true);
    public KeputusanDom Hantar = new(true);
    public IdMeLoginSafety.KeputusanSelepasHantar Sesi = new("sesi-sah", "moeispel.moe.gov.my", "");

    /// <summary>
    /// Scripted answers for consecutive <see cref="SahkanSesiSelepasLogin"/> calls.
    /// When set it takes precedence over <see cref="Sesi"/>; the LAST entry repeats.
    /// Lets a test model the real sequence "idMe dashboard first, MOEIS only after
    /// the SSO handoff".
    /// </summary>
    public List<IdMeLoginSafety.KeputusanSelepasHantar>? SesiBerurutan;

    /// <summary>Anchors the fake idMe application list returns.</summary>
    public List<PautanAplikasi> PautanAplikasi = new()
    {
        new PautanAplikasi("Pengurusan Murid", "https://moeispel.moe.gov.my/?token_idms=fixture&t=1&u=x"),
    };

    public KeputusanHandoff Handoff = new(true, "moeispel.moe.gov.my");

    public int NavigasiDipanggil;
    public int IsiPenggunaDipanggil;
    public string? PenggunaDiterima;
    public int TandakanDipanggil;
    public int IsiKataLaluanDipanggil;
    public string? KataLaluanDiterima;
    public int HantarDipanggil;
    public int SenaraiAplikasiDipanggil;
    public int IkutPautanDipanggil;
    public string? HrefDiterima;
    public int SahkanSesiDipanggil;
    public int AmatiMasukDipanggil;
    private int _captchaDipanggil;

    public Task NavigasiLoginIdMe() { NavigasiDipanggil++; return Task.CompletedTask; }

    public Task<AmatanCaptcha> SemakCaptchaOtp()
    {
        _captchaDipanggil++;
        return Task.FromResult(_captchaDipanggil == 1 ? CaptchaAwal : CaptchaAkhir);
    }

    public Task<string?> UrlHalaman() => Task.FromResult<string?>(Url);

    public Task<IdMeLoginSafety.AmatanMasuk> AmatiHalamanMasuk()
    {
        AmatiMasukDipanggil++;
        return Task.FromResult(Masuk);
    }

    public Task<KeputusanDom> IsiPenggunaIdMe(string pengguna)
    {
        IsiPenggunaDipanggil++;
        PenggunaDiterima = pengguna;
        return Task.FromResult(IsiIc);
    }

    public Task<KeputusanDom> LanjutkanPengesahan()
    {
        return Task.FromResult(Lanjut);
    }

    public Task<string?> BacaKunciKeselamatan() => Task.FromResult(KunciSebenar);

    public Task<bool> TandakanKunciKeselamatan()
    {
        TandakanDipanggil++;
        return Task.FromResult(Kotak);
    }

    public Task<KeputusanDom> IsiKataLaluanIdMe(string kataLaluan)
    {
        IsiKataLaluanDipanggil++;
        KataLaluanDiterima = kataLaluan;
        return Task.FromResult(IsiPwd);
    }

    public Task<KeputusanDom> HantarBorangLogMasuk()
    {
        HantarDipanggil++;
        return Task.FromResult(Hantar);
    }

    public Task<IdMeLoginSafety.KeputusanSelepasHantar> SahkanSesiSelepasLogin()
    {
        SahkanSesiDipanggil++;
        if (SesiBerurutan is { Count: > 0 })
        {
            var i = System.Math.Min(SahkanSesiDipanggil - 1, SesiBerurutan.Count - 1);
            return Task.FromResult(SesiBerurutan[i]);
        }
        return Task.FromResult(Sesi);
    }

    public Task<IReadOnlyList<PautanAplikasi>> SenaraiAplikasiIdMe()
    {
        SenaraiAplikasiDipanggil++;
        return Task.FromResult<IReadOnlyList<PautanAplikasi>>(PautanAplikasi);
    }

    public Task<KeputusanHandoff> IkutPautanAplikasiMoeis(string href)
    {
        IkutPautanDipanggil++;
        HrefDiterima = href;
        return Task.FromResult(Handoff);
    }
}
