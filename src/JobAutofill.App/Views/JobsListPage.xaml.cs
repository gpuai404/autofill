using Microsoft.Maui.Controls;

namespace JobAutofill.App.Views;

public partial class JobsListPage : ContentPage
{
    public JobsListPage()
    {
        InitializeComponent();
        JobsView.ItemsSource = SampleJobs.All;
    }

    private async void OnJobSelected(object? sender, SelectionChangedEventArgs e)
    {
        if (e.CurrentSelection.FirstOrDefault() is not SampleJobPost jobPost)
        {
            return;
        }

        JobsView.SelectedItem = null;
        await NavigateToJobAsync(jobPost);
    }

    private async void OnOpenCustomUrlClicked(object? sender, EventArgs e)
    {
        if (string.IsNullOrWhiteSpace(CustomUrlEntry.Text))
        {
            return;
        }

        await NavigateToJobAsync(new SampleJobPost("Custom job", "Custom", "Web", CustomUrlEntry.Text));
    }

    private static Task NavigateToJobAsync(SampleJobPost jobPost)
    {
        return Shell.Current.GoToAsync("job-browser", new Dictionary<string, object>
        {
            ["JobPost"] = jobPost
        });
    }
}
