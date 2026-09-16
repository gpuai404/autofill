namespace JobAutofill.Domain.Models;

public enum ApplicationControlKind
{
    Text,
    Number,
    Date,
    Boolean,
    SingleChoice,
    MultipleChoice,
    File,
    Password,
    Unknown
}

public enum FieldRequirement
{
    Unknown,
    Optional,
    Required
}

public enum FieldFillCapability
{
    Automatic,
    Manual,
    Unsupported
}

public enum FieldOptionBehavior
{
    None,
    Captured,
    Popup,
    Searchable
}

public enum FieldSensitivity
{
    Standard,
    Personal,
    Sensitive,
    ConsentOrCertification
}

public enum FieldResolutionState
{
    Resolved,
    NeedsReview,
    NeedsInput,
    IntentionallySkipped
}

public enum FieldExecutionState
{
    NotAttempted,
    Filling,
    Filled,
    Failed,
    Stale
}

public enum FieldProposalSource
{
    ExistingPageValue,
    UserProfile,
    DecisionService,
    User
}

public sealed record ScanContext(
    string ScanId,
    string PageUrl,
    string Language,
    DateTimeOffset CapturedAtUtc)
{
    public static ScanContext Create(string pageUrl, string? language = null) =>
        new(Guid.NewGuid().ToString("N"), pageUrl, language ?? "en", DateTimeOffset.UtcNow);
}

public sealed record ApplicationFieldDescriptor
{
    public required string FieldId { get; init; }
    public required string ScanId { get; init; }
    public required string Locator { get; init; }
    public required string Label { get; init; }
    public required string LabelSource { get; init; }
    public required double LabelConfidence { get; init; }
    public required ApplicationControlKind ControlKind { get; init; }
    public required FieldRequirement Requirement { get; init; }
    public required FieldFillCapability FillCapability { get; init; }
    public required FieldOptionBehavior OptionBehavior { get; init; }
    public required FieldSensitivity Sensitivity { get; init; }
    public required DetectedField Source { get; init; }
    public IReadOnlyList<DetectedFieldOption> Options { get; init; } = [];
}

public sealed record FieldProposal
{
    public required string FieldId { get; init; }
    public required string ProfileAttribute { get; init; }
    public required string Value { get; init; }
    public required double Score { get; init; }
    public required FieldProposalSource Source { get; init; }
    public required string Evidence { get; init; }
    public required double FieldIdentityConfidence { get; init; }
    public IReadOnlyList<SelectedFieldOption> SelectedOptions { get; init; } = [];
}

public sealed record ApplicationFieldState
{
    public required ApplicationFieldDescriptor Field { get; init; }
    public FieldProposal? Proposal { get; init; }
    public required FieldResolutionState Resolution { get; init; }
    public FieldExecutionState Execution { get; init; } = FieldExecutionState.NotAttempted;
    public required string Message { get; init; }

    public bool IsReadyToFill =>
        Resolution == FieldResolutionState.Resolved &&
        Field.FillCapability == FieldFillCapability.Automatic &&
        Execution is FieldExecutionState.NotAttempted or FieldExecutionState.Failed;
}

public sealed record FieldFillResult(
    string FieldId,
    FieldExecutionState Outcome,
    string? ExpectedValue,
    string? ObservedValue,
    string Message,
    bool CanRetry);
