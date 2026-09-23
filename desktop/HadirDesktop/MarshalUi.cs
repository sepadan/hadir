using System;
using System.Threading.Tasks;

namespace HadirDesktop;

/// <summary>
/// Seam penghantar kerja ke BENANG UI.
///
/// WebView2 ialah thread-affine. Bukan sahaja <c>Navigate</c>/<c>Reload</c>/
/// <c>ExecuteScriptAsync</c> — membaca harta <c>WebView2.CoreWebView2</c> itu
/// sendiri melontar
/// <c>InvalidOperationException("CoreWebView2 can only be accessed from the UI
/// thread.")</c> apabila disentuh dari benang lain.
///
/// Punca pepijat ujian hidup 23 Sep 2026 (<c>langkah=PENGHANTARAN_TAMAT
/// status=gagal</c> dalam &lt;1 s): <see cref="AliranPenghantaranMoeis"/>
/// menunggu I/O rangkaian sebenar dengan <c>ConfigureAwait(false)</c>, jadi
/// SynchronizationContext UI digugurkan dan kesinambungan selepasnya — termasuk
/// panggilan ke adaptor MOEIS — berjalan di benang kolam, walaupun pemanggil
/// asal bermula di benang UI melalui <c>MainForm.PadaUiAsync</c>.
///
/// Penyelesaiannya bukan membuang <c>ConfigureAwait(false)</c> di seluruh repo
/// (satu <c>await</c> baharu tanpanya akan menghidupkan semula pepijat yang
/// sama, senyap). Sebaliknya sempadan modul yang MENYENTUH WebView2 menjamin
/// benangnya sendiri: setiap sentuhan CoreWebView2 dalam
/// <see cref="WebView2DomMoeis"/> melalui seam ini, bukan hanya satu tempat.
/// </summary>
public interface IMarshalUi
{
    /// <summary>
    /// Jalankan <paramref name="kerja"/> di benang UI dan tunggu ia siap di
    /// sana. Pelaksana mesti memulangkan Task yang selesai hanya selepas
    /// <paramref name="kerja"/> selesai, dan mesti menyebarkan pengecualian
    /// (kegagalan benang tidak boleh menjadi senyap).
    /// </summary>
    Task<T> JalankanAsync<T>(Func<Task<T>> kerja);
}

/// <summary>
/// Marshaller TIDAK menukar benang: ia menjalankan kerja di tempat pemanggil.
///
/// Untuk ujian dan fixture sahaja. Dalam WinForms pengeluaran ini bermakna
/// tiada perlindungan langsung — gunakan marshaller sebenar borang.
/// </summary>
public sealed class MarshalUiTerus : IMarshalUi
{
    public static readonly MarshalUiTerus Contoh = new();

    public Task<T> JalankanAsync<T>(Func<Task<T>> kerja) => kerja();
}
