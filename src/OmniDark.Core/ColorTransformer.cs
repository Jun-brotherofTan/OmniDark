namespace OmniDark.Core;

public enum ColorRole
{
    Background,
    Foreground
}

public static class ColorTransformer
{
    public static Rgb Transform(Rgb color, ColorRole role, OmniDarkOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);

        if (role == ColorRole.Background && IsNearWhite(color, options.NearWhiteMinimum))
        {
            var luminance = (color.R * 299 + color.G * 587 + color.B * 114) / 1000d;
            var level = (byte)Math.Clamp(Math.Round(52 - (luminance - options.NearWhiteMinimum) * 0.5), 24, 52);
            return new Rgb(level, level, level);
        }

        if (role == ColorRole.Foreground && IsNearBlack(color, options.NearBlackMaximum))
        {
            var level = (byte)Math.Clamp(232 - Math.Max(color.R, Math.Max(color.G, color.B)) * 0.55, 208, 232);
            return new Rgb(level, level, level);
        }

        return color;
    }

    private static bool IsNearWhite(Rgb color, byte minimum) =>
        color.R >= minimum && color.G >= minimum && color.B >= minimum;

    private static bool IsNearBlack(Rgb color, byte maximum) =>
        color.R <= maximum && color.G <= maximum && color.B <= maximum;
}