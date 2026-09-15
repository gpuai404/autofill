using JobAutofill.Domain.Models;

namespace JobAutofill.Infrastructure.Persistence;

internal static class DummyProfileSeed
{
    private static readonly Guid DummyProfileId = Guid.Parse("8f854e4e-9677-438a-b22b-552254e0e4d6");

    public static Profile Create()
    {
        return new Profile
        {
            Id = DummyProfileId,
            FullName = "Alex Morgan",
            Email = "alex.morgan@example.com",
            Phone = "+1 415 555 0198",
            AddressLine1 = "221 Market Street",
            City = "San Francisco",
            StateOrProvince = "CA",
            PostalCode = "94105",
            Country = "United States",
            LinkedInUrl = "https://www.linkedin.com/in/alexmorgan-product-engineer",
            PortfolioUrl = "https://alexmorgan.dev",
            GitHubUrl = "https://github.com/alexmorgan",
            CurrentTitle = "Senior Full-Stack Engineer",
            CurrentCompany = "Northstar Analytics",
            YearsExperience = "7",
            HighestEducation = "B.S. Computer Science, University of Washington",
            ResumeFileName = "Alex_Morgan_Resume.pdf",
            Skills = "C#, .NET, MAUI, ASP.NET Core, TypeScript, React, Azure, PostgreSQL, REST APIs, accessibility, test automation",
            ResumeSummary = "Senior full-stack engineer with 7 years of experience building customer-facing workflow products, internal platforms, and mobile companion apps. Strong background in .NET, TypeScript, API design, data privacy, and practical automation for operations-heavy teams.",
            WorkAuthorizationStatus = "Authorized to work in the United States",
            RequiresSponsorship = false,
            WillingToRelocate = false,
            PreferredWorkType = "Remote or hybrid",
            SalaryExpectation = "$165,000",
            NoticePeriod = "2 weeks",
            Gender = "Prefer not to answer",
            RaceEthnicity = "Prefer not to answer",
            HispanicLatino = "No",
            VeteranStatus = "Not a protected veteran",
            DisabilityStatus = "Prefer not to answer",
            CustomAnswers =
            {
                ["CoverLetter"] = "I am excited by teams that simplify complex workflows and ship dependable tools for real users. My recent work has focused on form-heavy operational software, API integrations, and careful user review flows.",
                ["WhyInterested"] = "This role matches my experience building reliable product surfaces across web, mobile, and backend systems while staying close to user needs.",
                ["AdditionalInfo"] = "Available for interviews Monday through Thursday after 10 AM Pacific. References available on request."
            }
        };
    }
}
