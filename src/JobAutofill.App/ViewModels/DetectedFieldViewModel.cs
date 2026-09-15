using JobAutofill.Domain.Models;
using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace JobAutofill.App.ViewModels;

public sealed class DetectedFieldViewModel : INotifyPropertyChanged
{
    private ApplicationFieldState _state;

    public DetectedFieldViewModel(ApplicationFieldState state)
    {
        _state = state;
        Options = state.Field.Options.Select(option => new DetectedFieldOptionViewModel
        {
            Value = option.Value,
            Label = option.Label,
            Selector = option.Selector,
            Source = option.Source,
            FillMethod = option.FillMethod,
            Selected = option.Selected,
            Position = option.Position
        }).ToList();
        MatchedOptions.AddRange(Options.Where(option => state.Proposal?.SelectedOptions.Any(selected =>
            string.Equals(selected.Value, option.Value, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(selected.Label, option.Label, StringComparison.OrdinalIgnoreCase)) == true));
    }

    public event PropertyChangedEventHandler? PropertyChanged;
    public ApplicationFieldState State => _state;
    public string Selector => _state.Field.Locator;
    public string Label => string.IsNullOrWhiteSpace(_state.Field.Label) ? "Unidentified field" : _state.Field.Label;
    public IReadOnlyList<DetectedFieldOptionViewModel> Options { get; }
    public List<DetectedFieldOptionViewModel> MatchedOptions { get; } = [];
    public bool HasOptions => Options.Count > 0;
    public bool HasMatchedOptions => MatchedOptions.Count > 0;
    public bool IsMultipleSelection => _state.Field.ControlKind == ApplicationControlKind.MultipleChoice;
    public bool CanAutoFill => _state.IsReadyToFill;
    public bool CanApprove => _state.Resolution == FieldResolutionState.NeedsReview;
    public bool NeedsAttention => _state.Resolution is FieldResolutionState.NeedsInput or FieldResolutionState.NeedsReview;
    public bool IsManual => _state.Field.FillCapability is FieldFillCapability.Manual or FieldFillCapability.Unsupported;
    public bool IsCompleted => _state.Execution == FieldExecutionState.Filled;
    public string? ValueToFill => _state.Proposal?.Value;
    public string ReviewReason => _state.Message;
    public string ApprovalActionText => "Confirm";
    public string DisplayTypeText => _state.Field.ControlKind switch
    {
        ApplicationControlKind.SingleChoice => "choice",
        ApplicationControlKind.MultipleChoice => "multiple choice",
        ApplicationControlKind.Boolean => "yes/no",
        ApplicationControlKind.File => "file",
        _ => _state.Field.ControlKind.ToString().ToLowerInvariant()
    };
    public string OptionsSummary => HasOptions ? $"{Options.Count} choices" : string.Empty;
    public bool ShouldShowOptionsSummary => HasOptions;
    public string FillPreview => _state.Execution switch
    {
        FieldExecutionState.Filling => "Filling…",
        FieldExecutionState.Filled => "Filled",
        FieldExecutionState.Failed => _state.Message,
        FieldExecutionState.Stale => "Page changed — rescan required",
        _ when IsManual => ValueToFill is null ? _state.Message : $"Manual: {ValueToFill}",
        _ when _state.Resolution == FieldResolutionState.NeedsInput => _state.Message,
        _ when _state.Resolution == FieldResolutionState.NeedsReview => $"Review: {ValueToFill}",
        _ => ValueToFill is null ? _state.Message : $"Ready: {ValueToFill}"
    };

    public void Confirm()
    {
        if (_state.Proposal is null) return;
        _state = _state with { Resolution = FieldResolutionState.Resolved, Message = IsManual ? "Complete this field manually." : "Ready to fill." };
        NotifyStateChanged();
    }

    public void SelectOption(DetectedFieldOptionViewModel option)
    {
        if (IsMultipleSelection)
        {
            if (!MatchedOptions.Remove(option)) MatchedOptions.Add(option);
        }
        else
        {
            MatchedOptions.Clear();
            MatchedOptions.Add(option);
        }

        var proposal = new FieldProposal
        {
            FieldId = _state.Field.FieldId,
            ProfileAttribute = "UserSelection",
            Value = string.Join(", ", MatchedOptions.Select(selected => selected.FillValue)),
            Score = 1,
            Source = FieldProposalSource.User,
            Evidence = "Selected by user.",
            SelectedOptions = MatchedOptions.Select(selected => new SelectedFieldOption
            {
                Value = selected.Value,
                Label = selected.Label,
                Selector = selected.Selector
            }).ToList()
        };
        _state = _state with
        {
            Proposal = proposal,
            Resolution = IsMultipleSelection ? FieldResolutionState.NeedsReview : FieldResolutionState.Resolved,
            Message = IsMultipleSelection ? "Confirm the selected choices." : "Ready to fill."
        };
        NotifyStateChanged();
    }

    public void MarkFilling()
    {
        _state = _state with { Execution = FieldExecutionState.Filling, Message = "Filling…" };
        NotifyStateChanged();
    }

    public void ApplyFillResult(FieldFillResult result)
    {
        _state = _state with { Execution = result.Outcome, Message = result.Message };
        NotifyStateChanged();
    }

    public object ToDebugObject() => new
    {
        _state.Field.FieldId,
        _state.Field.ScanId,
        Label,
        Selector,
        _state.Field.ControlKind,
        _state.Field.Requirement,
        _state.Field.FillCapability,
        _state.Field.Sensitivity,
        _state.Resolution,
        _state.Execution,
        Proposal = _state.Proposal,
        _state.Message,
        OptionsCount = Options.Count
    };

    private void NotifyStateChanged()
    {
        OnPropertyChanged(nameof(State));
        OnPropertyChanged(nameof(MatchedOptions));
        OnPropertyChanged(nameof(HasMatchedOptions));
        OnPropertyChanged(nameof(CanAutoFill));
        OnPropertyChanged(nameof(CanApprove));
        OnPropertyChanged(nameof(NeedsAttention));
        OnPropertyChanged(nameof(IsManual));
        OnPropertyChanged(nameof(IsCompleted));
        OnPropertyChanged(nameof(ValueToFill));
        OnPropertyChanged(nameof(ReviewReason));
        OnPropertyChanged(nameof(FillPreview));
    }

    private void OnPropertyChanged([CallerMemberName] string? name = null) =>
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
