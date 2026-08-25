using JobAutofill.Core.Capabilities;
using JobAutofill.Core.Contracts;
using JobAutofill.Core.Matching;
using JobAutofill.Domain.Models;
using System.Text.RegularExpressions;

namespace JobAutofill.Core.Workflow;

public sealed class FieldApprovalWorkflow
{
    private readonly LocalProfileFieldMatcher _localMatcher;
    private readonly IApiFieldDecisionClient _apiDecisionClient;

    public FieldApprovalWorkflow(
        LocalProfileFieldMatcher localMatcher,
        IApiFieldDecisionClient apiDecisionClient)
    {
        _localMatcher = localMatcher;
        _apiDecisionClient = apiDecisionClient;
    }

    public async Task<IReadOnlyList<ApprovalItem>> PrepareApprovalItemsAsync(
        string pageUrl,
        IReadOnlyList<DetectedField> fields,
        Profile profile,
        ScannerCapabilityReport? capabilityReport = null,
        CancellationToken cancellationToken = default)
    {
        var localItems = new List<ApprovalItem>();
        var apiCandidates = new List<DetectedField>();

        foreach (var field in fields)
        {
            var localMatch = _localMatcher.Match(field, profile);
            var localItem = BuildLocalApprovalItem(field, localMatch);
            if (localItem.Status == ApprovalItemStatus.NeedsApiDecision)
            {
                apiCandidates.Add(field);
            }

            localItems.Add(localItem);
        }

        if (apiCandidates.Count == 0)
        {
            return localItems;
        }

        var apiResults = await _apiDecisionClient.DecideAsync(
            new ApiFieldDecisionRequest
            {
                PageUrl = pageUrl,
                PageHost = Uri.TryCreate(pageUrl, UriKind.Absolute, out var pageUri) ? pageUri.Host : null,
                CapabilityReport = capabilityReport,
                Fields = apiCandidates,
                Profile = profile
            },
            cancellationToken);

        var apiResultMap = apiResults.ToDictionary(result => result.FieldId, StringComparer.Ordinal);
        return localItems
            .Select(item => item.Status == ApprovalItemStatus.NeedsApiDecision &&
                            apiResultMap.TryGetValue(item.FieldId, out var apiResult)
                ? BuildApiApprovalItem(item.Field, apiResult)
                : item)
            .ToList();
    }

    private static ApprovalItem BuildLocalApprovalItem(DetectedField field, LocalFieldMatch match)
    {
        var blockedReason = GetBlockedReason(field);
        if (blockedReason is not null)
        {
            return CreateItem(
                field,
                match,
                ApprovalItemStatus.Blocked,
                blockedReason.Value.reason,
                blockedReason.Value.message);
        }

        if (HasAmbiguousSelectionMode(field))
        {
            return CreateItem(
                field,
                match,
                ApprovalItemStatus.NeedsApiDecision,
                ApprovalDecisionReason.AmbiguousSelectionMode,
                field.SelectionModeReason ?? "selection mode is ambiguous");
        }

        if (!match.IsResolved)
        {
            return CreateItem(
                field,
                match,
                ApprovalItemStatus.NeedsApiDecision,
                ApprovalDecisionReason.MissingProfileValue,
                match.Reason);
        }

        if (!field.RequiresCapturedOption)
        {
            return CreateItem(
                field,
                match,
                ApprovalItemStatus.ReadyForApproval,
                ApprovalDecisionReason.LocalHighConfidenceMatch,
                match.Reason);
        }

        if (field.Options.Count == 0)
        {
            if (AllowsEditableComboboxTextFallback(field))
            {
                return CreateItem(
                    field,
                    match,
                    ApprovalItemStatus.ReadyForApproval,
                    ApprovalDecisionReason.LocalHighConfidenceMatch,
                    $"{match.Reason}; editable combobox will be filled by typing because no options were captured");
            }

            return CreateItem(
                field,
                match,
                ApprovalItemStatus.NeedsApiDecision,
                ApprovalDecisionReason.MissingOptions,
                $"options not captured for {match.ProposedValue}");
        }

        var selectedOptions = FindMatchingOptions(field, match.ProposedValue).ToList();
        if (selectedOptions.Count > 0)
        {
            return CreateItem(
                field,
                match,
                ApprovalItemStatus.ReadyForApproval,
                ApprovalDecisionReason.LocalHighConfidenceMatch,
                match.Reason,
                selectedOptions);
        }

        if (AllowsEditableComboboxTextFallback(field))
        {
            return CreateItem(
                field,
                match,
                ApprovalItemStatus.ReadyForApproval,
                ApprovalDecisionReason.LocalHighConfidenceMatch,
                $"{match.Reason}; editable combobox will be filled by typing because no captured option matched");
        }

        return CreateItem(
            field,
            match,
            ApprovalItemStatus.NeedsApiDecision,
            ApprovalDecisionReason.OptionMismatch,
            $"No exact extracted option matches {match.ProposedValue}");
    }

