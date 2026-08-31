using CommunityToolkit.Mvvm.ComponentModel;
using JobAutofill.App.Services;
using JobAutofill.Domain.Models;

namespace JobAutofill.App.ViewModels;

public partial class ProfileEditorViewModel : ObservableObject, IProfileEditorViewModel
{
    private readonly Profile _profile;

    [ObservableProperty]
    private string? _fullName;

    [ObservableProperty]
    private string? _email;

    [ObservableProperty]
    private string? _phone;

    [ObservableProperty]
    private string? _addressLine1;

    [ObservableProperty]
    private string? _city;

    [ObservableProperty]
    private string? _stateOrProvince;

    [ObservableProperty]
    private string? _postalCode;

    [ObservableProperty]
    private string? _country;

    [ObservableProperty]
    private string? _linkedInUrl;

    [ObservableProperty]
    private string? _portfolioUrl;

    [ObservableProperty]
    private string? _gitHubUrl;

    [ObservableProperty]
    private string? _currentTitle;

    [ObservableProperty]
    private string? _currentCompany;

    [ObservableProperty]
    private string? _yearsExperience;

    [ObservableProperty]
    private string? _highestEducation;

    [ObservableProperty]
    private string? _resumeFileName;

    [ObservableProperty]
    private string? _skills;

    [ObservableProperty]
    private string? _resumeSummary;

    [ObservableProperty]
    private string? _workAuthorizationStatus;

    [ObservableProperty]
    private bool _requiresSponsorship;

    [ObservableProperty]
    private bool _willingToRelocate;

    [ObservableProperty]
    private string? _preferredWorkType;

    [ObservableProperty]
    private string? _salaryExpectation;

    [ObservableProperty]
    private string? _noticePeriod;

    [ObservableProperty]
    private string? _gender;

    [ObservableProperty]
    private string? _raceEthnicity;

    [ObservableProperty]
    private string? _hispanicLatino;

    [ObservableProperty]
    private string? _veteranStatus;

    [ObservableProperty]
    private string? _disabilityStatus;

    [ObservableProperty]
    private string? _coverLetter;

    [ObservableProperty]
    private string? _whyInterested;

    [ObservableProperty]
    private string? _additionalInfo;

    [ObservableProperty]
    private bool _isEditing;

    [ObservableProperty]
    private string _editButtonText = "Edit";

    [ObservableProperty]
    private string? _profileNameLabel;

    [ObservableProperty]
    private string? _profileHeadlineLabel;

    [ObservableProperty]
    private string _statusText = "Ready";

    public ProfileEditorViewModel(IProfileSession profileSession)
    {
        _profile = profileSession.Current;
        LoadProfile();
        SetEditing(false);
    }

    public void ToggleEdit()
    {
        if (IsEditing)
        {
            SaveProfile();
            SetEditing(false);
            return;
        }

        SetEditing(true);
    }

    public void LoadProfile()
    {
        FullName = _profile.FullName;
        Email = _profile.Email;
        Phone = _profile.Phone;
        AddressLine1 = _profile.AddressLine1;
        City = _profile.City;
        StateOrProvince = _profile.StateOrProvince;
        PostalCode = _profile.PostalCode;
        Country = _profile.Country;
        LinkedInUrl = _profile.LinkedInUrl;
        PortfolioUrl = _profile.PortfolioUrl;
        GitHubUrl = _profile.GitHubUrl;
        CurrentTitle = _profile.CurrentTitle;
        CurrentCompany = _profile.CurrentCompany;
        YearsExperience = _profile.YearsExperience;
        HighestEducation = _profile.HighestEducation;
        ResumeFileName = _profile.ResumeFileName;
        Skills = _profile.Skills;
        ResumeSummary = _profile.ResumeSummary;
        WorkAuthorizationStatus = _profile.WorkAuthorizationStatus;
        RequiresSponsorship = _profile.RequiresSponsorship;
        WillingToRelocate = _profile.WillingToRelocate;
        PreferredWorkType = _profile.PreferredWorkType;
        SalaryExpectation = _profile.SalaryExpectation;
        NoticePeriod = _profile.NoticePeriod;
        Gender = _profile.Gender;
        RaceEthnicity = _profile.RaceEthnicity;
        HispanicLatino = _profile.HispanicLatino;
        VeteranStatus = _profile.VeteranStatus;
        DisabilityStatus = _profile.DisabilityStatus;
        CoverLetter = GetCustomAnswer("CoverLetter");
        WhyInterested = GetCustomAnswer("WhyInterested");
        AdditionalInfo = GetCustomAnswer("AdditionalInfo");

        RefreshHeader();
    }

    public void SaveProfile()
    {
        _profile.FullName = FullName;
        _profile.Email = Email;
        _profile.Phone = Phone;
        _profile.AddressLine1 = AddressLine1;
        _profile.City = City;
        _profile.StateOrProvince = StateOrProvince;
        _profile.PostalCode = PostalCode;
        _profile.Country = Country;
        _profile.LinkedInUrl = LinkedInUrl;
        _profile.PortfolioUrl = PortfolioUrl;
        _profile.GitHubUrl = GitHubUrl;
        _profile.CurrentTitle = CurrentTitle;
        _profile.CurrentCompany = CurrentCompany;
        _profile.YearsExperience = YearsExperience;
        _profile.HighestEducation = HighestEducation;
        _profile.ResumeFileName = ResumeFileName;
        _profile.Skills = Skills;
        _profile.ResumeSummary = ResumeSummary;
        _profile.WorkAuthorizationStatus = WorkAuthorizationStatus;
        _profile.RequiresSponsorship = RequiresSponsorship;
        _profile.WillingToRelocate = WillingToRelocate;
        _profile.PreferredWorkType = PreferredWorkType;
        _profile.SalaryExpectation = SalaryExpectation;
        _profile.NoticePeriod = NoticePeriod;
        _profile.Gender = Gender;
        _profile.RaceEthnicity = RaceEthnicity;
        _profile.HispanicLatino = HispanicLatino;
        _profile.VeteranStatus = VeteranStatus;
        _profile.DisabilityStatus = DisabilityStatus;
        _profile.CustomAnswers["CoverLetter"] = CoverLetter ?? string.Empty;
        _profile.CustomAnswers["WhyInterested"] = WhyInterested ?? string.Empty;
        _profile.CustomAnswers["AdditionalInfo"] = AdditionalInfo ?? string.Empty;
        _profile.UpdatedAtUtc = DateTimeOffset.UtcNow;

        RefreshHeader();
        StatusText = $"Saved {DateTime.Now:g}";
    }

    private void SetEditing(bool editing)
    {
        IsEditing = editing;
        EditButtonText = editing ? "Save" : "Edit";
        StatusText = editing ? "Editing profile." : "Ready";
    }

    private void RefreshHeader()
    {
        ProfileNameLabel = FullName;
        ProfileHeadlineLabel = string.IsNullOrWhiteSpace(CurrentTitle) && string.IsNullOrWhiteSpace(CurrentCompany)
            ? string.Empty
            : $"{CurrentTitle} at {CurrentCompany}";
    }

    private string GetCustomAnswer(string key)
    {
        return _profile.CustomAnswers.TryGetValue(key, out var value) ? value : string.Empty;
    }
}
