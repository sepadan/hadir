using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Demand-only portal lifecycle tests. The headline guarantees:
///   * an EMPTY queue = ZERO portal activity (no navigation, no session probe,
///     no login attempt) — the portal/login fakes THROW if they are reached;
///   * one waiting task = exactly ONE login attempt and one portal open;
///   * an unreachable engine = enjin-luar-talian with zero portal activity;
///   * a tripped consecutive-rejection guard = stop until "Cuba lagi".
///
/// Fakes only: no WebView2, no network, no credential value anywhere.
/// </summary>
public class PortalLifecycleTests
{
    // ---------- fakes ----------

    private sealed class SumberPalsu : IKerjaHariIniSource
    {
        private readonly Func<PermintaanKerja> _jawapan;
        private int _panggilan;

        public SumberPalsu(PermintaanKerja tetap) : this(() => tetap) { }
        public SumberPalsu(Func<PermintaanKerja> jawapan) => _jawapan = jawapan;

        public int Panggilan => Volatile.Read(ref _panggilan);

        /// <summary>A source that must NEVER be asked (used to prove a gate runs earlier).</summary>
        public static SumberPalsu Melontar() =>
            new(() => throw new Exception("semakan deman tidak patut dipanggil"));

        public Task<PermintaanKerja> SemakAsync(CancellationToken ct = default)
        {
            Interlocked.Increment(ref _panggilan);
            return Task.FromResult(_jawapan());
        }
    }

    private sealed class Kiraan
    {
        private int _nilai;
        public int Nilai => Volatile.Read(ref _nilai);
        public void Tambah() => Interlocked.Increment(ref _nilai);
    }

    private static PenjagaPenolakanKredensial Penjaga(int maks)
    {
        PenjagaPenolakanKredensial.Keadaan? keadaan = null;
        return new PenjagaPenolakanKredensial(() => keadaan, k => keadaan = k, () => maks);
    }

    private static HasilLoginAuto Hasil(string status, bool sesiSah = false, params string[] bukti)
    {
        var h = new HasilLoginAuto { Status = status, SesiSah = sesiSah };
        h.Bukti.AddRange(bukti);
        return h;
    }

    private static PortalLifecycle Buat(
        IKerjaHariIniSource sumber,
        bool dihidupkan,
        Func<CancellationToken, Task> bukaPortal,
        Func<CancellationToken, Task<HasilLoginAuto>> cubaLogin,
        Func<bool>? diblok = null) =>
        new(sumber, () => dihidupkan, bukaPortal, cubaLogin, diblok);

    // ---------- (a) no waiting task => zero portal + zero login activity ----------

    [Fact]
    public async Task TiadaTugasan_SifarAktivitiPortal()
    {
        var sumber = new SumberPalsu(PermintaanKerja.Tiada("Tiada tugasan belum siap untuk 2026-09-22."));
        var lifecycle = Buat(
            sumber, dihidupkan: true,
            bukaPortal: _ => throw new Exception("portal tidak patut dibuka"),
            cubaLogin: _ => throw new Exception("login tidak patut dicuba"));

        var keadaan = await lifecycle.PeriksaDanJalankanAsync();

        Assert.Equal(KeadaanPortal.Diam, keadaan);
        Assert.Equal(1, sumber.Panggilan);                // engine asked exactly once, read-only
        Assert.Contains("Tiada portal dibuka", lifecycle.Sebab);
    }

    [Fact]
    public async Task TiadaTugasan_DuaKitaran_MasihSifarAktiviti()
    {
        var buka = new Kiraan();
        var login = new Kiraan();
        var sumber = new SumberPalsu(PermintaanKerja.Tiada("kosong"));
        var lifecycle = Buat(
            sumber, true,
            _ => { buka.Tambah(); return Task.CompletedTask; },
            _ => { login.Tambah(); return Task.FromResult(Hasil("sesi-sah", true)); });

        for (var i = 0; i < 2; i++)
        {
            Assert.Equal(KeadaanPortal.Diam, await lifecycle.PeriksaDanJalankanAsync());
        }

        Assert.Equal(0, buka.Nilai);
        Assert.Equal(0, login.Nilai);
        Assert.Equal(2, sumber.Panggilan);
    }

