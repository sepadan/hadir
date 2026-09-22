using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// The KLAIM → HANTAR → SELESAI cycle, driven end to end against a FAKE backend
/// and a FAKE submission adapter. Nothing here touches the real HADIR backend,
/// the real Apps Script deployment, MOEIS, or a browser.
///
/// The assertions are about ORDER and about what must NOT happen: no submission
/// without a held claim, no completion report without a confirmed submission, no
/// stranded lease on failure.
/// </summary>
public class KitaranPenghantaranTests
{
    private const string Pemilik = "pc-ujian-1";
    private static readonly DateTime HariIni = new(2026, 9, 23, 9, 0, 0, DateTimeKind.Local);
    private const string TarikhHariIni = "2026-09-23";

    private static KerjaPenuh Kerja(
        string id = "job-1",
        string status = "menunggu",
        string? tarikh = TarikhHariIni,
        bool adaMurid = true) =>
        new(id, "PRASEKOLAH", tarikh, status, "", "K1",
            adaMurid
                ? new[] { new MuridKerjaPenuh("", "AISYAH BINTI ALI", "SAKIT", "DEMAM") }
                : Array.Empty<MuridKerjaPenuh>());

    private static AliranPenghantaranMoeis Aliran(
        FakeBackend backend,
        FakePenghantar penghantar,
        bool dihidupkan = true,
        string pemilik = Pemilik)
    {
        penghantar.Jejak = backend;
        return new AliranPenghantaranMoeis(
            new BackendKerjaPenuhSource(backend),
            penghantar,
            dihidupkan: () => dihidupkan,
            jam: () => HariIni,
            backend: backend,
            pemilik: () => pemilik);
    }

    // ---------- the happy cycle ----------

    [Fact]
    public async Task Kitaran_SenaraiKlaimHantarSelesai_TertibBetul()
    {
        var backend = new FakeBackend(new[] { Kerja() });
        var penghantar = new FakePenghantar(FakePenghantar.Disahkan());

        var hasil = await Aliran(backend, penghantar).JalankanAsync();

        Assert.Equal(new[] { "senarai", "klaim:job-1", "HANTAR:PRASEKOLAH", "selesai:job-1:berjaya" }, backend.Jejak);
        Assert.Equal(AliranPenghantaranMoeis.StatusDihantar, hasil.Status);
        Assert.True(hasil.Berjaya);
        Assert.Equal(1, hasil.BilDicuba);
    }

    [Fact]
    public async Task Kitaran_KlaimMembawaPemilikDanModBiasa()
    {
        var backend = new FakeBackend(new[] { Kerja() });
        await Aliran(backend, new FakePenghantar(FakePenghantar.Disahkan())).JalankanAsync();

        var klaim = Assert.Single(backend.Klaim);
        Assert.Equal("job-1", klaim.id);
        Assert.Equal(Pemilik, klaim.pemilik);
        Assert.Equal(ModKlaim.Biasa, klaim.mod);
        // The SAME owner reports the result — the backend rejects a report from
        // an engine that does not hold the claim.
        Assert.Equal(Pemilik, Assert.Single(backend.Selesai).pemilik);
    }

    [Fact]
    public async Task Kitaran_MembinaTugasanDaripadaMuatanKlaim_BukanSnapshotSenarai()
    {
        // The list snapshot says "TAHUN SATU"; the backend re-read under its lock
        // says "PRASEKOLAH". The submission must use the CLAIMED payload.
        var senarai = new[]
        {
            new KerjaPenuh("job-1", "TAHUN SATU", TarikhHariIni, "menunggu", "", "K9",
                new[] { new MuridKerjaPenuh("", "LAMA", "SAKIT", "DEMAM") }),
        };
        var backend = new FakeBackend(senarai)
        {
            KlaimPulangan = _ => new TugasanDiklaim("job-1", "PRASEKOLAH", TarikhHariIni, "K1",
                new[] { new MuridKerjaPenuh("", "AISYAH BINTI ALI", "SAKIT", "DEMAM") }),
        };
        var penghantar = new FakePenghantar(FakePenghantar.Disahkan());

        await Aliran(backend, penghantar).JalankanAsync();

        var tugasan = Assert.Single(penghantar.Dihantar);
        Assert.Equal("PRASEKOLAH", tugasan.Kelas);
        Assert.Equal("AISYAH BINTI ALI", Assert.Single(tugasan.TidakHadir).Nama);
    }

