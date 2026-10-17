using OmniDark.Core;

namespace OmniDark.App;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        if (args.Contains("--native-host", StringComparer.OrdinalIgnoreCase))
        {
            NativeMessagingHost.Run();
            return;
        }

        ApplicationConfiguration.Initialize();
        var store = new OptionsStore();
        Application.Run(new TrayController(store, store.Load()));
    }
}