using JobAutofill.Domain.Models;
using Microsoft.Maui.Controls;

namespace JobAutofill.App.Views;

public partial class ProfileEditorPage : ContentPage
{
    private readonly List<Entry> _entries = [];
    private readonly List<Editor> _editors = [];
    private readonly List<Switch> _switches = [];
    private readonly Profile _profile = ProfileStore.Current;
    private bool _isEditing;

    public ProfileEditorPage()
    {
        InitializeComponent();

        _entries.AddRange(
        [
            FullNameEntry,
            EmailEntry,
            PhoneEntry,
            AddressEntry,
            CityEntry,
            StateEntry,
            PostalCodeEntry,
            CountryEntry,
            LinkedInEntry,
            PortfolioEntry,
            GitHubEntry,
            CurrentTitleEntry,
            CurrentCompanyEntry,
            YearsExperienceEntry,
            HighestEducationEntry,
            ResumeFileNameEntry,
            WorkAuthorizationEntry,
            PreferredWorkTypeEntry,
            SalaryExpectationEntry,
            NoticePeriodEntry,
            GenderEntry,
            RaceEntry,
            HispanicLatinoEntry,
            VeteranEntry,
            DisabilityEntry
        ]);

        _editors.AddRange(
        [
            SkillsEditor,
            SummaryEditor,
            CoverLetterEditor,
            WhyInterestedEditor,
            AdditionalInfoEditor
        ]);

        _switches.AddRange([SponsorshipSwitch, RelocateSwitch]);

        LoadProfileIntoControls();
        SetEditing(false);
    }

    private void OnEditSaveClicked(object? sender, EventArgs e)
    {
        if (_isEditing)
        {
            SaveControlsToProfile();
            SetEditing(false);
            StatusLabel.Text = $"Saved {DateTime.Now:g}";
            return;
        }

        SetEditing(true);
        StatusLabel.Text = "Editing profile.";
    }

    private void LoadProfileIntoControls()
    {
        FullNameEntry.Text = _profile.FullName;
        EmailEntry.Text = _profile.Email;
        PhoneEntry.Text = _profile.Phone;
        AddressEntry.Text = _profile.AddressLine1;
        CityEntry.Text = _profile.City;
        StateEntry.Text = _profile.StateOrProvince;
        PostalCodeEntry.Text = _profile.PostalCode;
        CountryEntry.Text = _profile.Country;
        LinkedInEntry.Text = _profile.LinkedInUrl;
        PortfolioEntry.Text = _profile.PortfolioUrl;
        GitHubEntry.Text = _profile.GitHubUrl;
        CurrentTitleEntry.Text = _profile.CurrentTitle;
        CurrentCompanyEntry.Text = _profile.CurrentCompany;
        YearsExperienceEntry.Text = _profile.YearsExperience;
        HighestEducationEntry.Text = _profile.HighestEducation;
        ResumeFileNameEntry.Text = _profile.ResumeFileName;
        SkillsEditor.Text = _profile.Skills;
        SummaryEditor.Text = _profile.ResumeSummary;
        WorkAuthorizationEntry.Text = _profile.WorkAuthorizationStatus;
        SponsorshipSwitch.IsToggled = _profile.RequiresSponsorship;
        RelocateSwitch.IsToggled = _profile.WillingToRelocate;
        PreferredWorkTypeEntry.Text = _profile.PreferredWorkType;
        SalaryExpectationEntry.Text = _profile.SalaryExpectation;
        NoticePeriodEntry.Text = _profile.NoticePeriod;
        GenderEntry.Text = _profile.Gender;
        RaceEntry.Text = _profile.RaceEthnicity;
        HispanicLatinoEntry.Text = _profile.HispanicLatino;
        VeteranEntry.Text = _profile.VeteranStatus;
        DisabilityEntry.Text = _profile.DisabilityStatus;
        CoverLetterEditor.Text = GetCustomAnswer("CoverLetter");
        WhyInterestedEditor.Text = GetCustomAnswer("WhyInterested");
        AdditionalInfoEditor.Text = GetCustomAnswer("AdditionalInfo");

        RefreshHeader();
    }

    private void SaveControlsToProfile()
    {
        _profile.FullName = FullNameEntry.Text;
        _profile.Email = EmailEntry.Text;
        _profile.Phone = PhoneEntry.Text;
        _profile.AddressLine1 = AddressEntry.Text;
        _profile.City = CityEntry.Text;
        _profile.StateOrProvince = StateEntry.Text;
        _profile.PostalCode = PostalCodeEntry.Text;
        _profile.Country = CountryEntry.Text;
        _profile.LinkedInUrl = LinkedInEntry.Text;
        _profile.PortfolioUrl = PortfolioEntry.Text;
        _profile.GitHubUrl = GitHubEntry.Text;
        _profile.CurrentTitle = CurrentTitleEntry.Text;
        _profile.CurrentCompany = CurrentCompanyEntry.Text;
        _profile.YearsExperience = YearsExperienceEntry.Text;
        _profile.HighestEducation = HighestEducationEntry.Text;
        _profile.ResumeFileName = ResumeFileNameEntry.Text;
        _profile.Skills = SkillsEditor.Text;
        _profile.ResumeSummary = SummaryEditor.Text;
        _profile.WorkAuthorizationStatus = WorkAuthorizationEntry.Text;
        _profile.RequiresSponsorship = SponsorshipSwitch.IsToggled;
        _profile.WillingToRelocate = RelocateSwitch.IsToggled;
        _profile.PreferredWorkType = PreferredWorkTypeEntry.Text;
        _profile.SalaryExpectation = SalaryExpectationEntry.Text;
        _profile.NoticePeriod = NoticePeriodEntry.Text;
        _profile.Gender = GenderEntry.Text;
        _profile.RaceEthnicity = RaceEntry.Text;
        _profile.HispanicLatino = HispanicLatinoEntry.Text;
        _profile.VeteranStatus = VeteranEntry.Text;
        _profile.DisabilityStatus = DisabilityEntry.Text;
        _profile.CustomAnswers["CoverLetter"] = CoverLetterEditor.Text ?? string.Empty;
        _profile.CustomAnswers["WhyInterested"] = WhyInterestedEditor.Text ?? string.Empty;
        _profile.CustomAnswers["AdditionalInfo"] = AdditionalInfoEditor.Text ?? string.Empty;
        _profile.UpdatedAtUtc = DateTimeOffset.UtcNow;

        RefreshHeader();
    }

    private void SetEditing(bool isEditing)
    {
        _isEditing = isEditing;
        EditSaveButton.Text = isEditing ? "Save" : "Edit";

        foreach (var entry in _entries)
        {
            entry.IsReadOnly = !isEditing;
        }

        foreach (var editor in _editors)
        {
            editor.IsReadOnly = !isEditing;
        }

        foreach (var itemSwitch in _switches)
        {
            itemSwitch.IsEnabled = isEditing;
        }
    }

    private void RefreshHeader()
    {
        ProfileNameLabel.Text = _profile.FullName;
        ProfileHeadlineLabel.Text = $"{_profile.CurrentTitle} at {_profile.CurrentCompany}";
    }

    private string GetCustomAnswer(string key)
    {
        return _profile.CustomAnswers.TryGetValue(key, out var value) ? value : string.Empty;
    }

}
