using System.Collections.Generic;
using System.Threading.Tasks;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// The MISSING "pilih aplikasi" step (SSO handoff idMe -> MOEIS).
///
/// Live evidence (2026-09-23, HADIR_DEV_REAL_PORTAL=1): idMe ACCEPTED the
/// credential (the /loginverification page appeared), then the app navigated
/// straight to moeispel.../tabguru and MOEIS bounced it to idme.moe.gov.my/login
/// — three times, forever. The MOEIS session only exists once the MOEIS
/// application link on idMe's <c>list_aplikasi</c> page (single-use SSO token)
/// has been followed.
///
/// These tests drive the PURE selection logic directly and the flow through the
/// existing <see cref="IIdMeLoginDom"/> seam. No real portal, no real
/// credential: the fake DOM's "password" is a fixture string.
/// </summary>
public class AplikasiIdMePemilihTests
{
    private const string MoeisSso = "https://moeispel.moe.gov.my/?token_idms=fixture&t=1789705325&u=xyz";

    [Fact]
    public void UrlSenaraiAplikasi_SamaSepertiCompanion()
    {
        // Must stay identical to companion/src/moeis/aplikasi.mjs URL_APLIKASI_IDME.
        Assert.Equal("https://idme.moe.gov.my/list_aplikasi", AplikasiIdMe.UrlSenaraiAplikasi);
    }

    [Theory]
    [InlineData("https://moeispel.moe.gov.my/")]
    [InlineData("https://moeispel.moe.gov.my")]
    [InlineData(MoeisSso)]
    [InlineData("https://MOEISPEL.MOE.GOV.MY/sahsiah/kehadiran/pkhem/tabguru")]
    public void PautanMoeisSah_MenerimaHosTepatHttps(string href)
    {
        Assert.True(AplikasiIdMe.PautanMoeisSah(href));
    }

    [Theory]
    [InlineData("http://moeispel.moe.gov.my/")]                          // not HTTPS
    [InlineData("https://moeispel.moe.gov.my.evil.com/")]                // subdomain trick
    [InlineData("https://evil.com/?x=moeispel.moe.gov.my")]              // substring in query
    [InlineData("https://evil.com/moeispel.moe.gov.my")]                 // substring in path
    [InlineData("https://xmoeispel.moe.gov.my/")]                        // prefix trick
    [InlineData("https://user:pw@moeispel.moe.gov.my/")]                 // userinfo
    [InlineData("https://moeispel.moe.gov.my:8443/")]                    // non-default port
    [InlineData("https://idme.moe.gov.my/list_aplikasi")]                // idMe itself
    [InlineData("/relatif")]                                             // relative
    [InlineData("javascript:alert(1)")]
    [InlineData("")]
    [InlineData(null)]
    public void PautanMoeisSah_MenolakSelainnya(string? href)
    {
        Assert.False(AplikasiIdMe.PautanMoeisSah(href));
    }

    [Fact]
    public void PilihPautan_UtamakanLabelPengurusanMurid()
    {
        var senarai = new List<PautanAplikasi>
        {
            new("Laporan", "https://idme.moe.gov.my/laporan"),
            new("Sistem Lain", "https://moeispel.moe.gov.my/?token_idms=lain"),
            new("Pengurusan Murid", MoeisSso),
        };

        Assert.Equal(MoeisSso, AplikasiIdMe.PilihPautanAplikasiMoeis(senarai)!.Href);
    }

    [Fact]
    public void PilihPautan_TanpaLabel_AmbilPautanMoeisPertama()
    {
        var senarai = new List<PautanAplikasi>
        {
            new("Laporan", "https://idme.moe.gov.my/laporan"),
            new("Tanpa label", MoeisSso),
            new("Kedua", "https://moeispel.moe.gov.my/kedua"),
        };

        Assert.Equal(MoeisSso, AplikasiIdMe.PilihPautanAplikasiMoeis(senarai)!.Href);
    }

    [Fact]
    public void PilihPautan_LabelMoeisPadaHosJahat_TidakDipilih()
    {
        // The label is a PREFERENCE, never an authorisation: an attacker anchor
        // labelled "Pengurusan Murid" must not be selectable.
        var senarai = new List<PautanAplikasi>
        {
            new("Pengurusan Murid", "https://moeispel.moe.gov.my.evil.com/"),
        };

        Assert.Null(AplikasiIdMe.PilihPautanAplikasiMoeis(senarai));
    }

    [Fact]
    public void PilihPautan_TiadaCalon_Null()
    {
        Assert.Null(AplikasiIdMe.PilihPautanAplikasiMoeis(new List<PautanAplikasi>()));
        Assert.Null(AplikasiIdMe.PilihPautanAplikasiMoeis(null));
        Assert.Null(AplikasiIdMe.PilihPautanAplikasiMoeis(new List<PautanAplikasi>
        {
            new("Laporan", "https://idme.moe.gov.my/laporan"),
        }));
    }

