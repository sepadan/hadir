using System.Collections.Generic;

namespace HadirDesktop;

/// <summary>
/// Setiap fungsi menu dulang. Satu nilai = satu item dulang = satu butang
/// dalam <see cref="PanelFungsi"/>. Item status (baris kelabu) bukan fungsi.
/// </summary>
public enum FungsiDulang
{
    Tunjuk,
    SemuaFungsi,
    TetapanTempatan,
    AkaunIdMe,
    Autostart,
    LoginIdMe,
    CubaLagi,
    HantarAuto,
    SemakKemasKini,
    Keluar,
}

public enum JenisFungsi
{
    /// <summary>Tindakan sekali klik (sama seperti klik item dulang).</summary>
    Perintah,

    /// <summary>Togol hidup/mati yang dibaca dan ditulis melalui dulang.</summary>
    Togol,

    /// <summary>Item yang membuka panel ini sendiri — dipapar, tiada tindakan.</summary>
    PanelIni,
}

public sealed record ItemFungsi(FungsiDulang Fungsi, string Label, string Penerangan, JenisFungsi Jenis);

public sealed record KelompokFungsi(string Tajuk, IReadOnlyList<ItemFungsi> Item);

/// <summary>
/// Kandungan panel "Semua fungsi" — fungsi TULEN (tiada WinForms, tiada I/O)
/// supaya liputan setiap item dulang boleh diuji tanpa tetingkap. Label datang
/// daripada <see cref="DemoLabel"/> sahaja, jadi teks panel dan teks dulang
/// tidak boleh menyimpang.
/// </summary>
public static class PanelFungsiBina
{
    public static IReadOnlyList<KelompokFungsi> Senarai() => new[]
    {
        new KelompokFungsi("Paparan", new[]
        {
            new ItemFungsi(FungsiDulang.Tunjuk, DemoLabel.TrayShow,
                "Buka tetingkap utama HADIR Desktop.", JenisFungsi.Perintah),
            new ItemFungsi(FungsiDulang.SemuaFungsi, DemoLabel.TraySemuaFungsi,
                "Tetingkap ini — dibuka dari menu dulang.", JenisFungsi.PanelIni),
        }),
        new KelompokFungsi("Tetapan", new[]
        {
            new ItemFungsi(FungsiDulang.TetapanTempatan, DemoLabel.TrayOpenSettings,
                "URL Apps Script dan rahsia enjin pada PC ini.", JenisFungsi.Perintah),
            new ItemFungsi(FungsiDulang.AkaunIdMe, DemoLabel.TrayIdMeSettings,
                "Kredensial idMe, pilihan automatik dan waktu aktif.", JenisFungsi.Perintah),
            new ItemFungsi(FungsiDulang.Autostart, DemoLabel.TrayAutostart,
                "Lancarkan HADIR Desktop apabila log masuk Windows.", JenisFungsi.Togol),
        }),
        new KelompokFungsi("Penghantaran", new[]
        {
            new ItemFungsi(FungsiDulang.LoginIdMe, DemoLabel.TrayLoginAuto,
                "Satu kitaran sekarang: semak kerja HADIR, log masuk hanya jika ada kerja.", JenisFungsi.Perintah),
            new ItemFungsi(FungsiDulang.CubaLagi, DemoLabel.TrayCubaLagi,
                "Kosongkan penjaga penolakan kredensial, kemudian satu kitaran lagi.", JenisFungsi.Perintah),
            new ItemFungsi(FungsiDulang.HantarAuto, DemoLabel.TrayHantarAuto,
                "Hantar kehadiran ke MOEIS secara automatik selepas log masuk.", JenisFungsi.Togol),
        }),
        new KelompokFungsi("Sistem", new[]
        {
            new ItemFungsi(FungsiDulang.SemakKemasKini, DemoLabel.TraySemakKemasKini,
                "Baca manifest keluaran awam dan tawarkan versi baharu.", JenisFungsi.Perintah),
            new ItemFungsi(FungsiDulang.Keluar, DemoLabel.TrayExit,
                "Tutup HADIR Desktop sepenuhnya (bukan sembunyi ke dulang).", JenisFungsi.Perintah),
        }),
    };
}
