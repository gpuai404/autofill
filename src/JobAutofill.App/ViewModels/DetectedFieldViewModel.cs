using JobAutofill.Domain.Models;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Text.RegularExpressions;

namespace JobAutofill.App.ViewModels;

public sealed class DetectedFieldViewModel : INotifyPropertyChanged
{
    private IReadOnlyList<DetectedFieldOptionViewModel> _options = [];

    public event PropertyChangedEventHandler? PropertyChanged;

    public required string Selector { get; init; }
    public string? Label { get; init; }
    public string? InputType { get; init; }
    public string? ControlType { get; init; }
    public string? ControlFamily { get; init; }
    public string? SelectionMode { get; init; }
    public string? SelectionModeReason { get; init; }
    public string? FieldCategory { get; init; }
    public string? FieldSubCategory { get; init; }
    public string? FieldCategoryReason { get; init; }
    public string? NativeInputType { get; init; }
    public string? TagName { get; init; }
    public string? Role { get; init; }
    public string? AriaHasPopup { get; init; }
    public string? AriaExpanded { get; init; }
    public string? AriaControls { get; init; }
    public string? AriaOwns { get; init; }
    public string? AriaActiveDescendant { get; init; }
    public string? AriaAutocomplete { get; init; }
    public string? AriaMultiselectable { get; init; }
    public string? Autocomplete { get; init; }
    public string? List { get; init; }
    public string? Required { get; init; }
    public string? Optional { get; init; }
    public string? Disabled { get; init; }
    public string? Readonly { get; init; }
    public string? Multiple { get; init; }
    public string? ScanReason { get; init; }
    public bool RequiresCapturedOption { get; init; }
    public string? ValuePolicy { get; init; }
    public string? FillStrategy { get; init; }
    public string? OptionSourceGroup { get; init; }
    public string? ExtractionActionGroup { get; init; }
    public IReadOnlyList<DetectedFieldOptionViewModel> Options
    {
        get => _options;
        set
        {
            _options = value;
            NotifyStateChanged();
        }
    }
    public bool OptionsTruncated { get; set; }
    public string? OptionsScanReason { get; set; }
    public string? SourceUrl { get; init; }
    public string? ValueToFill { get; set; }
    public List<DetectedFieldOptionViewModel> MatchedOptions { get; } = [];
    public string? ReviewReason { get; set; }
    public string? MatchedProfileAttribute { get; set; }
    public double Confidence { get; set; }
    public bool UserApproved { get; private set; }
    public FieldDecisionStatus DecisionStatus { get; private set; } = FieldDecisionStatus.NeedsApiDecision;
    public FieldDecisionReason DecisionReason { get; private set; } = FieldDecisionReason.MissingProfileValue;
    public bool HasFillValue => !string.IsNullOrWhiteSpace(ValueToFill);
    public bool HasOptions => Options.Count > 0;
    public bool HasMatchedOptions => MatchedOptions.Count > 0;
    public bool CanAutoFill => DecisionStatus == FieldDecisionStatus.ReadyToFill && UserApproved;
    public bool CanApprove => DecisionStatus == FieldDecisionStatus.ReadyToFill && !UserApproved;
    public bool NeedsApiDecision => DecisionStatus == FieldDecisionStatus.NeedsApiDecision;
    public bool IsBlocked => DecisionStatus == FieldDecisionStatus.Blocked;
    public int OptionCount => Options.Count;
    public string OptionsPreview => Options.Count == 0
        ? string.Empty
        : string.Join(", ", Options.Take(5).Select(option => option.DisplayText)) +
          (Options.Count > 5 ? $" +{Options.Count - 5} more" : string.Empty);
    public bool ShouldShowOptionsSummary => RequiresCapturedOption || HasOptions;
    public string OptionsSummary => Options.Count > 0
        ? $"{Options.Count} options: {OptionsPreview}"
        : RequiresCapturedOption
            ? "Options not captured"
            : string.Empty;
    public string ApprovalActionText => UserApproved ? "Approved" : "Approve";

