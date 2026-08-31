using JobAutofill.App.Models.WebView;
using JobAutofill.App.WebView;

namespace JobAutofill.App.Services;

public interface IJobBrowserStatusService
{
    string BuildScanStatusText(
        int detectedCount,
        int optionsCapturedCount,
        int fillableCount,
        int approvedCount,
        int apiDecisionCount,
        int blockedCount,
        WebViewCapabilityResult capability,
        string? noFieldsHint);

    Task<string> GetNoFieldsHintAsync(IJobWebViewBridge webViewBridge);
}
