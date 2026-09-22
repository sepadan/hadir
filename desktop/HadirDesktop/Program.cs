using System;
using System.Windows.Forms;

namespace HadirDesktop;

internal static class Program
{
    private const string MutexName = @"Global\HadirDesktop.SingleInstance";
    private const string SignalName = @"Global\HadirDesktop.SingleInstance.Signal";

    [STAThread]
    private static void Main()
    {
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
