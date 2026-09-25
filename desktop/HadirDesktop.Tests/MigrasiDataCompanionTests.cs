using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Migrasi sekali Companion -> Desktop. Setiap ujian memakai dua folder sementara
/// terpencil (legasi + desktop) dengan data REKAAN sahaja — fail sebenar dalam
/// %LOCALAPPDATA% tidak pernah dibaca atau ditulis, dan tiada icacls dijalankan.
/// </summary>
public class MigrasiDataCompanionTests : IDisposable
{
    private const string ApiUrl = "https://script.google.com/macros/s/UJIAN-BUKAN-SEBENAR/exec";
    private const string RahsiaRekaan = "rahsia-rekaan-ujian";
    private const string PenggunaRekaan = "000000000000";
    private const string KataLaluanRekaan = "kata-laluan-rekaan";

    private readonly string _akar;
    private readonly string _legasi;
    private readonly string _desktop;

    public MigrasiDataCompanionTests()
    {
        _akar = Path.Combine(Path.GetTempPath(), "hadir-migrasi-ujian-" + Guid.NewGuid().ToString("N"));
        _legasi = Path.Combine(_akar, "HADIR-MOEIS-Companion");
        _desktop = Path.Combine(_akar, "HadirDesktop", "enjin");
        Directory.CreateDirectory(_legasi);
    }

    public void Dispose()
    {
        try { Directory.Delete(_akar, recursive: true); } catch { /* best effort */ }
    }

    private static void Tiada(string _) { }

    private MigrasiDataCompanion Migrasi() => new(_legasi, _desktop, Tiada);

    private static byte[] Dpapi(string json) =>
        ProtectedData.Protect(Encoding.UTF8.GetBytes(json), null, DataProtectionScope.CurrentUser);

    private static void TulisBackend(string dir, string rahsia = RahsiaRekaan, string apiUrl = ApiUrl)
    {
        Directory.CreateDirectory(dir);
        File.WriteAllText(Path.Combine(dir, "tetapan.json"),
            "{\"apiUrl\":\"" + apiUrl + "\",\"label\":\"PC ujian\",\"loginAuto\":true}", Encoding.UTF8);
        File.WriteAllBytes(Path.Combine(dir, "rahsia.dat"),
            Dpapi("{\"rahsiaEnjin\":\"" + rahsia + "\",\"klien\":[{\"id\":\"k1\"}]}"));
    }

    private static void TulisKredensial(string dir, string pengguna = PenggunaRekaan)
    {
        Directory.CreateDirectory(dir);
        File.WriteAllBytes(Path.Combine(dir, "kredensial.dat"), Dpapi(
            "{\"pengguna\":\"" + pengguna + "\",\"kataLaluan\":\"" + KataLaluanRekaan + "\",\"kunciKeselamatan\":\"frasa\"}"));
    }

    private static Dictionary<string, byte[]> Gambar(string dir) =>
        Directory.Exists(dir)
            ? Directory.GetFiles(dir).ToDictionary(f => Path.GetFileName(f), f => File.ReadAllBytes(f))
            : new Dictionary<string, byte[]>();

    private static void SamaBait(Dictionary<string, byte[]> a, Dictionary<string, byte[]> b)
    {
        Assert.Equal(a.Keys.OrderBy(k => k), b.Keys.OrderBy(k => k));
        foreach (var k in a.Keys) Assert.Equal(a[k], b[k]);
    }

    // --- laluan ---

    [Fact]
    public void LaluanLalai_StorMilikDesktop_BukanFolderCompanion()
    {
        var asas = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var enjin = Path.Combine(asas, "HadirDesktop", "enjin");

        Assert.Equal(enjin, LaluanDataDesktop.DirEnjin());
        Assert.Equal(enjin, DpapiRahsiaEnjinStore.DirDataLalai());
        Assert.Equal(Path.Combine(enjin, "kredensial.dat"), DpapiKredensialIdMeStore.LaluanLalai());
        Assert.Equal(Path.Combine(asas, "HADIR-MOEIS-Companion"), LaluanDataDesktop.DirLegasiCompanion());
        Assert.DoesNotContain("HADIR-MOEIS-Companion", DpapiRahsiaEnjinStore.DirDataLalai());
        Assert.DoesNotContain("HADIR-MOEIS-Companion", DpapiKredensialIdMeStore.LaluanLalai());
    }

    // --- laluan gembira + idempoten ---

    [Fact]
    public void LegasiSah_DesktopKosong_DisalinBaitDemiBait_LegasiTidakDisentuh()
    {
        TulisBackend(_legasi);
        TulisKredensial(_legasi);
        var legasiSebelum = Gambar(_legasi);

        var hasil = Migrasi().Jalankan();

        Assert.Equal(KeputusanMigrasi.Dipindahkan, hasil.Backend.Keputusan);
        Assert.Equal(KeputusanMigrasi.Dipindahkan, hasil.Kredensial.Keputusan);
        SamaBait(legasiSebelum, Gambar(_legasi));
        foreach (var f in new[] { "tetapan.json", "rahsia.dat", "kredensial.dat" })
            Assert.Equal(legasiSebelum[f], File.ReadAllBytes(Path.Combine(_desktop, f)));
        Assert.False(File.Exists(Path.Combine(_desktop, "migrasi-backend.belum-selesai")));
        Assert.False(File.Exists(Path.Combine(_desktop, "migrasi-kredensial.belum-selesai")));

        var backend = new DpapiRahsiaEnjinStore(_desktop).Baca();
        Assert.Equal(ApiUrl, backend!.ApiUrl);
        Assert.Equal(RahsiaRekaan, backend.RahsiaEnjin);
        Assert.Equal(PenggunaRekaan, new DpapiKredensialIdMeStore(Path.Combine(_desktop, "kredensial.dat")).Baca()!.Pengguna);
    }

    [Fact]
    public void LarianKedua_Idempoten_TiadaFailBerubah()
    {
        TulisBackend(_legasi);
        TulisKredensial(_legasi);
        Migrasi().Jalankan();
        var desktopSebelum = Gambar(_desktop);

        var hasil = Migrasi().Jalankan();

        Assert.Equal(KeputusanMigrasi.SudahSelesai, hasil.Backend.Keputusan);
        Assert.Equal(KeputusanMigrasi.SudahSelesai, hasil.Kredensial.Keputusan);
        SamaBait(desktopSebelum, Gambar(_desktop));
    }

    [Fact]
    public void LegasiBerubahSelepasMigrasi_TidakDisalinSemula()
    {
        TulisBackend(_legasi);
        Migrasi().Jalankan();
        TulisBackend(_legasi, rahsia: "rahsia-lain-rekaan");

        Migrasi().Jalankan();

        Assert.Equal(RahsiaRekaan, new DpapiRahsiaEnjinStore(_desktop).Baca()!.RahsiaEnjin);
    }

