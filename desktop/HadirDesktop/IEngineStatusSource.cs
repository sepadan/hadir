using System.Threading;
using System.Threading.Tasks;

namespace HadirDesktop;

/// <summary>
/// Abstraction over "where do we read engine status from". Read-only by
/// contract — no implementation of this interface may mutate engine state.
/// </summary>
public interface IEngineStatusSource
{
    /// <summary>Human-readable label for the status strip, e.g. "simulasi" or "enjin sebenar 127.0.0.1:8747".</summary>
    string SourceLabel { get; }

    Task<EngineStatusModel> GetStatusAsync(CancellationToken cancellationToken = default);
}
