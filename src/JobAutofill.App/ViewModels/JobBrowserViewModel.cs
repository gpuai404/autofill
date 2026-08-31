using CommunityToolkit.Mvvm.ComponentModel;
using JobAutofill.Domain.Models;
using System.Collections.ObjectModel;

namespace JobAutofill.App.ViewModels;

public partial class JobBrowserViewModel : ObservableObject, IJobBrowserViewModel
{
    [ObservableProperty]
    private string _statusText = "Ready";

    [ObservableProperty]
    private string _jobTitle = string.Empty;

    [ObservableProperty]
    private string _jobUrl = string.Empty;

    public ObservableCollection<DetectedFieldViewModel> DetectedFields { get; } = [];

    public void SetJob(JobPost jobPost, string jobUrl)
    {
        JobTitle = $"{jobPost.Company} - {jobPost.Title}";
        JobUrl = jobUrl;
    }

    public void SetStatus(string statusText)
    {
        StatusText = statusText;
    }

    public void ResetForLoading()
    {
        DetectedFields.Clear();
        StatusText = "Loading page...";
    }

    public void ReplaceDetectedFields(IEnumerable<DetectedFieldViewModel> fields)
    {
        DetectedFields.Clear();

        foreach (var field in fields)
        {
            DetectedFields.Add(field);
        }
    }
}
