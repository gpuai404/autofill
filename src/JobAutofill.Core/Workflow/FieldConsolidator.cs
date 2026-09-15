using JobAutofill.Core.Matching;
using JobAutofill.Domain.Models;

namespace JobAutofill.Core.Workflow;

public enum FieldDisposition
{
    Included,
    Structural,
    Informational,
    Duplicate,
    Unidentified
}

public sealed record FieldConsolidationResult(
    DetectedField Source,
    FieldDisposition Disposition,
    ApplicationFieldDescriptor? Field,
    string Reason);

public sealed class FieldConsolidator
{
    public IReadOnlyList<FieldConsolidationResult> Consolidate(
        ScanContext context,
        IReadOnlyList<DetectedField> detectedFields)
    {
        var results = new List<FieldConsolidationResult>();
        var identities = new HashSet<string>(StringComparer.Ordinal);

        for (var index = 0; index < detectedFields.Count; index++)
        {
            var source = detectedFields[index];
            if (IsStructural(source))
            {
                results.Add(new(source, FieldDisposition.Structural, null, "Structural container."));
                continue;
            }
            if (IsInformational(source))
            {
                results.Add(new(source, FieldDisposition.Informational, null, "Page action, not an answer field."));
                continue;
            }

            var label = FieldTextNormalizer.NormalizeDisplay(source.Label);
            var fieldId = BuildFieldId(context, source, label);
            if (!identities.Add(fieldId))
            {
                results.Add(new(source, FieldDisposition.Duplicate, null, "Duplicate field evidence."));
                continue;
            }

            var descriptor = new ApplicationFieldDescriptor
            {
                FieldId = fieldId,
                ScanId = context.ScanId,
                Locator = source.Selector,
                Label = label,
                ControlKind = ControlKind(source),
                Requirement = Requirement(source),
                FillCapability = FillCapability(source),
                Sensitivity = Sensitivity(source),
                Source = source,
                Options = source.Options
            };
            var disposition = string.IsNullOrWhiteSpace(label)
                ? FieldDisposition.Unidentified
                : FieldDisposition.Included;
            results.Add(new(source, disposition, descriptor,
                disposition == FieldDisposition.Unidentified ? "Field has no trustworthy label." : "Answer field."));
        }

        return results;
    }

    private static string BuildFieldId(ScanContext context, DetectedField field, string label)
    {
        var stableHint = string.Join('|', label, field.ControlType, field.NativeInputType, field.Autocomplete, field.Selector);
        return $"{context.ScanId}:{FieldTextNormalizer.StableKey(stableHint)}";
    }

    private static bool IsStructural(DetectedField field) =>
        string.Equals(field.ControlFamily, "container", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(field.ControlType, "groupContainer", StringComparison.OrdinalIgnoreCase);

    private static bool IsInformational(DetectedField field) =>
        string.Equals(field.ControlType, "actionButton", StringComparison.OrdinalIgnoreCase);

    private static ApplicationControlKind ControlKind(DetectedField field) => field.ControlType?.ToLowerInvariant() switch
    {
        "select" or "combobox" or "gridcombobox" or "radio" => ApplicationControlKind.SingleChoice,
        "checkboxgroup" => ApplicationControlKind.MultipleChoice,
        "checkboxboolean" => ApplicationControlKind.Boolean,
        "number" or "range" => ApplicationControlKind.Number,
        "date" => ApplicationControlKind.Date,
        "file" => ApplicationControlKind.File,
        "password" => ApplicationControlKind.Password,
        "text" or "textarea" or "richtext" or "email" or "phone" or "url" or "search" => ApplicationControlKind.Text,
        _ => ApplicationControlKind.Unknown
    };

    private static FieldRequirement Requirement(DetectedField field) =>
        string.Equals(field.Required, "true", StringComparison.OrdinalIgnoreCase) ? FieldRequirement.Required :
        string.Equals(field.Optional, "true", StringComparison.OrdinalIgnoreCase) ? FieldRequirement.Optional :
        FieldRequirement.Unknown;

    private static FieldFillCapability FillCapability(DetectedField field) =>
        string.Equals(field.FillStrategy, "unsupportedInPageJavaScript", StringComparison.OrdinalIgnoreCase) ? FieldFillCapability.Manual :
        string.Equals(field.FillStrategy, "skip", StringComparison.OrdinalIgnoreCase) ? FieldFillCapability.Manual :
        string.IsNullOrWhiteSpace(field.FillStrategy) ? FieldFillCapability.Unsupported :
        FieldFillCapability.Automatic;

    private static FieldSensitivity Sensitivity(DetectedField field)
    {
        var label = FieldTextNormalizer.Normalize(field.Label);
        if (FieldTextNormalizer.ContainsAny(label, ["consent", "certify", "certification", "agree", "terms", "acknowledge"]))
            return FieldSensitivity.ConsentOrCertification;
        if (string.Equals(field.FieldCategory, "sensitive", StringComparison.OrdinalIgnoreCase))
            return FieldSensitivity.Sensitive;
        if (FieldTextNormalizer.ContainsAny(label, ["salary", "compensation", "work authorization", "sponsor"]))
            return FieldSensitivity.Personal;
        return FieldSensitivity.Standard;
    }
}
