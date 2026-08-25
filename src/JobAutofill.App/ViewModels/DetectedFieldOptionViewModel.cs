using System.Text.Json;

namespace JobAutofill.App.ViewModels;

public sealed class DetectedFieldOptionViewModel
{
    public string? Value { get; init; }
    public string? Label { get; init; }
    public string? Selector { get; init; }
    public string? Source { get; init; }
    public string? FillMethod { get; init; }
    public bool Selected { get; init; }
    public int Position { get; init; }
    public string FillValue => DisplayText;
    public string DisplayText => !string.IsNullOrWhiteSpace(Label) ? Label : Value ?? string.Empty;

    public object ToDebugObject()
    {
        return new
        {
            Value,
            Label,
            Selector,
            Source,
            FillMethod,
            Selected,
            Position,
            FillValue,
            DisplayText
        };
    }

    public string ToJson()
    {
        return JsonSerializer.Serialize(this);
    }
}
