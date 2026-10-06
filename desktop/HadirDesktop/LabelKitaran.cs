using System;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace HadirDesktop;

/// <summary>
/// Cap jari konfigurasi backend: cukup untuk menjawab "adakah konfigurasi pada
/// cakera masih SAMA seperti yang dipegang oleh klien yang sedang berjalan?"
/// tanpa menyimpan atau membandingkan nilai itu sendiri.
///
/// Dua boolean "sedia / tidak sedia" tidak mencukupi: apiUrl atau rahsia boleh
/// bertukar kepada nilai LAIN yang tetap sah, dan kedua-dua boolean kekal benar
/// sedangkan klien masih memakai nilai lama sehingga aplikasi dimulakan semula.
///
/// PERATURAN KETAT: nilai yang dipulangkan HIDUP DALAM MEMORI SAHAJA. Ia tidak
/// pernah ditulis ke log, teks label, mesej pengecualian, atau mana-mana
/// permukaan UI — ia hanya dibandingkan dengan <c>==</c>. Ia juga bukan pengganti
/// rahsia: ia cincangan sehala, dan tiada apa-apa dalam aplikasi ini yang
/// menyahcincangnya.
/// </summary>
public static class CapKonfigurasiBackend
{
    /// <summary>
    /// Cap jari bagi pasangan (apiUrl, rahsia), atau <c>null</c> apabila salah
    /// satunya tiada. Panjang apiUrl diawalan supaya sempadan antara kedua-dua
    /// medan tidak boleh dikaburkan (cth "ab"+"c" lawan "a"+"bc").
    /// </summary>
    public static string? Kira(string? apiUrl, string? rahsiaEnjin)
    {
        if (string.IsNullOrEmpty(apiUrl) || string.IsNullOrEmpty(rahsiaEnjin)) return null;

        var bahan = apiUrl.Length.ToString(CultureInfo.InvariantCulture) + ":" + apiUrl + "\n" + rahsiaEnjin;
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(bahan)));
    }

    /// <summary>
    /// Adakah konfigurasi semasa SAMA seperti yang dipegang klien? Palsu apabila
    /// mana-mana pihak tidak diketahui — tidak tahu tidak sama dengan sama.
    /// </summary>
    public static bool Sepadan(string? capKlien, string? capSekarang) =>
        capKlien != null && capSekarang != null && string.Equals(capKlien, capSekarang, StringComparison.Ordinal);
}

/// <summary>
/// Aritmetik jadual kitaran automatik — fungsi TULEN (tiada WinForms, tiada jam
/// tersembunyi, tiada I/O), supaya jangkaan yang dipaparkan kepada pemilik boleh
/// diuji tanpa message-loop.
///
/// Satu perkara halus yang mudah disalah anggap: pemasa WinForms TIDAK bermula
/// semula selepas pengendali Tick-nya selesai. Ia terus mengikut jadualnya
/// sendiri, jadi tick berikutnya tiba kira-kira satu selang selepas tick
/// SEBELUMNYA BERMULA — bukan satu selang selepas kerja tamat. Kitaran yang
/// mengambil dua minit oleh itu diikuti tick lapan minit kemudian, bukan sepuluh.
/// Semua pengiraan di sini berasaskan masa tick, bukan masa kerja tamat.
/// </summary>
public static class JadualKitaran
{
    /// <summary>
    /// Selang menulis semula teks label semasa menunggu. Ini BUKAN kitaran: satu
    /// tick di sini hanya menetapkan teks label supaya waktu yang sudah lepas
    /// bertukar menjadi "sebentar lagi" tanpa perlu menunggu peralihan. Tiada
    /// rangkaian, tiada portal, tiada log masuk.
    /// </summary>
    public const int SelangSegarLabelSaat = 20;

    /// <summary>
    /// Anggaran tick berkala seterusnya: satu selang selepas
    /// <paramref name="asasTick"/> (saat pemasa dimulakan, atau saat tick
    /// terakhir BERMULA). <c>null</c> apabila pemasa mati atau belum pernah
    /// mempunyai titik rujukan.
    /// </summary>
    public static DateTime? TickSeterusnya(bool pemasaHidup, DateTime? asasTick, int selangMinit) =>
        TickSeterusnyaSaat(pemasaHidup, asasTick, selangMinit * 60);

    /// <summary>
    /// Sama seperti <see cref="TickSeterusnya"/>, tetapi dengan selang dalam
    /// SAAT — selang AKTIF pemasa boleh jadi 90 saat (kitaran pintar), bukan
    /// semestinya minit bulat.
    /// </summary>
    public static DateTime? TickSeterusnyaSaat(bool pemasaHidup, DateTime? asasTick, int selangSaat) =>
        pemasaHidup && asasTick is DateTime asas ? asas.AddSeconds(selangSaat) : null;

