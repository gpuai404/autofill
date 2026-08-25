using JobAutofill.Core.Matching;
using JobAutofill.Domain.Models;

namespace JobAutofill.Core.Workflow;

public sealed class DetectedFieldNormalizer
{
    private static readonly string[] FileUploadIntentTerms =
    [
        "upload",
        "resume",
        "cv",
        "file",
        "document",
        "attachment",
        "attach",
        "photo",
        "image",
        "avatar",
        "portfolio"
    ];

    private static readonly string[] FreeTextQuestionTerms =
    [
        "message",
        "message to the hiring team",
        "hiring team",
        "cover letter",
        "additional information",
        "anything else",
        "interest",
        "why interested",
        "why are you interested",
        "your interest",
        "comments"
    ];

    private static readonly string[] FileUploadChromeLabels =
    [
        "or",
        "choose file",
        "choose a file",
        "or drop it here",
        "drop it here",
        "no file chosen"
    ];

    public IReadOnlyList<DetectedField> Normalize(IReadOnlyList<DetectedField> fields)
    {
        var nonFileLabels = fields
            .Where(field => !IsFile(field))
            .Select(field => FieldTextNormalizer.Normalize(field.Label))
            .Where(label => !string.IsNullOrWhiteSpace(label))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        return fields
            .Where(field => ShouldKeepField(field, nonFileLabels))
            .ToList();
    }

    private static bool ShouldKeepField(DetectedField field, ISet<string> nonFileLabels)
    {
        if (IsContainer(field) || HasUnusableDisplayLabel(field))
        {
            return false;
        }

        if (!IsFile(field))
        {
            return true;
        }

        var label = FieldTextNormalizer.Normalize(field.Label);
        if (string.IsNullOrWhiteSpace(label) ||
            FileUploadChromeLabels.Any(fragment => string.Equals(label, FieldTextNormalizer.Normalize(fragment), StringComparison.OrdinalIgnoreCase)) ||
            nonFileLabels.Contains(label))
        {
            return false;
        }

        return !FieldTextNormalizer.ContainsAny(label, FreeTextQuestionTerms) ||
            FieldTextNormalizer.ContainsAny(label, FileUploadIntentTerms);
    }

    private static bool IsFile(DetectedField field)
    {
        return string.Equals(field.ControlType, "file", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(field.NativeInputType, "file", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsContainer(DetectedField field)
    {
        return string.Equals(field.ControlType, "groupContainer", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(field.ControlFamily, "container", StringComparison.OrdinalIgnoreCase);
    }

    private static bool HasUnusableDisplayLabel(DetectedField field)
    {
        var label = FieldTextNormalizer.Normalize(field.Label);
        return string.IsNullOrWhiteSpace(label) ||
            label is "preliminary questions" or "screening questions";
    }
}
