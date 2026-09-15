using System.Text.RegularExpressions;

namespace JobAutofill.Core.Matching;

public static class FieldTextNormalizer
{
    public static string NormalizeDisplay(string? value)
    {
        return string.IsNullOrWhiteSpace(value)
            ? string.Empty
            : Regex.Replace(value, "\\s+", " ").Trim();
    }

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

    public static string StableKey(string value)
    {
        var normalized = Normalize(value);
        var hash = System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(normalized));
        return Convert.ToHexString(hash.AsSpan(0, 12)).ToLowerInvariant();
    }
}
