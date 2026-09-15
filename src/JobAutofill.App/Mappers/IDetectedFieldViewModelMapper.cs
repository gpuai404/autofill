using JobAutofill.App.ViewModels;
using JobAutofill.Domain.Models;

namespace JobAutofill.App.Mappers;

public interface IDetectedFieldViewModelMapper
{
    DetectedFieldViewModel ToViewModel(ApplicationFieldState field);
    DetectedField ToDomainModel(DetectedFieldViewModel field);
    FillCommand ToFillCommand(DetectedFieldViewModel field);
}
