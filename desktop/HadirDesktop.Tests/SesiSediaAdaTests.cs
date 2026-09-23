using System.Collections.Generic;
using System.Threading.Tasks;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// PENYEKAT A (bukti hidup 23/09/2026, HADIR_DEV_REAL_PORTAL=1):
///
/// <code>
/// /login -> /home            (profil WebView2 sudah memegang sesi idMe yang sah)
/// -> borang IC tidak pernah muncul
/// -> "medan IC tiada" (transient) -> cuba semula -> /login -> /home -> ... tanpa henti
/// </code>
///
/// Sesi yang SUDAH sah mesti dikenali sebagai sah, bukan sebagai kegagalan.
/// Ujian di bawah memandu keputusan TULEN
/// (<see cref="IdMeLoginSafety.TentukanKeadaanMasuk"/>) secara langsung, dan
/// aliran melalui seam <c>IIdMeLoginDom</c> sedia ada. Tiada portal sebenar,
/// tiada kredensial sebenar.
/// </summary>
public class KeadaanMasukTests
{
    private static IdMeLoginSafety.KeadaanMasuk Keadaan(string? url, IdMeLoginSafety.AmatanMasuk? amatan) =>
        IdMeLoginSafety.TentukanKeadaanMasuk(url, amatan);

    [Fact]
    public void Home_TanpaBorang_SesiSah()
    {
        // Jejak hidup yang tepat: /login dialihkan ke /home, tiada medan IC.
        Assert.Equal(IdMeLoginSafety.KeadaanMasuk.SesiSah,
            Keadaan("https://idme.moe.gov.my/home", new IdMeLoginSafety.AmatanMasuk()));
    }

    [Theory]
    [InlineData("https://idme.moe.gov.my/home/")]
    [InlineData("https://idme.moe.gov.my/HOME")]
    [InlineData("https://idme.moe.gov.my/home?x=1")]
    [InlineData("https://idme.moe.gov.my/list_aplikasi")]
    [InlineData("https://moeispel.moe.gov.my/home")]
    public void LaluanPapanPemuka_SesiSah(string url)
    {
        Assert.Equal(IdMeLoginSafety.KeadaanMasuk.SesiSah, Keadaan(url, new IdMeLoginSafety.AmatanMasuk()));
    }

    [Fact]
    public void PautanSenaraiAplikasi_BuktiSesiWalauLaluanLain()
    {
        Assert.Equal(IdMeLoginSafety.KeadaanMasuk.SesiSah,
            Keadaan("https://idme.moe.gov.my/apa-apa",
                new IdMeLoginSafety.AmatanMasuk(AdaPautanSenaraiAplikasi: true)));
    }

    [Fact]
    public void MedanIc_BorangLogin()
    {
        Assert.Equal(IdMeLoginSafety.KeadaanMasuk.BorangLogin,
            Keadaan("https://idme.moe.gov.my/login", new IdMeLoginSafety.AmatanMasuk(AdaMedanIc: true)));
    }

    [Fact]
    public void MedanKataLaluan_BorangLogin()
    {
        Assert.Equal(IdMeLoginSafety.KeadaanMasuk.BorangLogin,
            Keadaan("https://idme.moe.gov.my/loginverification/abc",
                new IdMeLoginSafety.AmatanMasuk(AdaMedanKataLaluan: true)));
    }

    [Fact]
    public void HalamanMeminta_MenangAtasPenandaPapanPemuka()
    {
        // Kalau halaman MEMINTA kredensial, ia borang — walaupun pautan papan
        // pemuka turut ada. Tiada sesi diandaikan apabila borang masih terbuka.
        Assert.Equal(IdMeLoginSafety.KeadaanMasuk.BorangLogin,
            Keadaan("https://idme.moe.gov.my/home",
                new IdMeLoginSafety.AmatanMasuk(AdaMedanIc: true, AdaPautanSenaraiAplikasi: true)));
    }