    [Fact]
    public void HuraiSenarai_BentukSah()
    {
        var senarai = AplikasiIdMe.HuraiSenarai(
            "[{\"teks\":\"Pengurusan Murid\",\"href\":\"" + MoeisSso + "\"},{\"teks\":\"Laporan\",\"href\":\"https://idme.moe.gov.my/x\"}]");

        Assert.Equal(2, senarai.Count);
        Assert.Equal("Pengurusan Murid", senarai[0].Teks);
        Assert.Equal(MoeisSso, senarai[0].Href);
    }

    [Theory]
    [InlineData("bukan json")]
    [InlineData("{\"teks\":\"x\"}")]           // object, not an array
    [InlineData("[]")]
    [InlineData("[1,2,3]")]                     // non-object entries
    [InlineData("[{\"teks\":\"tiada href\"}]")] // missing href
    [InlineData("")]
    [InlineData(null)]
    public void HuraiSenarai_BentukTidakDijangka_SenaraiKosong(string? json)
    {
        Assert.Empty(AplikasiIdMe.HuraiSenarai(json));
    }
}

/// <summary>Handoff staging through the flow, against the scripted fake DOM.</summary>
public class HandoffAplikasiMoeisTests
{
    private static readonly KredensialIdMe Kred = new()
    {
        Pengguna = "881234567890",
        KataLaluan = "kata-laluan-fixture",
        KunciKeselamatan = "BUNGA RAYA",
    };

    private const string MoeisSso = "https://moeispel.moe.gov.my/?token_idms=fixture&t=1&u=x";

    private static readonly IdMeLoginSafety.KeputusanSelepasHantar PapanPemukaIdMe =
        new("sesi-sah", "idme.moe.gov.my", "");

    private static readonly IdMeLoginSafety.KeputusanSelepasHantar MoeisSah =
        new("sesi-sah", "moeispel.moe.gov.my", "");

    private static PalsuIdMeLoginDom DomPapanPemuka() => new()
    {
        // The real sequence: idMe dashboard first, MOEIS only after the handoff.
        SesiBerurutan = new List<IdMeLoginSafety.KeputusanSelepasHantar> { PapanPemukaIdMe, MoeisSah },
        PautanAplikasi = new List<PautanAplikasi>
        {
            new("Laporan", "https://idme.moe.gov.my/laporan"),
            new("Pengurusan Murid", MoeisSso),
        },
    };

    [Fact]
    public async Task PapanPemukaIdMe_HandoffDijalankanSekali_KemudianSesiSah()
    {
        var dom = DomPapanPemuka();

        var hasil = await IdMeLoginFlow.JalankanAsync(dom, Kred, benarkanTerusTanpaFrasa: false);

        Assert.Equal("sesi-sah", hasil.Status);
        Assert.True(hasil.SesiSah);
        Assert.Equal(1, dom.SenaraiAplikasiDipanggil);
        Assert.Equal(1, dom.IkutPautanDipanggil);
        Assert.Equal(MoeisSso, dom.HrefDiterima);   // the MOEIS link, not the idMe one
        Assert.Equal(2, dom.SahkanSesiDipanggil);   // re-verified AFTER the handoff
    }

    [Fact]
    public async Task HandoffTidakMenaipApaApa()
    {
        var dom = DomPapanPemuka();

        await IdMeLoginFlow.JalankanAsync(dom, Kred, benarkanTerusTanpaFrasa: false);

        // Exactly one login submission for the whole attempt — the handoff itself
        // is NAVIGATION only: it never re-types the IC/password, never re-ticks
        // the security checkbox, never re-submits the form.
        Assert.Equal(1, dom.IsiPenggunaDipanggil);
        Assert.Equal(1, dom.IsiKataLaluanDipanggil);
        Assert.Equal(1, dom.TandakanDipanggil);
        Assert.Equal(1, dom.HantarDipanggil);
    }

    [Fact]
    public async Task SudahDiMoeis_TiadaHandoffSamaSekali()
    {
        var dom = new PalsuIdMeLoginDom { Sesi = MoeisSah };

        var hasil = await IdMeLoginFlow.JalankanAsync(dom, Kred, benarkanTerusTanpaFrasa: false);

        Assert.Equal("sesi-sah", hasil.Status);
        Assert.Equal(0, dom.SenaraiAplikasiDipanggil);
        Assert.Equal(0, dom.IkutPautanDipanggil);
        Assert.Equal(1, dom.SahkanSesiDipanggil);
    }

