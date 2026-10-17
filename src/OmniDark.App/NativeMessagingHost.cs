using System.Buffers.Binary;
using System.Text.Json;
using OmniDark.Core;

namespace OmniDark.App;

internal static class NativeMessagingHost
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    public static void Run()
    {
        var input = Console.OpenStandardInput();
        var output = Console.OpenStandardOutput();
        var store = new OptionsStore();
        Directory.CreateDirectory(LocalPaths.DirectoryPath);
        Span<byte> header = stackalloc byte[4];

        try
        {
            while (true)
            {
                if (!TryReadExactly(input, header))
                    return;

                var length = BinaryPrimitives.ReadInt32LittleEndian(header);
                if (length is < 0 or > 1_048_576)
                    return;

                var body = new byte[length];
                if (!TryReadExactly(input, body))
                    return;

                using var message = JsonDocument.Parse(body);
                if (message.RootElement.TryGetProperty("type", out var type) && type.GetString() == "status")
                    File.WriteAllBytes(LocalPaths.BrowserStatusPath, body);

                var response = new NativeResponse(store.Load(), ReadAndClearRestoreCommand());
                WriteMessage(output, JsonSerializer.SerializeToUtf8Bytes(response));
            }
        }
        catch (IOException)
        {
        }
        catch (JsonException)
        {
        }
    }

    private static bool ReadAndClearRestoreCommand()
    {
        try
        {
            if (!File.Exists(LocalPaths.BrowserCommandPath))
                return false;
            File.Delete(LocalPaths.BrowserCommandPath);
            return true;
        }
        catch (IOException)
        {
            return false;
        }
    }

    private static bool TryReadExactly(Stream input, Span<byte> buffer)
    {
        var offset = 0;
        while (offset < buffer.Length)
        {
            var count = input.Read(buffer[offset..]);
            if (count == 0)
                return false;
            offset += count;
        }
        return true;
    }

    private static void WriteMessage(Stream output, byte[] body)
    {
        Span<byte> header = stackalloc byte[4];
        BinaryPrimitives.WriteInt32LittleEndian(header, body.Length);
        output.Write(header);
        output.Write(body);
        output.Flush();
    }

    private sealed record NativeResponse(OmniDarkOptions Settings, bool RestoreAll);
}