using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Submission-flow tests against an in-memory MOEIS page stub (no WebView2, no
/// network, no real MOEIS/idMe). The stub models the page for real — ticked
/// boxes, per-row category/reason selects, a save dialog and a reload that only
/// keeps what was actually SAVED — so the tests prove behaviour, not mocking:
///
///   * category AND reason are filled on every marked row BEFORE the save
///     button is touched;
///   * a student MOEIS already has as absent is never re-sent;
///   * exact / unambiguous-prefix / ambiguous-STOP dropdown matching;
///   * a re-read that cannot confirm the data is NEVER reported as success.
/// </summary>
public class PenghantaranMoeisTests
{
    private static TugasanPenghantaran Tugasan(params MuridTidakHadir[] murid) => new()
    {
        Kelas = "PRASEKOLAH",
        TarikhIso = "2026-09-22",
        TidakHadir = murid,
    };

    private static DomMoeisPalsu Dom(params string[] idHadir)
    {
        var dom = new DomMoeisPalsu { TarikhPada = "22/09/2026" };
        dom.PilihanKelas.Add(new PilihanDropdown("", "-- Pilih Kelas --"));
        dom.PilihanKelas.Add(new PilihanDropdown("K1", "PRASEKOLAH BIJAK"));
        dom.PilihanKategori.Add(new PilihanDropdown("", "-- Pilih --"));
        dom.PilihanKategori.Add(new PilihanDropdown("S", "SAKIT"));
        dom.PilihanKategori.Add(new PilihanDropdown("U", "URUSAN KELUARGA"));
        dom.PilihanSebab.Add(new PilihanDropdown("", "-- Pilih --"));
        dom.PilihanSebab.Add(new PilihanDropdown("S1", "DEMAM"));
        dom.PilihanSebab.Add(new PilihanDropdown("S2", "SELSEMA"));
        foreach (var id in idHadir) dom.Murid.Add(new DomMoeisPalsu.Baris { Id = id });
        dom.Simpan();   // this is what a reload would restore
        return dom;
    }

    private static MuridTidakHadir Sakit(string id) => new(id, "SAKIT", "DEMAM");

    // ---------- happy path ----------

    [Fact]
    public async Task Berjaya_HanyaSelepasBacaSemulaMengesahkan()
    {
        var dom = Dom("101", "102", "103");
        var hasil = await new PenghantaranMoeis(dom).HantarAsync(Tugasan(Sakit("102")));

        Assert.Equal("disahkan", hasil.Status);
        Assert.True(hasil.Berjaya);
        Assert.Equal("simpan", hasil.TindakanSimpan);
        Assert.Equal(3, hasil.BilMurid);
        Assert.Equal(1, hasil.BilPerubahan);
        Assert.Equal(0, hasil.BilDilangkau);
        Assert.True(hasil.Verifikasi.Semua);
        // Exactly one save and exactly one mandatory re-read — never a second submit.
        Assert.Equal(1, dom.BilKemaskini);
        Assert.Equal(1, dom.BilSimpan);
        Assert.Equal(0, dom.BilSimpanSah);
        Assert.Equal(1, dom.BilMuatSemula);
    }

    [Fact]
    public async Task Sahkan_MenggunakanButangSimpanSah()
    {
        var dom = Dom("101");
        var tugasan = new TugasanPenghantaran
        {
            Kelas = "PRASEKOLAH", TarikhIso = "2026-09-22", Sahkan = true,
            TidakHadir = new[] { Sakit("101") },
        };

        var hasil = await new PenghantaranMoeis(dom).HantarAsync(tugasan);

        Assert.True(hasil.Berjaya);
        Assert.Equal("simpansah", hasil.TindakanSimpan);
        Assert.Equal(1, dom.BilSimpanSah);
        Assert.Equal(0, dom.BilSimpan);
    }

    [Fact]
    public async Task KategoriDanSebabDiisiSebelumSimpan()
    {
        var dom = Dom("101", "102");
        var hasil = await new PenghantaranMoeis(dom).HantarAsync(Tugasan(Sakit("101"), Sakit("102")));

        Assert.True(hasil.Berjaya);
        // The stub records the form state at the moment the save button is used.
        Assert.True(dom.PenuhSemasaSimpan);

        var iSimpan = dom.Panggilan.IndexOf("kemaskini");
        Assert.True(iSimpan > 0);
        foreach (var id in new[] { "101", "102" })
        {
            var iTanda = dom.Panggilan.IndexOf("tanda:" + id);
            var iKategori = dom.Panggilan.IndexOf("kategori:" + id + "=S");
            var iSebab = dom.Panggilan.IndexOf("sebab:" + id + "=S1");
            Assert.True(iTanda >= 0 && iKategori > iTanda && iSebab > iKategori);
            Assert.True(iSebab < iSimpan);
        }
    }

    // ---------- no duplicate submissions ----------

    [Fact]
    public async Task MuridSudahTidakHadirDiMoeis_TidakDitandaSemula()
    {
        var dom = Dom("101", "102");
        // MOEIS already has 101 absent with the same category/reason.
        var b = dom.Murid.First(m => m.Id == "101");
        b.Hadir = false;
        b.KategoriNilai = "S"; b.KategoriTeks = "SAKIT";
        b.SebabNilai = "S1"; b.SebabTeks = "DEMAM";
        dom.Simpan();

        var hasil = await new PenghantaranMoeis(dom).HantarAsync(Tugasan(Sakit("101"), Sakit("102")));

        Assert.True(hasil.Berjaya);
        Assert.Equal(1, hasil.BilPerubahan);
        Assert.Equal(1, hasil.BilDilangkau);
        Assert.DoesNotContain("tanda:101", dom.Panggilan);   // never re-sent
        Assert.Contains("tanda:102", dom.Panggilan);
    }

    [Fact]
    public async Task SemuaSudahTidakHadir_TiadaSimpanLangsung()
    {
        var dom = Dom("101");
        var b = dom.Murid[0];
        b.Hadir = false; b.KategoriNilai = "S"; b.SebabNilai = "S1";
        dom.Simpan();

        var hasil = await new PenghantaranMoeis(dom).HantarAsync(Tugasan(Sakit("101")));

        Assert.Equal("tidak-berubah", hasil.Status);
        Assert.False(hasil.Berjaya);
        Assert.Equal(1, hasil.BilDilangkau);
        Assert.Equal(0, dom.BilKemaskini);
        Assert.Equal(0, dom.BilSimpan);
    }

    [Fact]
    public async Task PenduaIdDalamTugasan_Berhenti_TanpaMenyentuhPortal()
    {
        var dom = Dom("101");
        var hasil = await new PenghantaranMoeis(dom).HantarAsync(Tugasan(Sakit("101"), new MuridTidakHadir("101", "URUSAN KELUARGA", "SELSEMA")));

        Assert.Equal("pendua-id", hasil.Status);
        Assert.False(hasil.Berjaya);
        Assert.Empty(dom.Panggilan);   // portal never touched
    }

    // ---------- the task is the only source of truth ----------

    [Fact]
    public async Task KategoriAtauSebabTiadaDalamTugasan_Berhenti_TanpaMenyentuhPortal()
    {
        var dom = Dom("101");
        var hasil = await new PenghantaranMoeis(dom).HantarAsync(Tugasan(new MuridTidakHadir("101", "SAKIT", "")));

        Assert.Equal("kategori-sebab-tiada", hasil.Status);
        Assert.Empty(dom.Panggilan);
    }

    [Fact]
    public async Task TugasanKosong_TiadaApaApaDihantar()
    {
        var dom = Dom("101");
        var hasil = await new PenghantaranMoeis(dom).HantarAsync(Tugasan());

        Assert.Equal("tugasan-kosong", hasil.Status);
        Assert.False(hasil.Berjaya);
        Assert.Empty(dom.Panggilan);
    }

    [Fact]
    public async Task TarikhIsoTidakSah_Berhenti_TanpaMenyentuhPortal()
    {
        var dom = Dom("101");
        var tugasan = new TugasanPenghantaran { Kelas = "PRASEKOLAH", TarikhIso = "22/09/2026", TidakHadir = new[] { Sakit("101") } };

        var hasil = await new PenghantaranMoeis(dom).HantarAsync(tugasan);

        Assert.Equal("tugasan-tidak-sah", hasil.Status);
        Assert.Empty(dom.Panggilan);
    }

    [Fact]
    public async Task IdTidakWujudDalamMoeis_TiadaSimpan()
    {
        var dom = Dom("101");
        var hasil = await new PenghantaranMoeis(dom).HantarAsync(Tugasan(Sakit("999")));

        Assert.Equal("id-tidak-dijumpai", hasil.Status);
        Assert.False(hasil.Berjaya);
        Assert.Equal(0, dom.BilSimpan);
        Assert.DoesNotContain(dom.Panggilan, p => p.StartsWith("tanda:", StringComparison.Ordinal));
    }

    [Fact]
    public async Task KetidakhadiranSediaAdaLuarTugasan_TidakDipulihkanDanTidakMenjejaskanPengesahan()
    {
        var dom = Dom("101", "102");
        var lain = dom.Murid.First(m => m.Id == "102");
        lain.Hadir = false; lain.KategoriNilai = "U"; lain.SebabNilai = "S2";
        dom.Simpan();

        var hasil = await new PenghantaranMoeis(dom).HantarAsync(Tugasan(Sakit("101")));

        Assert.True(hasil.Berjaya);
        Assert.False(dom.Murid.First(m => m.Id == "102").Hadir);   // left exactly as MOEIS had it
        Assert.DoesNotContain("tanda:102", dom.Panggilan);
    }

    // ---------- dropdown matching: exact / prefix / ambiguous-STOP ----------

    [Fact]
    public async Task PadananKelas_Awalan_TidakAmbigu_Diterima()
    {
        var dom = Dom("101");   // page only offers "PRASEKOLAH BIJAK"
        var hasil = await new PenghantaranMoeis(dom).HantarAsync(Tugasan(Sakit("101")));

        Assert.True(hasil.Berjaya);
        Assert.Equal("K1", dom.KelasDipilih);
    }

    [Fact]
    public async Task PadananKelas_Ambigu_Berhenti_TiadaSimpan()
    {
        var dom = Dom("101");
        dom.PilihanKelas.Add(new PilihanDropdown("K2", "PRASEKOLAH CERIA"));

        var hasil = await new PenghantaranMoeis(dom).HantarAsync(Tugasan(Sakit("101")));

        Assert.Equal("kelas-tidak-dipilih", hasil.Status);
        Assert.Contains("ambigu", hasil.Sebab);
        Assert.Null(dom.KelasDipilih);
        Assert.Equal(0, dom.BilSimpan);
    }

    [Fact]
    public async Task PadananKategori_Ambigu_Berhenti_TiadaSimpan()
    {
        var dom = Dom("101");
        dom.PilihanKategori.Add(new PilihanDropdown("S9", "SAKIT BERPANJANGAN"));
        dom.PilihanKategori.Add(new PilihanDropdown("S8", "SAKIT BIASA"));
        // "SAKIT B" has no exact hit and prefixes BOTH options → stop, never guess.
        var hasil = await new PenghantaranMoeis(dom).HantarAsync(
            Tugasan(new MuridTidakHadir("101", "SAKIT B", "DEMAM")));

        Assert.Equal("gagal-isi", hasil.Status);
        Assert.Contains("ambigu", hasil.Sebab);
        Assert.Equal(0, dom.BilKemaskini);
        Assert.Equal(0, dom.BilSimpan);
    }

    [Fact]
    public async Task PadananKategori_Tepat_MenangKeAtasAwalan()
    {
        var dom = Dom("101");
        dom.PilihanKategori.Add(new PilihanDropdown("S9", "SAKIT BERPANJANGAN"));

        var hasil = await new PenghantaranMoeis(dom).HantarAsync(Tugasan(Sakit("101")));

        Assert.True(hasil.Berjaya);
        Assert.Equal("S", dom.Murid[0].KategoriNilai);   // exact "SAKIT", not the prefix hit
    }

    [Fact]
    public async Task SebabTidakWujud_Berhenti_TiadaSimpan()
    {
        var dom = Dom("101");
        var hasil = await new PenghantaranMoeis(dom).HantarAsync(
            Tugasan(new MuridTidakHadir("101", "SAKIT", "BATUK")));

        Assert.Equal("gagal-isi", hasil.Status);
        Assert.Contains("BATUK", hasil.Sebab);
        Assert.Equal(0, dom.BilSimpan);
    }

    // ---------- the re-read is what decides success ----------

    [Fact]
    public async Task BacaSemulaTidakMengesahkan_TidakBerjaya()
    {
        var dom = Dom("101");
        dom.SimpanBerkesan = false;   // dialog says "Berjaya." but nothing persisted

        var hasil = await new PenghantaranMoeis(dom).HantarAsync(Tugasan(Sakit("101")));

        Assert.Equal("tersimpan", hasil.Status);
        Assert.False(hasil.Berjaya);
        Assert.False(hasil.Verifikasi.Murid);
        Assert.Equal(1, dom.BilMuatSemula);
        Assert.Equal(1, dom.BilSimpan);   // never re-submitted after a failed re-read
    }

    [Fact]
    public async Task BacaSemulaKehilanganKategoriSebab_TidakBerjaya()
    {
        var dom = Dom("101");
        dom.KosongkanSebabSelepasMuatSemula = true;

        var hasil = await new PenghantaranMoeis(dom).HantarAsync(Tugasan(Sakit("101")));

        Assert.Equal("tersimpan", hasil.Status);
        Assert.False(hasil.Berjaya);
        Assert.True(hasil.Verifikasi.Murid);
        Assert.False(hasil.Verifikasi.KategoriSebab);
    }

    [Fact]
    public async Task BacaSemulaTidakDapatDibaca_TidakBerjaya()
    {
        var dom = Dom("101");
        dom.TabGagalSelepasMuatSemula = true;

        var hasil = await new PenghantaranMoeis(dom).HantarAsync(Tugasan(Sakit("101")));

        Assert.Equal("tersimpan", hasil.Status);
        Assert.False(hasil.Berjaya);
        Assert.Equal(1, dom.BilSimpan);
    }

    [Fact]
    public async Task DialogBerjayaTiada_TidakBerjaya()
    {
        var dom = Dom("101");
        dom.DialogBerjaya = false;

        var hasil = await new PenghantaranMoeis(dom).HantarAsync(Tugasan(Sakit("101")));

        Assert.Equal("gagal-dialog", hasil.Status);
        Assert.False(hasil.Berjaya);
        Assert.Equal(0, dom.BilMuatSemula);
    }

    [Fact]
    public async Task DialogSimpanTidakMuncul_TiadaButangDitekan()
    {
        var dom = Dom("101");
        dom.DialogSimpanMuncul = false;

        var hasil = await new PenghantaranMoeis(dom).HantarAsync(Tugasan(Sakit("101")));

        Assert.Equal("gagal-dialog", hasil.Status);
        Assert.Equal(0, dom.BilSimpan);
        Assert.Equal(0, dom.BilSimpanSah);
    }

    // ---------- page readiness ----------

    [Fact]
    public async Task PemilihSebabTidakMuncul_Berhenti_TiadaSimpan()
    {
        var dom = Dom("101");
        dom.PemilihSebabMuncul = false;

        var hasil = await new PenghantaranMoeis(dom).HantarAsync(Tugasan(Sakit("101")));

        Assert.Equal("gagal-isi", hasil.Status);
        Assert.Contains("pemilih kategori", hasil.Sebab);
        Assert.Equal(0, dom.BilSimpan);
    }

    [Fact]
    public async Task TarikhTidakDapatDitetapkan_Berhenti_TiadaSimpan()
    {
        var dom = Dom("101");
        dom.TarikhPada = "21/09/2026";
        dom.TarikhBolehDitetapkan = false;

        var hasil = await new PenghantaranMoeis(dom).HantarAsync(Tugasan(Sakit("101")));

        Assert.Equal("halaman-tidak-sedia", hasil.Status);
        Assert.Contains("22/09/2026", hasil.Sebab);
        Assert.Equal(0, dom.BilSimpan);
    }

    [Fact]
    public async Task TabHarianGagal_Berhenti_TiadaSimpan()
    {
        var dom = Dom("101");
        dom.TabBoleh = false;

        var hasil = await new PenghantaranMoeis(dom).HantarAsync(Tugasan(Sakit("101")));

        Assert.Equal("halaman-tidak-sedia", hasil.Status);
        Assert.Equal(0, dom.BilSimpan);
    }

    [Fact]
    public async Task RalatTeknikalDom_DilaporkanSebagaiGagal_BukanBerjaya()
    {
        var dom = Dom("101");
        dom.RalatPadaSenarai = true;

        var hasil = await new PenghantaranMoeis(dom).HantarAsync(Tugasan(Sakit("101")));

        Assert.Equal("gagal", hasil.Status);
        Assert.False(hasil.Berjaya);
        Assert.Equal(0, dom.BilSimpan);
    }

    [Fact]
    public async Task Pembatalan_Dilontar_TidakDiamDiam()
    {
        var dom = Dom("101");
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => new PenghantaranMoeis(dom).HantarAsync(Tugasan(Sakit("101")), cts.Token));
    }
}

