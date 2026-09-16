using JobAutofill.App.WebView;
using JobAutofill.Domain.Models;

namespace JobAutofill.App.Services;

public sealed record FieldOptionEnrichmentResult(
    IReadOnlyList<DetectedField> Fields,
    int Attempted,
    int Enriched,
    int Failed);

public interface IFieldOptionEnrichmentService
{
    Task<FieldOptionEnrichmentResult> EnrichAsync(
        IJobWebViewBridge webViewBridge,
        IReadOnlyList<DetectedField> fields);
}

/// <summary>
/// Performs bounded, sequential interaction only for choice controls whose
/// passive scan could not observe options. A failure never discards the field.
/// </summary>
public sealed class FieldOptionEnrichmentService : IFieldOptionEnrichmentService
{
    private const int MaximumInteractiveFieldsPerScan = 40;

    public async Task<FieldOptionEnrichmentResult> EnrichAsync(
        IJobWebViewBridge webViewBridge,
        IReadOnlyList<DetectedField> fields)
    {
        ArgumentNullException.ThrowIfNull(webViewBridge);
        ArgumentNullException.ThrowIfNull(fields);

        var candidates = fields
            .Where(RequiresInteractiveExtraction)
            .Take(MaximumInteractiveFieldsPerScan)
            .ToList();
        var enriched = 0;
        var failed = 0;

        foreach (var field in candidates)
        {
            try
            {
                var result = await webViewBridge.ExtractOptionsForFieldAsync(field);
                field.OptionsScanReason = result.Message;
                field.OptionsTruncated = result.OptionsTruncated;
                if (result.Ok && result.Options.Count > 0)
                {
                    field.Options = result.Options;
                    enriched++;
                }
                else
                {
                    failed++;
                }
            }
            catch (Exception ex)
            {
                field.OptionsScanReason = $"Targeted option extraction failed: {FirstLine(ex.Message)}";
                failed++;
                await TryClosePopupAsync(webViewBridge);
            }
        }

        return new(fields, candidates.Count, enriched, failed);
    }

    private static bool RequiresInteractiveExtraction(DetectedField field) =>
        field.RequiresCapturedOption &&
        field.Options.Count == 0 &&
        !string.IsNullOrWhiteSpace(field.ExtractionActionGroup) &&
        !string.IsNullOrWhiteSpace(field.Selector);

    private static async Task TryClosePopupAsync(IJobWebViewBridge webViewBridge)
    {
        try
        {
            await webViewBridge.CloseOpenOptionPopupsAsync();
        }
        catch
        {
            // The original per-field failure remains the useful diagnostic.
        }
    }

    private static string FirstLine(string value) =>
        value.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? value;
}
