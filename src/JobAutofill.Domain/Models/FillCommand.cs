namespace JobAutofill.Domain.Models;

public sealed class FillCommand
{
    public required string FieldId { get; init; }
    public required string Selector { get; init; }
    public string? Value { get; init; }
    public IReadOnlyList<SelectedFieldOption> SelectedOptions { get; init; } = [];
    public string? FillStrategy { get; init; }
}
