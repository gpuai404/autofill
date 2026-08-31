using JobAutofill.Domain.Models;

namespace JobAutofill.Core.Contracts;

public interface IProfileRepository
{
    Task SaveAsync(Profile profile, CancellationToken cancellationToken = default);
    Task<Profile?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
}
