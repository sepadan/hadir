using System;
using System.IO;
using System.Threading;
using System.Windows.Forms;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Aritmetik jadual kitaran. Kesilapan halus yang diuji di sini: pemasa WinForms
/// TIDAK bermula semula selepas pengendali Tick-nya selesai, jadi mengira "satu
/// selang dari saat kerja tamat" sentiasa menjanjikan waktu yang terlalu lewat —
/// kitaran dua minit diikuti tick lapan minit kemudian, bukan sepuluh.
/// </summary>
public class JadualKitaranTests
{
    private static readonly DateTime Mula = new(2026, 9, 23, 9, 0, 0, DateTimeKind.Local);

    [Fact]
    public void TickSeterusnya_SatuSelangSelepasAsas()
    {
        var seterusnya = JadualKitaran.TickSeterusnya(pemasaHidup: true, asasTick: Mula, selangMinit: 10);

        Assert.Equal(Mula.AddMinutes(10), seterusnya);
    }

    /// <summary>
    /// Inti dapatan reviewer: asas ialah saat tick BERMULA. Kitaran yang mengambil
    /// dua minit tidak menolak tick berikutnya ke hadapan — ia tetap pada 09:10.
    /// </summary>
    [Fact]
    public void TickSeterusnya_TidakDitolakOlehKerjaYangPanjang()
    {
        var tickBermula = Mula;
        var kerjaTamat = Mula.AddMinutes(2);

        var dariTick = JadualKitaran.TickSeterusnya(true, tickBermula, 10);
        var dariTamat = JadualKitaran.TickSeterusnya(true, kerjaTamat, 10);

        Assert.Equal(Mula.AddMinutes(10), dariTick);
        Assert.NotEqual(dariTamat, dariTick);
        Assert.True(dariTick < dariTamat, "anggaran dari masa tamat sentiasa terlalu lewat");
    }

    [Fact]
    public void TickSeterusnya_PemasaMati_TiadaJadual()
    {
        Assert.Null(JadualKitaran.TickSeterusnya(pemasaHidup: false, asasTick: Mula, selangMinit: 10));
    }

    [Fact]
    public void TickSeterusnya_TiadaAsas_TiadaJadual()
    {
        Assert.Null(JadualKitaran.TickSeterusnya(pemasaHidup: true, asasTick: null, selangMinit: 10));
    }

    [Fact]
    public void Pilih_OneShotLebihAwal_Menang_DanDitandaiPertama()
    {
        var (seterusnya, pertama) = JadualKitaran.Pilih(
            tick: Mula.AddMinutes(10),
            oneShot: Mula.AddSeconds(45));

        Assert.Equal(Mula.AddSeconds(45), seterusnya);
        Assert.True(pertama);
    }

    /// <summary>
    /// Togol dimatikan lalu dihidupkan semula dalam 45 saat pertama: pemasa
    /// bermula SEMULA (tick baharu 10 minit dari sekarang) tetapi Task.Delay
    /// one-shot yang asal masih berjalan dan akan tiba dahulu. Label mesti
    /// menunjukkan one-shot itu, bukan slot pemasa yang lewat.
    /// </summary>
    [Fact]
    public void Pilih_OneShotMasihTertunda_SelepasPemasaDimulakanSemula()
    {
        var oneShot = Mula.AddSeconds(45);
        var tickBaharu = Mula.AddSeconds(20).AddMinutes(10);

        var (seterusnya, pertama) = JadualKitaran.Pilih(tickBaharu, oneShot);

        Assert.Equal(oneShot, seterusnya);
        Assert.True(pertama);
    }

    [Fact]
    public void Pilih_TiadaOneShot_GunaTick()
    {
        var (seterusnya, pertama) = JadualKitaran.Pilih(tick: Mula.AddMinutes(10), oneShot: null);

        Assert.Equal(Mula.AddMinutes(10), seterusnya);
        Assert.False(pertama);
    }

    [Fact]
    public void Pilih_TickLebihAwalDaripadaOneShot_GunaTick()
    {
        var (seterusnya, pertama) = JadualKitaran.Pilih(
            tick: Mula.AddMinutes(1),
            oneShot: Mula.AddMinutes(5));

        Assert.Equal(Mula.AddMinutes(1), seterusnya);
        Assert.False(pertama);
    }

    /// <summary>
    /// Pemasa mati tetapi one-shot masih tertunda: tiada tick, jadi one-shot itu
    /// satu-satunya jadual yang diketahui.
    /// </summary>
    [Fact]
    public void Pilih_TiadaTick_OneShotMasihDiketahui()
    {
        var (seterusnya, pertama) = JadualKitaran.Pilih(tick: null, oneShot: Mula.AddSeconds(45));

        Assert.Equal(Mula.AddSeconds(45), seterusnya);
        Assert.True(pertama);
    }

    [Fact]
    public void Pilih_TiadaApaApa_TiadaJadual()
    {
        var (seterusnya, pertama) = JadualKitaran.Pilih(null, null);

        Assert.Null(seterusnya);
        Assert.False(pertama);
    }

    /// <summary>
    /// One-shot yang sudah LEWAT (tundaannya tamat tetapi kesinambungan belum
    /// dijadualkan) masih tiba dahulu — ia tidak boleh kalah kepada tick masa
    /// depan.
    /// </summary>
    [Fact]
    public void Pilih_OneShotSudahLewat_MasihMenang()
    {
        var (seterusnya, pertama) = JadualKitaran.Pilih(
            tick: Mula.AddMinutes(10),
            oneShot: Mula.AddSeconds(-5));

        Assert.Equal(Mula.AddSeconds(-5), seterusnya);
        Assert.True(pertama);
    }

    /// <summary>
    /// Pemasa dihentikan sementara one-shot masih tertunda: tiada tick untuk
    /// dibandingkan, jadi one-shot kekal sebagai satu-satunya jadual diketahui.
    /// </summary>
    [Fact]
    public void Pilih_PemasaBerhenti_OneShotTertunda_MasihDinamakan()
    {
        var tick = JadualKitaran.TickSeterusnya(pemasaHidup: false, asasTick: Mula, selangMinit: 10);
        var (seterusnya, pertama) = JadualKitaran.Pilih(tick, Mula.AddSeconds(45));

        Assert.Null(tick);
        Assert.Equal(Mula.AddSeconds(45), seterusnya);
        Assert.True(pertama);
    }

    [Fact]
    public void SelangSegarLabel_CukupKerapUntukTidakBasi_DanBukanKitaran()
    {
        // Cukup pendek supaya waktu lampau tidak melekat di skrin, dan jauh lebih
        // pendek daripada selang kitaran supaya ia jelas bukan denyutan kerja.
        Assert.InRange(JadualKitaran.SelangSegarLabelSaat, 5, 60);
        Assert.True(JadualKitaran.SelangSegarLabelSaat < KitaranAuto.SelangMinit * 60);
    }

    // ---------- pagar lawan pemasa ----------

    /// <summary>
    /// Pemasa hidup TETAPI pagar menolak (tetapan bertukar di luar aplikasi):
    /// label tidak boleh terus menjanjikan kitaran yang pagar akan tolak lagi.
    /// </summary>
    [Fact]
    public void KitaranBenarBenarAktif_PemasaHidupTetapiGateMenolak_TidakAktif()
    {
        Assert.False(JadualKitaran.KitaranBenarBenarAktif(pemasaHidup: true, gateTerakhirLulus: false));
    }

    [Fact]
    public void KitaranBenarBenarAktif_PemasaHidupDanGateLulus_Aktif()
    {
        Assert.True(JadualKitaran.KitaranBenarBenarAktif(pemasaHidup: true, gateTerakhirLulus: true));
    }

    /// <summary>
    /// Pagar belum pernah dinilai (sebaik lancar): pemasa dipercayai sehingga
    /// pagar memberitahu sebaliknya — jika tidak, label akan berkata "mati"
    /// sepanjang 45 saat pertama pada PC yang memang opt-in.
    /// </summary>
    [Fact]
    public void KitaranBenarBenarAktif_GateBelumDinilai_IkutPemasa()
    {
        Assert.True(JadualKitaran.KitaranBenarBenarAktif(pemasaHidup: true, gateTerakhirLulus: null));
        Assert.False(JadualKitaran.KitaranBenarBenarAktif(pemasaHidup: false, gateTerakhirLulus: null));
    }

    [Fact]
    public void KitaranBenarBenarAktif_PemasaMati_TidakPernahAktif()
    {
        Assert.False(JadualKitaran.KitaranBenarBenarAktif(false, true));
        Assert.False(JadualKitaran.KitaranBenarBenarAktif(false, false));
    }

    /// <summary>
    /// Rangkaian penuh dapatan (C): pemasa hidup, pagar menolak, jadual lama
    /// masih ada — teks mesti berkata mati dengan sebabnya, bukan memaparkan
    /// waktu.
    /// </summary>
    [Fact]
    public void GateMenolak_LabelBerkataMati_BukanWaktuSeterusnya()
    {
        var tick = JadualKitaran.TickSeterusnya(pemasaHidup: true, asasTick: Mula, selangMinit: 10);
        var (seterusnya, pertama) = JadualKitaran.Pilih(tick, null);

        var teks = LabelKitaran.Teks(
            new FaktaKitaran(
                Aktif: JadualKitaran.KitaranBenarBenarAktif(true, gateTerakhirLulus: false),
                Seterusnya: seterusnya,
                Pertama: pertama,
                SebabMati: "tetapan automatik dibaca sebagai mati"),
            Mula);

        Assert.Equal("Kitaran: mati — tetapan automatik dibaca sebagai mati", teks);
        Assert.DoesNotContain("09:10", teks);
    }
}

/// <summary>
/// Cap jari konfigurasi backend. Ia wujud untuk satu sebab sahaja: mengesan
/// konfigurasi yang bertukar kepada nilai LAIN yang tetap sah, yang tidak dapat
/// dilihat oleh dua boolean "sedia / tidak sedia". Ujian ini juga mengunci
/// peraturan keselamatannya — cap tidak boleh membawa nilai asalnya.
/// </summary>
public class CapKonfigurasiBackendTests
{
    private const string Url = "https://script.google.com/macros/s/AAAA/exec";
    private const string UrlLain = "https://script.google.com/macros/s/BBBB/exec";
    private const string Rahsia = "rahsia-sintetik-1";
    private const string RahsiaLain = "rahsia-sintetik-2";