    [Fact]
    public void KredensialDipadamDalamDesktop_TidakDihidupkanSemulaDaripadaCompanion()
    {
        TulisKredensial(_legasi);
        Migrasi().Jalankan();
        new DpapiKredensialIdMeStore(Path.Combine(_desktop, "kredensial.dat")).Padam();

        var hasil = Migrasi().Jalankan();

        Assert.Equal(KeputusanMigrasi.SudahSelesai, hasil.Kredensial.Keputusan);
        Assert.False(File.Exists(Path.Combine(_desktop, "kredensial.dat")));
        Assert.True(File.Exists(Path.Combine(_legasi, "kredensial.dat")));
    }

    [Fact]
    public void TiadaLegasi_Muktamad_TiadaFailDataDicipta()
    {
        var hasil = Migrasi().Jalankan();

        Assert.Equal(KeputusanMigrasi.TiadaLegasi, hasil.Backend.Keputusan);
        Assert.Equal(KeputusanMigrasi.TiadaLegasi, hasil.Kredensial.Keputusan);
        Assert.Equal(new[] { MigrasiDataCompanion.NamaRekod }, Gambar(_desktop).Keys.ToArray());
    }

    // --- jangan timpa ---

    [Fact]
    public void DesktopSudahSah_TidakDitimpa()
    {
        TulisBackend(_legasi, rahsia: "rahsia-companion-rekaan");
        TulisKredensial(_legasi, pengguna: "111111111111");
        TulisBackend(_desktop, rahsia: "rahsia-desktop-rekaan");
        TulisKredensial(_desktop, pengguna: "222222222222");
        var desktopSebelum = Gambar(_desktop);

        var hasil = Migrasi().Jalankan();

        Assert.Equal(KeputusanMigrasi.SudahMilikDesktop, hasil.Backend.Keputusan);
        Assert.Equal(KeputusanMigrasi.SudahMilikDesktop, hasil.Kredensial.Keputusan);
        foreach (var (nama, bait) in desktopSebelum) Assert.Equal(bait, File.ReadAllBytes(Path.Combine(_desktop, nama)));
        Assert.Equal("rahsia-desktop-rekaan", new DpapiRahsiaEnjinStore(_desktop).Baca()!.RahsiaEnjin);
    }

    [Fact]
    public void DesktopRosakTanpaPenandaMigrasi_TidakDitimpa_DanTidakMuktamad()
    {
        TulisBackend(_legasi);
        Directory.CreateDirectory(_desktop);
        File.WriteAllBytes(Path.Combine(_desktop, "rahsia.dat"), new byte[] { 1, 2, 3 });

        var hasil = Migrasi().Jalankan();

        Assert.Equal(KeputusanMigrasi.DesktopRosak, hasil.Backend.Keputusan);
        Assert.False(hasil.Backend.Muktamad);
        Assert.Equal(new byte[] { 1, 2, 3 }, File.ReadAllBytes(Path.Combine(_desktop, "rahsia.dat")));
        Assert.False(File.Exists(Path.Combine(_desktop, "tetapan.json")));
        Assert.Null(new DpapiRahsiaEnjinStore(_desktop).Baca());

        // Masih tidak ditimpa pada larian seterusnya.
        Assert.Equal(KeputusanMigrasi.DesktopRosak, Migrasi().Jalankan().Backend.Keputusan);
    }

    [Fact]
    public void PenandaSimpananDesktop_TidakDitimpa()
    {
        TulisBackend(_legasi);
        Directory.CreateDirectory(_desktop);
        File.WriteAllText(Path.Combine(_desktop, MigrasiDataCompanion.PenandaStoreBackend), "pending");

        var hasil = Migrasi().Jalankan();

        Assert.Equal(KeputusanMigrasi.DesktopRosak, hasil.Backend.Keputusan);
        Assert.False(File.Exists(Path.Combine(_desktop, "rahsia.dat")));
    }

    // --- gagal-tertutup pada sumber ---

    [Fact]
    public void LegasiRosak_TiadaApaDisalin_BackendKekalTiada()
    {
        Directory.CreateDirectory(_legasi);
        File.WriteAllText(Path.Combine(_legasi, "tetapan.json"), "{\"apiUrl\":\"" + ApiUrl + "\"}");
        File.WriteAllBytes(Path.Combine(_legasi, "rahsia.dat"), new byte[] { 9, 9, 9 });
        File.WriteAllBytes(Path.Combine(_legasi, "kredensial.dat"), new byte[] { 7, 7 });

        var hasil = Migrasi().Jalankan();

        Assert.Equal(KeputusanMigrasi.LegasiTidakSah, hasil.Backend.Keputusan);
        Assert.Equal(KeputusanMigrasi.LegasiTidakSah, hasil.Kredensial.Keputusan);
        Assert.False(File.Exists(Path.Combine(_desktop, "rahsia.dat")));
        Assert.False(File.Exists(Path.Combine(_desktop, "tetapan.json")));
        Assert.False(File.Exists(Path.Combine(_desktop, "kredensial.dat")));
        Assert.Null(new DpapiRahsiaEnjinStore(_desktop).Baca());
    }

    [Theory]
    [InlineData("https://contoh.invalid/exec")]
    [InlineData("https://script.google.com/")]
    [InlineData("https://script.googleusercontent.com/macros/echo")]
    public void LegasiApiUrlBukanEndpointDibenarkan_TidakDisalin(string apiUrl)
    {
        TulisBackend(_legasi, apiUrl: apiUrl);

        Assert.Equal(KeputusanMigrasi.LegasiTidakSah, Migrasi().Jalankan().Backend.Keputusan);
        Assert.False(File.Exists(Path.Combine(_desktop, "rahsia.dat")));
    }

    [Fact]
    public void LegasiPenandaBelumSelesai_TidakDisalin()
    {
        TulisBackend(_legasi);
        File.WriteAllText(Path.Combine(_legasi, MigrasiDataCompanion.PenandaStoreBackend), "pending");

        Assert.Equal(KeputusanMigrasi.LegasiBelumSelesai, Migrasi().Jalankan().Backend.Keputusan);
        Assert.False(File.Exists(Path.Combine(_desktop, "rahsia.dat")));
    }

    [Fact]
    public void LegasiTidakSahKemudianDibaiki_DicubaSemula()
    {
        Directory.CreateDirectory(_legasi);
        File.WriteAllBytes(Path.Combine(_legasi, "kredensial.dat"), new byte[] { 7, 7 });
        Assert.Equal(KeputusanMigrasi.LegasiTidakSah, Migrasi().Jalankan().Kredensial.Keputusan);

        TulisKredensial(_legasi);

        Assert.Equal(KeputusanMigrasi.Dipindahkan, Migrasi().Jalankan().Kredensial.Keputusan);
    }

