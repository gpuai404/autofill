namespace JobAutofill.Core.Contracts;

public interface IApiFieldDecisionClient
{
    Task<IReadOnlyList<ApiFieldDecisionResult>> DecideAsync(
        ApiFieldDecisionRequest request,
        CancellationToken cancellationToken = default);
}
