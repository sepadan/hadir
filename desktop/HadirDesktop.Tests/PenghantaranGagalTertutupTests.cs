using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// (a) Pagar konfigurasi TERAKHIR sejurus sebelum klik Simpan / Simpan &amp;
/// Sahkan; (b) laporan keputusan yang gagal TIDAK menyimpan apa-apa untuk
/// dimainkan semula — kitaran seterusnya menuntut semula tugasan dan aliran
/// produksi membaca MOEIS dahulu (baca-sebelum-tulis). Semua ujian memakai
/// aliran penghantaran PRODUKSI (<see cref="PenghantaranMoeis"/>) di atas
/// halaman MOEIS palsu dalam memori (<see cref="DomMoeisPalsu"/>) dan backend
/// palsu — tiada portal, tiada rangkaian, data rekaan sahaja.
/// </summary>
public class PenghantaranGagalTertutupTests
{
    private const string HariIniIso = "2026-09-22";
    private static readonly DateTime Jam = new(2026, 9, 22, 9, 0, 0);

    private static DomMoeisPalsu Dom()
    {
        var dom = new DomMoeisPalsu { TarikhPada = "22/09/2026" };
        PenghantaranMoeisTests.IsiPilihanTahun(dom);
        dom.PilihanKelas.Add(new PilihanDropdown("", "-- Pilih Kelas --"));
        dom.PilihanKelas.Add(new PilihanDropdown("K1", "PRASEKOLAH BIJAK"));
        dom.PilihanKategori.Add(new PilihanDropdown("", "-- Pilih --"));
        dom.PilihanKategori.Add(new PilihanDropdown("S", "SAKIT"));
        dom.PilihanSebab.Add(new PilihanDropdown("", "-- Pilih --"));
        dom.PilihanSebab.Add(new PilihanDropdown("S1", "DEMAM"));
        foreach (var id in new[] { "101", "102", "103" }) dom.Murid.Add(new DomMoeisPalsu.Baris { Id = id });
        dom.Simpan();
        return dom;
    }

    private static TugasanPenghantaran Tugasan(Func<string?>? pagar, bool sahkan = true) => new()
    {
        Kelas = "PRASEKOLAH",
        TarikhIso = HariIniIso,
        Sahkan = sahkan,
        TidakHadir = new[] { new MuridTidakHadir("102", "SAKIT", "DEMAM") },
        PagarSebelumSimpan = pagar,
    };

    /// <summary>
    /// Penghias <see cref="IDomMoeis"/>: menjalankan <see cref="SemasaIsiBorang"/>
    /// ketika sebab murid dipilih — iaitu SEMASA borang disediakan, selepas
    /// pagar awal aliran dan sebelum butang simpan.
    /// </summary>
    private sealed class DomDenganKesan : IDomMoeis
    {
        private readonly DomMoeisPalsu _d;
        public Action? SemasaIsiBorang;
        public DomDenganKesan(DomMoeisPalsu d) => _d = d;

