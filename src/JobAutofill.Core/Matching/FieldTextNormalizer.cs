using System.Text.RegularExpressions;

namespace JobAutofill.Core.Matching;

public static class FieldTextNormalizer
{
    public static string Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var text = Regex.Replace(value, "[_\\-#\\[\\]=\"']", " ").Replace("\\", " ");

        return Regex
            .Replace(text, "\\s+", " ")
            .Trim()
            .ToLowerInvariant();
    }

    public static bool ContainsAny(string value, IEnumerable<string> terms)
    {
        return terms.Any(term => value.Contains(term, StringComparison.OrdinalIgnoreCase));
    }
}
