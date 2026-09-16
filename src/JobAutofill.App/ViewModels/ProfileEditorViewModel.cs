using CommunityToolkit.Mvvm.ComponentModel;
using JobAutofill.Core.Contracts;
using JobAutofill.Domain.Models;

namespace JobAutofill.App.ViewModels;

public partial class ProfileEditorViewModel : ObservableObject, IProfileEditorViewModel
{
    private readonly IProfileRepository _profileRepository;
    private Profile? _profile;

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
    private string? _sponsorshipRequirement;

    [ObservableProperty]
    private string? _relocationPreference;

    public IReadOnlyList<string> YesNoOptions { get; } = ["Yes", "No"];

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

    public ProfileEditorViewModel(IProfileRepository profileRepository)
    {
        _profileRepository = profileRepository;
        SetEditing(false);
    }

    public async Task ToggleEditAsync(CancellationToken cancellationToken = default)
    {
        if (IsEditing)
        {
            await SaveProfileAsync(cancellationToken);
            SetEditing(false);
            return;
        }

        if (_profile is null)
        {
            await LoadProfileAsync(cancellationToken);
        }

        SetEditing(true);
    }

    public async Task LoadProfileAsync(CancellationToken cancellationToken = default)
    {
        _profile = await _profileRepository.GetCurrentAsync(cancellationToken) ?? new Profile();
        if (string.IsNullOrWhiteSpace(_profile.FullName) && string.IsNullOrWhiteSpace(_profile.Email))
        {
            SetEditing(true);
            StatusText = "Create your profile before scanning job applications.";
        }

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
        SponsorshipRequirement = _profile.SponsorshipRequirement;
        RelocationPreference = _profile.RelocationPreference;
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

    public async Task SaveProfileAsync(CancellationToken cancellationToken = default)
    {
        _profile ??= await _profileRepository.GetCurrentAsync(cancellationToken) ?? new Profile();

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
        _profile.SponsorshipRequirement = SponsorshipRequirement;
        _profile.RelocationPreference = RelocationPreference;
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

        await _profileRepository.SaveAsync(_profile, cancellationToken);

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
        return _profile?.CustomAnswers.TryGetValue(key, out var value) == true ? value : string.Empty;
    }
}
