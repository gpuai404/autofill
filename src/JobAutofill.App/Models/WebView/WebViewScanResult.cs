using JobAutofill.Domain.Models;

namespace JobAutofill.App.Models.WebView;

public sealed record WebViewScanResult(
    string RawResult,
    IReadOnlyList<DetectedField> Fields,
    WebViewCapabilityResult Capability);
