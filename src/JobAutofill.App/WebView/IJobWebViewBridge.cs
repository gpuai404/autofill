using JobAutofill.App.Models.WebView;
using JobAutofill.Domain.Models;
using JobAutofill.App.Services;

namespace JobAutofill.App.WebView;

public interface IJobWebViewBridge
{
    void ResetInjectedState();
    void ConfigureSite(ResolvedJobSite site, bool enableDiagnostics);
    Task EnsureDetectorInjectedAsync();
    Task<WebViewScanResult> ScanAsync();
    Task<WebViewOptionExtractionResult> ExtractOptionsForFieldAsync(DetectedField field);
    Task CloseOpenOptionPopupsAsync();
    Task<string> GetCurrentPageClassificationAsync();
    Task<string> GetCurrentPageLanguageAsync();
    Task FocusFieldAsync(DetectedField field);
    Task<WebViewFillResult> FillAsync(FillCommand command);
    Task<WebViewFillResult> FillFieldOptionAsync(FillCommand command, SelectedFieldOption option);
    Task ClearFieldHighlightAsync(DetectedField field);
    Task<string> GetEncodedScanDebugJsonAsync();
    Task EnsureFillScriptInjectedAsync();
}