    // ---------- selesai ONLY after a confirmed submission ----------

    [Fact]
    public async Task Gagal_MelepaskanLease_TiadaSelesai()
    {
        var backend = new FakeBackend(new[] { Kerja() });
        var penghantar = new FakePenghantar(FakePenghantar.Gagal("gagal-dialog"));

        var hasil = await Aliran(backend, penghantar).JalankanAsync();

        Assert.Equal(new[] { "senarai", "klaim:job-1", "HANTAR:PRASEKOLAH", "lepas:job-1" }, backend.Jejak);
        Assert.Empty(backend.Selesai);
        Assert.Equal(AliranPenghantaranMoeis.StatusGagal, hasil.Status);
    }

    [Fact]
    public async Task AdaptorMelontar_MelepaskanLease_TiadaSelesai()
    {
        var backend = new FakeBackend(new[] { Kerja() });
        var penghantar = new FakePenghantar(_ => throw new InvalidOperationException("adaptor rosak"));

        await Aliran(backend, penghantar).JalankanAsync();

        Assert.Equal(new[] { "senarai", "klaim:job-1", "HANTAR:PRASEKOLAH", "lepas:job-1" }, backend.Jejak);
        Assert.Empty(backend.Selesai);
    }

    [Fact]
    public async Task Tersimpan_DilaporkanSebagaiTersimpan_DanTIDAKDilepaskan()
    {
        // Saved but unverified: releasing it would queue an automatic
        // re-submission of a write that may already be on MOEIS.
        var backend = new FakeBackend(new[] { Kerja() });
        var penghantar = new FakePenghantar(FakePenghantar.Gagal("tersimpan"));

        await Aliran(backend, penghantar).JalankanAsync();

        Assert.Equal("tersimpan", Assert.Single(backend.Selesai).keputusan);
        Assert.Empty(backend.Lepas);
    }

    [Fact]
    public async Task Selesai_DicubaSemula3Kali_DanTIDAKMelepaskanSelepasGagal()
    {
        var backend = new FakeBackend(new[] { Kerja() }) { SelesaiMelontar = true };
        var penghantar = new FakePenghantar(FakePenghantar.Disahkan());

        await Aliran(backend, penghantar).JalankanAsync();

        Assert.Equal(3, backend.Selesai.Count);
        // The MOEIS write already happened — a release here would invite a
        // duplicate submission.
        Assert.Empty(backend.Lepas);
    }

    // ---------- no claim => no submission ----------

    [Fact]
    public async Task KlaimDitolak_TiadaPenghantaranLangsung()
    {
        var backend = new FakeBackend(new[] { Kerja() }) { KlaimPulangan = _ => null };
        var penghantar = new FakePenghantar(FakePenghantar.Disahkan());

        var hasil = await Aliran(backend, penghantar).JalankanAsync();

        Assert.Equal(new[] { "senarai", "klaim:job-1" }, backend.Jejak);
        Assert.Empty(penghantar.Dihantar);
        Assert.Empty(backend.Selesai);
        Assert.Empty(backend.Lepas);   // we never held it
        Assert.Equal(AliranPenghantaranMoeis.StatusTiadaPenghantaran, hasil.Status);
        Assert.Equal(1, hasil.BilDilangkau);
    }

