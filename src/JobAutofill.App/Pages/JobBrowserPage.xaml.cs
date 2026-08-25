using JobAutofill.Core.Workflow;
using JobAutofill.Core.Matching;
using JobAutofill.App.WebView;
using JobAutofill.App.ViewModels;
using JobAutofill.App.Views;
using JobAutofill.Domain.Models;
using JobAutofill.Infrastructure.Api;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Maui.Controls;
using System.Collections.ObjectModel;
using System.Text.Json;

namespace JobAutofill.App.Pages;

public partial class JobBrowserPage : ContentPage, IQueryAttributable
{
    private const double BottomSheetCollapsedHeight = 104d;
    private const double BottomSheetExpandedHeight = 340d;
    private readonly ObservableCollection<DetectedFieldViewModel> _detectedFields = new();
    private readonly AutofillWorkflow _autofillWorkflow;
    private readonly JobWebViewBridge _webViewBridge;
    private string? _lastScanRawResult;  // Store raw scan result for debug output
    private WebViewCapabilityResult _lastScanCapability = WebViewCapabilityResult.Unknown;
    private bool _isBottomSheetExpanded;

    public JobBrowserPage()
        : this(ResolveAutofillWorkflow())
    {
    }

    private JobBrowserPage(AutofillWorkflow autofillWorkflow)
    {
        InitializeComponent();
        _autofillWorkflow = autofillWorkflow;
        _webViewBridge = new JobWebViewBridge(JobWebView);
        DetectedFieldsView.ItemsSource = _detectedFields;
        Shell.SetBackButtonBehavior(this, new BackButtonBehavior
        {
            Command = new Command(async () => await NavigateBackAsync())
        });
    }

    public void ApplyQueryAttributes(IDictionary<string, object> query)
    {
        if (query.TryGetValue("JobPost", out var value) && value is SampleJobPost jobPost)
        {
            Title = jobPost.Company;
            JobTitleLabel.Text = $"{jobPost.Company} - {jobPost.Title}";
            JobUrlLabel.Text = jobPost.Url;
            OpenJob(jobPost);
        }
    }

    private void OpenJob(SampleJobPost jobPost)
    {
        _detectedFields.Clear();
        _webViewBridge.ResetInjectedState();
        _lastScanRawResult = null;
        _lastScanCapability = WebViewCapabilityResult.Unknown;
        ScanToolbarItem.IsEnabled = false;
        FillToolbarItem.IsEnabled = false;
        DebugToolbarItem.IsEnabled = false;
        SetBottomSheetExpanded(false);
        StatusLabel.Text = "Loading page...";
        JobWebView.Source = new UrlWebViewSource { Url = jobPost.Url };
    }

    protected override bool OnBackButtonPressed()
    {
        _ = NavigateBackAsync();
        return true;
    }

    private async Task NavigateBackAsync()
    {
        if (JobWebView.CanGoBack)
        {
            JobWebView.GoBack();
            return;
        }

        await Shell.Current.GoToAsync("..");
    }

    private void OnWebViewNavigating(object? sender, WebNavigatingEventArgs e)
    {
        _webViewBridge.ResetInjectedState();
        _lastScanRawResult = null;
        _lastScanCapability = WebViewCapabilityResult.Unknown;
        ScanToolbarItem.IsEnabled = false;
        FillToolbarItem.IsEnabled = false;
        DebugToolbarItem.IsEnabled = false;
        StatusLabel.Text = "Loading page...";
    }

    private async void OnWebViewNavigated(object? sender, WebNavigatedEventArgs e)
    {
        if (e.Result != WebNavigationResult.Success)
        {
            await ShowErrorAsync("Navigation failed", $"Navigation failed: {e.Result}");
            return;
        }

        try
        {
            await _webViewBridge.EnsureDetectorInjectedAsync();
            ScanToolbarItem.IsEnabled = true;
            StatusLabel.Text = "Page loaded. Ready to scan.";
        }
        catch (Exception ex)
        {
            await ShowErrorAsync("Detector injection failed", ex.ToString());
        }
    }

