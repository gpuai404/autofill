using JobAutofill.Core.Contracts;

namespace JobAutofill.Infrastructure.Api;

public sealed class PlaceholderApiFieldDecisionClient : IApiFieldDecisionClient
{
    public Task<IReadOnlyList<ApiFieldDecisionResult>> DecideAsync(
        ApiFieldDecisionRequest request,
        CancellationToken cancellationToken = default)
    {
        return Task.FromResult<IReadOnlyList<ApiFieldDecisionResult>>([]);
    }
}
