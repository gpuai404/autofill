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
    public ObservableCollection<DetectedFieldGroupViewModel> FieldGroups { get; } = [];
    public bool CanFill => DetectedFields.Any(item => item.CanAutoFill);
    public string FieldSummary
    {
        get
        {
            var ready = DetectedFields.Count(item => item.CanAutoFill);
            var attention = DetectedFields.Count(item => item.NeedsAttention);
            var manual = DetectedFields.Count(item => item.IsManual);
            return DetectedFields.Count == 0
                ? "No application fields scanned"
                : $"{ready} ready · {attention} need attention · {manual} manual";
        }
    }

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
        FieldGroups.Clear();
        StatusText = "Loading page...";
        OnPropertyChanged(nameof(CanFill));
        OnPropertyChanged(nameof(FieldSummary));
    }

    public void ReplaceDetectedFields(IEnumerable<DetectedFieldViewModel> fields)
    {
        DetectedFields.Clear();

        foreach (var field in fields)
        {
            DetectedFields.Add(field);
            field.PropertyChanged += (_, _) => RefreshGroups();
        }

        RefreshGroups();
    }

    private void RefreshGroups()
    {
        FieldGroups.Clear();
        AddGroup("Needs attention", DetectedFields.Where(field => field.NeedsAttention && !field.IsManual));
        AddGroup("Ready to fill", DetectedFields.Where(field => field.CanAutoFill));
        AddGroup("Manual steps", DetectedFields.Where(field => field.IsManual && !field.IsCompleted));
        AddGroup("Completed", DetectedFields.Where(field => field.IsCompleted));
        OnPropertyChanged(nameof(CanFill));
        OnPropertyChanged(nameof(FieldSummary));
    }

    private void AddGroup(string title, IEnumerable<DetectedFieldViewModel> fields)
    {
        var items = fields.ToList();
        if (items.Count > 0) FieldGroups.Add(new DetectedFieldGroupViewModel(title, items));
    }
}
