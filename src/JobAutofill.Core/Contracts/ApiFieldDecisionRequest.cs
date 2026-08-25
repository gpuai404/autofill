using JobAutofill.Core.Capabilities;
using JobAutofill.Domain.Models;

namespace JobAutofill.Core.Contracts;

public sealed class ApiFieldDecisionRequest
{
    public required string PageUrl { get; init; }
    public string? PageHost { get; init; }
    public string? PageLocale { get; init; }
    public string? CountryHint { get; init; }
    public ScannerCapabilityReport? CapabilityReport { get; init; }
    public required IReadOnlyList<DetectedField> Fields { get; init; }
    public required Profile Profile { get; init; }
}
