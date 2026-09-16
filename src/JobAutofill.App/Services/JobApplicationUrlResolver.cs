namespace JobAutofill.App.Services;

public sealed class JobApplicationUrlResolver : IJobApplicationUrlResolver
{
    private static readonly SiteDefinition[] Sites =
    [
        new("lever", host => host.Equals("jobs.lever.co", StringComparison.OrdinalIgnoreCase), "site-profiles/lever.json", AddLeverApplyPath),
        new("greenhouse", host => HostMatches(host, "greenhouse.io"), "site-profiles/greenhouse.json"),
        new("workday", host => HostMatches(host, "myworkdayjobs.com"), "site-profiles/workday.json"),
        new("ashby", host => host.Equals("jobs.ashbyhq.com", StringComparison.OrdinalIgnoreCase), "site-profiles/ashby.json"),
        new("smartrecruiters", host => host.Equals("jobs.smartrecruiters.com", StringComparison.OrdinalIgnoreCase), "site-profiles/smartrecruiters.json")
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
        new(siteId, url, "site-profiles/default.json", SiteProfileMode.Generic);

    private static ResolvedJobSite ResolveSite(SiteDefinition site, Uri uri)
    {
        return new ResolvedJobSite(
            site.Id,
            (site.TransformUrl?.Invoke(uri) ?? uri).ToString(),
            site.ProfileAssetName,
            SiteProfileMode.Profiled);
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
        string ProfileAssetName,
        Func<Uri, Uri>? TransformUrl = null);
}
