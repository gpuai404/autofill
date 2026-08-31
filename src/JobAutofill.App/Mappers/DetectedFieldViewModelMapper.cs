using JobAutofill.App.ViewModels;
using JobAutofill.Core.Matching;
using JobAutofill.Domain.Models;

namespace JobAutofill.App.Mappers;

public sealed class DetectedFieldViewModelMapper : IDetectedFieldViewModelMapper
{
    public DetectedFieldViewModel ToViewModel(DetectedField field)
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
            Options = field.Options.Select(ToViewModel).ToList(),
            OptionsTruncated = field.OptionsTruncated,
            OptionsScanReason = field.OptionsScanReason,
            SourceUrl = field.SourceUrl
        };
    }

    public DetectedField ToDomainModel(DetectedFieldViewModel field)
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
            Options = field.Options.Select(ToDomainModel).ToList(),
            OptionsTruncated = field.OptionsTruncated,
            OptionsScanReason = field.OptionsScanReason,
            SourceUrl = field.SourceUrl
        };
    }

    public ApprovalItem ToApprovedApprovalItem(DetectedFieldViewModel field)
    {
        var domainField = ToDomainModel(field);

        return new ApprovalItem
        {
            FieldId = FieldIdentity.GetFieldId(domainField),
            Field = domainField,
            MatchedProfileAttribute = field.MatchedProfileAttribute,
            ProposedValue = field.ValueToFill,
            SelectedOptions = field.MatchedOptions.Select(ToSelectedOption).ToList(),
            Confidence = field.Confidence,
            Status = ApprovalItemStatus.Approved,
            Reason = ApprovalDecisionReason.None,
            Message = field.ReviewReason ?? string.Empty
        };
    }

    private static DetectedFieldOptionViewModel ToViewModel(DetectedFieldOption option)
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

    private static DetectedFieldOption ToDomainModel(DetectedFieldOptionViewModel option)
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

    private static SelectedFieldOption ToSelectedOption(DetectedFieldOptionViewModel option)
    {
        return new SelectedFieldOption
        {
            Value = option.Value,
            Label = option.Label,
            Selector = option.Selector
        };
    }
}