    [Fact]
    public void Kira_NilaiSama_CapSama()
    {
        Assert.Equal(CapKonfigurasiBackend.Kira(Url, Rahsia), CapKonfigurasiBackend.Kira(Url, Rahsia));
    }

    /// <summary>
    /// INTI dapatan (A): rahsia bertukar kepada nilai lain yang TETAP SAH. Kedua-dua
    /// boolean kekal benar; hanya cap jari dapat melihatnya.
    /// </summary>
    [Fact]
    public void Kira_RahsiaBertukarKepadaNilaiSahYangLain_CapBerbeza()
    {
        Assert.NotEqual(CapKonfigurasiBackend.Kira(Url, Rahsia), CapKonfigurasiBackend.Kira(Url, RahsiaLain));
    }

    [Fact]
    public void Kira_ApiUrlBertukarKepadaHosSahYangLain_CapBerbeza()
    {
        Assert.NotEqual(CapKonfigurasiBackend.Kira(Url, Rahsia), CapKonfigurasiBackend.Kira(UrlLain, Rahsia));
    }

    /// <summary>
    /// Sempadan antara kedua-dua medan tidak boleh dikaburkan: ("ab","c") dan
    /// ("a","bc") ialah konfigurasi yang BERBEZA.
    /// </summary>
    [Fact]
    public void Kira_SempadanMedanTidakBolehDikaburkan()
    {
        Assert.NotEqual(CapKonfigurasiBackend.Kira("ab", "c"), CapKonfigurasiBackend.Kira("a", "bc"));
    }

    [Fact]
    public void Kira_NilaiTiada_TiadaCap()
    {
        Assert.Null(CapKonfigurasiBackend.Kira(null, Rahsia));
        Assert.Null(CapKonfigurasiBackend.Kira(Url, null));
        Assert.Null(CapKonfigurasiBackend.Kira("", ""));
    }