        public Task<HasilMuat> NavigasiHarian() => _d.NavigasiHarian();
        public Task<bool> KlikTabHarian() => _d.KlikTabHarian();
        public Task<bool> TungguKemaskiniKelihatan() => _d.TungguKemaskiniKelihatan();
        public Task<string?> BacaTarikhInput() => _d.BacaTarikhInput();
        public Task TetapkanTarikhInput(string p) => _d.TetapkanTarikhInput(p);
        public Task<IReadOnlyList<PilihanDropdown>> BacaPilihanDropdown(string s) => _d.BacaPilihanDropdown(s);
        public Task<bool> PilihNilaiDropdown(string s, string n) => _d.PilihNilaiDropdown(s, n);
        public Task<IReadOnlyList<BarisMurid>> BacaSenaraiMurid() => _d.BacaSenaraiMurid();
        public Task<bool> TandaTidakHadir(string id) => _d.TandaTidakHadir(id);
        public Task<bool> TungguPemilihSebab(string id) => _d.TungguPemilihSebab(id);
        public Task<IReadOnlyList<PilihanDropdown>> BacaPilihanKategori(string id) => _d.BacaPilihanKategori(id);
        public Task<bool> PilihKategori(string id, string n) => _d.PilihKategori(id, n);
        public Task<IReadOnlyList<PilihanDropdown>> BacaPilihanSebab(string id) => _d.BacaPilihanSebab(id);
        public Task<bool> PilihSebab(string id, string n) { SemasaIsiBorang?.Invoke(); return _d.PilihSebab(id, n); }
        public Task<SebabMurid?> BacaSebabMurid(string id) => _d.BacaSebabMurid(id);
        public Task TekanKemaskini() => _d.TekanKemaskini();
        public Task<bool> DialogSimpanKelihatan() => _d.DialogSimpanKelihatan();
        public Task<bool> KlikSimpan() => _d.KlikSimpan();
        public Task<bool> KlikSimpanSahkan() => _d.KlikSimpanSahkan();
        public Task<bool> StatusBadgeDisahkan() => _d.StatusBadgeDisahkan();
        public Task<bool> DialogBerjayaKelihatan() => _d.DialogBerjayaKelihatan();
        public Task<HasilMuat> MuatSemula() => _d.MuatSemula();
    }

    // ================= (a) pagar sejurus sebelum klik simpan =================

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Aliran_PagarMenolakSebelumKlik_TiadaKlikSimpan(bool sahkan)
    {
        var dom = Dom();

        var hasil = await new PenghantaranMoeis(dom).HantarAsync(Tugasan(() => "konfigurasi ditarik (ujian)", sahkan));

        Assert.Equal(PenghantaranMoeisFlow.StatusDisekatPagar, hasil.Status);
        Assert.False(hasil.Berjaya);
        Assert.Equal(0, dom.BilSimpan);
        Assert.Equal(0, dom.BilSimpanSah);
        Assert.Contains("tiada tulisan portal", hasil.Sebab);
        Assert.Contains("disekat-pagar", hasil.Bukti);
        // Borang memang disediakan (tempoh berisiko itu benar-benar dilalui).
        Assert.Equal(1, dom.BilKemaskini);
        Assert.Contains("sebab:102=S1", dom.Panggilan);
    }

    [Fact]
    public async Task Aliran_PagarMelontar_GagalTertutup_TiadaKlikSimpan()
    {
        var dom = Dom();

        var hasil = await new PenghantaranMoeis(dom).HantarAsync(Tugasan(() => throw new InvalidOperationException("simulasi")));

        Assert.Equal(PenghantaranMoeisFlow.StatusDisekatPagar, hasil.Status);
        Assert.Equal(0, dom.BilSimpan + dom.BilSimpanSah);
        Assert.Contains("InvalidOperationException", hasil.Sebab);
    }

    [Fact]
    public async Task Aliran_PagarMembenarkan_SatuKlikSahaja_Disahkan()
    {
        var dom = Dom();
        var dipanggil = 0;

        var hasil = await new PenghantaranMoeis(dom).HantarAsync(Tugasan(() => { dipanggil++; return null; }));

        Assert.Equal("disahkan", hasil.Status);
        Assert.Equal(1, dom.BilSimpanSah);
        Assert.Equal(1, dipanggil);
    }

