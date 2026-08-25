using JobAutofill.Domain.Models;
using System.Text.RegularExpressions;

namespace JobAutofill.Core.Matching;

public sealed class LocalProfileFieldMatcher
{
    public LocalFieldMatch Match(DetectedField field, Profile profile)
    {
        var fieldId = FieldIdentity.GetFieldId(field);
        var label = FieldTextNormalizer.Normalize(field.Label);
        var selector = FieldTextNormalizer.Normalize(field.Selector);
        var text = string.IsNullOrWhiteSpace(label) ? selector : label;
        var combined = $"{label} {selector} {field.InputType}".ToLowerInvariant();

        return MatchValue(fieldId, combined, text, field, profile);
    }

    private static LocalFieldMatch MatchValue(
        string fieldId,
        string combined,
        string text,
        DetectedField field,
        Profile profile)
    {
        if (IsCheckboxBoolean(field))
        {
            return FromValue(fieldId, MatchBooleanField(combined, profile), "BooleanProfileValue", "local boolean field match");
        }

        if (ContainsAny(combined, "cover letter"))
        {
            return FromValue(fieldId, Custom(profile, "CoverLetter"), "CustomAnswers.CoverLetter", "local cover letter match");
        }

        if (ContainsAny(combined, "why are you interested", "why interested", "why do you want", "motivation"))
        {
            return FromValue(fieldId, Custom(profile, "WhyInterested"), "CustomAnswers.WhyInterested", "local free-text question match");
        }

        if (ContainsAny(combined, "additional information", "anything else"))
        {
            return FromValue(fieldId, Custom(profile, "AdditionalInfo"), "CustomAnswers.AdditionalInfo", "local additional information match");
        }

        if (ContainsAny(combined, "hispanic", "latino"))
        {
            return FromValue(fieldId, profile.HispanicLatino, nameof(Profile.HispanicLatino), "local EEO match");
        }

        if (ContainsAny(combined, "race", "ethnicity"))
        {
            return FromValue(fieldId, profile.RaceEthnicity, nameof(Profile.RaceEthnicity), "local EEO match");
        }

        if (ContainsAny(combined, "pronoun"))
        {
            return FromValue(fieldId, Custom(profile, "Pronouns"), "CustomAnswers.Pronouns", "local pronouns match");
        }

        if (ContainsAny(combined, "gender"))
        {
            return FromValue(fieldId, profile.Gender, nameof(Profile.Gender), "local EEO match");
        }

        if (ContainsAny(combined, "veteran"))
        {
            return FromValue(fieldId, profile.VeteranStatus, nameof(Profile.VeteranStatus), "local EEO match");
        }

        if (ContainsAny(combined, "disability"))
        {
            return FromValue(fieldId, profile.DisabilityStatus, nameof(Profile.DisabilityStatus), "local EEO match");
        }

        if (ContainsAny(combined, "email", "e-mail"))
        {
            return FromValue(fieldId, profile.Email, nameof(Profile.Email), "local contact match");
        }

        if (ContainsAny(combined, "phone", "mobile", "telephone", "tel"))
        {
            return FromValue(fieldId, profile.Phone, nameof(Profile.Phone), "local contact match");
        }

        if (ContainsAny(text, "first name", "firstname"))
        {
            return FromValue(fieldId, FirstName(profile.FullName), "FirstName", "local name split match");
        }

        if (ContainsAny(text, "last name", "lastname", "surname", "family name"))
        {
            return FromValue(fieldId, LastName(profile.FullName), "LastName", "local name split match");
        }

        if (ContainsAny(text, "full name") && !ContainsAny(text, "company", "employer"))
        {
            return FromValue(fieldId, profile.FullName, nameof(Profile.FullName), "local name match");
        }

        if (ContainsAny(combined, "address", "street"))
        {
            return FromValue(fieldId, profile.AddressLine1, nameof(Profile.AddressLine1), "local address match");
        }

        if (HasToken(combined, "city"))
        {
            return FromValue(fieldId, profile.City, nameof(Profile.City), "local address match");
        }

        if (HasToken(combined, "state") || ContainsAny(combined, "province", "region"))
        {
            return FromValue(fieldId, profile.StateOrProvince, nameof(Profile.StateOrProvince), "local address match");
        }

        if (ContainsAny(combined, "zip", "postal"))
        {
            return FromValue(fieldId, profile.PostalCode, nameof(Profile.PostalCode), "local address match");
        }

        if (ContainsAny(combined, "country"))
        {
            return FromValue(fieldId, profile.Country, nameof(Profile.Country), "local address match");
        }

        if (ContainsAny(combined, "linkedin"))
        {
            return FromValue(fieldId, profile.LinkedInUrl, nameof(Profile.LinkedInUrl), "local profile URL match");
        }

        if (ContainsAny(combined, "github"))
        {
            return FromValue(fieldId, profile.GitHubUrl, nameof(Profile.GitHubUrl), "local profile URL match");
        }

        if (ContainsAny(combined, "portfolio", "website", "personal site"))
        {
            return FromValue(fieldId, profile.PortfolioUrl, nameof(Profile.PortfolioUrl), "local profile URL match");
        }

        if (ContainsAny(combined, "company", "employer"))
        {
            return FromValue(fieldId, profile.CurrentCompany, nameof(Profile.CurrentCompany), "local employment match");
        }

        if (ContainsAny(combined, "title", "current role", "position"))
        {
            return FromValue(fieldId, profile.CurrentTitle, nameof(Profile.CurrentTitle), "local employment match");
        }

        if (ContainsAny(combined, "experience", "years"))
        {
            return FromValue(fieldId, profile.YearsExperience, nameof(Profile.YearsExperience), "local experience match");
        }

        if (ContainsAny(combined, "education", "degree", "school"))
        {
            return FromValue(fieldId, profile.HighestEducation, nameof(Profile.HighestEducation), "local education match");
        }

        if (ContainsAny(combined, "skill"))
        {
            return FromValue(fieldId, profile.Skills, nameof(Profile.Skills), "local skills match");
        }

        if (ContainsAny(combined, "authorization", "authorised", "authorized", "eligible to work"))
        {
            return FromValue(fieldId, profile.WorkAuthorizationStatus, nameof(Profile.WorkAuthorizationStatus), "local work authorization match");
        }

        if (ContainsAny(combined, "sponsor"))
        {
            return FromValue(fieldId, profile.RequiresSponsorship ? "Yes" : "No", nameof(Profile.RequiresSponsorship), "local sponsorship match");
        }

        if (ContainsAny(combined, "relocat"))
        {
            return FromValue(fieldId, profile.WillingToRelocate ? "Yes" : "No", nameof(Profile.WillingToRelocate), "local relocation match");
        }

        if (ContainsAny(combined, "salary", "compensation"))
        {
            return FromValue(fieldId, profile.SalaryExpectation, nameof(Profile.SalaryExpectation), "local compensation match");
        }

        if (ContainsAny(combined, "notice", "start date", "available to start"))
        {
            return FromValue(fieldId, profile.NoticePeriod, nameof(Profile.NoticePeriod), "local availability match");
        }

        if (ContainsAny(combined, "remote", "hybrid", "work type"))
        {
            return FromValue(fieldId, profile.PreferredWorkType, nameof(Profile.PreferredWorkType), "local work type match");
        }

        return new LocalFieldMatch
        {
            FieldId = fieldId,
            Confidence = 0.0d,
            Reason = "no local profile match"
        };
    }

