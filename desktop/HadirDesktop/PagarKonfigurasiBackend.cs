using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace HadirDesktop;

/// <summary>
/// Pagar konfigurasi backend AKTIF. Klien backend dibina sekali semasa lancar,
/// tetapi tetapan pada cakera boleh dipadam, rosak atau ditukar selepas itu.
/// Pagar membaca semula stor dan membenarkan kerja hanya apabila konfigurasi
/// semasa sah DAN cap jarinya SAMA dengan konfigurasi yang dipegang klien.
///
/// Titik semakan (semuanya gagal-tertutup, tiada I/O apabila menolak):
///   * <see cref="Klien"/> — sebelum setiap kaedah bermula;
///   * <see cref="SemakSebelumRangkaian"/> — diberi kepada kilang dan dipanggil
///     oleh <see cref="HadirBackendClient"/> SEJURUS sebelum setiap
///     <c>HttpClient.SendAsync</c>, termasuk setiap cubaan semula selepas jeda;
///   * <see cref="SemakSebelumPortal"/> — dipanggil oleh
///     <see cref="AliranPenghantaranMoeis"/> sejurus sebelum tulisan portal MOEIS.
///
/// Satu pengecualian yang disengajakan: <c>moeisJobLepas</c>/<c>moeisJobSelesai</c>
/// bagi tugasan yang DIKLAIM melalui pagar ini dan belum dilepas/diselesaikan
/// tetap dibenarkan, supaya klaim yang sudah dipegang dilepaskan atau tulisan
/// MOEIS yang sudah berlaku direkod — bukan ditinggalkan <c>sedang_dihantar</c>
/// dan dituntut serta ditulis semula. Tiada kerja BAHARU dimulakan.
///
/// Had yang tidak dapat dielakkan: permintaan HTTP atau tulisan portal yang
/// SUDAH bermula tidak boleh ditarik balik; penarikan balik tidak atomik.
/// Tiada rahsia, URL atau cap jari pernah muncul dalam sebab atau mesej.
/// </summary>
public sealed class PagarKonfigurasiBackend
{
    public const string SebabTiadaKlien =
        "Tiada klien backend aktif (konfigurasi atau migrasi belum sah semasa lancar); tiada panggilan backend.";
    public const string SebabBerubah =
        "Konfigurasi backend Desktop tiada, rosak atau bertukar selepas lancar; tiada panggilan backend sehingga aplikasi dimulakan semula.";

    private const string KaedahLepas = "moeisJobLepas";
    private const string KaedahSelesai = "moeisJobSelesai";

    private readonly IRahsiaEnjinStore _store;
    private readonly IHadirBackendClient? _dalaman;
    private readonly HashSet<string> _diklaim = new(StringComparer.Ordinal);
    private readonly object _kunci = new();

    /// <param name="migrasiBackendMuktamad">
    /// Keputusan migrasi backend semasa lancar ialah muktamad. Palsu ⇒ tiada klien.
    /// </param>
    /// <param name="kilang">
    /// Membina klien sebenar daripada konfigurasi dan pagar rangkaian
    /// (<see cref="SemakSebelumRangkaian"/>). Tidak dipanggil apabila pagar menolak.
    /// </param>
    public PagarKonfigurasiBackend(IRahsiaEnjinStore store, bool migrasiBackendMuktamad,
        Func<TetapanBackendEnjin, Func<string, string?, string?>, IHadirBackendClient> kilang)
    {
        _store = store;
        if (!migrasiBackendMuktamad) return;

        TetapanBackendEnjin? tetapan;
        try { tetapan = store.Baca(); }
        catch { tetapan = null; }
        if (tetapan is null) return;

        CapKlien = CapKonfigurasiBackend.Kira(tetapan.ApiUrl, tetapan.RahsiaEnjin);
        if (CapKlien is null) return;
        _dalaman = kilang(tetapan, SemakSebelumRangkaian);
        Klien = new KlienBerpagar(_dalaman, this);
    }

    /// <summary>Klien berpagar, atau <c>null</c> apabila tiada klien aktif.</summary>
    public IHadirBackendClient? Klien { get; }

