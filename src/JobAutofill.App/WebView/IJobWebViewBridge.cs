using JobAutofill.App.Models.WebView;
using JobAutofill.Domain.Models;

namespace JobAutofill.App.WebView;

public interface IJobWebViewBridge
{
    void ResetInjectedState();
    Task EnsureDetectorInjectedAsync();
    Task<WebViewScanResult> ScanAsync();
    Task<WebViewOptionExtractionResult> ExtractOptionsForFieldAsync(DetectedField field);
    Task CloseOpenOptionPopupsAsync();
    Task<string> GetCurrentPageClassificationAsync();
    Task FocusFieldAsync(DetectedField field);
    Task<WebViewFillResult> FillAsync(FillCommand command);
    Task<WebViewFillResult> FillFieldOptionAsync(FillCommand command, SelectedFieldOption option);
    Task ClearFieldHighlightAsync(DetectedField field);
    Task<string> GetEncodedScanDebugJsonAsync();
    Task EnsureFillScriptInjectedAsync();
}