    [Fact]
    public async Task LoginAutoMati_EnjinTidakDitanya_TiadaAktiviti()
    {
        var buka = new Kiraan();
        var login = new Kiraan();
        var lifecycle = Buat(
            SumberPalsu.Melontar(), dihidupkan: false,
            _ => { buka.Tambah(); return Task.CompletedTask; },
            _ => { login.Tambah(); return Task.FromResult(Hasil("sesi-sah", true)); });

        var keadaan = await lifecycle.PeriksaDanJalankanAsync();

        Assert.Equal(KeadaanPortal.Diam, keadaan);
        Assert.Equal(0, buka.Nilai);
        Assert.Equal(0, login.Nilai);
        Assert.Contains("dimatikan", lifecycle.Sebab);
    }

    // ---------- (b) one waiting task => exactly one login attempt ----------

    [Fact]
    public async Task SatuTugasanMenunggu_TepatSatuCubaanLogin()
    {
        var penjaga = Penjaga(maks: 5);
        var submissions = new Kiraan();
        var pengurus = new IdMeLoginManager(
            () => true,
            () => { submissions.Tambah(); return Task.FromResult(Hasil("sesi-sah", true)); },
            penjaga,
            sesiSah: () => Task.FromResult(new SesiProbe(false)),
            jedaAsasMs: 1,
            jedaMaksMs: 2);

        var navigasi = new Kiraan();
        var sumber = new SumberPalsu(PermintaanKerja.Ada(1, "1 tugasan belum siap untuk 2026-09-22."));
        var lifecycle = Buat(sumber, true,
            _ => { navigasi.Tambah(); return Task.CompletedTask; },
            ct => pengurus.CubaDenganCubaSemulaAsync(ct));

        var keadaan = await lifecycle.PeriksaDanJalankanAsync();

        Assert.Equal(KeadaanPortal.AdaKerja, keadaan);
        Assert.Equal(1, navigasi.Nilai);        // portal opened once — only because there was work
        Assert.Equal(1, submissions.Nilai);     // EXACTLY one login attempt
        Assert.Equal(1, lifecycle.BilanganKerja);
    }

    [Fact]
    public async Task SesiSudahSah_TiadaPenghantaranKredensial()
    {
        var penjaga = Penjaga(maks: 5);
        var submissions = new Kiraan();
        var pengurus = new IdMeLoginManager(
            () => true,
            () => { submissions.Tambah(); return Task.FromResult(Hasil("sesi-sah", true)); },
            penjaga,
            sesiSah: () => Task.FromResult(new SesiProbe(true)),   // already logged in
            jedaAsasMs: 1,
            jedaMaksMs: 2);

        var navigasi = new Kiraan();
        var lifecycle = Buat(new SumberPalsu(PermintaanKerja.Ada(1, "ada kerja")), true,
            _ => { navigasi.Tambah(); return Task.CompletedTask; },
            ct => pengurus.CubaDenganCubaSemulaAsync(ct));

        var keadaan = await lifecycle.PeriksaDanJalankanAsync();

        Assert.Equal(KeadaanPortal.AdaKerja, keadaan);
        Assert.Equal(1, navigasi.Nilai);        // portal opened (work exists)
        Assert.Equal(0, submissions.Nilai);     // pre-flight only: no credential submission
        Assert.Equal(0, penjaga.BilPenolakan()); // pre-flight consumed no budget
    }

