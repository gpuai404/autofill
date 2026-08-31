using JobAutofill.App.WebView;
using JobAutofill.App.ViewModels;
using JobAutofill.Core.Workflow;
using JobAutofill.Domain.Models;

namespace JobAutofill.App.Services;

public sealed class JobBrowserWorkflowService
{
    public async Task<List<DetectedFieldViewModel>> PrepareDetectedFieldsAsync(
        AutofillWorkflow autofillWorkflow,
        string pageUrl,
        IReadOnlyList<DetectedField> scanFields,
        WebViewCapabilityResult capability,
        Profile profile,
        JobWebViewBridge webViewBridge,
        Func<DetectedFieldViewModel, string> fieldIdResolver)
    {
        var normalizedFields = autofillWorkflow.NormalizeFields(scanFields).ToList();
        var preparation = await autofillWorkflow.PrepareAsync(
            pageUrl,
            normalizedFields,
            profile,
            capability.ToCoreReport());

        var approvalMap = preparation.ApprovalItems.ToDictionary(item => item.FieldId, StringComparer.Ordinal);
        var result = new List<DetectedFieldViewModel>();

        foreach (var detectedField in preparation.Fields)
        {
            var field = ToDetectedFieldViewModel(detectedField);
            if (approvalMap.TryGetValue(fieldIdResolver(field), out var approvalItem))
            {
                field.ApplyApprovalItem(approvalItem);
            }

            result.Add(field);
        }

        return result;
    }

    public static string BuildScanStatusText(
        int detectedCount,
        int optionsCapturedCount,
        int fillableCount,
        int approvedCount,
        int apiDecisionCount,
        int blockedCount,
        WebViewCapabilityResult capability,
        string? noFieldsHint)
    {
        if (detectedCount == 0)
        {
            var pageHint = capability.IsHardStop
                ? capability.Message
                : noFieldsHint ?? "This page does not expose standard form fields in the current runtime state.";

            return $"No fields detected. {pageHint} Tap Debug to see diagnostics.";
        }

        if (capability.IsPartialScan)
        {
            return $"Found {detectedCount} fields, {optionsCapturedCount} with options, {fillableCount} ready, {approvedCount} approved, {apiDecisionCount} need API, {blockedCount} blocked. Partial scan: {capability.Message}";
        }

        return $"Found {detectedCount} fields, {optionsCapturedCount} with options, {fillableCount} ready, {approvedCount} approved, {apiDecisionCount} need API, {blockedCount} blocked.";
    }

    public static async Task<string> GetNoFieldsHintAsync(JobWebViewBridge webViewBridge)
    {
        var pageClassification = await webViewBridge.GetCurrentPageClassificationAsync();
        return pageClassification switch
        {
            "auth-gated" => "This page is login-gated or requires auth before form fields are exposed.",
            "iframe-based" => "This page appears to use iframe-based content and is not supported in Tier 1.",
            "custom-app-shell" => "This page appears to use a custom app shell or non-standard form implementation.",
            _ => "This page does not expose standard form fields in the current runtime state."
        };
    }

    private static DetectedFieldViewModel ToDetectedFieldViewModel(DetectedField field)
    {
        return new DetectedFieldViewModel
        {
            Selector = field.Selector,
            Label = field.Label,
            InputType = field.InputType,
            ControlType = field.ControlType,
            ControlFamily = field.ControlFamily,
            SelectionMode = field.SelectionMode,
            SelectionModeReason = field.SelectionModeReason,
            FieldCategory = field.FieldCategory,
            FieldSubCategory = field.FieldSubCategory,
            FieldCategoryReason = field.FieldCategoryReason,
            NativeInputType = field.NativeInputType,
            TagName = field.TagName,
            Role = field.Role,
            AriaHasPopup = field.AriaHasPopup,
            AriaExpanded = field.AriaExpanded,
            AriaControls = field.AriaControls,
            AriaOwns = field.AriaOwns,
            AriaActiveDescendant = field.AriaActiveDescendant,
            AriaAutocomplete = field.AriaAutocomplete,
            AriaMultiselectable = field.AriaMultiselectable,
            Autocomplete = field.Autocomplete,
            List = field.List,
            Required = field.Required,
            Optional = field.Optional,
            Disabled = field.Disabled,
            Readonly = field.Readonly,
            Multiple = field.Multiple,
            ScanReason = field.ScanReason,
            FieldMessage = field.FieldMessage,
            RequiresCapturedOption = field.RequiresCapturedOption,
            ValuePolicy = field.ValuePolicy,
            FillStrategy = field.FillStrategy,
            OptionSourceGroup = field.OptionSourceGroup,
            ExtractionActionGroup = field.ExtractionActionGroup,
            Options = field.Options.Select(ToDetectedFieldOptionViewModel).ToList(),
            OptionsTruncated = field.OptionsTruncated,
            OptionsScanReason = field.OptionsScanReason,
            SourceUrl = field.SourceUrl
        };
    }

    private static DetectedFieldOptionViewModel ToDetectedFieldOptionViewModel(DetectedFieldOption option)
    {
        return new DetectedFieldOptionViewModel
        {
            Value = option.Value,
            Label = option.Label,
            Selector = option.Selector,
            Source = option.Source,
            FillMethod = option.FillMethod,
            Selected = option.Selected,
            Position = option.Position
        };
    }
}