    [Fact]
    public async Task PautanAplikasiTiada_TransientDanBukanSesiSah()
    {
        var dom = DomPapanPemuka();
        dom.PautanAplikasi = new List<PautanAplikasi>
        {
            new("Laporan", "https://idme.moe.gov.my/laporan"),
        };

        var hasil = await IdMeLoginFlow.JalankanAsync(dom, Kred, benarkanTerusTanpaFrasa: false);

        Assert.Equal("handoff-moeis-gagal", hasil.Status);
        Assert.False(hasil.SesiSah);          // NEVER claims a valid session
        Assert.False(hasil.PerluManusia);     // transient -> retried upstream
        Assert.Contains("pautan-aplikasi-tiada", hasil.Bukti);
        Assert.Equal(0, dom.IkutPautanDipanggil);   // nothing navigated
    }

    [Fact]
    public async Task HandoffDilencongkan_TransientDanBukanSesiSah()
    {
        var dom = DomPapanPemuka();
        dom.Handoff = new KeputusanHandoff(false, "idme.moe.gov.my",
            "Selepas mengikut pautan aplikasi MOEIS, hos ialah idme.moe.gov.my — sesi MOEIS belum terbentuk.");

        var hasil = await IdMeLoginFlow.JalankanAsync(dom, Kred, benarkanTerusTanpaFrasa: false);

        Assert.Equal("handoff-moeis-gagal", hasil.Status);
        Assert.False(hasil.SesiSah);
        Assert.False(hasil.PerluManusia);
        Assert.Contains("origin-moeis-tiada", hasil.Bukti);
        Assert.Contains("idme.moe.gov.my", hasil.Sebab);
    }

    [Fact]
    public async Task HandoffOkTetapiKehadiranTiada_TransientDanBukanSesiSah()
    {
        // The handoff reported success but #kehadiran could not be proven: the
        // flow must stay HONEST and report a non-valid session.
        var dom = DomPapanPemuka();
        dom.SesiBerurutan = new List<IdMeLoginSafety.KeputusanSelepasHantar>
        {
            PapanPemukaIdMe,
            new("sesi-tamat", "moeispel.moe.gov.my", "Hos MOEIS dicapai tetapi elemen #kehadiran tiada."),
        };

        var hasil = await IdMeLoginFlow.JalankanAsync(dom, Kred, benarkanTerusTanpaFrasa: false);

        Assert.Equal("handoff-moeis-gagal", hasil.Status);
        Assert.False(hasil.SesiSah);
        Assert.False(hasil.PerluManusia);
        Assert.Contains("kehadiran-tidak-disahkan", hasil.Bukti);
        Assert.Contains("#kehadiran", hasil.Sebab);
    }

    [Fact]
    public async Task HandoffKekalDiPapanPemukaIdMe_BukanSesiSah()
    {
        // Regression for the LIVE loop: re-verification that still answers
        // "idMe dashboard" must NOT be accepted as a MOEIS session.
        var dom = DomPapanPemuka();
        dom.SesiBerurutan = new List<IdMeLoginSafety.KeputusanSelepasHantar> { PapanPemukaIdMe };

        var hasil = await IdMeLoginFlow.JalankanAsync(dom, Kred, benarkanTerusTanpaFrasa: false);

        Assert.Equal("handoff-moeis-gagal", hasil.Status);
        Assert.False(hasil.SesiSah);
        Assert.Equal(1, dom.SenaraiAplikasiDipanggil);   // tried exactly once
    }

    [Fact]
    public void HandoffGagal_DiklasifikasiTransient_BukanStrikeKredensial()
    {
        // The retry policy hinges on this: a failed handoff must neither pause
        // automatic retries nor advance the credential-rejection guard.
        var kelas = IdMeLoginSafety.KlasifikasiHasilLogin(
            "handoff-moeis-gagal", sesiSah: false,
            new[] { "handoff-moeis-gagal", "pautan-aplikasi-tiada" });

        Assert.Equal(IdMeLoginSafety.KelasLogin.Transient, kelas);
    }

    [Fact]
    public async Task ModTanpaFrasa_MasihPerluHandoffSebelumDiakuiBerjaya()
    {
        var dom = DomPapanPemuka();
        dom.KunciSebenar = null;   // unreadable phrase + owner opt-in ON

        var hasil = await IdMeLoginFlow.JalankanAsync(dom, Kred, benarkanTerusTanpaFrasa: true);

        Assert.Equal("kunci-tiada-dibenarkan", hasil.Status);
        Assert.True(hasil.SesiSah);
        Assert.Equal(1, dom.IkutPautanDipanggil);
    }

    [Fact]
    public async Task KredensialDitolak_TiadaHandoffDicuba()
    {
        var dom = new PalsuIdMeLoginDom
        {
            Sesi = new IdMeLoginSafety.KeputusanSelepasHantar(
                "kredensial-ditolak", "idme.moe.gov.my", "Kata laluan tidak betul."),
        };

        var hasil = await IdMeLoginFlow.JalankanAsync(dom, Kred, benarkanTerusTanpaFrasa: false);

        Assert.Equal("kredensial-ditolak", hasil.Status);
        Assert.Equal(0, dom.SenaraiAplikasiDipanggil);
        Assert.Equal(0, dom.IkutPautanDipanggil);
    }
}
