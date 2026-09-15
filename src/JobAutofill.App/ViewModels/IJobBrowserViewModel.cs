using System.Collections.ObjectModel;

namespace JobAutofill.App.ViewModels;

public interface IJobBrowserViewModel
{
    string StatusText { get; set; }
    string JobTitle { get; set; }
    string JobUrl { get; set; }
    ObservableCollection<DetectedFieldViewModel> DetectedFields { get; }
    ObservableCollection<DetectedFieldGroupViewModel> FieldGroups { get; }
    bool CanFill { get; }
    string FieldSummary { get; }

    void SetJob(JobAutofill.Domain.Models.JobPost jobPost, string jobUrl);
    void SetStatus(string statusText);
    void ResetForLoading();
    void ReplaceDetectedFields(IEnumerable<DetectedFieldViewModel> fields);
}

public sealed class DetectedFieldGroupViewModel : ObservableCollection<DetectedFieldViewModel>
{
    public DetectedFieldGroupViewModel(string title, IEnumerable<DetectedFieldViewModel> fields) : base(fields) => Title = title;
    public string Title { get; }
}
