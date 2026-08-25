namespace JobAutofill.Core.Contracts;

public sealed class ApiFieldDecisionResponse
{
    public IReadOnlyList<ApiFieldDecisionResult> Results { get; init; } = [];
}
