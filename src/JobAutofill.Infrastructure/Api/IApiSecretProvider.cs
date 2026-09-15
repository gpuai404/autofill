namespace JobAutofill.Infrastructure.Api;

public interface IApiSecretProvider
{
    string? GetSecret(string secretName);
}
