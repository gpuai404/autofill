using JobAutofill.App.Mappers;
using JobAutofill.App.ViewModels;
using JobAutofill.App.WebView;
using JobAutofill.Core.Contracts;

namespace JobAutofill.App.Services;

public sealed class JobBrowserPageServiceFactory : IJobBrowserPageServiceFactory
{
    private readonly IJobBrowserWorkflowService _workflowService;
    private readonly IJobBrowserStatusService _statusService;
    private readonly IDetectedFieldViewModelMapper _detectedFieldViewModelMapper;
    private readonly IProfileRepository _profileRepository;

    public JobBrowserPageServiceFactory(
        IJobBrowserWorkflowService workflowService,
        IJobBrowserStatusService statusService,
        IDetectedFieldViewModelMapper detectedFieldViewModelMapper,
        IProfileRepository profileRepository)
    {
        _workflowService = workflowService;
        _statusService = statusService;
        _detectedFieldViewModelMapper = detectedFieldViewModelMapper;
        _profileRepository = profileRepository;
    }

    public IJobBrowserPageService Create(IJobBrowserViewModel viewModel, IJobWebViewBridge webViewBridge)
    {
        return new JobBrowserPageService(
            viewModel,
            webViewBridge,
            _workflowService,
            _statusService,
            _detectedFieldViewModelMapper,
            _profileRepository);
    }
}
