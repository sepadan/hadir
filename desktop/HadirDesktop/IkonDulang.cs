using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;

namespace HadirDesktop;

/// <summary>
/// Ikon 16x16 bagi item menu dulang dan butang <see cref="PanelFungsi"/>,
/// dilukis dalam kod (tiada fail imej dalam repo, tiada fail ikon luar dibaca).
///
/// Setiap ikon: petak bucu bulat berwarna (padding 1px) dengan glif putih di
/// atasnya. Warna isian sederhana gelap + tepi lebih gelap, jadi ikon kelihatan
/// pada menu bertema terang DAN gelap. Antialiasing dihidupkan.
///
/// Ikon dicache: satu Bitmap bagi setiap fungsi untuk sepanjang hayat proses.
/// Bitmap itu dikongsi — pemanggil TIDAK boleh melupuskannya.
/// </summary>
public static class IkonDulang
{
    public const int Saiz = 16;

    private static readonly object Kunci = new();
    private static readonly Dictionary<FungsiDulang, Bitmap> Cache = new();

    public static Image Tunjuk() => Untuk(FungsiDulang.Tunjuk);
    public static Image SemuaFungsi() => Untuk(FungsiDulang.SemuaFungsi);
    public static Image TetapanTempatan() => Untuk(FungsiDulang.TetapanTempatan);
    public static Image AkaunIdMe() => Untuk(FungsiDulang.AkaunIdMe);
    public static Image Autostart() => Untuk(FungsiDulang.Autostart);
    public static Image LoginIdMe() => Untuk(FungsiDulang.LoginIdMe);
    public static Image CubaLagi() => Untuk(FungsiDulang.CubaLagi);
    public static Image HantarAuto() => Untuk(FungsiDulang.HantarAuto);
    public static Image SemakKemasKini() => Untuk(FungsiDulang.SemakKemasKini);
    public static Image Keluar() => Untuk(FungsiDulang.Keluar);

    /// <summary>Ikon tercache bagi <paramref name="fungsi"/> (dilukis sekali sahaja).</summary>
    public static Image Untuk(FungsiDulang fungsi)
    {
        lock (Kunci)
        {
            if (!Cache.TryGetValue(fungsi, out var bmp))
            {
                bmp = Lukis(fungsi);
                Cache[fungsi] = bmp;
            }
            return bmp;
        }
    }

    /// <summary>
    /// Lukis ikon BAHARU (tidak dicache) — pemanggil memiliki Bitmap ini.
    /// Untuk ujian; kod aplikasi memakai <see cref="Untuk"/>.
    /// </summary>
    public static Bitmap Lukis(FungsiDulang fungsi)
    {
        var bmp = new Bitmap(Saiz, Saiz);
        using var g = Graphics.FromImage(bmp);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.PixelOffsetMode = PixelOffsetMode.HighQuality;
        g.Clear(Color.Transparent);

        var isian = WarnaIsian(fungsi);
        // Tepi 1px dilukis di tengah garis laluan: petak 1.5..14.5 memberi piksel
        // 1..15, iaitu padding tepat 1px pada setiap sisi.
        using (var latar = PetakBulat(new RectangleF(1.5f, 1.5f, Saiz - 3, Saiz - 3), 3f))
        using (var berus = new SolidBrush(isian))
        using (var tepi = new Pen(Gelapkan(isian, 0.6f), 1f))
        {
            g.FillPath(berus, latar);
            g.DrawPath(tepi, latar);
        }

        using var pena = new Pen(Color.White, 1.6f) { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round };
        using var putih = new SolidBrush(Color.White);
        LukisGlif(g, fungsi, pena, putih);
        return bmp;
    }

    private static Color WarnaIsian(FungsiDulang fungsi) => fungsi switch
    {
        FungsiDulang.Tunjuk => Color.FromArgb(30, 111, 217),          // biru
        FungsiDulang.SemuaFungsi => Color.FromArgb(123, 63, 191),     // ungu
        FungsiDulang.TetapanTempatan => Color.FromArgb(84, 101, 120), // kelabu batu
        FungsiDulang.AkaunIdMe => Color.FromArgb(0, 137, 123),        // hijau kebiruan
        FungsiDulang.Autostart => Color.FromArgb(46, 125, 50),        // hijau
        FungsiDulang.LoginIdMe => Color.FromArgb(57, 73, 171),        // nila
        FungsiDulang.CubaLagi => Color.FromArgb(230, 108, 0),         // jingga
        FungsiDulang.HantarAuto => Color.FromArgb(2, 119, 189),       // biru laut
        FungsiDulang.SemakKemasKini => Color.FromArgb(176, 128, 0),   // emas gelap
        FungsiDulang.Keluar => Color.FromArgb(198, 40, 40),           // merah
        _ => Color.FromArgb(96, 96, 96),
    };