    [Theory]
    [InlineData("tukar")]
    [InlineData("padam")]
    public async Task AliranPenuh_KonfigurasiBerubahSemasaBorangDisediakan_TiadaSimpan_KlaimDilepaskan(string perubahan)
    {
        var stor = new PagarKonfigurasiBackendTests.StorPalsu
        {
            Tetapan = new TetapanBackendEnjin("https://script.google.com/macros/s/UJIAN-A/exec", "rahsia-rekaan-a"),
        };
        var klien = new BackendBerurutan { SelesaiGagal = false };
        var pagar = new PagarKonfigurasiBackend(stor, true, (_, _) => klien);
        var dom = Dom();
        var domKesan = new DomDenganKesan(dom)
        {
            SemasaIsiBorang = () => stor.Tetapan = perubahan == "padam"
                ? null
                : new TetapanBackendEnjin("https://script.google.com/macros/s/UJIAN-B/exec", "rahsia-rekaan-a"),
        };
        var aliran = new AliranPenghantaranMoeis(new BackendKerjaPenuhSource(pagar.Klien!), new PenghantaranMoeis(domKesan),
            dihidupkan: () => true, jam: () => Jam, sahkan: true, backend: pagar.Klien,
            pemilik: () => "pc-rekaan", pagarSebelumPortal: pagar.SemakSebelumPortal);

        var hasil = await aliran.JalankanAsync();

        // Pagar awal lulus (borang memang diisi), pagar akhir menolak klik.
        Assert.Contains("sebab:102=S1", dom.Panggilan);
        Assert.Equal(0, dom.BilSimpan);
        Assert.Equal(0, dom.BilSimpanSah);
        Assert.Equal(PenghantaranMoeisFlow.StatusDisekatPagar, Assert.Single(hasil.Hasil).Status);
        // Klaim yang dipegang dilepaskan (pengecualian pemilik klaim); tiada 'selesai'.
        Assert.Equal(new[] { "senarai", "klaim:j1", "lepas:j1" }, klien.Jejak);
    }

    // ================= (b) laporan gagal: tiada main semula, baca MOEIS semula =================

    private static readonly MuridKerjaPenuh[] SnapshotAsal = { new("102", "", "SAKIT", "DEMAM") };

    private static readonly MuridKerjaPenuh[] SnapshotBaharu =
    {
        new("102", "", "SAKIT", "DEMAM"),
        new("103", "", "SAKIT", "DEMAM"),
    };

    /// <summary>
    /// Backend palsu yang memodelkan peraturan HadirWeb.gs yang berkaitan:
    /// klaim 'menunggu' atau 'sedang_dihantar' oleh pemilik sama; 'selesai'
    /// hanya diterima semasa 'sedang_dihantar'/'tersimpan'; admin boleh mencipta
    /// semula tugasan terminal dengan ID SAMA (status 'menunggu', snapshot
    /// baharu). Klaim tidak memulangkan sebarang generasi — sama seperti
    /// <c>hadirMoeisJobKlaim_</c> sebenar.
    /// </summary>
    private sealed class BackendBerurutan : IHadirBackendClient
    {
        public bool SelesaiGagal = true;
        /// <summary>'selesai' DIREKOD di backend, tetapi balasannya hilang (melontar).</summary>
        public bool SelesaiKomitLaluLontar;
        public readonly List<string> Jejak = new();
        public string Status = "menunggu";
        public IReadOnlyList<MuridKerjaPenuh> Murid = SnapshotAsal;
        /// <summary>Dijalankan DI DALAM klaim, selepas senarai dibaca (perlumbaan senarai→klaim).</summary>
        public Action? SemasaKlaim;
        /// <summary>Dijalankan setiap kali 'selesai' dipanggil (untuk merakam keadaan MOEIS ketika itu).</summary>
        public Action<string>? SemasaSelesai;

        /// <summary>Admin mencipta semula tugasan dengan ID yang sama (hadirMoeisJobBuatDiBawahLock_).</summary>
        public void AdminCiptaSemula(IReadOnlyList<MuridKerjaPenuh> murid)
        {
            Status = "menunggu";
            Murid = murid;
        }

        public Task<IReadOnlyList<KerjaPenuh>> SenaraiAsync(CancellationToken ct = default)
        {
            Jejak.Add("senarai");
            return Task.FromResult<IReadOnlyList<KerjaPenuh>>(new[]
            {
                new KerjaPenuh("j1", "PRASEKOLAH", HariIniIso, Status, "", "K1", Murid),
            });
        }

