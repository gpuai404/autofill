using JobAutofill.Domain.Models;

namespace JobAutofill.App.WebView;

public sealed record WebViewScanResult(
    string RawResult,
    IReadOnlyList<DetectedField> Fields,
    WebViewCapabilityResult Capability);