    private static void LukisGlif(Graphics g, FungsiDulang fungsi, Pen pena, Brush putih)
    {
        switch (fungsi)
        {
            case FungsiDulang.Tunjuk:
                // Tetingkap: bingkai + bar tajuk.
                g.DrawRectangle(pena, 4f, 4.5f, 8f, 7f);
                g.FillRectangle(putih, 4f, 4.5f, 8f, 2f);
                break;

            case FungsiDulang.SemuaFungsi:
                // Grid 2x2: "semua butang".
                g.FillRectangle(putih, 4f, 4f, 3.2f, 3.2f);
                g.FillRectangle(putih, 8.8f, 4f, 3.2f, 3.2f);
                g.FillRectangle(putih, 4f, 8.8f, 3.2f, 3.2f);
                g.FillRectangle(putih, 8.8f, 8.8f, 3.2f, 3.2f);
                break;

            case FungsiDulang.TetapanTempatan:
                // Gelangsar tetapan: tiga garis dengan tombol.
                g.DrawLine(pena, 4f, 5f, 12f, 5f);
                g.DrawLine(pena, 4f, 8f, 12f, 8f);
                g.DrawLine(pena, 4f, 11f, 12f, 11f);
                g.FillEllipse(putih, 8.5f, 3.5f, 3f, 3f);
                g.FillEllipse(putih, 4.5f, 6.5f, 3f, 3f);
                g.FillEllipse(putih, 7f, 9.5f, 3f, 3f);
                break;

            case FungsiDulang.AkaunIdMe:
                // Orang: kepala + bahu.
                g.FillEllipse(putih, 6f, 3.5f, 4f, 4f);
                using (var bahu = new GraphicsPath())
                {
                    bahu.AddArc(4f, 8.5f, 8f, 7f, 180f, 180f);
                    bahu.CloseFigure();
                    g.FillPath(putih, bahu);
                }
                break;

            case FungsiDulang.Autostart:
                // Simbol kuasa: lengkok terbuka di atas + garis tegak.
                g.DrawArc(pena, 4f, 4.5f, 8f, 8f, -50f, 280f);
                g.DrawLine(pena, 8f, 3.5f, 8f, 8f);
                break;

            case FungsiDulang.LoginIdMe:
                // Anak panah masuk ke pintu.
                g.DrawLine(pena, 3.5f, 8f, 9f, 8f);
                g.DrawLine(pena, 6.5f, 5.5f, 9f, 8f);
                g.DrawLine(pena, 6.5f, 10.5f, 9f, 8f);
                g.DrawLines(pena, new[] { new PointF(9.5f, 4f), new PointF(12f, 4f), new PointF(12f, 12f), new PointF(9.5f, 12f) });
                break;

            case FungsiDulang.CubaLagi:
                // Anak panah bulat (cuba semula).
                g.DrawArc(pena, 4f, 4f, 8f, 8f, 20f, 290f);
                g.FillPolygon(putih, new[] { new PointF(12.8f, 3.6f), new PointF(13f, 8f), new PointF(9f, 6.4f) });
                break;

            case FungsiDulang.HantarAuto:
                // Kapal terbang kertas (hantar).
                g.FillPolygon(putih, new[] { new PointF(3.5f, 7.5f), new PointF(12.5f, 4f), new PointF(9.5f, 12.5f), new PointF(7.8f, 9f) });
                break;

            case FungsiDulang.SemakKemasKini:
                // Anak panah ke bawah ke dalam dulang (muat turun).
                g.DrawLine(pena, 8f, 3.5f, 8f, 9.5f);
                g.DrawLine(pena, 5.5f, 7f, 8f, 9.5f);
                g.DrawLine(pena, 10.5f, 7f, 8f, 9.5f);
                g.DrawLines(pena, new[] { new PointF(4f, 10.5f), new PointF(4f, 12f), new PointF(12f, 12f), new PointF(12f, 10.5f) });
                break;

            case FungsiDulang.Keluar:
                // Pangkah.
                g.DrawLine(pena, 5f, 5f, 11f, 11f);
                g.DrawLine(pena, 11f, 5f, 5f, 11f);
                break;
        }
    }

    private static GraphicsPath PetakBulat(RectangleF r, float jejari)
    {
        var d = jejari * 2;
        var laluan = new GraphicsPath();
        laluan.AddArc(r.Left, r.Top, d, d, 180f, 90f);
        laluan.AddArc(r.Right - d, r.Top, d, d, 270f, 90f);
        laluan.AddArc(r.Right - d, r.Bottom - d, d, d, 0f, 90f);
        laluan.AddArc(r.Left, r.Bottom - d, d, d, 90f, 90f);
        laluan.CloseFigure();
        return laluan;
    }

    private static Color Gelapkan(Color c, float faktor) =>
        Color.FromArgb(c.A, (int)(c.R * faktor), (int)(c.G * faktor), (int)(c.B * faktor));
}
