using JobAutofill.App.Data;
using JobAutofill.App.Infrastructure;
using JobAutofill.Domain.Models;
using Microsoft.Maui.Controls;

namespace JobAutofill.App.Pages;

public partial class JobsListPage : ContentPage
{
    public JobsListPage()
        : this(MauiServiceResolver.ResolveServices<IJobCatalog>().SingleOrDefault())
    {
    }

    private JobsListPage(IJobCatalog? jobCatalog)
    {
        InitializeComponent();
        JobsView.ItemsSource = jobCatalog?.All ?? [];
    }

    private async void OnJobSelected(object? sender, SelectionChangedEventArgs e)
    {
        if (e.CurrentSelection.FirstOrDefault() is not JobPost jobPost)
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

        await NavigateToJobAsync(new JobPost("Custom job", "Custom", "Web", CustomUrlEntry.Text));
    }

    private static Task NavigateToJobAsync(JobPost jobPost)
    {
        return Shell.Current.GoToAsync("job-browser", new Dictionary<string, object>
        {
            ["JobPost"] = jobPost
        });
    }
}
