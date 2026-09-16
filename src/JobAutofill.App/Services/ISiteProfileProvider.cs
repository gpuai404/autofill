using System.Text.Json;

namespace JobAutofill.App.Services;

public interface ISiteProfileProvider
{
    Task<string> GetProfileJsonAsync(ResolvedJobSite site);
}

/// <summary>
/// Trusted packaged fallback. A remote provider can be composed in front of
/// this provider only after signature, schema and compatibility validation.
/// </summary>
public sealed class EmbeddedSiteProfileProvider : ISiteProfileProvider
{
    public async Task<string> GetProfileJsonAsync(ResolvedJobSite site)
    {
        ArgumentNullException.ThrowIfNull(site);
        await using var stream = await OpenAssetAsync(site.ProfileAssetName);
        using var reader = new StreamReader(stream);
        var json = await reader.ReadToEndAsync();
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        if (root.ValueKind != JsonValueKind.Object ||
            !root.TryGetProperty("schemaVersion", out var schemaVersion) || schemaVersion.GetInt32() != 1 ||
            !root.TryGetProperty("siteId", out var siteIdElement))
        {
            throw new InvalidOperationException($"{site.ProfileAssetName} is not a supported site profile.");
        }

        var profileSiteId = siteIdElement.GetString();
        var expectedSiteId = site.ProfileMode == SiteProfileMode.Generic ? "generic" : site.SiteId;
        if (!string.Equals(profileSiteId, expectedSiteId, StringComparison.Ordinal))
        {
            throw new InvalidOperationException($"{site.ProfileAssetName} does not match site '{site.SiteId}'.");
        }

        return JsonSerializer.Serialize(root);
    }

    private static Task<Stream> OpenAssetAsync(string assetName)
    {
#if ANDROID
        return Task.FromResult<Stream>(global::Android.App.Application.Context.Assets!.Open(assetName));
#else
        return FileSystem.OpenAppPackageFileAsync(assetName);
#endif
    }
}
