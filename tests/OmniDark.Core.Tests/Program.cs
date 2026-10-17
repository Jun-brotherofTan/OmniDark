using OmniDark.Core;

var options = new OmniDarkOptions();
Assert(options.WhiteBackgroundThreshold == 60, "default threshold");
Assert(options.AutomaticDetection && options.RestoreOriginalAppearance, "default behavior");

var analysis = BrightnessAnalyzer.Analyze(
[
    new PixelSample(new Rgb(255, 255, 255)),
    new PixelSample(new Rgb(240, 240, 240)),
    new PixelSample(new Rgb(20, 20, 20)),
    new PixelSample(new Rgb(255, 255, 255), IsEmbeddedMedia: true)
]);
Assert(analysis.AnalyzedSamples == 3 && analysis.NearWhiteSamples == 2, "media excluded from analysis");
Assert(Math.Abs(analysis.NearWhitePercent - 66.6667) < 0.01, "near-white percentage");
Assert(analysis.Exceeds(60), "threshold comparison");
Assert(!new BrightnessResult(100, 60, 60).Exceeds(60), "threshold requires strict exceedance");

var darkBackground = ColorTransformer.Transform(new Rgb(255, 255, 255), ColorRole.Background, options);
Assert(darkBackground.R is >= 24 and <= 52 && darkBackground.R == darkBackground.G, "white background darkened");
Assert(ColorTransformer.Transform(new Rgb(10, 10, 10), ColorRole.Foreground, options).R > 200, "dark text lightened");
var link = new Rgb(35, 100, 220);
Assert(ColorTransformer.Transform(link, ColorRole.Foreground, options) == link, "colored link preserved");
var existingDark = new Rgb(55, 58, 62);
Assert(ColorTransformer.Transform(existingDark, ColorRole.Background, options) == existingDark, "dark background preserved");

Assert((options with { WhiteBackgroundThreshold = 140 }).Normalize() is { WhiteBackgroundThreshold: 100 }, "threshold clamped");

var temporaryDirectory = Path.Combine(Path.GetTempPath(), $"omnidark-tests-{Guid.NewGuid():N}");
var optionsPath = Path.Combine(temporaryDirectory, "settings.json");
try
{
    var store = new OptionsStore(optionsPath);
    var customized = options with { WhiteBackgroundThreshold = 72, NearWhiteMinimum = 242, NearBlackMaximum = 35 };
    store.Save(customized);
    var loaded = store.Load();
    Assert(loaded.WhiteBackgroundThreshold == 72 && loaded.NearWhiteMinimum == 242, "settings save and load");
    Assert(loaded.NearBlackMaximum == 35 && loaded.SupportedApplications.Contains("chrome"), "settings values retained");
}
finally
{
    if (Directory.Exists(temporaryDirectory))
        Directory.Delete(temporaryDirectory, recursive: true);
}

Console.WriteLine("All OmniDark core checks passed.");

static void Assert(bool condition, string name)
{
    if (!condition)
        throw new InvalidOperationException($"Failed: {name}");
}