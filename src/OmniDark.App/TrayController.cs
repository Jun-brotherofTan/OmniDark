using System.Text.Json;
using OmniDark.Core;

namespace OmniDark.App;

internal sealed class TrayController : ApplicationContext
{
    private readonly OptionsStore _store;
    private readonly NotifyIcon _tray;
    private readonly ToolStripMenuItem _enabledItem;
    private readonly ToolStripMenuItem _statusItem;
    private readonly System.Windows.Forms.Timer _statusTimer;
    private readonly WindowMonitor _monitor;
    private OmniDarkOptions _options;
    private IReadOnlyList<DetectedWindow> _windows = [];
    private IReadOnlyList<string> _darkPages = [];

    public TrayController(OptionsStore store, OmniDarkOptions options)
    {
        _store = store;
        _options = options;
        _enabledItem = new ToolStripMenuItem("OmniDark 사용", null, (_, _) => ToggleEnabled())
        {
            Checked = options.Enabled,
            CheckOnClick = false
        };
        _statusItem = new ToolStripMenuItem("감지된 창: 확인 중") { Enabled = false };

        var menu = new ContextMenuStrip();
        menu.Items.Add(_enabledItem);
        menu.Items.Add(_statusItem);
        menu.Items.Add("설정...", null, (_, _) => OpenSettings());
        menu.Items.Add("원래 모양 복원", null, (_, _) => RequestRestore());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("종료", null, (_, _) => ExitThread());

        _tray = new NotifyIcon
        {
            Icon = SystemIcons.Shield,
            Text = "OmniDark",
            ContextMenuStrip = menu,
            Visible = true
        };
        _tray.DoubleClick += (_, _) => OpenSettings();

        _monitor = new WindowMonitor(
            SynchronizationContext.Current ?? new WindowsFormsSynchronizationContext(), () => _options);
        _monitor.WindowsChanged += windows =>
        {
            _windows = windows;
            RefreshStatusText();
        };
        _monitor.RefreshNow();

        _statusTimer = new System.Windows.Forms.Timer { Interval = 2000 };
        _statusTimer.Tick += (_, _) => ReadBrowserStatus();
        _statusTimer.Start();
        ReadBrowserStatus();
    }

    private void ToggleEnabled()
    {
        _options = _options with { Enabled = !_options.Enabled };
        SaveOptions();
        _enabledItem.Checked = _options.Enabled;
        _monitor.RefreshNow();
    }

    private void OpenSettings()
    {
        using var dialog = new SettingsForm(_options, _windows, _darkPages);
        if (dialog.ShowDialog() != DialogResult.OK)
            return;

        _options = dialog.Options;
        SaveOptions();
        _enabledItem.Checked = _options.Enabled;
        _monitor.RefreshNow();
    }

    private void SaveOptions()
    {
        try
        {
            _store.Save(_options);
        }
        catch (IOException exception)
        {
            MessageBox.Show($"설정을 저장할 수 없습니다.\n{exception.Message}", "OmniDark",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void RequestRestore()
    {
        Directory.CreateDirectory(LocalPaths.DirectoryPath);
        File.WriteAllText(LocalPaths.BrowserCommandPath, "restore");
        _tray.ShowBalloonTip(1800, "OmniDark", "Chrome 확장에 원래 스타일 복원을 요청했습니다.", ToolTipIcon.Info);
    }

    private void ReadBrowserStatus()
    {
        try
        {
            if (File.Exists(LocalPaths.BrowserStatusPath))
            {
                using var document = JsonDocument.Parse(File.ReadAllText(LocalPaths.BrowserStatusPath));
                if (document.RootElement.TryGetProperty("pages", out var pages))
                    _darkPages = pages.EnumerateArray()
                        .Where(page => page.TryGetProperty("dark", out var dark) && dark.GetBoolean())
                        .Select(page => page.TryGetProperty("title", out var title) ? title.GetString() ?? "Chrome 페이지" : "Chrome 페이지")
                        .Take(8)
                        .ToArray();
            }
        }
        catch (IOException)
        {
        }
        catch (JsonException)
        {
        }

        RefreshStatusText();
    }

    private void RefreshStatusText()
    {
        var applied = _darkPages.Count;
        _statusItem.Text = $"감지된 앱 창: {_windows.Count}, 어두운 Chrome 페이지: {applied}";
        _tray.Text = $"OmniDark | 앱 창 {_windows.Count} | Chrome 페이지 {applied}";
    }

    protected override void ExitThreadCore()
    {
        _statusTimer.Stop();
        _statusTimer.Dispose();
        _monitor.Dispose();
        _tray.Visible = false;
        _tray.Dispose();
        base.ExitThreadCore();
    }
}