    [Fact]
    public void RekodRosak_TiadaApaDipindahkan()
    {
        TulisBackend(_legasi);
        Directory.CreateDirectory(_desktop);
        File.WriteAllText(Path.Combine(_desktop, MigrasiDataCompanion.NamaRekod), "{bukan json");

        var hasil = Migrasi().Jalankan();

        Assert.Equal(KeputusanMigrasi.RekodRosak, hasil.Backend.Keputusan);
        Assert.Equal(KeputusanMigrasi.RekodRosak, hasil.Kredensial.Keputusan);
        Assert.False(File.Exists(Path.Combine(_desktop, "rahsia.dat")));
    }

    // --- terputus separuh jalan ---

    [Fact]
    public void TerputusSelepasTetapan_GagalTertutup_TiadaSalinSemula_PemulihanEksplisitOlehPemilik()
    {
        TulisBackend(_legasi);
        var terputus = new MigrasiDataCompanion(_legasi, _desktop, Tiada,
            nama => { if (nama == "tetapan.json") throw new IOException("simulasi terputus"); });

        var pertama = terputus.Jalankan();

        Assert.Equal(KeputusanMigrasi.Ralat, pertama.Backend.Keputusan);
        Assert.True(File.Exists(Path.Combine(_desktop, "tetapan.json")));
        Assert.False(File.Exists(Path.Combine(_desktop, "rahsia.dat")));
        Assert.True(File.Exists(Path.Combine(_desktop, "migrasi-backend.belum-selesai")));
        Assert.Null(new DpapiRahsiaEnjinStore(_desktop).Baca());

        // Larian seterusnya TIDAK menyalin semula secara automatik: salinan separa
        // tidak dapat dibezakan daripada data yang dipadam pemilik.
        var kedua = Migrasi().Jalankan();

        Assert.Equal(KeputusanMigrasi.PerluPemulihan, kedua.Backend.Keputusan);
        Assert.False(kedua.Backend.Muktamad);
        Assert.False(File.Exists(Path.Combine(_desktop, "rahsia.dat")));
        Assert.True(File.Exists(Path.Combine(_desktop, "migrasi-backend.belum-selesai")));
        Assert.Null(new DpapiRahsiaEnjinStore(_desktop).Baca());

        // Pemulihan eksplisit: pemilik menyimpan tetapan dalam HADIR Desktop.
        new DpapiRahsiaEnjinStore(_desktop).Simpan(ApiUrl, "rahsia-pemilik-rekaan");
        var ketiga = Migrasi().Jalankan();

        Assert.Equal(KeputusanMigrasi.Dipindahkan, ketiga.Backend.Keputusan);
        Assert.True(ketiga.Backend.Muktamad);
        Assert.False(File.Exists(Path.Combine(_desktop, "migrasi-backend.belum-selesai")));
        Assert.Equal("rahsia-pemilik-rekaan", new DpapiRahsiaEnjinStore(_desktop).Baca()!.RahsiaEnjin);
    }

    // --- v3 #1: penanda muktamad gagal ditulis; kredensial dipadam; TIADA import semula ---

    [Fact]
    public void PenandaMuktamadGagal_PemilikPadamKredensial_LarianSeterusnyaTidakImportSemula()
    {
        TulisKredensial(_legasi);
        var penandaGagal = new MigrasiDataCompanion(_legasi, _desktop, Tiada, null,
            sebelumTulisRekod: null,
            sebelumTulisPenandaMuktamad: () => throw new IOException("simulasi cakera penuh"));

        var pertama = penandaGagal.Jalankan();

        // Salinan berjaya, tetapi keputusan tidak muktamad; penanda kekal 'menyalin'.
        Assert.Equal(KeputusanMigrasi.Ralat, pertama.Kredensial.Keputusan);
        Assert.True(File.Exists(Path.Combine(_desktop, "kredensial.dat")));
        Assert.Equal("menyalin", Kandungan(Path.Combine(_desktop, MigrasiDataCompanion.PenandaMigrasiKredensial)));
        Assert.False(new DpapiKredensialIdMeStore(Path.Combine(_desktop, "kredensial.dat")).Ada());

        // Pemilik memadam kredensial Desktop.
        new DpapiKredensialIdMeStore(Path.Combine(_desktop, "kredensial.dat")).Padam();

        var kedua = Migrasi().Jalankan();

        Assert.Equal(KeputusanMigrasi.PerluPemulihan, kedua.Kredensial.Keputusan);
        Assert.False(kedua.Kredensial.Muktamad);
        Assert.False(File.Exists(Path.Combine(_desktop, "kredensial.dat")));        // TIDAK diimport semula
        Assert.True(File.Exists(Path.Combine(_legasi, "kredensial.dat")));          // Companion kekal
        Assert.DoesNotContain("kredensial", File.Exists(Path.Combine(_desktop, MigrasiDataCompanion.NamaRekod))
            ? File.ReadAllText(Path.Combine(_desktop, MigrasiDataCompanion.NamaRekod)) : "");

        // Larian berulang tetap tidak mengimport.
        Assert.Equal(KeputusanMigrasi.PerluPemulihan, Migrasi().Jalankan().Kredensial.Keputusan);
        Assert.False(File.Exists(Path.Combine(_desktop, "kredensial.dat")));
    }

    [Fact]
    public void PenandaMuktamadGagal_SalinanUtuh_DimuktamadkanTanpaSalinSemula()
    {
        TulisKredensial(_legasi);
        new MigrasiDataCompanion(_legasi, _desktop, Tiada, null, null,
            () => throw new IOException("simulasi")).Jalankan();
        var sebelum = File.ReadAllBytes(Path.Combine(_desktop, "kredensial.dat"));
        TulisKredensial(_legasi, pengguna: "999999999999");   // Companion berubah selepas itu

        var kedua = Migrasi().Jalankan();

        Assert.Equal(KeputusanMigrasi.Dipindahkan, kedua.Kredensial.Keputusan);
        Assert.Equal(sebelum, File.ReadAllBytes(Path.Combine(_desktop, "kredensial.dat")));   // tiada salin semula
        Assert.True(new DpapiKredensialIdMeStore(Path.Combine(_desktop, "kredensial.dat")).Ada());
    }

    [Fact]
    public void LarianPertamaTanpaPenanda_MasihBerfungsi()
    {
        TulisBackend(_legasi);
        TulisKredensial(_legasi);
        Assert.False(Directory.Exists(_desktop));

        var hasil = Migrasi().Jalankan();

        Assert.Equal(KeputusanMigrasi.Dipindahkan, hasil.Backend.Keputusan);
        Assert.Equal(KeputusanMigrasi.Dipindahkan, hasil.Kredensial.Keputusan);
        Assert.True(hasil.Backend.Muktamad && hasil.Kredensial.Muktamad);
        Assert.NotNull(new DpapiRahsiaEnjinStore(_desktop).Baca());
        Assert.True(new DpapiKredensialIdMeStore(Path.Combine(_desktop, "kredensial.dat")).Ada());
        Assert.False(File.Exists(Path.Combine(_desktop, MigrasiDataCompanion.PenandaMigrasiBackend)));
        Assert.False(File.Exists(Path.Combine(_desktop, MigrasiDataCompanion.PenandaMigrasiKredensial)));
    }