    [Fact]
    public void MedanTeksUmumSahaja_BorangLogin()
    {
        // Sandaran LEMAH: sepadan dengan pemilih terakhir IsiPenggunaIdMe, jadi
        // halaman borang yang dulu boleh diisi tidak menjadi "tidak jelas".
        Assert.Equal(IdMeLoginSafety.KeadaanMasuk.BorangLogin,
            Keadaan("https://idme.moe.gov.my/login", new IdMeLoginSafety.AmatanMasuk(AdaMedanTeksUmum: true)));
    }

    [Fact]
    public void MedanTeksUmum_TidakMengatasiPapanPemuka()
    {
        // Kotak carian pada papan pemuka bukan permintaan kredensial.
        Assert.Equal(IdMeLoginSafety.KeadaanMasuk.SesiSah,
            Keadaan("https://idme.moe.gov.my/home",
                new IdMeLoginSafety.AmatanMasuk(AdaMedanTeksUmum: true, AdaPautanSenaraiAplikasi: true)));
    }

    [Fact]
    public void TiadaPenanda_LaluanBukanPapanPemuka_TidakJelas()
    {
        Assert.Equal(IdMeLoginSafety.KeadaanMasuk.TidakJelas,
            Keadaan("https://idme.moe.gov.my/login", new IdMeLoginSafety.AmatanMasuk()));
    }

    [Fact]
    public void AmatanNull_TidakJelas()
    {
        Assert.Equal(IdMeLoginSafety.KeadaanMasuk.TidakJelas, Keadaan("https://idme.moe.gov.my/home", null));
    }

    [Theory]
    [InlineData("http://idme.moe.gov.my/home")]                 // bukan HTTPS
    [InlineData("https://idme.moe.gov.my.evil.com/home")]       // subdomain tipu
    [InlineData("https://evil.com/home")]                       // hos lain
    [InlineData("https://user:pw@idme.moe.gov.my/home")]        // userinfo
    [InlineData("https://idme.moe.gov.my:8443/home")]           // port bukan lalai
    [InlineData("/home")]                                       // relatif
    [InlineData("javascript:alert(1)")]
    [InlineData("")]
    [InlineData(null)]
    public void PagarHosKekal_SesiTidakBolehDiakuiDiLuarAllowlist(string? url)
    {
        // Penanda papan pemuka PENUH, tetapi hos/skema tidak dibenarkan:
        // jawapannya mesti TidakJelas, tidak pernah SesiSah.
        var amatan = new IdMeLoginSafety.AmatanMasuk(AdaPautanSenaraiAplikasi: true);
        Assert.Equal(IdMeLoginSafety.KeadaanMasuk.TidakJelas, Keadaan(url, amatan));
    }
}

/// <summary>Aliran dengan sesi idMe yang sudah sah, melalui seam sedia ada.</summary>
public class SesiSediaAdaAliranTests
{
    private static readonly KredensialIdMe Kred = new()
    {
        Pengguna = "881234567890",
        KataLaluan = "kata-laluan-fixture",
        KunciKeselamatan = "BUNGA RAYA",
    };

    private const string MoeisSso = "https://moeispel.moe.gov.my/?token_idms=fixture&t=1&u=x";

    /// <summary>Profil sudah log masuk: /login dialihkan ke papan pemuka /home.</summary>
    private static PalsuIdMeLoginDom DomSudahLogMasuk() => new()
    {
        Url = "https://idme.moe.gov.my/home",
        Masuk = new IdMeLoginSafety.AmatanMasuk(AdaPautanSenaraiAplikasi: true),
        PautanAplikasi = new List<PautanAplikasi>
        {
            new("Laporan", "https://idme.moe.gov.my/laporan"),
            new("Pengurusan Murid", MoeisSso),
        },
        Sesi = new IdMeLoginSafety.KeputusanSelepasHantar("sesi-sah", "moeispel.moe.gov.my", ""),
    };

