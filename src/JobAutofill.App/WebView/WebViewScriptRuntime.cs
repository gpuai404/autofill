using JobAutofill.Domain.Models;
using Microsoft.Maui.Controls;

namespace JobAutofill.App.WebView;

public sealed class WebViewScriptRuntime
{
    private readonly Microsoft.Maui.Controls.WebView _webView;

    public WebViewScriptRuntime(Microsoft.Maui.Controls.WebView webView)
    {
        _webView = webView;
    }

    public Task<string?> EvaluateAsync(string script)
    {
        return _webView.EvaluateJavaScriptAsync(script);
    }

    public async Task<bool> WaitForFlagAsync(
        string doneExpression,
        int attemptLimit,
        int delayMs,
        Func<Task<string?>>? readErrorAsync = null)
    {
        for (var attempt = 0; attempt < attemptLimit; attempt++)
        {
            if (readErrorAsync is not null)
            {
                var error = NormalizeJavaScriptStringResult(await readErrorAsync());
                if (!string.IsNullOrWhiteSpace(error))
                {
                    throw new InvalidOperationException(error);
                }
            }

            var rawDone = await _webView.EvaluateJavaScriptAsync(doneExpression);
            if (NormalizeJavaScriptStringResult(rawDone) == "true")
            {
                return true;
            }

            await Task.Delay(delayMs);
        }

        return false;
    }

    public static string NormalizeJavaScriptStringResult(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value == "null")
        {
            return string.Empty;
        }

        var trimmed = value.Trim();
        if (trimmed.Length >= 2 && trimmed[0] == '"' && trimmed[^1] == '"')
        {
            trimmed = trimmed[1..^1];
        }

        return trimmed
            .Replace("\\n", "\n")
            .Replace("\\r", "\r")
            .Replace("\\\"", "\"")
            .Replace("\\\\", "\\");
    }
}

public sealed record WebViewOptionExtractionResult(
    bool Ok,
    string Message,
    IReadOnlyList<DetectedFieldOption> Options,
    bool OptionsTruncated);
