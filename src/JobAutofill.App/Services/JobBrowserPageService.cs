using JobAutofill.App.ViewModels;
using JobAutofill.App.WebView;
using JobAutofill.App.Views;
using JobAutofill.Core.Workflow;
using JobAutofill.Domain.Models;
using System.Collections.ObjectModel;
using System.Text.Json;

namespace JobAutofill.App.Services;

/// <summary>
/// Encapsulates all browser page workflows (scan, fill, approve, focus, debug, options).
/// This keeps the page thin and keeps workflow state in the ViewModel.
/// </summary>
public class JobBrowserPageService
{
    private readonly JobBrowserViewModel _viewModel;
    private readonly AutofillWorkflow _autofillWorkflow;
    private readonly JobWebViewBridge _webViewBridge;
    private readonly JobBrowserWorkflowService _workflowService;
    private readonly ObservableCollection<DetectedFieldViewModel> _detectedFields;
    
    private string? _lastScanRawResult;
    private WebViewCapabilityResult _lastScanCapability = WebViewCapabilityResult.Unknown;

    public JobBrowserPageService(
        JobBrowserViewModel viewModel,
        AutofillWorkflow autofillWorkflow,
        JobWebViewBridge webViewBridge,
        ObservableCollection<DetectedFieldViewModel> detectedFields)
    {
        _viewModel = viewModel ?? throw new ArgumentNullException(nameof(viewModel));
        _autofillWorkflow = autofillWorkflow ?? throw new ArgumentNullException(nameof(autofillWorkflow));
        _webViewBridge = webViewBridge ?? throw new ArgumentNullException(nameof(webViewBridge));
        _detectedFields = detectedFields ?? throw new ArgumentNullException(nameof(detectedFields));
        _workflowService = new JobBrowserWorkflowService();
    }

    public async Task ScanAsync(string pageUrl)
    {
        _viewModel.StatusText = "Scanning fields...";

        try
        {
            var scanResult = await _webViewBridge.ScanAsync();
            _lastScanRawResult = scanResult.RawResult;
            _lastScanCapability = scanResult.Capability;

            _detectedFields.Clear();
            var preparedFields = await _workflowService.PrepareDetectedFieldsAsync(
                _autofillWorkflow,
                pageUrl,
                scanResult.Fields,
                _lastScanCapability,
                ProfileStore.Current,
                _webViewBridge,
                GetFieldId);

            foreach (var field in preparedFields)
            {
                _detectedFields.Add(field);
            }

            var fillableCount = _detectedFields.Count(field => field.CanApprove || field.CanAutoFill);
            var approvedCount = _detectedFields.Count(field => field.CanAutoFill);
            var apiDecisionCount = _detectedFields.Count(field => field.NeedsApiDecision);
            var blockedCount = _detectedFields.Count(field => field.IsBlocked);
            var optionsCapturedCount = _detectedFields.Count(field => field.HasOptions);

            var noFieldsHint = _lastScanCapability.IsHardStop
                ? _lastScanCapability.Message
                : await JobBrowserWorkflowService.GetNoFieldsHintAsync(_webViewBridge);

            _viewModel.StatusText = JobBrowserWorkflowService.BuildScanStatusText(
                _detectedFields.Count,
                optionsCapturedCount,
                fillableCount,
                approvedCount,
                apiDecisionCount,
                blockedCount,
                _lastScanCapability,
                noFieldsHint);
        }
        catch (Exception ex)
        {
            _viewModel.StatusText = $"Scan failed: {FirstLine(ex.ToString())}";
            throw;
        }
    }

