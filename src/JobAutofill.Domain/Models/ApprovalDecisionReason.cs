namespace JobAutofill.Domain.Models;

public enum ApprovalDecisionReason
{
    None,
    LocalHighConfidenceMatch,
    ApiDecision,
    MissingProfileValue,
    MissingOptions,
    OptionMismatch,
    AmbiguousSelectionMode,
    ManualOnlyControl,
    UnsupportedControl,
    ApiUnavailable,
    ApiCannotDecide
}
