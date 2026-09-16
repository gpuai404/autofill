namespace JobAutofill.Domain.Models;

public class DetectedField
{
    public required string Selector { get; set; }
    public string? Label { get; set; }
    public string? LabelSource { get; set; }
    public double LabelConfidence { get; set; }
    public string? InputType { get; set; }
    public string? ControlType { get; set; }
    public string? ControlFamily { get; set; }
    public string? SelectionMode { get; set; }
    public string? SelectionModeReason { get; set; }
    public string? FieldCategory { get; set; }
    public string? FieldSubCategory { get; set; }
    public string? FieldCategoryReason { get; set; }
    public string? NativeInputType { get; set; }
    public string? TagName { get; set; }
    public string? Role { get; set; }
    public string? AriaHasPopup { get; set; }
    public string? AriaExpanded { get; set; }
    public string? AriaControls { get; set; }
    public string? AriaOwns { get; set; }
    public string? AriaActiveDescendant { get; set; }
    public string? AriaAutocomplete { get; set; }
    public string? AriaMultiselectable { get; set; }
    public string? Autocomplete { get; set; }
    public string? List { get; set; }
    public string? Required { get; set; }
    public string? Optional { get; set; }
    public string? Disabled { get; set; }
    public string? Readonly { get; set; }
    public string? Multiple { get; set; }
    public string? ScanReason { get; set; }
    public string? FieldMessage { get; set; }
    public bool RequiresCapturedOption { get; set; }
    public string? ValuePolicy { get; set; }
    public string? FillStrategy { get; set; }
    public string? OptionSourceGroup { get; set; }
    public string? ExtractionActionGroup { get; set; }
    public IReadOnlyList<DetectedFieldOption> Options { get; set; } = [];
    public bool OptionsTruncated { get; set; }
    public string? OptionsScanReason { get; set; }
    public string? SourceUrl { get; set; }
}
