using HadirDesktop;

// Live READ-ONLY status smoke test against the real local engine (127.0.0.1:8747).
// No writes, no login, no navigation beyond the nonce handshake + /api/lokal/status.
// Prints ONLY booleans/counts/labels — never the nonce, never PII.
using var source = new LoopbackEngineStatusSource(baseUrl: null, timeout: TimeSpan.FromSeconds(45));
var s = await source.GetStatusAsync();
Console.WriteLine($"kind={s.Kind}");
Console.WriteLine($"ok={s.Ok} versi={s.Versi} pc={s.Pc}");
Console.WriteLine($"adaRahsiaEnjin={s.AdaRahsiaEnjin} klaimDisokong={s.KlaimDisokong}");
Console.WriteLine($"giliranAktif={s.GiliranAktif} modMula={s.GiliranModMula} sedangProses={s.GiliranSedangProses}");
Console.WriteLine($"autoMulaBermula={s.AutoMulaBermula}");
Console.WriteLine($"kalendarBilangan={s.KalendarBilangan} kalendarAmaran={s.KalendarAmaran}");
Console.WriteLine($"moeisSesiAda={s.MoeisSesiAda} bilanganPasangan={s.BilanganPasangan}");
Console.WriteLine($"catatan={s.Catatan ?? "-"}");