    [Fact]
    public async Task GagalSementara_DiulangTanpaHad_TidakNaikPenolakan()
    {
        // Owner policy: a transient failure is NOT a stop and NOT a strike. The
        // script fails transiently twice, then succeeds — the lifecycle must
        // report "ada-kerja" (work still waiting, retries continuing) and the
        // rejection guard must stay at ZERO.
        var penjaga = Penjaga(maks: 5);
        var submissions = new Kiraan();
        var pengurus = new IdMeLoginManager(
            () => true,
            () =>
            {
                submissions.Tambah();
                return Task.FromResult(submissions.Nilai >= 3
                    ? Hasil("sesi-sah", true)
                    : Hasil("gagal", bukti: "ralat-rangkaian"));
            },
            penjaga,
            sesiSah: () => Task.FromResult(new SesiProbe(false)),
            jedaAsasMs: 1,
            jedaMaksMs: 2);

        var navigasi = new Kiraan();
        var lifecycle = Buat(new SumberPalsu(PermintaanKerja.Ada(1, "ada kerja")), true,
            _ => { navigasi.Tambah(); return Task.CompletedTask; },
            ct => pengurus.CubaDenganCubaSemulaAsync(ct),
            diblok: () => penjaga.Diblok());

        var keadaan = await lifecycle.PeriksaDanJalankanAsync();

        Assert.Equal(KeadaanPortal.AdaKerja, keadaan);   // never a false "perlu manusia"
        Assert.Equal(3, submissions.Nilai);              // transient failures were retried
        Assert.Equal(0, penjaga.BilPenolakan());         // transient never advances the guard
        Assert.False(penjaga.Diblok());
        Assert.Equal(1, navigasi.Nilai);
    }

    [Fact]
    public async Task LogMasukMemerlukanManusia_TanpaPenolakanKredensial_BerhentiTanpaNaikPagar()
    {
        // A genuine human step (e.g. an unreadable/mismatched security phrase or
        // an OTP page) stops the loop but is NOT a credential rejection, so the
        // guard must stay at zero — the owner is not asked to clear anything.
        var penjaga = Penjaga(maks: 5);
        var pengurus = new IdMeLoginManager(
            () => true,
            () => Task.FromResult(Hasil("perlu-manusia", false, "kunci-tidak-padan")),
            penjaga,
            sesiSah: () => Task.FromResult(new SesiProbe(false)),
            jedaAsasMs: 1,
            jedaMaksMs: 2);

        var lifecycle = Buat(new SumberPalsu(PermintaanKerja.Ada(1, "ada kerja")), true,
            _ => Task.CompletedTask,
            ct => pengurus.CubaDenganCubaSemulaAsync(ct),
            diblok: () => penjaga.Diblok());

        var keadaan = await lifecycle.PeriksaDanJalankanAsync();

        Assert.Equal(KeadaanPortal.PerluTindakanManusia, keadaan);
        Assert.Equal(0, penjaga.BilPenolakan());
        Assert.False(penjaga.Diblok());
    }

    // ---------- (c) engine offline => enjin-luar-talian, no login ----------

    [Fact]
    public async Task EnjinLuarTalian_KeadaanLuarTalian_TiadaLogin()
    {
        var login = new Kiraan();
        var buka = new Kiraan();
        var sumber = new SumberPalsu(PermintaanKerja.TidakPasti("Enjin tempatan tidak berjalan pada http://127.0.0.1:8747."));
        var lifecycle = Buat(sumber, true,
            _ => { buka.Tambah(); return Task.CompletedTask; },
            _ => { login.Tambah(); return Task.FromResult(Hasil("sesi-sah", true)); });

        var keadaan = await lifecycle.PeriksaDanJalankanAsync();

        Assert.Equal(KeadaanPortal.EnjinLuarTalian, keadaan);
        Assert.Equal(0, buka.Nilai);
        Assert.Equal(0, login.Nilai);
        Assert.Contains("Enjin tempatan tidak berjalan", lifecycle.Sebab);
        Assert.Contains("Tiada portal dibuka", lifecycle.Sebab);
    }

