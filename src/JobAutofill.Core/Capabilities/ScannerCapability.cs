namespace JobAutofill.Core.Capabilities;

public sealed class ScannerCapability
{
    public required string Name { get; init; }
    public required ScannerCapabilityStatus Status { get; init; }
    public string? Reason { get; init; }
    public string? Message { get; init; }
}
