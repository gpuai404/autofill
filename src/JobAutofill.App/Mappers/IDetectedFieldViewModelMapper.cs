using JobAutofill.App.ViewModels;
using JobAutofill.Domain.Models;

namespace JobAutofill.App.Mappers;

public interface IDetectedFieldViewModelMapper
{
    DetectedFieldViewModel ToViewModel(DetectedField field);
    DetectedField ToDomainModel(DetectedFieldViewModel field);
    ApprovalItem ToApprovedApprovalItem(DetectedFieldViewModel field);
}
