namespace JobAutofill.Domain.Rules;

public sealed class FieldControlRule
{
    public required string ControlType { get; init; }
    public required string Family { get; init; }
    public bool RequiresCapturedOption { get; init; }
    public string? ValuePolicy { get; init; }
    public string? FillStrategy { get; init; }
    public string? OptionSourceGroup { get; init; }
    public string? ExtractionActionGroup { get; init; }
}
