using JobAutofill.App.Mappers;
using JobAutofill.App.Models.WebView;
using JobAutofill.App.ViewModels;
using JobAutofill.Core.Workflow;
using JobAutofill.Domain.Models;

namespace JobAutofill.App.Services;

public sealed class JobBrowserWorkflowService : IJobBrowserWorkflowService
{
    private readonly ApplicationFieldPipeline _pipeline;
    private readonly IDetectedFieldViewModelMapper _mapper;

    public JobBrowserWorkflowService(ApplicationFieldPipeline pipeline, IDetectedFieldViewModelMapper mapper)
    {
        _pipeline = pipeline;
        _mapper = mapper;
    }

    public Task<List<DetectedFieldViewModel>> PrepareDetectedFieldsAsync(
        string pageUrl,
        string language,
        IReadOnlyList<DetectedField> scanFields,
        WebViewCapabilityResult capability,
        Profile profile)
    {
        var preparation = _pipeline.Prepare(ScanContext.Create(pageUrl, language), scanFields, profile);
        return Task.FromResult(preparation.Fields.Select(_mapper.ToViewModel).ToList());
    }

    public IReadOnlyList<FillCommand> BuildFillCommands(IEnumerable<DetectedFieldViewModel> fields) =>
        fields.Where(field => field.CanAutoFill).Select(_mapper.ToFillCommand).ToList();
}
