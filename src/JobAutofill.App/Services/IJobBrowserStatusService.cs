using JobAutofill.App.Models.WebView;
using JobAutofill.App.WebView;

namespace JobAutofill.App.Services;

public interface IJobBrowserStatusService
{
    string BuildScanStatusText(
        int detectedCount,
        int readyCount,
        int attentionCount,
        int manualCount,
        WebViewCapabilityResult capability,
        string? noFieldsHint);

    Task<string> GetNoFieldsHintAsync(IJobWebViewBridge webViewBridge);
}