    [Fact]
    public async Task KlaimMelontar_TiadaPenghantaranDanTiadaLepas()
    {
        var backend = new FakeBackend(new[] { Kerja() }) { KlaimMelontar = true };
        var penghantar = new FakePenghantar(FakePenghantar.Disahkan());

        var hasil = await Aliran(backend, penghantar).JalankanAsync();

        Assert.Empty(penghantar.Dihantar);
        Assert.Empty(backend.Selesai);
        Assert.Empty(backend.Lepas);
        Assert.Equal(AliranPenghantaranMoeis.StatusTiadaPenghantaran, hasil.Status);
    }

    [Fact]
    public async Task KlaimDitolakUntukSatu_TugasanLainTetapDihantar()
    {
        var backend = new FakeBackend(new[] { Kerja("job-1"), Kerja("job-2") })
        {
            KlaimPulangan = id => id == "job-1"
                ? null
                : new TugasanDiklaim(id, "PRASEKOLAH", TarikhHariIni, "K1",
                    new[] { new MuridKerjaPenuh("", "AISYAH BINTI ALI", "SAKIT", "DEMAM") }),
        };
        var penghantar = new FakePenghantar(FakePenghantar.Disahkan());

        await Aliran(backend, penghantar).JalankanAsync();

        Assert.Equal(new[] { "senarai", "klaim:job-1", "klaim:job-2", "HANTAR:PRASEKOLAH", "selesai:job-2:berjaya" },
            backend.Jejak);
        Assert.Single(penghantar.Dihantar);
    }

    // ---------- nothing to do ----------

    [Fact]
    public async Task SenaraiKosong_TiadaKlaimLangsung()
    {
        var backend = new FakeBackend(Array.Empty<KerjaPenuh>());
        var penghantar = new FakePenghantar(FakePenghantar.Disahkan());

        var hasil = await Aliran(backend, penghantar).JalankanAsync();

        Assert.Equal(new[] { "senarai" }, backend.Jejak);
        Assert.Empty(penghantar.Dihantar);
        Assert.Equal(AliranPenghantaranMoeis.StatusTiadaPenghantaran, hasil.Status);
    }

    [Fact]
    public async Task TugasanSudahSiapAtauBukanHariIni_TiadaKlaim()
    {
        var backend = new FakeBackend(new[]
        {
            Kerja("job-siap", status: "berjaya"),
            Kerja("job-semalam", tarikh: "2026-09-22"),
            Kerja("job-tiada-tarikh", tarikh: null),
        });

        await Aliran(backend, new FakePenghantar(FakePenghantar.Disahkan())).JalankanAsync();

        Assert.Equal(new[] { "senarai" }, backend.Jejak);
    }

    [Fact]
    public async Task TugasanTidakBolehDibina_Dilepaskan_TiadaPenghantaran()
    {
        var backend = new FakeBackend(new[] { Kerja(adaMurid: false) })
        {
            KlaimPulangan = id => new TugasanDiklaim(id, "PRASEKOLAH", TarikhHariIni, "K1", Array.Empty<MuridKerjaPenuh>()),
        };
        var penghantar = new FakePenghantar(FakePenghantar.Disahkan());

        var hasil = await Aliran(backend, penghantar).JalankanAsync();

        // Claimed, could not be built honestly, lease handed back.
        Assert.Equal(new[] { "senarai", "klaim:job-1", "lepas:job-1" }, backend.Jejak);
        Assert.Empty(penghantar.Dihantar);
        Assert.Equal(1, hasil.BilDilangkau);
    }

    [Fact]
    public async Task EnjinTidakDapatDibaca_TiadaKlaimDanTiadaPenghantaran()
    {
        var backend = new FakeBackend(Array.Empty<KerjaPenuh>()) { SenaraiMelontar = true };
        var penghantar = new FakePenghantar(FakePenghantar.Disahkan());

        var hasil = await Aliran(backend, penghantar).JalankanAsync();

        Assert.Equal(AliranPenghantaranMoeis.StatusEnjinLuarTalian, hasil.Status);
        Assert.Empty(backend.Klaim);
        Assert.Empty(penghantar.Dihantar);
    }