    /// <summary>
    /// Memilih jadual yang benar-benar akan tiba DAHULU antara tick berkala dan
    /// one-shot kitaran pertama, dan memberitahu yang mana satu. Kitaran pertama
    /// ialah mekanisme LAIN (Task.Delay sekali sahaja), jadi label mesti dapat
    /// menamakannya dan bukan menjanjikan slot pemasa yang datang lewat.
    /// </summary>
    public static (DateTime? Seterusnya, bool Pertama) Pilih(DateTime? tick, DateTime? oneShot)
    {
        if (oneShot is DateTime satu && (tick is not DateTime t || satu <= t))
        {
            return (satu, true);
        }
        return (tick, false);
    }

    /// <summary>
    /// Adakah kitaran akan BENAR-BENAR berjalan? Pemasa yang hidup tidak
    /// mencukupi: tetapan boleh bertukar kepada mati (atau menjadi tidak boleh
    /// dibaca) di luar aplikasi, dan pagar dalam kitaran akan menolak setiap tick
    /// sementara pemasa terus berdenyut. Label mesti mengikut keputusan PAGAR
    /// terakhir, bukan hanya keadaan pemasa.
    ///
    /// <c>null</c> = pagar belum pernah dinilai; anggap pemasa boleh dipercayai
    /// sehingga ia memberitahu sebaliknya.
    /// </summary>
    public static bool KitaranBenarBenarAktif(bool pemasaHidup, bool? gateTerakhirLulus) =>
        pemasaHidup && gateTerakhirLulus != false;
}

/// <summary>
/// Fakta mentah tentang kitaran automatik pada satu ketika. Rekod ini sengaja
/// TIDAK tahu apa-apa tentang WinForms: ia dibina oleh borang dan dibaca oleh
/// <see cref="LabelKitaran"/>, jadi teks yang dilihat pemilik boleh diuji tanpa
/// message-loop.
/// </summary>
/// <param name="Aktif">
/// Pemasa kitaran benar-benar hidup (pemilik telah opt-in — lihat
/// <see cref="KitaranAuto.KenaJalan"/>).
/// </param>
/// <param name="SedangJalan">Satu kitaran sedang dijalankan ketika ini.</param>
/// <param name="Seterusnya">
/// Anggaran waktu tempatan kitaran berikutnya, atau <c>null</c> apabila tiada
/// apa-apa dijadualkan lagi. ANGGARAN: pemasa WinForms berjitter, jadi teks
/// disegarkan pada setiap peralihan DAN mengikut jam semasa menunggu; ia tidak
/// pernah dikira sekali untuk selama-lamanya.
/// </param>
/// <param name="Pertama">
/// Benar apabila <paramref name="Seterusnya"/> ialah kitaran PERTAMA selepas
/// lancar — tundaan sekali sahaja
/// (<see cref="KitaranAuto.TundaanMulaSaat"/> saat), bukan selang biasa.
/// </param>
/// <param name="SebabMati">
/// Sebab kitaran tidak aktif, jika ada sebab yang lebih tepat daripada "pemilik
/// belum menghidupkannya". Tiada rahsia, tiada PII.
/// </param>
/// <param name="SelangSaat">
/// Selang AKTIF pemasa kitaran dalam saat (kitaran pintar: 90 saat atau 10
/// minit). <c>null</c> = selang biasa <see cref="KitaranAuto.SelangBiasaSaat"/>.
/// </param>
public sealed record FaktaKitaran(
    bool Aktif,
    bool SedangJalan = false,
    DateTime? Seterusnya = null,
    bool Pertama = false,
    string? SebabMati = null,
    int? SelangSaat = null);

/// <summary>
/// Teks label "Kitaran" pada bar status — fungsi TULEN.
///
/// Pemilik mengadu dia tidak tahu bila kitaran automatik seterusnya berlaku.
/// Label ini menjawabnya, tetapi ia mesti JUJUR dalam setiap keadaan: mati
/// bermakna mati (dengan galakan menghidupkannya), sedang berjalan bermakna
/// sedang berjalan, dan waktu yang dipaparkan ialah ANGGARAN kerana pemasa
/// WinForms berjitter (bukti log: selang 10 minit bervariasi ±60 saat).
/// </summary>
public static class LabelKitaran
{
    /// <summary>Awalan tetap supaya label senang dicari pada bar status.</summary>
    public const string Awalan = "Kitaran: ";