/// <summary>
/// Pure dropdown-matching rules, ported from <c>pilihDropdown</c>: EXACT first,
/// then an UNAMBIGUOUS prefix, otherwise STOP. Never guess.
/// </summary>
public class PadananDropdownTests
{
    private static readonly PilihanDropdown[] Opsyen =
    {
        new("", "-- Pilih --"),
        new("K1", "PRASEKOLAH BIJAK"),
        new("K2", "TAHUN EMPAT CERGAS"),
        new("K3", "TAHUN LIMA GEMILANG"),
    };

    [Fact]
    public void Tepat_Diterima()
    {
        var k = PadananDropdown.Pilih(Opsyen, "TAHUN EMPAT CERGAS");
        Assert.True(k.Ok);
        Assert.Equal("K2", k.Nilai);
        Assert.Equal("tepat", k.Cara);
    }

    [Fact]
    public void Awalan_TidakAmbigu_Diterima()
    {
        var k = PadananDropdown.Pilih(Opsyen, "PRASEKOLAH");
        Assert.True(k.Ok);
        Assert.Equal("K1", k.Nilai);
        Assert.Equal("awalan", k.Cara);
    }

    [Fact]
    public void Awalan_Ambigu_Berhenti()
    {
        var k = PadananDropdown.Pilih(Opsyen, "TAHUN");
        Assert.False(k.Ok);
        Assert.Equal("padanan-ambigu", k.Sebab);
        Assert.Equal(2, k.BilanganCalon);
    }

