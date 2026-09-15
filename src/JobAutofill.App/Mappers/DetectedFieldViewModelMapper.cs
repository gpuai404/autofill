using JobAutofill.App.ViewModels;
using JobAutofill.Domain.Models;

namespace JobAutofill.App.Mappers;

public sealed class DetectedFieldViewModelMapper : IDetectedFieldViewModelMapper
{
    public DetectedFieldViewModel ToViewModel(ApplicationFieldState field) => new(field);
    public DetectedField ToDomainModel(DetectedFieldViewModel field) => field.State.Field.Source;

    public FillCommand ToFillCommand(DetectedFieldViewModel field)
    {
        var proposal = field.State.Proposal ?? throw new InvalidOperationException("Cannot fill a field without a proposal.");
        return new FillCommand
        {
            FieldId = field.State.Field.FieldId,
            Selector = field.State.Field.Locator,
            Value = proposal.Value,
            SelectedOptions = proposal.SelectedOptions,
            FillStrategy = field.State.Field.Source.FillStrategy
        };
    }
}
