using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using JobAutofill.Core.Contracts;
using Microsoft.Extensions.Options;

namespace JobAutofill.Infrastructure.Api;

public sealed class ApiFieldDecisionClient : IApiFieldDecisionClient
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) }
    };

    private readonly HttpClient _httpClient;
    private readonly ApiFieldDecisionClientOptions _options;
    private readonly IApiSecretProvider _secretProvider;

    public ApiFieldDecisionClient(
        HttpClient httpClient,
        IOptions<ApiFieldDecisionClientOptions> options,
        IApiSecretProvider secretProvider)
    {
        _httpClient = httpClient;
        _options = options.Value;
        _secretProvider = secretProvider;
    }

    public async Task<IReadOnlyList<ApiFieldDecisionResult>> DecideAsync(
        ApiFieldDecisionRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        EnsureConfigured();

        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, _options.NormalizedDecisionsPath)
        {
            Content = JsonContent.Create(request, options: SerializerOptions)
        };

        var bearerToken = _secretProvider.GetSecret(_options.ApiKeySecretName);
        if (!string.IsNullOrWhiteSpace(bearerToken))
        {
            httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearerToken);
        }

        using var response = await _httpClient.SendAsync(httpRequest, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
            throw new HttpRequestException(
                $"Field decision API returned {(int)response.StatusCode} ({response.ReasonPhrase}). {TrimForException(responseBody)}",
                null,
                response.StatusCode);
        }

        var decisionResponse = await response.Content.ReadFromJsonAsync<ApiFieldDecisionResponse>(
            SerializerOptions,
            cancellationToken);

        return decisionResponse?.Results ?? [];
    }

    private void EnsureConfigured()
    {
        if (_httpClient.BaseAddress is null)
        {
            throw new InvalidOperationException(
                $"Field decision API is not configured. Set {ApiFieldDecisionClientOptions.BaseUrlEnvironmentVariable}.");
        }
    }

    private static string TrimForException(string responseBody)
    {
        if (string.IsNullOrWhiteSpace(responseBody))
        {
            return string.Empty;
        }

        var trimmed = responseBody.Trim();
        return trimmed.Length <= 500
            ? trimmed
            : trimmed[..500] + "...";
    }
}
