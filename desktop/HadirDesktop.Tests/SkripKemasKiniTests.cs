using System;
using System.IO;
using System.Linq;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// Pemeriksaan TEKS ke atas update.ps1 + hentikan-hadir.ps1 (gaya sama seperti
/// <see cref="SkripPemasangTests"/>: skrip itu melakukan kerja sebenar, jadi ia
/// tidak dijalankan di sini). Yang dikunci ialah tiga janji keselamatan:
/// hentikan aplikasi dahulu, sandar + sahkan SHA256, dan JANGAN sentuh fail data
/// pengguna — kemas kini hanya menulis HadirDesktop.exe.
/// </summary>
public class SkripKemasKiniTests
{
    /// <summary>Nama fail/folder data pengguna yang tidak boleh muncul dalam arahan skrip.</summary>
    private static readonly string[] NamaDataPengguna =
    {
        "idme-login.json",
        "id-pemilik.json",
        "penolakan-kredensial.json",
        "real-portal-evidence",
        "webview2",
        "HADIR-MOEIS-Companion",
        "kredensial.dat",
        "rahsia.dat",
        "tetapan.json",
        "migrasi-companion.json",
        "companion-autostart-sandaran.json",
        "had-login.json",
        "id-enjin.json",
        "profil-pelayar",
    };