    private async void OnScanClicked(object? sender, EventArgs e)
    {
        ScanToolbarItem.IsEnabled = false;
        StatusLabel.Text = "Scanning fields...";

        try
        {
            var scanResult = await _webViewBridge.ScanAsync();
            _lastScanRawResult = scanResult.RawResult;  // Store raw scan result for debug output
            _lastScanCapability = scanResult.Capability;

            _detectedFields.Clear();
            var normalizedFields = _autofillWorkflow.NormalizeFields(scanResult.Fields).ToList();
            var pageUrl = (JobWebView.Source as UrlWebViewSource)?.Url ?? string.Empty;

            var preparation = await _autofillWorkflow.PrepareAsync(
                pageUrl,
                normalizedFields,
                ProfileStore.Current,
                _lastScanCapability.ToCoreReport());

            var approvalMap = preparation.ApprovalItems.ToDictionary(item => item.FieldId, StringComparer.Ordinal);
            foreach (var detectedField in preparation.Fields)
            {
                var field = ToDetectedFieldViewModel(detectedField);
                if (approvalMap.TryGetValue(GetFieldId(field), out var approvalItem))
                {
                    field.ApplyApprovalItem(approvalItem);
                }

                _detectedFields.Add(field);
            }

            var fillableCount = _detectedFields.Count(field => field.CanApprove || field.CanAutoFill);
            var approvedCount = _detectedFields.Count(field => field.CanAutoFill);
            var apiDecisionCount = _detectedFields.Count(field => field.NeedsApiDecision);
            var blockedCount = _detectedFields.Count(field => field.IsBlocked);
            var optionsCapturedCount = _detectedFields.Count(field => field.HasOptions);
            FillToolbarItem.IsEnabled = approvedCount > 0;
            DebugToolbarItem.IsEnabled = true;  // Enable debug to show scan diagnostics, even if 0 fields

            if (_detectedFields.Count == 0)
            {
                var pageHint = _lastScanCapability.IsHardStop
                    ? _lastScanCapability.Message
                    : await GetNoFieldsHintAsync();

                StatusLabel.Text = $"No fields detected. {pageHint} Tap Debug to see diagnostics.";
            }
            else if (_lastScanCapability.IsPartialScan)
            {
                StatusLabel.Text = $"Found {_detectedFields.Count} fields, {optionsCapturedCount} with options, {fillableCount} ready, {approvedCount} approved, {apiDecisionCount} need API, {blockedCount} blocked. Partial scan: {_lastScanCapability.Message}";
            }
            else
            {
                StatusLabel.Text = $"Found {_detectedFields.Count} fields, {optionsCapturedCount} with options, {fillableCount} ready, {approvedCount} approved, {apiDecisionCount} need API, {blockedCount} blocked.";
            }

            SetBottomSheetExpanded(true);
        }
        catch (Exception ex)
        {
            await ShowErrorAsync("Scan failed", ex.ToString());
        }
        finally
        {
            ScanToolbarItem.IsEnabled = true;
        }
    }

    private void OnBottomSheetTapped(object? sender, TappedEventArgs e)
    {
        SetBottomSheetExpanded(!_isBottomSheetExpanded);
    }

    private void OnBottomSheetPanUpdated(object? sender, PanUpdatedEventArgs e)
    {
        if (e.StatusType != GestureStatus.Completed)
        {
            return;
        }

        if (e.TotalY < -20)
        {
            SetBottomSheetExpanded(true);
            return;
        }

        if (e.TotalY > 20)
        {
            SetBottomSheetExpanded(false);
        }
    }

    private void SetBottomSheetExpanded(bool expanded)
    {
        _isBottomSheetExpanded = expanded;
        BottomSheet.HeightRequest = expanded ? BottomSheetExpandedHeight : BottomSheetCollapsedHeight;
        DetectedFieldsPanel.IsVisible = expanded;
    }

    private async void OnFillClicked(object? sender, EventArgs e)
    {
        FillToolbarItem.IsEnabled = false;
        StatusLabel.Text = "Filling matched fields...";

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
                    continue;
                }