        public Task<TugasanDiklaim?> KlaimAsync(string id, string pemilik, ModKlaim mod, CancellationToken ct = default)
        {
            Jejak.Add("klaim:" + id);
            SemasaKlaim?.Invoke();
            SemasaKlaim = null;
            // Peraturan backend: pemilik SAMA boleh menuntut semula 'sedang_dihantar' serta-merta.
            if (Status != "menunggu" && Status != "sedang_dihantar") return Task.FromResult<TugasanDiklaim?>(null);
            Status = "sedang_dihantar";
            return Task.FromResult<TugasanDiklaim?>(new TugasanDiklaim(id, "PRASEKOLAH", HariIniIso, "K1", Murid));
        }

        public Task LepasAsync(string id, string pemilik, CancellationToken ct = default)
        {
            Jejak.Add("lepas:" + id);
            Status = "menunggu";
            return Task.CompletedTask;
        }

        public Task SelesaiAsync(string id, string keputusan, string mesej, int? bil, string pemilik, CancellationToken ct = default)
        {
            Jejak.Add("selesai:" + id + ":" + keputusan);
            SemasaSelesai?.Invoke(keputusan);
            if (Status != "sedang_dihantar" && Status != "tersimpan")
                throw new HadirBackendException("backend tolak: Status tugasan tidak sepadan untuk merekod keputusan.");
            if (SelesaiKomitLaluLontar)
            {
                Status = keputusan;   // direkod...
                throw new HadirBackendException("backend sibuk (masa tamat)", sementara: true);   // ...tetapi balasan hilang
            }
            if (SelesaiGagal) throw new HadirBackendException("Balasan bukan JSON (status 404).");
            Status = keputusan;
            return Task.CompletedTask;
        }
    }

    private static AliranPenghantaranMoeis AliranUntuk(BackendBerurutan backend, IDomMoeis dom, List<string>? log = null) =>
        new(new BackendKerjaPenuhSource(backend), new PenghantaranMoeis(dom),
            dihidupkan: () => true, jam: () => Jam, log: log is null ? null : log.Add,
            sahkan: true, backend: backend, pemilik: () => "pc-rekaan");

    private static int Navigasi(DomMoeisPalsu dom) => dom.Panggilan.Count(p => p == "navigasi");

    [Fact]
    public async Task LaporanGagal_KitaranSeterusnyaAliranSama_MembacaMoeis_TiadaSimpanKedua_LaporKeputusanBaharu()
    {
        var backend = new BackendBerurutan();
        var dom = Dom();
        var log = new List<string>();
        var aliran = AliranUntuk(backend, dom, log);

        var pertama = await aliran.JalankanAsync();

        Assert.Equal("disahkan", Assert.Single(pertama.Hasil).Status);
        Assert.Equal(1, dom.BilSimpanSah);
        Assert.Equal(AliranPenghantaranMoeis.StatusLaporanGagal, pertama.Status);
        Assert.False(pertama.Berjaya);
        Assert.Equal(1, pertama.BilLaporanGagal);
        Assert.Equal(3, backend.Jejak.Count(j => j == "selesai:j1:berjaya"));
        Assert.DoesNotContain("lepas:j1", backend.Jejak);   // tulisan sudah berlaku: tidak dilepaskan
        Assert.Contains(log, b => b.StartsWith("LAPOR_GAGAL: id=j1", StringComparison.Ordinal));
        var navigasi1 = Navigasi(dom);

        // Kitaran 2 (aliran SAMA, laporan masih gagal): tuntut semula, BACA MOEIS,
        // tiada Simpan kedua. Tiada keputusan lama dimainkan semula.
        var kedua = await aliran.JalankanAsync();

        Assert.True(Navigasi(dom) > navigasi1);                                  // MOEIS dibaca semula
        Assert.Equal("tidak-berubah", Assert.Single(kedua.Hasil).Status);
        Assert.Equal(1, dom.BilSimpanSah);                                       // TIADA simpan kedua
        Assert.Equal(0, dom.BilSimpan);
        Assert.Equal(AliranPenghantaranMoeis.StatusLaporanGagal, kedua.Status);
        Assert.DoesNotContain("lepas:j1", backend.Jejak);

        // Kitaran 3 (backend pulih): sekali lagi baca MOEIS; hanya keputusan BAHARU dilaporkan.
        backend.SelesaiGagal = false;
        var navigasi2 = Navigasi(dom);
        var ketiga = await aliran.JalankanAsync();

        Assert.True(Navigasi(dom) > navigasi2);
        Assert.Equal("tidak-berubah", Assert.Single(ketiga.Hasil).Status);
        Assert.Equal(1, dom.BilSimpanSah);
        Assert.Equal("berjaya", backend.Status);
        Assert.Equal(AliranPenghantaranMoeis.StatusDihantar, ketiga.Status);
        Assert.Equal(0, ketiga.BilLaporanGagal);
    }

