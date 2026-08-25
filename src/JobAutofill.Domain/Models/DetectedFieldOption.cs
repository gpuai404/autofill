namespace JobAutofill.Domain.Models;

public class DetectedFieldOption
{
    public string? Value { get; set; }
    public string? Label { get; set; }
    public string? Selector { get; set; }
    public string? Source { get; set; }
    public string? FillMethod { get; set; }
    public bool Selected { get; set; }
    public int Position { get; set; }
}
