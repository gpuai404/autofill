using JobAutofill.Domain.Models;

namespace JobAutofill.App.Models.WebView;

public sealed record WebViewOptionExtractionResult(
    bool Ok,
    string Message,
    IReadOnlyList<DetectedFieldOption> Options,
    bool OptionsTruncated);