    [Fact]
    public async Task DemanTidakPasti_TidakPernahDianggapAdaKerja()
    {
        // An unreadable/unauthorised engine answer must NEVER be treated as
        // "ada kerja" (that would open the portal on a guess), and must never be
        // reported as a harmless "diam" either.
        var sumber = new SumberPalsu(PermintaanKerja.TidakPasti("Balasan enjin tidak dapat dibaca."));
        var lifecycle = Buat(sumber, true,
            _ => throw new Exception("portal tidak patut dibuka"),
            _ => throw new Exception("login tidak patut dicuba"));

        var keadaan = await lifecycle.PeriksaDanJalankanAsync();

        Assert.Equal(KeadaanPortal.EnjinLuarTalian, keadaan);
        Assert.NotEqual(KeadaanPortal.Diam, keadaan);
        Assert.False(sumber.Panggilan == 0);
    }

    // ---------- (d) rejection guard reached => stop until CubaLagi ----------

    [Fact]
    public async Task PagarPenolakanDicapai_BerhentiSehinggaCubaLagi()
    {
        var penjaga = Penjaga(maks: 1);             // threshold 1, for a short test
        var submissions = new Kiraan();
        var navigasi = new Kiraan();
        var berjaya = false;
        var pengurus = new IdMeLoginManager(
            () => true,
            () =>
            {
                submissions.Tambah();
                return Task.FromResult(berjaya
                    ? Hasil("sesi-sah", true)
                    : Hasil("kredensial-ditolak", bukti: "kredensial-ditolak"));
            },
            penjaga,
            sesiSah: () => Task.FromResult(new SesiProbe(false)),
            jedaAsasMs: 1,
            jedaMaksMs: 2);

        var lifecycle = Buat(new SumberPalsu(PermintaanKerja.Ada(1, "ada kerja")), true,
            _ => { navigasi.Tambah(); return Task.CompletedTask; },
            ct => pengurus.CubaDenganCubaSemulaAsync(ct),
            diblok: () => penjaga.Diblok());

        // Run 1: explicit rejection -> guard reaches the owner threshold.
        var pertama = await lifecycle.PeriksaDanJalankanAsync();
        Assert.Equal(KeadaanPortal.PerluTindakanManusia, pertama);
        Assert.Equal(1, submissions.Nilai);
        Assert.Equal(1, navigasi.Nilai);
        Assert.True(penjaga.Diblok());

        // Run 2: guard tripped -> stop. No new attempt, and the portal is not
        // even opened (the guard is checked before any portal activity).
        var kedua = await lifecycle.PeriksaDanJalankanAsync();
        Assert.Equal(KeadaanPortal.PerluTindakanManusia, kedua);
        Assert.Equal(1, submissions.Nilai);
        Assert.Equal(1, navigasi.Nilai);
        Assert.Contains("Cuba lagi", lifecycle.Sebab);

        // "Cuba lagi" clears the guard -> the flow resumes and succeeds.
        pengurus.CubaLagi();
        berjaya = true;
        var ketiga = await lifecycle.PeriksaDanJalankanAsync();

        Assert.Equal(KeadaanPortal.AdaKerja, ketiga);
        Assert.Equal(2, submissions.Nilai);
        Assert.Equal(2, navigasi.Nilai);
        Assert.False(penjaga.Diblok());
    }

