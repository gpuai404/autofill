using JobAutofill.App.ViewModels;
using JobAutofill.App.WebView;

namespace JobAutofill.App.Services;

public interface IJobBrowserPageServiceFactory
{
    IJobBrowserPageService Create(IJobBrowserViewModel viewModel, IJobWebViewBridge webViewBridge);
}
