namespace JobAutofill.App.Services;

public interface IJobApplicationUrlResolver
{
    ResolvedJobSite Resolve(string url);
}

public sealed record ResolvedJobSite(
    string SiteId,
    string ScannableUrl,
    string RulesAssetName,
    SiteAdapterMode AdapterMode);

public enum SiteAdapterMode
{
    Generic,
    Verified
}
