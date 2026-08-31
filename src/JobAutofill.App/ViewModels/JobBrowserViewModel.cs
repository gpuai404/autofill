using CommunityToolkit.Mvvm.ComponentModel;
using System.Collections.ObjectModel;

namespace JobAutofill.App.ViewModels;

public partial class JobBrowserViewModel : ObservableObject
{
    [ObservableProperty]
    private string _statusText = "Ready";

    [ObservableProperty]
    private string _jobTitle = string.Empty;

    [ObservableProperty]
    private string _jobUrl = string.Empty;

    public ObservableCollection<DetectedFieldViewModel> DetectedFields { get; } = [];
}