    [Fact]
    public async Task SesiSudahSah_LangkauKredensial_TerusKeHandoff()
    {
        var dom = DomSudahLogMasuk();

        var hasil = await IdMeLoginFlow.JalankanAsync(dom, Kred, benarkanTerusTanpaFrasa: false);

        Assert.Equal("sesi-sah", hasil.Status);
        Assert.True(hasil.SesiSah);
        Assert.Contains("sesi-sedia-ada", hasil.Bukti);

        // TIADA apa-apa ditaip ke halaman yang tidak memintanya.
        Assert.Equal(0, dom.IsiPenggunaDipanggil);
        Assert.Equal(0, dom.IsiKataLaluanDipanggil);
        Assert.Equal(0, dom.TandakanDipanggil);
        Assert.Equal(0, dom.HantarDipanggil);

        // Handoff SSO tetap dijalankan, dan sesi disahkan selepasnya.
        Assert.Equal(1, dom.SenaraiAplikasiDipanggil);
        Assert.Equal(1, dom.IkutPautanDipanggil);
        Assert.Equal(MoeisSso, dom.HrefDiterima);
        Assert.Equal(1, dom.SahkanSesiDipanggil);
    }

    [Fact]
    public async Task RegresiGelungHidup_MedanIcTiadaTidakLagiMenjadiKegagalan()
    {
        // Regresi LANGSUNG bagi gelung hidup: halaman /home tiada medan IC, jadi
        // pengisian IC PASTI gagal kalau ia dicuba. Dahulu itu menghasilkan
        // "medan-ic-tiada" (transient) selama-lamanya.
        var dom = DomSudahLogMasuk();
        dom.IsiIc = new KeputusanDom(false, "Medan IC (KAD PENGENALAN) tidak muncul pada halaman log masuk idMe.");

        var hasil = await IdMeLoginFlow.JalankanAsync(dom, Kred, benarkanTerusTanpaFrasa: false);

        Assert.Equal("sesi-sah", hasil.Status);
        Assert.DoesNotContain("medan-ic-tiada", hasil.Bukti);
        Assert.Equal(0, dom.IsiPenggunaDipanggil);
    }

    [Fact]
    public void SesiSediaAda_DiklasifikasiBerjaya()
    {
        var kelas = IdMeLoginSafety.KlasifikasiHasilLogin(
            "sesi-sah", sesiSah: true, new[] { "sesi-sah", "sesi-sedia-ada" });

        Assert.Equal(IdMeLoginSafety.KelasLogin.Berjaya, kelas);
    }

    [Fact]
    public async Task SesiSudahSah_TetapiHandoffGagal_TransientDanBukanSesiSah()
    {
        // Pagar tidak dilemahkan: sesi idMe sedia ada TIDAK bermakna MOEIS sah.
        var dom = DomSudahLogMasuk();
        dom.PautanAplikasi = new List<PautanAplikasi> { new("Laporan", "https://idme.moe.gov.my/laporan") };

        var hasil = await IdMeLoginFlow.JalankanAsync(dom, Kred, benarkanTerusTanpaFrasa: false);

        Assert.Equal("handoff-moeis-gagal", hasil.Status);
        Assert.False(hasil.SesiSah);
        Assert.False(hasil.PerluManusia);
        Assert.Equal(IdMeLoginSafety.KelasLogin.Transient,
            IdMeLoginSafety.KlasifikasiHasilLogin(hasil.Status, hasil.SesiSah, hasil.Bukti));
        Assert.Equal(0, dom.IsiPenggunaDipanggil);
    }

    [Fact]
    public async Task SesiSudahSah_HandoffOkTetapiKehadiranTiada_BukanSesiSah()
    {
        var dom = DomSudahLogMasuk();
        dom.Sesi = new IdMeLoginSafety.KeputusanSelepasHantar(
            "sesi-tamat", "moeispel.moe.gov.my", "Hos MOEIS dicapai tetapi elemen #kehadiran tiada.");

        var hasil = await IdMeLoginFlow.JalankanAsync(dom, Kred, benarkanTerusTanpaFrasa: false);

        Assert.Equal("handoff-moeis-gagal", hasil.Status);
        Assert.False(hasil.SesiSah);
        Assert.Contains("kehadiran-tidak-disahkan", hasil.Bukti);
    }

