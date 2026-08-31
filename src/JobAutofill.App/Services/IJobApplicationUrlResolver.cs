namespace JobAutofill.App.Services;

public interface IJobApplicationUrlResolver
{
    string ResolveScannableUrl(string url);
}
