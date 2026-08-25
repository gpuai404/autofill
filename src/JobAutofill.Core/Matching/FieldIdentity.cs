using JobAutofill.Domain.Models;

namespace JobAutofill.Core.Matching;

public static class FieldIdentity
{
    public static string GetFieldId(DetectedField field)
    {
        return string.IsNullOrWhiteSpace(field.Selector)
            ? $"{field.SourceUrl}|{field.Label}|{field.InputType}"
            : field.Selector;
    }
}
