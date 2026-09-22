using System.Threading;
using System.Threading.Tasks;

namespace HadirDesktop;

/// <summary>
/// DEMO default: returns a canned, visibly non-production status. Never
/// touches the network or the real engine.
/// </summary>
public sealed class FixtureEngineStatusSource : IEngineStatusSource
{
    public string SourceLabel => DemoLabel.SimulatedSourceLabel;

    public Task<EngineStatusModel> GetStatusAsync(CancellationToken cancellationToken = default)
    {
        var status = new EngineStatusModel
        {
            Ok = true,
            Versi = "demo-simulasi-0.0.0",
            Pc = "PC-SIMULASI",
            AdaRahsiaEnjin = false,
            KlaimDisokong = false,
            GiliranAktif = false,
            GiliranModMula = "-",
            GiliranSedangProses = false,
            AutoMulaBermula = false,
            KalendarBilangan = 0,
            KalendarAmaran = false,
            MoeisSesiAda = null,
            BilanganPasangan = 0,
            Kind = EngineStatusKind.Ok,
            IsSimulated = true,
            SourceLabel = SourceLabel,
            Catatan = "Data simulasi untuk demo sahaja — bukan enjin sebenar.",
        };

        return Task.FromResult(status);
    }
}
