namespace HadirDesktop;

/// <summary>
/// What this installation can currently do with the HADIR multi-PC device
/// registry backend. Never fabricated: a probe result of
/// <see cref="Tersedia"/> means the backend answered <c>pcStatusAwam</c> with
/// <c>ok:true</c> right now — it is not a claim about future availability.
/// </summary>
public enum PerantiKemampuan
{
    /// <summary>Backend unreachable, or too old to know the multi-PC RPCs — treat as unsupported.</summary>
    TiadaSokongan,

    /// <summary>Backend knows the feature but it is switched OFF (<c>HADIR_PELBAGAI_PC</c> Script Property).</summary>
    Dilumpuhkan,

    /// <summary>Backend reachable and the feature is ON.</summary>
    Tersedia,
}

/// <summary>Read-only capability snapshot with a human-readable reason, never a live traffic side effect.</summary>
public sealed record PerantiKeadaanRangkaian
{
    public PerantiKemampuan Kemampuan { get; init; }
    public string Mesej { get; init; } = string.Empty;
}
