using JobAutofill.App.Mappers;
using JobAutofill.App.ViewModels;
using JobAutofill.App.WebView;

namespace JobAutofill.App.Services;

public sealed class JobBrowserPageServiceFactory : IJobBrowserPageServiceFactory
{
    private readonly IJobBrowserWorkflowService _workflowService;
    private readonly IJobBrowserStatusService _statusService;
    private readonly IDetectedFieldViewModelMapper _detectedFieldViewModelMapper;
    private readonly IProfileSession _profileSession;

    public JobBrowserPageServiceFactory(
        IJobBrowserWorkflowService workflowService,
        IJobBrowserStatusService statusService,
        IDetectedFieldViewModelMapper detectedFieldViewModelMapper,
        IProfileSession profileSession)
    {
        _workflowService = workflowService;
        _statusService = statusService;
        _detectedFieldViewModelMapper = detectedFieldViewModelMapper;
        _profileSession = profileSession;
    }

    public IJobBrowserPageService Create(IJobBrowserViewModel viewModel, IJobWebViewBridge webViewBridge)
    {
        return new JobBrowserPageService(
            viewModel,
            webViewBridge,
            _workflowService,
            _statusService,
            _detectedFieldViewModelMapper,
            _profileSession);
    }
}
