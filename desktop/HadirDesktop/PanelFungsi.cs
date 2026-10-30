using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;

namespace HadirDesktop;

/// <summary>
/// Panel "Semua fungsi" — setiap fungsi menu dulang sebagai butang sebenar,
/// berkelompok (<see cref="PanelFungsiBina.Senarai"/>). Tetingkap NON-MODAL.
///
/// Panel ini tidak membuat keputusan sendiri dan tidak membaca/menulis tetapan:
/// setiap butang memanggil callback yang diberi (laluan yang sama seperti klik
/// item dulang), dan togol dibaca/ditulis melalui dulang. Tiada medan rahsia
/// atau kredensial di sini. Menutup panel hanya menyembunyikannya.
///
/// Susun atur minimalis (1.0.25): satu lajur butang sama lebar, tajuk
/// kelompok sebagai label kecil kelabu, penerangan dalam ToolTip, dan satu
/// baris status di bawah.
/// </summary>
public sealed class PanelFungsi : Form
{
    /// <summary>Tinggi minimum butang; fon besar (DPI tinggi) menaikkannya.</summary>
    private const int TinggiButangMin = 30;
    /// <summary>
    /// Ruang dalam butang selain teks: ikon 16px, jarak ikon–teks, Padding
    /// kiri butang, dan sempadan/tepi visual. Sengaja longgar — teks yang
    /// terpotong lebih buruk daripada beberapa piksel ruang kosong.
    /// </summary>
    internal const int RuangDalamButang = IkonDulang.Saiz + 32;
    /// <summary>
    /// Ruang bar tajuk selain teks tajuk pada 100%: tiga butang kapsyen
    /// (~46px setiap satu), ikon tetingkap dan jarak. Diskala mengikut fon.
    /// </summary>
    internal const int RuangKapsyen = 3 * 46 + 40;
    private static readonly Padding PaddingAkar = new(16, 10, 16, 12);
    /// <summary>Jarak menegak seragam antara butang.</summary>
    private static readonly Padding MarginButang = new(0, 0, 0, 4);

    /// <summary>Lebar setiap butang dan baris status (lihat <see cref="KiraLebarKandungan"/>).</summary>
    private readonly int _lebarButang;
    private readonly int _tinggiButang;

    private readonly Action<FungsiDulang> _laksana;
    private readonly Func<FungsiDulang, bool?> _bacaTogol;
    private readonly Action<FungsiDulang, bool> _tetapkanTogol;
    private readonly Func<string> _bacaStatus;
    private readonly Dictionary<FungsiDulang, ButtonBase> _butang = new();
    private readonly Dictionary<FungsiDulang, string> _teksPenerangan = new();
    private readonly ToolTip _petua = new();
    private readonly Label _status;
    /// <summary>Benar semasa <see cref="Segarkan"/> menulis Checked — bukan klik pemilik.</summary>
    private bool _menyegar;

    /// <param name="laksana">Fungsi perintah (sama seperti klik item dulang).</param>
    /// <param name="bacaTogol">Keadaan togol seperti dipapar dulang; <c>null</c> = tidak tersedia.</param>
    /// <param name="tetapkanTogol">Tulis togol melalui dulang (satu-satunya laluan tulis).</param>
    /// <param name="bacaStatus">Teks baris status dulang (keadaan portal).</param>
    /// <param name="fon">Fon tetingkap; <c>null</c> = fon lalai. Ujian DPI memberi fon berskala.</param>
    public PanelFungsi(
        Action<FungsiDulang> laksana,
        Func<FungsiDulang, bool?> bacaTogol,
        Action<FungsiDulang, bool> tetapkanTogol,
        Func<string> bacaStatus,
        Font? fon = null)
    {
        _laksana = laksana;
        _bacaTogol = bacaTogol;
        _tetapkanTogol = tetapkanTogol;
        _bacaStatus = bacaStatus;
        if (fon != null) Font = fon;

        Text = DemoLabel.PanelFungsiTajuk;
        FormBorderStyle = FormBorderStyle.FixedSingle;
        StartPosition = FormStartPosition.CenterScreen;
        MaximizeBox = false;
        ShowInTaskbar = true;
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;

        // Saiz diukur daripada teks SEBENAR dengan fon tetingkap, jadi ia kekal
        // betul pada DPI/fon lain: tiada label butang terpotong, semua butang
        // sama lebar dan sama tinggi.
        var senarai = PanelFungsiBina.Senarai();
        _lebarButang = KiraLebarKandungan(Font, senarai);
        _tinggiButang = KiraTinggiButang(Font);

        Akar = new TableLayoutPanel
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            ColumnCount = 1,
            Padding = PaddingAkar,
            Location = new Point(0, 0),
        };

