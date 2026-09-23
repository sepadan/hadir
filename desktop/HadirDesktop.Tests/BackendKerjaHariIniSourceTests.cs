using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Backend-direct demand probe: the SAME "is there an unfinished MOEIS task
/// TODAY?" answer the loopback engine gives, but read straight from Apps Script.
/// Never mutates, never guesses — a failed read is "tidak pasti", never "no work".
/// </summary>
public class BackendKerjaHariIniSourceTests
{
    private sealed class KlienPalsu : IHadirBackendClient
    {
        private readonly Func<Task<IReadOnlyList<KerjaPenuh>>> _senarai;
        public KlienPalsu(Func<Task<IReadOnlyList<KerjaPenuh>>> senarai) => _senarai = senarai;
        public Task<IReadOnlyList<KerjaPenuh>> SenaraiAsync(CancellationToken ct = default) => _senarai();
        public Task<TugasanDiklaim?> KlaimAsync(string id, string pemilik, ModKlaim mod, CancellationToken ct = default) => throw new NotImplementedException();
        public Task LepasAsync(string id, string pemilik, CancellationToken ct = default) => throw new NotImplementedException();
        public Task SelesaiAsync(string id, string keputusan, string mesej, int? bilHadirSelepas, string pemilik, CancellationToken ct = default) => throw new NotImplementedException();
    }

    private static readonly string HariIni = "2026-09-23";

    private static KerjaPenuh Kerja(string tarikhIso, string status = "menunggu") =>
        new("id-1", "4 Mawar", tarikhIso, status, "", "kls-1", Array.Empty<MuridKerjaPenuh>());

    private static BackendKerjaHariIniSource Sumber(Func<Task<IReadOnlyList<KerjaPenuh>>> senarai) =>
        new(new KlienPalsu(senarai), jam: () => DateTime.Parse("2026-09-23T10:00:00Z").ToLocalTime());

    [Fact]
    public async Task SenaraiKosong_TiadaKerja()
    {
        var hasil = await Sumber(() => Task.FromResult<IReadOnlyList<KerjaPenuh>>(Array.Empty<KerjaPenuh>())).SemakAsync();

        Assert.False(hasil.AdaKerja);
        Assert.True(hasil.EnjinBolehDicapai);
    }

    [Fact]
    public async Task TugasanBelumSiapHariIni_AdaKerja_DenganBilangan()
    {
        var senarai = new List<KerjaPenuh> { Kerja(HariIni), Kerja(HariIni, "tersimpan") };
        var hasil = await Sumber(() => Task.FromResult<IReadOnlyList<KerjaPenuh>>(senarai)).SemakAsync();

        Assert.True(hasil.AdaKerja);
        Assert.True(hasil.EnjinBolehDicapai);
        Assert.Equal(2, hasil.BilanganKerja);
    }

    [Fact]
    public async Task TugasanTarikhLain_TiadaKerja()
    {
        var senarai = new List<KerjaPenuh> { Kerja("2026-09-22") };
        var hasil = await Sumber(() => Task.FromResult<IReadOnlyList<KerjaPenuh>>(senarai)).SemakAsync();

        Assert.False(hasil.AdaKerja);
        Assert.True(hasil.EnjinBolehDicapai);
    }

    [Fact]
    public async Task TugasanSudahSiap_TiadaKerja()
    {
        var senarai = new List<KerjaPenuh> { Kerja(HariIni, "berjaya") };
        var hasil = await Sumber(() => Task.FromResult<IReadOnlyList<KerjaPenuh>>(senarai)).SemakAsync();

        Assert.False(hasil.AdaKerja);
        Assert.True(hasil.EnjinBolehDicapai);
    }

    [Fact]
    public async Task BackendLontar_TidakPasti_BukanTiadaKerja()
    {
        var hasil = await Sumber(() => throw new HadirBackendException("gagal")).SemakAsync();

        Assert.False(hasil.AdaKerja);
        Assert.False(hasil.EnjinBolehDicapai);
        Assert.Contains("tidak dapat", hasil.Sebab);
    }

    [Fact]
    public async Task KegagalanSementara_SebabMenerangkanBolehDicubaLagi()
    {
        // A transient client failure must surface as a RETRYABLE reason and
        // carry the Sementara flag — never as a plain "cannot reach" answer
        // and never with the label "enjin-luar-talian".
        var hasil = await Sumber(() => throw new HadirBackendException(
                "backend sibuk (masa tamat) semasa memanggil HADIR 'moeisJobSenarai'.", sementara: true))
            .SemakAsync();

        Assert.False(hasil.AdaKerja);
        Assert.False(hasil.EnjinBolehDicapai);
        Assert.True(hasil.Sementara);
        Assert.Contains("backend sibuk (masa tamat)", hasil.Sebab);
        Assert.Contains("boleh dicuba", hasil.Sebab);
        Assert.DoesNotContain("enjin-luar-talian", hasil.Sebab);
    }
}
