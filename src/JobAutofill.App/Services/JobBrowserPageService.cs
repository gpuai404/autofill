using JobAutofill.App.Mappers;
using JobAutofill.App.Models.WebView;
using JobAutofill.App.ViewModels;
using JobAutofill.App.WebView;
using JobAutofill.Core.Contracts;
using JobAutofill.Domain.Models;
using System.Text.Json;

namespace JobAutofill.App.Services;

/// <summary>
/// Encapsulates all browser page workflows (scan, fill, approve, focus, debug, options).
/// This keeps the page thin and keeps workflow state in the ViewModel.
/// </summary>
public sealed class JobBrowserPageService : IJobBrowserPageService
{
    private readonly IJobBrowserViewModel _viewModel;
    private readonly IJobWebViewBridge _webViewBridge;
    private readonly IJobBrowserWorkflowService _workflowService;
    private readonly IJobBrowserStatusService _statusService;
    private readonly IDetectedFieldViewModelMapper _detectedFieldViewModelMapper;
    private readonly IProfileRepository _profileRepository;
    
    private string? _lastScanRawResult;
    private WebViewCapabilityResult _lastScanCapability = WebViewCapabilityResult.Unknown;

    public JobBrowserPageService(
        IJobBrowserViewModel viewModel,
        IJobWebViewBridge webViewBridge,
        IJobBrowserWorkflowService workflowService,
        IJobBrowserStatusService statusService,
        IDetectedFieldViewModelMapper detectedFieldViewModelMapper,
        IProfileRepository profileRepository)
    {
        _viewModel = viewModel ?? throw new ArgumentNullException(nameof(viewModel));
        _webViewBridge = webViewBridge ?? throw new ArgumentNullException(nameof(webViewBridge));
        _workflowService = workflowService ?? throw new ArgumentNullException(nameof(workflowService));
        _statusService = statusService ?? throw new ArgumentNullException(nameof(statusService));
        _detectedFieldViewModelMapper = detectedFieldViewModelMapper ?? throw new ArgumentNullException(nameof(detectedFieldViewModelMapper));
        _profileRepository = profileRepository ?? throw new ArgumentNullException(nameof(profileRepository));
    }

    public async Task ScanAsync(string pageUrl)
    {
        _viewModel.SetStatus("Scanning fields...");

        try
        {
            var scanResult = await _webViewBridge.ScanAsync();
            _lastScanRawResult = scanResult.RawResult;
            _lastScanCapability = scanResult.Capability;

            var profile = await _profileRepository.GetCurrentAsync();
            if (profile is null)
            {
                _viewModel.SetStatus("Create your profile before scanning job applications.");
                return;
            }

            var preparedFields = await _workflowService.PrepareDetectedFieldsAsync(
                pageUrl,
                await _webViewBridge.GetCurrentPageLanguageAsync(),
                scanResult.Fields,
                _lastScanCapability,
                profile);
            _viewModel.ReplaceDetectedFields(preparedFields);

            var readyCount = _viewModel.DetectedFields.Count(field => field.CanAutoFill);
            var attentionCount = _viewModel.DetectedFields.Count(field => field.NeedsAttention);
            var manualCount = _viewModel.DetectedFields.Count(field => field.IsManual);

            var noFieldsHint = _lastScanCapability.IsHardStop
                ? _lastScanCapability.Message
                : await _statusService.GetNoFieldsHintAsync(_webViewBridge);

            _viewModel.SetStatus(_statusService.BuildScanStatusText(
                _viewModel.DetectedFields.Count,
                readyCount,
                attentionCount,
                manualCount,
                _lastScanCapability,
                noFieldsHint));
        }
        catch (Exception ex)
        {
            _viewModel.SetStatus($"Scan failed: {FirstLine(ex.ToString())}");
        }
    }

    public async Task FillAsync()
    {
        _viewModel.SetStatus("Filling matched fields...");

        try
        {
            await _webViewBridge.EnsureFillScriptInjectedAsync();

            var filledCount = 0;
            var skippedCount = 0;
            var fillCommands = _workflowService.BuildFillCommands(_viewModel.DetectedFields);

            foreach (var command in fillCommands)
            {
                var field = _viewModel.DetectedFields.First(item => item.State.Field.FieldId == command.FieldId);
                field.MarkFilling();
                try
                {
                    var fillResult = await _webViewBridge.FillAsync(command);
                    field.ApplyFillResult(new FieldFillResult(
                        command.FieldId,
                        fillResult.Ok ? FieldExecutionState.Filled : FieldExecutionState.Failed,
                        command.Value,
                        fillResult.ObservedValue,
                        fillResult.Message,
                        CanRetry: !fillResult.Ok));
                    if (fillResult.Ok) filledCount++;
                    else skippedCount++;
                }
                catch (Exception ex)
                {
                    skippedCount++;
                    field.ApplyFillResult(new FieldFillResult(
                        command.FieldId,
                        FieldExecutionState.Failed,
                        command.Value,
                        null,
                        FirstLine(ex.Message),
                        CanRetry: true));
                }
            }

            var attentionCount = _viewModel.DetectedFields.Count(field => field.NeedsAttention);
            var manualCount = _viewModel.DetectedFields.Count(field => field.IsManual && !field.IsCompleted);

            _viewModel.SetStatus(skippedCount > 0
                ? $"Filled {filledCount} fields. {skippedCount} not ready."
                : attentionCount + manualCount > 0
                    ? $"Filled {filledCount} fields. {attentionCount} need attention, {manualCount} manual."
                : filledCount == 1
                    ? "Filled 1 field."
                    : $"Filled {filledCount} fields.");
        }
        catch (Exception ex)
        {
            _viewModel.SetStatus($"Fill failed: {FirstLine(ex.ToString())}");
            throw;
        }
    }

