namespace JobAutofill.Domain.Models;

public sealed class LocalFieldMatch
{
    public required string FieldId { get; init; }
    public string? MatchedProfileAttribute { get; init; }
    public string? ProposedValue { get; init; }
    public double Confidence { get; init; }
    public bool IsResolved => !string.IsNullOrWhiteSpace(ProposedValue);
    public string Reason { get; init; } = string.Empty;
}
