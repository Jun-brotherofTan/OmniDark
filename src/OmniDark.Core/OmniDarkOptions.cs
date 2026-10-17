namespace OmniDark.Core;

public sealed record OmniDarkOptions
{
    public bool Enabled { get; init; } = true;
    public bool AutomaticDetection { get; init; } = true;
    public bool RestoreOriginalAppearance { get; init; } = true;
    public double WhiteBackgroundThreshold { get; init; } = 60;
    public byte NearWhiteMinimum { get; init; } = 235;
    public byte NearBlackMaximum { get; init; } = 40;
    public HashSet<string> SupportedApplications { get; init; } = new(StringComparer.OrdinalIgnoreCase)
    {
        "chrome", "msedge", "winword", "explorer", "acrord32", "sumatrapdf", "foxitpdfreader"
    };

    public OmniDarkOptions Normalize() => this with
    {
        WhiteBackgroundThreshold = Math.Clamp(WhiteBackgroundThreshold, 0, 100),
        SupportedApplications = new HashSet<string>(SupportedApplications ?? [], StringComparer.OrdinalIgnoreCase)
    };
}