namespace JobAutofill.App;

public partial class AppShell : Shell
{
    public AppShell()
    {
        InitializeComponent();
        Routing.RegisterRoute("job-browser", typeof(Pages.JobBrowserPage));
    }
}
