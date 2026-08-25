namespace JobAutofill.Domain.Models;

public enum ApprovalItemStatus
{
    ReadyForApproval,
    NeedsApiDecision,
    NeedsUserInput,
    Approved,
    Skipped,
    Blocked
}
