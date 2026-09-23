using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using HadirDesktop;
using Microsoft.Web.WebView2.Core;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Regresi terus bagi pepijat ujian hidup 23 Sep 2026:
///
/// <code>
/// langkah=PENGHANTARAN_TAMAT: kelas=1 BIJAK status=gagal
/// sebab=Ralat teknikal semasa penghantaran MOEIS:
///       CoreWebView2 can only be accessed from the UI thread.
/// </code>
///
/// Laluan log masuk berjaya penuh; laluan penghantaran gagal dalam &lt;1 s —
/// bukan rangkaian, bukan sesi, bukan pemilih DOM. Puncanya BENANG:
/// <see cref="AliranPenghantaranMoeis"/> menunggu I/O backend dengan
/// <c>ConfigureAwait(false)</c>, jadi kesinambungan yang memanggil adaptor
/// berjalan di benang kolam, dan sentuhan CoreWebView2 pertama melontar.
///
/// Ujian di sini tidak memerlukan WebView2 sebenar. Seam
/// <c>Func&lt;CoreWebView2?&gt;</c> digantikan dengan stub TERIKAT-BENANG yang
/// melontar mesej yang SAMA seperti WebView2 sebenar apabila dibaca dari benang
/// selain benang "UI" palsu, dan memulangkan <c>null</c> (halaman tiada) apabila
/// dibaca dengan betul. Jadi:
///
///   * marshalling betul  → tiada lontaran silang-benang; kegagalan (jika ada)
///     datang daripada halaman kosong, bukan daripada benang;
///   * marshalling mati   → mesej ujian hidup yang TEPAT muncul semula.
/// </summary>
public class PenghantaranBenangUiTests
{
    /// <summary>Mesej WebView2 sebenar, disalin bulat-bulat daripada log ujian hidup.</summary>
    private const string MesejSilangBenang = "CoreWebView2 can only be accessed from the UI thread.";

    // ---------- benang "UI" palsu ----------

    /// <summary>
    /// Satu benang khusus dengan giliran kerja + SynchronizationContext sendiri
    /// — model minimum bagi benang UI WinForms: kerja yang dihantar ke sini
    /// berjalan di SATU benang, dan kesinambungan selepas <c>await</c> pulang ke
    /// benang yang sama (seperti <c>WindowsFormsSynchronizationContext</c>).
    /// </summary>
    private sealed class BenangUiPalsu : IDisposable
    {
        private readonly BlockingCollection<Action> _giliran = new();
        private readonly Thread _benang;

        public int IdBenang { get; private set; }

        public BenangUiPalsu()
        {
            var sedia = new ManualResetEventSlim(false);
            _benang = new Thread(() =>
            {
                IdBenang = Environment.CurrentManagedThreadId;
                SynchronizationContext.SetSynchronizationContext(new KonteksBenang(this));
                sedia.Set();
                foreach (var kerja in _giliran.GetConsumingEnumerable())
                {
                    try { kerja(); } catch { /* pump tidak boleh mati */ }
                }
            })
            { IsBackground = true, Name = "benang-ui-palsu" };
            _benang.Start();
            sedia.Wait(5000);
            sedia.Dispose();
        }

        public void Hantar(Action kerja)
        {
            if (!_giliran.IsAddingCompleted) _giliran.Add(kerja);
        }

        public void Dispose()
        {
            _giliran.CompleteAdding();
            _benang.Join(5000);
        }

        private sealed class KonteksBenang : SynchronizationContext
        {
            private readonly BenangUiPalsu _pemilik;
            public KonteksBenang(BenangUiPalsu pemilik) => _pemilik = pemilik;
            public override void Post(SendOrPostCallback d, object? state) => _pemilik.Hantar(() => d(state));
            public override void Send(SendOrPostCallback d, object? state) => Post(d, state);
        }
    }