    [Fact]
    public async Task CiptaSemulaIdSamaSnapshotSama_DalamPerlumbaanSenaraiKlaim_MoeisBerubah_AliranBiasaMenulisSemula()
    {
        var backend = new BackendBerurutan();   // laporan pertama gagal; status kekal sedang_dihantar
        var dom = Dom();
        var log = new List<string>();
        var aliran = AliranUntuk(backend, dom, log);
        await aliran.JalankanAsync();
        Assert.Equal(1, dom.BilSimpanSah);

        // Selepas operasi lama: seseorang memulihkan murid 102 kepada HADIR di MOEIS
        // dan pengesahan hilang. Keputusan lama ('disahkan') kini SALAH bagi MOEIS.
        var baris = dom.Murid.Single(b => b.Id == "102");
        baris.Hadir = true;
        baris.KategoriNilai = baris.KategoriTeks = baris.SebabNilai = baris.SebabTeks = "";
        dom.Simpan();
        dom.BadgeDisahkan = false;

        // Perlumbaan: senarai dibaca dahulu (sedang_dihantar), kemudian DI DALAM
        // klaim, tugasan itu selesai dan admin menciptanya semula — ID SAMA,
        // snapshot SAMA. Klaim tidak memulangkan generasi.
        backend.SelesaiGagal = false;
        backend.SemasaKlaim = () =>
        {
            backend.Status = "berjaya";
            backend.AdminCiptaSemula(SnapshotAsal);
        };
        var simpanSahSemasaLaporan = new List<int>();
        backend.SemasaSelesai = _ => simpanSahSemasaLaporan.Add(dom.BilSimpanSah);

        var kedua = await aliran.JalankanAsync();

        // Aliran biasa membaca MOEIS, melihat 102 hadir, dan menulis tugasan SEMASA.
        Assert.Contains("tanda:102", dom.Panggilan.Skip(dom.Panggilan.IndexOf("muat-semula")));
        Assert.Equal(2, dom.BilSimpanSah);
        Assert.False(dom.Murid.Single(b => b.Id == "102").Hadir);
        Assert.Equal("disahkan", Assert.Single(kedua.Hasil).Status);
        // Laporan 'berjaya' dibuat hanya SELEPAS tulisan baharu disahkan — bukan keputusan lama.
        Assert.Equal(new[] { 2 }, simpanSahSemasaLaporan.ToArray());
        Assert.Equal("berjaya", backend.Status);
    }

