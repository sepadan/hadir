using System;
using System.IO;
using System.Text;
using System.Text.Json;

namespace HadirDesktop;

/// <summary>
/// Non-secret idMe auto-login feature settings (the opt-in switches). Both
/// default OFF. No credential value is ever stored here.
/// </summary>
public sealed record IdMeLoginTetapan
{
    /// <summary>Owner opt-in for demand-only auto-login. Default OFF.</summary>
    public bool LoginAuto { get; set; }

    /// <summary>
    /// Owner opt-in to continue the login when the anti-phishing phrase cannot
    /// be read as text (e.g. rendered as an image). A READ phrase that does NOT
    /// match still always aborts, regardless of this switch. Default OFF.
    /// </summary>
    public bool BenarkanTerusTanpaFrasa { get; set; }

    /// <summary>
    /// Owner-configurable consecutive CREDENTIAL-REJECTION guard: stop the
    /// automatic retries after this many explicit "wrong password / wrong IC"
    /// rejections in a row. 0 = never stop. Default 5. Not a hard lock — a
    /// one-click "Cuba lagi" clears the counter immediately.
    /// </summary>
    public int MaksPenolakanBerturut { get; set; } = 5;

    /// <summary>
    /// Owner opt-in to actually SUBMIT the matched attendance to MOEIS after a
    /// valid idMe session. Default OFF. Independent of <see cref="LoginAuto"/>
    /// (which only governs logging in): when this is OFF the flow logs in but
    /// never writes to MOEIS — it only observes. Turning it ON is the act that
    /// makes the desktop a real submitter.
    /// </summary>
    public bool HantarAuto { get; set; }
}

public interface IIdMeLoginSettingsStore
{
    IdMeLoginTetapan Baca();
    void Simpan(IdMeLoginTetapan tetapan);
}

/// <summary>
/// Plain-JSON (non-secret) settings store under
/// <c>LocalApplicationData/HadirDesktop/idme-login.json</c>. Missing/corrupt
/// file falls back to the conservative defaults (both OFF) — never to an
/// enabled state.
/// </summary>
public sealed class JsonIdMeLoginSettingsStore : IIdMeLoginSettingsStore
{
    private readonly string _laluan;

    public JsonIdMeLoginSettingsStore() : this(LaluanLalai())
    {
    }

    public JsonIdMeLoginSettingsStore(string laluan)
    {
        _laluan = laluan;
    }

    private static string LaluanLalai() => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "HadirDesktop", "idme-login.json");

    public IdMeLoginTetapan Baca()
    {
        try
        {
            if (!File.Exists(_laluan)) return new IdMeLoginTetapan();
            return JsonSerializer.Deserialize<IdMeLoginTetapan>(File.ReadAllText(_laluan, Encoding.UTF8)) ?? new IdMeLoginTetapan();
        }
        catch
        {
            return new IdMeLoginTetapan(); // conservative default
        }
    }

    public void Simpan(IdMeLoginTetapan tetapan)
    {
        var direktori = Path.GetDirectoryName(_laluan);
        if (!string.IsNullOrEmpty(direktori)) Directory.CreateDirectory(direktori);
        File.WriteAllText(_laluan, JsonSerializer.Serialize(tetapan), Encoding.UTF8);
    }
}
