using JobAutofill.App.Models.WebView;
using JobAutofill.App.WebView;

namespace JobAutofill.App.Services;

public sealed class JobBrowserStatusService : IJobBrowserStatusService
{
    public string BuildScanStatusText(
        int detectedCount,
        int optionsCapturedCount,
        int fillableCount,
        int approvedCount,
        int apiDecisionCount,
        int blockedCount,
        WebViewCapabilityResult capability,
        string? noFieldsHint)
    {
        if (detectedCount == 0)
        {
            var pageHint = capability.IsHardStop
                ? capability.Message
                : noFieldsHint ?? "This page does not expose standard form fields in the current runtime state.";

            return $"No fields detected. {pageHint} Tap Debug to see diagnostics.";
        }

        if (capability.IsPartialScan)
        {
            return $"Found {detectedCount} fields, {optionsCapturedCount} with options, {fillableCount} ready, {approvedCount} approved, {apiDecisionCount} need API, {blockedCount} blocked. Partial scan: {capability.Message}";
        }

        return $"Found {detectedCount} fields, {optionsCapturedCount} with options, {fillableCount} ready, {approvedCount} approved, {apiDecisionCount} need API, {blockedCount} blocked.";
    }

    public async Task<string> GetNoFieldsHintAsync(IJobWebViewBridge webViewBridge)
    {
        var pageClassification = await webViewBridge.GetCurrentPageClassificationAsync();
        return pageClassification switch
        {
            "auth-gated" => "This page is login-gated or requires auth before form fields are exposed.",
            "iframe-based" => "This page appears to use iframe-based content and is not supported in Tier 1.",
            "custom-app-shell" => "This page appears to use a custom app shell or non-standard form implementation.",
            _ => "This page does not expose standard form fields in the current runtime state."
        };
    }
}
