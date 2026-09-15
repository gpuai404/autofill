using JobAutofill.Core.Matching;
using JobAutofill.Core.Workflow;
using JobAutofill.Domain.Models;
using Xunit;

namespace JobAutofill.Core.Tests;

public sealed class ApplicationFieldPipelineTests
{
    private readonly FieldConsolidator _consolidator = new();
    private readonly ProfileProposalMatcher _matcher = new();
    private readonly FieldPolicyEvaluator _policy = new();
    private readonly ScanContext _context = ScanContext.Create("https://example.test/apply", "en");

    [Fact]
    public void ConsentIsNeverProposedOrAutomaticallyResolved()
    {
        var field = Descriptor("I certify that this information is correct", "checkboxBoolean", "setChecked");
        var proposal = _matcher.Match(field, new Profile(), _context);
        var state = _policy.Evaluate(field, proposal);

        Assert.Null(proposal);
        Assert.Equal(FieldSensitivity.ConsentOrCertification, field.Sensitivity);
        Assert.Equal(FieldResolutionState.NeedsInput, state.Resolution);
        Assert.False(state.IsReadyToFill);
    }

    [Fact]
    public void ExactEmailMatchIsReadyForAutomaticFill()
    {
        var field = Descriptor("Email address", "email", "setNativeValue");
        var proposal = _matcher.Match(field, new Profile { Email = "person@example.test" }, _context);
        var state = _policy.Evaluate(field, proposal);

        Assert.NotNull(proposal);
        Assert.Equal("Email", proposal.ProfileAttribute);
        Assert.Equal(FieldResolutionState.Resolved, state.Resolution);
        Assert.True(state.IsReadyToFill);
    }

    [Fact]
    public void MissingProfileFactRequiresUserInputInsteadOfBeingInvented()
    {
        var field = Descriptor("Phone number", "phone", "setNativeValue");
        var state = _policy.Evaluate(field, _matcher.Match(field, new Profile(), _context));

        Assert.Null(state.Proposal);
        Assert.Equal(FieldResolutionState.NeedsInput, state.Resolution);
    }

    [Fact]
    public void UnlabelledFieldIsRetainedAsUnidentified()
    {
        var source = Source(null, "text", "setNativeValue");
        var result = Assert.Single(_consolidator.Consolidate(_context, [source]));

        Assert.Equal(FieldDisposition.Unidentified, result.Disposition);
        Assert.NotNull(result.Field);
    }

    [Fact]
    public void ActionButtonsAreSeparatedFromAnswerFields()
    {
        var source = Source("Submit application", "actionButton", "skip");
        var result = Assert.Single(_consolidator.Consolidate(_context, [source]));

        Assert.Equal(FieldDisposition.Informational, result.Disposition);
        Assert.Null(result.Field);
    }

    [Fact]
    public void SensitiveProfileValueRequiresReview()
    {
        var field = Descriptor("Salary expectation", "text", "setNativeValue");
        var proposal = _matcher.Match(field, new Profile { SalaryExpectation = "100000" }, _context);
        var state = _policy.Evaluate(field, proposal);

        Assert.NotNull(proposal);
        Assert.Equal(FieldSensitivity.Personal, field.Sensitivity);
        Assert.Equal(FieldResolutionState.NeedsReview, state.Resolution);
        Assert.False(state.IsReadyToFill);
    }

    [Fact]
    public void ExactDuplicateEvidenceHasAnExplicitDisposition()
    {
        var source = Source("Email", "email", "setNativeValue");
        var results = _consolidator.Consolidate(_context, [source, source]);

        Assert.Equal(FieldDisposition.Included, results[0].Disposition);
        Assert.Equal(FieldDisposition.Duplicate, results[1].Disposition);
    }

    private ApplicationFieldDescriptor Descriptor(string label, string controlType, string fillStrategy)
    {
        var source = Source(label, controlType, fillStrategy);
        return Assert.Single(_consolidator.Consolidate(_context, [source])).Field!;
    }

    private static DetectedField Source(string? label, string controlType, string fillStrategy) => new()
    {
        Selector = "#field",
        Label = label,
        ControlType = controlType,
        FillStrategy = fillStrategy,
        Required = "true"
    };
}
