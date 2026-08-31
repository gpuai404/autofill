using JobAutofill.App.Models.WebView;
using JobAutofill.Domain.Models;
using Microsoft.Maui.Controls;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace JobAutofill.App.WebView;

public sealed class JobWebViewBridge : IJobWebViewBridge
{
    private const string GenericRulesAssetName = "metadata/generic-field-control-rules.json";
    private const int ScanCompletionAttemptLimit = 180;
    private const int ScanCompletionDelayMs = 200;
    private const int OptionExtractionAttemptLimit = 100;
    private const int OptionExtractionDelayMs = 150;
    private const int FillCompletionAttemptLimit = 20;
    private const int FillCompletionDelayMs = 150;
    private static readonly string[] DetectorAssetNames =
    [
        // Shared utilities (must load before scanner modules)
        "shared/text-utils.js",
        "shared/dom-traversal.js",
        "shared/selector-resolver.js",
        "webview/bridge-runtime.js",
        // Metadata: built-in generic rules (site-specific metadata is provided by C# at runtime, not bundled in APK)
        GenericRulesAssetName,
        "metadata/metadata-resolver.js",
        // Generic engine modules
        "generic-engine/label-discovery.js",
        "generic-engine/control-classification.js",
        "generic-engine/choice-selection.js",
        "generic-engine/choice-group-discovery.js",
        "generic-engine/sensitive-fields.js",
        "generic-engine/capability-probe.js",
        "generic-engine/option-handling.js",
        "generic-engine/option-source-handlers.js",
        "generic-engine/action-classification.js",
        "generic-engine/page-classification.js",
        "generic-engine/diagnostics.js",
        // Scanner
        "scanner/scanner-engine.js",
        "scanner/scanner.js"
    ];

    private readonly Microsoft.Maui.Controls.WebView _webView;
    private string? _domSharedScript;
    private string? _detectorScript;
    private string? _fillScript;
    private bool _domSharedInjected;
    private bool _detectorInjected;
    private bool _fillScriptInjected;

    public JobWebViewBridge(Microsoft.Maui.Controls.WebView webView)
    {
        _webView = webView;
    }

    public void ResetInjectedState()
    {
        _domSharedInjected = false;
        _detectorInjected = false;
        _fillScriptInjected = false;
    }

    public async Task EnsureDetectorInjectedAsync()
    {
        if (_detectorInjected)
        {
            return;
        }

        await EnsureDomSharedInjectedAsync();

        _detectorScript ??= await LoadAndroidAssetsAsync(DetectorAssetNames);
        if (string.IsNullOrWhiteSpace(_detectorScript))
        {
            throw new InvalidOperationException("The scanner scripts were not packaged with the app.");
        }

        await _webView.EvaluateJavaScriptAsync(_detectorScript);
        _detectorInjected = true;
    }

    public async Task<WebViewScanResult> ScanAsync()
    {
        await EnsureDetectorInjectedAsync();

        await _webView.EvaluateJavaScriptAsync("window.__jobAutofill.scanFields();");
        var state = await WaitForJavaScriptOperationAsync("__scanFields", ScanCompletionAttemptLimit, ScanCompletionDelayMs);
        var error = NormalizeJavaScriptStringResult(state.Error);
        if (!string.IsNullOrWhiteSpace(error))
        {
            throw new InvalidOperationException(error);
        }

        var rawDebug = await _webView.EvaluateJavaScriptAsync("JSON.stringify(window.__scanDebug || {})");
        if (string.IsNullOrWhiteSpace(state.Result))
        {
            var debugSummary = BuildJavaScriptDiagnosticSummary(rawDebug);
            throw new InvalidOperationException($"Scan finished without producing a payload.{debugSummary}");
        }

        try
        {
            var normalizedResult = NormalizeAndValidateJsonPayload(state.Result, "scan result");
            var capability = await GetScanCapabilityAsync();
            return new WebViewScanResult(normalizedResult, ParseDetectedFields(normalizedResult), capability);
        }
        catch (InvalidOperationException ex)
        {
            var debugSummary = BuildJavaScriptDiagnosticSummary(rawDebug);
            throw new InvalidOperationException($"{ex.Message}{debugSummary}", ex);
        }
    }

