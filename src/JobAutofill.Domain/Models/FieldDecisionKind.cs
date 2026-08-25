namespace JobAutofill.Domain.Models;

public enum FieldDecisionKind
{
    FillValue,
    ProposeText,
    SelectOption,
    SelectOptions,
    NeedsUserInput,
    Skip,
    Block
}
