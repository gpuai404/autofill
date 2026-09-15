using JobAutofill.Core.Contracts;

namespace JobAutofill.App;

public partial class AppShell : Shell
{
    private readonly IProfileRepository _profileRepository;

    public AppShell(IProfileRepository profileRepository)
    {
        _profileRepository = profileRepository;
        InitializeComponent();
        FlowDirection = AppLocalizer.CurrentFlowDirection;
        Routing.RegisterRoute("job-browser", typeof(Pages.JobBrowserPage));
        Loaded += OnLoaded;
    }

    private async void OnLoaded(object? sender, EventArgs e)
    {
        Loaded -= OnLoaded;
        if (await _profileRepository.GetCurrentAsync() is null)
        {
            MainTabBar.CurrentItem = MainTabBar.Items[1];
        }
    }
}