    public async Task<WebViewOptionExtractionResult> ExtractOptionsForFieldAsync(DetectedField field)
    {
        await EnsureDetectorInjectedAsync();

        var selector = JsonSerializer.Serialize(field.Selector);
        await _webView.EvaluateJavaScriptAsync($"window.__jobAutofill.extractOptionsForField({selector});");
        var state = await WaitForJavaScriptOperationAsync("__extractOptionsForField", OptionExtractionAttemptLimit, OptionExtractionDelayMs, false);
        var error = NormalizeJavaScriptStringResult(state.Error);
        await CloseOpenOptionPopupsAsync();
        if (!string.IsNullOrWhiteSpace(error))
        {
            return new WebViewOptionExtractionResult(false, error, [], false);
        }

        return ParseOptionExtractionResult(field, state.Result);
    }

    public Task CloseOpenOptionPopupsAsync()
    {
        return CloseOpenOptionPopupsCoreAsync();
    }

    private async Task CloseOpenOptionPopupsCoreAsync()
    {
        await EnsureDetectorInjectedAsync();

        await _webView.EvaluateJavaScriptAsync("window.__jobAutofill.closeOpenOptionPopups();");
        await WaitForJavaScriptOperationAsync("__closeOpenOptionPopups", OptionExtractionAttemptLimit, OptionExtractionDelayMs, false);
    }

    public async Task<string> GetCurrentPageClassificationAsync()
    {
        try
        {
            var rawClassification = await _webView.EvaluateJavaScriptAsync("window.__jobAutofill.getPageClassification();");

            if (string.IsNullOrWhiteSpace(rawClassification))
            {
                return "unsupported";
            }

            var normalizedClassificationJson = NormalizeJavaScriptJsonResult(rawClassification);
            using var document = JsonDocument.Parse(normalizedClassificationJson);
            if (document.RootElement.TryGetProperty("classification", out var classificationElement) &&
                classificationElement.ValueKind == JsonValueKind.String)
            {
                return classificationElement.GetString() ?? "unsupported";
            }
        }
        catch
        {
            // Fallback to unsupported when classification is unavailable.
        }

        return "unsupported";
    }

