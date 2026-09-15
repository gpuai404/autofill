using System.Text.Json;
using JobAutofill.Core.Contracts;
using JobAutofill.Domain.Models;
using SQLite;

namespace JobAutofill.Infrastructure.Persistence;

public sealed class ProfileRepository : IProfileRepository
{
    private const string CurrentProfileKey = "current";
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web);

    private readonly SQLiteAsyncConnection _database;
    private readonly SemaphoreSlim _initializeLock = new(1, 1);
    private bool _initialized;

    public ProfileRepository()
        : this(Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "jobautofill.db3"))
    {
    }

    public ProfileRepository(string databasePath)
    {
        SQLitePCL.Batteries_V2.Init();

        var directory = Path.GetDirectoryName(databasePath);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        _database = new SQLiteAsyncConnection(databasePath);
    }

    public async Task<Profile> GetCurrentAsync(CancellationToken cancellationToken = default)
    {
        await InitializeAsync(cancellationToken);

        var current = await _database.FindAsync<ProfileStateEntity>(CurrentProfileKey);
        if (current is null)
        {
            var seededProfile = DummyProfileSeed.Create();
            await SaveAsync(seededProfile, cancellationToken);
            return seededProfile;
        }

        if (Guid.TryParse(current.ProfileId, out var currentProfileId))
        {
            var profile = await GetByIdAsync(currentProfileId, cancellationToken);
            if (profile is not null)
            {
                return profile;
            }
        }

        var replacementProfile = DummyProfileSeed.Create();
        await SaveAsync(replacementProfile, cancellationToken);
        return replacementProfile;
    }

    public async Task SaveAsync(Profile profile, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(profile);
        cancellationToken.ThrowIfCancellationRequested();

        await InitializeAsync(cancellationToken);

        profile.UpdatedAtUtc = DateTimeOffset.UtcNow;
        await _database.RunInTransactionAsync(connection =>
        {
            connection.InsertOrReplace(ProfileEntity.FromDomain(profile));
            connection.InsertOrReplace(new ProfileStateEntity
            {
                Key = CurrentProfileKey,
                ProfileId = profile.Id.ToString("D")
            });
        });
    }

    public async Task<Profile?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        await InitializeAsync(cancellationToken);

        var entity = await _database.FindAsync<ProfileEntity>(id.ToString("D"));
        return entity?.ToDomain();
    }

    private async Task InitializeAsync(CancellationToken cancellationToken)
    {
        if (_initialized)
        {
            return;
        }

        await _initializeLock.WaitAsync(cancellationToken);
        try
        {
            if (_initialized)
            {
                return;
            }

            await _database.CreateTableAsync<ProfileEntity>();
            await _database.CreateTableAsync<ProfileStateEntity>();
            _initialized = true;
        }
        finally
        {
            _initializeLock.Release();
        }
    }

    private sealed class ProfileEntity
    {
        [PrimaryKey]
        public string Id { get; set; } = string.Empty;

        public string? FullName { get; set; }
        public string? Email { get; set; }
        public string? Phone { get; set; }
        public string? AddressLine1 { get; set; }
        public string? City { get; set; }
        public string? StateOrProvince { get; set; }
        public string? PostalCode { get; set; }
        public string? Country { get; set; }
        public string? WorkAuthorizationStatus { get; set; }
        public bool RequiresSponsorship { get; set; }
        public string? LinkedInUrl { get; set; }
        public string? PortfolioUrl { get; set; }
        public string? GitHubUrl { get; set; }
        public string? CurrentCompany { get; set; }
        public string? CurrentTitle { get; set; }
        public string? YearsExperience { get; set; }
        public string? HighestEducation { get; set; }
        public string? Skills { get; set; }
        public string? ResumeFileName { get; set; }
        public string? ResumeSummary { get; set; }
        public string? SalaryExpectation { get; set; }
        public string? NoticePeriod { get; set; }
        public bool WillingToRelocate { get; set; }
        public string? PreferredWorkType { get; set; }
        public string? Gender { get; set; }
        public string? RaceEthnicity { get; set; }
        public string? HispanicLatino { get; set; }
        public string? VeteranStatus { get; set; }
        public string? DisabilityStatus { get; set; }
        public string CustomAnswersJson { get; set; } = "{}";
        public long UpdatedAtUnixTimeMilliseconds { get; set; }

        public static ProfileEntity FromDomain(Profile profile)
        {
            return new ProfileEntity
            {
                Id = profile.Id.ToString("D"),
                FullName = profile.FullName,
                Email = profile.Email,
                Phone = profile.Phone,
                AddressLine1 = profile.AddressLine1,
                City = profile.City,
                StateOrProvince = profile.StateOrProvince,
                PostalCode = profile.PostalCode,
                Country = profile.Country,
                WorkAuthorizationStatus = profile.WorkAuthorizationStatus,
                RequiresSponsorship = profile.RequiresSponsorship,
                LinkedInUrl = profile.LinkedInUrl,
                PortfolioUrl = profile.PortfolioUrl,
                GitHubUrl = profile.GitHubUrl,
                CurrentCompany = profile.CurrentCompany,
                CurrentTitle = profile.CurrentTitle,
                YearsExperience = profile.YearsExperience,
                HighestEducation = profile.HighestEducation,
                Skills = profile.Skills,
                ResumeFileName = profile.ResumeFileName,
                ResumeSummary = profile.ResumeSummary,
                SalaryExpectation = profile.SalaryExpectation,
                NoticePeriod = profile.NoticePeriod,
                WillingToRelocate = profile.WillingToRelocate,
                PreferredWorkType = profile.PreferredWorkType,
                Gender = profile.Gender,
                RaceEthnicity = profile.RaceEthnicity,
                HispanicLatino = profile.HispanicLatino,
                VeteranStatus = profile.VeteranStatus,
                DisabilityStatus = profile.DisabilityStatus,
                CustomAnswersJson = JsonSerializer.Serialize(profile.CustomAnswers, SerializerOptions),
                UpdatedAtUnixTimeMilliseconds = profile.UpdatedAtUtc.ToUnixTimeMilliseconds()
            };
        }

        public Profile ToDomain()
        {
            var customAnswers = JsonSerializer.Deserialize<Dictionary<string, string>>(
                CustomAnswersJson,
                SerializerOptions);

            return new Profile
            {
                Id = Guid.Parse(Id),
                FullName = FullName,
                Email = Email,
                Phone = Phone,
                AddressLine1 = AddressLine1,
                City = City,
                StateOrProvince = StateOrProvince,
                PostalCode = PostalCode,
                Country = Country,
                WorkAuthorizationStatus = WorkAuthorizationStatus,
                RequiresSponsorship = RequiresSponsorship,
                LinkedInUrl = LinkedInUrl,
                PortfolioUrl = PortfolioUrl,
                GitHubUrl = GitHubUrl,
                CurrentCompany = CurrentCompany,
                CurrentTitle = CurrentTitle,
                YearsExperience = YearsExperience,
                HighestEducation = HighestEducation,
                Skills = Skills,
                ResumeFileName = ResumeFileName,
                ResumeSummary = ResumeSummary,
                SalaryExpectation = SalaryExpectation,
                NoticePeriod = NoticePeriod,
                WillingToRelocate = WillingToRelocate,
                PreferredWorkType = PreferredWorkType,
                Gender = Gender,
                RaceEthnicity = RaceEthnicity,
                HispanicLatino = HispanicLatino,
                VeteranStatus = VeteranStatus,
                DisabilityStatus = DisabilityStatus,
                CustomAnswers = customAnswers ?? new Dictionary<string, string>(),
                UpdatedAtUtc = DateTimeOffset.FromUnixTimeMilliseconds(UpdatedAtUnixTimeMilliseconds)
            };
        }
    }

    private sealed class ProfileStateEntity
    {
        [PrimaryKey]
        public string Key { get; set; } = string.Empty;

        public string ProfileId { get; set; } = string.Empty;
    }
}