    private static string DesktopDir()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null && !File.Exists(Path.Combine(dir.FullName, "publish.ps1")))
        {
            dir = dir.Parent;
        }
        return dir?.FullName ?? throw new InvalidOperationException("Tidak jumpa direktori desktop (publish.ps1).");
    }

    private static string BacaSkrip(string nama) => File.ReadAllText(Path.Combine(DesktopDir(), nama));

    /// <summary>
    /// Baris ARAHAN sahaja — komen dibuang. Komen kepala update.ps1 menamakan
    /// fail data pengguna dengan sengaja (untuk menerangkan apa yang TIDAK
    /// disentuh), jadi pemeriksaan "jangan sebut" mesti melihat arahan sahaja.
    /// </summary>
    private static string BarisArahan(string skrip) =>
        string.Join("\n", skrip
            .Replace("\r\n", "\n")
            .Split('\n')
            .Where(b => !b.TrimStart().StartsWith("#", StringComparison.Ordinal)));

    // --- update.ps1 ---

    [Fact]
    public void UpdatePs1_Wujud_DanMenyasarPemasanganLocalAppData()
    {
        var s = BacaSkrip("update.ps1");
        Assert.Contains("LOCALAPPDATA", s);
        Assert.Contains(@"dist\win-x64\HadirDesktop.exe", s);
        Assert.Contains("HadirDesktop.exe", s);
    }

    [Fact]
    public void UpdatePs1_HentikanAplikasiSebelumSalin()
    {
        var s = BacaSkrip("update.ps1");
        Assert.Contains("hentikan-hadir.ps1", s);
        Assert.Contains("Stop-HadirDesktop", s);

        // Henti mesti berlaku SEBELUM salinan, bukan selepas.
        Assert.True(s.IndexOf("Stop-HadirDesktop", StringComparison.Ordinal)
            < s.IndexOf("Copy-Item", StringComparison.Ordinal));
    }

    [Fact]
    public void UpdatePs1_MembacaVersiSebelumDanSelepas()
    {
        var s = BacaSkrip("update.ps1");
        Assert.Contains("--versi", s);
        Assert.Contains("Get-VersiExe", s);
        Assert.Contains("$versiSebelum", s);
        Assert.Contains("$versiSelepas", s);
    }

    [Fact]
    public void UpdatePs1_MenyandarExeLamaDenganNamaBerversi()
    {
        var s = BacaSkrip("update.ps1");
        Assert.Contains(".bak-", s);
        Assert.Contains("$backupExe", s);

        // Sandaran mesti dibuat SEBELUM exe baharu disalin masuk.
        var idxSandar = s.IndexOf("$backupExe", StringComparison.Ordinal);
        var idxSalin = s.IndexOf("Copy-Item -Path $src", StringComparison.Ordinal);
        Assert.True(idxSandar >= 0 && idxSalin >= 0 && idxSandar < idxSalin);
    }

    [Fact]
    public void UpdatePs1_MengesahkanSha256_DanPulihkanSandaranBilaGagal()
    {
        var s = BacaSkrip("update.ps1");
        Assert.Contains("Get-FileHash", s);
        Assert.Contains("SHA256", s);

        // Cabang gagal: pulihkan daripada sandaran dan keluar bukan-sifar.
        Assert.Contains("Copy-Item -Path $backupExe -Destination $targetExe", s);
        Assert.Contains("exit 2", s);
    }

    [Fact]
    public void UpdatePs1_LaporSebelumKeSelepas_DanBinaanTidakBerubah()
    {
        var s = BacaSkrip("update.ps1");
        Assert.Contains("$versiSebelum -> $versiSelepas", s);
        Assert.Contains("TIDAK berubah", s);
    }

    [Fact]
    public void UpdatePs1_LancarSemulaHanyaJikaTadinyaBerjalan()
    {
        var s = BacaSkrip("update.ps1");
        Assert.Contains("$sedangBerjalan", s);
        Assert.Contains("if ($sedangBerjalan)", s);
        Assert.Contains("Start-Process -FilePath $targetExe", s);
    }

    [Fact]
    public void UpdatePs1_MenungguExeBolehDitulis_SebelumMenyalin()
    {
        var arahan = BarisArahan(BacaSkrip("update.ps1"));
        Assert.Contains("Wait-ExeBolehTulis", arahan);

        // Membaca versi MENJALANKAN exe itu; kunci imej dilepaskan lewat sedikit.
        // Pagar tunggu mesti berada antara bacaan versi dan salinan pertama.
        var idxVersi = arahan.IndexOf("Get-VersiExe", StringComparison.Ordinal);
        var idxTunggu = arahan.IndexOf("Wait-ExeBolehTulis", StringComparison.Ordinal);
        var idxSalin = arahan.IndexOf("Copy-Item", StringComparison.Ordinal);
        Assert.True(idxVersi < idxTunggu && idxTunggu < idxSalin,
            "Pagar Wait-ExeBolehTulis mesti selepas Get-VersiExe dan sebelum Copy-Item.");
    }

    /// <summary>
    /// Windows PowerShell 5.1 membaca .ps1 tanpa BOM sebagai ANSI. Bait ketiga
    /// sengkang panjang (—) menjadi petikan pintar dalam CP1252, yang MENAMATKAN
    /// rentetan berpetikan dua dan memecahkan skrip. BOM UTF-8 ialah satu-satunya
    /// perkara yang menghalangnya — jangan buang.
    /// </summary>
    [Theory]
    [InlineData("update.ps1")]
    [InlineData("setup.ps1")]
    [InlineData("hentikan-hadir.ps1")]
    public void Skrip_AdaBomUtf8(string nama)
    {
        var bait = File.ReadAllBytes(Path.Combine(DesktopDir(), nama));

        Assert.True(bait.Length >= 3, $"{nama} kosong?");
        Assert.True(bait[0] == 0xEF && bait[1] == 0xBB && bait[2] == 0xBF,
            $"{nama} kehilangan BOM UTF-8 — Windows PowerShell 5.1 akan salah baca aksara bukan-ASCII.");
    }

    [Fact]
    public void UpdatePs1_TiadaPadamRekursif()
    {
        var s = BacaSkrip("update.ps1");
        Assert.DoesNotContain("-Recurse", s);
        Assert.DoesNotContain("Remove-Item", s);
    }

    [Fact]
    public void UpdatePs1_ArahanTidakMenyebutFailDataPengguna()
    {
        var arahan = BarisArahan(BacaSkrip("update.ps1"));
        foreach (var nama in NamaDataPengguna)
        {
            Assert.DoesNotContain(nama, arahan, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public void UpdatePs1_SetiapCopyItemMenyasarExeSahaja()
    {
        var baris = BarisArahan(BacaSkrip("update.ps1"))
            .Split('\n')
            .Where(b => b.Contains("Copy-Item", StringComparison.Ordinal))
            .ToArray();

        Assert.NotEmpty(baris);
        foreach (var b in baris)
        {
            Assert.Contains("$targetExe", b);
            Assert.True(
                b.Contains("$src", StringComparison.Ordinal) || b.Contains("$backupExe", StringComparison.Ordinal),
                $"Copy-Item menyasar sesuatu selain exe/sandaran: {b}");
        }
    }

    // --- hentikan-hadir.ps1 (logik kongsi setup.ps1 + update.ps1) ---

    [Fact]
    public void HentikanHadir_TutupSopanDahulu_BaruPaksa()
    {
        var s = BacaSkrip("hentikan-hadir.ps1");
        Assert.Contains("CloseMainWindow", s);
        Assert.Contains("Stop-Process", s);
        Assert.Contains("HadMasaSaat", s);

        // Sopan dahulu: dalam ARAHAN (bukan komen), CloseMainWindow mesti
        // muncul sebelum Stop-Process.
        var arahan = BarisArahan(s);
        Assert.True(arahan.IndexOf("CloseMainWindow", StringComparison.Ordinal)
            < arahan.IndexOf("Stop-Process", StringComparison.Ordinal));
    }

    [Fact]
    public void HentikanHadir_MenungguExeBolehDitulis()
    {
        var s = BacaSkrip("hentikan-hadir.ps1");
        Assert.Contains("Test-ExeBolehTulis", s);
        Assert.Contains("terkunci", s);
    }

    [Fact]
    public void HentikanHadir_HanyaProsesDariLaluanPemasangan()
    {
        var s = BacaSkrip("hentikan-hadir.ps1");
        Assert.Contains("Get-Process -Name \"HadirDesktop\"", s);
        Assert.Contains("$p.Path -eq $ExePath", s);
    }

    [Fact]
    public void HentikanHadir_TiadaPadamRekursif_DanTiadaFailDataPengguna()
    {
        var s = BacaSkrip("hentikan-hadir.ps1");
        Assert.DoesNotContain("-Recurse", s);

        var arahan = BarisArahan(s);
        foreach (var nama in NamaDataPengguna)
        {
            Assert.DoesNotContain(nama, arahan, StringComparison.OrdinalIgnoreCase);
        }
    }

    // --- setup.ps1 guna logik henti yang SAMA ---

    [Fact]
    public void SetupPs1_GunaLogikHentiYangSama_DanCetakVersi()
    {
        var s = BacaSkrip("setup.ps1");
        Assert.Contains("hentikan-hadir.ps1", s);
        Assert.Contains("Stop-HadirDesktop", s);
        Assert.Contains("Get-VersiExe", s);
        Assert.Contains("Versi dipasang", s);

        // Henti sebelum salin, sama seperti update.ps1.
        Assert.True(s.IndexOf("Stop-HadirDesktop", StringComparison.Ordinal)
            < s.IndexOf("Copy-Item", StringComparison.Ordinal));
    }

    [Fact]
    public void SetupPs1_TiadaPadamRekursif()
    {
        var s = BacaSkrip("setup.ps1");
        Assert.DoesNotContain("-Recurse", s);
    }

    // --- dokumentasi ---

    [Fact]
    public void Kemaskini_MdMenerangkanRollbackDanDataYangKekal()
    {
        var s = BacaSkrip("KEMASKINI.md");
        Assert.Contains("update.ps1", s);
        Assert.Contains("publish.ps1", s);
        Assert.Contains("HadirDesktop.exe.bak-", s);
        Assert.Contains("profil-pelayar", s);
        Assert.Contains("JANGAN PADAM", s);
        Assert.Contains("webview2-dev-", s);
        Assert.Contains("--versi", s);
    }
}
