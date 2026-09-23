using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading.Tasks;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Tests for the "tunggu muat selesai" seam — <see cref="PengendaliMuat"/>
/// driven by an in-memory <see cref="IPelayarMuat"/> stub. NO WebView2, no
/// browser, no network, no backend, no MOEIS: the stub IS the pelayar.
///
/// What is proven here:
///
///   * a NavigationCompleted that reports success yields <see cref="HasilMuat.Selesai"/>;
///   * one that reports failure yields <see cref="HasilMuat.Gagal"/> — never a quiet success;
///   * no event within the deadline yields <see cref="HasilMuat.TamatMasa"/>,
///     bounded (it must never hang forever);
///   * ORDER: the subscription is taken BEFORE the reload starts — an event
///     fired by a fast reload would otherwise be missed, and the waiter would
///     then burn its whole deadline on a document that already committed
///     (that is precisely the 23 Sep 2026 "1 BIJAK" false positive);
///   * DISPOSAL: after the wait ends the subscription is detached, so a second
///     event cannot retroactively change a result that is already decided.
///
/// The production half of the seam (<c>PelayarMuatCoreWebView2</c>) is covered
/// by the thread-affinity tests in <c>PenghantaranBenangUiTests</c>; the
/// classification half (a non-Selesai reload must stop at <c>tersimpan</c>) is
/// covered in <c>PenghantaranMoeisTests</c>.
/// </summary>
public class PelayarMuatTests
{
    /// <summary>
    /// In-memory <see cref="IPelayarMuat"/>. It records the exact order of
    /// (subscribe / reload), can fire NavigationCompleted immediately inside
    /// the reload (the "fast navigation" case), late, or never, and reports
    /// whether the subscription was disposed after the wait.
    /// </summary>
    private sealed class PelayarMuatPalsu : IPelayarMuat
    {
        public int HadMasaMuatMs { get; set; } = 50;   // short: fast, non-flaky

        /// <summary>What NavigationCompleted will report. Null = never fires.</summary>
        public KeputusanNavigasi? Keputusan { get; set; }

        /// <summary>Fire the event this long after the reload is issued (null = immediately inside it).</summary>
        public TimeSpan? Kelewatan { get; set; }

        /// <summary>Ordered log of what the orchestrator did, in call order.</summary>
        public List<string> Panggilan { get; } = new();

        public int BilLangganan { get; private set; }
        public int BilBuangLangganan { get; private set; }
        public bool LanggananAktif => _penunggu != null;

        private Action<KeputusanNavigasi>? _penunggu;

        public IDisposable LanggananSelesaiNavigasi(Action<KeputusanNavigasi> terima)
        {
            if (terima == null) throw new ArgumentNullException(nameof(terima));
            Panggilan.Add("langganan");
            BilLangganan++;
            _penunggu += terima;
            return new Pemecah(() =>
            {
                Panggilan.Add("buang-langganan");
                BilBuangLangganan++;
                _penunggu -= terima;
            });
        }

        public async Task MulaMuatSemulaAsync()
        {
            Panggilan.Add("mula");
            if (Keputusan == null) return;   // navigation never completes: the deadline decides

            if (Kelewatan is { } d) await Task.Delay(d);
            _penunggu?.Invoke(Keputusan);
        }

        /// <summary>Fired by a test AFTER the wait finished — must reach nobody.</summary>
        public void ApiSelepasKitaran() => _penunggu?.Invoke(new KeputusanNavigasi(true, "terlambat"));

        private sealed class Pemecah : IDisposable
        {
            private Action? _buang;
            public Pemecah(Action buang) => _buang = buang;
            public void Dispose() => System.Threading.Interlocked.Exchange(ref _buang, null)?.Invoke();
        }
    }

    // ---------- the three classifications ----------

    [Fact]
    public async Task NavigasiBerjaya_PulangSelesai()
    {
        var pelayar = new PelayarMuatPalsu { Keputusan = new KeputusanNavigasi(true) };

        var hasil = await PengendaliMuat.TungguNavigasiSelesaiAsync(pelayar);

        Assert.Equal(HasilMuat.Selesai, hasil);
        Assert.Equal(1, pelayar.BilLangganan);
    }

    [Fact]
    public async Task NavigasiGagal_PulangGagal_BukanSenyap()
    {
        var pelayar = new PelayarMuatPalsu { Keputusan = new KeputusanNavigasi(false, "WebErrorStatus: ConnectionAborted") };

        var hasil = await PengendaliMuat.TungguNavigasiSelesaiAsync(pelayar);

        Assert.Equal(HasilMuat.Gagal, hasil);
    }