    /// <summary>Cap jari konfigurasi klien. DALAM MEMORI SAHAJA; tidak pernah dipaparkan.</summary>
    public string? CapKlien { get; }

    /// <summary>
    /// Klien aktif wujud DAN konfigurasi pada cakera sekarang sah dan sama.
    /// Tidak pernah melontar.
    /// </summary>
    public (bool Sah, string Sebab) Semak()
    {
        if (_dalaman is null) return (false, SebabTiadaKlien);
        string? capSekarang;
        try
        {
            var t = _store.Baca();
            capSekarang = t is null ? null : CapKonfigurasiBackend.Kira(t.ApiUrl, t.RahsiaEnjin);
        }
        catch
        {
            capSekarang = null;
        }
        return CapKonfigurasiBackend.Sepadan(CapKlien, capSekarang) ? (true, "") : (false, SebabBerubah);
    }

    /// <summary>
    /// Pagar setiap permintaan rangkaian: <c>null</c> = dibenarkan, selain itu
    /// sebab penolakan. Lepas/Selesai bagi tugasan yang dipegang dibenarkan.
    /// </summary>
    public string? SemakSebelumRangkaian(string kaedah, string? idTugasan)
    {
        if ((kaedah == KaedahLepas || kaedah == KaedahSelesai) && idTugasan is not null && Dipegang(idTugasan))
            return null;
        var (sah, sebab) = Semak();
        return sah ? null : sebab;
    }

    /// <summary>
    /// Pagar sebelum tulisan portal MOEIS: <c>null</c> = dibenarkan. TIADA
    /// pengecualian klaim di sini — klaim yang dipegang tidak membenarkan
    /// tulisan baharu apabila konfigurasi sudah tidak sah.
    /// </summary>
    public string? SemakSebelumPortal()
    {
        var (sah, sebab) = Semak();
        return sah ? null : sebab;
    }

    private bool Dipegang(string id)
    {
        lock (_kunci) return _diklaim.Contains(id);
    }

    private sealed class KlienBerpagar : IHadirBackendClient
    {
        private readonly IHadirBackendClient _dalaman;
        private readonly PagarKonfigurasiBackend _pagar;

        public KlienBerpagar(IHadirBackendClient dalaman, PagarKonfigurasiBackend pagar)
        {
            _dalaman = dalaman;
            _pagar = pagar;
        }

        private void Wajib(string kaedah, string? id)
        {
            var tolak = _pagar.SemakSebelumRangkaian(kaedah, id);
            if (tolak is not null) throw new HadirBackendException(tolak);
        }

        public Task<IReadOnlyList<KerjaPenuh>> SenaraiAsync(CancellationToken ct = default)
        {
            Wajib("moeisJobSenarai", null);
            return _dalaman.SenaraiAsync(ct);
        }

        public async Task<TugasanDiklaim?> KlaimAsync(string id, string pemilik, ModKlaim mod, CancellationToken ct = default)
        {
            Wajib("moeisJobKlaim", id);
            var klaim = await _dalaman.KlaimAsync(id, pemilik, mod, ct).ConfigureAwait(false);
            if (klaim is not null) lock (_pagar._kunci) _pagar._diklaim.Add(id);
            return klaim;
        }

        public async Task LepasAsync(string id, string pemilik, CancellationToken ct = default)
        {
            Wajib(KaedahLepas, id);
            await _dalaman.LepasAsync(id, pemilik, ct).ConfigureAwait(false);
            lock (_pagar._kunci) _pagar._diklaim.Remove(id);
        }

        public async Task SelesaiAsync(string id, string keputusan, string mesej, int? bilHadirSelepas, string pemilik, CancellationToken ct = default)
        {
            Wajib(KaedahSelesai, id);
            await _dalaman.SelesaiAsync(id, keputusan, mesej, bilHadirSelepas, pemilik, ct).ConfigureAwait(false);
            lock (_pagar._kunci) _pagar._diklaim.Remove(id);
        }
    }
}
