using JobAutofill.Domain.Models;

namespace JobAutofill.Core.Matching;

public sealed class ProfileProposalMatcher
{
    private static readonly MatchRule[] Rules =
    [
        Rule("Email", p => p.Email, 0.99, "email", "e-mail"),
        Rule("Phone", p => p.Phone, 0.98, "phone", "mobile phone", "telephone"),
        Rule("FirstName", p => FirstName(p.FullName), 0.98, "first name", "firstname", "given name"),
        Rule("LastName", p => LastName(p.FullName), 0.98, "last name", "lastname", "surname", "family name"),
        Rule("FullName", p => p.FullName, 0.96, "full name", "legal name"),
        Rule("AddressLine1", p => p.AddressLine1, 0.94, "street address", "address line 1", "address line one"),
        Rule("City", p => p.City, 0.96, "city", "town"),
        Rule("StateOrProvince", p => p.StateOrProvince, 0.92, "state", "province", "region"),
        Rule("PostalCode", p => p.PostalCode, 0.98, "postal code", "zip code", "postcode"),
        Rule("Country", p => p.Country, 0.97, "country", "country of residence"),
        Rule("LinkedInUrl", p => p.LinkedInUrl, 0.99, "linkedin", "linkedin profile"),
        Rule("GitHubUrl", p => p.GitHubUrl, 0.99, "github", "github profile"),
        Rule("PortfolioUrl", p => p.PortfolioUrl, 0.91, "portfolio", "personal website", "personal site"),
        Rule("CurrentCompany", p => p.CurrentCompany, 0.91, "current company", "current employer"),
        Rule("CurrentTitle", p => p.CurrentTitle, 0.92, "current job title", "current title", "current role"),
        Rule("YearsExperience", p => p.YearsExperience, 0.90, "years of experience", "years experience"),
        Rule("HighestEducation", p => p.HighestEducation, 0.84, "highest education", "highest degree"),
        Rule("Skills", p => p.Skills, 0.82, "skills", "technical skills"),
        Rule("WorkAuthorizationStatus", p => p.WorkAuthorizationStatus, 0.88, "work authorization", "authorised to work", "authorized to work", "eligible to work"),
        Rule("RequiresSponsorship", p => p.RequiresSponsorship ? "Yes" : "No", 0.91, "require sponsorship", "need sponsorship", "visa sponsorship"),
        Rule("WillingToRelocate", p => p.WillingToRelocate ? "Yes" : "No", 0.91, "willing to relocate", "relocation"),
        Rule("SalaryExpectation", p => p.SalaryExpectation, 0.82, "salary expectation", "expected compensation", "desired salary"),
        Rule("NoticePeriod", p => p.NoticePeriod, 0.84, "notice period", "available to start", "start date"),
        Rule("PreferredWorkType", p => p.PreferredWorkType, 0.82, "preferred work type", "remote or hybrid", "work arrangement"),
        CustomRule("CoverLetter", "cover letter"),
        CustomRule("WhyInterested", "why are you interested", "why interested", "why do you want this role"),
        CustomRule("AdditionalInfo", "additional information", "anything else")
    ];

    private static readonly IReadOnlyDictionary<string, IReadOnlyDictionary<string, string[]>> LocalizedTerms =
        new Dictionary<string, IReadOnlyDictionary<string, string[]>>(StringComparer.OrdinalIgnoreCase)
        {
            ["ar"] = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
            {
                ["Email"] = ["البريد الإلكتروني", "الايميل"],
                ["Phone"] = ["رقم الهاتف", "هاتف"],
                ["FirstName"] = ["الاسم الأول"],
                ["LastName"] = ["اسم العائلة", "اللقب"],
                ["FullName"] = ["الاسم الكامل"],
                ["City"] = ["المدينة"],
                ["Country"] = ["البلد", "الدولة"]
            }
        };

    public FieldProposal? Match(ApplicationFieldDescriptor field, Profile profile, ScanContext context)
    {
        if (field.Sensitivity == FieldSensitivity.ConsentOrCertification)
        {
            return null;
        }

        var text = FieldTextNormalizer.Normalize(string.Join(' ',
            field.Label,
            field.Source.Autocomplete,
            field.Source.NativeInputType));
        var matches = Rules
            .Select(rule => Evaluate(rule, text, field, profile, context.Language))
            .Where(candidate => candidate is not null)
            .Cast<FieldProposal>()
            .OrderByDescending(candidate => candidate.Score)
            .ToList();
        return matches.Count == 0 || matches.Count > 1 && Math.Abs(matches[0].Score - matches[1].Score) < 0.03
            ? null
            : matches[0];
    }

    private static FieldProposal? Evaluate(
        MatchRule rule,
        string text,
        ApplicationFieldDescriptor field,
        Profile profile,
        string language)
    {
        var matchedTerm = rule.Terms.FirstOrDefault(term => PhraseMatch(text, term));
        if (matchedTerm is null && LocalizedTerms.TryGetValue(language, out var localized) &&
            localized.TryGetValue(rule.Attribute, out var translatedTerms))
        {
            matchedTerm = translatedTerms.FirstOrDefault(term => PhraseMatch(text, term));
        }
        if (matchedTerm is null || rule.NegativeTerms.Any(term => PhraseMatch(text, term))) return null;

        var value = rule.Value(profile);
        if (string.IsNullOrWhiteSpace(value)) return null;

        var selectedOptions = MatchCapturedOptions(field, value);
        if (field.ControlKind is ApplicationControlKind.SingleChoice or ApplicationControlKind.MultipleChoice &&
            selectedOptions.Count == 0)
        {
            return null;
        }

        return new FieldProposal
        {
            FieldId = field.FieldId,
            ProfileAttribute = rule.Attribute,
            Value = value,
            Score = rule.Score,
            Source = FieldProposalSource.UserProfile,
            Evidence = $"Matched phrase '{matchedTerm}'.",
            SelectedOptions = selectedOptions
        };
    }

    private static IReadOnlyList<SelectedFieldOption> MatchCapturedOptions(ApplicationFieldDescriptor field, string value)
    {
        var requested = value.Split([',', ';', '\n'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        return requested.SelectMany(item => field.Options
                .Where(option => FieldTextNormalizer.Normalize(option.Value) == FieldTextNormalizer.Normalize(item) ||
                                 FieldTextNormalizer.Normalize(option.Label) == FieldTextNormalizer.Normalize(item))
                .Take(1)
                .Select(option => new SelectedFieldOption { Value = option.Value, Label = option.Label, Selector = option.Selector }))
            .ToList();
    }

    private static bool PhraseMatch(string text, string term) =>
        text.Contains(FieldTextNormalizer.Normalize(term), StringComparison.Ordinal);

    private static MatchRule Rule(string attribute, Func<Profile, string?> value, double score, params string[] terms) =>
        new(attribute, value, score, terms, attribute is "FullName" ? ["company", "employer"] : []);

    private static MatchRule CustomRule(string key, params string[] terms) =>
        new($"CustomAnswers.{key}", p => p.CustomAnswers.TryGetValue(key, out var value) ? value : null, 0.84, terms, []);

    private static string? FirstName(string? fullName) =>
        fullName?.Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();

    private static string? LastName(string? fullName)
    {
        var parts = fullName?.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return parts is { Length: > 0 } ? parts[^1] : null;
    }

    private sealed record MatchRule(
        string Attribute,
        Func<Profile, string?> Value,
        double Score,
        IReadOnlyList<string> Terms,
        IReadOnlyList<string> NegativeTerms);
}
