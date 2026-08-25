namespace JobAutofill.App.ViewModels;

public enum FieldDecisionStatus
{
    ReadyToFill,
    NeedsApiDecision,
    Blocked
}

public enum FieldDecisionReason
{
    None,
    MissingProfileValue,
    MissingOptions,
    OptionMismatch,
    AmbiguousSelectionMode,
    ManualOnlyControl,
    UnsupportedControl
}