    [Fact]
    public void Tepat_MenangKeAtasAwalanAmbigu()
    {
        var opsyen = new[]
        {
            new PilihanDropdown("A", "SAKIT"),
            new PilihanDropdown("B", "SAKIT BERPANJANGAN"),
            new PilihanDropdown("C", "SAKIT KRONIK"),
        };
        var k = PadananDropdown.Pilih(opsyen, "SAKIT");
        Assert.True(k.Ok);
        Assert.Equal("A", k.Nilai);
        Assert.Equal("tepat", k.Cara);
    }

    [Fact]
    public void NilaiTepat_DiterimaWalaupunTeksBerbeza()
    {
        var k = PadananDropdown.Pilih(new[] { new PilihanDropdown("S", "SAKIT") }, "S");
        Assert.True(k.Ok);
        Assert.Equal("tepat-nilai", k.Cara);
    }

    [Fact]
    public void TiadaPadanan_Berhenti()
    {
        var k = PadananDropdown.Pilih(Opsyen, "TINGKATAN ENAM");
        Assert.False(k.Ok);
        Assert.Equal("tiada-pilihan", k.Sebab);
    }

    [Fact]
    public void PilihanDenganNilaiKosong_Ditolak()
    {
        var k = PadananDropdown.Pilih(new[] { new PilihanDropdown("", "PRASEKOLAH BIJAK") }, "PRASEKOLAH");
        Assert.False(k.Ok);
        Assert.Equal("nilai-kosong", k.Sebab);
    }

