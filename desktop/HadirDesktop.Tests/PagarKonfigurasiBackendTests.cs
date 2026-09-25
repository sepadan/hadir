using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Pagar konfigurasi backend aktif: stor PALSU/folder sementara dan klien
/// backend PALSU sahaja — tiada rangkaian, tiada Apps Script sebenar.
/// </summary>
public class PagarKonfigurasiBackendTests : IDisposable
{
    private const string UrlA = "https://script.google.com/macros/s/UJIAN-A/exec";
    private const string UrlB = "https://script.google.com/macros/s/UJIAN-B/exec";

    private readonly string _dir = Path.Combine(Path.GetTempPath(), "hadir-pagar-ujian-" + Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ }
    }

    internal sealed class StorPalsu : IRahsiaEnjinStore
    {
        public TetapanBackendEnjin? Tetapan;
        public bool Lontar;
        public TetapanBackendEnjin? Baca() => Lontar ? throw new IOException("simulasi") : Tetapan;
        public StatusRahsiaEnjin Status() => new() { Sebab = "palsu" };
    }

    internal sealed class KlienPalsu : IHadirBackendClient
    {
        public readonly List<string> Panggilan = new();
        public IReadOnlyList<KerjaPenuh> Senarai = Array.Empty<KerjaPenuh>();

        public Task<IReadOnlyList<KerjaPenuh>> SenaraiAsync(CancellationToken ct = default)
        {
            Panggilan.Add("senarai");
            return Task.FromResult(Senarai);
        }

        public Action? SelepasKlaim;

        public Task<TugasanDiklaim?> KlaimAsync(string id, string pemilik, ModKlaim mod, CancellationToken ct = default)
        {
            Panggilan.Add("klaim:" + id);
            SelepasKlaim?.Invoke();
            return Task.FromResult<TugasanDiklaim?>(new TugasanDiklaim(id, "5 Rekaan", "2026-09-25", "k1",
                new[] { new MuridKerjaPenuh("m1", "Murid Rekaan", "Sakit", "Demam") }));
        }

        public Task LepasAsync(string id, string pemilik, CancellationToken ct = default)
        {
            Panggilan.Add("lepas:" + id);
            return Task.CompletedTask;
        }

        public Task SelesaiAsync(string id, string keputusan, string mesej, int? bilHadirSelepas, string pemilik, CancellationToken ct = default)
        {
            Panggilan.Add("selesai:" + id);
            return Task.CompletedTask;
        }
    }

    private static (PagarKonfigurasiBackend, StorPalsu, KlienPalsu) Buat(bool migrasiMuktamad = true)
    {
        var stor = new StorPalsu { Tetapan = new TetapanBackendEnjin(UrlA, "rahsia-rekaan-a") };
        var klien = new KlienPalsu();
        return (new PagarKonfigurasiBackend(stor, migrasiMuktamad, (_, _) => klien), stor, klien);
    }

    // --- 1. konfigurasi ditarik / rosak / bertukar ---

    [Fact]
    public async Task KonfigurasiSama_PanggilanDiteruskan()
    {
        var (pagar, _, klien) = Buat();

        await pagar.Klien!.SenaraiAsync();
        await pagar.Klien!.KlaimAsync("j1", "pc-rekaan", ModKlaim.Biasa);

        Assert.True(pagar.Semak().Sah);
        Assert.Equal(new[] { "senarai", "klaim:j1" }, klien.Panggilan);
    }

    [Fact]
    public async Task KonfigurasiDipadam_TiadaPanggilanBackend()
    {
        var (pagar, stor, klien) = Buat();
        stor.Tetapan = null;

        await Assert.ThrowsAsync<HadirBackendException>(() => pagar.Klien!.SenaraiAsync());
        await Assert.ThrowsAsync<HadirBackendException>(() => pagar.Klien!.KlaimAsync("j1", "pc-rekaan", ModKlaim.Biasa));

        Assert.False(pagar.Semak().Sah);
        Assert.Empty(klien.Panggilan);
    }

    [Theory]
    [InlineData(UrlA, "rahsia-rekaan-lain")]
    [InlineData(UrlB, "rahsia-rekaan-a")]
    public async Task KonfigurasiBertukarKepadaNilaiSahLain_TiadaPanggilanBackend(string url, string rahsia)
    {
        var (pagar, stor, klien) = Buat();
        stor.Tetapan = new TetapanBackendEnjin(url, rahsia);

        var ralat = await Assert.ThrowsAsync<HadirBackendException>(() => pagar.Klien!.SenaraiAsync());

        Assert.False(ralat.Sementara);
        Assert.Empty(klien.Panggilan);
        Assert.DoesNotContain(rahsia, ralat.Message);
        Assert.DoesNotContain("script.google.com", ralat.Message);
    }

    [Fact]
    public async Task StorMelontar_GagalTertutup()
    {
        var (pagar, stor, klien) = Buat();
        stor.Lontar = true;

        await Assert.ThrowsAsync<HadirBackendException>(() => pagar.Klien!.SenaraiAsync());
        Assert.Empty(klien.Panggilan);
    }

    [Fact]
    public async Task FailRahsiaRosakSelepasLancar_StorSebenar_TiadaPanggilan()
    {
        Directory.CreateDirectory(_dir);
        File.WriteAllText(Path.Combine(_dir, "tetapan.json"), "{\"apiUrl\":\"" + UrlA + "\"}");
        File.WriteAllBytes(Path.Combine(_dir, "rahsia.dat"), ProtectedData.Protect(
            Encoding.UTF8.GetBytes("{\"rahsiaEnjin\":\"rahsia-rekaan\"}"), null, DataProtectionScope.CurrentUser));
        var klien = new KlienPalsu();
        var pagar = new PagarKonfigurasiBackend(new DpapiRahsiaEnjinStore(_dir), true, (_, _) => klien);
        await pagar.Klien!.SenaraiAsync();

        File.WriteAllBytes(Path.Combine(_dir, "rahsia.dat"), new byte[] { 1, 2, 3 });

        await Assert.ThrowsAsync<HadirBackendException>(() => pagar.Klien!.SenaraiAsync());
        Assert.Equal(new[] { "senarai" }, klien.Panggilan);
    }

    [Fact]
    public async Task KonfigurasiDitarik_SumberDeman_TidakPasti_TanpaPanggilan()
    {
        var (pagar, stor, klien) = Buat();
        stor.Tetapan = null;

        var deman = await new BackendKerjaHariIniSource(pagar.Klien!).SemakAsync();
        var senarai = await new BackendKerjaPenuhSource(pagar.Klien!).SemakAsync();

        Assert.False(deman.AdaKerja);
        Assert.False(deman.EnjinBolehDicapai);
        Assert.False(senarai.EnjinBolehDicapai);
        Assert.Empty(klien.Panggilan);
    }

    [Fact]
    public async Task LepasSelesai_TugasanTidakDiklaimKlienIni_Disekat()
    {
        var (pagar, stor, klien) = Buat();
        stor.Tetapan = null;

        await Assert.ThrowsAsync<HadirBackendException>(() => pagar.Klien!.SelesaiAsync("j9", "berjaya", "", null, "pc-rekaan"));
        await Assert.ThrowsAsync<HadirBackendException>(() => pagar.Klien!.LepasAsync("j9", "pc-rekaan"));
        Assert.Empty(klien.Panggilan);
    }

    [Fact]
    public async Task KlaimSebelumDitarik_LaporanTugasanItuSahajaDibenarkan()
    {
        var (pagar, stor, klien) = Buat();
        await pagar.Klien!.KlaimAsync("j1", "pc-rekaan", ModKlaim.Biasa);
        stor.Tetapan = null;

        // Tulisan MOEIS mungkin sudah berlaku: keputusannya direkod, bukan dibiarkan
        // 'sedang_dihantar' untuk dituntut dan ditulis semula.
        await pagar.Klien!.SelesaiAsync("j1", "berjaya", "", null, "pc-rekaan");
        await Assert.ThrowsAsync<HadirBackendException>(() => pagar.Klien!.KlaimAsync("j2", "pc-rekaan", ModKlaim.Biasa));
        // Selepas selesai, id itu tidak lagi dipegang.
        await Assert.ThrowsAsync<HadirBackendException>(() => pagar.Klien!.SelesaiAsync("j1", "berjaya", "", null, "pc-rekaan"));

        Assert.Equal(new[] { "klaim:j1", "selesai:j1" }, klien.Panggilan);
    }

    private sealed class PenghantarPalsu : IPenghantaranMoeis
    {
        public int Panggilan;
        public Task<HasilPenghantaran> HantarAsync(TugasanPenghantaran tugasan, CancellationToken ct = default)
        {
            Panggilan++;
            return Task.FromResult(new HasilPenghantaran { Status = "disahkan", Berjaya = true, Kelas = tugasan.Kelas });
        }
    }

    [Fact]
    public async Task AliranPenghantaran_KonfigurasiDitarikSelepasSenarai_TiadaKlaimTiadaHantar()
    {
        var (pagar, stor, klien) = Buat();
        klien.Senarai = new[]
        {
            new KerjaPenuh("j1", "5 Rekaan", "2026-09-25", "menunggu", "", "k1",
                new[] { new MuridKerjaPenuh("m1", "Murid Rekaan", "Sakit", "Demam") }),
        };
        var penghantar = new PenghantarPalsu();
        // Senarai dibaca dengan konfigurasi sah; konfigurasi ditarik sebelum klaim.
        var sumber = new SumberLaluTarik(new BackendKerjaPenuhSource(pagar.Klien!), () => stor.Tetapan = null);
        var aliran = new AliranPenghantaranMoeis(sumber, penghantar, dihidupkan: () => true,
            jam: () => new DateTime(2026, 9, 25, 9, 0, 0), backend: pagar.Klien, pemilik: () => "pc-rekaan");

        var hasil = await aliran.JalankanAsync();

        Assert.Equal(0, penghantar.Panggilan);
        Assert.Equal(new[] { "senarai" }, klien.Panggilan);
        Assert.Equal(0, hasil.BilDicuba);
        Assert.Equal(1, hasil.BilDilangkau);   // klaim ditolak oleh pagar = dilangkau
    }

    [Fact]
    public async Task AliranPenghantaran_KonfigurasiDitarikSebelumKitaran_TiadaPanggilanLangsung()
    {
        var (pagar, stor, klien) = Buat();
        stor.Tetapan = new TetapanBackendEnjin(UrlB, "rahsia-rekaan-a");
        var penghantar = new PenghantarPalsu();
        var aliran = new AliranPenghantaranMoeis(new BackendKerjaPenuhSource(pagar.Klien!), penghantar,
            dihidupkan: () => true, backend: pagar.Klien, pemilik: () => "pc-rekaan");

        await aliran.JalankanAsync();

        Assert.Empty(klien.Panggilan);
        Assert.Equal(0, penghantar.Panggilan);
    }

    [Fact]
    public async Task AliranPenghantaran_KonfigurasiDitarikAntaraKlaimDanPortal_TiadaTulisanPortal_KlaimDilepaskan()
    {
        var (pagar, stor, klien) = Buat();
        klien.Senarai = new[]
        {
            new KerjaPenuh("j1", "5 Rekaan", "2026-09-25", "menunggu", "", "k1",
                new[] { new MuridKerjaPenuh("m1", "Murid Rekaan", "Sakit", "Demam") }),
        };
        // Klaim berjaya dengan konfigurasi sah; konfigurasi ditarik SEJURUS selepas itu.
        klien.SelepasKlaim = () => stor.Tetapan = new TetapanBackendEnjin(UrlB, "rahsia-rekaan-a");
        var penghantar = new PenghantarPalsu();
        var log = new List<string>();
        var aliran = new AliranPenghantaranMoeis(new BackendKerjaPenuhSource(pagar.Klien!), penghantar,
            dihidupkan: () => true, jam: () => new DateTime(2026, 9, 25, 9, 0, 0), log: log.Add,
            backend: pagar.Klien, pemilik: () => "pc-rekaan", pagarSebelumPortal: pagar.SemakSebelumPortal);

        var hasil = await aliran.JalankanAsync();

        Assert.Equal(0, penghantar.Panggilan);                                   // tiada tulisan MOEIS
        Assert.Equal(new[] { "senarai", "klaim:j1", "lepas:j1" }, klien.Panggilan); // klaim yang dipegang dilepaskan
        Assert.Equal(0, hasil.BilDicuba);
        Assert.Equal(1, hasil.BilDilangkau);
        Assert.Contains(log, b => b.StartsWith("PORTAL_DISEKAT_PAGAR: id=j1", StringComparison.Ordinal));
    }

    [Fact]
    public async Task AliranPenghantaran_KonfigurasiKekalSama_PortalDipanggil()
    {
        var (pagar, _, klien) = Buat();
        klien.Senarai = new[]
        {
            new KerjaPenuh("j1", "5 Rekaan", "2026-09-25", "menunggu", "", "k1",
                new[] { new MuridKerjaPenuh("m1", "Murid Rekaan", "Sakit", "Demam") }),
        };
        var penghantar = new PenghantarPalsu();
        var aliran = new AliranPenghantaranMoeis(new BackendKerjaPenuhSource(pagar.Klien!), penghantar,
            dihidupkan: () => true, jam: () => new DateTime(2026, 9, 25, 9, 0, 0),
            backend: pagar.Klien, pemilik: () => "pc-rekaan", pagarSebelumPortal: pagar.SemakSebelumPortal);

        await aliran.JalankanAsync();

        Assert.Equal(1, penghantar.Panggilan);
        Assert.Equal(new[] { "senarai", "klaim:j1", "selesai:j1" }, klien.Panggilan);
    }

    // --- A. pagar SEJURUS sebelum setiap HttpClient.SendAsync (HTTP palsu dalam proses) ---

    private sealed class PengendaliPalsu : HttpMessageHandler
    {
        public readonly List<string> Kaedah = new();
        public Func<string, HttpResponseMessage> Jawapan = _ => Balas(HttpStatusCode.ServiceUnavailable, "bukan json");

        public static HttpResponseMessage Balas(HttpStatusCode kod, string badan) =>
            new(kod) { Content = new StringContent(badan, Encoding.UTF8, "application/json") };

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var badan = await request.Content!.ReadAsStringAsync(ct);
            var kaedah = System.Text.Json.JsonDocument.Parse(badan).RootElement.GetProperty("kaedah").GetString()!;
            Kaedah.Add(kaedah);
            return Jawapan(kaedah);
        }
    }

    private static (PagarKonfigurasiBackend, StorPalsu, PengendaliPalsu) BuatSebenar(Func<StorPalsu, Task>? tunggu = null)
    {
        var stor = new StorPalsu { Tetapan = new TetapanBackendEnjin(UrlA, "rahsia-rekaan-a") };
        var pengendali = new PengendaliPalsu();
        var pagar = new PagarKonfigurasiBackend(stor, true, (t, g) => new HadirBackendClient(
            new HttpClient(pengendali), t.ApiUrl, t.RahsiaEnjin, TimeSpan.FromSeconds(5),
            jedaCubaSemula: new[] { TimeSpan.FromMilliseconds(1) },
            tunggu: (_, _) => tunggu?.Invoke(stor) ?? Task.CompletedTask,
            pagarSebelumHantar: g));
        return (pagar, stor, pengendali);
    }

    [Fact]
    public async Task CubaanSemula_KonfigurasiBertukarSemasaJeda_TiadaPermintaanKedua()
    {
        var (pagar, _, pengendali) = BuatSebenar(stor =>
        {
            stor.Tetapan = new TetapanBackendEnjin(UrlB, "rahsia-rekaan-a");   // bertukar semasa jeda 2 s/6 s
            return Task.CompletedTask;
        });

        var ralat = await Assert.ThrowsAsync<HadirBackendException>(() => pagar.Klien!.SenaraiAsync());

        Assert.Equal(new[] { "moeisJobSenarai" }, pengendali.Kaedah);   // cubaan pertama sahaja
        Assert.False(ralat.Sementara);
        Assert.Equal(PagarKonfigurasiBackend.SebabBerubah, ralat.Message);
    }

    [Fact]
    public async Task CubaanSemula_KonfigurasiDipadamSemasaJeda_TiadaPermintaanKedua()
    {
        var (pagar, _, pengendali) = BuatSebenar(stor => { stor.Tetapan = null; return Task.CompletedTask; });

        await Assert.ThrowsAsync<HadirBackendException>(() => pagar.Klien!.SenaraiAsync());

        Assert.Single(pengendali.Kaedah);
    }

    [Fact]
    public async Task CubaanSemula_KonfigurasiSama_SemuaCubaanDibuat()
    {
        var (pagar, _, pengendali) = BuatSebenar();

        var ralat = await Assert.ThrowsAsync<HadirBackendException>(() => pagar.Klien!.SenaraiAsync());

        Assert.Equal(HadirBackendClient.CubaanBacaLalai, pengendali.Kaedah.Count);
        Assert.True(ralat.Sementara);
    }

    [Fact]
    public async Task KlienSebenar_PagarMenolak_TiadaIoRangkaianLangsung()
    {
        var pengendali = new PengendaliPalsu();
        var dipanggil = new List<(string, string?)>();
        var klien = new HadirBackendClient(new HttpClient(pengendali), UrlA, "rahsia-rekaan", TimeSpan.FromSeconds(5),
            pagarSebelumHantar: (k, id) => { dipanggil.Add((k, id)); return "ditolak ujian"; });

        await Assert.ThrowsAsync<HadirBackendException>(() => klien.SenaraiAsync());
        await Assert.ThrowsAsync<HadirBackendException>(() => klien.KlaimAsync("j1", "pc-rekaan", ModKlaim.Biasa));
        await Assert.ThrowsAsync<HadirBackendException>(() => klien.LepasAsync("j1", "pc-rekaan"));
        await Assert.ThrowsAsync<HadirBackendException>(() => klien.SelesaiAsync("j1", "berjaya", "", null, "pc-rekaan"));

        Assert.Empty(pengendali.Kaedah);
        Assert.Equal(new (string, string?)[]
        {
            ("moeisJobSenarai", null), ("moeisJobKlaim", "j1"), ("moeisJobLepas", "j1"), ("moeisJobSelesai", "j1"),
        }, dipanggil);
    }

    [Fact]
    public async Task KlienSebenar_PagarMelontar_GagalTertutup()
    {
        var pengendali = new PengendaliPalsu();
        var klien = new HadirBackendClient(new HttpClient(pengendali), UrlA, "rahsia-rekaan", TimeSpan.FromSeconds(5),
            pagarSebelumHantar: (_, _) => throw new IOException("simulasi"));

        await Assert.ThrowsAsync<HadirBackendException>(() => klien.SenaraiAsync());
        Assert.Empty(pengendali.Kaedah);
    }

    [Fact]
    public async Task KlienSebenar_KlaimDipegang_LepasDibenarkanDiPeringkatRangkaian_KlaimBaharuDisekat()
    {
        var (pagar, stor, pengendali) = BuatSebenar();
        pengendali.Jawapan = k => k == "moeisJobKlaim"
            ? PengendaliPalsu.Balas(HttpStatusCode.OK, "{\"ok\":true,\"hasil\":{\"id\":\"j1\",\"kelas\":\"5 Rekaan\"}}")
            : PengendaliPalsu.Balas(HttpStatusCode.OK, "{\"ok\":true,\"hasil\":null}");
        await pagar.Klien!.KlaimAsync("j1", "pc-rekaan", ModKlaim.Biasa);
        stor.Tetapan = null;

        await pagar.Klien!.LepasAsync("j1", "pc-rekaan");
        await Assert.ThrowsAsync<HadirBackendException>(() => pagar.Klien!.KlaimAsync("j2", "pc-rekaan", ModKlaim.Biasa));

        Assert.Equal(new[] { "moeisJobKlaim", "moeisJobLepas" }, pengendali.Kaedah);
        Assert.NotNull(pagar.SemakSebelumPortal());   // klaim dipegang TIDAK membenarkan tulisan portal
    }

    private sealed class SumberLaluTarik : IKerjaPenuhSource
    {
        private readonly IKerjaPenuhSource _dalam;
        private readonly Action _selepas;
        public SumberLaluTarik(IKerjaPenuhSource dalam, Action selepas) { _dalam = dalam; _selepas = selepas; }
        public async Task<SenaraiKerjaPenuh> SemakAsync(CancellationToken ct = default)
        {
            var s = await _dalam.SemakAsync(ct);
            _selepas();
            return s;
        }
    }

    // --- 3. migrasi belum muktamad ---

    [Fact]
    public void MigrasiBelumMuktamad_TiadaKlienDibina()
    {
        var dibina = 0;
        var stor = new StorPalsu { Tetapan = new TetapanBackendEnjin(UrlA, "rahsia-rekaan-a") };

        var pagar = new PagarKonfigurasiBackend(stor, migrasiBackendMuktamad: false, (_, _) => { dibina++; return new KlienPalsu(); });

        Assert.Null(pagar.Klien);
        Assert.Equal(0, dibina);
        Assert.False(pagar.Semak().Sah);
    }

    [Fact]
    public void TiadaKonfigurasiSemasaLancar_TiadaKlien_WalaupunDisimpanKemudian()
    {
        var stor = new StorPalsu();
        var pagar = new PagarKonfigurasiBackend(stor, true, (_, _) => new KlienPalsu());
        stor.Tetapan = new TetapanBackendEnjin(UrlA, "rahsia-rekaan-a");

        Assert.Null(pagar.Klien);
        Assert.False(pagar.Semak().Sah);
    }

    // --- 2. syarat persaraan ikut runtime aktif ---

    private static HasilMigrasi Migrasi(KeputusanMigrasi backend, KeputusanMigrasi kredensial = KeputusanMigrasi.Dipindahkan) =>
        new(new StatusMigrasiUnit("backend", backend, ""), new StatusMigrasiUnit("kredensial", kredensial, ""));

    [Fact]
    public void Persaraan_KlienAktifSepadan_DanMigrasiMuktamad_Dibenarkan()
    {
        var (pagar, _, _) = Buat();
        Assert.True(PersaraanAutostartCompanion.DesktopBolehAmbilAlih(Migrasi(KeputusanMigrasi.Dipindahkan), pagar));
        Assert.True(PersaraanAutostartCompanion.DesktopBolehAmbilAlih(Migrasi(KeputusanMigrasi.SudahSelesai, KeputusanMigrasi.TiadaLegasi), pagar));
    }

    [Fact]
    public void Persaraan_TiadaKlienAktif_WalaupunCakeraSahSekarang_Ditolak()
    {
        var stor = new StorPalsu();
        var pagar = new PagarKonfigurasiBackend(stor, true, (_, _) => new KlienPalsu());
        stor.Tetapan = new TetapanBackendEnjin(UrlA, "rahsia-rekaan-a");   // disimpan selepas lancar

        Assert.False(PersaraanAutostartCompanion.DesktopBolehAmbilAlih(Migrasi(KeputusanMigrasi.Dipindahkan), pagar));
    }

    [Fact]
    public void Persaraan_KonfigurasiBasiAtauTiada_Ditolak()
    {
        var (pagar, stor, _) = Buat();
        stor.Tetapan = new TetapanBackendEnjin(UrlB, "rahsia-rekaan-a");
        Assert.False(PersaraanAutostartCompanion.DesktopBolehAmbilAlih(Migrasi(KeputusanMigrasi.Dipindahkan), pagar));

        stor.Tetapan = null;
        Assert.False(PersaraanAutostartCompanion.DesktopBolehAmbilAlih(Migrasi(KeputusanMigrasi.Dipindahkan), pagar));
    }

    [Theory]
    [InlineData(KeputusanMigrasi.Ralat, KeputusanMigrasi.Dipindahkan)]
    [InlineData(KeputusanMigrasi.RekodRosak, KeputusanMigrasi.Dipindahkan)]
    [InlineData(KeputusanMigrasi.Dipindahkan, KeputusanMigrasi.LegasiTidakSah)]
    [InlineData(KeputusanMigrasi.Dipindahkan, KeputusanMigrasi.Ralat)]
    public void Persaraan_MigrasiBelumMuktamad_Ditolak(KeputusanMigrasi backend, KeputusanMigrasi kredensial)
    {
        var (pagar, _, _) = Buat();
        Assert.False(PersaraanAutostartCompanion.DesktopBolehAmbilAlih(Migrasi(backend, kredensial), pagar));
    }

    [Fact]
    public void Persaraan_DisambungKePagar_RegistryPalsuTidakDiubahBilaDitolak()
    {
        var stor = new StorPalsu();
        var pagar = new PagarKonfigurasiBackend(stor, true, (_, _) => new KlienPalsu());
        stor.Tetapan = new TetapanBackendEnjin(UrlA, "rahsia-rekaan-a");
        var kunci = new Dictionary<string, string> { [PersaraanAutostartCompanion.NamaNilaiRun] = "arahan-rekaan" };
        var persaraan = new PersaraanAutostartCompanion(new RunKeyKamus(kunci), _dir,
            () => PersaraanAutostartCompanion.DesktopBolehAmbilAlih(Migrasi(KeputusanMigrasi.Dipindahkan), pagar));

        Assert.False(persaraan.Hentikan().Berjaya);
        Assert.Equal("arahan-rekaan", kunci[PersaraanAutostartCompanion.NamaNilaiRun]);
        Assert.False(persaraan.SandaranAda());
    }

    private sealed class RunKeyKamus : IRegistryRunKey
    {
        private readonly Dictionary<string, string> _k;
        public RunKeyKamus(Dictionary<string, string> k) => _k = k;
        public string? Baca(string nama) => _k.TryGetValue(nama, out var v) ? v : null;
        public void Tulis(string nama, string nilai) => _k[nama] = nilai;
        public void Padam(string nama) => _k.Remove(nama);
    }
}
