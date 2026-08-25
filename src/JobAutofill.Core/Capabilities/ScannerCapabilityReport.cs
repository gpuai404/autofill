namespace JobAutofill.Core.Capabilities;

public sealed class ScannerCapabilityReport
{
    public required bool Scannable { get; init; }
    public required ScannerCapabilityStatus Status { get; init; }
    public string? Reason { get; init; }
    public string? Message { get; init; }
    public string? RawJson { get; init; }
    public IReadOnlyList<ScannerCapability> Capabilities { get; init; } = [];
}