    public async Task ApproveFieldAsync(DetectedFieldViewModel field)
    {
        try
        {
            field.Confirm();
            await _webViewBridge.FocusFieldAsync(_detectedFieldViewModelMapper.ToDomainModel(field));
            _viewModel.SetStatus($"Confirmed {field.Label}.");
        }
        catch (Exception ex)
        {
            _viewModel.SetStatus($"Approve failed: {FirstLine(ex.ToString())}");
            throw;
        }
    }

    public async Task FocusFieldAsync(DetectedFieldViewModel field)
    {
        try
        {
            await _webViewBridge.FocusFieldAsync(_detectedFieldViewModelMapper.ToDomainModel(field));

            if (field.CanAutoFill)
            {
                _viewModel.SetStatus($"Focused {field.Label}. Use Fill to apply ready fields.");
                return;
            }

            _viewModel.SetStatus(field.CanApprove
                ? $"Focused {field.Label}. Confirm the suggestion before filling."
                : field.IsManual
                    ? $"Focused {field.Label}. Complete this field manually."
                    : $"Focused {field.Label}. Add an answer before filling.");
        }
        catch (Exception ex)
        {
            _viewModel.SetStatus($"Field focus failed: {FirstLine(ex.ToString())}");
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
                detectedFieldsCount = _viewModel.DetectedFields.Count,
                detectedFieldsWithOptionsCount = _viewModel.DetectedFields.Count(field => field.HasOptions),
                note = "passiveScanRawResult is captured before targeted option enrichment; detectedFields is the enriched app state.",
                detectedFields = _viewModel.DetectedFields.Select(field => field.ToDebugObject()).ToList()
            };

            await CopyDebugJsonAsync(debugPayload);
            var debugType = _viewModel.DetectedFields.Count == 0 ? "no fields (0/0)" : $"{_viewModel.DetectedFields.Count} fields";
            _viewModel.SetStatus($"Copied debug: {debugType} + raw scan data.");
        }
        catch (Exception ex)
        {
            _viewModel.SetStatus($"Debug export failed: {FirstLine(ex.ToString())}");
            throw;
        }
    }

    public async Task SelectOptionAsync(DetectedFieldOptionViewModel option)
    {
        var field = _viewModel.DetectedFields.FirstOrDefault(candidate => candidate.Options.Contains(option));
        if (field is null)
        {
            _viewModel.SetStatus("Could not find field for selected option.");
            return;
        }

        try
        {
            field.SelectOption(option);

            await _webViewBridge.FocusFieldAsync(_detectedFieldViewModelMapper.ToDomainModel(field));
            _viewModel.SetStatus(field.IsMultipleSelection
                ? $"Updated choices for {field.Label}. Confirm when finished."
                : $"Selected {option.DisplayText} for {field.Label}.");
        }
        catch (Exception ex)
        {
            _viewModel.SetStatus($"Option approval failed: {FirstLine(ex.ToString())}");
            throw;
        }
    }

    public void ResetForNewJob()
    {
        _viewModel.ResetForLoading();
        _webViewBridge.ResetInjectedState();
        _lastScanRawResult = null;
        _lastScanCapability = WebViewCapabilityResult.Unknown;
    }

    public void OnWebViewNavigating()
    {
        _webViewBridge.ResetInjectedState();
        _lastScanRawResult = null;
        _lastScanCapability = WebViewCapabilityResult.Unknown;
        _viewModel.ResetForLoading();
    }

    public async Task OnWebViewNavigatedAsync()
    {
        try
        {
            await _webViewBridge.EnsureDetectorInjectedAsync();
            _viewModel.SetStatus("Page loaded. Ready to scan.");
        }
        catch (Exception ex)
        {
            _viewModel.SetStatus($"Detector injection failed: {FirstLine(ex.ToString())}");
            throw;
        }
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
