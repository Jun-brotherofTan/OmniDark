namespace OmniDark.App;

internal static class LocalPaths
{
    public static string DirectoryPath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "OmniDark");

    public static string BrowserStatusPath => Path.Combine(DirectoryPath, "browser-status.json");
    public static string BrowserCommandPath => Path.Combine(DirectoryPath, "browser-command.json");
}