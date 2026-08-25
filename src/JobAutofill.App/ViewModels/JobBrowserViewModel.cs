using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using System.Windows.Input;

namespace JobAutofill.App.ViewModels;

public partial class JobBrowserViewModel : ObservableObject
{
    [ObservableProperty]
    private string _url = "https://example.com";

    [ObservableProperty]
    private WebViewSource? _webSource;

    public ICommand OpenCommand { get; }

    public JobBrowserViewModel()
    {
        OpenCommand = new RelayCommand(() =>
        {
            if (string.IsNullOrWhiteSpace(Url))
            {
                return;
            }

            WebSource = new UrlWebViewSource { Url = Url };
        });
    }
}