        var pertama = true;
        foreach (var kelompok in senarai)
        {
            Akar.Controls.Add(BinaTajuk(kelompok.Tajuk, pertama));
            foreach (var item in kelompok.Item) Akar.Controls.Add(BinaButang(item));
            pertama = false;
        }

        // Satu baris sahaja: teks panjang dipotong dengan "…" dan teks penuh
        // ada dalam ToolTip, jadi tinggi panel tidak melompat apabila status berubah.
        _status = new Label
        {
            AutoSize = false,
            AutoEllipsis = true,
            Size = new Size(_lebarButang, Font.Height + 4),
            TextAlign = ContentAlignment.MiddleLeft,
            ForeColor = Color.DimGray,
            Margin = new Padding(0, 8, 0, 6),
        };
        Akar.Controls.Add(_status);

        var tutup = new Button
        {
            Text = DemoLabel.PanelFungsiTutup,
            AutoSize = true,
            Anchor = AnchorStyles.Right,
            Margin = Padding.Empty,
        };
        tutup.Click += (_, _) => Hide();
        CancelButton = tutup;
        Akar.Controls.Add(tutup);

        Controls.Add(Akar);
        Segarkan();
    }

    /// <summary>Butang bagi setiap fungsi — untuk ujian sahaja.</summary>
    internal IReadOnlyDictionary<FungsiDulang, ButtonBase> Butang => _butang;

    /// <summary>Baris status baca-sahaja — untuk ujian sahaja.</summary>
    internal Label LabelStatus => _status;

    /// <summary>Grid satu lajur yang memegang semua kawalan — untuk ujian sahaja.</summary>
    internal TableLayoutPanel Akar { get; }

    /// <summary>ToolTip penerangan butang dan teks status penuh — untuk ujian sahaja.</summary>
    internal ToolTip Petua => _petua;

    /// <summary>
    /// Lebar butang yang memuatkan label TERPANJANG (diukur dengan
    /// <see cref="TextRenderer"/>, enjin yang sama dipakai butang untuk melukis
    /// teks) ditambah ikon dan ruang dalam butang.
    /// </summary>
    internal static int KiraLebarButang(Font fon, IEnumerable<KelompokFungsi> senarai) =>
        senarai.SelectMany(k => k.Item)
            .Max(i => TextRenderer.MeasureText(i.Label, fon, Size.Empty, TextFormatFlags.SingleLine).Width)
        + RuangDalamButang;

    /// <summary>
    /// Lebar lajur: label butang terpanjang, atau cukup untuk tajuk tetingkap
    /// tidak terpotong — panel satu lajur cukup sempit sehingga bar tajuk
    /// menjadi kekangan yang lebih ketat.
    /// </summary>
    internal static int KiraLebarKandungan(Font fon, IEnumerable<KelompokFungsi> senarai) =>
        Math.Max(
            KiraLebarButang(fon, senarai),
            TextRenderer.MeasureText(DemoLabel.PanelFungsiTajuk, fon).Width
                + (int)Math.Ceiling(RuangKapsyen * fon.Size / 9f)
                - PaddingAkar.Horizontal);

    /// <summary>Tinggi seragam butang: satu baris teks fon ini dengan ruang selesa.</summary>
    internal static int KiraTinggiButang(Font fon) =>
        Math.Max(TinggiButangMin, TextRenderer.MeasureText("Ag", fon).Height + 12);

    /// <summary>
    /// Baca semula keadaan togol dan baris status daripada dulang. Tidak
    /// menulis apa-apa: Checked diset dengan <see cref="_menyegar"/> dihidupkan.
    /// </summary>
    public void Segarkan()
    {
        var status = _bacaStatus();
        _status.Text = status;
        _petua.SetToolTip(_status, status);

        _menyegar = true;
        try
        {
            foreach (var (fungsi, butang) in _butang)
            {
                if (butang is not CheckBox kotak) continue;
                var keadaan = _bacaTogol(fungsi);
                kotak.Enabled = keadaan.HasValue;
                kotak.Checked = keadaan ?? false;
                TetapkanPenerangan(butang, _teksPenerangan[fungsi] + " " + TeksKeadaan(keadaan));
            }
        }
        finally
        {
            _menyegar = false;
        }
    }

    private static string TeksKeadaan(bool? keadaan) => keadaan switch
    {
        true => "Kini: HIDUP.",
        false => "Kini: MATI.",
        null => "Tidak tersedia.",
    };

    protected override void Dispose(bool disposing)
    {
        // Ikon butang ialah salinan milik panel ini (IkonDulang.Untuk): butang
        // dilupuskan dahulu (base), kemudian imejnya.
        var ikon = disposing
            ? _butang.Values.Select(b => b.Image).OfType<Image>().ToList()
            : new List<Image>();
        if (disposing) _petua.Dispose();
        base.Dispose(disposing);
        foreach (var imej in ikon) imej.Dispose();
    }

    protected override void OnActivated(EventArgs e)
    {
        base.OnActivated(e);
        // Togol mungkin diubah dari menu dulang semasa panel tersembunyi.
        Segarkan();
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        // Butang X = sembunyi; instance kekal untuk dibuka semula dengan cepat.
        // Penutupan lain (aplikasi keluar, Windows log keluar) dibenarkan.
        if (e.CloseReason == CloseReason.UserClosing)
        {
            e.Cancel = true;
            Hide();
            return;
        }
        base.OnFormClosing(e);
    }

    /// <summary>Tajuk kelompok: label kecil kelabu, bukan kotak.</summary>
    private static Label BinaTajuk(string tajuk, bool pertama) => new()
    {
        Text = tajuk,
        AutoSize = true,
        ForeColor = Color.DimGray,
        Margin = new Padding(0, pertama ? 0 : 8, 0, 3),
    };

    /// <summary>Penerangan dalam ToolTip dan untuk pembaca skrin — bukan lajur teks.</summary>
    private void TetapkanPenerangan(ButtonBase butang, string teks)
    {
        _petua.SetToolTip(butang, teks);
        butang.AccessibleDescription = teks;
    }

    private ButtonBase BinaButang(ItemFungsi item)
    {
        ButtonBase butang;
        if (item.Jenis == JenisFungsi.Togol)
        {
            var kotak = new CheckBox { Appearance = Appearance.Button };
            kotak.CheckedChanged += (_, _) =>
            {
                if (_menyegar) return;
                _tetapkanTogol(item.Fungsi, kotak.Checked);
                Segarkan();
            };
            butang = kotak;
        }
        else
        {
            var biasa = new Button();
            if (item.Jenis == JenisFungsi.PanelIni)
            {
                // Item dulang yang membuka panel ini: dipapar supaya senarai
                // lengkap, tetapi tiada apa untuk dilakukan dari dalam panel.
                biasa.Enabled = false;
            }
            else
            {
                biasa.Click += (_, _) => _laksana(item.Fungsi);
            }
            butang = biasa;
        }

        butang.Text = item.Label;
        butang.AccessibleName = item.Label;
        butang.Image = IkonDulang.Untuk(item.Fungsi);
        butang.ImageAlign = ContentAlignment.MiddleLeft;
        butang.TextAlign = ContentAlignment.MiddleLeft;
        butang.TextImageRelation = TextImageRelation.ImageBeforeText;
        butang.Size = new Size(_lebarButang, _tinggiButang);
        butang.Margin = MarginButang;
        butang.Padding = new Padding(4, 0, 0, 0);
        _butang[item.Fungsi] = butang;
        _teksPenerangan[item.Fungsi] = item.Penerangan;
        // Togol: penerangan + keadaan ditulis semula oleh Segarkan().
        TetapkanPenerangan(butang, item.Penerangan);
        return butang;
    }
}