    // ---------- gates ----------

    [Fact]
    public async Task DimatikanSecaraLalai_BackendTidakPernahDisentuh()
    {
        var backend = new FakeBackend(new[] { Kerja() });
        var penghantar = new FakePenghantar(FakePenghantar.Disahkan());

        // No `dihidupkan` at all: the default is OFF.
        var aliran = new AliranPenghantaranMoeis(
            new BackendKerjaPenuhSource(backend), penghantar, jam: () => HariIni, backend: backend, pemilik: () => Pemilik);

        var hasil = await aliran.JalankanAsync();

        Assert.Equal(AliranPenghantaranMoeis.StatusDimatikan, hasil.Status);
        Assert.Empty(backend.Jejak);
        Assert.Empty(penghantar.Dihantar);
    }

    [Fact]
    public async Task TogolMati_TiadaPenghantaran_TogolHidup_Menghantar()
    {
        // The owner toggle ("Hantar ke MOEIS (automatik)") reaches the pass as
        // `dihidupkan`. OFF = the backend is never touched; ON = one submission.
        var backendMati = new FakeBackend(new[] { Kerja() });
        var penghantarMati = new FakePenghantar(FakePenghantar.Disahkan());
        var hasilMati = await Aliran(backendMati, penghantarMati, dihidupkan: false).JalankanAsync();

        Assert.Equal(AliranPenghantaranMoeis.StatusDimatikan, hasilMati.Status);
        Assert.Empty(backendMati.Jejak);
        Assert.Empty(penghantarMati.Dihantar);

        var backendHidup = new FakeBackend(new[] { Kerja() });
        var penghantarHidup = new FakePenghantar(FakePenghantar.Disahkan());
        var hasilHidup = await Aliran(backendHidup, penghantarHidup, dihidupkan: true).JalankanAsync();

        Assert.Equal(AliranPenghantaranMoeis.StatusDihantar, hasilHidup.Status);
        Assert.Single(penghantarHidup.Dihantar);
    }

    [Fact]
    public async Task TiadaIdPemilik_TiadaKlaimDanTiadaPenghantaran()
    {
        var backend = new FakeBackend(new[] { Kerja() });
        var penghantar = new FakePenghantar(FakePenghantar.Disahkan());

        var hasil = await Aliran(backend, penghantar, pemilik: "   ").JalankanAsync();

        Assert.Equal(AliranPenghantaranMoeis.StatusTiadaPemilik, hasil.Status);
        Assert.Empty(backend.Klaim);
        Assert.Empty(penghantar.Dihantar);
    }

    [Fact]
    public async Task TanpaBackend_LaluanLama_TiadaKlaim_TetapiTetapMenghantar()
    {
        // Backwards compatibility: the pass still works as a pure submission
        // pass when no backend client is supplied (no claim/report at all).
        var backend = new FakeBackend(new[] { Kerja() });
        var penghantar = new FakePenghantar(FakePenghantar.Disahkan());

        var aliran = new AliranPenghantaranMoeis(
            new BackendKerjaPenuhSource(backend), penghantar, dihidupkan: () => true, jam: () => HariIni);

        var hasil = await aliran.JalankanAsync();

        Assert.Equal(AliranPenghantaranMoeis.StatusDihantar, hasil.Status);
        Assert.Single(penghantar.Dihantar);
        Assert.Empty(backend.Klaim);
        Assert.Empty(backend.Selesai);
        Assert.Empty(backend.Lepas);
    }

    // ---------- fakes ----------

    /// <summary>
    /// In-memory HADIR backend. Records an ORDERED trace of every RPC so the
    /// tests can assert the cycle's sequence, not just its side effects.
    /// </summary>
    private sealed class FakeBackend : IHadirBackendClient
    {
        private readonly IReadOnlyList<KerjaPenuh> _senarai;
        private readonly List<string> _jejak = new();

        public FakeBackend(IReadOnlyList<KerjaPenuh> senarai) => _senarai = senarai;

