using JobAutofill.Core.Matching;
using JobAutofill.Domain.Models;

namespace JobAutofill.Core.Workflow;

public sealed record ApplicationFieldPreparation(
    ScanContext Context,
    IReadOnlyList<ApplicationFieldState> Fields,
    IReadOnlyList<FieldConsolidationResult> Consolidation);

public sealed class ApplicationFieldPipeline
{
    private readonly FieldConsolidator _consolidator;
    private readonly ProfileProposalMatcher _matcher;
    private readonly FieldPolicyEvaluator _policy;

    public ApplicationFieldPipeline(
        FieldConsolidator consolidator,
        ProfileProposalMatcher matcher,
        FieldPolicyEvaluator policy)
    {
        _consolidator = consolidator;
        _matcher = matcher;
        _policy = policy;
    }

    public ApplicationFieldPreparation Prepare(
        ScanContext context,
        IReadOnlyList<DetectedField> detectedFields,
        Profile profile)
    {
        var consolidation = _consolidator.Consolidate(context, detectedFields);
        var fields = consolidation
            .Where(result => result.Field is not null)
            .Select(result => result.Field!)
            .Select(field => _policy.Evaluate(field, _matcher.Match(field, profile, context)))
            .ToList();
        return new(context, fields, consolidation);
    }
}