    private bool RequiresManualReview =>
        string.Equals(ValuePolicy, "manualReview", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(FillStrategy, "skip", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(FillStrategy, "unsupportedInPageJavaScript", StringComparison.OrdinalIgnoreCase);

    public bool AllowsEditableComboboxTextFallback =>
        string.Equals(ValuePolicy, "mustMatchCapturedOptionUnlessEditableFreeText", StringComparison.OrdinalIgnoreCase) &&
        string.Equals(FillStrategy, "openPopupThenSelectCapturedOption", StringComparison.OrdinalIgnoreCase) &&
        string.Equals(ControlType, "combobox", StringComparison.OrdinalIgnoreCase) &&
        (string.Equals(NativeInputType, "text", StringComparison.OrdinalIgnoreCase) ||
         string.Equals(NativeInputType, "search", StringComparison.OrdinalIgnoreCase) ||
         string.IsNullOrWhiteSpace(NativeInputType)) &&
        !string.Equals(Readonly, "true", StringComparison.OrdinalIgnoreCase) &&
        !string.Equals(Disabled, "true", StringComparison.OrdinalIgnoreCase);

    public string FillPreview
    {
        get
        {
            if (HasMatchedOptions)
            {
                var optionText = MatchedOptions.Count == 1
                    ? $"option: {MatchedOptions[0].DisplayText}"
                    : $"options: {MatchedOptions.Count}";
                return UserApproved ? $"Approved {optionText}" : $"Approve {optionText}";
            }

            if (HasFillValue)
            {
                if (!string.IsNullOrWhiteSpace(ReviewReason) &&
                    DecisionStatus != FieldDecisionStatus.ReadyToFill)
                {
                    return DecisionStatus == FieldDecisionStatus.NeedsApiDecision
                        ? OptionCount > 0
                            ? $"Needs API decision - {OptionCount} options"
                            : "Needs API decision"
                        : "Blocked";
                }

                return UserApproved ? $"Approved: {ValueToFill}" : $"Approve: {ValueToFill}";
            }

            if (DecisionStatus == FieldDecisionStatus.Blocked)
            {
                return "Blocked";
            }

            if (DecisionStatus == FieldDecisionStatus.NeedsApiDecision)
            {
                return OptionCount > 0
                    ? $"Needs API decision - {OptionCount} options"
                    : "Needs API decision";
            }

            if (OptionCount > 0)
            {
                return $"Options captured: {OptionCount}";
            }

            if (RequiresCapturedOption)
            {
                return "Options not captured";
            }

            return "No matched value";
        }
    }

    public void SetExplicitSelection(DetectedFieldOptionViewModel option)
    {
        MatchedOptions.Clear();
        MatchedOptions.Add(option);
        ValueToFill = option.FillValue;
        ReviewReason = null;
        DecisionStatus = FieldDecisionStatus.ReadyToFill;
        DecisionReason = FieldDecisionReason.None;
        UserApproved = true;
        NotifyStateChanged();
    }

    public void Approve()
    {
        if (DecisionStatus == FieldDecisionStatus.ReadyToFill)
        {
            UserApproved = true;
            NotifyStateChanged();
        }
    }

    public void ApproveSelectedOptions()
    {
        if (MatchedOptions.Count == 0)
        {
            return;
        }

        ReviewReason = null;
        DecisionStatus = FieldDecisionStatus.ReadyToFill;
        DecisionReason = FieldDecisionReason.None;
        UserApproved = true;
        NotifyStateChanged();
    }

    public void ApplyApprovalItem(ApprovalItem item)
    {
        MatchedProfileAttribute = item.MatchedProfileAttribute;
        Confidence = item.Confidence;
        ValueToFill = item.ProposedValue ?? SelectedOptionsText(item.SelectedOptions);
        ReviewReason = item.Message;
        UserApproved = item.Status == ApprovalItemStatus.Approved;
        MatchedOptions.Clear();

        foreach (var selectedOption in item.SelectedOptions)
        {
            var option = Options.FirstOrDefault(candidate =>
                NormalizeOptionText(candidate.Value) == NormalizeOptionText(selectedOption.Value) ||
                NormalizeOptionText(candidate.Label) == NormalizeOptionText(selectedOption.Label));

            if (option is not null && !MatchedOptions.Contains(option))
            {
                MatchedOptions.Add(option);
            }
        }

        DecisionStatus = item.Status switch
        {
            ApprovalItemStatus.ReadyForApproval => FieldDecisionStatus.ReadyToFill,
            ApprovalItemStatus.Approved => FieldDecisionStatus.ReadyToFill,
            ApprovalItemStatus.Blocked => FieldDecisionStatus.Blocked,
            ApprovalItemStatus.Skipped => FieldDecisionStatus.Blocked,
            _ => FieldDecisionStatus.NeedsApiDecision
        };

        DecisionReason = item.Reason switch
        {
            ApprovalDecisionReason.None => FieldDecisionReason.None,
            ApprovalDecisionReason.LocalHighConfidenceMatch => FieldDecisionReason.None,
            ApprovalDecisionReason.ApiDecision => FieldDecisionReason.None,
            ApprovalDecisionReason.MissingOptions => FieldDecisionReason.MissingOptions,
            ApprovalDecisionReason.OptionMismatch => FieldDecisionReason.OptionMismatch,
            ApprovalDecisionReason.AmbiguousSelectionMode => FieldDecisionReason.AmbiguousSelectionMode,
            ApprovalDecisionReason.ManualOnlyControl => FieldDecisionReason.ManualOnlyControl,
            ApprovalDecisionReason.UnsupportedControl => FieldDecisionReason.UnsupportedControl,
            _ => FieldDecisionReason.MissingProfileValue
        };
        NotifyStateChanged();
    }

    private static string? SelectedOptionsText(IReadOnlyList<SelectedFieldOption> selectedOptions)
    {
        if (selectedOptions.Count == 0)
        {
            return null;
        }

        return string.Join(", ", selectedOptions.Select(option =>
            !string.IsNullOrWhiteSpace(option.Label) ? option.Label : option.Value));
    }

    public void NotifyStateChanged()
    {
        OnPropertyChanged(nameof(Options));
        OnPropertyChanged(nameof(OptionsTruncated));
        OnPropertyChanged(nameof(OptionsScanReason));
        OnPropertyChanged(nameof(ValueToFill));
        OnPropertyChanged(nameof(ReviewReason));
        OnPropertyChanged(nameof(MatchedProfileAttribute));
        OnPropertyChanged(nameof(Confidence));
        OnPropertyChanged(nameof(UserApproved));
        OnPropertyChanged(nameof(DecisionStatus));
        OnPropertyChanged(nameof(DecisionReason));
        OnPropertyChanged(nameof(HasFillValue));
        OnPropertyChanged(nameof(HasOptions));
        OnPropertyChanged(nameof(HasMatchedOptions));
        OnPropertyChanged(nameof(CanAutoFill));
        OnPropertyChanged(nameof(CanApprove));
        OnPropertyChanged(nameof(NeedsApiDecision));
        OnPropertyChanged(nameof(IsBlocked));
        OnPropertyChanged(nameof(OptionCount));
        OnPropertyChanged(nameof(OptionsPreview));
        OnPropertyChanged(nameof(ShouldShowOptionsSummary));
        OnPropertyChanged(nameof(OptionsSummary));
        OnPropertyChanged(nameof(ApprovalActionText));
        OnPropertyChanged(nameof(FillPreview));
    }

    private void OnPropertyChanged([CallerMemberName] string? propertyName = null)
    {
        if (!string.IsNullOrWhiteSpace(propertyName))
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }
    }

    public DetectedFieldOptionViewModel? FindMatchingOption(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var normalizedValue = NormalizeOptionText(value);
        return Options.FirstOrDefault(option =>
            NormalizeOptionText(option.Value) == normalizedValue ||
            NormalizeOptionText(option.Label) == normalizedValue);
    }

    public object ToDebugObject()
    {
        return new
        {
            Label,
            Selector,
            ControlType,
            ControlFamily,
            SelectionMode,
            SelectionModeReason,
            FieldCategory,
            FieldSubCategory,
            FieldCategoryReason,
            NativeInputType,
            TagName,
            Role,
            AriaHasPopup,
            AriaExpanded,
            AriaControls,
            AriaOwns,
            AriaActiveDescendant,
            AriaAutocomplete,
            AriaMultiselectable,
            Autocomplete,
            List,
            Required,
            Optional,
            Disabled,
            Readonly,
            Multiple,
            ScanReason,
            RequiresCapturedOption,
            ValuePolicy,
            FillStrategy,
            OptionSourceGroup,
            ExtractionActionGroup,
            OptionsScanReason,
            OptionsTruncated,
            OptionsCount = Options.Count,
            OptionsSample = Options.Take(25).Select(option => option.ToDebugObject()).ToList(),
            OptionsOmittedFromSample = Math.Max(0, Options.Count - 25),
            Options = Options.Select(option => option.ToDebugObject()).ToList(),
            ValueToFill,
            MatchedOptionsCount = MatchedOptions.Count,
            MatchedOptions = MatchedOptions.Select(option => option.ToDebugObject()).ToList(),
            DecisionStatus = DecisionStatus.ToString(),
            DecisionReason = DecisionReason.ToString(),
            ReviewReason,
            MatchedProfileAttribute,
            Confidence,
            UserApproved,
            CanAutoFill
        };
    }

    public bool IsMultipleSelection => string.Equals(SelectionMode, "multiple", StringComparison.OrdinalIgnoreCase);
    private static string NormalizeOptionText(string? value)
    {
        return Regex
            .Replace(value ?? string.Empty, "\\s+", " ")
            .Trim()
            .ToLowerInvariant();
    }
}
