using JobAutofill.App.Models.WebView;
using JobAutofill.App.WebView;

namespace JobAutofill.App.Services;

public sealed class JobBrowserStatusService : IJobBrowserStatusService
{
    public string BuildScanStatusText(
        int detectedCount,
        int readyCount,
        int attentionCount,
        int manualCount,
        WebViewCapabilityResult capability,
        string? noFieldsHint)
    {
        if (detectedCount == 0)
        {
            var pageHint = capability.IsHardStop
                ? capability.Message
                : noFieldsHint ?? "This page does not expose standard form fields in the current runtime state.";

            return $"No application fields found. {pageHint}";
        }

        if (capability.IsPartialScan)
        {
            return $"Found {detectedCount} fields: {readyCount} ready, {attentionCount} need attention, {manualCount} manual. Partial scan: {capability.Message}";
        }

        return $"Found {detectedCount} fields: {readyCount} ready, {attentionCount} need attention, {manualCount} manual.";
    }

    public async Task<string> GetNoFieldsHintAsync(IJobWebViewBridge webViewBridge)
    {
        var pageClassification = await webViewBridge.GetCurrentPageClassificationAsync();
        return pageClassification switch
        {
            "auth-gated" => "This page is login-gated or requires auth before form fields are exposed.",
            "iframe-based" => "The application is embedded in a protected frame that this app cannot access.",
            "custom-app-shell" => "The application uses controls that cannot be scanned safely on this page.",
            _ => "This page does not expose standard form fields in the current runtime state."
        };
    }
}
