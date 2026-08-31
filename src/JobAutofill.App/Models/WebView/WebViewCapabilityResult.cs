using JobAutofill.Core.Capabilities;

namespace JobAutofill.App.Models.WebView;

public sealed record WebViewCapabilityResult(
    bool Scannable,
    string Status,
    string? Reason,
    string Message,
    string RawJson)
{
    public static WebViewCapabilityResult Unknown { get; } = new(
        true,
        "unknown",
        null,
        "Page capability was not reported by the browser runtime.",
        "{}");

    public bool IsHardStop => string.Equals(Status, "hard-stop", StringComparison.OrdinalIgnoreCase) || !Scannable;
    public bool IsPartialScan => string.Equals(Status, "partial-scan", StringComparison.OrdinalIgnoreCase);

    public ScannerCapabilityReport ToCoreReport()
    {
        return new ScannerCapabilityReport
        {
            Scannable = Scannable,
            Status = ToCoreStatus(Status, Scannable),
            Reason = Reason,
            Message = Message,
            RawJson = RawJson,
            Capabilities =
            [
                new ScannerCapability
                {
                    Name = "android-webview-dom-scan",
                    Status = ToCoreStatus(Status, Scannable),
                    Reason = Reason,
                    Message = Message
                }
            ]
        };
    }

    private static ScannerCapabilityStatus ToCoreStatus(string? status, bool scannable)
    {
        if (!scannable || string.Equals(status, "hard-stop", StringComparison.OrdinalIgnoreCase))
        {
            return ScannerCapabilityStatus.HardStop;
        }

        if (string.Equals(status, "partial-scan", StringComparison.OrdinalIgnoreCase))
        {
            return ScannerCapabilityStatus.PartialScan;
        }

        if (string.Equals(status, "supported", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(status, "ok", StringComparison.OrdinalIgnoreCase))
        {
            return ScannerCapabilityStatus.Supported;
        }

        return ScannerCapabilityStatus.Unknown;
    }
}
