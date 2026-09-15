using System.Globalization;
using System.Resources;
using Microsoft.Maui.Controls;

namespace JobAutofill.App;

public static class AppLocalizer
{
    private static readonly ResourceManager ResourceManager =
        new("JobAutofill.App.Resources.AppResources", typeof(AppLocalizer).Assembly);

    public static FlowDirection CurrentFlowDirection => IsRightToLeft ? FlowDirection.RightToLeft : FlowDirection.LeftToRight;

    public static bool IsRightToLeft => CultureInfo.CurrentUICulture.TextInfo.IsRightToLeft;

    public static string AppTitle => Get("AppTitle");
    public static string JobsTabTitle => Get("JobsTabTitle");
    public static string ProfileTabTitle => Get("ProfileTabTitle");
    public static string AutofillPageTitle => Get("AutofillPageTitle");
    public static string ScanAction => Get("ScanAction");
    public static string FillAction => Get("FillAction");
    public static string DebugAction => Get("DebugAction");
    public static string DetectedFieldsTitle => Get("DetectedFieldsTitle");
    public static string ScanHint => Get("ScanHint");
    public static string JobsPageTitle => Get("JobsPageTitle");
    public static string PasteJobUrlPlaceholder => Get("PasteJobUrlPlaceholder");
    public static string OpenAction => Get("OpenAction");
    public static string NoJobsAvailable => Get("NoJobsAvailable");
    public static string ProfilePageTitle => Get("ProfilePageTitle");
    public static string EditAction => Get("EditAction");
    public static string ContactTitle => Get("ContactTitle");
    public static string OnlineProfilesTitle => Get("OnlineProfilesTitle");
    public static string ResumeTitle => Get("ResumeTitle");
    public static string EligibilityTitle => Get("EligibilityTitle");
    public static string VoluntaryDisclosuresTitle => Get("VoluntaryDisclosuresTitle");
    public static string AtsAnswersTitle => Get("AtsAnswersTitle");
    public static string RequiresSponsorship => Get("RequiresSponsorship");
    public static string WillingToRelocate => Get("WillingToRelocate");
    public static string FullName => Get("FullName");
    public static string Email => Get("Email");
    public static string Phone => Get("Phone");
    public static string Address => Get("Address");
    public static string City => Get("City");
    public static string State => Get("State");
    public static string PostalCode => Get("PostalCode");
    public static string Country => Get("Country");
    public static string LinkedInUrl => Get("LinkedInUrl");
    public static string PortfolioUrl => Get("PortfolioUrl");
    public static string GitHubUrl => Get("GitHubUrl");
    public static string CurrentTitle => Get("CurrentTitle");
    public static string CurrentCompany => Get("CurrentCompany");
    public static string YearsOfExperience => Get("YearsOfExperience");
    public static string HighestEducation => Get("HighestEducation");
    public static string ResumeFileName => Get("ResumeFileName");
    public static string Skills => Get("Skills");
    public static string ResumeSummary => Get("ResumeSummary");
    public static string WorkAuthorization => Get("WorkAuthorization");
    public static string PreferredWorkType => Get("PreferredWorkType");
    public static string SalaryExpectation => Get("SalaryExpectation");
    public static string NoticePeriod => Get("NoticePeriod");
    public static string Gender => Get("Gender");
    public static string RaceOrEthnicity => Get("RaceOrEthnicity");
    public static string HispanicOrLatino => Get("HispanicOrLatino");
    public static string VeteranStatus => Get("VeteranStatus");
    public static string DisabilityStatus => Get("DisabilityStatus");
    public static string CoverLetterAnswer => Get("CoverLetterAnswer");
    public static string WhyInterested => Get("WhyInterested");
    public static string AdditionalInformation => Get("AdditionalInformation");

    public static string Get(string key)
    {
        return ResourceManager.GetString(key, CultureInfo.CurrentUICulture) ?? key;
    }

    public static void ApplyCurrentCulture()
    {
        ApplyPageLanguage(CultureInfo.CurrentUICulture.Name);
    }

    public static void ApplyPageLanguage(string? languageCode)
    {
        var culture = DetermineCulture(languageCode);
        CultureInfo.CurrentCulture = culture;
        CultureInfo.CurrentUICulture = culture;
        CultureInfo.DefaultThreadCurrentCulture = culture;
        CultureInfo.DefaultThreadCurrentUICulture = culture;

        var isRightToLeft = culture.TextInfo.IsRightToLeft;
        foreach (var window in Application.Current?.Windows ?? [])
        {
            if (window.Page is not null)
            {
                window.Page.FlowDirection = isRightToLeft ? FlowDirection.RightToLeft : FlowDirection.LeftToRight;
            }
        }
    }

    private static CultureInfo DetermineCulture(string? languageCode)
    {
        var preferred = languageCode ?? CultureInfo.CurrentUICulture.Name;
        if (preferred.StartsWith("ar", StringComparison.OrdinalIgnoreCase))
        {
            return new CultureInfo("ar");
        }

        if (preferred.StartsWith("en", StringComparison.OrdinalIgnoreCase))
        {
            return new CultureInfo("en");
        }

        return CultureInfo.CurrentUICulture.Name.StartsWith("ar", StringComparison.OrdinalIgnoreCase)
            ? new CultureInfo("ar")
            : new CultureInfo("en");
    }

}
