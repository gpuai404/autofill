namespace JobAutofill.Domain.Models;

public class Profile
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string? FullName { get; set; }
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string? AddressLine1 { get; set; }
    public string? City { get; set; }
    public string? StateOrProvince { get; set; }
    public string? PostalCode { get; set; }
    public string? Country { get; set; }
    public string? WorkAuthorizationStatus { get; set; }
    public string? SponsorshipRequirement { get; set; }
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
    public string? RelocationPreference { get; set; }
    public string? PreferredWorkType { get; set; }
    public string? Gender { get; set; }
    public string? RaceEthnicity { get; set; }
    public string? HispanicLatino { get; set; }
    public string? VeteranStatus { get; set; }
    public string? DisabilityStatus { get; set; }
    public Dictionary<string, string> CustomAnswers { get; set; } = new();
    public DateTimeOffset UpdatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}