    [Fact]
    public async Task CiptaSemulaIdSama_DalamPerlumbaanSenaraiKlaim_SebabMoeisLapuk_TidakLaporBerjaya()
    {
        var backend = new BackendBerurutan();
        var dom = Dom();
        var aliran = AliranUntuk(backend, dom);
        await aliran.JalankanAsync();
        Assert.Equal(1, dom.BilSimpanSah);
        var laporanBerjayaSebelum = backend.Jejak.Count(j => j == "selesai:j1:berjaya");

        var baris = dom.Murid.Single(b => b.Id == "102");
        baris.SebabNilai = "LAPUK";
        baris.SebabTeks = "SEBAB LAPUK";
        dom.Simpan();
        dom.BadgeDisahkan = true;

        backend.SelesaiGagal = false;
        backend.SemasaKlaim = () =>
        {
            backend.Status = "berjaya";
            backend.AdminCiptaSemula(SnapshotAsal);
        };

        var kedua = await aliran.JalankanAsync();

        Assert.Equal("kategori-sebab-tidak-padan", Assert.Single(kedua.Hasil).Status);
        Assert.False(kedua.Berjaya);
        Assert.Equal(1, dom.BilSimpanSah);
        Assert.Equal(0, dom.BilSimpan);
        Assert.Equal(laporanBerjayaSebelum, backend.Jejak.Count(j => j == "selesai:j1:berjaya"));
        Assert.NotEqual("berjaya", backend.Status);
    }

    [Fact]
    public async Task CiptaSemulaSnapshotBaharuSelepasLaporanDirekodTetapiBalasanHilang_SnapshotBaharuDihantar()
    {
        var backend = new BackendBerurutan { SelesaiGagal = false, SelesaiKomitLaluLontar = true };
        var dom = Dom();
        var aliran = AliranUntuk(backend, dom);

        var pertama = await aliran.JalankanAsync();
        Assert.Equal(AliranPenghantaranMoeis.StatusLaporanGagal, pertama.Status);   // Desktop tidak tahu ia diterima
        Assert.Equal("berjaya", backend.Status);

        backend.SelesaiKomitLaluLontar = false;
        backend.AdminCiptaSemula(SnapshotBaharu);
        var kedua = await aliran.JalankanAsync();

        Assert.Contains("tanda:103", dom.Panggilan);
        Assert.Equal(2, dom.BilSimpanSah);
        Assert.False(dom.Murid.Single(b => b.Id == "103").Hadir);
        Assert.Equal("disahkan", Assert.Single(kedua.Hasil).Status);
        Assert.Equal("berjaya", backend.Status);
    }

    [Fact]
    public async Task CiptaSemulaSnapshotSama_MoeisSudahBetul_TidakBerubah_TiadaSimpanKedua()
    {
        var backend = new BackendBerurutan { SelesaiGagal = false, SelesaiKomitLaluLontar = true };
        var dom = Dom();
        var aliran = AliranUntuk(backend, dom);
        await aliran.JalankanAsync();
        backend.SelesaiKomitLaluLontar = false;

        // Tugasan 'berjaya' (terminal) dilangkau; tiada apa-apa dimainkan semula.
        var kedua = await aliran.JalankanAsync();
        Assert.Empty(kedua.Hasil);
        Assert.DoesNotContain(backend.Jejak.Skip(backend.Jejak.LastIndexOf("senarai")), j => j.StartsWith("selesai", StringComparison.Ordinal));

        backend.AdminCiptaSemula(SnapshotAsal);
        var navigasi = Navigasi(dom);
        var ketiga = await aliran.JalankanAsync();

        Assert.True(Navigasi(dom) > navigasi);
        Assert.Equal("tidak-berubah", Assert.Single(ketiga.Hasil).Status);
        Assert.Equal(1, dom.BilSimpanSah);
        Assert.Equal("berjaya", backend.Status);
    }

