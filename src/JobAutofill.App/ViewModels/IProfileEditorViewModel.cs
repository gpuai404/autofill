namespace JobAutofill.App.ViewModels;

public interface IProfileEditorViewModel
{
    string? FullName { get; set; }
    string? Email { get; set; }
    string? Phone { get; set; }
    string? AddressLine1 { get; set; }
    string? City { get; set; }
    string? StateOrProvince { get; set; }
    string? PostalCode { get; set; }
    string? Country { get; set; }
    string? LinkedInUrl { get; set; }
    string? PortfolioUrl { get; set; }
    string? GitHubUrl { get; set; }
    string? CurrentTitle { get; set; }
    string? CurrentCompany { get; set; }
    string? YearsExperience { get; set; }
    string? HighestEducation { get; set; }
    string? ResumeFileName { get; set; }
    string? Skills { get; set; }
    string? ResumeSummary { get; set; }
    string? WorkAuthorizationStatus { get; set; }
    bool RequiresSponsorship { get; set; }
    bool WillingToRelocate { get; set; }
    string? PreferredWorkType { get; set; }
    string? SalaryExpectation { get; set; }
    string? NoticePeriod { get; set; }
    string? Gender { get; set; }
    string? RaceEthnicity { get; set; }
    string? HispanicLatino { get; set; }
    string? VeteranStatus { get; set; }
    string? DisabilityStatus { get; set; }
    string? CoverLetter { get; set; }
    string? WhyInterested { get; set; }
    string? AdditionalInfo { get; set; }
    bool IsEditing { get; }
    string EditButtonText { get; }
    string? ProfileNameLabel { get; }
    string? ProfileHeadlineLabel { get; }
    string StatusText { get; }
    void ToggleEdit();
    void LoadProfile();
    void SaveProfile();
}