    /// <summary>
    /// <see cref="IMarshalUi"/> ujian: hantar ke benang UI palsu dan kira
    /// panggilan (supaya ujian boleh membuktikan ia benar-benar dilalui).
    /// Bentuknya sama seperti <c>MainForm.MarshalUiBorang</c>.
    /// </summary>
    private sealed class MarshalUiPalsu : IMarshalUi
    {
        private readonly BenangUiPalsu _benang;
        private int _bil;

        public MarshalUiPalsu(BenangUiPalsu benang) => _benang = benang;

        public int Bilangan => Volatile.Read(ref _bil);

        public Task<T> JalankanAsync<T>(Func<Task<T>> kerja)
        {
            Interlocked.Increment(ref _bil);
            var tcs = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
            _benang.Hantar(async () =>
            {
                try { tcs.TrySetResult(await kerja()); }
                catch (OperationCanceledException) { tcs.TrySetCanceled(); }
                catch (Exception ralat) { tcs.TrySetException(ralat); }
            });
            return tcs.Task;
        }
    }

    /// <summary>
    /// Stub seam WebView2 yang TERIKAT BENANG, sama seperti harta
    /// <c>WebView2.CoreWebView2</c> sebenar: dibaca dari benang lain = lontaran
    /// dengan mesej yang sama seperti log ujian hidup. Ia memulangkan
    /// <c>null</c> apabila dibaca dengan betul, jadi tiada WebView2 sebenar,
    /// tiada pelayar dan tiada portal disentuh oleh ujian ini.
    /// </summary>
    private static Func<CoreWebView2?> SeamTerikat(BenangUiPalsu benang, Action? padaBacaan = null) => () =>
    {
        padaBacaan?.Invoke();
        if (Environment.CurrentManagedThreadId != benang.IdBenang)
            throw new InvalidOperationException(MesejSilangBenang);
        return null;
    };

    /// <summary>Adaptor dengan SEMUA jeda dimatikan — ujian tidak menunggu masa sebenar.</summary>
    private static WebView2DomMoeis Dom(BenangUiPalsu benang, IMarshalUi ui, Action? padaBacaan = null) =>
        new(SeamTerikat(benang, padaBacaan), ui,
            masaSediaMs: 0, jedaPollMs: 0, masaMuatMs: 0, jedaSelepasPilihMs: 0);

    /// <summary>Jalankan <paramref name="kerja"/> di benang KOLAM, bukan benang ujian.</summary>
    private static Task<T> DariBenangKolam<T>(Func<Task<T>> kerja) => Task.Run(kerja);

    // ---------- 1. setiap kaedah adaptor melalui marshaller ----------

    /// <summary>
    /// Sapuan refleksi ke atas SELURUH <see cref="IDomMoeis"/>: setiap kaedah
    /// dipanggil dari benang kolam mesti (a) tidak melontar, dan (b) menambah
    /// kiraan marshaller. Refleksi digunakan dengan sengaja — kaedah BAHARU yang
    /// ditambah pada seam kelak akan diuji secara automatik, jadi seorang
    /// pengarang masa depan tidak boleh menyelinap masuk satu sentuhan
    /// CoreWebView2 yang tidak dibalut.
    /// </summary>
    [Fact]
    public async Task SetiapKaedahAdaptor_MelaluiMarshaller_DariBenangKolam()
    {
        using var benang = new BenangUiPalsu();
        var ui = new MarshalUiPalsu(benang);
        var dom = Dom(benang, ui);

        var kaedah = typeof(IDomMoeis).GetMethods(BindingFlags.Public | BindingFlags.Instance);
        Assert.Equal(22, kaedah.Length);   // seam berubah? ujian ini mesti dikemas kini secara sedar

        var sebelumSemua = 0;
        foreach (var m in kaedah)
        {
            // Semua parameter seam ini ialah string; parameter jenis lain perlu
            // nilai yang difikirkan, bukan null senyap.
            Assert.All(m.GetParameters(), p => Assert.Equal(typeof(string), p.ParameterType));
            var argumen = m.GetParameters().Select(_ => (object?)"A1").ToArray();

            var sebelum = ui.Bilangan;
            await DariBenangKolam(async () =>
            {
                var t = (Task)m.Invoke(dom, argumen)!;
                await t;   // melontar jika akses silang-benang berlaku
                return true;
            });

            Assert.True(ui.Bilangan > sebelum, $"{m.Name} tidak melalui marshaller UI");
            sebelumSemua++;
        }

        Assert.Equal(22, sebelumSemua);
    }