    [Fact]
    public async Task HalamanTidakJelas_KekalTransient_DanTiadaMenaip()
    {
        // Fail-tertutup: bukan borang, bukan papan pemuka = tidak jelas.
        var dom = new PalsuIdMeLoginDom { Masuk = new IdMeLoginSafety.AmatanMasuk() };

        var hasil = await IdMeLoginFlow.JalankanAsync(dom, Kred, benarkanTerusTanpaFrasa: false);

        Assert.Equal("halaman-tidak-sedia", hasil.Status);
        Assert.Contains("halaman-masuk-tidak-jelas", hasil.Bukti);
        Assert.False(hasil.PerluManusia);
        Assert.Equal(IdMeLoginSafety.KelasLogin.Transient,
            IdMeLoginSafety.KlasifikasiHasilLogin(hasil.Status, hasil.SesiSah, hasil.Bukti));
        Assert.Equal(0, dom.IsiPenggunaDipanggil);
        Assert.Equal(0, dom.IsiKataLaluanDipanggil);
    }

    [Fact]
    public async Task BorangLogin_LaluanMenaipKekalSepertiDahulu()
    {
        var dom = new PalsuIdMeLoginDom();   // lalai = borang idMe dengan medan IC

        var hasil = await IdMeLoginFlow.JalankanAsync(dom, Kred, benarkanTerusTanpaFrasa: false);

        Assert.Equal("sesi-sah", hasil.Status);
        Assert.DoesNotContain("sesi-sedia-ada", hasil.Bukti);
        Assert.Equal(1, dom.IsiPenggunaDipanggil);
        Assert.Equal(1, dom.IsiKataLaluanDipanggil);
        Assert.Equal(1, dom.HantarDipanggil);
    }

    [Fact]
    public async Task HosTidakSah_HalamanTidakPernahDiamatiPunDanTiadaMenaip()
    {
        // Susunan pagar kekal: semakan hos ketat DAHULU, barulah pengecaman sesi.
        var dom = new PalsuIdMeLoginDom { Url = "https://idme.moe.gov.my.evil.com/home" };

        var hasil = await IdMeLoginFlow.JalankanAsync(dom, Kred, benarkanTerusTanpaFrasa: false);

        Assert.Equal("hos-tidak-sah", hasil.Status);
        Assert.Equal(0, dom.AmatiMasukDipanggil);
        Assert.Equal(0, dom.IsiPenggunaDipanggil);
        Assert.Equal(0, dom.SenaraiAplikasiDipanggil);
    }
}

/// <summary>
/// PENYEKAT B (bukti hidup 23/09/2026): selepas pautan bertoken diikut, pelayan
/// MOEIS membalas <c>302</c> ke <c>http://moeispel.moe.gov.my/</c> dan pagar
/// navigasi menyekatnya — betul, dan pagar itu KEKAL. Handoff mesti bergantung
/// pada SESI, bukan pada URL penghubung.
/// </summary>
public class HandoffBergantungSesiTests
{
    [Theory]
    [InlineData("idme.moe.gov.my")]        // pengalihan HTTP disekat -> balik idMe
    [InlineData("")]                        // tiada URL langsung (navigasi disekat)
    [InlineData("moeispel.moe.gov.my")]     // kes biasa
    public void UrlPenghubungDiabaikan_HalamanKehadiranYangMenentukan(string hosPenghubung)
    {
        Assert.True(AplikasiIdMe.HandoffBerjaya(hosPenghubung, "moeispel.moe.gov.my"));
    }

    [Theory]
    [InlineData("idme.moe.gov.my")]                 // dilencong balik ke idMe
    [InlineData("moeispel.moe.gov.my.evil.com")]    // subdomain tipu
    [InlineData("")]
    [InlineData(null)]
    public void HalamanKehadiranBukanHosMoeis_Gagal(string? hosKehadiran)
    {
        Assert.False(AplikasiIdMe.HandoffBerjaya("moeispel.moe.gov.my", hosKehadiran));
    }

    [Fact]
    public void HosKehadiranTidakPekaHurufBesar()
    {
        Assert.True(AplikasiIdMe.HandoffBerjaya("", " MOEISPEL.MOE.GOV.MY "));
    }
}
