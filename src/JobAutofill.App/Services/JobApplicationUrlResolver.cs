namespace JobAutofill.App.Services;

public sealed class JobApplicationUrlResolver : IJobApplicationUrlResolver
{
    public string ResolveScannableUrl(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri))
        {
            return url;
        }

        if (!string.Equals(uri.Host, "jobs.lever.co", StringComparison.OrdinalIgnoreCase))
        {
            return url;
        }

        if (uri.AbsolutePath.EndsWith("/apply", StringComparison.OrdinalIgnoreCase))
        {
            return uri.ToString();
        }

        var builder = new UriBuilder(uri)
        {
            Path = uri.AbsolutePath.TrimEnd('/') + "/apply"
        };

        return builder.Uri.ToString();
    }
}