    public async Task FillAsync()
    {
        _viewModel.StatusText = "Filling matched fields...";

        try
        {
            await _webViewBridge.EnsureFillScriptInjectedAsync();

            var filledCount = 0;
            var skippedCount = 0;
            var approvalItems = _detectedFields
                .Where(field => field.CanAutoFill)
                .Select(ToApprovedApprovalItem)
                .ToList();
            var fillCommands = _autofillWorkflow.BuildFillCommands(approvalItems);

            foreach (var command in fillCommands)
            {
                var fillResult = await _webViewBridge.FillAsync(command);
                if (fillResult.Ok)
                {
                    filledCount++;
                }
                else
                {
                    skippedCount++;
                }
            }

            var pendingApiCount = _detectedFields.Count(field => field.NeedsApiDecision);
            var blockedCount = _detectedFields.Count(field => field.IsBlocked);
            var readyButUnapprovedCount = _detectedFields.Count(field => field.CanApprove);

            _viewModel.StatusText = skippedCount > 0
                ? $"Filled {filledCount} fields. {skippedCount} not ready."
                : readyButUnapprovedCount > 0
                    ? $"Filled {filledCount} approved fields. {readyButUnapprovedCount} still need approval."
                : pendingApiCount + blockedCount > 0
                    ? $"Filled {filledCount} fields. {pendingApiCount} need API, {blockedCount} blocked."
                : filledCount == 1
                    ? "Filled 1 field."
                    : $"Filled {filledCount} fields.";
        }
        catch (Exception ex)
        {
            _viewModel.StatusText = $"Fill failed: {FirstLine(ex.ToString())}";
            throw;
        }
    }

    public async Task ApproveFieldAsync(DetectedFieldViewModel field)
    {
        try
        {
            field.Approve();
            await _webViewBridge.FocusFieldAsync(ToDetectedField(field));
            _viewModel.StatusText = $"Approved {field.Label ?? field.Selector}.";
        }
        catch (Exception ex)
        {
            _viewModel.StatusText = $"Approve failed: {FirstLine(ex.ToString())}";
            throw;
        }
    }

    public async Task FocusFieldAsync(DetectedFieldViewModel field)
    {
        try
        {
            await _webViewBridge.FocusFieldAsync(ToDetectedField(field));

            if (field.CanAutoFill)
            {
                _viewModel.StatusText = $"Focused {field.Label ?? field.Selector}. Use Fill to apply approved fields.";
                return;
            }

            await CopyDebugJsonAsync(field.ToDebugObject());
            _viewModel.StatusText = field.CanApprove
                ? $"Focused {field.Label ?? field.Selector}. Approve it before filling."
                : field.NeedsApiDecision
                ? $"Focused {field.Label ?? field.Selector}. Needs API decision; debug copied."
                : $"Focused {field.Label ?? field.Selector}. Blocked; debug copied.";
        }
        catch (Exception ex)
        {
            _viewModel.StatusText = $"Field focus failed: {FirstLine(ex.ToString())}";
            throw;
        }
    }

    public async Task DebugAsync()
    {
        try
        {
            var debugInfoJson = await _webViewBridge.GetEncodedScanDebugJsonAsync();

            var debugPayload = new
            {
                scanCapability = _lastScanCapability,
                scanDiagnostics = ParseJsonForDebugExport(debugInfoJson),
                passiveScanRawResult = ParseJsonForDebugExport(_lastScanRawResult),
                detectedFieldsCount = _detectedFields.Count,
                detectedFieldsWithOptionsCount = _detectedFields.Count(field => field.HasOptions),
                note = "passiveScanRawResult is captured before targeted option enrichment; detectedFields is the enriched app state.",
                detectedFields = _detectedFields.Select(field => field.ToDebugObject()).ToList()
            };

            await CopyDebugJsonAsync(debugPayload);
            var debugType = _detectedFields.Count == 0 ? "no fields (0/0)" : $"{_detectedFields.Count} fields";
            _viewModel.StatusText = $"Copied debug: {debugType} + raw scan data.";
        }
        catch (Exception ex)
        {
            _viewModel.StatusText = $"Debug export failed: {FirstLine(ex.ToString())}";
            throw;
        }
    }

