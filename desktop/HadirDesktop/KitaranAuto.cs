using System;
using System.IO;

namespace HadirDesktop;

/// <summary>
/// Kitaran automatik PRODUKSI: menjadualkan kitaran deman yang SAMA seperti item
/// dulang "Log masuk idMe (atas permintaan)", supaya PC yang dihidupkan pagi itu
/// menghantar kerja yang menunggu tanpa klik manusia.
///
/// Syarat utama: pemilik telah menghidupkan sekurang-kurangnya satu ciri
/// sebenar (auto-login atau auto-hantar). Dengan kedua-duanya MATI, pemasa tidak
/// pernah berdenyut — tiada aktiviti portal secara senyap. Sejak 1.0.15 pemilik
/// boleh juga mengehadkan kitaran kepada tetingkap WAKTU AKTIF (opt-in, lalai
/// MATI): di luar waktu itu pemasa terus berdenyut tetapi setiap kitaran ditolak.
///
/// Selang juga pintar sejak 1.0.15: 90 saat selepas pass yang meninggalkan
/// kerja belum siap, 10 minit apabila tiada bukti kerja tertinggal.
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
    /// Selang BIASA antara kitaran, dalam minit. Sepuluh minit mengekalkan
    /// kadar cubaan portal dan log masuk automatik yang telah ditetapkan apabila
    /// tiada kerja tertinggal (lihat <see cref="SelangSaat(string?, int, int)"/>).
    /// </summary>
    public const int SelangMinit = 10;

    /// <summary>Selang biasa dalam saat (= <see cref="SelangMinit"/>).</summary>
    public const int SelangBiasaSaat = SelangMinit * 60;

    /// <summary>
    /// Selang PANTAS apabila pass penghantaran terakhir menunjukkan kerja
    /// mungkin belum siap. Bukti log: kegagalan MOEIS sementara (cth
    /// <c>halaman-tidak-sedia</c>) dahulunya hanya dibaiki pada kitaran 10 minit
    /// kemudian. Kitaran tetap tidak bertindan — selang ini hanya jarak antara
    /// tick, bukan kerja selari.
    /// </summary>
    public const int SelangCepatSaat = 90;

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

    /// <summary>
    /// Selang (saat) sebelum kitaran SETERUSNYA, daripada pass penghantaran
    /// terakhir — fungsi TULEN.
    ///
    /// Pantas (<see cref="SelangCepatSaat"/>) HANYA apabila ada bukti kerja
    /// mungkin belum siap: status kegagalan/sementara, atau status "baik" yang
    /// masih meninggalkan cubaan tidak disahkan (<paramref name="bilGagal"/>)
    /// atau tugasan dilangkau (<paramref name="bilBelumSiap"/>). Tiada maklumat
    /// (null, gate ditolak, penghantaran dimatikan, status tidak dikenali) =
    /// selang biasa: lebih banyak aktiviti portal mesti berasaskan bukti, bukan
    /// dipercepat secara senyap.
    /// </summary>
    public static int SelangSaat(string? statusPenghantaran, int bilGagal, int bilBelumSiap)
    {
        switch (statusPenghantaran)
        {
            case AliranPenghantaranMoeis.StatusGagal:
            case AliranPenghantaranMoeis.StatusBackendSementara:
            case AliranPenghantaranMoeis.StatusLaporanGagal:
            case AliranPenghantaranMoeis.StatusEnjinLuarTalian:
            case AliranPenghantaranMoeis.StatusTiadaPemilik:
                return SelangCepatSaat;

            case AliranPenghantaranMoeis.StatusTiadaPenghantaran:
            case AliranPenghantaranMoeis.StatusDihantar:
                return bilGagal > 0 || bilBelumSiap > 0 ? SelangCepatSaat : SelangBiasaSaat;

            default:
                return SelangBiasaSaat;
        }
    }

    /// <summary>
    /// <see cref="SelangSaat(string?, int, int)"/> daripada hasil pass sebenar:
    /// gagal = cubaan yang TIDAK disahkan; belum siap = tugasan hari ini yang
    /// dilangkau (klaim ditolak/gagal, tidak boleh dibina, disekat pagar).
    /// <c>null</c> = tiada pass penghantaran dalam kitaran ini → selang biasa.
    /// </summary>
    public static int SelangSaat(HasilHantarKerja? hasil)
    {
        if (hasil is null) return SelangBiasaSaat;

        var bilGagal = 0;
        foreach (var h in hasil.Hasil ?? Array.Empty<HasilPenghantaran>())
        {
            if (h is null || !h.Berjaya) bilGagal++;
        }
        return SelangSaat(hasil.Status, bilGagal, hasil.BilDilangkau);
    }

    /// <summary>
    /// Adakah <paramref name="teks"/> masa sah dalam format KETAT "HH:mm"
    /// (00:00–23:59, dua digit ASCII setiap satu)? Ruang di hujung dibuang.
    /// </summary>
    public static bool MasaSah(string? teks) => CubaBacaMasa(teks, out _);

    private static bool CubaBacaMasa(string? teks, out int minitHari)
    {
        minitHari = -1;
        if (teks is null) return false;
        var s = teks.Trim();
        if (s.Length != 5 || s[2] != ':') return false;
        foreach (var i in new[] { 0, 1, 3, 4 })
        {
            if (s[i] < '0' || s[i] > '9') return false;   // ASCII sahaja, bukan char.IsDigit
        }
        var jam = (s[0] - '0') * 10 + (s[1] - '0');
        var minit = (s[3] - '0') * 10 + (s[4] - '0');
        if (jam > 23 || minit > 59) return false;
        minitHari = jam * 60 + minit;
        return true;
    }

    /// <summary>
    /// Gate tetingkap WAKTU AKTIF — fungsi TULEN.
    ///
    /// <list type="bullet">
    /// <item>Tidak didayakan → sentiasa lulus (lalai: tingkah laku tidak berubah).</item>
    /// <item>Masa tidak dapat dibaca, atau mula == tamat (kabur) → TIDAK lulus (gagal tertutup).</item>
    /// <item>Tetingkap ialah [mula, tamat): tepat pada mula lulus, tepat pada tamat tidak.</item>
    /// <item>mula &gt; tamat = melintasi tengah malam (cth 22:00–06:30).</item>
    /// <item><paramref name="isninJumaat"/>: Sabtu/Ahad tidak lulus — dinilai pada hari
    /// kalendar <paramref name="kini"/> (paling ketat; Sabtu 02:00 tetap hujung minggu).</item>
    /// </list>
    /// </summary>
    public static bool WaktuAktifLulus(DateTime kini, bool didayakan, string? mula, string? tamat, bool isninJumaat)
    {
        if (!didayakan) return true;

        if (!CubaBacaMasa(mula, out var m) || !CubaBacaMasa(tamat, out var t)) return false;
        if (m == t) return false;

        if (isninJumaat && (kini.DayOfWeek == DayOfWeek.Saturday || kini.DayOfWeek == DayOfWeek.Sunday))
        {
            return false;
        }

        var sekarang = kini.Hour * 60 + kini.Minute;
        return m < t
            ? sekarang >= m && sekarang < t
            : sekarang >= m || sekarang < t;
    }

    /// <summary>
    /// Sebab untuk label "Kitaran" apabila gate waktu aktif menolak. Nilai masa
    /// yang tidak sah TIDAK dipaparkan semula — hanya diakui tidak sah.
    /// </summary>
    public static string SebabLuarWaktuAktif(string? mula, string? tamat, bool isninJumaat)
    {
        if (!CubaBacaMasa(mula, out _) || !CubaBacaMasa(tamat, out _) || mula!.Trim() == tamat!.Trim())
        {
            return "waktu aktif tidak sah — semak \"Akaun idMe…\"";
        }

        var hari = isninJumaat ? ", Isnin–Jumaat" : "";
        return "di luar waktu aktif (" + mula.Trim() + "–" + tamat.Trim() + hari + ") — disambung sendiri dalam waktu itu";
    }

    /// <summary>Laluan log produksi (boleh diuji terhadap folder sementara).</summary>
    public static string LaluanLog(string? folderAsas = null) =>
        Path.Combine(
            folderAsas ?? Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            NamaFolder,
            NamaFailLog);
}
