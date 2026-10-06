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
/// </summary>
public sealed class PanelFungsi : Form
{
    /// <summary>Lebar TETAP lajur penerangan (teks dibalut di dalamnya).</summary>
    internal const int LebarPenerangan = 260;
    private const int TinggiButang = 30;
    /// <summary>
    /// Ruang dalam butang selain teks: ikon 16px, jarak ikon–teks, Padding
    /// kiri butang, dan sempadan/tepi visual. Sengaja longgar — teks yang
    /// terpotong lebih buruk daripada beberapa piksel ruang kosong.
    /// </summary>
    internal const int RuangDalamButang = IkonDulang.Saiz + 32;
    /// <summary>Margin seragam bagi setiap sel (butang dan penerangan).</summary>
    private static readonly Padding MarginSel = new(3);
    private static readonly string[] TeksKeadaanSemua =
        { TeksKeadaan(true), TeksKeadaan(false), TeksKeadaan(null) };

    /// <summary>Lebar setiap butang — dikira daripada label terpanjang (lihat <see cref="KiraLebarButang"/>).</summary>
    private readonly int _lebarButang;
    /// <summary>Tinggi SETIAP baris dalam setiap kelompok (seragam).</summary>
    private readonly int _tinggiBaris;
    private readonly List<TableLayoutPanel> _grid = new();

    private readonly Action<FungsiDulang> _laksana;
    private readonly Func<FungsiDulang, bool?> _bacaTogol;
    private readonly Action<FungsiDulang, bool> _tetapkanTogol;
    private readonly Func<string> _bacaStatus;
    private readonly Dictionary<FungsiDulang, ButtonBase> _butang = new();
    private readonly Dictionary<FungsiDulang, Label> _penerangan = new();
    private readonly Dictionary<FungsiDulang, string> _teksPenerangan = new();
    private readonly Label _status;
    /// <summary>Benar semasa <see cref="Segarkan"/> menulis Checked — bukan klik pemilik.</summary>
    private bool _menyegar;

    /// <param name="laksana">Fungsi perintah (sama seperti klik item dulang).</param>
    /// <param name="bacaTogol">Keadaan togol seperti dipapar dulang; <c>null</c> = tidak tersedia.</param>
    /// <param name="tetapkanTogol">Tulis togol melalui dulang (satu-satunya laluan tulis).</param>
    /// <param name="bacaStatus">Teks baris status dulang (keadaan portal).</param>
    public PanelFungsi(
        Action<FungsiDulang> laksana,
        Func<FungsiDulang, bool?> bacaTogol,
        Action<FungsiDulang, bool> tetapkanTogol,
        Func<string> bacaStatus)
    {
        _laksana = laksana;
        _bacaTogol = bacaTogol;
        _tetapkanTogol = tetapkanTogol;
        _bacaStatus = bacaStatus;

        Text = DemoLabel.PanelFungsiTajuk;
        FormBorderStyle = FormBorderStyle.FixedSingle;
        StartPosition = FormStartPosition.CenterScreen;
        MaximizeBox = false;
        ShowInTaskbar = true;
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;

        // Saiz diukur daripada teks SEBENAR dengan fon tetingkap, jadi ia kekal
        // betul pada DPI/fon lain: tiada label butang terpotong, dan semua baris
        // (dalam semua kelompok) sama tinggi.
        var senarai = PanelFungsiBina.Senarai();
        _lebarButang = KiraLebarButang(Font, senarai);
        _tinggiBaris = KiraTinggiBaris(Font, senarai);
        var lebarKandungan = LebarLajurButang + LebarPenerangan;

        var akar = new TableLayoutPanel
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            ColumnCount = 1,
            Padding = new Padding(12),
            Location = new Point(0, 0),
        };

        akar.Controls.Add(new Label
        {
            Text = DemoLabel.PanelFungsiTajuk,
            AutoSize = true,
            Font = new Font(Font.FontFamily, Font.Size + 3, FontStyle.Bold),
            Margin = new Padding(3, 0, 3, 4),
        });
        akar.Controls.Add(new Label
        {
            Text = DemoLabel.PanelFungsiArahan,
            AutoSize = true,
            MaximumSize = new Size(lebarKandungan, 0),
            ForeColor = Color.DimGray,
            Margin = new Padding(3, 0, 3, 8),
        });

        foreach (var kelompok in senarai)
        {
            akar.Controls.Add(BinaKelompok(kelompok));
        }

        _status = new Label
        {
            AutoSize = true,
            Dock = DockStyle.Fill,
            MaximumSize = new Size(lebarKandungan + 20, 0),
            BorderStyle = BorderStyle.FixedSingle,
            Padding = new Padding(4),
            Margin = new Padding(3, 8, 3, 4),
        };
        akar.Controls.Add(_status);

        var tutup = new Button { Text = DemoLabel.PanelFungsiTutup, AutoSize = true };
        tutup.Click += (_, _) => Hide();
        CancelButton = tutup;
        var baris = new FlowLayoutPanel
        {
            AutoSize = true,
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.RightToLeft,
            Margin = new Padding(0),
        };
        baris.Controls.Add(tutup);
        akar.Controls.Add(baris);

