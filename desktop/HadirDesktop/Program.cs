using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace HadirDesktop;

internal static class Program
{
    private const string MutexName = @"Global\HadirDesktop.SingleInstance";
    private const string SignalName = @"Global\HadirDesktop.SingleInstance.Signal";

    private const int AttachParentProcess = -1;
    private const int StdOutputHandle = -11;

    [DllImport("kernel32.dll")]
    private static extern bool AttachConsole(int dwProcessId);

    [DllImport("kernel32.dll")]
    private static extern IntPtr GetStdHandle(int nStdHandle);

    [STAThread]
    private static void Main(string[] args)
    {
        // `--versi`: cetak versi dan keluar 0. Diperiksa SEBELUM apa-apa yang
        // lain — tiada mutex satu-tika, tiada tetingkap, tiada WebView2 — supaya
        // skrip kemas kini boleh menyoal exe yang terpasang dengan selamat
        // walaupun satu tika sedang berjalan.
        if (VersiAplikasi.DimintaDariArgumen(args))
        {
            CetakVersi();
            Environment.Exit(0);
            return;
        }

        using var singleInstance = new SingleInstance(MutexName, SignalName);
        if (!singleInstance.IsFirstInstance)
        {
            // Another instance is already running: ask it to show itself, then exit quietly.
            singleInstance.SignalExistingInstance();
            return;
        }

        ApplicationConfiguration.Initialize();

        // Warn (but never crash) when the Evergreen WebView2 runtime is missing:
        // the embedded portal cannot render, yet the tray/status/demand loop keep
        // running. Runs on the STA UI thread, so the MessageBox is safe.
        new WebView2RuntimeGuard(new WebView2RuntimeCheck()).AmaranJikaTiada();

        var mainForm = new MainForm();

        // Listen for a second-launch signal on a background thread and marshal to the UI thread.
        var listenerThread = new System.Threading.Thread(() => SignalListenerLoop(singleInstance, mainForm))
        {
            IsBackground = true,
        };
        listenerThread.Start();

        Application.Run(mainForm);
    }

    /// <summary>
    /// Tulis versi ke stdout. Exe ini ialah subsistem GUI (WinExe): apabila
    /// stdout DIALIHKAN (paip/fail — itulah cara <c>update.ps1</c> dan ujian
    /// memanggilnya) tulisan biasa sudah cukup. Apabila TIDAK dialihkan,
    /// proses GUI tiada konsol langsung, jadi kita lekat pada konsol induk
    /// dahulu supaya pengguna nampak sesuatu. Lekatan itu HANYA dibuat apabila
    /// tiada pemegang stdout — melekat sambil stdout dialihkan akan mematikan
    /// pengalihan itu.
    /// </summary>
    private static void CetakVersi()
    {
        try
        {
            if (GetStdHandle(StdOutputHandle) == IntPtr.Zero)
            {
                AttachConsole(AttachParentProcess);
            }
        }
        catch (DllNotFoundException)
        {
            // Teruskan: stdout yang dialihkan tetap berfungsi tanpa konsol.
        }
        catch (EntryPointNotFoundException)
        {
        }

        Console.Out.WriteLine(VersiAplikasi.Versi);
        Console.Out.Flush();
    }

    private static void SignalListenerLoop(SingleInstance singleInstance, MainForm mainForm)
    {
        while (!mainForm.IsDisposed)
        {
            if (singleInstance.WaitForSignal(TimeSpan.FromSeconds(1)))
            {
                try
                {
                    if (mainForm.IsHandleCreated && !mainForm.IsDisposed)
                    {
                        mainForm.BeginInvoke(new Action(mainForm.BringToFrontFromSecondLaunch));
                    }
                }
                catch (ObjectDisposedException)
                {
                    return;
                }
                catch (InvalidOperationException)
                {
                    return;
                }
            }
        }
    }
}
