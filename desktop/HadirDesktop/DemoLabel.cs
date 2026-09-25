namespace HadirDesktop;

/// <summary>
/// Central, pure constants for DEMO-mode labelling. Every user-visible surface
/// (window title, banner, status strip, fixture portal) must use these so the
/// app can never appear ambiguous about being a non-production demo.
/// </summary>
public static class DemoLabel
{
    /// <summary>Nama aplikasi tanpa hiasan — dipakai tajuk tetingkap dan nota dulang.</summary>
    public const string NamaApl = "HADIR Desktop";

    /// <summary>Penanda mod demo, sentiasa selepas nama (dan versi, jika ada).</summary>
    public const string SufiksDemo = " — MOD DEMO";

    public const string WindowTitle = NamaApl + SufiksDemo;

    /// <summary>
    /// Tajuk tetingkap dengan versi binaan, cth <c>HADIR Desktop 1.0.0 — MOD
    /// DEMO</c>. Penanda "MOD DEMO" muncul HANYA apabila tiada ciri sebenar
    /// dihidupkan (lihat <paramref name="adaCiriSebenar"/>): memasang di sekolah
    /// dengan tajuk yang mengaku "demo" adalah tidak jujur apabila aplikasi itu
    /// memang menulis ke MOEIS. Versi datang dari <see cref="VersiAplikasi"/> sahaja.
    /// </summary>
    public static string TajukTetingkapDenganVersi(bool adaCiriSebenar = false) =>
        NamaApl + " " + VersiAplikasi.Versi + (adaCiriSebenar ? string.Empty : SufiksDemo);

    public const string BannerText = "MOD DEMO — bukan sistem pengeluaran. Tiada tulisan MOEIS, tiada log masuk idMe sebenar.";
    /// <summary>Portal idMe sebenar dipaparkan tanpa menghidupkan sebarang automasi.</summary>
    public const string BannerLoginManual = "idMe sebenar — log masuk manual; log masuk automatik dan penghantaran MOEIS dimatikan.";
    public const string SufiksLoginManual = " — LOG MASUK MANUAL";

    /// <summary>Banner untuk pemasangan sebenar: kerja sebenar dihidupkan oleh pemilik.</summary>
    public const string BannerProduksi = "SISTEM SEBENAR — log masuk idMe & tulisan MOEIS dihidupkan oleh pemilik.";

    /// <summary>Banner yang jujur tentang mod semasa (demo lawan sebenar).</summary>
    public static string Banner(bool adaCiriSebenar) => adaCiriSebenar ? BannerProduksi : BannerText;

    public const string SimulatedSourceLabel = "simulasi";
    public const string RealSourceLabel = "enjin sebenar 127.0.0.1:8747";
    public const string FixturePortalTitle = "Portal Palsu (Fixture) — bukan idMe/MOEIS sebenar";
    public const string TrayBalloonTitle = "HADIR Desktop";
    public const string TrayBalloonText = "Masih berjalan dalam dulang sistem.";
    public const string TrayShow = "Tunjuk";
    public const string TrayOpenSettings = "Tetapan Tempatan";
    public const string TrayIdMeSettings = "Akaun idMe…";
    public const string TrayLoginAuto = "Log masuk idMe (atas permintaan)";
    public const string TrayCubaLagi = "Cuba lagi (kosongkan penolakan)";
    public const string TrayAutostart = "Mula bersama Windows";

    /// <summary>
    /// Item dulang untuk menyemak keluaran baharu HADIR Desktop. Ia hanya
    /// MEMBACA manifest awam; ia tidak pernah menghantar rahsia, kredensial atau
    /// data murid ke mana-mana.
    /// </summary>
    public const string TraySemakKemasKini = "Semak kemas kini…";

    /// Togol pemilik untuk penghantaran MOEIS automatik. Lalai MATI — item ini
    /// ialah satu-satunya tempat pemilik menghidupkannya dari dulang.
    /// </summary>
    public const string TrayHantarAuto = "Hantar ke MOEIS (automatik)";
    public const string TrayExit = "Keluar";

    /// <summary>Label shown when the dev/test debug transport is active (never in normal mode).</summary>
    public const string DevDebugBannerSuffix = " — MOD DEV-DEBUG (CDP loopback sahaja)";

    /// <summary>Label shown when the real-portal dev mode is active (HADIR_DEV_REAL_PORTAL=1).</summary>
    public const string RealPortalBannerSuffix = " — MOD DEV REAL-PORTAL (idMe sebenar, baca sahaja)";

    /// <summary>Halaman log masuk idMe rasmi untuk WebView2 biasa dan dev real-portal.</summary>
    public const string RealPortalLoginUrl = "https://idme.moe.gov.my/login";

    /// <summary>
    /// HADIR backend Apps Script Web App URL for the multi-PC device registry
    /// RPCs. Intentionally EMPTY: this repo is public (see CLAUDE.md) and no
    /// production URL is committed here. An empty URL makes every
    /// <see cref="DeviceRegistrationClient"/> call fail fast and locally
    /// (invalid URI) rather than silently pointing at a guessed endpoint —
    /// the probe panel then honestly reports "tiada sokongan pelayan".
    /// </summary>
    public const string HadirBackendApiUrl = "";
}
