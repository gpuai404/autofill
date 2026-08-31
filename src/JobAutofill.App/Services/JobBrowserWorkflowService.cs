using JobAutofill.App.Mappers;
using JobAutofill.App.Models.WebView;
using JobAutofill.App.ViewModels;
using JobAutofill.Core.Workflow;
using JobAutofill.Domain.Models;

namespace JobAutofill.App.Services;

public sealed class JobBrowserWorkflowService : IJobBrowserWorkflowService
{
    private readonly AutofillWorkflow _autofillWorkflow;
    private readonly IDetectedFieldViewModelMapper _detectedFieldViewModelMapper;

    public JobBrowserWorkflowService(
        AutofillWorkflow autofillWorkflow,
        IDetectedFieldViewModelMapper detectedFieldViewModelMapper)
    {
        _autofillWorkflow = autofillWorkflow;
        _detectedFieldViewModelMapper = detectedFieldViewModelMapper;
    }

    public async Task<List<DetectedFieldViewModel>> PrepareDetectedFieldsAsync(
        string pageUrl,
        IReadOnlyList<DetectedField> scanFields,
        WebViewCapabilityResult capability,
        Profile profile)
    {
        var normalizedFields = _autofillWorkflow.NormalizeFields(scanFields).ToList();
        var preparation = await _autofillWorkflow.PrepareAsync(
            pageUrl,
            normalizedFields,
            profile,
            capability.ToCoreReport());

        var approvalMap = preparation.ApprovalItems.ToDictionary(item => item.FieldId, StringComparer.Ordinal);
        var result = new List<DetectedFieldViewModel>();

        foreach (var detectedField in preparation.Fields)
        {
            var field = _detectedFieldViewModelMapper.ToViewModel(detectedField);
            if (approvalMap.TryGetValue(JobAutofill.Core.Matching.FieldIdentity.GetFieldId(detectedField), out var approvalItem))
            {
                field.ApplyApprovalItem(approvalItem);
            }

            result.Add(field);
        }

        return result;
    }

    public IReadOnlyList<FillCommand> BuildFillCommands(IEnumerable<DetectedFieldViewModel> fields)
    {
        var approvalItems = fields
            .Where(field => field.CanAutoFill)
            .Select(_detectedFieldViewModelMapper.ToApprovedApprovalItem);

        return _autofillWorkflow.BuildFillCommands(approvalItems);
    }
}