        Controls.Add(akar);
        Segarkan();
    }

    /// <summary>Butang bagi setiap fungsi — untuk ujian sahaja.</summary>
    internal IReadOnlyDictionary<FungsiDulang, ButtonBase> Butang => _butang;

    /// <summary>Baris status baca-sahaja — untuk ujian sahaja.</summary>
    internal Label LabelStatus => _status;

    /// <summary>Grid dua lajur bagi setiap kelompok — untuk ujian sahaja.</summary>
    internal IReadOnlyList<TableLayoutPanel> Grid => _grid;

    /// <summary>Lebar lajur butang: lebar butang + margin sel kiri dan kanan.</summary>
    internal int LebarLajurButang => _lebarButang + MarginSel.Horizontal;

    internal int TinggiBaris => _tinggiBaris;

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
    /// Tinggi seragam bagi setiap baris: maksimum tinggi butang dan tinggi
    /// penerangan TERTINGGI (dibalut dalam lajur penerangan; togol diukur
    /// dalam setiap keadaan), ditambah margin sel.
    ///
    /// Diukur dengan Label yang dikonfigurasi SAMA seperti label penerangan,
    /// bukan <see cref="TextRenderer.MeasureText(string, Font)"/>: Label
    /// membalut dan menambah ruang sendiri, dan ukuran yang lebih kecil
    /// akan memotong baris kedua.
    /// </summary>
    internal static int KiraTinggiBaris(Font fon, IEnumerable<KelompokFungsi> senarai)
    {
        var lebarTeks = LebarPenerangan - MarginSel.Horizontal;
        using var ukur = new Label { AutoSize = true, Font = fon, MaximumSize = new Size(lebarTeks, 0) };
        var tinggi = TinggiButang;
        foreach (var item in senarai.SelectMany(k => k.Item))
        {
            var variasi = item.Jenis == JenisFungsi.Togol
                ? TeksKeadaanSemua.Select(k => item.Penerangan + " " + k)
                : new[] { item.Penerangan };
            foreach (var teks in variasi)
            {
                ukur.Text = teks;
                tinggi = Math.Max(tinggi, ukur.GetPreferredSize(new Size(lebarTeks, 0)).Height);
            }
        }
        return tinggi + MarginSel.Vertical;
    }

    /// <summary>
    /// Baca semula keadaan togol dan baris status daripada dulang. Tidak
    /// menulis apa-apa: Checked diset dengan <see cref="_menyegar"/> dihidupkan.
    /// </summary>
    public void Segarkan()
    {
        _status.Text = "Status: " + _bacaStatus();

        _menyegar = true;
        try
        {
            foreach (var (fungsi, butang) in _butang)
            {
                if (butang is not CheckBox kotak) continue;
                var keadaan = _bacaTogol(fungsi);
                kotak.Enabled = keadaan.HasValue;
                kotak.Checked = keadaan ?? false;
                _penerangan[fungsi].Text = _teksPenerangan[fungsi] + " " + TeksKeadaan(keadaan);
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

    private GroupBox BinaKelompok(KelompokFungsi kelompok)
    {
        // Dua lajur TETAP yang sama dalam setiap kelompok: tepi kanan butang
        // membentuk satu garis lurus merentasi semua kelompok. Baris juga tetap
        // (sama tinggi); butang dan penerangan tidak berlabuh atas/bawah, jadi
        // kedua-duanya ditengahkan menegak pada garis yang sama.
        var grid = new TableLayoutPanel
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            ColumnCount = 2,
            RowCount = kelompok.Item.Count,
            Dock = DockStyle.Fill,
            Margin = Padding.Empty,
        };
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, LebarLajurButang));
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, LebarPenerangan));

        for (var baris = 0; baris < kelompok.Item.Count; baris++)
        {
            var item = kelompok.Item[baris];
            grid.RowStyles.Add(new RowStyle(SizeType.Absolute, _tinggiBaris));
            var butang = BinaButang(item);
            var penerangan = new Label
            {
                Text = item.Penerangan,
                AutoSize = true,
                MaximumSize = new Size(LebarPenerangan - MarginSel.Horizontal, 0),
                ForeColor = Color.DimGray,
                Anchor = AnchorStyles.Left,
                Margin = MarginSel,
            };
            _butang[item.Fungsi] = butang;
            _penerangan[item.Fungsi] = penerangan;
            _teksPenerangan[item.Fungsi] = item.Penerangan;
            grid.Controls.Add(butang, 0, baris);
            grid.Controls.Add(penerangan, 1, baris);
        }
        _grid.Add(grid);

        var kotak = new GroupBox
        {
            Text = kelompok.Tajuk,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            Padding = new Padding(6, 4, 6, 6),
            Margin = new Padding(3, 3, 3, 6),
        };
        kotak.Controls.Add(grid);
        return kotak;
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
        butang.Size = new Size(_lebarButang, TinggiButang);
        butang.Margin = MarginSel;
        butang.Padding = new Padding(4, 0, 0, 0);
        // Kiri+kanan tanpa atas/bawah: penuhi lebar lajur, tengah menegak.
        butang.Anchor = AnchorStyles.Left | AnchorStyles.Right;
        return butang;
    }
}
