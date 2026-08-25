using JobAutofill.Domain.Models;
using Microsoft.Maui.Controls;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace JobAutofill.App.WebView;

public sealed class JobWebViewBridge
{
    private const int ScanCompletionAttemptLimit = 180;
    private const int ScanCompletionDelayMs = 200;
    private const int OptionExtractionAttemptLimit = 100;
    private const int OptionExtractionDelayMs = 150;
    private readonly Microsoft.Maui.Controls.WebView _webView;
    private readonly WebViewScriptRuntime _scriptRuntime;
    private string? _domSharedScript;
    private string? _capabilityProbeScript;
    private string? _detectorScript;
    private string? _fillScript;
    private string? _fieldControlRulesJson;
    private bool _domSharedInjected;
    private bool _detectorInjected;
    private bool _fillScriptInjected;

    public JobWebViewBridge(Microsoft.Maui.Controls.WebView webView)
    {
        _webView = webView;
        _scriptRuntime = new WebViewScriptRuntime(webView);
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

        _capabilityProbeScript ??= await LoadAndroidAssetAsync("capability-probe.js");
        _detectorScript ??= await LoadAndroidAssetAsync("detector.js");
        _fieldControlRulesJson ??= await LoadAndroidAssetAsync("field-control-rules.json");
        if (string.IsNullOrWhiteSpace(_capabilityProbeScript))
        {
            throw new InvalidOperationException("capability-probe.js was not packaged with the app.");
        }

        if (string.IsNullOrWhiteSpace(_detectorScript))
        {
            throw new InvalidOperationException("detector.js was not packaged with the app.");
        }

        if (string.IsNullOrWhiteSpace(_fieldControlRulesJson))
        {
            throw new InvalidOperationException("field-control-rules.json was not packaged with the app.");
        }

        await _webView.EvaluateJavaScriptAsync($"window.__fieldControlRules = {_fieldControlRulesJson};\n{_capabilityProbeScript}\n{_detectorScript}");
        _detectorInjected = true;
    }

