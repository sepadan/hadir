using System;
using System.IO;

namespace HadirDesktop;

/// <summary>
/// Kitaran automatik PRODUKSI: menjadualkan kitaran deman yang SAMA seperti item
/// dulang "Log masuk idMe (atas permintaan)", supaya PC yang dihidupkan pagi itu
/// menghantar kerja yang menunggu tanpa klik manusia.
///
/// Satu-satunya syarat: pemilik telah menghidupkan sekurang-kurangnya satu ciri
/// sebenar (auto-login atau auto-hantar). Dengan kedua-duanya MATI, pemasa tidak
/// pernah berdenyut — tiada aktiviti portal secara senyap.
///
/// Ini BUKAN pengekalan hidup (keepalive): kitaran itu sendiri tidak membuka
/// portal apabila tiada kerja belum siap, jadi denyutan biasa cuma satu
/// pemeriksaan deman yang murah terhadap pelayan.
/// </summary>
public static class KitaranAuto
{
    public const string NamaFolder = "HadirDesktop";

    /// <summary>Nama fail log produksi (sama seperti baris versi setiap lancaran).</summary>
    public const string NamaFailLog = "hadir-desktop.log";

    /// <summary>
    /// Selang antara kitaran, dalam minit. 10 minit: cukup pantas untuk pagi
    /// sekolah (guru menanda, tugasan dihantar tidak lama selepas itu) dan cukup
    /// jarang untuk tidak membebankan portal atau pelayan HADIR.
    /// </summary>
    public const int SelangMinit = 10;

    /// <summary>
    /// Tundaan kitaran PERTAMA selepas tetingkap siap. PC sekolah yang baru
    /// dihidupkan tidak sepatutnya menunggu selang penuh sebelum menghantar
    /// kerja yang sudah menunggu.
    /// </summary>
    public const int TundaanMulaSaat = 45;

    /// <summary>
    /// Adakah kitaran automatik wajar berjalan? TULEN dan satu-satunya tempat
    /// keputusan ini dibuat, supaya tingkah laku boleh diuji tanpa WinForms.
    /// </summary>
    public static bool KenaJalan(bool loginAuto, bool hantarAuto) => loginAuto || hantarAuto;

    /// <summary>Laluan log produksi (boleh diuji terhadap folder sementara).</summary>
    public static string LaluanLog(string? folderAsas = null) =>
        Path.Combine(
            folderAsas ?? Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            NamaFolder,
            NamaFailLog);
}