    /// <summary>
    /// Bukti ujian tidak lompong: marshaller pass-through (iaitu marshalling
    /// DILUMPUHKAN — keadaan kod sebelum pembetulan) menghidupkan semula
    /// kegagalan ujian hidup pada SETIAP kaedah yang menyentuh CoreWebView2.
    /// </summary>
    [Fact]
    public async Task MarshallingDilumpuhkan_SetiapKaedahMelontarRalatSilangBenang()
    {
        using var benang = new BenangUiPalsu();
        var dom = Dom(benang, MarshalUiTerus.Contoh);   // TIDAK menukar benang

        foreach (var m in typeof(IDomMoeis).GetMethods(BindingFlags.Public | BindingFlags.Instance))
        {
            var argumen = m.GetParameters().Select(_ => (object?)"A1").ToArray();

            var ralat = await Assert.ThrowsAsync<InvalidOperationException>(() =>
                DariBenangKolam(async () =>
                {
                    var t = (Task)m.Invoke(dom, argumen)!;
                    await t;
                    return true;
                }));

            Assert.Equal(MesejSilangBenang, ralat.Message);
        }
    }

    /// <summary>
    /// Marshalling tidak hanya "dipanggil" — kerjanya benar-benar berjalan di
    /// benang UI. Stub merekod id benang setiap bacaan seam.
    /// </summary>
    [Fact]
    public async Task SentuhanCoreWebView2_SentiasaBerlakuDiBenangUi()
    {
        using var benang = new BenangUiPalsu();
        var ui = new MarshalUiPalsu(benang);
        var benangBacaan = new ConcurrentBag<int>();
        var dom = Dom(benang, ui, padaBacaan: () => benangBacaan.Add(Environment.CurrentManagedThreadId));

        await DariBenangKolam(async () =>
        {
            await dom.NavigasiHarian();
            await dom.KlikTabHarian();
            await dom.BacaSenaraiMurid();
            await dom.TekanKemaskini();
            await dom.MuatSemula();
            return true;
        });

        Assert.NotEmpty(benangBacaan);
        Assert.All(benangBacaan, id => Assert.Equal(benang.IdBenang, id));
    }

    /// <summary>Marshaller WAJIB — tiada lalai senyap yang boleh terlupa.</summary>
    [Fact]
    public void Marshaller_Wajib_PadaKeduaDuaPembina()
    {
        Assert.Throws<ArgumentNullException>(() => new WebView2DomMoeis(() => null, null!));
        Assert.Throws<ArgumentNullException>(() => new WebView2DomMoeis(null!, MarshalUiTerus.Contoh));
        Assert.Throws<ArgumentNullException>(() => new PenghantaranMoeisWebView2(() => null, null!));
    }

    // ---------- 2. kitaran penghantaran penuh (punca ujian hidup) ----------

    private const string TarikhHariIni = "2026-09-23";
    private static readonly DateTime HariIni = new(2026, 9, 23, 11, 59, 0, DateTimeKind.Local);

