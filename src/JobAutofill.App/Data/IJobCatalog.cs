using JobAutofill.Domain.Models;

namespace JobAutofill.App.Data;

public interface IJobCatalog
{
    IReadOnlyList<JobPost> All { get; }
}