    [Fact]
    public async Task TiadaKejadian_TamatMasa_TidakGantungSelamanya()
    {
        // 50 ms: fast, and far above timer granularity, so it is not flaky.
        var pelayar = new PelayarMuatPalsu { Keputusan = null, HadMasaMuatMs = 50 };

        var jam = Stopwatch.StartNew();
        var hasil = await PengendaliMuat.TungguNavigasiSelesaiAsync(pelayar);
        jam.Stop();

        Assert.Equal(HasilMuat.TamatMasa, hasil);
        // Bounded on both sides: it really waited for the deadline, and it did
        // not hang (a generous ceiling keeps a loaded CI box from flaking).
        Assert.True(jam.ElapsedMilliseconds >= 40, $"pulang terlalu awal: {jam.ElapsedMilliseconds} ms");
        Assert.True(jam.ElapsedMilliseconds < 5000, $"gantung: {jam.ElapsedMilliseconds} ms");
    }

    // ---------- order and disposal: the two properties that make it correct ----------

    [Fact]
    public async Task LanggananMendahuluiMulaMuatSemula()
    {
        // Keputusan fired INSIDE the reload: a subscription taken afterwards
        // would miss this event and then wait out the whole deadline on a
        // document that has already committed.
        var pelayar = new PelayarMuatPalsu { Keputusan = new KeputusanNavigasi(true), HadMasaMuatMs = 10000 };

        var jam = Stopwatch.StartNew();
        var hasil = await PengendaliMuat.TungguNavigasiSelesaiAsync(pelayar);
        jam.Stop();

        // Order as the orchestrator performed it: subscribe → reload (→ dispose,
        // logged last). The FIRST two are what makes a fast event impossible to miss.
        Assert.Equal("langganan", pelayar.Panggilan[0]);
        Assert.Equal("mula", pelayar.Panggilan[1]);
        Assert.Equal(HasilMuat.Selesai, hasil);
        // The fast event ended the wait at once — proof it was never missed:
        // had the order been reversed, this call would still be sitting on the
        // 10 s deadline.
        Assert.True(jam.ElapsedMilliseconds < 5000, $"gantung pada had masa: {jam.ElapsedMilliseconds} ms");
    }

    [Fact]
    public async Task LanggananDibuang_SelepasKitaran_TerbakarTidakBerubah()
    {
        var pelayar = new PelayarMuatPalsu { Keputusan = new KeputusanNavigasi(true) };

        var hasil = await PengendaliMuat.TungguNavigasiSelesaiAsync(pelayar);

        Assert.Equal(HasilMuat.Selesai, hasil);
        Assert.Equal(1, pelayar.BilBuangLangganan);
        Assert.False(pelayar.LanggananAktif);

        // A NavigationCompleted arriving after the wait must reach nobody and
        // must not touch a result that is already decided.
        pelayar.ApiSelepasKitaran();
        Assert.Equal(HasilMuat.Selesai, hasil);
        Assert.Equal(1, pelayar.BilLangganan);   // no re-subscription
    }

    [Fact]
    public async Task LanggananDibuang_JugaPadaLaluanTamatMasa()
    {
        var pelayar = new PelayarMuatPalsu { Keputusan = null, HadMasaMuatMs = 50 };

        var hasil = await PengendaliMuat.TungguNavigasiSelesaiAsync(pelayar);

        Assert.Equal(HasilMuat.TamatMasa, hasil);
        Assert.Equal(1, pelayar.BilBuangLangganan);
        Assert.False(pelayar.LanggananAktif);
    }

    [Fact]
    public async Task PelayarTiada_Ditolak_BukanSenyap()
        => await Assert.ThrowsAsync<ArgumentNullException>(() => PengendaliMuat.TungguNavigasiSelesaiAsync(null!));

    // ---------- the adapter: WebView2DomMoeis classifies through this seam ----------

    [Fact]
    public async Task AdaptorAdalahJurucakapSeam_KlasifikasiDiteruskan()
    {
        // Injected stub — no CoreWebView2 accessor is ever read, no pelayar, no
        // portal. All delays are zero so the test is instant.
        foreach (var jangka in new[] { HasilMuat.Selesai, HasilMuat.Gagal, HasilMuat.TamatMasa })
        {
            var pelayar = new PelayarMuatPalsu { Keputusan = jangka == HasilMuat.TamatMasa ? null : new KeputusanNavigasi(jangka == HasilMuat.Selesai) };
            var dom = new WebView2DomMoeis(() => null, MarshalUiTerus.Contoh,
                masaSediaMs: 0, jedaPollMs: 0, masaMuatMs: 0, jedaSelepasPilihMs: 0,
                jedaAjaxMs: 0, pelayar: pelayar);

            Assert.Equal(jangka, await dom.MuatSemula());
        }
    }
}
