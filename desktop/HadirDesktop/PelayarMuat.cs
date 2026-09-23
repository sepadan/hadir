using System;
using System.Threading.Tasks;

namespace HadirDesktop;

/// <summary>
/// Keputusan MENUNGGU satu navigasi pada seam <see cref="IPelayarMuat"/>.
/// Tiga keadaan, tiada campuran: hanya <see cref="Selesai"/> bermakna dokumen
/// BAHARU sudah commit dan DOM boleh dipercayai.
/// </summary>
public enum HasilMuat
{
    /// <summary><c>NavigationCompleted</c> tiba dengan kejayaan — DOM kini memegang dokumen baharu.</summary>
    Selesai,

    /// <summary><c>NavigationCompleted</c> tiba dengan kegagalan (ralat rangkaian/proses).</summary>
    Gagal,

    /// <summary>
    /// Tiada <c>NavigationCompleted</c> dalam had masa — keadaan dokumen
    /// TIDAK DIKENALI (mungkin masih dokumen LAMA), jadi ia bukan kejayaan.
    /// </summary>
    TamatMasa,
}

/// <summary>
/// Satu kejadian <c>NavigationCompleted</c> dalam bentuk yang tidak bergantung
/// pada <c>CoreWebView2</c> (sehingga seam ini boleh diuji tanpa pelayar).
/// </summary>
/// <param name="Berjaya"><c>IsSuccess</c> pada argumen peristiwa sebenar.</param>
/// <param name="Ralat"><c>WebErrorStatus</c> (atau mesej ralat) untuk laporan — boleh kosong.</param>
public sealed record KeputusanNavigasi(bool Berjaya, string Ralat = "");

/// <summary>
/// Seam "tunggu muat selesai" yang BOLEH DIUJI bagi pelayar penghantaran.
/// Tiga ahli sahaja, tepat seperti yang diperlukan untuk menggantikan
/// <c>CoreWebView2</c>:
///
///   (a) <see cref="MulaMuatSemulaAsync"/> — terbitkan semula-muat / navigasi;
///   (b) <see cref="LanggananSelesaiNavigasi"/> — langganan
///       <c>NavigationCompleted</c>, satu langganan setiap kitaran tunggu;
///   (c) <see cref="HadMasaMuatMs"/> — had masa tunggu (tidak pernah
///       menggantung selamanya).
///
/// Pelaksanaan produksi ialah <c>PelayarMuatCoreWebView2</c> (dalam
/// <c>PenghantaranMoeisWebView2.cs</c>); ujian memberi stub dalam-memori.
/// Logika menunggu sendiri hidup DI LUAR interface — dalam
/// <see cref="PengendaliMuat"/> — supaya ia dikongsi oleh produksi dan ujian,
/// bukan dua salinan yang boleh berpecah.
/// </summary>
public interface IPelayarMuat
{
    /// <summary>(c) Had masa menunggu satu navigasi, dalam milisaat.</summary>
    int HadMasaMuatMs { get; }

    /// <summary>
    /// (a) Terbitkan semula-muat dokumen semasa. Hanya perlu pulang selepas
    /// navigasi DIISYAHKAN — bukan menunggunya; menunggu ialah tugas
    /// <see cref="PengendaliMuat"/>.
    /// </summary>
    Task MulaMuatSemulaAsync();

    /// <summary>
    /// (a') Terbitkan NAVIGASI ke <paramref name="url"/> (berbeza dengan
    /// <see cref="MulaMuatSemulaAsync"/> yang memuat semula dokumen semasa).
    /// Seperti (a): hanya perlu pulang selepas navigasi DIISYAHKAN —
    /// menunggu ialah tugas <see cref="PengendaliMuat"/>.
    /// </summary>
    Task MulaNavigasiAsync(string url);

    /// <summary>
    /// (b) Langganan <c>NavigationCompleted</c> untuk SATU kitaran tunggu.
    /// Buang langganan selepas selesai supaya kejadian navigasi seterusnya
    /// tidak menyelesaikan kitaran yang sudah tamat.
    /// </summary>
    IDisposable LanggananSelesaiNavigasi(Action<KeputusanNavigasi> terima);
}

/// <summary>
/// Orkestrasi tunggu yang DIKONGSI oleh produksi dan ujian:
/// langganan → terbitkan semula-muat → tunggu kejayaan ATAU had masa.
///
/// Susunan itu penting: langganan mesti mendahului <c>Reload()</c>, kerana
/// navigasi yang pantas boleh selesai hampir serta-merta — kejadian yang terlepas
/// begitu akan menghabiskan seluruh had masa menunggu dokumen yang sebenarnya
/// sudah commit.
///
/// Tiada keputusan senyap: pulangan sentiasa satu daripada tiga
/// <see cref="HasilMuat"/>, dan pemanggil bertanggungjawab menafsirkannya.
/// </summary>
public static class PengendaliMuat
{
    /// <param name="mula">
    /// Cara navigasi DIMULAKAN. Lalai = <see cref="IPelayarMuat.MulaMuatSemulaAsync"/>
    /// (semula-muat dokumen semasa). <c>NavigasiHarian</c> memberikan
    /// navigasi-ke-URL di sini supaya KESELURUHAN susunan langganan → mula →
    /// tunggu kekal SATU salinan dikongsi, bukan dua.
    /// </param>
    public static async Task<HasilMuat> TungguNavigasiSelesaiAsync(IPelayarMuat pelayar, Func<Task>? mula = null)
    {
        if (pelayar == null) throw new ArgumentNullException(nameof(pelayar));

        // RunContinuationsAsynchronously: handler NavigationCompleted berlaku di
        // benang UI, jadi kesinambungan menunggu tidak boleh berlaku DI SINI.
        var tcs = new TaskCompletionSource<KeputusanNavigasi>(TaskCreationOptions.RunContinuationsAsynchronously);

        using (pelayar.LanggananSelesaiNavigasi(k => tcs.TrySetResult(k)))
        {
            // Ralat benang (dan mana-mana ralat teknikal) BENAR-BENAR merambat
            // keluar — ia tidak boleh lebur menjadi "tamat masa" palsu.
            if (mula != null) await mula().ConfigureAwait(false);
            else await pelayar.MulaMuatSemulaAsync().ConfigureAwait(false);

            var had = pelayar.HadMasaMuatMs;
            if (had < 0) had = 0;
            var tamat = Task.Delay(had);
            var menang = await Task.WhenAny(tcs.Task, tamat).ConfigureAwait(false);
            if (menang != tcs.Task) return HasilMuat.TamatMasa;

            var keputusan = await tcs.Task.ConfigureAwait(false);
            return keputusan.Berjaya ? HasilMuat.Selesai : HasilMuat.Gagal;
        }
    }
}
