using JobAutofill.Core.Contracts;
using JobAutofill.Infrastructure.Api;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace JobAutofill.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddJobAutofillInfrastructure(
        this IServiceCollection services,
        Action<ApiFieldDecisionClientOptions>? configureFieldDecisionClient = null)
    {
        services.AddSingleton<IApiSecretProvider, EnvironmentApiSecretProvider>();

        services
            .AddOptions<ApiFieldDecisionClientOptions>()
            .Configure(options =>
            {
                var environmentOptions = ApiFieldDecisionClientOptions.FromEnvironment();
                options.BaseUrl = environmentOptions.BaseUrl;
                options.DecisionsPath = environmentOptions.DecisionsPath;
                options.ApiKeySecretName = environmentOptions.ApiKeySecretName;
                options.Timeout = environmentOptions.Timeout;
                configureFieldDecisionClient?.Invoke(options);
            });

        services.AddHttpClient<IApiFieldDecisionClient, ApiFieldDecisionClient>(
            (serviceProvider, httpClient) =>
            {
                var options = serviceProvider.GetRequiredService<IOptions<ApiFieldDecisionClientOptions>>().Value;
                httpClient.BaseAddress = options.BaseUrl;
                httpClient.Timeout = options.Timeout;
            });

        return services;
    }
}
