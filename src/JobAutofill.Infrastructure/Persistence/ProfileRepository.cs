using JobAutofill.Domain.Models;

namespace JobAutofill.Infrastructure.Persistence;

public class ProfileRepository
{
    private readonly Dictionary<Guid, Profile> _store = new();

    public Task SaveAsync(Profile profile, CancellationToken cancellationToken = default)
    {
        _store[profile.Id] = profile;
        return Task.CompletedTask;
    }

    public Task<Profile?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        return Task.FromResult(_store.TryGetValue(id, out var profile) ? profile : null);
    }
}
