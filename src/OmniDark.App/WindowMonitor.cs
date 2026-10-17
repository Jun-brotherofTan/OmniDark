using System.Diagnostics;
using System.Runtime.InteropServices;
using OmniDark.Core;

namespace OmniDark.App;

internal sealed class WindowMonitor : IDisposable
{
    private const uint EventSystemForeground = 0x0003;
    private const uint EventObjectShow = 0x8002;
    private const uint WineventOutOfContext = 0x0000;
    private const uint WineventSkipOwnProcess = 0x0002;
    private static readonly IntPtr HwndBroadcast = new(0);
    private readonly SynchronizationContext _context;
    private readonly Func<OmniDarkOptions> _getOptions;
    private readonly WinEventDelegate _callback;
    private readonly IntPtr[] _hooks;

    public event Action<IReadOnlyList<DetectedWindow>>? WindowsChanged;

    public WindowMonitor(SynchronizationContext context, Func<OmniDarkOptions> getOptions)
    {
        _context = context;
        _getOptions = getOptions;
        _callback = OnWinEvent;
        _hooks =
        [
            SetWinEventHook(EventSystemForeground, EventSystemForeground, IntPtr.Zero, _callback, 0, 0,
                WineventOutOfContext | WineventSkipOwnProcess),
            SetWinEventHook(EventObjectShow, EventObjectShow, IntPtr.Zero, _callback, 0, 0,
                WineventOutOfContext | WineventSkipOwnProcess)
        ];
        Refresh();
    }

    private void OnWinEvent(IntPtr hook, uint eventType, IntPtr hwnd, int objectId, int childId, uint threadId, uint eventTime)
    {
        if (hwnd == IntPtr.Zero || objectId != 0 || childId != 0)
            return;
        _context.Post(_ => Refresh(), null);
    }

    private void Refresh()
    {
        var options = _getOptions();
        if (!options.Enabled || !options.AutomaticDetection)
        {
            WindowsChanged?.Invoke([]);
            return;
        }

        var windows = new List<DetectedWindow>();
        EnumWindows((hwnd, _) =>
        {
            if (!IsWindowVisible(hwnd) || hwnd == HwndBroadcast)
                return true;

            GetWindowThreadProcessId(hwnd, out var processId);
            try
            {
                using var process = Process.GetProcessById((int)processId);
                var name = Path.GetFileNameWithoutExtension(process.ProcessName);
                if (options.SupportedApplications.Contains(name))
                {
                    var title = new System.Text.StringBuilder(512);
                    GetWindowText(hwnd, title, title.Capacity);
                    windows.Add(new DetectedWindow(hwnd, name, title.ToString()));
                }
            }
            catch (ArgumentException)
            {
            }
            catch (InvalidOperationException)
            {
            }

            return true;
        }, IntPtr.Zero);

        WindowsChanged?.Invoke(windows);
    }

    public void RefreshNow() => Refresh();

    public void Dispose()
    {
        foreach (var hook in _hooks)
            if (hook != IntPtr.Zero)
                UnhookWinEvent(hook);
    }

    private delegate void WinEventDelegate(IntPtr hook, uint eventType, IntPtr hwnd, int objectId,
        int childId, uint threadId, uint eventTime);

    private delegate bool EnumWindowsDelegate(IntPtr hwnd, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern IntPtr SetWinEventHook(uint eventMin, uint eventMax, IntPtr eventHook,
        WinEventDelegate callback, uint processId, uint threadId, uint flags);

    [DllImport("user32.dll")]
    private static extern bool UnhookWinEvent(IntPtr hook);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsDelegate callback, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hwnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hwnd, System.Text.StringBuilder text, int maxCount);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
}

internal sealed record DetectedWindow(IntPtr Handle, string ProcessName, string Title);