    private static LocalFieldMatch FromValue(string fieldId, string? value, string attribute, string reason)
    {
        return new LocalFieldMatch
        {
            FieldId = fieldId,
            MatchedProfileAttribute = attribute,
            ProposedValue = value,
            Confidence = string.IsNullOrWhiteSpace(value) ? 0.0d : 0.92d,
            Reason = string.IsNullOrWhiteSpace(value) ? $"missing profile value for {attribute}" : reason
        };
    }

    private static string? MatchBooleanField(string combined, Profile profile)
    {
        if (ContainsAny(combined, "agree", "consent", "confirm", "certify", "terms"))
        {
            return "true";
        }

        if (ContainsAny(combined, "sponsor"))
        {
            return profile.RequiresSponsorship ? "true" : "false";
        }

        if (ContainsAny(combined, "relocat"))
        {
            return profile.WillingToRelocate ? "true" : "false";
        }

        return null;
    }

    private static bool IsCheckboxBoolean(DetectedField field)
    {
        return string.Equals(field.ControlType, "checkboxBoolean", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(field.NativeInputType, "checkbox", StringComparison.OrdinalIgnoreCase);
    }

    private static bool ContainsAny(string value, params string[] terms)
    {
        return terms.Any(term => value.Contains(term, StringComparison.OrdinalIgnoreCase));
    }

    private static bool HasToken(string value, string token)
    {
        return Regex.IsMatch(value, $"(^|[^a-z0-9]){Regex.Escape(token)}([^a-z0-9]|$)", RegexOptions.IgnoreCase);
    }

    private static string? FirstName(string? fullName)
    {
        return string.IsNullOrWhiteSpace(fullName) ? null : fullName.Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
    }

    private static string? LastName(string? fullName)
    {
        if (string.IsNullOrWhiteSpace(fullName))
        {
            return null;
        }

        var parts = fullName.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return parts.Length <= 1 ? fullName : parts[^1];
    }

    private static string? Custom(Profile profile, string key)
    {
        return profile.CustomAnswers.TryGetValue(key, out var value) ? value : null;
    }
}