    /// <summary>
    /// Sumber senarai yang benar-benar TAK SEGERAK, seperti bacaan backend
    /// sebenar. Inilah await yang, digandingkan dengan
    /// <c>ConfigureAwait(false)</c> dalam <see cref="AliranPenghantaranMoeis"/>,
    /// memindahkan seluruh baki kitaran ke benang kolam.
    /// </summary>
    private sealed class SumberTakSegerak : IKerjaPenuhSource
    {
        public async Task<SenaraiKerjaPenuh> SemakAsync(CancellationToken ct = default)
        {
            await Task.Delay(5, ct).ConfigureAwait(false);
            return SenaraiKerjaPenuh.Jawapan(
                new[]
                {
                    new KerjaPenuh("job-1", "1 BIJAK", TarikhHariIni, "menunggu", "", "K1",
                        new[] { new MuridKerjaPenuh("", "MURID UJIAN", "SAKIT", "DEMAM") }),
                },
                "ujian");
        }
    }

    private static AliranPenghantaranMoeis Aliran(IPenghantaranMoeis penghantar, List<string> log) =>
        new(new SumberTakSegerak(), penghantar,
            dihidupkan: () => true,
            jam: () => HariIni,
            log: log.Add);

    /// <summary>
    /// Kitaran penuh dimulakan DARI benang UI (seperti
    /// <c>MainForm.selepasLoginSah</c> melalui <c>PadaUiAsync</c>), tetapi
    /// menyeberang ke benang kolam di tengah jalan kerana
    /// <c>ConfigureAwait(false)</c>. Dengan marshaller, adaptor tetap selamat:
    /// sebab kegagalan tidak pernah lagi menyebut benang UI.
    /// </summary>
    [Fact]
    public async Task KitaranPenuh_DenganMarshaller_TiadaLagiRalatSilangBenang()
    {
        using var benang = new BenangUiPalsu();
        var ui = new MarshalUiPalsu(benang);
        var penghantar = new PenghantaranMoeisWebView2(SeamTerikat(benang), ui);
        var log = new List<string>();

        // Titik masuk pada benang UI — persis seperti MainForm.
        var hasil = await ui.JalankanAsync(() => Aliran(penghantar, log).JalankanAsync());

        var tamat = Assert.Single(log, b => b.StartsWith("PENGHANTARAN_TAMAT", StringComparison.Ordinal));
        Assert.DoesNotContain(MesejSilangBenang, tamat, StringComparison.Ordinal);
        Assert.DoesNotContain("UI thread", tamat, StringComparison.Ordinal);
        Assert.DoesNotContain("ralat-teknikal", tamat, StringComparison.Ordinal);
        // Halaman stub kosong, jadi penghantaran tetap gagal — tetapi atas sebab
        // HALAMAN, bukan benang. Itulah perbezaan yang ujian ini jaga.
        Assert.Equal(AliranPenghantaranMoeis.StatusGagal, hasil.Status);
        Assert.True(ui.Bilangan > 0);
    }

    /// <summary>
    /// Bukti ujian menangkap pepijat pada aras kitaran: tanpa marshalling,
    /// kitaran yang SAMA menghasilkan baris log ujian hidup yang sama.
    /// </summary>
    [Fact]
    public async Task KitaranPenuh_TanpaMarshalling_MenghasilkanSemulaBarisUjianHidup()
    {
        using var benang = new BenangUiPalsu();
        var ui = new MarshalUiPalsu(benang);
        var penghantar = new PenghantaranMoeisWebView2(SeamTerikat(benang), MarshalUiTerus.Contoh);
        var log = new List<string>();

        var hasil = await ui.JalankanAsync(() => Aliran(penghantar, log).JalankanAsync());

        var tamat = Assert.Single(log, b => b.StartsWith("PENGHANTARAN_TAMAT", StringComparison.Ordinal));
        Assert.Contains("status=gagal", tamat, StringComparison.Ordinal);
        Assert.Contains("Ralat teknikal semasa penghantaran MOEIS: " + MesejSilangBenang, tamat, StringComparison.Ordinal);
        Assert.Equal(AliranPenghantaranMoeis.StatusGagal, hasil.Status);
    }
}