    private static ApprovalItem BuildApiApprovalItem(DetectedField field, ApiFieldDecisionResult result)
    {
        var selectedOptions = result.SelectedOptions;
        if (result.Decision is FieldDecisionKind.SelectOption or FieldDecisionKind.SelectOptions)
        {
            selectedOptions = KeepCapturedOptionsOnly(field, result.SelectedOptions).ToList();
            if (selectedOptions.Count == 0 && !AllowsEditableComboboxTextFallback(field))
            {
                return new ApprovalItem
                {
                    FieldId = result.FieldId,
                    Field = field,
                    MatchedProfileAttribute = result.MatchedProfileAttribute,
                    ProposedValue = result.ProposedValue,
                    Confidence = result.Confidence,
                    Status = ApprovalItemStatus.NeedsUserInput,
                    Reason = ApprovalDecisionReason.OptionMismatch,
                    Message = "API returned an option that was not captured from the page."
                };
            }
        }

        var status = result.Decision switch
        {
            FieldDecisionKind.FillValue when !string.IsNullOrWhiteSpace(result.ProposedValue) => ApprovalItemStatus.ReadyForApproval,
            FieldDecisionKind.ProposeText when !string.IsNullOrWhiteSpace(result.ProposedValue) => ApprovalItemStatus.ReadyForApproval,
            FieldDecisionKind.SelectOption when AllowsEditableComboboxTextFallback(field) && !string.IsNullOrWhiteSpace(result.ProposedValue) => ApprovalItemStatus.ReadyForApproval,
            FieldDecisionKind.SelectOptions when AllowsEditableComboboxTextFallback(field) && !string.IsNullOrWhiteSpace(result.ProposedValue) => ApprovalItemStatus.ReadyForApproval,
            FieldDecisionKind.SelectOption when selectedOptions.Count > 0 => ApprovalItemStatus.ReadyForApproval,
            FieldDecisionKind.SelectOptions when selectedOptions.Count > 0 => ApprovalItemStatus.ReadyForApproval,
            FieldDecisionKind.NeedsUserInput => ApprovalItemStatus.NeedsUserInput,
            FieldDecisionKind.Skip => ApprovalItemStatus.Skipped,
            FieldDecisionKind.Block => ApprovalItemStatus.Blocked,
            _ => ApprovalItemStatus.NeedsUserInput
        };

        return new ApprovalItem
        {
            FieldId = result.FieldId,
            Field = field,
            MatchedProfileAttribute = result.MatchedProfileAttribute,
            ProposedValue = result.ProposedValue,
            SelectedOptions = selectedOptions,
            Confidence = result.Confidence,
            Status = status,
            Reason = status == ApprovalItemStatus.Blocked
                ? ApprovalDecisionReason.ApiCannotDecide
                : ApprovalDecisionReason.ApiDecision,
            Message = string.IsNullOrWhiteSpace(result.Reason) ? "API decision returned." : result.Reason
        };
    }

    private static IEnumerable<SelectedFieldOption> KeepCapturedOptionsOnly(
        DetectedField field,
        IReadOnlyList<SelectedFieldOption> selectedOptions)
    {
        foreach (var selectedOption in selectedOptions)
        {
            var normalizedValue = NormalizeOptionText(selectedOption.Value);
            var normalizedLabel = NormalizeOptionText(selectedOption.Label);
            var captured = field.Options.FirstOrDefault(option =>
                !string.IsNullOrWhiteSpace(normalizedValue) && NormalizeOptionText(option.Value) == normalizedValue ||
                !string.IsNullOrWhiteSpace(normalizedLabel) && NormalizeOptionText(option.Label) == normalizedLabel);

            if (captured is null)
            {
                continue;
            }

            yield return new SelectedFieldOption
            {
                Value = captured.Value,
                Label = captured.Label,
                Selector = captured.Selector
            };
        }
    }

