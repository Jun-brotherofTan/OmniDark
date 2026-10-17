using System.Text.Json;

namespace OmniDark.Core;

public sealed class OptionsStore
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };
    private readonly string _path;

    public OptionsStore(string? path = null)
    {
        _path = path ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "OmniDark", "settings.json");
    }

    public OmniDarkOptions Load()
    {
        try
        {
            if (File.Exists(_path))
            {
                var options = JsonSerializer.Deserialize<OmniDarkOptions>(File.ReadAllText(_path), JsonOptions);
                if (options is not null)
                    return options.Normalize();
            }
        }
        catch (JsonException)
        {
        }
        catch (IOException)
        {
        }

        return new OmniDarkOptions();
    }

    public void Save(OmniDarkOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        var directory = Path.GetDirectoryName(_path)!;
        Directory.CreateDirectory(directory);
        File.WriteAllText(_path, JsonSerializer.Serialize(options.Normalize(), JsonOptions));
    }
}