    [Fact]
    public void TerputusSelepasKeduaDuaFailDisalin_TiadaKlienSehinggaMigrasiBerjaya()
    {
        TulisBackend(_legasi);
        var terputus = new MigrasiDataCompanion(_legasi, _desktop, Tiada,
            nama => { if (nama == "rahsia.dat") throw new IOException("simulasi terputus sebelum dimuktamadkan"); });

        var pertama = terputus.Jalankan();

        // Kedua-dua fail sudah ada dan sah bait demi bait, tetapi migrasi belum muktamad.
        Assert.Equal(KeputusanMigrasi.Ralat, pertama.Backend.Keputusan);
        Assert.False(pertama.Backend.Muktamad);
        Assert.True(File.Exists(Path.Combine(_desktop, "tetapan.json")));
        Assert.True(File.Exists(Path.Combine(_desktop, "rahsia.dat")));
        Assert.True(File.Exists(Path.Combine(_desktop, MigrasiDataCompanion.PenandaMigrasiBackend)));
        Assert.DoesNotContain("backend", File.Exists(Path.Combine(_desktop, MigrasiDataCompanion.NamaRekod))
            ? File.ReadAllText(Path.Combine(_desktop, MigrasiDataCompanion.NamaRekod)) : "");

        var stor = new DpapiRahsiaEnjinStore(_desktop);
        Assert.Null(stor.Baca());
        Assert.False(stor.Status().Sedia);
        var dibina = 0;
        // Walaupun pemanggil tersilap memberi "muktamad", stor tetap menolak.
        foreach (var muktamad in new[] { pertama.Backend.Muktamad, true })
        {
            var pagar = new PagarKonfigurasiBackend(stor, muktamad, (_, _) => { dibina++; return new PagarKonfigurasiBackendTests.KlienPalsu(); });
            Assert.Null(pagar.Klien);
        }
        Assert.Equal(0, dibina);

        var kedua = Migrasi().Jalankan();

        Assert.Equal(KeputusanMigrasi.Dipindahkan, kedua.Backend.Keputusan);
        Assert.False(File.Exists(Path.Combine(_desktop, MigrasiDataCompanion.PenandaMigrasiBackend)));
        var pagarSelepas = new PagarKonfigurasiBackend(stor, kedua.Backend.Muktamad, (_, _) => { dibina++; return new PagarKonfigurasiBackendTests.KlienPalsu(); });
        Assert.NotNull(pagarSelepas.Klien);
        Assert.Equal(1, dibina);
    }

    // --- B. kemuktamadan bergantung pada rekod tahan lama ---

    private MigrasiDataCompanion MigrasiRekodGagal() =>
        new(_legasi, _desktop, Tiada, null, () => throw new IOException("simulasi cakera penuh"));

    private static string Kandungan(string laluan) => File.ReadAllText(laluan).Trim();

    [Fact]
    public void RekodGagalDitulis_TidakMuktamad_PenandaDikekal_TiadaKlienTiadaKredensial()
    {
        TulisBackend(_legasi);
        TulisKredensial(_legasi);

        var hasil = MigrasiRekodGagal().Jalankan();

        Assert.Equal(KeputusanMigrasi.Ralat, hasil.Backend.Keputusan);
        Assert.Equal(KeputusanMigrasi.Ralat, hasil.Kredensial.Keputusan);
        Assert.False(hasil.Backend.Muktamad);
        Assert.False(hasil.Kredensial.Muktamad);
        Assert.False(File.Exists(Path.Combine(_desktop, MigrasiDataCompanion.NamaRekod)));
        Assert.Equal("muktamad:Dipindahkan", Kandungan(Path.Combine(_desktop, MigrasiDataCompanion.PenandaMigrasiBackend)));
        Assert.Equal("muktamad:Dipindahkan", Kandungan(Path.Combine(_desktop, MigrasiDataCompanion.PenandaMigrasiKredensial)));

        // Backend: stor gagal-tertutup dan tiada klien dibina.
        var dibina = 0;
        Assert.Null(new DpapiRahsiaEnjinStore(_desktop).Baca());
        Assert.Null(new PagarKonfigurasiBackend(new DpapiRahsiaEnjinStore(_desktop), hasil.Backend.Muktamad,
            (_, _) => { dibina++; return new PagarKonfigurasiBackendTests.KlienPalsu(); }).Klien);
        Assert.Equal(0, dibina);

        // Kredensial: blob yang disalin wujud, tetapi stor melaporkan tiada.
        var kredensial = new DpapiKredensialIdMeStore(Path.Combine(_desktop, "kredensial.dat"));
        Assert.True(File.Exists(Path.Combine(_desktop, "kredensial.dat")));
        Assert.False(kredensial.Ada());
        Assert.Null(kredensial.Baca());
        Assert.False(kredensial.Status().Ada);
        foreach (var nilai in new[] { RahsiaRekaan, ApiUrl, PenggunaRekaan, KataLaluanRekaan, _akar })
            Assert.DoesNotContain(nilai, hasil.Backend.Sebab + hasil.Kredensial.Sebab + hasil.Ringkasan());
    }

    [Fact]
    public void RekodGagal_KredensialDesktopDipadam_LarianSeterusnyaTidakImportSemula()
    {
        TulisKredensial(_legasi);
        MigrasiRekodGagal().Jalankan();

        // Pemilik memadam kredensial Desktop sebelum rekod pernah berjaya ditulis.
        new DpapiKredensialIdMeStore(Path.Combine(_desktop, "kredensial.dat")).Padam();
        Assert.False(File.Exists(Path.Combine(_desktop, "kredensial.dat")));

        var kedua = Migrasi().Jalankan();

        Assert.Equal(KeputusanMigrasi.Dipindahkan, kedua.Kredensial.Keputusan);
        Assert.True(kedua.Kredensial.Muktamad);
        Assert.False(File.Exists(Path.Combine(_desktop, "kredensial.dat")));      // TIDAK diimport semula
        Assert.True(File.Exists(Path.Combine(_legasi, "kredensial.dat")));        // Companion tidak disentuh
        Assert.False(File.Exists(Path.Combine(_desktop, MigrasiDataCompanion.PenandaMigrasiKredensial)));
        Assert.Contains("\"kredensial\":\"Dipindahkan\"", File.ReadAllText(Path.Combine(_desktop, MigrasiDataCompanion.NamaRekod)));

        // Larian ketiga pun tidak mengimport.
        Assert.Equal(KeputusanMigrasi.SudahSelesai, Migrasi().Jalankan().Kredensial.Keputusan);
        Assert.False(File.Exists(Path.Combine(_desktop, "kredensial.dat")));
    }