    private static ApprovalItem CreateItem(
        DetectedField field,
        LocalFieldMatch match,
        ApprovalItemStatus status,
        ApprovalDecisionReason reason,
        string message,
        IReadOnlyList<SelectedFieldOption>? selectedOptions = null)
    {
        return new ApprovalItem
        {
            FieldId = match.FieldId,
            Field = field,
            MatchedProfileAttribute = match.MatchedProfileAttribute,
            ProposedValue = match.ProposedValue,
            SelectedOptions = selectedOptions ?? [],
            Confidence = match.Confidence,
            Status = status,
            Reason = reason,
            Message = message
        };
    }

    private static (ApprovalDecisionReason reason, string message)? GetBlockedReason(DetectedField field)
    {
        if (string.Equals(field.FillStrategy, "unsupportedInPageJavaScript", StringComparison.OrdinalIgnoreCase))
        {
            return (ApprovalDecisionReason.UnsupportedControl, "field cannot be filled by the current in-page fill strategy");
        }

        if (string.Equals(field.ValuePolicy, "manualReview", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(field.FillStrategy, "skip", StringComparison.OrdinalIgnoreCase))
        {
            return (ApprovalDecisionReason.ManualOnlyControl, "field requires manual handling");
        }

        return null;
    }

    private static bool HasAmbiguousSelectionMode(DetectedField field)
    {
        return string.Equals(field.SelectionMode, "unknown", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(field.ControlType, "checkboxGroup", StringComparison.OrdinalIgnoreCase) &&
            (string.IsNullOrWhiteSpace(field.SelectionMode) ||
             field.SelectionModeReason?.Contains("does not clearly", StringComparison.OrdinalIgnoreCase) == true ||
             field.SelectionModeReason?.Contains("ambiguous", StringComparison.OrdinalIgnoreCase) == true);
    }

    private static bool AllowsEditableComboboxTextFallback(DetectedField field)
    {
        return string.Equals(field.ValuePolicy, "mustMatchCapturedOptionUnlessEditableFreeText", StringComparison.OrdinalIgnoreCase) &&
            string.Equals(field.FillStrategy, "openPopupThenSelectCapturedOption", StringComparison.OrdinalIgnoreCase) &&
            string.Equals(field.ControlType, "combobox", StringComparison.OrdinalIgnoreCase) &&
            (string.Equals(field.NativeInputType, "text", StringComparison.OrdinalIgnoreCase) ||
             string.Equals(field.NativeInputType, "search", StringComparison.OrdinalIgnoreCase) ||
             string.IsNullOrWhiteSpace(field.NativeInputType)) &&
            !string.Equals(field.Readonly, "true", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(field.Disabled, "true", StringComparison.OrdinalIgnoreCase);
    }

    private static IEnumerable<SelectedFieldOption> FindMatchingOptions(DetectedField field, string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            yield break;
        }

        var requestedValues = RequestedOptionValues(value).ToList();
        foreach (var requestedValue in requestedValues)
        {
            var normalizedValue = NormalizeOptionText(requestedValue);
            var option = field.Options.FirstOrDefault(candidate =>
                NormalizeOptionText(candidate.Value) == normalizedValue ||
                NormalizeOptionText(candidate.Label) == normalizedValue);

            if (option is null)
            {
                continue;
            }

            yield return new SelectedFieldOption
            {
                Value = option.Value,
                Label = option.Label,
                Selector = option.Selector
            };
        }
    }

    private static IEnumerable<string> RequestedOptionValues(string value)
    {
        yield return value;

        foreach (var part in Regex.Split(value, "[,;\\n]+"))
        {
            var trimmed = part.Trim();
            if (!string.IsNullOrWhiteSpace(trimmed) && !trimmed.Equals(value, StringComparison.OrdinalIgnoreCase))
            {
                yield return trimmed;
            }
        }
    }

    private static string NormalizeOptionText(string? value)
    {
        return Regex
            .Replace(value ?? string.Empty, "\\s+", " ")
            .Trim()
            .ToLowerInvariant();
    }
}