        public List<string> Jejak => _jejak;
        public List<(string id, string pemilik, ModKlaim mod)> Klaim { get; } = new();
        public List<(string id, string pemilik)> Lepas { get; } = new();
        public List<(string id, string keputusan, string mesej, int? bil, string pemilik)> Selesai { get; } = new();

        public bool SenaraiMelontar { get; init; }
        public bool KlaimMelontar { get; init; }
        public bool SelesaiMelontar { get; init; }
        public Func<string, TugasanDiklaim?>? KlaimPulangan { get; init; }

        /// <summary>Test seam so the adapter's own calls appear in the same trace.</summary>
        public void Catat(string peristiwa) => _jejak.Add(peristiwa);

        public Task<IReadOnlyList<KerjaPenuh>> SenaraiAsync(CancellationToken ct = default)
        {
            _jejak.Add("senarai");
            if (SenaraiMelontar) throw new HadirBackendException("Rahsia enjin tidak sah.");
            return Task.FromResult(_senarai);
        }

        public Task<TugasanDiklaim?> KlaimAsync(string id, string pemilik, ModKlaim mod, CancellationToken ct = default)
        {
            _jejak.Add("klaim:" + id);
            Klaim.Add((id, pemilik, mod));
            if (KlaimMelontar) throw new HadirBackendException("Tugasan tidak ditemui.");

            var kerja = _senarai.FirstOrDefault(k => k.Id == id);
            var lalai = kerja is null
                ? null
                : new TugasanDiklaim(kerja.Id, kerja.Kelas, kerja.TarikhIso, kerja.KelasMoeisId, kerja.Murid);
            return Task.FromResult(KlaimPulangan is null ? lalai : KlaimPulangan(id));
        }

        public Task LepasAsync(string id, string pemilik, CancellationToken ct = default)
        {
            _jejak.Add("lepas:" + id);
            Lepas.Add((id, pemilik));
            return Task.CompletedTask;
        }

        public Task SelesaiAsync(string id, string keputusan, string mesej, int? bilHadirSelepas, string pemilik, CancellationToken ct = default)
        {
            _jejak.Add("selesai:" + id + ":" + keputusan);
            Selesai.Add((id, keputusan, mesej, bilHadirSelepas, pemilik));
            if (SelesaiMelontar) throw new HadirBackendException("Balasan bukan JSON (status 404).");
            return Task.CompletedTask;
        }
    }

    /// <summary>Scripted submission adapter — never touches a browser.</summary>
    private sealed class FakePenghantar : IPenghantaranMoeis
    {
        private readonly Func<TugasanPenghantaran, HasilPenghantaran> _jawab;

        public FakePenghantar(Func<TugasanPenghantaran, HasilPenghantaran> jawab) => _jawab = jawab;

        /// <summary>When set, the submission is written into the backend's trace.</summary>
        public FakeBackend? Jejak { get; set; }

        public List<TugasanPenghantaran> Dihantar { get; } = new();

        public Task<HasilPenghantaran> HantarAsync(TugasanPenghantaran tugasan, CancellationToken ct = default)
        {
            Dihantar.Add(tugasan);
            Jejak?.Catat("HANTAR:" + tugasan.Kelas);
            return Task.FromResult(_jawab(tugasan));
        }

        public static Func<TugasanPenghantaran, HasilPenghantaran> Disahkan() => t => new HasilPenghantaran
        {
            Status = "disahkan",
            Berjaya = true,
            Sebab = "Pengesahan selepas muat semula berjaya.",
            Kelas = t.Kelas,
            TarikhIso = t.TarikhIso,
        };

        public static Func<TugasanPenghantaran, HasilPenghantaran> Gagal(string status) => t => new HasilPenghantaran
        {
            Status = status,
            Berjaya = false,
            Sebab = "Tidak disahkan.",
            Kelas = t.Kelas,
            TarikhIso = t.TarikhIso,
        };
    }
}