    [Fact]
    public void RekodGagal_DesktopSudahMilikSendiri_TidakMuktamad_KemudianDimuktamadkan()
    {
        TulisBackend(_desktop, rahsia: "rahsia-desktop-rekaan");
        TulisBackend(_legasi);

        var pertama = MigrasiRekodGagal().Jalankan();

        Assert.Equal(KeputusanMigrasi.Ralat, pertama.Backend.Keputusan);
        Assert.Null(new DpapiRahsiaEnjinStore(_desktop).Baca());

        var kedua = Migrasi().Jalankan();

        Assert.Equal(KeputusanMigrasi.SudahMilikDesktop, kedua.Backend.Keputusan);
        Assert.Equal("rahsia-desktop-rekaan", new DpapiRahsiaEnjinStore(_desktop).Baca()!.RahsiaEnjin);
    }

    [Theory]
    [InlineData("muktamad:Dipindahkan")]
    [InlineData("menyalin")]
    public void TerputusSelepasRekodSebelumPenandaDibuang_DibersihkanTanpaImport(string sisa)
    {
        TulisKredensial(_legasi);
        Migrasi().Jalankan();                                         // rekod tahan lama ditulis
        new DpapiKredensialIdMeStore(Path.Combine(_desktop, "kredensial.dat")).Padam();
        File.WriteAllText(Path.Combine(_desktop, MigrasiDataCompanion.PenandaMigrasiKredensial), sisa);   // sisa terputus

        var hasil = Migrasi().Jalankan();

        Assert.Equal(KeputusanMigrasi.SudahSelesai, hasil.Kredensial.Keputusan);
        Assert.False(File.Exists(Path.Combine(_desktop, MigrasiDataCompanion.PenandaMigrasiKredensial)));
        Assert.False(File.Exists(Path.Combine(_desktop, "kredensial.dat")));
    }

    [Fact]
    public async Task MigrasiBelumSelesai_BlobSeparaWujud_TiadaKredensialSampaiKeLoginManager()
    {
        // Blob kredensial LENGKAP dan boleh dinyahsulit ada dalam folder Desktop,
        // tetapi penanda migrasi (salinan separa) masih wujud.
        TulisKredensial(_desktop);
        File.WriteAllText(Path.Combine(_desktop, MigrasiDataCompanion.PenandaMigrasiKredensial), "menyalin");
        var stor = new DpapiKredensialIdMeStore(Path.Combine(_desktop, "kredensial.dat"));
        var dijalankan = 0;
        KredensialIdMe? diterima = null;
        var pengurus = new IdMeLoginManager(
            () => stor.Ada(),
            () =>
            {
                dijalankan++;
                diterima = stor.Baca();
                return Task.FromResult(new HasilLoginAuto { Status = "berjaya" });
            },
            new PenjagaPenolakanKredensial(() => null, _ => { }, () => 5));

        var hasil = await pengurus.CubaSekaliAsync();

        Assert.Equal("tiada-kredensial", hasil.Status);
        Assert.Equal(0, dijalankan);
        Assert.Null(diterima);
        Assert.Null(stor.Baca());
        Assert.NotNull(stor.BacaTanpaPenandaMigrasi());   // blob itu memang sah — hanya pagar yang menahan
    }

    [Fact]
    public void KredensialSelepasMigrasiMuktamad_BolehDibaca()
    {
        TulisKredensial(_legasi);

        var hasil = Migrasi().Jalankan();

        var stor = new DpapiKredensialIdMeStore(Path.Combine(_desktop, "kredensial.dat"));
        Assert.True(hasil.Kredensial.Muktamad);
        Assert.True(stor.Ada());
        Assert.Equal(PenggunaRekaan, stor.Baca()!.Pengguna);
    }

    [Fact]
    public void KredensialTanpaFrasa_TidakMuktamad_TiadaRekod_DicubaSemula()
    {
        Directory.CreateDirectory(_legasi);
        File.WriteAllBytes(Path.Combine(_legasi, "kredensial.dat"), Dpapi(
            "{\"pengguna\":\"" + PenggunaRekaan + "\",\"kataLaluan\":\"" + KataLaluanRekaan + "\",\"kunciKeselamatan\":\"\"}"));

        var pertama = Migrasi().Jalankan();

        Assert.Equal(KeputusanMigrasi.LegasiTidakSah, pertama.Kredensial.Keputusan);
        Assert.False(pertama.Kredensial.Muktamad);
        Assert.False(File.Exists(Path.Combine(_desktop, "kredensial.dat")));
        Assert.DoesNotContain("kredensial", File.ReadAllText(Path.Combine(_desktop, MigrasiDataCompanion.NamaRekod)));

        TulisKredensial(_legasi);

        Assert.Equal(KeputusanMigrasi.Dipindahkan, Migrasi().Jalankan().Kredensial.Keputusan);
    }

    [Theory]
    [InlineData("{\"pengguna\":\"000000000000\",\"kataLaluan\":\"x\",\"kunciKeselamatan\":\"frasa\"}", true)]
    [InlineData("{\"pengguna\":\"000000000000\",\"kataLaluan\":\"x\",\"kunciKeselamatan\":\"  \"}", false)]
    [InlineData("{\"pengguna\":\"000000000000\",\"kataLaluan\":\"x\"}", false)]
    [InlineData("{\"pengguna\":\"000000000000\",\"kataLaluan\":\"\",\"kunciKeselamatan\":\"frasa\"}", false)]
    [InlineData("{\"pengguna\":\" \",\"kataLaluan\":\"x\",\"kunciKeselamatan\":\"frasa\"}", false)]
    public void KredensialSah_MemerlukanKetigaTigaMedan(string json, bool dijangka)
    {
        var k = System.Text.Json.JsonSerializer.Deserialize<KredensialIdMe>(json);
        Assert.Equal(dijangka, MigrasiDataCompanion.KredensialSah(k));
    }

    [Fact]
    public void KredensialDesktopTanpaFrasa_TidakDitimpa_TidakMuktamad()
    {
        TulisKredensial(_legasi);
        Directory.CreateDirectory(_desktop);
        var separa = Dpapi("{\"pengguna\":\"222222222222\",\"kataLaluan\":\"x\",\"kunciKeselamatan\":\"\"}");
        File.WriteAllBytes(Path.Combine(_desktop, "kredensial.dat"), separa);

        var hasil = Migrasi().Jalankan();

        Assert.Equal(KeputusanMigrasi.DesktopRosak, hasil.Kredensial.Keputusan);
        Assert.Equal(separa, File.ReadAllBytes(Path.Combine(_desktop, "kredensial.dat")));
    }

    [Fact]
    public void TerputusSebelumPenandaDibuang_DimuktamadkanTanpaSalinSemula()
    {
        TulisBackend(_legasi);
        TulisBackend(_desktop);
        File.WriteAllText(Path.Combine(_desktop, "migrasi-backend.belum-selesai"), "pending");
        var sebelum = Gambar(_desktop);

        var hasil = Migrasi().Jalankan();

        Assert.Equal(KeputusanMigrasi.Dipindahkan, hasil.Backend.Keputusan);
        Assert.False(File.Exists(Path.Combine(_desktop, "migrasi-backend.belum-selesai")));
        Assert.Equal(sebelum["rahsia.dat"], File.ReadAllBytes(Path.Combine(_desktop, "rahsia.dat")));
    }

