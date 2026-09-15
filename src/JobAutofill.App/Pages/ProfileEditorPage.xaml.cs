using JobAutofill.App.Infrastructure;
using JobAutofill.App.ViewModels;
using Microsoft.Maui.Controls;

namespace JobAutofill.App.Pages;

public partial class ProfileEditorPage : ContentPage
{
    private readonly IProfileEditorViewModel _viewModel;

    public ProfileEditorPage()
        : this(MauiServiceResolver.ResolveRequiredService<IProfileEditorViewModel>())
    {
    }

    private ProfileEditorPage(IProfileEditorViewModel viewModel)
    {
        InitializeComponent();
        _viewModel = viewModel;
        BindingContext = _viewModel;
        UpdateEditState();
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();

        await _viewModel.LoadProfileAsync();
        UpdateEditState();
    }

    private async void OnEditSaveClicked(object? sender, EventArgs e)
    {
        await _viewModel.ToggleEditAsync();
        UpdateEditState();
    }

    private void UpdateEditState()
    {
        var editing = _viewModel.IsEditing;

        FullNameEntry.IsReadOnly = !editing;
        EmailEntry.IsReadOnly = !editing;
        PhoneEntry.IsReadOnly = !editing;
        AddressEntry.IsReadOnly = !editing;
        CityEntry.IsReadOnly = !editing;
        StateEntry.IsReadOnly = !editing;
        PostalCodeEntry.IsReadOnly = !editing;
        CountryEntry.IsReadOnly = !editing;
        LinkedInEntry.IsReadOnly = !editing;
        PortfolioEntry.IsReadOnly = !editing;
        GitHubEntry.IsReadOnly = !editing;
        CurrentTitleEntry.IsReadOnly = !editing;
        CurrentCompanyEntry.IsReadOnly = !editing;
        YearsExperienceEntry.IsReadOnly = !editing;
        HighestEducationEntry.IsReadOnly = !editing;
        ResumeFileNameEntry.IsReadOnly = !editing;
        SkillsEditor.IsReadOnly = !editing;
        SummaryEditor.IsReadOnly = !editing;
        WorkAuthorizationEntry.IsReadOnly = !editing;
        SponsorshipSwitch.IsEnabled = editing;
        RelocateSwitch.IsEnabled = editing;
        PreferredWorkTypeEntry.IsReadOnly = !editing;
        SalaryExpectationEntry.IsReadOnly = !editing;
        NoticePeriodEntry.IsReadOnly = !editing;
        GenderEntry.IsReadOnly = !editing;
        RaceEntry.IsReadOnly = !editing;
        HispanicLatinoEntry.IsReadOnly = !editing;
        VeteranEntry.IsReadOnly = !editing;
        DisabilityEntry.IsReadOnly = !editing;
        CoverLetterEditor.IsReadOnly = !editing;
        WhyInterestedEditor.IsReadOnly = !editing;
        AdditionalInfoEditor.IsReadOnly = !editing;
        EditSaveButton.Text = _viewModel.EditButtonText;
        StatusLabel.Text = _viewModel.StatusText;
        ProfileNameLabel.Text = _viewModel.ProfileNameLabel;
        ProfileHeadlineLabel.Text = _viewModel.ProfileHeadlineLabel;
    }
}