    [Fact]
    public async Task PagarSifar_SentiasaMeneruskanCubaan()
    {
        // Owner policy: 0 = never stop. Even after many explicit rejections the
        // lifecycle keeps opening the portal and attempting (never a ceiling).
        var penjaga = Penjaga(maks: 0);
        var submissions = new Kiraan();
        var pengurus = new IdMeLoginManager(
            () => true,
            () => { submissions.Tambah(); return Task.FromResult(Hasil("kredensial-ditolak", bukti: "kredensial-ditolak")); },
            penjaga,
            sesiSah: () => Task.FromResult(new SesiProbe(false)),
            jedaAsasMs: 1,
            jedaMaksMs: 2);

        var lifecycle = Buat(new SumberPalsu(PermintaanKerja.Ada(1, "ada kerja")), true,
            _ => Task.CompletedTask,
            ct => pengurus.CubaDenganCubaSemulaAsync(ct),
            diblok: () => penjaga.Diblok());

        for (var i = 0; i < 3; i++)
        {
            await lifecycle.PeriksaDanJalankanAsync();
        }

        Assert.Equal(3, submissions.Nilai);
        Assert.False(penjaga.Diblok());
        Assert.True(penjaga.BilPenolakan() >= 3);
    }

    // ---------- (e) nothing may fault the cycle into an async void handler ----------

    [Fact]
    public async Task SumberMelontar_EnjinLuarTalian_BukanTugasFaulted()
    {
        // The tray wires this cycle through an `async void` handler: a faulted
        // task there takes the whole app down. A probe that breaks its no-throw
        // contract must become "enjin-luar-talian" with zero portal activity —
        // and must NEVER be read as "ada kerja".
        var buka = new Kiraan();
        var login = new Kiraan();
        var lifecycle = Buat(
            SumberPalsu.Melontar(), dihidupkan: true,
            _ => { buka.Tambah(); return Task.CompletedTask; },
            _ => { login.Tambah(); return Task.FromResult(Hasil("sesi-sah", true)); });

        var keadaan = await lifecycle.PeriksaDanJalankanAsync();

        Assert.Equal(KeadaanPortal.EnjinLuarTalian, keadaan);
        Assert.Equal(0, buka.Nilai);
        Assert.Equal(0, login.Nilai);
        Assert.Contains("deman tidak dapat dipastikan", lifecycle.Sebab);
    }

    [Fact]
    public async Task BukaPortalMelontar_KerjaKekalMenunggu_TiadaLogin()
    {
        // WebView2 is thread-affine and the window may be gone: a failed portal
        // open leaves the work waiting and types NOTHING — it never faults the
        // cycle and never reaches the login step.
        var login = new Kiraan();
        var lifecycle = Buat(
            new SumberPalsu(PermintaanKerja.Ada(2, "ada kerja")), dihidupkan: true,
            _ => throw new InvalidOperationException("WebView2 belum sedia"),
            _ => { login.Tambah(); return Task.FromResult(Hasil("sesi-sah", true)); });

        var keadaan = await lifecycle.PeriksaDanJalankanAsync();

        Assert.Equal(KeadaanPortal.AdaKerja, keadaan);
        Assert.Equal(0, login.Nilai);                       // no credential submission
        Assert.Contains("Portal tidak dapat dibuka", lifecycle.Sebab);
        Assert.Equal(2, lifecycle.BilanganKerja);
    }

    [Fact]
    public async Task SuisTidakDapatDibaca_DianggapMati_EnjinTidakDitanya()
    {
        // Default is OFF, so an unreadable settings file may never turn the
        // feature ON: it counts as OFF and the engine is not even asked.
        var buka = new Kiraan();
        var lifecycle = new PortalLifecycle(
            SumberPalsu.Melontar(),
            () => throw new IOException("tetapan.json rosak"),
            _ => { buka.Tambah(); return Task.CompletedTask; },
            _ => throw new Exception("login tidak patut dicuba"));

        var keadaan = await lifecycle.PeriksaDanJalankanAsync();

        Assert.Equal(KeadaanPortal.Diam, keadaan);
        Assert.Equal(0, buka.Nilai);
    }