    // --- tiada kebocoran ---

    [Fact]
    public void StatusDanRekod_TidakMemuatkanNilai()
    {
        TulisBackend(_legasi);
        TulisKredensial(_legasi);
        var hasil = Migrasi().Jalankan();
        var teks = hasil.Ringkasan() + hasil.Backend.Sebab + hasil.Kredensial.Sebab
            + File.ReadAllText(Path.Combine(_desktop, MigrasiDataCompanion.NamaRekod));

        foreach (var nilai in new[] { RahsiaRekaan, ApiUrl, "script.google.com", PenggunaRekaan, KataLaluanRekaan, _akar })
            Assert.DoesNotContain(nilai, teks);
    }

    [Fact]
    public void KunciFolder_DipanggilPadaFolderDesktopSahaja()
    {
        TulisKredensial(_legasi);
        var dikunci = new List<string>();

        new MigrasiDataCompanion(_legasi, _desktop, dikunci.Add).Jalankan();

        Assert.Equal(new[] { _desktop }, dikunci.ToArray());
    }
}

/// <summary>Persaraan autostart Companion — registry PALSU sahaja, tiada kunci Run sebenar disentuh.</summary>
public class PersaraanAutostartCompanionTests : IDisposable
{
    private const string ArahanRekaan = "\"C:\\ujian\\node.exe\" \"C:\\ujian\\hadir-companion.mjs\" serve";

    private sealed class RunKeyPalsu : IRegistryRunKey
    {
        public readonly Dictionary<string, string> Nilai = new();
        public string? Baca(string nama) => Nilai.TryGetValue(nama, out var v) ? v : null;
        public void Tulis(string nama, string nilai) => Nilai[nama] = nilai;
        public void Padam(string nama) => Nilai.Remove(nama);
    }

