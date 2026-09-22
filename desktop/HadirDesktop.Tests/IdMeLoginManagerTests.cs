using System;
using System.Threading.Tasks;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Manager auto-retry policy tests. In-memory guard + scripted callbacks; no
/// WebView2, no credential values beyond synthetic fixtures.
/// </summary>
public class IdMeLoginManagerTests
{
    private static PenjagaPenolakanKredensial BuatPenjaga(int maks = 5)
    {
        PenjagaPenolakanKredensial.Keadaan? keadaan = null;
        return new PenjagaPenolakanKredensial(() => keadaan, k => keadaan = k, () => maks);
    }

    private static IdMeLoginManager BuatPengurus(
        PenjagaPenolakanKredensial penjaga,
        Func<Task<HasilLoginAuto>> jalankan,
        Func<Task<SesiProbe>>? sesiSah = null,
        Func<bool>? adaKredensial = null)
    {
        return new IdMeLoginManager(
            adaKredensial ?? (() => true),
            jalankan,
            penjaga,
            sesiSah: sesiSah,
            jedaAsasMs: 1,
            jedaMaksMs: 2);
    }

    private static HasilLoginAuto Hasil(string status, bool sesiSah = false, params string[] bukti)
    {
        var h = new HasilLoginAuto { Status = status, SesiSah = sesiSah };
        h.Bukti.AddRange(bukti);
        return h;
    }

    [Fact]
    public async Task PraPenerbangan_SesiSah_TidakMemakanBajetDanTidakMenjalankan()
    {
        var penjaga = BuatPenjaga();
        var dipanggil = false;
        var pengurus = BuatPengurus(penjaga,
            jalankan: () => { dipanggil = true; return Task.FromResult(Hasil("sesi-sah", true)); },
            sesiSah: () => Task.FromResult(new SesiProbe(true)),
            adaKredensial: () => throw new Exception("tidak patut dipanggil"));

        var hasil = await pengurus.CubaSekaliAsync();

        Assert.Equal("sesi-sah", hasil.Status);
        Assert.False(dipanggil);                    // jalankan never reached
        Assert.Equal(0, penjaga.BilPenolakan());    // pre-flight consumed no budget
    }

    [Fact]
    public async Task PraPenerbangan_TiadaKredensial_TidakMemakanBajet()
    {
        var penjaga = BuatPenjaga();
        var pengurus = BuatPengurus(penjaga,
            jalankan: () => throw new Exception("tidak patut dipanggil"),
            sesiSah: () => Task.FromResult(new SesiProbe(false)),
            adaKredensial: () => false);

        var hasil = await pengurus.CubaSekaliAsync();

        Assert.Equal("tiada-kredensial", hasil.Status);
        Assert.Equal(0, penjaga.BilPenolakan());
    }

    [Fact]
    public async Task Transient_DiulangDenganBackoff_SampaiBerjaya()
    {
        var penjaga = BuatPenjaga();
        var panggilan = 0;
        var pengurus = BuatPengurus(penjaga,
            jalankan: () =>
            {
                panggilan++;
                // First two attempts transient; third succeeds.
                return Task.FromResult(panggilan >= 3 ? Hasil("sesi-sah", true) : Hasil("gagal"));
            });

        var hasil = await pengurus.CubaDenganCubaSemulaAsync();

        Assert.Equal("sesi-sah", hasil.Status);
        Assert.Equal(3, panggilan);   // transient failures were retried, never stopped
    }

    [Fact]
    public async Task RalatTeknikal_Lontaran_Diulang()
    {
        var penjaga = BuatPenjaga();
        var panggilan = 0;
        var pengurus = BuatPengurus(penjaga,
            jalankan: () =>
            {
                panggilan++;
                if (panggilan == 1) throw new Exception("rangkaian putus");
                return Task.FromResult(Hasil("sesi-sah", true));
            });

        var hasil = await pengurus.CubaDenganCubaSemulaAsync();

        Assert.Equal("sesi-sah", hasil.Status);
        Assert.Equal(2, panggilan);
    }