    [Fact]
    public void LabelKosong_Ditolak()
    {
        Assert.False(PadananDropdown.Pilih(Opsyen, "  ").Ok);
        Assert.False(PadananDropdown.Pilih(Opsyen, null).Ok);
    }

    [Fact]
    public void Normalisasi_AbaikanRuangDanTandaBaca()
    {
        var k = PadananDropdown.Pilih(new[] { new PilihanDropdown("K", "TAHUN 4 - CERGAS") }, "tahun4cergas");
        Assert.True(k.Ok);
        Assert.Equal("K", k.Nilai);
    }

    [Fact]
    public void SenaraiKosongAtauNull_Berhenti()
    {
        Assert.False(PadananDropdown.Pilih(Array.Empty<PilihanDropdown>(), "PRASEKOLAH").Ok);
        Assert.False(PadananDropdown.Pilih(null, "PRASEKOLAH").Ok);
    }

    [Theory]
    [InlineData("2026-09-22", "22/09/2026")]
    [InlineData("2026-01-01", "01/01/2026")]
    public void FormatTarikh_IsoKePaparan(string iso, string jangka)
        => Assert.Equal(jangka, PenghantaranMoeisFlow.FormatTarikhPaparan(iso));

    [Theory]
    [InlineData("22/09/2026")]
    [InlineData("2026-9-22")]
    [InlineData("")]
    [InlineData(null)]
    public void FormatTarikh_TidakSah_Null(string? iso)
        => Assert.Null(PenghantaranMoeisFlow.FormatTarikhPaparan(iso));
}

