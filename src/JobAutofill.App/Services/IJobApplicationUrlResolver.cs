namespace JobAutofill.App.Services;

public interface IJobApplicationUrlResolver
{
    ResolvedJobSite Resolve(string url);
}

public sealed record ResolvedJobSite(
    string SiteId,
    string ScannableUrl,
    string ProfileAssetName,
    SiteProfileMode ProfileMode);

public enum SiteProfileMode
{
    Generic,
    Profiled
}