    [Theory]
    [InlineData("tab")]
    [InlineData("senarai")]
    public async Task LaporanGagal_BacaanMoeisSeterusnyaGagal_TiadaSimpan_TiadaLaporanBerjaya(string kegagalan)
    {
        var backend = new BackendBerurutan();
        var dom = Dom();
        var aliran = AliranUntuk(backend, dom);
        await aliran.JalankanAsync();
        Assert.Equal(1, dom.BilSimpanSah);
        var laporanSebelum = backend.Jejak.Count(j => j == "selesai:j1:berjaya");

        backend.SelesaiGagal = false;
        if (kegagalan == "tab") dom.TabBoleh = false;
        else dom.RalatPadaSenarai = true;

        var kedua = await aliran.JalankanAsync();

        var satu = Assert.Single(kedua.Hasil);
        Assert.False(satu.Berjaya);
        Assert.Equal(1, dom.BilSimpanSah);
        Assert.Equal(0, dom.BilSimpan);
        Assert.Equal(laporanSebelum, backend.Jejak.Count(j => j == "selesai:j1:berjaya"));   // tiada 'berjaya' baharu
        Assert.NotEqual("berjaya", backend.Status);
        Assert.Contains("lepas:j1", backend.Jejak);   // tiada tulisan kitaran ini: dilepaskan untuk cubaan kemudian
    }

    [Fact]
    public async Task LaporanGagal_SelepasMulaSemula_BacaSebelumTulisProduksi_TiadaSimpanKedua()
    {
        var backend = new BackendBerurutan();
        var dom = Dom();
        await AliranUntuk(backend, dom).JalankanAsync();
        Assert.Equal(1, dom.BilSimpanSah);

        // Mula semula aplikasi: aliran BAHARU.
        backend.SelesaiGagal = false;
        var selepasMulaSemula = await AliranUntuk(backend, dom).JalankanAsync();

        // Aliran produksi membaca MOEIS dahulu: setiap murid sudah tidak hadir
        // dan badge TELAH DISAHKAN → 'tidak-berubah', butang simpan TIDAK ditekan.
        Assert.Equal("tidak-berubah", Assert.Single(selepasMulaSemula.Hasil).Status);
        Assert.Equal(1, dom.BilSimpanSah);
        Assert.Equal(0, dom.BilSimpan);
        Assert.Equal("berjaya", backend.Status);
    }

    [Fact]
    public async Task LaporanTersimpanGagal_KitaranSeterusnya_MembacaMoeis_TiadaSimpanKedua()
    {
        var backend = new BackendBerurutan();
        var dom = Dom();
        dom.HasilMuatSemula = HasilMuat.TamatMasa;   // simpan berlaku, baca semula tidak dapat dibuat
        var aliran = AliranUntuk(backend, dom);

        var pertama = await aliran.JalankanAsync();
        Assert.Equal("tersimpan", Assert.Single(pertama.Hasil).Status);
        Assert.Equal(1, dom.BilSimpanSah);
        Assert.Equal(AliranPenghantaranMoeis.StatusLaporanGagal, pertama.Status);

        backend.SelesaiGagal = false;
        dom.HasilMuatSemula = HasilMuat.Selesai;
        var navigasi = Navigasi(dom);
        var kedua = await aliran.JalankanAsync();

        Assert.True(Navigasi(dom) > navigasi);
        Assert.Equal("tidak-berubah", Assert.Single(kedua.Hasil).Status);
        Assert.Equal(1, dom.BilSimpanSah);
        Assert.Equal("berjaya", backend.Status);
        Assert.DoesNotContain("lepas:j1", backend.Jejak);
    }

    [Fact]
    public void KodAliran_TiadaLaluanMainSemulaKeputusan()
    {
        var dir = new System.IO.DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null && !System.IO.File.Exists(System.IO.Path.Combine(dir.FullName, "publish.ps1"))) dir = dir.Parent;
        Assert.NotNull(dir);
        var kod = string.Join("\n", System.IO.File.ReadAllLines(
                System.IO.Path.Combine(dir!.FullName, "HadirDesktop", "AliranPenghantaranMoeis.cs"))
            .Where(b => !b.TrimStart().StartsWith("//", StringComparison.Ordinal)));

        Assert.DoesNotContain("_laporanTertunggak", kod);
        Assert.DoesNotContain("LaporanTertunggak", kod);
        Assert.DoesNotContain("LAPORAN_DIMAIN_SEMULA", kod);
        Assert.DoesNotContain("DiciptaEpochMs", kod);
    }
}