    /// <summary>Teks apabila pemilik belum menghidupkan apa-apa ciri sebenar.</summary>
    public const string SebabMatiLalai = "hidupkan Log masuk / Hantar automatik";

    /// <summary>
    /// Ringkaskan sebab mati bagi teks paparan label (1.0.21). Di luar waktu aktif diringkaskan
    /// kepada "(luar HH:mm–HH:mm)" supaya muat dalam had lebar label tanpa menolak item lain.
    /// Ayat penuh kekal dalam ToolTipText.
    /// </summary>
    public static string RingkaskanSebab(string sebab)
    {
        if (sebab.StartsWith("di luar waktu aktif (", StringComparison.Ordinal))
        {
            var tutup = sebab.IndexOf(')');
            if (tutup > 21)
            {
                var dlm = sebab.Substring(21, tutup - 21);
                var koma = dlm.IndexOf(',');
                var julat = koma >= 0 ? dlm.Substring(0, koma).Trim() : dlm.Trim();
                return "(luar " + julat + ")";
            }
        }
        if (sebab.StartsWith("waktu aktif tidak sah", StringComparison.Ordinal))
        {
            return "(waktu aktif tidak sah)";
        }
        return "— " + sebab;
    }

    public static string Teks(FaktaKitaran fakta, DateTime kini)
    {
        if (fakta is null) throw new ArgumentNullException(nameof(fakta));

        // Kerja yang SEDANG berjalan didahulukan, walaupun pemilik baru sahaja
        // mematikan togol: kitaran semasa tidak dibatalkan di tengah jalan, jadi
        // berkata "mati" ketika ia masih menulis ke MOEIS adalah tidak benar.
        if (fakta.SedangJalan)
        {
            return fakta.Aktif
                ? Awalan + "sedang berjalan…"
                : Awalan + "sedang berjalan… (tiada kitaran seterusnya dijadualkan)";
        }

        if (!fakta.Aktif)
        {
            var sebab = string.IsNullOrWhiteSpace(fakta.SebabMati) ? SebabMatiLalai : fakta.SebabMati!.Trim();
            var ringkas = RingkaskanSebab(sebab);
            return ringkas.StartsWith("(")
                ? Awalan + "mati " + ringkas
                : Awalan + "mati " + ringkas;
        }

        if (fakta.Seterusnya is not DateTime seterusnya)
        {
            return Awalan + "hidup — belum dijadualkan";
        }

        // Selang yang dipaparkan ialah selang AKTIF pemasa (kitaran pintar), bukan
        // pemalar: label yang berkata "setiap 10 minit" semasa pemasa berdenyut
        // setiap 90 saat menjanjikan jadual yang salah.
        var ekor = fakta.Pertama
            ? $" · kitaran pertama ({KitaranAuto.TundaanMulaSaat}s)"
            : " · " + TeksSelang(fakta.SelangSaat ?? KitaranAuto.SelangBiasaSaat);

        if (seterusnya <= kini)
        {
            return Awalan + "sebentar lagi" + ekor;
        }

        var jam = seterusnya.ToString("HH:mm", CultureInfo.InvariantCulture);
        return Awalan + jam + ekor;
    }

    /// <summary>Format teks penuh (panjang) untuk tip alat (tooltip).</summary>
    public static string TeksPenuh(FaktaKitaran fakta, DateTime kini)
    {
        if (fakta is null) throw new ArgumentNullException(nameof(fakta));

        if (fakta.SedangJalan)
        {
            return fakta.Aktif
                ? Awalan + "sedang berjalan…"
                : Awalan + "sedang berjalan… (tiada kitaran seterusnya dijadualkan)";
        }

        if (!fakta.Aktif)
        {
            var sebab = string.IsNullOrWhiteSpace(fakta.SebabMati) ? SebabMatiLalai : fakta.SebabMati!.Trim();
            return Awalan + "mati — " + sebab;
        }

        if (fakta.Seterusnya is not DateTime seterusnya)
        {
            return Awalan + "hidup — belum dijadualkan";
        }

        var ekor = fakta.Pertama
            ? $" (kitaran pertama, {KitaranAuto.TundaanMulaSaat} saat selepas mula)"
            : " (" + TeksSelang(fakta.SelangSaat ?? KitaranAuto.SelangBiasaSaat) + ")";

        if (seterusnya <= kini)
        {
            return Awalan + "seterusnya sebentar lagi" + ekor;
        }

        var jam = seterusnya.ToString("HH:mm", CultureInfo.InvariantCulture);
        return Awalan + "seterusnya lebih kurang " + jam + ekor;
    }