    [Fact]
    public async Task KitaranDibatalkan_MenyebarDanTidakMenyekatKitaranSeterusnya()
    {
        // The owner's retry policy makes a transient login failure retry
        // INDEFINITELY, and a cycle holds the single-flight slot for as long as
        // it runs — so real shutdown cancels the cycle token (MainForm owns it
        // and cancels it in FormClosing). Cancellation must reach the caller AND
        // clear the single-flight marker; otherwise the app could never run
        // another cycle for the rest of its life.
        using var cts = new CancellationTokenSource();
        var buka = new Kiraan();
        var login = new Kiraan();
        var sumber = new SumberPalsu(PermintaanKerja.Ada(1, "1 tugasan belum siap."));
        var lifecycle = Buat(sumber, true,
            ct =>
            {
                buka.Tambah();
                return ct.IsCancellationRequested ? Task.FromCanceled(ct) : Task.CompletedTask;
            },
            _ => { login.Tambah(); return Task.FromResult(Hasil("sesi-sah", true)); });

        cts.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => lifecycle.PeriksaDanJalankanAsync(cts.Token));

        Assert.Equal(1, buka.Nilai);
        Assert.Equal(0, login.Nilai);            // cancelled BEFORE any login

        // A later cycle is not blocked by the cancelled one.
        var keadaan = await lifecycle.PeriksaDanJalankanAsync();

        Assert.Equal(KeadaanPortal.AdaKerja, keadaan);
        Assert.Equal(2, buka.Nilai);
        Assert.Equal(1, login.Nilai);
    }

    // ---------- lifecycle plumbing: single flight + state text ----------

    [Fact]
    public async Task KitaranSerentak_HanyaSatuPenerbangan()
    {
        var gate = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        var buka = new Kiraan();
        var sumber = new SumberPalsu(PermintaanKerja.Ada(1, "ada kerja"));
        var lifecycle = Buat(sumber, true,
            async _ => { buka.Tambah(); await gate.Task; },
            _ => Task.FromResult(Hasil("sesi-sah", true)));

        var satu = lifecycle.PeriksaDanJalankanAsync();
        var dua = lifecycle.PeriksaDanJalankanAsync();
        gate.SetResult(true);
        await Task.WhenAll(satu, dua);

        Assert.Equal(1, sumber.Panggilan);
        Assert.Equal(1, buka.Nilai);
        Assert.Same(satu, dua);
    }

    [Theory]
    [InlineData(KeadaanPortal.Diam, "diam")]
    [InlineData(KeadaanPortal.AdaKerja, "ada-kerja")]
    [InlineData(KeadaanPortal.SedangLogin, "sedang-login")]
    [InlineData(KeadaanPortal.PerluTindakanManusia, "perlu-tindakan-manusia")]
    [InlineData(KeadaanPortal.EnjinLuarTalian, "enjin-luar-talian")]
    public void LabelKeadaan_SemuaLimaKeadaan(KeadaanPortal keadaan, string dijangka)
    {
        Assert.Equal(dijangka, LabelKeadaanPortal.Teks(keadaan));
        Assert.Contains(dijangka, LabelKeadaanPortal.UntukMenu(keadaan, "sebab"));
        Assert.Contains(dijangka, LabelKeadaanPortal.UntukDulang(keadaan));
    }

    [Fact]
    public void TooltipDulang_TidakMelebihiHadWindows()
    {
        foreach (var keadaan in Enum.GetValues<KeadaanPortal>())
        {
            var tooltip = LabelKeadaanPortal.UntukDulang(keadaan);
            Assert.True(tooltip.Length <= LabelKeadaanPortal.MaksNotaDulang,
                $"{keadaan}: tooltip {tooltip.Length} aksara melebihi had {LabelKeadaanPortal.MaksNotaDulang}");
        }
    }

    [Fact]
    public void BarisMenu_SebabPanjangDipenggal_TanpaKredensial()
    {
        var panjang = new string('x', 500);
        var baris = LabelKeadaanPortal.UntukMenu(KeadaanPortal.PerluTindakanManusia, panjang, maks: 60);
        Assert.True(baris.Length <= 61);   // 60 + the ellipsis
        Assert.EndsWith("…", baris);
    }
}
