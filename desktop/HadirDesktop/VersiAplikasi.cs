using System;
using System.Globalization;
using System.IO;
using System.Reflection;

namespace HadirDesktop;

/// <summary>
/// SATU sumber kebenaran untuk versi binaan. Nombor versi hidup dalam
/// <c>HadirDesktop.csproj</c> (<c>&lt;Version&gt;</c> +
/// <c>&lt;InformationalVersion&gt;</c>) dan dibaca semula di sini daripada
/// assembly — tiada salinan nombor versi dalam kod, tajuk tetingkap, dulang
/// atau skrip.
///
/// Keutamaan bacaan: <see cref="AssemblyInformationalVersionAttribute"/>
/// (kemas, itulah yang ditulis oleh <c>&lt;InformationalVersion&gt;</c>),
/// jatuh balik ke <see cref="AssemblyName.Version"/>. Akhiran <c>+hash</c>
/// yang ditambah oleh SourceLink dibuang supaya yang dipapar/dicetak sentiasa
/// nombor versi sahaja.
/// </summary>
public static class VersiAplikasi
{
    /// <summary>Bendera CLI: cetak versi ke stdout dan keluar (tiada tetingkap, tiada WebView2).</summary>
    public const string BenderaCli = "--versi";

    /// <summary>Fail log aplikasi dalam <c>%LOCALAPPDATA%\HadirDesktop\</c> (satu baris versi setiap lancaran).</summary>
    public const string NamaFailLog = "hadir-desktop.log";

    private const string VersiTidakDiketahui = "0.0.0";

    /// <summary>Versi binaan yang sedang berjalan, cth <c>1.0.0</c>.</summary>
    public static string Versi { get; } = DariAssembly(typeof(VersiAplikasi).Assembly);

    /// <summary>Bacaan TULEN daripada mana-mana assembly (boleh diuji).</summary>
    public static string DariAssembly(Assembly assembly)
    {
        var info = Bersihkan(assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion);
        if (!string.IsNullOrWhiteSpace(info)) return info;

        var nama = assembly.GetName().Version?.ToString();
        return string.IsNullOrWhiteSpace(nama) ? VersiTidakDiketahui : nama;
    }

    /// <summary>
    /// Buang akhiran <c>+hash</c> (cth <c>1.0.0+abc123</c> → <c>1.0.0</c>) dan
    /// ruang kosong. Null/kosong kekal kosong supaya pemanggil boleh jatuh balik.
    /// </summary>
    public static string Bersihkan(string? mentah)
    {
        if (string.IsNullOrWhiteSpace(mentah)) return string.Empty;

        var teks = mentah.Trim();
        var plus = teks.IndexOf('+');
        if (plus >= 0) teks = teks[..plus];
        return teks.Trim();
    }

    /// <summary>
    /// Keputusan TULEN: adakah argumen baris arahan meminta cetakan versi?
    /// Tidak peka huruf besar/kecil; argumen lain diabaikan.
    /// </summary>
    public static bool DimintaDariArgumen(string[]? args)
    {
        if (args is null) return false;
        foreach (var arg in args)
        {
            if (string.Equals(arg?.Trim(), BenderaCli, StringComparison.OrdinalIgnoreCase)) return true;
        }
        return false;
    }

    /// <summary>Satu baris log versi (TULEN) — masa ISO + versi, tiada data pengguna.</summary>
    public static string BarisLog(DateTimeOffset masa, string versi) =>
        masa.ToString("yyyy-MM-ddTHH:mm:sszzz", CultureInfo.InvariantCulture) +
        " versi=" + (string.IsNullOrWhiteSpace(versi) ? "-" : versi.Trim());

    /// <summary>Laluan fail log aplikasi dalam folder pemasangan/data tempatan.</summary>
    public static string LaluanLog(string? folderAsas = null) =>
        Path.Combine(
            folderAsas ?? Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            DevAutoKitaran.NamaFolder,
            NamaFailLog);
}
