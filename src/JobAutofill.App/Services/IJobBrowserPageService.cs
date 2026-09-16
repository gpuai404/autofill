using JobAutofill.App.ViewModels;

namespace JobAutofill.App.Services;

public interface IJobBrowserPageService
{
    Task ScanAsync(string pageUrl);
    Task FillAsync();
    Task ConfirmFieldAsync(DetectedFieldViewModel field);
    Task UseFieldAnswerAsync(DetectedFieldViewModel field);
    Task FocusFieldAsync(DetectedFieldViewModel field);
    Task DebugAsync();
    Task SelectOptionAsync(DetectedFieldOptionViewModel option);
    Task OnWebViewNavigatedAsync();
    void ResetForNewJob();
    void OnWebViewNavigating();
}
