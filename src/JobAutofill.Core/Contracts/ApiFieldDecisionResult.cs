using JobAutofill.Domain.Models;

namespace JobAutofill.Core.Contracts;

public sealed class ApiFieldDecisionResult
{
    public required string FieldId { get; init; }
    public FieldDecisionKind Decision { get; init; }
    public string? MatchedProfileAttribute { get; init; }
    public string? ProposedValue { get; init; }
    public IReadOnlyList<SelectedFieldOption> SelectedOptions { get; init; } = [];
    public double Confidence { get; init; }
    public bool RequiresUserApproval { get; init; } = true;
    public string Reason { get; init; } = string.Empty;
}
