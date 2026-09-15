namespace JobAutofill.App.Services;

public sealed class JobApplicationUrlResolver : IJobApplicationUrlResolver
{
    private static readonly SiteDefinition[] Sites =
    [
        new("lever", host => host.Equals("jobs.lever.co", StringComparison.OrdinalIgnoreCase), TransformUrl: AddLeverApplyPath),
        new("greenhouse", host => HostMatches(host, "greenhouse.io")),
        new("workday", host => HostMatches(host, "myworkdayjobs.com")),
        new("ashby", host => host.Equals("jobs.ashbyhq.com", StringComparison.OrdinalIgnoreCase)),
        new("smartrecruiters", host => host.Equals("jobs.smartrecruiters.com", StringComparison.OrdinalIgnoreCase))
    ];

    public ResolvedJobSite Resolve(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri))
        {
            return GenericSite("unknown", url);
        }

        var site = Sites.FirstOrDefault(candidate => candidate.MatchesHost(uri.Host));
        return site is null
            ? GenericSite("unknown", url)
            : ResolveSite(site, uri);
    }

    private static ResolvedJobSite GenericSite(string siteId, string url) =>
        new(siteId, url, "site-rules/default.js", SiteAdapterMode.Generic);

    private static ResolvedJobSite ResolveSite(SiteDefinition site, Uri uri)
    {
        var rulesAssetName = site.RulesAssetName ?? "site-rules/default.js";
        var adapterMode = site.RulesAssetName is null
            ? SiteAdapterMode.Generic
            : SiteAdapterMode.Verified;
        return new ResolvedJobSite(
            site.Id,
            (site.TransformUrl?.Invoke(uri) ?? uri).ToString(),
            rulesAssetName,
            adapterMode);
    }

    private static Uri AddLeverApplyPath(Uri uri)
    {
        if (uri.AbsolutePath.EndsWith("/apply", StringComparison.OrdinalIgnoreCase))
        {
            return uri;
        }

        var builder = new UriBuilder(uri)
        {
            Path = uri.AbsolutePath.TrimEnd('/') + "/apply"
        };

        return builder.Uri;
    }

    private static bool HostMatches(string host, string suffix) =>
        host.Equals(suffix, StringComparison.OrdinalIgnoreCase) ||
        host.EndsWith('.' + suffix, StringComparison.OrdinalIgnoreCase);

    private sealed record SiteDefinition(
        string Id,
        Func<string, bool> MatchesHost,
        Func<Uri, Uri>? TransformUrl = null,
        string? RulesAssetName = null);
}