    /// <summary>
    /// Peraturan KETAT: cap hidup dalam memori sahaja dan mesti selamat walaupun
    /// seseorang tersilap membawanya ke suatu permukaan — ia tidak boleh
    /// mengandungi rahsia atau URL.
    /// </summary>
    [Fact]
    public void Kira_CapTidakMengandungiRahsiaAtauUrl()
    {
        var cap = CapKonfigurasiBackend.Kira(Url, Rahsia)!;

        Assert.DoesNotContain(Rahsia, cap, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("script.google.com", cap, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("AAAA", cap, StringComparison.Ordinal);
        Assert.Matches("^[0-9A-F]+$", cap);
    }

    [Fact]
    public void Sepadan_TidakTahuBukanBermaknaSama()
    {
        Assert.False(CapKonfigurasiBackend.Sepadan(null, "ABC"));
        Assert.False(CapKonfigurasiBackend.Sepadan("ABC", null));
        Assert.False(CapKonfigurasiBackend.Sepadan(null, null));
        Assert.True(CapKonfigurasiBackend.Sepadan("ABC", "ABC"));
    }
}

/// <summary>
/// Label "Kitaran" ialah satu-satunya tempat pemilik boleh melihat bila kerja
/// automatik seterusnya berlaku. Kalau ia menipu — mengaku menunggu sedangkan
/// pemasa mati, berkata "mati" sedangkan kitaran masih menulis ke MOEIS, atau
/// menunjuk slot 10 minit sedangkan yang sebenarnya datang ialah one-shot 45
/// saat — pemilik menunggu sesuatu yang tidak akan datang. Ujian ini mengunci
/// kejujuran itu, dan ia berjalan tanpa WinForms kerana fungsi teksnya TULEN.
/// </summary>
public class LabelKitaranTests
{
    private static readonly DateTime Kini = new(2026, 9, 23, 9, 15, 0, DateTimeKind.Local);

    // ---------- (a) kitaran mati ----------

    [Fact]
    public void Mati_MengatakanMati_DanGalakPemilikHidupkan()
    {
        var teks = LabelKitaran.Teks(new FaktaKitaran(Aktif: false), Kini);

        Assert.Equal("Kitaran: mati — hidupkan Log masuk / Hantar automatik", teks);
    }

    [Fact]
    public void Mati_DenganSebabLebihTepat_MenggunakanSebabItu()
    {
        var teks = LabelKitaran.Teks(
            new FaktaKitaran(Aktif: false, SebabMati: "tetapan tidak dapat dibaca"),
            Kini);

        Assert.Equal("Kitaran: mati — tetapan tidak dapat dibaca", teks);
    }

    /// <summary>
    /// Waktu yang tertinggal daripada jadual lama tidak boleh menyelinap keluar
    /// apabila kitaran sudah mati — itu menjanjikan kerja yang tidak akan jalan.
    /// </summary>
    [Fact]
    public void Mati_TidakPernahMemaparkanWaktu_WalaupunJadualLamaMasihAda()
    {
        var teks = LabelKitaran.Teks(
            new FaktaKitaran(Aktif: false, Seterusnya: Kini.AddMinutes(10)),
            Kini);

        Assert.DoesNotContain("09:25", teks);
        Assert.Contains("mati", teks);
    }

    // ---------- (b) sedang berjalan ----------

    [Fact]
    public void SedangJalan_MengatakanSedangBerjalan_BukanWaktuSeterusnya()
    {
        var teks = LabelKitaran.Teks(
            new FaktaKitaran(Aktif: true, SedangJalan: true, Seterusnya: Kini.AddMinutes(10)),
            Kini);

        Assert.Equal("Kitaran: sedang berjalan…", teks);
        Assert.DoesNotContain("09:25", teks);
    }

    /// <summary>
    /// Pemilik mematikan togol DI TENGAH kitaran. Kitaran semasa tidak dibatalkan
    /// — ia masih boleh menulis ke MOEIS — jadi "mati" adalah tidak benar di sini.
    /// Keutamaan: sedang berjalan mengatasi pemasa yang sudah dihentikan.
    /// </summary>
    [Fact]
    public void SedangJalan_MengatasiPemasaYangBaruDimatikan()
    {
        var teks = LabelKitaran.Teks(
            new FaktaKitaran(Aktif: false, SedangJalan: true),
            Kini);

        Assert.Equal("Kitaran: sedang berjalan… (tiada kitaran seterusnya dijadualkan)", teks);
        Assert.DoesNotContain("mati", teks);
    }

    [Fact]
    public void SedangJalan_TogolMati_TetapMengakuTiadaJadualSeterusnya()
    {
        var jalanAktif = LabelKitaran.Teks(new FaktaKitaran(Aktif: true, SedangJalan: true), Kini);
        var jalanMati = LabelKitaran.Teks(new FaktaKitaran(Aktif: false, SedangJalan: true), Kini);

        Assert.NotEqual(jalanAktif, jalanMati);
        Assert.Contains("sedang berjalan", jalanAktif);
        Assert.Contains("sedang berjalan", jalanMati);
    }

    // ---------- (c) menunggu kitaran seterusnya ----------

    [Fact]
    public void Menunggu_MemaparkanWaktuTempatanHhMm_DanSelang()
    {
        var teks = LabelKitaran.Teks(
            new FaktaKitaran(Aktif: true, Seterusnya: Kini.AddMinutes(10)),
            Kini);

        Assert.Equal($"Kitaran: seterusnya lebih kurang 09:25 (setiap {KitaranAuto.SelangMinit} minit)", teks);
    }

    /// <summary>
    /// Masa berbeza mesti menghasilkan teks berbeza; jika tidak, label boleh
    /// kekal basi selepas satu kitaran tanpa sesiapa perasan.
    /// </summary>
    [Fact]
    public void Menunggu_MasaBerbeza_TeksBerbeza()
    {
        var awal = LabelKitaran.Teks(new FaktaKitaran(Aktif: true, Seterusnya: Kini.AddMinutes(10)), Kini);
        var lewat = LabelKitaran.Teks(new FaktaKitaran(Aktif: true, Seterusnya: Kini.AddMinutes(25)), Kini);

        Assert.NotEqual(awal, lewat);
        Assert.Contains("09:25", awal);
        Assert.Contains("09:40", lewat);
    }

    /// <summary>
    /// Pemasa WinForms berjitter (bukti log: ±60 saat). Anggaran yang sudah lepas
    /// mesti dibaca sebagai "sebentar lagi", bukan waktu lampau yang mengelirukan.
    /// </summary>
    [Fact]
    public void Menunggu_AnggaranSudahLepas_KatakanSebentarLagi()
    {
        var teks = LabelKitaran.Teks(
            new FaktaKitaran(Aktif: true, Seterusnya: Kini.AddSeconds(-30)),
            Kini);

        Assert.Contains("sebentar lagi", teks);
        Assert.DoesNotContain("09:14", teks);
    }

    /// <summary>
    /// Fakta yang SAMA, jam yang berbeza: teks mesti berubah dengan sendirinya
    /// apabila waktu berlalu. Inilah yang dieksploitasi oleh pemasa paparan —
    /// tanpa sifat ini, menyegarkan mengikut jam tidak akan membaiki apa-apa.
    /// </summary>
    [Fact]
    public void Menunggu_TeksLuputApabilaJamBerlalu_TanpaSebarangPeralihan()
    {
        var fakta = new FaktaKitaran(Aktif: true, Seterusnya: Kini.AddMinutes(1));

        var sebelum = LabelKitaran.Teks(fakta, Kini);
        var selepas = LabelKitaran.Teks(fakta, Kini.AddMinutes(3));

        Assert.Contains("09:16", sebelum);
        Assert.Contains("sebentar lagi", selepas);
        Assert.NotEqual(sebelum, selepas);
    }

    [Fact]
    public void Aktif_TanpaJadual_MengakuBelumDijadualkan()
    {
        var teks = LabelKitaran.Teks(new FaktaKitaran(Aktif: true, Seterusnya: null), Kini);

        Assert.Equal("Kitaran: hidup — belum dijadualkan", teks);
    }

    // ---------- (d) kitaran pertama one-shot ----------

    /// <summary>
    /// 45 saat pertama selepas lancar ialah mekanisme LAIN daripada pemasa 10
    /// minit. Label yang berkata "setiap 10 minit" di sini akan menipu pemilik
    /// tentang bila kerjanya benar-benar bermula.
    /// </summary>
    [Fact]
    public void KitaranPertama_DisebutSebagaiOneShot_BukanSelangBiasa()
    {
        var teks = LabelKitaran.Teks(
            new FaktaKitaran(
                Aktif: true,
                Seterusnya: Kini.AddSeconds(KitaranAuto.TundaanMulaSaat),
                Pertama: true),
            Kini);

        Assert.Equal(
            $"Kitaran: seterusnya lebih kurang 09:15 (kitaran pertama, {KitaranAuto.TundaanMulaSaat} saat selepas mula)",
            teks);
        Assert.DoesNotContain($"setiap {KitaranAuto.SelangMinit} minit", teks);
    }

    [Fact]
    public void KitaranPertama_BerbezaDaripadaKitaranBiasa()
    {
        var seterusnya = Kini.AddSeconds(KitaranAuto.TundaanMulaSaat);

        var pertama = LabelKitaran.Teks(new FaktaKitaran(Aktif: true, Seterusnya: seterusnya, Pertama: true), Kini);
        var biasa = LabelKitaran.Teks(new FaktaKitaran(Aktif: true, Seterusnya: seterusnya), Kini);

        Assert.NotEqual(pertama, biasa);
    }

    /// <summary>
    /// Senario penuh togol MATI lalu HIDUP dalam 45 saat pertama, dirangkai
    /// daripada aritmetik jadual: one-shot yang masih tertunda mesti kekal
    /// dinamakan, bukan digantikan oleh slot pemasa baharu yang lebih lewat.
    /// </summary>
    [Fact]
    public void KitaranPertama_TogolMatiLaluHidupSemula_MasihDinamakan()
    {
        var oneShot = Kini.AddSeconds(30);
        var tickBaharu = JadualKitaran.TickSeterusnya(true, Kini.AddSeconds(5), KitaranAuto.SelangMinit);
        var (seterusnya, pertama) = JadualKitaran.Pilih(tickBaharu, oneShot);

        var teks = LabelKitaran.Teks(
            new FaktaKitaran(Aktif: true, Seterusnya: seterusnya, Pertama: pertama),
            Kini);

        Assert.Contains("kitaran pertama", teks);
        Assert.DoesNotContain($"setiap {KitaranAuto.SelangMinit} minit", teks);
    }

    // ---------- kebersihan teks ----------

    /// <summary>
    /// 1.0.9 membuang sisa demo daripada bar status; label kitaran tidak boleh
    /// memasukkannya semula melalui pintu belakang.
    /// </summary>
    [Theory]
    [InlineData(false, false, false)]
    [InlineData(true, false, false)]
    [InlineData(true, true, false)]
    [InlineData(true, false, true)]
    [InlineData(false, true, false)]
    public void TiadaPerkataanDemo_DalamManaManaKeadaan(bool aktif, bool sedangJalan, bool pertama)
    {
        var teks = LabelKitaran.Teks(
            new FaktaKitaran(aktif, sedangJalan, Kini.AddMinutes(3), pertama),
            Kini);

        Assert.DoesNotContain("simulasi", teks, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("demo", teks, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("fixture", teks, StringComparison.OrdinalIgnoreCase);
        Assert.StartsWith(LabelKitaran.Awalan, teks, StringComparison.Ordinal);
    }

    // ---------- label backend ----------

    /// <summary>
    /// Rahsia boleh dibaca + hos apiUrl sah hanya membuktikan KONFIGURASI. Ia
    /// tidak membuktikan rangkaian, endpoint, pengesahan atau togol automatik —
    /// jadi label tidak boleh mendakwa apa-apa "aktif".
    /// </summary>
    [Fact]
    public void Backend_Dikonfigurasikan_TidakMendakwaAktifAtauSambungan()
    {
        var teks = LabelBackend.Teks(klienSedia: true, konfigSediaSekarang: true, samaDenganKlien: true, sebab: "");

        Assert.Equal("Backend: konfigurasi tersedia (rahsia enjin + apiUrl sah)", teks);
        Assert.DoesNotContain("aktif", teks, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("sambung", teks, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Dapatan (A): apiUrl atau rahsia bertukar kepada nilai LAIN yang tetap sah.
    /// Kedua-dua boolean kekal benar, tetapi klien masih memakai nilai lama —
    /// label tidak boleh berkata "konfigurasi tersedia".
    /// </summary>
    [Fact]
    public void Backend_KonfigBertukarKepadaNilaiSahYangLain_MintaMulaSemula()
    {
        var teks = LabelBackend.Teks(klienSedia: true, konfigSediaSekarang: true, samaDenganKlien: false);

        Assert.Equal("Backend: konfigurasi bertukar selepas lancar — mulakan semula aplikasi untuk menggunakannya.", teks);
        Assert.NotEqual(LabelBackend.Dikonfigurasikan, teks);
    }

    /// <summary>
    /// Rangkaian penuh dapatan (A) melalui cap jari sebenar, bukan bendera yang
    /// ditulis tangan: rahsia bertukar, kedua-dua boolean kekal benar, label
    /// tetap mengesannya.
    /// </summary>
    [Fact]
    public void Backend_CapJariSebenar_MengesanPertukaranNilai()
    {
        const string url = "https://script.google.com/macros/s/AAAA/exec";
        var capKlien = CapKonfigurasiBackend.Kira(url, "rahsia-sintetik-lama");
        var capSekarang = CapKonfigurasiBackend.Kira(url, "rahsia-sintetik-baharu");

        var teks = LabelBackend.Teks(
            klienSedia: true,
            konfigSediaSekarang: true,
            samaDenganKlien: CapKonfigurasiBackend.Sepadan(capKlien, capSekarang));

        Assert.Contains("mulakan semula aplikasi", teks);
        // Nilai tidak pernah sampai ke skrin.
        Assert.DoesNotContain("rahsia-sintetik", teks, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("script.google.com", teks, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Backend_CapJariSebenar_NilaiSamaKekalDikonfigurasikan()
    {
        const string url = "https://script.google.com/macros/s/AAAA/exec";
        var cap = CapKonfigurasiBackend.Kira(url, "rahsia-sintetik-1");

        var teks = LabelBackend.Teks(true, true, CapKonfigurasiBackend.Sepadan(cap, cap));

        Assert.Equal(LabelBackend.Dikonfigurasikan, teks);
    }

    /// <summary>
    /// Gagal-tertutup: tiada rahsia boleh dibaca bermakna TIADA klaim dan TIADA
    /// penghantaran. Label mesti mengatakannya, bukan menyamar sebagai "enjin
    /// luar talian" (loopback 8747 bukan laluan penghantaran aplikasi ini).
    /// </summary>
    [Fact]
    public void Backend_TiadaRahsia_MengakuKlaimDanHantarMati()
    {
        var teks = LabelBackend.Teks(
            klienSedia: false,
            konfigSediaSekarang: false,
            samaDenganKlien: false,
            sebab: "Fail rahsia enjin tiada pada PC ini; tiada penghantaran.");

        Assert.Contains("klaim & hantar MATI", teks);
        Assert.Contains("Fail rahsia enjin tiada pada PC ini", teks);
        Assert.DoesNotContain("8747", teks);
    }

    [Fact]
    public void Backend_TiadaRahsia_TanpaSebab_MasihJujur()
    {
        var teks = LabelBackend.Teks(klienSedia: false, konfigSediaSekarang: false, samaDenganKlien: false, sebab: null);

        Assert.Equal("Backend: klaim & hantar MATI — tiada rahsia enjin pada PC ini.", teks);
    }

    /// <summary>
    /// Klien backend dibina SEKALI semasa lancar. Konfigurasi yang ditambah
    /// selepas itu tidak membolehkan penghantaran, jadi label tidak boleh
    /// mendakwa ia tersedia — ia mesti meminta mula semula.
    /// </summary>
    [Fact]
    public void Backend_KonfigBaharuSelepasLancar_TidakMendakwaSedia()
    {
        var teks = LabelBackend.Teks(klienSedia: false, konfigSediaSekarang: true, samaDenganKlien: false);

        Assert.Contains("klaim & hantar MATI", teks);
        Assert.Contains("mulakan semula aplikasi", teks);
        Assert.NotEqual(LabelBackend.Dikonfigurasikan, teks);
    }

    /// <summary>
    /// Arah sebaliknya: konfigurasi dibuang selepas lancar. Klien lama masih
    /// memegangnya, jadi berkata "MATI" adalah salah — label meminta mula semula
    /// untuk mengesahkan.
    /// </summary>
    [Fact]
    public void Backend_KonfigDibuangSelepasLancar_TidakMendakwaMati()
    {
        var teks = LabelBackend.Teks(klienSedia: true, konfigSediaSekarang: false, samaDenganKlien: false, sebab: "apa-apa sebab");

        Assert.DoesNotContain("klaim & hantar MATI", teks);
        Assert.Contains("mulakan semula aplikasi", teks);
    }

    /// <summary>
    /// Status rahsia enjin SEBENAR (bukan teks yang direka) ialah sumber label
    /// ini — dan ia tidak pernah membawa rahsia atau URL. Diuji terhadap folder
    /// kosong: tiada fail = gagal-tertutup.
    /// </summary>
    [Fact]
    public void Backend_DaripadaStatusSebenar_GagalTertutupBilaTiadaFail()
    {
        var dir = Path.Combine(Path.GetTempPath(), "hadir-ujian-label-backend-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try
        {
            var status = new DpapiRahsiaEnjinStore(dir).Status();

            Assert.False(status.Sedia);
            var teks = LabelBackend.Teks(
                klienSedia: false,
                konfigSediaSekarang: status.Sedia,
                samaDenganKlien: false,
                sebab: status.Sebab);
            Assert.Contains("klaim & hantar MATI", teks);
            Assert.StartsWith(LabelBackend.Awalan, teks, StringComparison.Ordinal);

            // Sebab daripada Status() kekal BEBAS-NILAI selepas perubahan (A).
            Assert.DoesNotContain("http", status.Sebab, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("script.google.com", status.Sebab, StringComparison.OrdinalIgnoreCase);
        }
        finally
        {
            Directory.Delete(dir, recursive: true);
        }
    }
}

/// <summary>
/// Pengawal SUMBER untuk pembersihan 1.0.9. Bar status pemilik tidak boleh
/// memaparkan sisa demo pada pemasangan yang MENULIS ke MOEIS, panel
/// "Pendaftaran PC" tidak boleh kembali selagi backend pc* tiada di pelayan
/// (semua butangnya mati), dan pemasa paparan tidak boleh berubah menjadi
/// denyutan kerja kedua. Ujian ini memeriksa teks sumber kerana MainForm
/// memerlukan message-loop untuk dibina.
/// </summary>
public class BarStatusBersihTests
{
    private static string DesktopDir()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null && !File.Exists(Path.Combine(dir.FullName, "publish.ps1")))
        {
            dir = dir.Parent;
        }
        return dir?.FullName ?? throw new InvalidOperationException("Tidak jumpa direktori desktop (publish.ps1).");
    }

    private static string SumberMainForm() =>
        BuangKomen(File.ReadAllText(Path.Combine(DesktopDir(), "HadirDesktop", "MainForm.cs")));

    /// <summary>Nilai Kleene 3-keadaan untuk ungkapan <c>#if</c>.</summary>
    private enum Ternari { Benar, Salah, TidakDiketahui }

    private sealed class BingkaiIf
    {
        /// <summary>Cabang semasa benar-benar dikompil bawah Release.</summary>
        public bool Aktif;
        /// <summary>Satu cabang sudah dinilai benar (tutup #elif/#else seterusnya).</summary>
        public bool Diambil;
        /// <summary>Semua syarat setakat ini DIKETAHUI salah (jadual #else boleh dipercayai).</summary>
        public bool SalahDiketahui;
    }

    private static bool IndukAktif(List<BingkaiIf> t, int indeks) =>
        indeks == 0 || t[indeks - 1].Aktif;

    /// <summary>
    /// Proses satu baris direktif praproses terhadap rangka bingkai.
    /// Terima kasih GPT-6-SOL pusingan 6-7: evaluator BEBAS-KONFIGURASI —
    /// tiada identiti (DEBUG dsb.) dipercayai, jadi perubahan semantik
    /// ujian/Release/#define masa depan tidak pernah menukar hasil.
    /// Komen hujung baris dibuang dahulu ("#if false // nota" = literal
    /// false yang sebenar).
    /// </summary>
    private static void ProsesDirektif(string potong, List<BingkaiIf> t)
    {
        // Buang komen hujung baris sebelum menilai, supaya "#if false // nota"
        // kekal literal false yang DIKETAHUI (bukan sisa → TidakDiketahui).
        var komen = potong.IndexOf("//", StringComparison.Ordinal);
        var blok = potong.IndexOf("/*", StringComparison.Ordinal);
        if (blok >= 0 && (komen < 0 || blok < komen)) komen = blok;
        if (komen >= 0) potong = potong[..komen];

        // Normalkan ruang selepas "#": spesifikasi C# menerima "# if false"
        // sebagai #if false (GPT-6-SOL pusingan 10 — tanpa ini push terlepas
        // lalu "#endif" pertama menutup bingkai luar awal = hijau senyap;
        // LewatiRuang meliputi tab/jenak lain juga).
        var j = 1; // potong[0] ialah '#'
        LewatiRuang(potong, ref j);
        potong = "#" + potong[j..];

        if (potong.StartsWith("#if", StringComparison.Ordinal))
        {
            var nilai = NilaiSyaratRelease(potong[3..]);
            var induk = IndukAktif(t, t.Count);
            var benar = nilai == Ternari.Benar && induk;
            t.Add(new BingkaiIf
            {
                Aktif = benar,
                Diambil = benar,
                SalahDiketahui = nilai == Ternari.Salah,
            });
            return;
        }
        if (potong.StartsWith("#elif", StringComparison.Ordinal))
        {
            if (t.Count == 0) return; // rosak — abaikan
            var b = t[^1];
            if (b.Diambil || !b.SalahDiketahui)
            {
                b.Aktif = false;
                return;
            }
            var nilai = NilaiSyaratRelease(potong[5..]);
            var induk = IndukAktif(t, t.Count - 1);
            b.Aktif = nilai == Ternari.Benar && induk;
            b.Diambil = b.Aktif;
            if (nilai != Ternari.Salah) b.SalahDiketahui = false;
            return;
        }
        if (potong.StartsWith("#else", StringComparison.Ordinal))
        {
            if (t.Count == 0) return; // rosak — abaikan
            var b = t[^1];
            var induk = IndukAktif(t, t.Count - 1);
            b.Aktif = !b.Diambil && b.SalahDiketahui && induk;
            if (b.Aktif) b.Diambil = true;
            return;
        }
        if (potong.StartsWith("#endif", StringComparison.Ordinal))
        {
            if (t.Count > 0) t.RemoveAt(t.Count - 1);
        }
        // "#region"/"#pragma" dsb. sengaja diabaikan: tiada kesan pengumpulan.
    }

    /// <summary>
    /// Nilai ungkapan <c>#if</c> (3-nilai Kleene) HANYA berasaskan fakta
    /// bebas-konfigurasi: literal <c>true</c> dan <c>false</c>, dan algebra
    /// <c>!</c>/<c>&amp;&amp;</c>/<c>||</c>/<c>()</c> ke atasnya. SEMUA
    /// identiti (DEBUG, TRACE, simbol masa depan) → TidakDiketahui; pemalar
    /// tak dikenal, pengendali ganjil, atau sisa → TidakDiketahui.
    /// Keputusan pemanggil: TidakDiketahui = BUANG konstruk (gagal merah),
    /// bukan simpan — supaya perubahan DefineConstants/#define masa depan
    /// tidak pernah menukar hijau-senyap kepada wirinya tiada dalam terbitan.
    /// </summary>
    private static Ternari NilaiSyaratRelease(string s)
    {
        var i = 0;
        try
        {
            var v = BacaAtau(s, ref i);
            LewatiRuang(s, ref i);
            return i == s.Length ? v : Ternari.TidakDiketahui;
        }
        catch (FormatException)
        {
            return Ternari.TidakDiketahui;
        }
    }

    private static Ternari BacaAtau(string s, ref int i)
    {
        var v = BacaDan(s, ref i);
        while (true)
        {
            LewatiRuang(s, ref i);
            if (i + 1 >= s.Length || s[i] != '|' || s[i + 1] != '|') return v;
            i += 2;
            var r = BacaDan(s, ref i);
            v = GabungOr(v, r);
        }
    }

    private static Ternari BacaDan(string s, ref int i)
    {
        var v = BacaTunjang(s, ref i);
        while (true)
        {
            LewatiRuang(s, ref i);
            if (i + 1 >= s.Length || s[i] != '&' || s[i + 1] != '&') return v;
            i += 2;
            var r = BacaTunjang(s, ref i);
            v = GabungDan(v, r);
        }
    }

    private static Ternari BacaTunjang(string s, ref int i)
    {
        LewatiRuang(s, ref i);
        if (i >= s.Length) throw new FormatException();
        var c = s[i];
        if (c == '!')
        {
            i++;
            return Balik(BacaTunjang(s, ref i));
        }
        if (c == '(')
        {
            i++;
            var v = BacaAtau(s, ref i);
            LewatiRuang(s, ref i);
            if (i >= s.Length || s[i] != ')') throw new FormatException();
            i++;
            return v;
        }
        if (char.IsLetter(c) || c == '_')
        {
            var mula = i;
            while (i < s.Length && (char.IsLetterOrDigit(s[i]) || s[i] == '_')) i++;
            var nama = s[mula..i];
            if (nama == "true") return Ternari.Benar;
            if (nama == "false") return Ternari.Salah;
            // SEMUA identiti lain — termasuk DEBUG dan TRACE — TIDAK
            // DIPERCAYAI (pusingan 7 GPT-6-SOL): keputusan "DEBUG sentiasa
            // salah" menjadi salah jika binaan MASA DEPAN menambah
            // DefineConstants atau sumber menambah #define DEBUG. Evaluator
            // hanya mempercayai fakta BEBAS-KONFIGURASI (literal) → mana-mana
            // syarat identiti membuang konstruk → gagal merah-jujur hari ini,
            // kekal betul walau konfigurasi berubah.
            return Ternari.TidakDiketahui;
        }
        throw new FormatException();
    }

    private static void LewatiRuang(string s, ref int i)
    {
        while (i < s.Length && char.IsWhiteSpace(s[i])) i++;
    }

    private static Ternari Balik(Ternari v) =>
        v == Ternari.Benar ? Ternari.Salah : v == Ternari.Salah ? Ternari.Benar : Ternari.TidakDiketahui;

    private static Ternari GabungDan(Ternari a, Ternari b) =>
        a == Ternari.Salah || b == Ternari.Salah ? Ternari.Salah
        : a == Ternari.Benar && b == Ternari.Benar ? Ternari.Benar
        : Ternari.TidakDiketahui;

    private static Ternari GabungOr(Ternari a, Ternari b) =>
        a == Ternari.Benar || b == Ternari.Benar ? Ternari.Benar
        : a == Ternari.Salah && b == Ternari.Salah ? Ternari.Salah
        : Ternari.TidakDiketahui;

    /// <summary>Mod lexik BuangKomen — rangka bertindan merentas baris.</summary>
    private enum ModLex { Kod, KomenBlok, KomenBaris, Rentetan, Aksara, Lubang }

    private sealed class BingkaiMod
    {
        public ModLex Jenis;
        /// <summary>Rentetan mentah: bilangan tanda kutip penutup (3 atau lebih).</summary>
        public int Kudis;
        /// <summary>At-sign verbatim: kutip berganda menyalin sebutan, tiada lolos belakang miring.</summary>
        public bool Verbatim;
        /// <summary>Dollar interpolasi: kurung kurawal membuka lubang ekspresi.</summary>
        public bool Interpolasi;
        /// <summary>Lubang: kitaran buka-tutup kurawal semasa (1 = luar).</summary>
        public int Kedalaman;
    }

    /// <summary>
    /// Buang KOMEN (baris + blok) dan teks direktif praproses, melalui LEXER
    /// sebenar merentas baris (GPT-6-SOL pusingan 8): rentetan biasa (lolos
    /// belakang miring), at-sign verbatim (kutip berganda, boleh rentas baris),
    /// rentetan mentah (larian kutip sepanjang N, boleh rentas baris), dollar
    /// interpolasi (lubang kurawal berkitar dengan rentetan/komen bersarang di
    /// dalamnya) dan literal aksara. Kandungan rentetan DIKELUARKAN kerana
    /// guard menuntutnya (mis. "Portal Fixture" mesti kelihatan kepada
    /// DoesNotContain); direktif #if/#elif/#else/#endif HANYA diproses pada
    /// permulaan baris dalam mod-kod ARAS LUAR — "#endif" sebagai teks di
    /// dalam rentetan verbatim/mentah tidak menutup bingkai (vektor pusingan
    /// 8), dan "bintang-slas"/"slas-slas" dalam rentetan bukan komen. SEKSYEN
    /// #if TIDAK AKTIF (pusingan 9): hanya direktif baris-mula dikenali —
    /// rentetan/komen TIDAK dileksis di situ, sama seperti kompilator C#
    /// (jika dileksis, rentetan menyembunyikan "#if" bersarang lalu "#endif"
    /// pertama menutup bingkai LUAR awal = wirinya dikekalkan walau Release
    /// tidak mengompilnya — hijau senyap; penemuan Codex pusingan 9).
    /// Newline sentiasa dikekalkan. Had
    /// terdokumen: pemalar #if bergantung-identiti memang sengaja dibuang
    /// (pusingan 7), rentetan mentah BERINTERPOLASI ditolak secara eksplisit
    /// (FormatException, gagal merah-jujur; lubang bersarang belum dimodelkan),
    /// dan rentetan tak-berpasangan menelan baki fail (gagal merah-jujur —
    /// binaan C# akan gagal dahulu).
    /// </summary>
    private static string BuangKomen(string sumber)
    {
        // Semua pemisah baris C# (CR, LF, CRLF, NEL U+0085, LS U+2028, PS
        // U+2029) -> \n. Tanpa ini, "#if false\r#if true" menjadi SATU baris
        // direktif lalu push dalaman terlepas, "#endif" pertama menutup
        // bingkai luar awal = hijau senyap (GPT-6-SOL pusingan 11, arah (a);
        // LS/PS/NEL membawa vektor identik — dinafkan proaktif di sini).
        sumber = sumber.Replace("\r\n", "\n")
            .Replace("\r", "\n")
            .Replace("\u0085", "\n")
            .Replace("\u2028", "\n")
            .Replace("\u2029", "\n");
        var keluar = new System.Text.StringBuilder(sumber.Length);
        var mod = new List<BingkaiMod> { new BingkaiMod { Jenis = ModLex.Kod } };
        var t = new List<BingkaiIf>();
        var barisMula = true;
        var i = 0;

        while (i < sumber.Length)
        {
            var c = sumber[i];

            // Newline sentiasa dikekalkan (struktur baris dipulihara seperti
            // versi berasaskan-baris dahulu) dan MENUTUP komen baris terbuka.
            if (c == '\n')
            {
                if (mod[^1].Jenis == ModLex.KomenBaris) mod.RemoveAt(mod.Count - 1);
                keluar.Append('\n');
                barisMula = true;
                i++;
                continue;
            }

            var atas = mod[^1];
            var bolehEmit = t.Count == 0 || t[^1].Aktif;

            // SEKSYEN DILANGKAU (GPT-6-SOL pusingan 9): kompilator C# hanya
            // mengenali direktif bersarang di sini — rentetan/komen TIDAK
            // dileksis (spesifikasi C#, conditional compilation). Jika lexer
            // tetap masuk mod rentetan, contoh @"" menyembunyikan "#if"
            // (push) sedangkan "#endif" pertama kelihatan → bingkai luar
            // tertutup AWAL dan wirinya dikecualikan-keluar walau Release
            // tidak mengompilnya (hijau senyap — penemuan Codex pusingan 9).
            // Maka: tiada mod lain dibuka; hanya ruang, baris-mula dan
            // direktif yang dikenali, dan tiada aksara dieja keluar.
            if (!bolehEmit)
            {
                if (c == '#')
                {
                    if (barisMula)
                    {
                        var hujung = sumber.IndexOf('\n', i);
                        if (hujung < 0) hujung = sumber.Length;
                        ProsesDirektif(sumber[i..hujung], t);
                        barisMula = false;
                        i = hujung;
                        continue;
                    }
                    barisMula = false;
                    i++;
                    continue;
                }
                if (char.IsWhiteSpace(c))
                {
                    i++; // ruang tidak mengubah baris-mula dan tidak dieja keluar
                    continue;
                }
                barisMula = false;
                i++;
                continue;
            }

            if (atas.Jenis == ModLex.KomenBlok)
            {
                if (c == '*' && i + 1 < sumber.Length && sumber[i + 1] == '/')
                {
                    mod.RemoveAt(mod.Count - 1);
                    i += 2;
                }
                else
                {
                    if (!char.IsWhiteSpace(c)) barisMula = false;
                    i++;
                }
                continue;
            }

            if (atas.Jenis == ModLex.KomenBaris)
            {
                if (!char.IsWhiteSpace(c)) barisMula = false;
                i++;
                continue;
            }

            if (atas.Jenis == ModLex.Rentetan)
            {
                if (atas.Kudis >= 3)
                {
                    // Rentetan mentah: penutup ialah larian tepat Kudis kutip.
                    if (c == '"')
                    {
                        var k = 0;
                        while (i + k < sumber.Length && sumber[i + k] == '"') k++;
                        if (k >= atas.Kudis)
                        {
                            if (bolehEmit) keluar.Append(sumber, i, atas.Kudis);
                            mod.RemoveAt(mod.Count - 1);
                            i += atas.Kudis;
                            continue;
                        }
                    }
                    if (bolehEmit) keluar.Append(c);
                    i++;
                    continue;
                }

                if (atas.Verbatim && c == '"')
                {
                    if (i + 1 < sumber.Length && sumber[i + 1] == '"')
                    {
                        // Kutip berganda = sebutan (bukan penutup).
                        if (bolehEmit) keluar.Append("\"\"");
                        i += 2;
                        continue;
                    }
                    if (bolehEmit) keluar.Append('"');
                    mod.RemoveAt(mod.Count - 1);
                    i++;
                    continue;
                }

                if (!atas.Verbatim && c == '\\' && i + 1 < sumber.Length)
                {
                    if (bolehEmit) keluar.Append(c).Append(sumber[i + 1]);
                    i += 2;
                    continue;
                }

                if (c == '"')
                {
                    if (bolehEmit) keluar.Append('"');
                    mod.RemoveAt(mod.Count - 1);
                    i++;
                    continue;
                }

                if (atas.Interpolasi && c == '{')
                {
                    if (i + 1 < sumber.Length && sumber[i + 1] == '{')
                    {
                        // Kurawal berganda = sebutan dalam rentetan interpolasi.
                        if (bolehEmit) keluar.Append('{').Append('{');
                        i += 2;
                        continue;
                    }
                    mod.Add(new BingkaiMod { Jenis = ModLex.Lubang, Kedalaman = 1 });
                    if (bolehEmit) keluar.Append('{');
                    i++;
                    continue;
                }

                if (bolehEmit) keluar.Append(c);
                i++;
                continue;
            }

            if (atas.Jenis == ModLex.Aksara)
            {
                if (c == '\\' && i + 1 < sumber.Length)
                {
                    if (bolehEmit) keluar.Append(c).Append(sumber[i + 1]);
                    i += 2;
                    continue;
                }
                if (c == '\'')
                {
                    if (bolehEmit) keluar.Append('\'');
                    mod.RemoveAt(mod.Count - 1);
                }
                else if (bolehEmit)
                {
                    keluar.Append(c);
                }
                i++;
                continue;
            }

            if (atas.Jenis != ModLex.Kod && atas.Jenis != ModLex.Lubang)
            {
                i++;
                continue;
            }

            var lubang = atas.Jenis == ModLex.Lubang;

            // Direktif praproses: HANYA dalam mod-kod aras luar pada baris
            // baharu (bukan dalam lubang, rentetan atau komen). Teksnya tidak
            // dikeluarkan — perlakuan baris-kosong versi lama dikekalkan.
            if (!lubang && barisMula && c == '#')
            {
                var hujung = sumber.IndexOf('\n', i);
                if (hujung < 0) hujung = sumber.Length;
                ProsesDirektif(sumber[i..hujung], t);
                barisMula = false;
                i = hujung;
                continue;
            }

            if (c == '/' && i + 1 < sumber.Length && sumber[i + 1] == '/')
            {
                mod.Add(new BingkaiMod { Jenis = ModLex.KomenBaris });
                barisMula = false;
                i += 2;
                continue;
            }

            if (c == '/' && i + 1 < sumber.Length && sumber[i + 1] == '*')
            {
                mod.Add(new BingkaiMod { Jenis = ModLex.KomenBlok });
                barisMula = false;
                i += 2;
                continue;
            }

            if (c == '"')
            {
                // Sisipan sebelum kutip: hanya dianggap sisipan apabila bukan
                // akhir pengenal (cth. pengenal "a$" tidak membuat interpolasi).
                var sebelum = i > 0 ? sumber[i - 1] : '\0';
                var sebelum2 = i > 1 ? sumber[i - 2] : '\0';
                var sebelum3 = i > 2 ? sumber[i - 3] : '\0';
                static bool Ident(char ch) => char.IsLetterOrDigit(ch) || ch == '_';

                var verbatim = sebelum == '@';
                var interp = sebelum == '$' && !(i >= 2 && Ident(sebelum2));
                if ((sebelum == '@' || sebelum == '$') &&
                    (sebelum2 == '@' || sebelum2 == '$') && sebelum2 != sebelum)
                {
                    if (sebelum2 == '@') verbatim = true;
                    else if (!(i >= 3 && Ident(sebelum3))) interp = true;
                }

                var k = 0;
                while (i + k < sumber.Length && sumber[i + k] == '"') k++;

                if (verbatim)
                {
                    // Keutamaan aturan kutip VERBATIM apabila awalan @ hadir
                    // (GPT-6-SOL pusingan 12): @"""" ialah rentetan verbatim
                    // LENGKAP (kandungan "), BUKAN pembuka rentetan-mentah-4 —
                    // rentetan mentah C# hanya memakai $ (tiada @). Pengira
                    // larian-N hanya untuk rentetan TANPA @; di sini buka
                    // dengan SATU kutip, kemudian rangka verbatim menilai ""
                    // (sebutan) dan " (penutup) seperti kompilator.
                    if (bolehEmit) keluar.Append('"');
                    mod.Add(new BingkaiMod
                    {
                        Jenis = ModLex.Rentetan,
                        Kudis = 1,
                        Verbatim = true,
                        Interpolasi = interp,
                    });
                    i++;
                }
                else if (k >= 3)
                {
                    // Rentetan mentah berinterpolasi boleh mengandungi lubang
                    // ekspresi serta rentetan mentah bersarang. Lexer guard ini
                    // belum memodelkannya: gagal tertutup, jangan sekali-kali
                    // melaporkan wiring aktif daripada rangka #if yang salah.
                    if (interp) throw new FormatException("Rentetan mentah berinterpolasi tidak disokong oleh guard.");
                    // Rentetan mentah biasa: keseluruhan larian ialah pengapit buka.
                    if (bolehEmit) keluar.Append(sumber, i, k);
                    mod.Add(new BingkaiMod { Jenis = ModLex.Rentetan, Kudis = k });
                    i += k;
                }
                else if (k == 2)
                {
                    // Rentetan kosong ("") — kedua-dua kutip ialah pengapit.
                    if (bolehEmit) keluar.Append("\"\"");
                    i += 2;
                }
                else
                {
                    if (bolehEmit) keluar.Append('"');
                    mod.Add(new BingkaiMod
                    {
                        Jenis = ModLex.Rentetan,
                        Kudis = 1,
                        Verbatim = verbatim,
                        Interpolasi = interp,
                    });
                    i++;
                }
                barisMula = false;
                continue;
            }

            if (c == '\'')
            {
                if (bolehEmit) keluar.Append('\'');
                mod.Add(new BingkaiMod { Jenis = ModLex.Aksara });
                barisMula = false;
                i++;
                continue;
            }

            if (lubang && c == '{')
            {
                atas.Kedalaman++;
                if (bolehEmit) keluar.Append(c);
                i++;
                continue;
            }

            if (lubang && c == '}')
            {
                atas.Kedalaman--;
                if (bolehEmit) keluar.Append(c);
                i++;
                if (atas.Kedalaman <= 0) mod.RemoveAt(mod.Count - 1);
                continue;
            }

            if (char.IsWhiteSpace(c))
            {
                if (bolehEmit) keluar.Append(c);
                i++;
                continue;
            }

            barisMula = false;
            if (bolehEmit) keluar.Append(c);
            i++;
        }

        return keluar.ToString();
    }

    /// <summary>
    /// GPT-6-SOL pusingan 8: "#endif" sebagai TEKS di dalam rentetan verbatim
    /// merentas baris bukan direktif (spesifikasi C#: direktif tidak diproses
    /// dalam rentetan). Bukaan "#if true" kekal terbuka sehingga "#endif"
    /// sebenar, jadi "#else" sah dan cabang yang TIDAK dikompil mesti gugur —
    /// bukan lolos sebagai kod aktif (hijau senyap dengan wirinya tiada dalam
    /// terbitan).
    /// </summary>
    [Fact]
    public void BuangKomen_DirektifDalamRentetanVerbatim_TidakMenutupBingkai()
    {
        const string wiring = "_pemasaLabelKitaran.Tick += PemasaLabelKitaran_Tick;";
        var kodi =
            "    #if true\n" +
            "    var pesan = @\"\n" +
            "#endif\n" +
            "\";\n" +
            "    #else\n" +
            "    " + wiring + "\n" +
            "    #endif\n";

        Assert.DoesNotContain(wiring, BuangKomen(kodi));
    }

    /// <summary>
    /// Varian pusingan 8 untuk rentetan MENTAH (tiga kutip, rentas baris):
    /// garis "#endif"/"#else" di dalam kandungan tidak menutup bingkai.
    /// </summary>
    [Fact]
    public void BuangKomen_DirektifDalamRentetanMentah_TidakMenutupBingkai()
    {
        const string wiring = "_pemasaLabelKitaran.Tick += PemasaLabelKitaran_Tick;";
        var kodi =
            "    #if true\n" +
            "    var teks = \"\"\"\n" +
            "#endif\n" +
            "#else\n" +
            "\"\"\";\n" +
            "    #else\n" +
            "    " + wiring + "\n" +
            "    #endif\n";

        Assert.DoesNotContain(wiring, BuangKomen(kodi));
    }

    /// <summary>
    /// "slas-slas" di dalam rentetan verbatim merentas baris ialah KANDUNGAN,
    /// bukan komen — penulis berasaskan-baris membuangnya (baris bermula dengan
    /// slas-slas) dan memecahkan guard yang menuntut teks rentetan.
    /// </summary>
    [Fact]
    public void BuangKomen_SlasGandaDalamRentetanVerbatim_Dikekal()
    {
        var kodi = "    var pesan = @\"\n    // bukan komen\n    \";\n    var x = 1;\n";
        var ditapis = BuangKomen(kodi);

        Assert.Contains("// bukan komen", ditapis);
        Assert.Contains("var x = 1;", ditapis);
    }

    /// <summary>
    /// Komen hujung pada baris direktif tidak mengaburkan penilaian literal:
    /// "#if false // nota" tetap Salah DIKETAHUI (jadi "#else" dipercayai), dan
    /// "#if true // nota" tetap Benar (cabang "#else" gugur).
    /// </summary>
    [Fact]
    public void BuangKomen_DirektifDenganKomenHujung_KekalDinilai()
    {
        const string wiring = "_pemasaLabelKitaran.Tick += PemasaLabelKitaran_Tick;";

        Assert.Contains(wiring, BuangKomen(
            "    #if false // nota\n    x();\n    #else\n    " + wiring + "\n    #endif\n"));
        Assert.DoesNotContain(wiring, BuangKomen(
            "    #if true // nota\n    x();\n    #else\n    " + wiring + "\n    #endif\n"));
    }

    /// <summary>
    /// GPT-6-SOL pusingan 9 (vektor hijau-senyap): dalam seksyen #if TIDAK
    /// AKTIF kompilator mengenali direktif BERSARANG tetapi TIDAK meleksis
    /// rentetan/komen. Jika lexer masuk mod rentetan di sini, contoh @""
    /// menyembunyikan "#if true" (push) lalu "#endif" pertama menutup bingkai
    /// LUAR awal → wiring dikekalkan walau Release tidak mengompilnya.
    /// Rentetan dalam kes ini BERPASANGAN (bukan kerosakan fail).
    /// </summary>
    [Fact]
    public void BuangKomen_SeksyenTidakAktif_HanyaDirektifDikenali()
    {
        const string wiring = "_pemasaLabelKitaran.Tick += PemasaLabelKitaran_Tick;";

        // Vektor tepat Codex pusingan 9: push terlepas, pop kelihatan →
        // bingkai luar mesti KEKAL menutup wirinya sehingga #endif sebenar.
        Assert.DoesNotContain(wiring, BuangKomen(
            "    #if false\n" +
            "    var contoh = @\"\n" +
            "    #if true\n" +
            "    \";\n" +
            "    #endif\n" +
            "    " + wiring + "\n" +
            "    #endif\n"));

        // Baris bermula "//" bukan direktif (tanda # bukan aksara pertama)
        // — "#endif" di situ tidak menutup bingkai dalam seksyen dilangkau.
        Assert.DoesNotContain(wiring, BuangKomen(
            "    #if false\n    // #endif\n    " + wiring + "\n    #endif\n"));

        // Kawalan arah: selepas #endif SEBENAR tiada bingkai → kod biasa
        // keluar semula (guard menuntutnya LULUS — tiada merah-senyap).
        Assert.Contains("var selepas = 1;", BuangKomen(
            "    #if false\n    #endif\n    var selepas = 1;\n"));
    }

    /// <summary>
    /// GPT-6-SOL pusingan 10: spesifikasi C# menerima ruang selepas "#"
    /// ("# if false" = #if false). Tanpa normalisasi, PUSH terlepas lalu
    /// "#endif" pertama menutup bingkai LUAR awal → wirinya dikekalkan walau
    /// Release tidak mengompilnya (hijau senyap — kelas push-hilang/pop-nampak
    /// yang sama seperti pusingan 9, kali ini melalui tokenisasi "#").
    /// </summary>
    [Fact]
    public void BuangKomen_DirektifRuangSelepasPagar_Dinilai()
    {
        const string wiring = "_pemasaLabelKitaran.Tick += PemasaLabelKitaran_Tick;";

        // Push berjarak mesti dikesan dalam seksyen AKTIF → wirinya gugur.
        Assert.DoesNotContain(wiring, BuangKomen(
            "    # if false\n    " + wiring + "\n    # endif\n"));

        // Vektor tepat pusingan 10: push dalaman berjarak dalam seksyen
        // tak-aktif — #endif pertama mesti membuang bingkai DALAMAN sahaja.
        Assert.DoesNotContain(wiring, BuangKomen(
            "    #if false\n    # if true\n    #endif\n    " + wiring + "\n    #endif\n"));

        // Kawalan arah: selepas #endif berjarak sebenar, kod keluar semula.
        Assert.Contains("var selepas = 1;", BuangKomen(
            "    # if false\n    # endif\n    var selepas = 1;\n"));
    }

    /// <summary>
    /// GPT-6-SOL pusingan 11: C# menerima ENAM pemisah baris (CR, LF, CRLF,
    /// NEL U+0085, LS U+2028, PS U+2029). Tanpa normalisasi, "#if false\r"
    /// "#if true" menjadi SATU baris direktif → push dalaman terlepas lalu
    /// "#endif" pertama menutup bingkai LUAR awal (hijau senyap, arah (a)).
    /// LS/PS dinafkan proaktif — vektor identik melalui pemisah yang sama.
    /// </summary>
    [Fact]
    public void BuangKomen_PemisahBarisCsharp_DikenaliSemua()
    {
        const string wiring = "_pemasaLabelKitaran.Tick += PemasaLabelKitaran_Tick;";

        // Vektor tepat pusingan 11: CR tunggal di antara dua arahan #if.
        Assert.DoesNotContain(wiring, BuangKomen(
            "#if false\r#if true\n#endif\n" + wiring + "\n#endif\n"));

        // Proaktif: LS (U+2028) — pemisah sah C#, vektor identik.
        Assert.DoesNotContain(wiring, BuangKomen(
            "#if false\u2028#if true\n#endif\n" + wiring + "\n#endif\n"));

        // Kawalan: CRLF biasa kekal betul — selepas #endif sebenar kod keluar.
        Assert.Contains("var selepas = 1;", BuangKomen(
            "#if false\r\n#endif\r\nvar selepas = 1;\n"));
    }

    /// <summary>
    /// GPT-6-SOL pusingan 12: at-sign + empat kutip (ditulis \u0022) ialah
    /// rentetan verbatim LENGKAP (kandungan satu kutip), BUKAN pembuka
    /// rentetan-mentah-4 — rentetan mentah C# hanya memakai $ (tiada @).
    /// Tanpa keutamaan awalan at-sign, larian empat kutip membuka rentetan
    /// mentah lalu "#if false" berikutnya menjadi content → push terlepas →
    /// wiring dikekalkan walau Release membuangnya (hijau senyap, arah (a)).
    /// </summary>
    [Fact]
    public void BuangKomen_PrefixAtSign_KutipVerbatimDidahulukan()
    {
        const string wiring = "_pemasaLabelKitaran.Tick += PemasaLabelKitaran_Tick;";

        // Vektor tepat pusingan 12: rentetan at-sign lengkap (empat kutip)
        // mengapit arahan #if — push mesti tetap dikesan di tengah-tengah.
        var sLengkap = "var s = @\u0022\u0022\u0022\u0022;\n";
        Assert.DoesNotContain(wiring, BuangKomen(
            sLengkap +
            "#if false\n" +
            sLengkap +
            "    " + wiring + "\n" +
            "    #endif\n"));

        // Kawalan: rentetan itu LENGKAP pada barisnya — tanpa arahan #if,
        // kod selepas baris mesti keluar (jika ia membuka rentetan mentah
        // tak-berpasangan, kandungan selepasnya tertelan → assert gagal).
        Assert.Contains("var selepas = 1;", BuangKomen(
            sLengkap + "var selepas = 1;\n"));
    }

    [Fact]
    public void BuangKomen_RentetanMentahBerinterpolasi_GagalTertutup()
    {
        // Lubang ekspresi boleh mengandungi rentetan mentah bersarang; pengimbas
        // yang tidak memahami lubang itu boleh menutup #if terlalu awal.
        const string sumber = "#if true\nvar s = $\"\"\"\n{\n\"\"\"\n#endif\n\"\"\"\n}\n\"\"\";\n#else\n_pemasaLabelKitaran.Tick += PemasaLabelKitaran_Tick;\n#endif\n";
        Assert.Throws<FormatException>(() => BuangKomen(sumber));
    }

    [Fact]
    public void MainForm_TiadaButangPortalFixture()
    {
        Assert.DoesNotContain("Portal Fixture", SumberMainForm());
    }

    [Fact]
    public void MainForm_TiadaPemilihSumberSimulasi()
    {
        Assert.DoesNotContain("Sumber: ", SumberMainForm());
    }

    /// <summary>
    /// Guard mesti tahan-KOMEN (dapatan GPT-6-SOL pusingan 3): baris wiring
    /// yang dikomen gugur, wirinya yang aktif kekal dikesan, dan rentetan
    /// "http://" pada baris aktif tidak rosak oleh penapis.
    /// </summary>
    [Fact]
    public void BuangKomen_MenggugurkanWiringDikomen_MengekalkanWiringAktif()
    {
        const string wiring = "_pemasaLabelKitaran.Tick += PemasaLabelKitaran_Tick;";
        var mentah =
            "class X {\n" +
            "    " + wiring + "\n" +
            "    // " + wiring + "\n" +
            "    var url = \"http://127.0.0.1:8747/\";\n" +
            "}\n";

        var ditapis = BuangKomen(mentah);

        var bilangan = ditapis.Split(new[] { wiring }, StringSplitOptions.None).Length - 1;
        Assert.Equal(1, bilangan);
        Assert.Contains("http://127.0.0.1:8747/", ditapis);
    }

    /// <summary>
    /// Skenario tepat reviewer: KOMENKAN wirinya pada sumber MainForm sebenar
    /// — penapis mesti menghilangkan penanda itu (bukti guard akan GAGAL dan
    /// menangkap regresi, bukan lulus senyap-senyap), sementara kawalan pada
    /// sumber sebenar yang belum dikomen kekal dikesan.
    /// </summary>
    [Fact]
    public void GuardTahanKomen_WiringMainFormDikomen_TidakLagiDikesan()
    {
        const string wiring = "_pemasaLabelKitaran.Tick += PemasaLabelKitaran_Tick;";
        var mentah = File.ReadAllText(Path.Combine(DesktopDir(), "HadirDesktop", "MainForm.cs"));

        var dikomen = mentah.Replace(wiring, "// " + wiring);

        Assert.DoesNotContain(wiring, BuangKomen(dikomen));
        Assert.Contains(wiring, BuangKomen(mentah));
    }

    /// <summary>
    /// Varian pusingan 4 (GPT-6-SOL): komen EKOR pada baris C# sah masih
    /// membawa rentetan wiring — penapis mesti memotong dari "//" di luar
    /// rentetan hingga hujung baris, bukan hanya baris yang bermula "//".
    /// </summary>
    [Fact]
    public void BuangKomen_KomenEkorPadaBarisSah_JugaMenggugurkanPenanda()
    {
        const string wiring = "_pemasaLabelKitaran.Tick += PemasaLabelKitaran_Tick;";
        var ditapis = BuangKomen("    Sambung(); // " + wiring + "\n");

        Assert.DoesNotContain(wiring, ditapis);
        Assert.Contains("Sambung();", ditapis);
    }

    /// <summary>
    /// PENEMUAN BARU pusingan 4: literal "/*" di dalam rentetan tidak boleh
    /// memakan kod sihat selepasnya (regex blok lama boleh melakukannya).
    /// </summary>
    [Fact]
    public void BuangKomen_LiteralBlokDalamRentetan_TidakMemakanKodSihat()
    {
        const string wiring = "_pemasaLabelKitaran.Tick += PemasaLabelKitaran_Tick;";
        var fixture = "    var pola = \"/*\";\n    " + wiring + "\n";

        Assert.Contains(wiring, BuangKomen(fixture));
    }

    /// <summary>
    /// Blok komentar benar-benar rentetan-lini: baris selepas "/*" tanpa
    /// "*/" gugur sehingga penutup, kemudian kod aktif dikesan semula.
    /// </summary>
    [Fact]
    public void BuangKomen_BlokRentetanLini_MenggugurHanyaBarisDalamBlok()
    {
        const string wiring = "_pemasaLabelKitaran.Tick += PemasaLabelKitaran_Tick;";
        var fixture = "    /* mula\n    // tengah\n    */\n    " + wiring + "\n";

        Assert.Contains(wiring, BuangKomen(fixture));
        Assert.DoesNotContain("tengah", BuangKomen(fixture));
    }

    /// <summary>
    /// Pusingan 5-7 (GPT-6-SOL): "false"/"DEBUG"/"!DEBUG" semuanya boleh
    /// menyahaktifkan wiring tanpa niat menipu. Sejak pusingan 7 evaluator
    /// hanya mempercayai literal BEBAS-KONFIGURASI, jadi SEMUA identiti
    /// (DEBUG, TRACE, gabungan) gugur — guard GAGAL walau Debug/Release/
    /// #define berubah, bukan hanya bila kebetulan tidak dikompil.
    /// </summary>
    [Fact]
    public void BuangKomen_DirektifIf_DinilaiBawahSemantikRelease()
    {
        const string wiring = "_pemasaLabelKitaran.Tick += PemasaLabelKitaran_Tick;";

        // Literal (bebas-konfigurasi): false gugur, true kekal.
        Assert.DoesNotContain(wiring, BuangKomen("    #if false\n    " + wiring + "\n    #endif\n"));
        Assert.DoesNotContain(wiring, BuangKomen("    #if FALSE\n    " + wiring + "\n    #endif\n"));
        Assert.Contains(wiring, BuangKomen("    #if true\n    " + wiring + "\n    #endif\n"));
        // SEMUA identiti TIDAK dipercayai (pusingan 7): DEBUG, TRACE,
        // dan apa-apa gabungan yang mengandungi identiti → konstruk gugur
        // (konservatif: gagal merah sekali pun wirinya aktif hari ini).
        Assert.DoesNotContain(wiring, BuangKomen("    #if DEBUG\n    " + wiring + "\n    #endif\n"));
        Assert.DoesNotContain(wiring, BuangKomen("    #if TRACE\n    " + wiring + "\n    #endif\n"));
        Assert.DoesNotContain(wiring, BuangKomen("    #if !DEBUG\n    " + wiring + "\n    #endif\n"));
        Assert.DoesNotContain(wiring, BuangKomen("    #if !DEBUG && true\n    " + wiring + "\n    #endif\n"));
    }

    /// <summary>
    /// Pusingan 6: jadual cabang. "#if salah → #else" ialah cabang yang
    /// DIKOMPIL dalam Release → kekal dikesan; selepas syarat TIDAK
    /// DIKETAHUI, "#else" turut dibuang (konservatif — gagal merah, bukan
    /// hijau senyap). "#elif" dinilai selepas cabang pertama gagal diambil.
    /// </summary>
    [Fact]
    public void BuangKomen_CabangElseElif_DinilaiBawahRelease()
    {
        const string wiring = "_pemasaLabelKitaran.Tick += PemasaLabelKitaran_Tick;";

        // Litera: #else selepas "false" selalu ialah cabang terbitan → KEKAL.
        Assert.Contains(wiring, BuangKomen(
            "    #if false\n    x();\n    #else\n    " + wiring + "\n    #endif\n"));
        // Identiti TIDAK dipercayai: #else/#elif selepasnya turut DIBUANG
        // (walau wirinya mungkin aktif hari ini — arah gagal merah-jujur).
        Assert.DoesNotContain(wiring, BuangKomen(
            "    #if DEBUG\n    x();\n    #else\n    " + wiring + "\n    #endif\n"));
        Assert.DoesNotContain(wiring, BuangKomen(
            "    #if SimbolTakDikenal\n    x();\n    #else\n    " + wiring + "\n    #endif\n"));
        Assert.DoesNotContain(wiring, BuangKomen(
            "    #if DEBUG\n    x();\n    #elif true\n    " + wiring + "\n    #endif\n"));
        Assert.DoesNotContain(wiring, BuangKomen(
            "    #if false\n    x();\n    #elif DEBUG\n    y();\n    #else\n    " + wiring + "\n    #endif\n"));
        // Gabungan literal sahaja yang mengandungi identiti tetap gugur;
        // #elif literal selepas literal-false → cabang terbitan → KEKAL.
        Assert.Contains(wiring, BuangKomen(
            "    #if false\n    x();\n    #elif true\n    " + wiring + "\n    #endif\n"));
    }

    /// <summary>
    /// Panel "Pendaftaran PC" tidak lagi ditambah ke paparan. Kelas DevicePanel
    /// KEKAL (ciri berbilang PC akan datang) dan masih dilupuskan semasa tutup —
    /// melupuskan kawalan yang tidak pernah ditambah adalah selamat.
    /// </summary>
    [Fact]
    public void MainForm_PanelPendaftaranPcTidakDitambahKePaparan()
    {
        var sumber = SumberMainForm();

        Assert.DoesNotContain("Controls.Add(_devicePanel)", sumber);
        Assert.Contains("_devicePanel.Dispose()", sumber);
    }

    /// <summary>Label kitaran mesti benar-benar wujud pada bar status.</summary>
    [Fact]
    public void MainForm_MenambahLabelKitaranKeBarStatus()
    {
        Assert.Contains("_statusStrip.Items.Add(_kitaranLabel)", SumberMainForm());
    }

    /// <summary>
    /// Pemasa paparan ialah SATU baris yang menulis teks. Jika ia mula memanggil
    /// kitaran, aplikasi akan melakukan aktiviti portal setiap 20 saat — persis
    /// denyutan yang KitaranAuto direka untuk elakkan.
    /// </summary>
    [Fact]
    public void MainForm_PemasaPaparanTidakMenjalankanKitaran()
    {
        var sumber = SumberMainForm();

        Assert.Contains(
            "private void PemasaLabelKitaran_Tick(object? sender, EventArgs e) => KemasKiniLabelKitaran();",
            sumber);
        Assert.DoesNotContain("_pemasaLabelKitaran.Tick += PemasaKitaran_Tick", sumber);
    }

    /// <summary>
    /// Guard POSITIF: pemasa paparan mesti benar-benar berwayar kepada
    /// pengendalinya, dan pengendali itu mesti benar-benar menulis label. Tanpa
    /// ini, membuang satu baris wiring akan lulus setiap ujian lain.
    /// </summary>
    [Fact]
    public void MainForm_PemasaPaparanBerwayarKepadaPengendaliYangMenulisLabel()
    {
        var sumber = SumberMainForm();

        Assert.Contains("_pemasaLabelKitaran.Tick += PemasaLabelKitaran_Tick;", sumber);
        Assert.Contains("_pemasaLabelKitaran.Start();", sumber);
        Assert.Contains("_pemasaLabelKitaran.Interval = JadualKitaran.SelangSegarLabelSaat * 1000;", sumber);
        Assert.Contains("KemasKiniLabelKitaran();", BadanPengendaliPaparan(sumber), StringComparison.Ordinal);
    }

    /// <summary>
    /// Pengendali paparan mesti kekal PAPARAN-SAHAJA: tiada kitaran, tiada
    /// pemasa kitaran, tiada portal, tiada rangkaian. Jika mana-mana daripadanya
    /// menyelinap masuk, aplikasi akan melakukan kerja setiap 20 saat.
    /// </summary>
    [Theory]
    [InlineData("JalankanKitaranAuto")]
    [InlineData("_pemasaKitaran")]
    [InlineData("CubaLoginAuto")]
    [InlineData("_lifecycle")]
    [InlineData("Navigate")]
    [InlineData("Http")]
    [InlineData("_aliranPenghantaran")]
    public void MainForm_PengendaliPaparanTidakMenyentuhKerja(string terlarang)
    {
        Assert.DoesNotContain(terlarang, BadanPengendaliPaparan(SumberMainForm()), StringComparison.Ordinal);
    }

    /// <summary>Baris pengendali pemasa paparan sahaja (badan ungkapan satu baris).</summary>
    private static string BadanPengendaliPaparan(string sumber)
    {
        const string tanda = "private void PemasaLabelKitaran_Tick(";
        var mula = sumber.IndexOf(tanda, StringComparison.Ordinal);
        Assert.True(mula >= 0, "PemasaLabelKitaran_Tick tidak dijumpai.");
        var hujung = sumber.IndexOf(';', mula);
        Assert.True(hujung > mula);
        return sumber[mula..(hujung + 1)];
    }

    /// <summary>
    /// Pagar dinilai di DUA tempat (tick dan pembacaan pilihan pemilik); label
    /// mengikut kedua-duanya, jadi kedua-duanya mesti merekodkan keputusannya.
    /// </summary>
    [Fact]
    public void MainForm_KeputusanGateDirekodDiKeduaDuaTempat()
    {
        var sumber = SumberMainForm();

        Assert.Contains("_gateTerakhirLulus = kena;", sumber);
        Assert.Contains("_gateTerakhirLulus = false;", sumber);
        Assert.Contains("_gateTerakhirLulus = true;", sumber);
        Assert.Contains("JadualKitaran.KitaranBenarBenarAktif(hidup, _gateTerakhirLulus)", sumber);
    }

    /// <summary>
    /// Cap jari konfigurasi HIDUP DALAM MEMORI SAHAJA: ia dibandingkan, tidak
    /// pernah dilog atau dimasukkan ke dalam teks label.
    /// </summary>
    [Fact]
    public void MainForm_CapKonfigurasiTidakPernahDilogAtauDipaparkan()
    {
        var sumber = SumberMainForm();

        Assert.Contains("CapKonfigurasiBackend.Sepadan(_capKonfigurasiKlien, CapKonfigurasiSekarang())", sumber);
        Assert.DoesNotContain("TulisKe(KitaranAuto.LaluanLog(), _capKonfigurasiKlien", sumber);
        Assert.DoesNotContain("Text = _capKonfigurasiKlien", sumber);
        Assert.DoesNotContain("+ _capKonfigurasiKlien", sumber);
    }

    /// <summary>
    /// Titik rujukan jadual mesti bergerak apabila tick BERMULA, sebelum pagar
    /// tetapan — jika tidak, tick yang ditolak oleh gate meninggalkan anggaran
    /// lama tersekat pada "sebentar lagi".
    /// </summary>
    [Fact]
    public void MainForm_AsasJadualDitulisPadaMulaTick_SebelumGate()
    {
        var sumber = SumberMainForm();

        var asas = sumber.IndexOf("_asasJadualTick = DateTime.Now;\n        await JalankanKitaranAutoAsync();", StringComparison.Ordinal);
        if (asas < 0)
        {
            asas = sumber.IndexOf("_asasJadualTick = DateTime.Now;\r\n        await JalankanKitaranAutoAsync();", StringComparison.Ordinal);
        }

        Assert.True(asas >= 0, "PemasaKitaran_Tick mesti menetapkan _asasJadualTick sebelum menjalankan kitaran.");
    }

    /// <summary>
    /// Setiap jalan keluar gate dalam JalankanKitaranAutoAsync mesti menyegarkan
    /// label; jika tidak, paparan boleh kekal mendakwa "sebentar lagi" sepanjang
    /// selang berikutnya.
    /// </summary>
    [Fact]
    public void MainForm_SetiapJalanKeluarGateMenyegarkanLabel()
    {
        var sumber = SumberMainForm();
        var mula = sumber.IndexOf("private async Task JalankanKitaranAutoAsync()", StringComparison.Ordinal);
        Assert.True(mula >= 0);
        var hujung = sumber.IndexOf("private async Task KitaranAutoDevAsync()", StringComparison.Ordinal);
        Assert.True(hujung > mula);

        var badan = sumber[mula..hujung];
        // Dua jalan keluar gate + satu selepas kitaran bermula + satu dalam finally.
        var bilangan = badan.Split("KemasKiniLabelKitaran();").Length - 1;
        Assert.True(bilangan >= 4, $"dijangka >=4 panggilan KemasKiniLabelKitaran, dapat {bilangan}");
    }

    /// <summary>
    /// One-shot yang masih tertunda tidak boleh dikosongkan hanya kerana pemilik
    /// mematikan togol: Task.Delay itu masih berjalan.
    /// </summary>
    [Fact]
    public void MainForm_OneShotTidakDikosongkanBilaPemasaDihentikan()
    {
        var sumber = SumberMainForm();
        var mula = sumber.IndexOf("private void KemasKiniKitaranAuto()", StringComparison.Ordinal);
        Assert.True(mula >= 0);
        var hujung = sumber.IndexOf("public async Task CubaLoginAutoAtasPermintaanAsync()", StringComparison.Ordinal);
        Assert.True(hujung > mula);

        Assert.DoesNotContain("_oneShotPada = null", sumber[mula..hujung]);
    }
}

/// <summary>
/// Mekanisme pemasa paparan, diuji dengan JENIS SEBENAR yang digunakan aplikasi
/// (<see cref="System.Windows.Forms.Timer"/> menulis ke
/// <see cref="ToolStripStatusLabel"/>) — bukan sekadar teks sumber.
///
/// MainForm sendiri TIDAK dibina di sini: ia memerlukan WebView2. Yang dibuktikan
/// ialah rantaian yang sama seperti yang diwayarkan oleh MainForm: satu tick
/// pemasa WinForms menulis semula teks label, jadi anggaran yang luput bertukar
/// menjadi "sebentar lagi" tanpa sebarang peralihan kitaran.
/// </summary>
public class PemasaPaparanLabelTests
{
    [Fact]
    public void TickPemasaWinForms_MenulisSemulaTeksLabel_ApabilaAnggaranLuput()
    {
        string? awal = null;
        string? akhir = null;
        Exception? ralat = null;

        var benang = new Thread(() =>
        {
            try
            {
                // Pam mesej tanpa tetingkap: pemasa WinForms perlukan message
                // loop, bukan borang yang kelihatan.
                var konteks = new ApplicationContext();
                using var label = new ToolStripStatusLabel();
                using var pemasa = new System.Windows.Forms.Timer { Interval = 25 };

                // Anggaran yang akan LUPUT semasa ujian berjalan.
                var seterusnya = DateTime.Now.AddMilliseconds(150);
                var fakta = new FaktaKitaran(Aktif: true, Seterusnya: seterusnya);

                void Tulis() => label.Text = LabelKitaran.Teks(fakta, DateTime.Now);

                Tulis();
                awal = label.Text;

                var tamat = DateTime.Now.AddSeconds(8);   // jaring keselamatan
                pemasa.Tick += (_, _) =>
                {
                    Tulis();
                    if (DateTime.Now > seterusnya.AddMilliseconds(50) || DateTime.Now > tamat)
                    {
                        akhir = label.Text;
                        pemasa.Stop();
                        konteks.ExitThread();
                    }
                };
                pemasa.Start();

                Application.Run(konteks);
            }
            catch (Exception ex)
            {
                ralat = ex;
            }
        })
        { IsBackground = true, Name = "ujian-pemasa-paparan" };

        benang.SetApartmentState(ApartmentState.STA);
        benang.Start();
        Assert.True(benang.Join(TimeSpan.FromSeconds(20)), "pemasa paparan tidak selesai dalam masa.");
        Assert.Null(ralat);

        // Sebelum luput: waktu jam. Selepas luput: "sebentar lagi" — ditulis oleh
        // TICK, bukan oleh peralihan kitaran.
        Assert.NotNull(awal);
        Assert.NotNull(akhir);
        Assert.Contains("seterusnya lebih kurang", awal!);
        Assert.Contains("sebentar lagi", akhir!);
        Assert.NotEqual(awal, akhir);
    }
}