    public async Task<WebViewScanResult> ScanAsync()
    {
        await EnsureDetectorInjectedAsync();

        await _webView.EvaluateJavaScriptAsync(@"
(function () {
  window.__scanFieldsResult = encodeURIComponent(JSON.stringify([]));
  window.__scanFieldsError = '';
  window.__scanFieldsDone = false;

  try {
    if (!window.__scanFields) {
      window.__scanFieldsDone = true;
      return true;
    }

    Promise.resolve()
      .then(function () {
        return window.__scanFields();
      })
      .then(function (fields) {
        window.__scanFieldsResult = encodeURIComponent(JSON.stringify(Array.isArray(fields) ? fields : []));
        window.__scanFieldsDone = true;
      })
      .catch(function (error) {
        window.__scanFieldsError = error && error.stack ? error.stack : String(error);
        window.__scanFieldsResult = encodeURIComponent(JSON.stringify([]));
        window.__scanFieldsDone = true;
      });

    return true;
  } catch (error) {
    window.__scanFieldsError = error && error.stack ? error.stack : String(error);
    window.__scanFieldsResult = encodeURIComponent(JSON.stringify([]));
    window.__scanFieldsDone = true;
    return true;
  }
})()
");

        for (var attempt = 0; attempt < ScanCompletionAttemptLimit; attempt++)
        {
            var rawDone = await _webView.EvaluateJavaScriptAsync("window.__scanFieldsDone ? 'true' : 'false'");
            var rawError = await _webView.EvaluateJavaScriptAsync("window.__scanFieldsError || ''");
            var error = NormalizeJavaScriptStringResult(rawError);
            if (!string.IsNullOrWhiteSpace(error))
            {
                var rawDebug = await _webView.EvaluateJavaScriptAsync("JSON.stringify(window.__scanDebug || {})");
                throw new InvalidOperationException(error);
            }

            if (NormalizeJavaScriptStringResult(rawDone) == "true")
            {
                var rawResult = await _webView.EvaluateJavaScriptAsync("window.__scanFieldsResult || ''");
                var rawDebug = await _webView.EvaluateJavaScriptAsync("JSON.stringify(window.__scanDebug || {})");
                if (string.IsNullOrWhiteSpace(rawResult))
                {
                    var debugSummary = BuildJavaScriptDiagnosticSummary(rawDebug);
                    throw new InvalidOperationException($"Scan finished without producing a payload.{debugSummary}");
                }

                try
                {
                    var normalizedResult = NormalizeAndValidateJsonPayload(rawResult, "scan result");
                    var capability = await GetScanCapabilityAsync();
                    return new WebViewScanResult(normalizedResult, ParseDetectedFields(normalizedResult), capability);
                }
                catch (InvalidOperationException ex)
                {
                    var debugSummary = BuildJavaScriptDiagnosticSummary(rawDebug);
                    throw new InvalidOperationException($"{ex.Message}{debugSummary}", ex);
                }
            }

            await Task.Delay(ScanCompletionDelayMs);
        }

        var timeoutDebug = await _webView.EvaluateJavaScriptAsync("JSON.stringify(window.__scanDebug || {})");
        throw new TimeoutException($"Timed out while waiting for the page scan to finish.{BuildJavaScriptDiagnosticSummary(timeoutDebug)}");
    }

    public async Task<WebViewOptionExtractionResult> ExtractOptionsForFieldAsync(DetectedField field)
    {
        await EnsureDetectorInjectedAsync();

        var selector = JsonSerializer.Serialize(field.Selector);
        await _webView.EvaluateJavaScriptAsync($@"
(function () {{
  window.__extractOptionsForFieldResult = '';
  window.__extractOptionsForFieldError = '';
  window.__extractOptionsForFieldDone = false;

  if (!window.__extractOptionsForField) {{
    window.__extractOptionsForFieldResult = encodeURIComponent(JSON.stringify({{ ok: false, message: 'option extractor missing', options: [] }}));
    window.__extractOptionsForFieldDone = true;
    return true;
  }}

  Promise.resolve(window.__extractOptionsForField({selector}))
    .then(function (result) {{
      window.__extractOptionsForFieldResult = encodeURIComponent(JSON.stringify(result || {{ ok: false, message: 'empty option extraction result', options: [] }}));
      window.__extractOptionsForFieldDone = true;
    }})
    .catch(function (error) {{
      window.__extractOptionsForFieldError = error && error.stack ? error.stack : String(error);
      window.__extractOptionsForFieldResult = encodeURIComponent(JSON.stringify({{ ok: false, message: window.__extractOptionsForFieldError, options: [] }}));
      window.__extractOptionsForFieldDone = true;
    }});

  return true;
}})()");

        for (var attempt = 0; attempt < OptionExtractionAttemptLimit; attempt++)
        {
            var rawDone = await _webView.EvaluateJavaScriptAsync("window.__extractOptionsForFieldDone ? 'true' : 'false'");
            var rawError = await _webView.EvaluateJavaScriptAsync("window.__extractOptionsForFieldError || ''");
            var error = NormalizeJavaScriptStringResult(rawError);
            if (!string.IsNullOrWhiteSpace(error))
            {
                await CloseOpenOptionPopupsAsync();
                return new WebViewOptionExtractionResult(false, error, [], false);
            }

            if (NormalizeJavaScriptStringResult(rawDone) == "true")
            {
                var rawResult = await _webView.EvaluateJavaScriptAsync("window.__extractOptionsForFieldResult || ''");
                await CloseOpenOptionPopupsAsync();
                return ParseOptionExtractionResult(field, rawResult);
            }

            await Task.Delay(OptionExtractionDelayMs);
        }

        await CloseOpenOptionPopupsAsync();
        return new WebViewOptionExtractionResult(false, "Timed out while extracting options for this field.", [], false);
    }

    public Task CloseOpenOptionPopupsAsync()
    {
        return CloseOpenOptionPopupsCoreAsync();
    }

    private async Task CloseOpenOptionPopupsCoreAsync()
    {
        await EnsureDetectorInjectedAsync();

        await _webView.EvaluateJavaScriptAsync(@"
(function () {
  window.__closeOpenOptionPopupsDone = false;
  window.__closeOpenOptionPopupsError = '';

  try {
    Promise.resolve(window.__closeOpenOptionPopups ? window.__closeOpenOptionPopups() : true)
      .then(function () {
        window.__closeOpenOptionPopupsDone = true;
      })
      .catch(function (error) {
        window.__closeOpenOptionPopupsError = error && error.stack ? error.stack : String(error);
        window.__closeOpenOptionPopupsDone = true;
      });
  } catch (error) {
    window.__closeOpenOptionPopupsError = error && error.stack ? error.stack : String(error);
    window.__closeOpenOptionPopupsDone = true;
  }

  return true;
})()");

        for (var attempt = 0; attempt < OptionExtractionAttemptLimit; attempt++)
        {
            var rawDone = await _webView.EvaluateJavaScriptAsync("window.__closeOpenOptionPopupsDone ? 'true' : 'false'");
            if (NormalizeJavaScriptStringResult(rawDone) == "true")
            {
                return;
            }

            await Task.Delay(OptionExtractionDelayMs);
        }
    }

    public async Task<string> GetCurrentPageClassificationAsync()
    {
        try
        {
            var rawClassification = await _webView.EvaluateJavaScriptAsync(
                "JSON.stringify(window.__classifyPage ? window.__classifyPage() : { classification: 'unsupported', reason: 'No classifier available.', evidence: {} })");

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
            var rawCapability = await _webView.EvaluateJavaScriptAsync("encodeURIComponent(JSON.stringify(window.__scanCapability || {}))");
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
        await _webView.EvaluateJavaScriptAsync($@"
(function () {{
  const element = document.querySelector({selector});
  if (!element) {{
    return false;
  }}

  element.scrollIntoView({{ block: 'center', inline: 'nearest', behavior: 'smooth' }});
  if (typeof element.focus === 'function') {{
    element.focus();
  }}

  const previousOutline = element.style.outline;
  const previousBoxShadow = element.style.boxShadow;
  element.style.outline = '3px solid #229ED9';
  element.style.boxShadow = '0 0 0 4px rgba(34, 158, 217, 0.24)';
  window.setTimeout(function () {{
    element.style.outline = previousOutline;
    element.style.boxShadow = previousBoxShadow;
  }}, 1600);

  return true;
}})()");
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
        await _webView.EvaluateJavaScriptAsync($@"
(function () {{
  window.__fillFieldOptionResult = '';
  window.__fillFieldOptionError = '';
  window.__fillFieldOptionDone = false;
  if (!window.__fillFieldOption) {{
    window.__fillFieldOptionResult = encodeURIComponent(JSON.stringify({{ ok: false, message: 'fill option script missing' }}));
    window.__fillFieldOptionDone = true;
    return true;
  }}

  Promise.resolve(window.__fillFieldOption({selector}, {optionJson}, {fillStrategy}))
    .then(function (result) {{
      window.__fillFieldOptionResult = encodeURIComponent(JSON.stringify(result || {{ ok: false, message: 'empty fill result' }}));
      window.__fillFieldOptionDone = true;
    }})
    .catch(function (error) {{
      window.__fillFieldOptionError = error && error.stack ? error.stack : String(error);
      window.__fillFieldOptionResult = encodeURIComponent(JSON.stringify({{ ok: false, message: window.__fillFieldOptionError }}));
      window.__fillFieldOptionDone = true;
    }});

  return true;
}})()");

        for (var attempt = 0; attempt < 20; attempt++)
        {
            var rawDone = await _webView.EvaluateJavaScriptAsync("window.__fillFieldOptionDone ? 'true' : 'false'");
            var rawResult = await _webView.EvaluateJavaScriptAsync("window.__fillFieldOptionResult || ''");
            var rawError = await _webView.EvaluateJavaScriptAsync("window.__fillFieldOptionError || ''");
            var error = NormalizeJavaScriptStringResult(rawError);
            if (!string.IsNullOrWhiteSpace(error))
            {
                return new WebViewFillResult(false, error);
            }

            if (NormalizeJavaScriptStringResult(rawDone) == "true")
            {
                await ResetWebViewAfterFillAsync();
                return ParseFillResult(rawResult);
            }

            await Task.Delay(100);
        }

        var timeoutResult = new
        {
            ok = false,
            message = "Timed out while selecting captured option."
        };
        var rawTimeoutResult = Uri.EscapeDataString(JsonSerializer.Serialize(timeoutResult));
        return ParseFillResult(rawTimeoutResult);
    }

    public async Task ClearFieldHighlightAsync(DetectedField field)
    {
        var selector = JsonSerializer.Serialize(field.Selector);
        await _webView.EvaluateJavaScriptAsync($@"
(function () {{
  const element = document.querySelector({selector});
  if (element) {{
    element.style.outline = '';
    element.style.boxShadow = '';
    if (typeof element.blur === 'function') {{
      element.blur();
    }}
  }}

  if (document.activeElement && typeof document.activeElement.blur === 'function') {{
    document.activeElement.blur();
  }}

  return true;
}})()");
    }

    public async Task<string> GetEncodedScanDebugJsonAsync()
    {
        var rawDebugJson = await _webView.EvaluateJavaScriptAsync("encodeURIComponent(JSON.stringify(window.__scanDebug || {}))");
        return Uri.UnescapeDataString(rawDebugJson ?? "{}");
    }

    public async Task EnsureFillScriptInjectedAsync()
    {
        if (_fillScriptInjected)
        {
            return;
        }

        await EnsureDomSharedInjectedAsync();

        _fillScript ??= await LoadAndroidAssetAsync("fill.js");
        if (string.IsNullOrWhiteSpace(_fillScript))
        {
            throw new InvalidOperationException("fill.js was not packaged with the app.");
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
        await _webView.EvaluateJavaScriptAsync($@"
(function () {{
  window.__fillFieldResult = '';
  window.__fillFieldError = '';
  window.__fillFieldDone = false;
  if (!window.__fillField) {{
    window.__fillFieldResult = encodeURIComponent(JSON.stringify({{ ok: false, message: 'fill script missing' }}));
    window.__fillFieldDone = true;
    return true;
  }}

  Promise.resolve(window.__fillField({selector}, {value}, {fillStrategy}))
    .then(function (result) {{
      window.__fillFieldResult = encodeURIComponent(JSON.stringify(result || {{ ok: false, message: 'empty fill result' }}));
      window.__fillFieldDone = true;
    }})
    .catch(function (error) {{
      window.__fillFieldError = error && error.stack ? error.stack : String(error);
      window.__fillFieldResult = encodeURIComponent(JSON.stringify({{ ok: false, message: window.__fillFieldError }}));
      window.__fillFieldDone = true;
    }});

  return true;
}})()");

        for (var attempt = 0; attempt < 20; attempt++)
        {
            var rawDone = await _webView.EvaluateJavaScriptAsync("window.__fillFieldDone ? 'true' : 'false'");
            var rawResult = await _webView.EvaluateJavaScriptAsync("window.__fillFieldResult || ''");
            var rawError = await _webView.EvaluateJavaScriptAsync("window.__fillFieldError || ''");
            var error = NormalizeJavaScriptStringResult(rawError);
            if (!string.IsNullOrWhiteSpace(error))
            {
                await ResetWebViewAfterFillAsync();
                return new WebViewFillResult(false, error);
            }

            if (NormalizeJavaScriptStringResult(rawDone) == "true")
            {
                await ResetWebViewAfterFillAsync();
                return ParseFillResult(rawResult);
            }

            await Task.Delay(150);
        }

        await ResetWebViewAfterFillAsync();
        return new WebViewFillResult(false, "Timed out while filling this field.");
    }

    private Task ResetWebViewAfterFillAsync()
    {
        return _webView.EvaluateJavaScriptAsync(@"
(function () {
  if (window.__clearActiveFillState && typeof window.__clearActiveFillState === 'function') {
    try {
      return window.__clearActiveFillState();
    } catch (error) {
      // Fall through to a simple blur fallback.
    }
  }

  try {
    const active = document.activeElement;
    if (active && typeof active.blur === 'function') {
      active.blur();
    }

    const body = document.body || document.documentElement;
    if (body && typeof body.focus === 'function') {
      body.focus();
    }

    return true;
  } catch (error) {
    return false;
  }
})()");
    }

    private async Task EnsureDomSharedInjectedAsync()
    {
        if (_domSharedInjected)
        {
            return;
        }

        _domSharedScript ??= await LoadAndroidAssetAsync("dom-shared.js");
        if (string.IsNullOrWhiteSpace(_domSharedScript))
        {
            throw new InvalidOperationException("dom-shared.js was not packaged with the app.");
        }

        await _webView.EvaluateJavaScriptAsync(_domSharedScript);
        _domSharedInjected = true;
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
}
