using System.Text.Json;
using HadirDesktop;
using Xunit;

namespace HadirDesktop.Tests;

/// <summary>
/// The selectors are the part of this adapter that cannot be proven by a stub:
/// a typo produces a silent no-op against the real portal. These tests pin the
/// exact strings inherited from <c>companion/src/moeis/adaptorPlaywright.mjs</c>
/// and check the generated JavaScript actually carries them.
/// </summary>
public class SkripMoeisTests
{
    /// <summary>
    /// How a string appears once embedded in the generated JavaScript. The
    /// scripts embed every selector/value as a JSON literal, and
    /// <c>System.Text.Json</c>'s default encoder writes a double quote as a
    /// unicode escape — valid JS, but it means a raw-substring assertion
    /// would be testing the encoder instead of the selector.
    /// </summary>
    private static string Lit(string s) => JsonSerializer.Serialize(s);

    [Fact]
    public void Selektor_SamaSepertiAdaptorCompanion()
    {
        Assert.Equal("a[data-target=\"#kehadiranharian\"]", SkripMoeis.SelektorTabHarian);
        Assert.Equal("#kehadiran input.case-hadir", SkripMoeis.SelektorSenaraiMurid);
        Assert.Equal("td.sebabthadir", SkripMoeis.SelektorSelSebab);
        Assert.Equal(".selectkategori", SkripMoeis.SelektorKategori);
        Assert.Equal(".selectsebab", SkripMoeis.SelektorSebab);
        Assert.Equal(".sweet-alert:visible button.simpan", SkripMoeis.SelektorSimpan);
        Assert.Equal(".sweet-alert:visible button.simpansah", SkripMoeis.SelektorSimpanSahkan);
        Assert.Equal(".sweet-alert h2", SkripMoeis.SelektorTajukDialog);
        Assert.Equal("Berjaya.", SkripMoeis.TeksBerjaya);
        Assert.Equal("#kemaskiniKehadiran", SkripMoeis.SelektorKemaskini);
        Assert.Equal("#tkh_HH", SkripMoeis.SelektorTarikh);
        Assert.Equal("https://moeispel.moe.gov.my/sahsiah/kehadiran/pkhem/tabguru", IdMeLoginEndpoints.KehadiranUrl);
    }

    [Fact]
    public void SelektorMurid_MembawaDataIdpelajar()
    {
        Assert.Equal("#kehadiran input.case-hadir[data-idpelajar=\"12345\"]", SkripMoeis.SelektorMurid("12345"));
    }

    [Fact]
    public void SkripTabHarian_GunaSelektorTab()
    {
        Assert.Contains(Lit(SkripMoeis.SelektorTabHarian), SkripMoeis.KlikTabHarian());
    }

    [Fact]
    public void SkripSenaraiMurid_BacaIdDanKeadaanKotak()
    {
        var js = SkripMoeis.BacaSenaraiMurid();
        Assert.Contains("#kehadiran input.case-hadir", js);
        Assert.Contains("data-idpelajar", js);
        Assert.Contains("cb.checked", js);
    }

    [Fact]
    public void SkripBarisSebab_TurunKeTdSebabthadir()
    {
        foreach (var js in new[]
        {
            SkripMoeis.PemilihSebabAda("77"),
            SkripMoeis.BacaPilihanBaris("77", SkripMoeis.SelektorKategori),
            SkripMoeis.TetapkanPilihanBaris("77", SkripMoeis.SelektorSebab, "S1"),
            SkripMoeis.BacaSebabMurid("77"),
        })
        {
            Assert.Contains(Lit(SkripMoeis.SelektorMurid("77")), js);
            Assert.Contains("closest('tr')", js);
            Assert.Contains("td.sebabthadir", js);
        }

        Assert.Contains(".selectkategori", SkripMoeis.PemilihSebabAda("77"));
        // The read-back must carry BOTH selects: category and reason are mandatory.
        Assert.Contains(".selectkategori", SkripMoeis.BacaSebabMurid("77"));
        Assert.Contains(".selectsebab", SkripMoeis.BacaSebabMurid("77"));
    }

    [Fact]
    public void SkripTandaTidakHadir_TidakMenanggalkanTandaYangSudahTiada()
    {
        var js = SkripMoeis.TandaTidakHadir("77");
        // Already absent (unticked) → return true WITHOUT clicking: clicking would
        // put the student back to present.
        Assert.Contains("if(!cb.checked)return true;", js);
        Assert.Contains("cb.click()", js);
    }

    [Fact]
    public void SkripDialog_MenirukanVisibleTanpaMenghantarnyaKeQuerySelector()
    {
        foreach (var js in new[]
        {
            SkripMoeis.DialogSimpanKelihatan(),
            SkripMoeis.KlikButangDialog("simpan"),
            SkripMoeis.KlikButangDialog("simpansah"),
        })
        {
            // ":visible" is jQuery/Playwright-only — it must never reach querySelector.
            Assert.DoesNotContain(":visible", js);
            Assert.Contains(".sweet-alert", js);
            Assert.Contains("offsetParent", js);
        }

        Assert.Contains("button.simpan", SkripMoeis.KlikButangDialog("simpan"));
        Assert.Contains("button.simpansah", SkripMoeis.KlikButangDialog("simpansah"));
    }

    [Fact]
    public void SkripDialogBerjaya_PadanTeksBerjayaTepat()
    {
        var js = SkripMoeis.DialogBerjayaKelihatan();
        Assert.Contains(".sweet-alert h2", js);
        Assert.Contains(Lit(SkripMoeis.TeksBerjaya), js);
    }

    [Fact]
    public void SkripTetapkanPilihan_SahkanNilaiDiterimaDanPancarkanChange()
    {
        var js = SkripMoeis.TetapkanPilihan("#txtNamakelas", "K1");
        Assert.Contains("#txtNamakelas", js);
        Assert.Contains("\"K1\"", js);
        Assert.Contains("return false", js);          // value did not stick → honest false
        Assert.Contains("new Event('change'", js);
        Assert.Contains("window.jQuery", js);         // MOEIS is jQuery-driven
    }

    [Theory]
    [InlineData("12345", true)]
    [InlineData("abc-DEF_9", true)]
    [InlineData("", false)]
    [InlineData(null, false)]
    [InlineData("12\"] , input", false)]   // would break out of the attribute selector
    [InlineData("1 2", false)]
    public void IdSelamat_HanyaTokenMudah(string? id, bool jangka)
        => Assert.Equal(jangka, SkripMoeis.IdSelamat(id));
}