    public async Task SelectOptionAsync(DetectedFieldOptionViewModel option)
    {
        var field = _detectedFields.FirstOrDefault(candidate => candidate.Options.Contains(option));
        if (field is null)
        {
            _viewModel.StatusText = "Could not find field for selected option.";
            return;
        }

        try
        {
            if (field.IsMultipleSelection)
            {
                if (!field.MatchedOptions.Contains(option))
                {
                    field.MatchedOptions.Add(option);
                }

                field.ValueToFill = string.Join(", ", field.MatchedOptions.Select(match => match.FillValue));
                field.ApproveSelectedOptions();
            }
            else
            {
                field.SetExplicitSelection(option);
            }

            await _webViewBridge.FocusFieldAsync(ToDetectedField(field));
            _viewModel.StatusText = $"Approved {option.DisplayText} for {field.Label ?? field.Selector}.";
        }
        catch (Exception ex)
        {
            _viewModel.StatusText = $"Option approval failed: {FirstLine(ex.ToString())}";
            throw;
        }
    }

    public void ResetForNewJob()
    {
        _detectedFields.Clear();
        _webViewBridge.ResetInjectedState();
        _lastScanRawResult = null;
        _lastScanCapability = WebViewCapabilityResult.Unknown;
        _viewModel.StatusText = "Loading page...";
    }

    public void OnWebViewNavigating()
    {
        _webViewBridge.ResetInjectedState();
        _lastScanRawResult = null;
        _lastScanCapability = WebViewCapabilityResult.Unknown;
        _viewModel.StatusText = "Loading page...";
    }

    public async Task OnWebViewNavigatedAsync()
    {
        try
        {
            await _webViewBridge.EnsureDetectorInjectedAsync();
            _viewModel.StatusText = "Page loaded. Ready to scan.";
        }
        catch (Exception ex)
        {
            _viewModel.StatusText = $"Detector injection failed: {FirstLine(ex.ToString())}";
            throw;
        }
    }

    private static string GetFieldId(DetectedFieldViewModel field)
    {
        return string.IsNullOrWhiteSpace(field.Selector)
            ? $"{field.SourceUrl}|{field.Label}|{field.InputType}"
            : field.Selector;
    }

    private static ApprovalItem ToApprovedApprovalItem(DetectedFieldViewModel field)
    {
        return new ApprovalItem
        {
            FieldId = GetFieldId(field),
            Field = ToDetectedField(field),
            MatchedProfileAttribute = field.MatchedProfileAttribute,
            ProposedValue = field.ValueToFill,
            SelectedOptions = field.MatchedOptions.Select(ToSelectedFieldOption).ToList(),
            Confidence = field.Confidence,
            Status = ApprovalItemStatus.Approved,
            Reason = ApprovalDecisionReason.None,
            Message = field.ReviewReason ?? string.Empty
        };
    }

    private static DetectedField ToDetectedField(DetectedFieldViewModel field)
    {
        return new DetectedField
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
            Options = field.Options.Select(ToDetectedFieldOption).ToList(),
            OptionsTruncated = field.OptionsTruncated,
            OptionsScanReason = field.OptionsScanReason,
            SourceUrl = field.SourceUrl
        };
    }

    private static DetectedFieldOption ToDetectedFieldOption(DetectedFieldOptionViewModel option)
    {
        return new DetectedFieldOption
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

    private static SelectedFieldOption ToSelectedFieldOption(DetectedFieldOptionViewModel option)
    {
        return new SelectedFieldOption
        {
            Value = option.Value,
            Label = option.Label,
            Selector = option.Selector
        };
    }

    private static async Task CopyDebugJsonAsync(object payload)
    {
        var json = JsonSerializer.Serialize(
            payload,
            new JsonSerializerOptions
            {
                WriteIndented = true,
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            });

        await Clipboard.Default.SetTextAsync(json);
    }

    private static object ParseJsonForDebugExport(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return new { };
        }

        try
        {
            using var document = JsonDocument.Parse(json);
            return document.RootElement.Clone();
        }
        catch (JsonException)
        {
            return json;
        }
    }

    private static string FirstLine(string value)
    {
        return value
            .Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries)
            .FirstOrDefault() ?? "Unknown error";
    }
}
