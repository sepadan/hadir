using System;
using System.IO;
using System.Threading.Tasks;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Demand-only orchestrator tests. The headline guarantee: an EMPTY queue means
/// ZERO portal/login activity — the manager (and therefore the DOM, the session
/// probe and the credential read) is never even invoked.
/// </summary>
public class IdMeLoginDemandTests : IDisposable
{
    private readonly string _dir;
    private readonly string _laluan;

    public IdMeLoginDemandTests()
    {
        _dir = Path.Combine(Path.GetTempPath(), "hadir-demand-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_dir);
        _laluan = Path.Combine(_dir, "idme-login.json");
    }

    public void Dispose()
    {
        try { if (Directory.Exists(_dir)) Directory.Delete(_dir, recursive: true); } catch { /* best-effort */ }
    }

    private JsonIdMeLoginSettingsStore Tetapan(bool loginAuto)
    {
        var s = new JsonIdMeLoginSettingsStore(_laluan);
        s.Simpan(new IdMeLoginTetapan { LoginAuto = loginAuto });
        return s;
    }

    private static PenjagaPenolakanKredensial BuatPenjaga()
    {
        PenjagaPenolakanKredensial.Keadaan? keadaan = null;
        return new PenjagaPenolakanKredensial(() => keadaan, k => keadaan = k, () => 5);
    }

    // Manager whose every action THROWS if invoked — proves the demand gate
    // short-circuits before any login machinery (and thus before any DOM/portal).
    private static IdMeLoginManager PengurusYangMelontarJikaDipanggil()
    {
        return new IdMeLoginManager(
            () => throw new Exception("adaKredensial tidak patut dipanggil"),
            () => throw new Exception("jalankan tidak patut dipanggil"),
            BuatPenjaga(),
            sesiSah: () => throw new Exception("sesiSah tidak patut dipanggil"));
    }

    [Fact]
    public async Task BarisKosong_TiadaAktivitiPortal()
    {
        var demand = new IdMeLoginDemand(
            Tetapan(loginAuto: true),
            PengurusYangMelontarJikaDipanggil(),
            () => Task.FromResult(false));   // empty queue

        var hasil = await demand.CubaAutoAsync();

        Assert.Equal("tiada-kerja", hasil.Status);
        Assert.False(hasil.PerluManusia);
    }

    [Fact]
    public async Task LoginAutoMati_Dilangkau_TanpaSemakanKerja()
    {
        var demand = new IdMeLoginDemand(
            Tetapan(loginAuto: false),
            PengurusYangMelontarJikaDipanggil(),
            () => throw new Exception("adaKerjaMenunggu tidak patut dipanggil"));

        var hasil = await demand.CubaAutoAsync();

        Assert.Equal("dilangkau", hasil.Status);
    }

    [Fact]
    public async Task KerjaMenunggu_SesiSah_LangkauTanpaJalankan()
    {
        var dipanggil = false;
        var pengurus = new IdMeLoginManager(
            () => true,
            () => { dipanggil = true; return Task.FromResult(new HasilLoginAuto { Status = "sesi-sah", SesiSah = true }); },
            BuatPenjaga(),
            sesiSah: () => Task.FromResult(new SesiProbe(true)));

        var demand = new IdMeLoginDemand(Tetapan(loginAuto: true), pengurus, () => Task.FromResult(true));

        var hasil = await demand.CubaAutoAsync();

        Assert.Equal("sesi-sah", hasil.Status);
        Assert.False(dipanggil);   // session already valid → no login attempt
    }

    [Fact]
    public async Task KerjaMenunggu_MenjalankanLogin()
    {
        var dipanggil = 0;
        var pengurus = new IdMeLoginManager(
            () => true,
            () => { dipanggil++; return Task.FromResult(new HasilLoginAuto { Status = "sesi-sah", SesiSah = true }); },
            BuatPenjaga(),
            sesiSah: () => Task.FromResult(new SesiProbe(false)));

        var demand = new IdMeLoginDemand(Tetapan(loginAuto: true), pengurus, () => Task.FromResult(true));

        var hasil = await demand.CubaAutoAsync();

        Assert.Equal("sesi-sah", hasil.Status);
        Assert.Equal(1, dipanggil);
    }
}