    private readonly string _dir = Path.Combine(Path.GetTempPath(), "hadir-persaraan-ujian-" + Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ }
    }

    private (PersaraanAutostartCompanion, RunKeyPalsu) Buat(bool desktopSedia = true)
    {
        var kunci = new RunKeyPalsu();
        kunci.Nilai[PersaraanAutostartCompanion.NamaNilaiRun] = ArahanRekaan;
        kunci.Nilai[AutostartManager.NamaNilai] = @"C:\ujian\HadirDesktop.exe";
        return (new PersaraanAutostartCompanion(kunci, _dir, () => desktopSedia), kunci);
    }

    [Fact]
    public void NamaNilai_SamaSepertiCompanion()
    {
        Assert.Equal("HADIRMoeisCompanion", PersaraanAutostartCompanion.NamaNilaiRun);
    }

    [Fact]
    public void DesktopBelumSedia_TidakMengubahApaApa()
    {
        var (p, kunci) = Buat(desktopSedia: false);

        var hasil = p.Hentikan();

        Assert.False(hasil.Berjaya);
        Assert.Equal(ArahanRekaan, kunci.Baca(PersaraanAutostartCompanion.NamaNilaiRun));
        Assert.False(p.SandaranAda());
    }

    [Fact]
    public void Hentikan_SandarDahulu_KemudianPadam_HadirDesktopTidakDisentuh()
    {
        var (p, kunci) = Buat();

        var hasil = p.Hentikan();

        Assert.True(hasil.Berjaya);
        Assert.Null(kunci.Baca(PersaraanAutostartCompanion.NamaNilaiRun));
        Assert.Equal(@"C:\ujian\HadirDesktop.exe", kunci.Baca(AutostartManager.NamaNilai));
        Assert.True(p.SandaranAda());
        Assert.False(p.AutostartAda());
        Assert.DoesNotContain(ArahanRekaan, hasil.Mesej + p.TeksStatus());
    }

    [Fact]
    public void Pulihkan_MenulisSemulaNilaiAsal()
    {
        var (p, kunci) = Buat();
        p.Hentikan();

        var hasil = p.Pulihkan();

        Assert.True(hasil.Berjaya);
        Assert.Equal(ArahanRekaan, kunci.Baca(PersaraanAutostartCompanion.NamaNilaiRun));
        Assert.False(p.SandaranAda());
    }

    [Fact]
    public void Pulihkan_NilaiLainSudahWujud_GagalDanSandaranDikekalkan()
    {
        var (p, kunci) = Buat();
        p.Hentikan();
        kunci.Tulis(PersaraanAutostartCompanion.NamaNilaiRun, "arahan-lain-rekaan");

        var hasil = p.Pulihkan();

        Assert.False(hasil.Berjaya);
        Assert.Equal("arahan-lain-rekaan", kunci.Baca(PersaraanAutostartCompanion.NamaNilaiRun));
        Assert.True(p.SandaranAda());
        Assert.DoesNotContain("arahan-lain-rekaan", hasil.Mesej);
    }

    [Fact]
    public void Pulihkan_NilaiSamaSudahWujud_BerjayaDanSandaranDibuang()
    {
        var (p, kunci) = Buat();
        p.Hentikan();
        kunci.Tulis(PersaraanAutostartCompanion.NamaNilaiRun, ArahanRekaan);

        Assert.True(p.Pulihkan().Berjaya);
        Assert.False(p.SandaranAda());
    }

    private sealed class RunKeyGagal : IRegistryRunKey
    {
        public readonly Dictionary<string, string> Nilai = new();
        public bool TulisMelontar;
        public bool TulisSenyapDiabaikan;
        public string? Baca(string nama) => Nilai.TryGetValue(nama, out var v) ? v : null;
        public void Tulis(string nama, string nilai)
        {
            if (TulisMelontar) throw new UnauthorizedAccessException("simulasi");
            if (!TulisSenyapDiabaikan) Nilai[nama] = nilai;
        }
        public void Padam(string nama) => Nilai.Remove(nama);
    }

    [Theory]
    [InlineData(true, false)]
    [InlineData(false, true)]
    public void Pulihkan_TulisGagalAtauBacaSemulaTidakSama_GagalDanSandaranDikekalkan(bool melontar, bool senyap)
    {
        var kunci = new RunKeyGagal();
        kunci.Nilai[PersaraanAutostartCompanion.NamaNilaiRun] = ArahanRekaan;
        var p = new PersaraanAutostartCompanion(kunci, _dir, () => true);
        Assert.True(p.Hentikan().Berjaya);
        kunci.TulisMelontar = melontar;
        kunci.TulisSenyapDiabaikan = senyap;

        var hasil = p.Pulihkan();

        Assert.False(hasil.Berjaya);
        Assert.True(p.SandaranAda());
        Assert.Null(kunci.Baca(PersaraanAutostartCompanion.NamaNilaiRun));
        Assert.DoesNotContain(ArahanRekaan, hasil.Mesej);

        // Sandaran yang dikekalkan masih boleh memulihkan apabila tulisan berjaya.
        kunci.TulisMelontar = kunci.TulisSenyapDiabaikan = false;
        Assert.True(p.Pulihkan().Berjaya);
        Assert.Equal(ArahanRekaan, kunci.Baca(PersaraanAutostartCompanion.NamaNilaiRun));
    }

    // --- C. sandaran pertama dikekalkan; nilai dibaca semula sebelum dipadam ---

    private string BaitSandaran() => File.ReadAllText(Path.Combine(_dir, PersaraanAutostartCompanion.NamaFailSandaran));

    [Fact]
    public void HentikanBerulang_NilaiBaharuBerbeza_DitolakSandaranAsalKekal()
    {
        var (p, kunci) = Buat();
        Assert.True(p.Hentikan().Berjaya);
        var sandaranAsal = BaitSandaran();
        kunci.Tulis(PersaraanAutostartCompanion.NamaNilaiRun, "arahan-baharu-rekaan");   // program lain mencipta semula

        var kedua = p.Hentikan();

        Assert.False(kedua.Berjaya);
        Assert.Equal("arahan-baharu-rekaan", kunci.Baca(PersaraanAutostartCompanion.NamaNilaiRun));
        Assert.Equal(sandaranAsal, BaitSandaran());
        Assert.DoesNotContain("arahan-baharu-rekaan", kedua.Mesej);
    }

    [Fact]
    public void HentikanBerulang_NilaiSamaDenganSandaran_DipadamSandaranTidakDitulisSemula()
    {
        var (p, kunci) = Buat();
        Assert.True(p.Hentikan().Berjaya);
        var sandaranAsal = BaitSandaran();
        kunci.Tulis(PersaraanAutostartCompanion.NamaNilaiRun, ArahanRekaan);

        Assert.True(p.Hentikan().Berjaya);

        Assert.Null(kunci.Baca(PersaraanAutostartCompanion.NamaNilaiRun));
        Assert.Equal(sandaranAsal, BaitSandaran());
    }

    /// <summary>Registry palsu yang boleh menukar nilai di antara bacaan, atau mengabaikan padam.</summary>
    private sealed class RunKeyBerubah : IRegistryRunKey
    {
        public readonly Dictionary<string, string> Nilai = new();
        public int BilBaca;
        public Action<int>? SelepasBaca;
        public bool PadamDiabaikan;
        public int BilPadam;

        public string? Baca(string nama)
        {
            var v = Nilai.TryGetValue(nama, out var x) ? x : null;
            BilBaca++;
            SelepasBaca?.Invoke(BilBaca);
            return v;
        }

        public void Tulis(string nama, string nilai) => Nilai[nama] = nilai;

        public void Padam(string nama)
        {
            BilPadam++;
            if (!PadamDiabaikan) Nilai.Remove(nama);
        }
    }

    [Fact]
    public void NilaiBertukarAntaraBacaanPertamaDanPadam_TidakDipadam_SandaranKekal()
    {
        var kunci = new RunKeyBerubah();
        kunci.Nilai[PersaraanAutostartCompanion.NamaNilaiRun] = ArahanRekaan;
        // Proses lain menulis nilai baharu sejurus selepas bacaan PERTAMA.
        kunci.SelepasBaca = n => { if (n == 1) kunci.Nilai[PersaraanAutostartCompanion.NamaNilaiRun] = "arahan-lain-rekaan"; };
        var p = new PersaraanAutostartCompanion(kunci, _dir, () => true);

        var hasil = p.Hentikan();

        Assert.False(hasil.Berjaya);
        Assert.Equal(0, kunci.BilPadam);
        Assert.Equal("arahan-lain-rekaan", kunci.Nilai[PersaraanAutostartCompanion.NamaNilaiRun]);
        Assert.True(p.SandaranAda());
        Assert.Equal(ArahanRekaan, System.Text.Json.JsonDocument.Parse(BaitSandaran()).RootElement.GetProperty("nilai").GetString());
    }

    [Fact]
    public void PadamTidakBerkesan_GagalDanSandaranKekal()
    {
        var kunci = new RunKeyBerubah { PadamDiabaikan = true };
        kunci.Nilai[PersaraanAutostartCompanion.NamaNilaiRun] = ArahanRekaan;
        var p = new PersaraanAutostartCompanion(kunci, _dir, () => true);

        var hasil = p.Hentikan();

        Assert.False(hasil.Berjaya);
        Assert.Equal(1, kunci.BilPadam);
        Assert.True(p.SandaranAda());
    }

    [Fact]
    public void SandaranRosakSediaAda_TidakDitimpa_TiadaApaDiubah()
    {
        var (p, kunci) = Buat();
        Directory.CreateDirectory(_dir);
        File.WriteAllText(Path.Combine(_dir, PersaraanAutostartCompanion.NamaFailSandaran), "{rosak");

        var hasil = p.Hentikan();

        Assert.False(hasil.Berjaya);
        Assert.Equal(ArahanRekaan, kunci.Baca(PersaraanAutostartCompanion.NamaNilaiRun));
        Assert.Equal("{rosak", BaitSandaran());
    }

    [Fact]
    public void Pulihkan_TanpaSandaran_TidakMenulisApaApa()
    {
        var (p, kunci) = Buat();
        kunci.Padam(PersaraanAutostartCompanion.NamaNilaiRun);

        Assert.False(p.Pulihkan().Berjaya);
        Assert.Null(kunci.Baca(PersaraanAutostartCompanion.NamaNilaiRun));
    }

    [Fact]
    public void Hentikan_SudahTiada_Idempoten()
    {
        var (p, kunci) = Buat();
        p.Hentikan();

        var kedua = p.Hentikan();

        Assert.True(kedua.Berjaya);
        Assert.True(p.SandaranAda());   // sandaran asal kekal untuk pemulihan
        Assert.Null(kunci.Baca(PersaraanAutostartCompanion.NamaNilaiRun));
    }
}

/// <summary>Tiada konfigurasi Desktop = tiada backend; tidak pernah jatuh balik ke Companion.</summary>
public class TiadaBackendSourceTests
{
    [Fact]
    public async Task DemanDanSenarai_TidakPasti_BukanAdaKerja()
    {
        var sumber = new TiadaBackendSource("Fail rahsia enjin tiada pada PC ini; tiada penghantaran.");

        var deman = await ((IKerjaHariIniSource)sumber).SemakAsync();
        var senarai = await ((IKerjaPenuhSource)sumber).SemakAsync();

        Assert.False(deman.AdaKerja);
        Assert.False(deman.EnjinBolehDicapai);
        Assert.False(deman.Sementara);
        Assert.False(senarai.EnjinBolehDicapai);
        Assert.Empty(senarai.Senarai);
        Assert.Contains("Companion tidak digunakan", deman.Sebab);
        Assert.DoesNotContain("8747", deman.Sebab + senarai.Sebab);
    }
}