/// <summary>
/// In-memory stand-in for the MOEIS attendance page. State only survives a
/// reload if it was actually SAVED, so "the dialog said Berjaya but nothing
/// persisted" is a state the tests can create honestly.
/// </summary>
public sealed class DomMoeisPalsu : IDomMoeis
{
    public sealed class Baris
    {
        public string Id = "";
        public bool Hadir = true;
        public string KategoriNilai = "";
        public string KategoriTeks = "";
        public string SebabNilai = "";
        public string SebabTeks = "";
        public Baris Salin() => new()
        {
            Id = Id, Hadir = Hadir,
            KategoriNilai = KategoriNilai, KategoriTeks = KategoriTeks,
            SebabNilai = SebabNilai, SebabTeks = SebabTeks,
        };
    }

    public List<Baris> Murid = new();
    public List<PilihanDropdown> PilihanKelas = new();
    public List<PilihanDropdown> PilihanTahun = new();
    public List<PilihanDropdown> PilihanKategori = new();
    public List<PilihanDropdown> PilihanSebab = new();
    public string TarikhPada = "";
    public string? KelasDipilih;
    public string? TahunDipilih;

    // Failure injection knobs.
    public bool TabBoleh = true;
    public bool TabGagalSelepasMuatSemula;
    public bool KemaskiniKelihatan = true;
    public bool TarikhBolehDitetapkan = true;
    public bool PemilihSebabMuncul = true;
    public bool DialogSimpanMuncul = true;
    public bool DialogBerjaya = true;
    public bool SimpanBerkesan = true;
    public bool KosongkanSebabSelepasMuatSemula;
    public bool RalatPadaSenarai;

