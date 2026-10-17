using OmniDark.Core;

namespace OmniDark.App;

internal sealed class SettingsForm : Form
{
    private static readonly (string Id, string Label)[] Applications =
    [
        ("chrome", "Google Chrome (웹페이지 확장 지원)"),
        ("msedge", "Microsoft Edge (창 감지)"),
        ("winword", "Microsoft Word (창 감지, 자동 변경 안 함)"),
        ("explorer", "파일 탐색기 (창 감지, 자동 변경 안 함)"),
        ("acrord32", "Adobe Acrobat Reader (창 감지)"),
        ("sumatrapdf", "SumatraPDF (창 감지)"),
        ("foxitpdfreader", "Foxit PDF Reader (창 감지)")
    ];

    private readonly CheckBox _enabled = new() { Text = "OmniDark 사용", AutoSize = true };
    private readonly CheckBox _automatic = new() { Text = "자동 창 감지 사용", AutoSize = true };
    private readonly CheckBox _restore = new() { Text = "비활성화 시 원래 모양 복원 (Chrome 확장)", AutoSize = true };
    private readonly NumericUpDown _threshold = new() { Minimum = 0, Maximum = 100, Width = 80 };
    private readonly NumericUpDown _nearWhite = new() { Minimum = 0, Maximum = 255, Width = 80 };
    private readonly NumericUpDown _nearBlack = new() { Minimum = 0, Maximum = 255, Width = 80 };
    private readonly CheckedListBox _applications = new() { CheckOnClick = true, Height = 150, Dock = DockStyle.Fill };
    private readonly ListBox _windows = new() { Height = 105, Dock = DockStyle.Fill };
    private readonly ListBox _pages = new() { Height = 105, Dock = DockStyle.Fill };

    public OmniDarkOptions Options { get; private set; }

    public SettingsForm(OmniDarkOptions options, IReadOnlyList<DetectedWindow> windows, IReadOnlyList<string> darkPages)
    {
        Options = options;
        Text = "OmniDark 설정";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(520, 640);

        _enabled.Checked = options.Enabled;
        _automatic.Checked = options.AutomaticDetection;
        _restore.Checked = options.RestoreOriginalAppearance;
        _threshold.Value = (decimal)options.WhiteBackgroundThreshold;
        _nearWhite.Value = options.NearWhiteMinimum;
        _nearBlack.Value = options.NearBlackMaximum;

        foreach (var app in Applications)
        {
            var index = _applications.Items.Add(app.Label);
            _applications.SetItemChecked(index, options.SupportedApplications.Contains(app.Id));
        }

        foreach (var window in windows)
            _windows.Items.Add($"{window.ProcessName}: {window.Title}");
        foreach (var page in darkPages)
            _pages.Items.Add(page);

        if (_windows.Items.Count == 0)
            _windows.Items.Add("현재 감지된 창 없음");
        if (_pages.Items.Count == 0)
            _pages.Items.Add("현재 확장이 보고한 페이지 없음");

        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(12), ColumnCount = 2, RowCount = 11, AutoScroll = true };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        layout.Controls.Add(_enabled, 0, 0);
        layout.SetColumnSpan(_enabled, 2);
        layout.Controls.Add(_automatic, 0, 1);
        layout.SetColumnSpan(_automatic, 2);
        layout.Controls.Add(_restore, 0, 2);
        layout.SetColumnSpan(_restore, 2);
        layout.Controls.Add(new Label { Text = "밝은 배경 비율 임계값", AutoSize = true, Anchor = AnchorStyles.Left }, 0, 3);
        layout.Controls.Add(_threshold, 1, 3);
        layout.Controls.Add(new Label { Text = "흰색 판정 최소 RGB", AutoSize = true, Anchor = AnchorStyles.Left }, 0, 4);
        layout.Controls.Add(_nearWhite, 1, 4);
        layout.Controls.Add(new Label { Text = "검정 판정 최대 RGB", AutoSize = true, Anchor = AnchorStyles.Left }, 0, 5);
        layout.Controls.Add(_nearBlack, 1, 5);
        layout.Controls.Add(SectionLabel("감지할 앱"), 0, 6);
        layout.SetColumnSpan(layout.GetControlFromPosition(0, 6)!, 2);
        layout.Controls.Add(_applications, 0, 7);
        layout.SetColumnSpan(_applications, 2);
        layout.Controls.Add(SectionLabel("감지된 앱 창 (테마 적용 여부와 별도)"), 0, 8);
        layout.SetColumnSpan(layout.GetControlFromPosition(0, 8)!, 2);
        layout.Controls.Add(_windows, 0, 9);
        layout.SetColumnSpan(_windows, 2);
        layout.Controls.Add(SectionLabel("Chrome 확장 적용 페이지"), 0, 10);
        layout.SetColumnSpan(layout.GetControlFromPosition(0, 10)!, 2);

        var pageArea = new Panel { Dock = DockStyle.Bottom, Height = 105, Padding = new Padding(12, 0, 12, 0) };
        pageArea.Controls.Add(_pages);
        var buttons = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 46, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(8) };
        var save = new Button { Text = "저장", DialogResult = DialogResult.OK, AutoSize = true };
        var cancel = new Button { Text = "취소", DialogResult = DialogResult.Cancel, AutoSize = true };
        buttons.Controls.Add(save);
        buttons.Controls.Add(cancel);
        Controls.Add(layout);
        Controls.Add(pageArea);
        Controls.Add(buttons);
        AcceptButton = save;
        CancelButton = cancel;
        save.Click += (_, _) => SaveValues();
    }

    private static Label SectionLabel(string text) => new() { Text = text, AutoSize = true, Font = new Font(SystemFonts.DefaultFont, FontStyle.Bold), Margin = new Padding(0, 8, 0, 4) };

    private void SaveValues()
    {
        var supported = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        for (var index = 0; index < Applications.Length; index++)
            if (_applications.GetItemChecked(index))
                supported.Add(Applications[index].Id);

        Options = Options with
        {
            Enabled = _enabled.Checked,
            AutomaticDetection = _automatic.Checked,
            RestoreOriginalAppearance = _restore.Checked,
            WhiteBackgroundThreshold = (double)_threshold.Value,
            NearWhiteMinimum = (byte)_nearWhite.Value,
            NearBlackMaximum = (byte)_nearBlack.Value,
            SupportedApplications = supported
        };
    }
}