    [Fact]
    public async Task PerluManusia_Captcha_TidakDiulang()
    {
        var penjaga = BuatPenjaga();
        var panggilan = 0;
        var pengurus = BuatPengurus(penjaga,
            jalankan: () => { panggilan++; return Task.FromResult(Hasil("perlu-manusia", bukti: "otp-selepas-hantar")); });

        var hasil = await pengurus.CubaDenganCubaSemulaAsync();

        Assert.Equal("perlu-manusia", hasil.Status);
        Assert.Equal(1, panggilan);   // human step stops, never a tight loop
    }

    [Fact]
    public async Task PenolakanKredensial_MeningkatkanPenjaga()
    {
        var penjaga = BuatPenjaga();
        var pengurus = BuatPengurus(penjaga,
            jalankan: () => Task.FromResult(Hasil("kredensial-ditolak", bukti: "kredensial-ditolak")));

        var hasil = await pengurus.CubaSekaliAsync();

        Assert.Equal(IdMeLoginSafety.KelasLogin.PenolakanKredensial, hasil.Kelas);
        Assert.Equal(1, penjaga.BilPenolakan());
    }

    [Fact]
    public async Task Berjaya_TetapkanSemulaPenjaga()
    {
        var penjaga = BuatPenjaga();
        penjaga.CatatPenolakan();
        penjaga.CatatPenolakan();
        penjaga.CatatPenolakan();
        var pengurus = BuatPengurus(penjaga,
            jalankan: () => Task.FromResult(Hasil("sesi-sah", true)));

        await pengurus.CubaSekaliAsync();

        Assert.Equal(0, penjaga.BilPenolakan());
    }

    [Fact]
    public async Task DisekatPenolakan_MenghentikanTanpaJalankan()
    {
        var penjaga = BuatPenjaga();
        for (var i = 0; i < 5; i++) penjaga.CatatPenolakan();
        var dipanggil = false;
        var pengurus = BuatPengurus(penjaga,
            jalankan: () => { dipanggil = true; return Task.FromResult(Hasil("sesi-sah", true)); });

        var hasil = await pengurus.CubaSekaliAsync();

        Assert.Equal("disekat-penolakan", hasil.Status);
        Assert.Equal(IdMeLoginSafety.KelasLogin.PerluManusia, hasil.Kelas);
        Assert.False(dipanggil);
    }

    [Fact]
    public async Task CubaLagi_MembersihkanBlok_DanMembolehkanCubaan()
    {
        var penjaga = BuatPenjaga();
        for (var i = 0; i < 5; i++) penjaga.CatatPenolakan();
        var pengurus = BuatPengurus(penjaga,
            jalankan: () => Task.FromResult(Hasil("sesi-sah", true)));

        pengurus.CubaLagi();
        Assert.Equal(0, penjaga.BilPenolakan());

        var hasil = await pengurus.CubaSekaliAsync();
        Assert.Equal("sesi-sah", hasil.Status);
    }

    [Fact]
    public async Task DuaCubaanBerturutan_SecaraSekata_TidakTerkunciOlehPenerbanganLama()
    {
        // Regression: an attempt whose scripted callbacks all complete
        // synchronously used to leave a STALE completed single-flight marker
        // behind, which silently turned every later attempt into a no-op
        // ("already in flight" forever). Each sequential call must really run.
        var penjaga = BuatPenjaga();
        var panggilan = 0;
        var pengurus = BuatPengurus(penjaga,
            jalankan: () => { panggilan++; return Task.FromResult(Hasil("sesi-sah", true)); });

        Assert.Equal("sesi-sah", (await pengurus.CubaDenganCubaSemulaAsync()).Status);
        Assert.Equal("sesi-sah", (await pengurus.CubaDenganCubaSemulaAsync()).Status);

        Assert.Equal(2, panggilan);
    }
}