    // Observations.
    public List<string> Panggilan = new();
    public int BilKemaskini, BilSimpan, BilSimpanSah, BilMuatSemula;
    public bool PenuhSemasaSimpan;

    private List<Baris> _tersimpan = new();
    private bool _dialogTerbuka;

    /// <summary>Commit the current rows as the "saved" state (fixture setup + save).</summary>
    public void Simpan() => _tersimpan = Murid.Select(b => b.Salin()).ToList();

    private Baris? Cari(string id) => Murid.FirstOrDefault(b => b.Id == id);

    public Task NavigasiHarian() { Panggilan.Add("navigasi"); return Task.CompletedTask; }

    public Task<bool> KlikTabHarian()
    {
        Panggilan.Add("tab-harian");
        if (!TabBoleh) return Task.FromResult(false);
        if (TabGagalSelepasMuatSemula && BilMuatSemula > 0) return Task.FromResult(false);
        return Task.FromResult(true);
    }

    public Task<bool> TungguKemaskiniKelihatan() => Task.FromResult(KemaskiniKelihatan);

    public Task<string?> BacaTarikhInput() => Task.FromResult<string?>(TarikhPada);

    public Task TetapkanTarikhInput(string paparanDdMmYyyy)
    {
        Panggilan.Add("tarikh:" + paparanDdMmYyyy);
        if (TarikhBolehDitetapkan) TarikhPada = paparanDdMmYyyy;
        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<PilihanDropdown>> BacaPilihanDropdown(string selektor)
    {
        var senarai = selektor == PenghantaranMoeisFlow.SelektorTahun ? PilihanTahun : PilihanKelas;
        return Task.FromResult<IReadOnlyList<PilihanDropdown>>(senarai);
    }

    public Task<bool> PilihNilaiDropdown(string selektor, string nilai)
    {
        Panggilan.Add("dropdown:" + selektor + "=" + nilai);
        if (selektor == PenghantaranMoeisFlow.SelektorTahun) TahunDipilih = nilai;
        else KelasDipilih = nilai;
        return Task.FromResult(true);
    }

    public Task<IReadOnlyList<BarisMurid>> BacaSenaraiMurid()
    {
        if (RalatPadaSenarai) throw new InvalidOperationException("skrip DOM gagal");
        return Task.FromResult<IReadOnlyList<BarisMurid>>(Murid.Select(b => new BarisMurid(b.Id, b.Hadir)).ToList());
    }

    public Task<bool> TandaTidakHadir(string id)
    {
        Panggilan.Add("tanda:" + id);
        var b = Cari(id);
        if (b == null) return Task.FromResult(false);
        b.Hadir = false;
        return Task.FromResult(true);
    }

    public Task<bool> TungguPemilihSebab(string id) => Task.FromResult(PemilihSebabMuncul && Cari(id) != null);

    public Task<IReadOnlyList<PilihanDropdown>> BacaPilihanKategori(string id) =>
        Task.FromResult<IReadOnlyList<PilihanDropdown>>(PilihanKategori);

    public Task<bool> PilihKategori(string id, string nilai)
    {
        Panggilan.Add("kategori:" + id + "=" + nilai);
        var b = Cari(id);
        var o = PilihanKategori.FirstOrDefault(p => p.Nilai == nilai);
        if (b == null || o == null) return Task.FromResult(false);
        b.KategoriNilai = o.Nilai;
        b.KategoriTeks = o.Teks;
        return Task.FromResult(true);
    }

    public Task<IReadOnlyList<PilihanDropdown>> BacaPilihanSebab(string id) =>
        Task.FromResult<IReadOnlyList<PilihanDropdown>>(PilihanSebab);

    public Task<bool> PilihSebab(string id, string nilai)
    {
        Panggilan.Add("sebab:" + id + "=" + nilai);
        var b = Cari(id);
        var o = PilihanSebab.FirstOrDefault(p => p.Nilai == nilai);
        if (b == null || o == null) return Task.FromResult(false);
        b.SebabNilai = o.Nilai;
        b.SebabTeks = o.Teks;
        return Task.FromResult(true);
    }

    public Task<SebabMurid?> BacaSebabMurid(string id)
    {
        var b = Cari(id);
        if (b == null) return Task.FromResult<SebabMurid?>(null);
        return Task.FromResult<SebabMurid?>(new SebabMurid(b.KategoriNilai, b.KategoriTeks, b.SebabNilai, b.SebabTeks));
    }

    public Task TekanKemaskini()
    {
        Panggilan.Add("kemaskini");
        BilKemaskini++;
        _dialogTerbuka = DialogSimpanMuncul;
        // Snapshot the invariant the flow promises: every absent row carries a
        // category AND a reason by the time the save dialog is reached.
        PenuhSemasaSimpan = Murid.Where(b => !b.Hadir)
            .All(b => b.KategoriNilai.Length > 0 && b.SebabNilai.Length > 0);
        return Task.CompletedTask;
    }

    public Task<bool> DialogSimpanKelihatan() => Task.FromResult(_dialogTerbuka);

    public Task<bool> KlikSimpan()
    {
        Panggilan.Add("simpan");
        BilSimpan++;
        if (SimpanBerkesan) Simpan();
        return Task.FromResult(true);
    }

    public Task<bool> KlikSimpanSahkan()
    {
        Panggilan.Add("simpansah");
        BilSimpanSah++;
        if (SimpanBerkesan) Simpan();
        return Task.FromResult(true);
    }

    public Task<bool> DialogBerjayaKelihatan() => Task.FromResult(DialogBerjaya);

    public Task MuatSemula()
    {
        Panggilan.Add("muat-semula");
        BilMuatSemula++;
        _dialogTerbuka = false;
        Murid = _tersimpan.Select(b => b.Salin()).ToList();
        if (KosongkanSebabSelepasMuatSemula)
        {
            foreach (var b in Murid) { b.KategoriNilai = ""; b.KategoriTeks = ""; b.SebabNilai = ""; b.SebabTeks = ""; }
        }
        return Task.CompletedTask;
    }
}
