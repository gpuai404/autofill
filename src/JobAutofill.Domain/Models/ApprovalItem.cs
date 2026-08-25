using JobAutofill.Domain.Models;

namespace JobAutofill.Domain.Models;

public sealed class ApprovalItem
{
    public required string FieldId { get; init; }
    public required DetectedField Field { get; init; }
    public string? MatchedProfileAttribute { get; init; }
    public string? ProposedValue { get; init; }
    public IReadOnlyList<SelectedFieldOption> SelectedOptions { get; init; } = [];
    public double Confidence { get; init; }
    public ApprovalItemStatus Status { get; init; }
    public ApprovalDecisionReason Reason { get; init; }
    public string Message { get; init; } = string.Empty;

    public bool CanBecomeFillCommand =>
        Status == ApprovalItemStatus.Approved &&
        (!string.IsNullOrWhiteSpace(ProposedValue) || SelectedOptions.Count > 0);
}
