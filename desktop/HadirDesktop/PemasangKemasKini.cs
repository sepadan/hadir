using System.Diagnostics;
using System.IO;

namespace HadirDesktop;

/// <summary>
/// Satu-satunya tempat HADIR Desktop melancarkan proses untuk memasang kemas
/// kini. Fail ini sengaja KECIL dan tiada logik keputusan: ia memanggil
/// <c>powershell.exe</c> tanpa shell (<c>UseShellExecute = false</c>) dengan
/// hujah yang dibina sepenuhnya oleh <see cref="PerintahKemasKini"/> — skrip
/// <c>update.ps1</c> DI DALAM folder pemasangan dan fail exe yang sudah
/// disahkan cincangnya.
///
/// Ia tidak pernah menyentuh pelayar, skema luaran, atau rahsia: tiada nama
/// proses yang datang daripada rangkaian, dan tiada hujah yang datang daripada
/// manifest kemas kini selain laluan fail tempatan.
/// </summary>
public static class PemasangKemasKini
{
    /// <summary>
    /// Mulakan pemasangan. Mengembalikan <c>false</c> (tanpa melontar) apabila
    /// skrip pemasangan tiada atau proses tidak dapat dimulakan.
    /// </summary>
    public static bool Jalankan(string folderPasang, string failExeBaharu)
    {
        var skrip = PerintahKemasKini.LaluanSkrip(folderPasang);
        if (!File.Exists(skrip)) return false;
        if (!File.Exists(failExeBaharu)) return false;

        try
        {
            var psi = new ProcessStartInfo("powershell.exe")
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                WorkingDirectory = folderPasang,
            };
            foreach (var hujah in PerintahKemasKini.Hujah(folderPasang, failExeBaharu))
            {
                psi.ArgumentList.Add(hujah);
            }

            Process.Start(psi);
            return true;
        }
        catch
        {
            return false;
        }
    }
}
