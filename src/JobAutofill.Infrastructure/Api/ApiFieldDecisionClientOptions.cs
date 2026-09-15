namespace JobAutofill.Infrastructure.Api;

public sealed class ApiFieldDecisionClientOptions
{
    public const string BaseUrlEnvironmentVariable = "JOBAUTOFILL_FIELD_DECISION_BASE_URL";
    public const string DecisionsPathEnvironmentVariable = "JOBAUTOFILL_FIELD_DECISION_PATH";
    public const string ApiKeyEnvironmentVariable = "JOBAUTOFILL_FIELD_DECISION_API_KEY";
    public const string TimeoutSecondsEnvironmentVariable = "JOBAUTOFILL_FIELD_DECISION_TIMEOUT_SECONDS";

    public Uri? BaseUrl { get; set; }
    public string DecisionsPath { get; set; } = "/v1/field-decisions";
    public string ApiKeySecretName { get; set; } = ApiKeyEnvironmentVariable;
    public TimeSpan Timeout { get; set; } = TimeSpan.FromSeconds(30);

    public string NormalizedDecisionsPath =>
        string.IsNullOrWhiteSpace(DecisionsPath)
            ? "/v1/field-decisions"
            : DecisionsPath.StartsWith("/", StringComparison.Ordinal)
                ? DecisionsPath
                : $"/{DecisionsPath}";

    public static ApiFieldDecisionClientOptions FromEnvironment()
    {
        var options = new ApiFieldDecisionClientOptions();

        var baseUrl = Environment.GetEnvironmentVariable(BaseUrlEnvironmentVariable);
        if (Uri.TryCreate(baseUrl, UriKind.Absolute, out var parsedBaseUrl))
        {
            options.BaseUrl = parsedBaseUrl;
        }

        var decisionsPath = Environment.GetEnvironmentVariable(DecisionsPathEnvironmentVariable);
        if (!string.IsNullOrWhiteSpace(decisionsPath))
        {
            options.DecisionsPath = decisionsPath;
        }

        var timeoutSeconds = Environment.GetEnvironmentVariable(TimeoutSecondsEnvironmentVariable);
        if (int.TryParse(timeoutSeconds, out var parsedTimeoutSeconds) && parsedTimeoutSeconds > 0)
        {
            options.Timeout = TimeSpan.FromSeconds(parsedTimeoutSeconds);
        }

        return options;
    }
}
