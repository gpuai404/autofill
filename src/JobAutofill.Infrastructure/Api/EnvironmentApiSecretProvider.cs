namespace JobAutofill.Infrastructure.Api;

public sealed class EnvironmentApiSecretProvider : IApiSecretProvider
{
    public string? GetSecret(string secretName)
    {
        return string.IsNullOrWhiteSpace(secretName)
            ? null
            : Environment.GetEnvironmentVariable(secretName);
    }
}