    private async Task<WebViewCapabilityResult> GetScanCapabilityAsync()
    {
        try
        {
            var rawCapability = await _webView.EvaluateJavaScriptAsync("window.__jobAutofill.getScanCapability();");
            if (string.IsNullOrWhiteSpace(rawCapability))
            {
                return WebViewCapabilityResult.Unknown;
            }

            var json = NormalizeAndValidateJsonPayload(rawCapability, "scan capability");
            using var document = JsonDocument.Parse(json);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                return WebViewCapabilityResult.Unknown;
            }

            var root = document.RootElement;
            var status = GetString(root, "status") ?? "unknown";
            var reason = GetString(root, "reason");
            var message = GetString(root, "message") ?? WebViewCapabilityResult.Unknown.Message;
            var scannable = root.TryGetProperty("scannable", out var scannableElement) &&
                scannableElement.ValueKind == JsonValueKind.False
                    ? false
                    : !string.Equals(status, "hard-stop", StringComparison.OrdinalIgnoreCase);

            return new WebViewCapabilityResult(scannable, status, reason, message, json);
        }
        catch
        {
            return WebViewCapabilityResult.Unknown;
        }
    }

    public async Task FocusFieldAsync(DetectedField field)
    {
        var selector = JsonSerializer.Serialize(field.Selector);
        await _webView.EvaluateJavaScriptAsync($"window.__jobAutofill.focusField({selector});");
    }

    public async Task<WebViewFillResult> FillAsync(FillCommand command)
    {
        await EnsureFillScriptInjectedAsync();

        if (command.SelectedOptions.Count > 0)
        {
            var filledCount = 0;
            foreach (var option in command.SelectedOptions)
            {
                var optionResult = await FillFieldOptionAsync(command, option);
                if (!optionResult.Ok)
                {
                    return optionResult;
                }

                filledCount++;
            }

            return new WebViewFillResult(true, filledCount == 1 ? "Selected matched option." : $"Selected {filledCount} matched options.");
        }

        if (string.IsNullOrWhiteSpace(command.Value))
        {
            return new WebViewFillResult(false, "No value was matched for this field.");
        }

        return await FillFieldAsync(command);
    }

    public async Task<WebViewFillResult> FillFieldOptionAsync(FillCommand command, SelectedFieldOption option)
    {
        await EnsureFillScriptInjectedAsync();

        var selector = JsonSerializer.Serialize(command.Selector);
        var optionJson = JsonSerializer.Serialize(option);
        var fillStrategy = JsonSerializer.Serialize(command.FillStrategy);
        await _webView.EvaluateJavaScriptAsync($"window.__jobAutofill.fillFieldOption({selector}, {optionJson}, {fillStrategy});");
        var state = await WaitForJavaScriptOperationAsync("__fillFieldOption", FillCompletionAttemptLimit, FillCompletionDelayMs, false);
        var error = NormalizeJavaScriptStringResult(state.Error);
        if (!string.IsNullOrWhiteSpace(error))
        {
            return new WebViewFillResult(false, error);
        }

        await ResetWebViewAfterFillAsync();
        return ParseFillResult(state.Result);
    }

    public async Task ClearFieldHighlightAsync(DetectedField field)
    {
        var selector = JsonSerializer.Serialize(field.Selector);
        await _webView.EvaluateJavaScriptAsync($"window.__jobAutofill.clearFieldHighlight({selector});");
    }

    public async Task<string> GetEncodedScanDebugJsonAsync()
    {
        var rawDebugJson = await _webView.EvaluateJavaScriptAsync("window.__jobAutofill.getScanDebugJson();");
        return Uri.UnescapeDataString(rawDebugJson ?? "{}");
    }

    public async Task EnsureFillScriptInjectedAsync()
    {
        if (_fillScriptInjected)
        {
            return;
        }

        await EnsureDomSharedInjectedAsync();

        if (_fillScript == null)
        {
            var optionHandlingScript = await LoadAndroidAssetAsync("generic-engine/option-handling.js");
            var fillScript = await LoadAndroidAssetAsync("filler/fill.js");
            if (string.IsNullOrWhiteSpace(optionHandlingScript) || string.IsNullOrWhiteSpace(fillScript))
            {
                throw new InvalidOperationException("option-handling.js or fill.js was not packaged with the app.");
            }

            _fillScript = optionHandlingScript + "\n" + fillScript;
        }

        await _webView.EvaluateJavaScriptAsync(_fillScript);
        _fillScriptInjected = true;
    }

    private async Task<WebViewFillResult> FillFieldAsync(FillCommand command)
    {
        await EnsureFillScriptInjectedAsync();

        var selector = JsonSerializer.Serialize(command.Selector);
        var value = JsonSerializer.Serialize(command.Value);
        var fillStrategy = JsonSerializer.Serialize(command.FillStrategy);
        await _webView.EvaluateJavaScriptAsync($"window.__jobAutofill.fillField({selector}, {value}, {fillStrategy});");
        var state = await WaitForJavaScriptOperationAsync("__fillField", FillCompletionAttemptLimit, FillCompletionDelayMs, false);
        var error = NormalizeJavaScriptStringResult(state.Error);
        await ResetWebViewAfterFillAsync();
        if (!string.IsNullOrWhiteSpace(error))
        {
            return new WebViewFillResult(false, error);
        }

        return ParseFillResult(state.Result);
    }

    private Task ResetWebViewAfterFillAsync()
    {
        return _webView.EvaluateJavaScriptAsync("window.__jobAutofill.resetFillState();");
    }

    private async Task EnsureDomSharedInjectedAsync()
    {
        if (_domSharedInjected)
        {
            return;
        }

        _domSharedScript ??= await LoadAndroidAssetAsync("shared/shared-runtime.js");
        if (string.IsNullOrWhiteSpace(_domSharedScript))
        {
            throw new InvalidOperationException("shared-runtime.js was not packaged with the app.");
        }

        await _webView.EvaluateJavaScriptAsync(_domSharedScript);
        _domSharedInjected = true;
    }

    private static async Task<string> LoadAndroidAssetsAsync(IEnumerable<string> assetNames)
    {
        var scripts = new StringBuilder();

        foreach (var assetName in assetNames)
        {
            var script = await LoadAndroidAssetAsync(assetName);
            if (string.IsNullOrWhiteSpace(script))
            {
                throw new InvalidOperationException($"{assetName} was not packaged with the app.");
            }

            scripts.AppendLine($"// {assetName}");
            scripts.AppendLine(BuildInjectedAssetScript(assetName, script));
        }

        return scripts.ToString();
    }

    private async Task<JavaScriptOperationState> WaitForJavaScriptOperationAsync(
        string stateName,
        int attemptLimit,
        int delayMs,
        bool throwOnTimeout = true)
    {
        for (var attempt = 0; attempt < attemptLimit; attempt++)
        {
            var rawDone = await _webView.EvaluateJavaScriptAsync($"window.{stateName}Done ? 'true' : 'false'");
            var rawResult = await _webView.EvaluateJavaScriptAsync($"window.{stateName}Result || ''");
            var rawError = await _webView.EvaluateJavaScriptAsync($"window.{stateName}Error || ''");
            if (NormalizeJavaScriptStringResult(rawDone) == "true")
            {
                return new JavaScriptOperationState(rawResult, rawError);
            }

            await Task.Delay(delayMs);
        }

        if (!throwOnTimeout)
        {
            return new JavaScriptOperationState(
                Uri.EscapeDataString(JsonSerializer.Serialize(new { ok = false, message = BuildTimeoutMessage(stateName) })),
                string.Empty);
        }

        var timeoutDebug = await _webView.EvaluateJavaScriptAsync("JSON.stringify(window.__scanDebug || {})");
        throw new TimeoutException($"Timed out while waiting for {stateName} to finish.{BuildJavaScriptDiagnosticSummary(timeoutDebug)}");
    }

    private static string BuildTimeoutMessage(string stateName)
    {
        return stateName switch
        {
            "__fillFieldOption" => "Timed out while selecting captured option.",
            "__fillField" => "Timed out while filling this field.",
            "__extractOptionsForField" => "Timed out while extracting options for this field.",
            _ => $"Timed out while waiting for {stateName} to finish."
        };
    }

    private static string BuildInjectedAssetScript(string assetName, string assetContent)
    {
        if (assetName == GenericRulesAssetName)
        {
            using var document = JsonDocument.Parse(assetContent);
            var normalizedRules = JsonSerializer.Serialize(document.RootElement);
            return $"window.__fieldControlRules = {normalizedRules};";
        }

        return assetContent;
    }

    private static async Task<string> LoadAndroidAssetAsync(string assetName)
    {
#if ANDROID
        await using var stream = global::Android.App.Application.Context.Assets!.Open(assetName);
        using var reader = new StreamReader(stream);
        return await reader.ReadToEndAsync();
#else
        await using var stream = await FileSystem.OpenAppPackageFileAsync(assetName);
        using var reader = new StreamReader(stream);
        return await reader.ReadToEndAsync();
#endif
    }

    private static IReadOnlyList<DetectedField> ParseDetectedFields(string? rawResult)
    {
        if (string.IsNullOrWhiteSpace(rawResult) || rawResult == "null")
        {
            return Array.Empty<DetectedField>();
        }

        var json = NormalizeAndValidateJsonPayload(rawResult, "detected fields");

        try
        {
            return JsonSerializer.Deserialize<List<DetectedField>>(
                json,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? [];
        }
        catch (JsonException ex)
        {
            throw new JsonException($"Could not parse detected fields. Raw normalized result: {json}", ex);
        }
    }

    private static WebViewOptionExtractionResult ParseOptionExtractionResult(DetectedField field, string? rawResult)
    {
        if (string.IsNullOrWhiteSpace(rawResult) || rawResult == "null")
        {
            return new WebViewOptionExtractionResult(false, "No option extraction result returned.", [], false);
        }

        var json = NormalizeAndValidateJsonPayload(rawResult, "option extraction result");
        try
        {
            var result = JsonSerializer.Deserialize<OptionExtractionResult>(
                json,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            if (result is null)
            {
                return new WebViewOptionExtractionResult(false, "Empty option extraction result.", [], false);
            }

            if (!result.Ok && result.Options.Count == 0)
            {
                return new WebViewOptionExtractionResult(false, result.Message ?? "Options were not captured.", [], result.OptionsTruncated);
            }

            var ownership = ValidateOptionOwnership(field, result.Options);
            if (!ownership.IsValid)
            {
                return new WebViewOptionExtractionResult(false, ownership.Message, [], result.OptionsTruncated);
            }

            return new WebViewOptionExtractionResult(true, result.Message ?? "Options extracted.", result.Options, result.OptionsTruncated);
        }
        catch (JsonException ex)
        {
            return new WebViewOptionExtractionResult(false, $"Could not parse option extraction result: {ex.Message}. Raw: {json}", [], false);
        }
    }

    private static (bool IsValid, string Message) ValidateOptionOwnership(
        DetectedField field,
        IReadOnlyList<DetectedFieldOption> options)
    {
        if (options.Count == 0)
        {
            return (true, "No options returned.");
        }

        var fieldId = ReactSelectFieldIdFromSelector(field.Selector);
        if (string.IsNullOrWhiteSpace(fieldId))
        {
            return (true, "No field ownership marker available.");
        }

        var expectedPrefix = $"#react-select-{fieldId}-option-";
        var reactSelectOptions = options
            .Where(option => !string.IsNullOrWhiteSpace(option.Selector) &&
                             option.Selector.Contains("#react-select-", StringComparison.Ordinal))
            .ToList();

        if (reactSelectOptions.Count == 0)
        {
            return (true, "No React Select option ownership marker available.");
        }

        var foreignOption = reactSelectOptions.FirstOrDefault(option =>
            !option.Selector!.StartsWith(expectedPrefix, StringComparison.Ordinal));

        if (foreignOption is null)
        {
            return (true, "Options belong to this field.");
        }

        return (false,
            $"Discarded options for {field.Label ?? field.Selector}: option selector {foreignOption.Selector} does not belong to field {field.Selector}.");
    }

    private static string? ReactSelectFieldIdFromSelector(string? selector)
    {
        if (string.IsNullOrWhiteSpace(selector) || !selector.StartsWith("#", StringComparison.Ordinal))
        {
            return null;
        }

        var id = selector[1..];
        return string.IsNullOrWhiteSpace(id) ? null : id;
    }

    private static string? GetString(JsonElement element, string propertyName)
    {
        return element.TryGetProperty(propertyName, out var property) && property.ValueKind == JsonValueKind.String
            ? property.GetString()
            : null;
    }

    private static WebViewFillResult ParseFillResult(string? rawResult)
    {
        if (string.IsNullOrWhiteSpace(rawResult) || rawResult == "null")
        {
            return new WebViewFillResult(false, "No result returned.");
        }

        var json = NormalizeAndValidateJsonPayload(rawResult, "fill result");

        try
        {
            return JsonSerializer.Deserialize<WebViewFillResult>(
                json,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new WebViewFillResult(false, "Empty fill result.");
        }
        catch (JsonException ex)
        {
            return new WebViewFillResult(false, $"Could not parse fill result: {ex.Message}. Raw: {json}");
        }
    }

    private static string BuildJavaScriptDiagnosticSummary(string? rawDebugJson)
    {
        if (string.IsNullOrWhiteSpace(rawDebugJson))
        {
            return string.Empty;
        }

        try
        {
            using var debugDocument = JsonDocument.Parse(NormalizeJavaScriptJsonResult(rawDebugJson));
            var root = debugDocument.RootElement;
            if (!root.ValueKind.Equals(JsonValueKind.Object))
            {
                return string.Empty;
            }

            var errors = root.TryGetProperty("errors", out var errorsElement) && errorsElement.ValueKind == JsonValueKind.Array
                ? errorsElement
                : default;

            if (errors.ValueKind != JsonValueKind.Array || errors.GetArrayLength() == 0)
            {
                return string.Empty;
            }

            var firstError = errors[0];
            var message = firstError.TryGetProperty("message", out var messageElement) && messageElement.ValueKind == JsonValueKind.String
                ? messageElement.GetString()
                : firstError.ToString();

            return $" Diagnostic: {message}";
        }
        catch (JsonException)
        {
            return string.Empty;
        }
    }


    private static string NormalizeAndValidateJsonPayload(string? rawResult, string payloadName)
    {
        if (string.IsNullOrWhiteSpace(rawResult))
        {
            return "[]";
        }

        var value = NormalizeJavaScriptJsonResult(rawResult);

        if (string.IsNullOrWhiteSpace(value) || value == "null")
        {
            return "[]";
        }

        try
        {
            JsonDocument.Parse(value);
            return value;
        }
        catch (JsonException ex)
        {
            throw new InvalidOperationException($"Invalid {payloadName} payload returned by the page. Payload: {value}", ex);
        }
    }

    private static string NormalizeJavaScriptJsonResult(string rawResult)
    {
        var value = rawResult.Trim();
        if (value is "undefined" or "null" or "false")
        {
            return "[]";
        }

        for (var i = 0; i < 3; i++)
        {
            if (value.StartsWith("\\\"", StringComparison.Ordinal))
            {
                value = Regex.Unescape(value).Trim();
                continue;
            }

            if (value.Length >= 2 && value.StartsWith('"') && value.EndsWith('"'))
            {
                try
                {
                    value = JsonSerializer.Deserialize<string>(value)?.Trim() ?? "[]";
                }
                catch (JsonException)
                {
                    value = value[1..^1].Trim();
                }

                continue;
            }

            break;
        }

        if (value.Contains('%', StringComparison.Ordinal))
        {
            value = Uri.UnescapeDataString(value);
        }

        return string.IsNullOrWhiteSpace(value) ? "[]" : value;
    }

    private static string NormalizeJavaScriptStringResult(string? rawResult)
    {
        if (string.IsNullOrWhiteSpace(rawResult) || rawResult == "null" || rawResult == "undefined")
        {
            return string.Empty;
        }

        var value = rawResult.Trim();
        if (value.Length >= 2 && value.StartsWith('"') && value.EndsWith('"'))
        {
            try
            {
                return JsonSerializer.Deserialize<string>(value)?.Trim() ?? string.Empty;
            }
            catch (JsonException)
            {
                return value[1..^1].Trim();
            }
        }

        return value;
    }

    private sealed class OptionExtractionResult
    {
        public bool Ok { get; set; }
        public string? Message { get; set; }
        public IReadOnlyList<DetectedFieldOption> Options { get; set; } = [];
        public bool OptionsTruncated { get; set; }
        public bool PopupClosed { get; set; }
    }

    private sealed record JavaScriptOperationState(string? Result, string? Error);
}
