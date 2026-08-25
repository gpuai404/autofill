namespace JobAutofill.Domain.Models;

public sealed class SelectedFieldOption
{
    public string? Value { get; init; }
    public string? Label { get; init; }
    public string? Selector { get; init; }
}