/// <summary>
/// Pengawal SUMBER (MainForm memerlukan message-loop untuk dibina): laluan
/// runtime tidak lagi menyentuh enjin loopback Companion, dan tiada kod Desktop
/// yang melancarkan pelayar luar.
/// </summary>
public class DesktopTanpaCompanionSumberTests
{
    private static string DesktopDir()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null && !File.Exists(Path.Combine(dir.FullName, "publish.ps1"))) dir = dir.Parent;
        return dir?.FullName ?? throw new InvalidOperationException("Tidak jumpa direktori desktop (publish.ps1).");
    }

    private static string Sumber(string fail) =>
        BarStatusBersihTests.BuangKomen(File.ReadAllText(Path.Combine(DesktopDir(), "HadirDesktop", fail)));

    [Fact]
    public void MainForm_TiadaSumberLoopbackAtauPort8747()
    {
        var s = Sumber("MainForm.cs");

        Assert.DoesNotContain("LoopbackKerjaHariIniSource", s);
        Assert.DoesNotContain("LoopbackKerjaPenuhSource", s);
        Assert.DoesNotContain("LoopbackEngineStatusSource", s);
        Assert.DoesNotContain("EngineEndpoints", s);
        Assert.DoesNotContain("8747", s);
        Assert.DoesNotContain("HADIR-MOEIS-Companion", s);
        Assert.Contains("new TiadaBackendSource(", s);
    }

    [Fact]
    public void MainForm_MigrasiBerjalanSebelumStorBackendDibaca()
    {
        var s = Sumber("MainForm.cs");
        var ctor = s.IndexOf("public MainForm()", StringComparison.Ordinal);
        var migrasi = s.IndexOf("new MigrasiDataCompanion().Jalankan()", ctor, StringComparison.Ordinal);
        var bacaBackend = s.IndexOf("_rahsiaStore.Baca()", ctor, StringComparison.Ordinal);
        var pagar = s.IndexOf("new PagarKonfigurasiBackend(", ctor, StringComparison.Ordinal);

        Assert.True(ctor >= 0 && migrasi > ctor, "migrasi mesti dalam pembina MainForm");
        Assert.True(bacaBackend < 0 || bacaBackend > migrasi, "stor backend tidak boleh dibaca sebelum migrasi");
        Assert.True(pagar > migrasi, "klien backend dibina melalui pagar SELEPAS migrasi");
    }

    [Fact]
    public void MainForm_KlienHanyaMelaluiPagar_DanPersaraanIkutRuntimeAktif()
    {
        var s = Sumber("MainForm.cs");

        Assert.Contains("_hasilMigrasi.Backend.Muktamad,", s);
        Assert.Contains("_backendClient = _pagarBackend.Klien;", s);
        // Satu-satunya HadirBackendClient ialah kilang di dalam pagar.
        Assert.Single(s.Split("new HadirBackendClient(").Skip(1));
        Assert.Contains("(t, pagarRangkaian) => new HadirBackendClient(", s);
        Assert.Contains("pagarSebelumHantar: pagarRangkaian", s);
        Assert.Contains("pagarSebelumPortal: _pagarBackend.SemakSebelumPortal", s);
        Assert.Contains("() => _hasilMigrasi.Kredensial.Muktamad && _kredensialStore.Ada()", s);
        Assert.Contains("_hasilMigrasi.Kredensial.Muktamad ? _kredensialStore.Baca() : null", s);
        Assert.Contains("PersaraanAutostartCompanion.DesktopBolehAmbilAlih(_hasilMigrasi, _pagarBackend)", s);
        Assert.DoesNotContain("() => _rahsiaStore.Baca() is not null", s);
    }

    [Fact]
    public void MainForm_TetingkapBaharuDanSkemaLuarDisekat()
    {
        var s = Sumber("MainForm.cs");

        Assert.Contains("NewWindowRequested += CoreWebView2_NewWindowRequested;", s);
        Assert.Contains("LaunchingExternalUriScheme += CoreWebView2_LaunchingExternalUriScheme;", s);
        var tetingkap = s[s.IndexOf("void CoreWebView2_NewWindowRequested(", StringComparison.Ordinal)..];
        Assert.Contains("e.Handled = true;", tetingkap[..tetingkap.IndexOf('}')]);
        var skema = s[s.IndexOf("void CoreWebView2_LaunchingExternalUriScheme(", StringComparison.Ordinal)..];
        Assert.Contains("e.Cancel = true;", skema[..skema.IndexOf('}')]);
        Assert.DoesNotContain("NewWindow = ", s);   // tiada tetingkap WebView2 kedua
    }

    [Fact]
    public void KodDesktop_TidakMelancarkanPelayarLuar()
    {
        var fail = Directory.GetFiles(Path.Combine(DesktopDir(), "HadirDesktop"), "*.cs");
        Assert.NotEmpty(fail);
        foreach (var laluan in fail)
        {
            // Baris komen dibuang (BuangKomen menolak rentetan mentah berinterpolasi
            // secara sengaja, jadi ia tidak boleh dipakai untuk SEMUA fail).
            var s = string.Join("\n", File.ReadAllLines(laluan)
                .Where(b => !b.TrimStart().StartsWith("//", StringComparison.Ordinal)));
            var nama = Path.GetFileName(laluan);

            Assert.DoesNotContain("msedge", s, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("UseShellExecute = true", s);
            Assert.DoesNotContain("microsoft-edge:", s, StringComparison.OrdinalIgnoreCase);
            if (nama != "KredensialIdMeStore.cs" && nama != "PemasangKemasKini.cs")
            {
                Assert.DoesNotContain("Process.Start", s);
                Assert.DoesNotContain("ProcessStartInfo", s);
            }
        }

        // Satu-satunya proses yang dilancarkan: icacls, tanpa shell.
        var kredensial = BarStatusBersihTests.BuangKomen(
            File.ReadAllText(Path.Combine(DesktopDir(), "HadirDesktop", "KredensialIdMeStore.cs")));
        Assert.Contains("new ProcessStartInfo(\"icacls.exe\")", kredensial);
        Assert.Contains("UseShellExecute = false", kredensial);

        // Pengecualian KEDUA, sengaja dan sempit: pemasang kemas kini memanggil
        // powershell.exe pada skrip DALAM folder pemasangan sahaja. Ia mesti
        // kekal tanpa shell, tanpa pelayar, dan mengekalkan hujah yang dibina
        // oleh PerintahKemasKini (bukan daripada manifest/rangkaian).
        var pemasang = BarStatusBersihTests.BuangKomen(
            File.ReadAllText(Path.Combine(DesktopDir(), "HadirDesktop", "PemasangKemasKini.cs")));
        Assert.Contains("new ProcessStartInfo(\"powershell.exe\")", pemasang);
        Assert.Contains("UseShellExecute = false", pemasang);
        Assert.Contains("PerintahKemasKini.Hujah(", pemasang);
        Assert.Contains("PerintahKemasKini.LaluanSkrip(", pemasang);
        Assert.DoesNotContain("ProcessStartInfo(psi.ArgumentList", pemasang);
        Assert.DoesNotContain("UseShellExecute = true", pemasang);
    }
}
