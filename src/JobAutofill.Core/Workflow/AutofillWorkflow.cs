using JobAutofill.Core.Capabilities;
using JobAutofill.Domain.Models;

namespace JobAutofill.Core.Workflow;

public sealed class AutofillWorkflow
{
    private readonly DetectedFieldNormalizer _fieldNormalizer;
    private readonly FieldApprovalWorkflow _approvalWorkflow;
    private readonly FillCommandPlanner _fillCommandPlanner;

    public AutofillWorkflow(
        DetectedFieldNormalizer fieldNormalizer,
        FieldApprovalWorkflow approvalWorkflow,
        FillCommandPlanner fillCommandPlanner)
    {
        _fieldNormalizer = fieldNormalizer;
        _approvalWorkflow = approvalWorkflow;
        _fillCommandPlanner = fillCommandPlanner;
    }

    public async Task<AutofillPreparationResult> PrepareAsync(
        string pageUrl,
        IReadOnlyList<DetectedField> detectedFields,
        Profile profile,
        ScannerCapabilityReport? capabilityReport = null,
        CancellationToken cancellationToken = default)
    {
        var normalizedFields = _fieldNormalizer.Normalize(detectedFields);
        var approvalItems = await _approvalWorkflow.PrepareApprovalItemsAsync(
            pageUrl,
            normalizedFields,
            profile,
            capabilityReport,
            cancellationToken);

        return new AutofillPreparationResult(normalizedFields, approvalItems);
    }

    public IReadOnlyList<DetectedField> NormalizeFields(IReadOnlyList<DetectedField> detectedFields)
    {
        return _fieldNormalizer.Normalize(detectedFields);
    }

    public IReadOnlyList<FillCommand> BuildFillCommands(IEnumerable<ApprovalItem> approvalItems)
    {
        return _fillCommandPlanner.BuildFillCommands(approvalItems);
    }
}

public sealed record AutofillPreparationResult(
    IReadOnlyList<DetectedField> Fields,
    IReadOnlyList<ApprovalItem> ApprovalItems);