    /// <summary>
    /// "setiap N minit" untuk minit bulat, selain itu "setiap N saat"
    /// (90 saat tidak dibundarkan kepada "2 minit" atau "1.5 minit").
    /// </summary>
    public static string TeksSelang(int saat) =>
        saat >= 60 && saat % 60 == 0
            ? "setiap " + (saat / 60).ToString(CultureInfo.InvariantCulture) + " minit"
            : "setiap " + saat.ToString(CultureInfo.InvariantCulture) + " saat";
}

/// <summary>
/// Teks label "Backend" pada bar status — fungsi TULEN.
///
/// Ia bercakap tentang KONFIGURASI, bukan sambungan. Klaim dan hantar bercakap
/// terus dengan backend Apps Script memakai rahsia enjin yang dibaca melalui
/// DPAPI; rahsia yang boleh dibaca + apiUrl pada hos yang dibenarkan hanya
/// membuktikan bahawa laluan itu DIKONFIGURASIKAN. Ia tidak membuktikan
/// rangkaian, endpoint, pengesahan, atau bahawa pemilik telah menghidupkan
/// togol automatik — jadi label tidak pernah mendakwa "aktif". Arah sebaliknya
/// memang terbukti: tiada rahsia bermakna tiada klaim dan tiada hantar
/// (gagal-tertutup), dan itu dinyatakan dengan jelas.
///
/// Klien backend dibina SEKALI semasa borang dibina. Konfigurasi yang berubah
/// selepas itu tidak menukar klien yang sedang digunakan, jadi label
/// membandingkan kedua-duanya — termasuk pertukaran kepada nilai LAIN yang tetap
/// sah, melalui <see cref="CapKonfigurasiBackend"/> — dan meminta mula semula,
/// bukan mendakwa sesuatu yang tidak dipegang oleh klien sebenar.
///
/// Tiada rahsia, tiada URL, tiada cap jari dan tiada PII pernah muncul dalam
/// teks ini — sumber sebabnya ialah <see cref="StatusRahsiaEnjin.Sebab"/>, yang
/// memang bebas nilai, dan cap jari hanya dibandingkan, tidak pernah dipaparkan.
/// </summary>
public static class LabelBackend
{
    public const string Awalan = "Backend: ";

    public const string Dikonfigurasikan = Awalan + "sedia (rahsia + apiUrl sah)";

    public const string DikonfigurasikanPenuh = Awalan + "konfigurasi tersedia (rahsia enjin + apiUrl sah)";

    public const string SebabTiadaLalai = "tiada rahsia enjin pada PC ini.";

    /// <param name="klienSedia">
    /// Klien backend yang BENAR-BENAR digunakan oleh klaim/hantar wujud (dibina
    /// semasa lancar).
    /// </param>
    /// <param name="konfigSediaSekarang">Konfigurasi pada cakera SEKARANG boleh dibaca dan sah.</param>
    /// <param name="samaDenganKlien">
    /// Konfigurasi semasa ialah nilai yang SAMA seperti yang dipegang klien
    /// (perbandingan cap jari dalam memori). Hanya bermakna apabila kedua-dua
    /// bendera di atas benar.
    /// </param>
    /// <param name="sebab">Sebab bebas-nilai daripada <see cref="StatusRahsiaEnjin.Sebab"/>.</param>
    public static string Teks(bool klienSedia, bool konfigSediaSekarang, bool samaDenganKlien, string? sebab = null)
    {
        if (klienSedia && konfigSediaSekarang)
        {
            return samaDenganKlien
                ? Dikonfigurasikan
                : Awalan + "konfigurasi bertukar selepas lancar — mulakan semula aplikasi untuk menggunakannya.";
        }

        if (klienSedia)
        {
            return Awalan + "konfigurasi backend hilang selepas lancar — mulakan semula aplikasi untuk mengesahkan.";
        }

        if (konfigSediaSekarang)
        {
            return Awalan + "klaim & hantar MATI — konfigurasi baharu dikesan; mulakan semula aplikasi untuk mengaktifkannya.";
        }

        var kenapa = string.IsNullOrWhiteSpace(sebab) ? SebabTiadaLalai : sebab!.Trim();
        return Awalan + "klaim & hantar MATI — " + kenapa;
    }

    /// <summary>
    /// Teks penuh bagi tip alat (tooltip) label Backend (1.0.21).
    /// </summary>
    public static string TeksPenuh(bool klienSedia, bool konfigSediaSekarang, bool samaDenganKlien, string? sebab = null)
    {
        if (klienSedia && konfigSediaSekarang && samaDenganKlien)
        {
            return DikonfigurasikanPenuh;
        }
        return Teks(klienSedia, konfigSediaSekarang, samaDenganKlien, sebab);
    }
}
