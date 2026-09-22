using System;
using System.Threading;

namespace HadirDesktop;

/// <summary>
/// Named-mutex based single-instance guard. Optionally signals an existing
/// instance via a named EventWaitHandle so it can bring its window to front.
/// </summary>
public sealed class SingleInstance : IDisposable
{
    private readonly Mutex _mutex;
    private readonly EventWaitHandle _signal;
    private bool _ownsMutex;
    private bool _disposed;

    public SingleInstance(string mutexName, string signalName)
    {
        _mutex = new Mutex(initiallyOwned: true, name: mutexName, createdNew: out var createdNew);
        _ownsMutex = createdNew;

        _signal = new EventWaitHandle(false, EventResetMode.AutoReset, signalName);
    }

    /// <summary>True if this process acquired the mutex first (i.e. is the only instance).</summary>
    public bool IsFirstInstance => _ownsMutex;

    /// <summary>Signal the already-running first instance (call only when IsFirstInstance is false).</summary>
    public void SignalExistingInstance()
    {
        _signal.Set();
    }

    /// <summary>Block briefly waiting for a signal from a newly launched second instance.</summary>
    public bool WaitForSignal(TimeSpan timeout)
    {
        return _signal.WaitOne(timeout);
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;

        if (_ownsMutex)
        {
            _mutex.ReleaseMutex();
            _ownsMutex = false;
        }

        _mutex.Dispose();
        _signal.Dispose();
    }
}
