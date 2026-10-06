using System;
using System.Drawing;
using System.Windows.Forms;

namespace HadirDesktop;

/// <summary>
/// Label status bar dengan had lebar tetap (1.0.21).
///
/// Dalam Windows Forms, <see cref="ToolStripStatusLabel.GetPreferredSize"/> mengabaikan
/// <see cref="ToolStripItem.AutoSize"/> = false dan sentiasa mengukur keseluruhan teks.
/// Ini menyebabkan StatusStrip memperuntukkan ruang mengikut teks panjang (contohnya
/// teks di luar waktu aktif 536 px), menolak label Spring dan butang Autohadir terkeluar
/// dari tetingkap.
///
/// Subkelas ini memastikan bahawa apabila <see cref="ToolStripItem.AutoSize"/> dimatikan
/// (false), <see cref="GetPreferredSize"/> menghormati <see cref="ToolStripItem.Width"/>
/// yang ditetapkan. Ini memberi jaminan struktural bahawa label tidak pernah menolak
/// butang keluar, dan teks panjang terpotong kemas dengan teks penuh kekal dalam ToolTip.
/// </summary>
public class LabelStatusTerhad : ToolStripStatusLabel
{
    public LabelStatusTerhad()
    {
    }

    public LabelStatusTerhad(string text) : base(text)
    {
    }

    public override Size GetPreferredSize(Size constrainingSize)
    {
        var saizAsas = base.GetPreferredSize(constrainingSize);
        return AutoSize || Width <= 0 ? saizAsas : new Size(Width, saizAsas.Height);
    }
}