                skippedCount++;
            }

            var pendingApiCount = _detectedFields.Count(field => field.NeedsApiDecision);
            var blockedCount = _detectedFields.Count(field => field.IsBlocked);
            var readyButUnapprovedCount = _detectedFields.Count(field => field.CanApprove);
            StatusLabel.Text = skippedCount > 0
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
            await ShowErrorAsync("Fill failed", ex.ToString());
        }
        finally
        {
            FillToolbarItem.IsEnabled = _detectedFields.Any(field => field.CanAutoFill);
        }
    }

    private async void OnApproveFieldClicked(object? sender, EventArgs e)
    {
        if (sender is not Button { CommandParameter: DetectedFieldViewModel field })
        {
            return;
        }

        try
        {
            field.Approve();
            await _webViewBridge.FocusFieldAsync(ToDetectedField(field));
            FillToolbarItem.IsEnabled = _detectedFields.Any(candidate => candidate.CanAutoFill);
            StatusLabel.Text = $"Approved {field.Label ?? field.Selector}.";
        }
        catch (Exception ex)
        {
            await ShowErrorAsync("Approve failed", ex.ToString());
        }
    }

    private async void OnDetectedFieldTapped(object? sender, TappedEventArgs e)
    {
        if (e.Parameter is not DetectedFieldViewModel field)
        {
            return;
        }

        try
        {
            await _webViewBridge.FocusFieldAsync(ToDetectedField(field));

            if (field.CanAutoFill)
            {
                StatusLabel.Text = $"Focused {field.Label ?? field.Selector}. Use Fill to apply approved fields.";
                return;
            }

            await CopyDebugJsonAsync(field.ToDebugObject());
            StatusLabel.Text = field.CanApprove
                ? $"Focused {field.Label ?? field.Selector}. Approve it before filling."
                : field.NeedsApiDecision
                ? $"Focused {field.Label ?? field.Selector}. Needs API decision; debug copied."
                : $"Focused {field.Label ?? field.Selector}. Blocked; debug copied.";
        }
        catch (Exception ex)
        {
            await ShowErrorAsync("Field focus failed", ex.ToString());
        }
    }

    private async void OnDebugClicked(object? sender, EventArgs e)
    {
        try
        {
            var debugInfoJson = await _webViewBridge.GetEncodedScanDebugJsonAsync();
            
            var debugPayload = new
            {
                url = (JobWebView.Source as UrlWebViewSource)?.Url,
                scanCapability = _lastScanCapability,
                scanDiagnostics = ParseJsonForDebugExport(debugInfoJson),
                passiveScanRawResult = ParseJsonForDebugExport(_lastScanRawResult),
                detectedFieldsCount = _detectedFields.Count,
                detectedFieldsWithOptionsCount = _detectedFields.Count(field => field.HasOptions),
                note = "passiveScanRawResult is captured before targeted option enrichment; detectedFields is the enriched app state.",
                detectedFields = _detectedFields.Select(field => field.ToDebugObject()).ToList()
            };

            await CopyDebugJsonAsync(debugPayload);
            var debugType = _detectedFields.Count == 0 ? $"no fields (0/0)" : $"{_detectedFields.Count} fields";
            StatusLabel.Text = $"Copied debug: {debugType} + raw scan data.";
        }
        catch (Exception ex)
        {
            await ShowErrorAsync("Debug export failed", ex.ToString());
        }
    }

    private async Task<string> GetNoFieldsHintAsync()
    {
        var pageClassification = await _webViewBridge.GetCurrentPageClassificationAsync();
        return pageClassification switch
        {
            "auth-gated" => "This page is login-gated or requires auth before form fields are exposed.",
            "iframe-based" => "This page appears to use iframe-based content and is not supported in Tier 1.",
            "custom-app-shell" => "This page appears to use a custom app shell or non-standard form implementation.",
            _ => "This page does not expose standard form fields in the current runtime state."
        };
    }

    private async void OnDetectedFieldOptionClicked(object? sender, EventArgs e)
    {
        if (sender is not Button { CommandParameter: DetectedFieldOptionViewModel option })
        {
            return;
        }

        var field = _detectedFields.FirstOrDefault(candidate => candidate.Options.Contains(option));
        if (field is null)
        {
            StatusLabel.Text = "Could not find field for selected option.";
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
            FillToolbarItem.IsEnabled = _detectedFields.Any(candidate => candidate.CanAutoFill);

            StatusLabel.Text = $"Approved {option.DisplayText} for {field.Label ?? field.Selector}.";
        }
        catch (Exception ex)
        {
            await ShowErrorAsync("Option approval failed", ex.ToString());
        }
    }

    private static AutofillWorkflow ResolveAutofillWorkflow()
    {
        var services = global::Microsoft.Maui.Controls.Application.Current?.Handler?.MauiContext?.Services;
        return services?.GetService<AutofillWorkflow>() ??
            new AutofillWorkflow(
                new DetectedFieldNormalizer(),
                new FieldApprovalWorkflow(new LocalProfileFieldMatcher(), new PlaceholderApiFieldDecisionClient()),
                new FillCommandPlanner());
    }

    private void RefreshDetectedFieldsView()
    {
        foreach (var field in _detectedFields)
        {
            field.NotifyStateChanged();
        }
    }

    private static string GetFieldId(DetectedFieldViewModel field)
    {
        return string.IsNullOrWhiteSpace(field.Selector)
            ? $"{field.SourceUrl}|{field.Label}|{field.InputType}"
            : field.Selector;
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

    private static SelectedFieldOption ToSelectedFieldOption(DetectedFieldOptionViewModel option)
    {
        return new SelectedFieldOption
        {
            Value = option.Value,
            Label = option.Label,
            Selector = option.Selector
        };
    }

    private async Task ShowErrorAsync(string title, string detail)
    {
        StatusLabel.Text = $"{title}: {FirstLine(detail)}";

        var copy = await DisplayAlertAsync(title, detail, "Copy", "OK");
        if (!copy)
        {
            return;
        }

        try
        {
            await Clipboard.Default.SetTextAsync($"{title}\n\n{detail}");
            StatusLabel.Text = $"{title}: copied to clipboard.";
        }
        catch (Exception ex)
        {
            await DisplayAlertAsync("Copy failed", ex.ToString(), "OK");
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
