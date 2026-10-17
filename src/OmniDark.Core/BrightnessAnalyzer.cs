namespace OmniDark.Core;

public readonly record struct Rgb(byte R, byte G, byte B);

public readonly record struct PixelSample(Rgb Color, bool IsEmbeddedMedia = false);

public readonly record struct BrightnessResult(int AnalyzedSamples, int NearWhiteSamples, double NearWhitePercent)
{
    public bool Exceeds(double thresholdPercent) => NearWhitePercent > thresholdPercent;
}

public static class BrightnessAnalyzer
{
    public static BrightnessResult Analyze(IEnumerable<PixelSample> samples, byte nearWhiteMinimum = 235)
    {
        ArgumentNullException.ThrowIfNull(samples);

        var analyzed = 0;
        var nearWhite = 0;
        foreach (var sample in samples)
        {
            if (sample.IsEmbeddedMedia)
                continue;

            analyzed++;
            if (sample.Color.R >= nearWhiteMinimum && sample.Color.G >= nearWhiteMinimum && sample.Color.B >= nearWhiteMinimum)
                nearWhite++;
        }

        var percent = analyzed == 0 ? 0 : nearWhite * 100d / analyzed;
        return new BrightnessResult(analyzed, nearWhite, percent);
    }
}