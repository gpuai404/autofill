# Fill flow

This document describes the actual fill pipeline used by the app after a field has been matched and approved.

## 1) Fill trigger

After a scan and local/API decision pass, the app builds a list of fields that can be approved. Only approved fields enter the fill pipeline:

- user approval per field
- `OnFillClicked(...)`
- `FillMatchedFieldAsync(field)`
- `FillFieldAsync(field)`
- `FillFieldOptionAsync(field, option)`

The MAUI interaction logic is in:
- `src/JobAutofill.App/Pages/JobBrowserPage.xaml.cs`

The approval and fill-command planning contracts are in:
- `src/JobAutofill.Core`

## 2) Injection step

Before filling, the app ensures the fill script is injected once:

```csharp
await EnsureFillScriptInjectedAsync();
```

`EnsureFillScriptInjectedAsync()` loads the bundled `fill.js` asset, sourced from `src/JobAutofill.App/Platforms/Android/Scripts/filler/fill.js`, and executes it in the WebView:

```csharp
_fillScript ??= await LoadAndroidAssetAsync("fill.js");
await JobWebView.EvaluateJavaScriptAsync(_fillScript);
_fillScriptInjected = true;
```

This registers browser-side functions like:

- `window.__fillField(...)`
- `window.__fillFieldOption(...)`
- `window.__clearActiveFillState()`

## 3) Fill contract

The web script is designed to accept a selector and a value and return a structured result:

```javascript
{
  ok: true,
  selector: "#firstName",
  value: "Jane",
  message: "Input filled.",
  details: {
    tag: "INPUT",
    type: "text",
    before: "",
    after: "Jane"
  }
}
```

The app calls it like this:

```csharp
var rawResult = await JobWebView.EvaluateJavaScriptAsync(
    $"encodeURIComponent(JSON.stringify(window.__fillField ? window.__fillField({selector}, {value}) : {{ ok: false, message: 'fill script missing' }}))"
);
```

Then it parses the result via `ParseFillResult(...)`.

## 4) Fill decision tree

The app decides what to do based on the approved field model:

1. If the field is not approved:
   - skip it
2. If no value exists:
   - return `No value was matched for this field.`
3. If the field has matched options:
   - process each option via `FillFieldOptionAsync(...)`
4. If the field requires a captured option:
   - block fill until review is complete
5. Otherwise:
   - call `FillFieldAsync(...)`

This is the key protection layer before mutation of the page.

## 5) Option-based fill

For selects, comboboxes, radios, and other captured-option controls, the app fills by option rather than raw value:

```csharp
var fillResult = await FillFieldOptionAsync(field, option);
```

This is used when the browser needs to:

- open an option popup
- choose a matching selection
- then confirm it with DOM events

## 6) Reset and cleanup

After a fill attempt, the app resets browser focus state:

```csharp
await ResetWebViewAfterFillAsync();
```

This calls `window.__clearActiveFillState()` if available, otherwise it blurs the active element and refocuses the body.

This prevents stale focus, open popup state, and leftover keyboard state from breaking later fills.

## 7) Fill result JSON structure

The browser returns a standard result object:

```json
{
  "ok": true,
  "selector": "#country",
  "value": "US",
  "message": "Select filled.",
  "details": {
    "tag": "SELECT",
    "type": "",
    "before": "",
    "after": "US"
  }
}
```

For failures:

```json
{
  "ok": false,
  "selector": "#email",
  "value": "jane@example.com",
  "message": "Element not found.",
  "details": {}
}
```

## 8) Browser behavior rules

The fill script handles the main control families:

- text inputs
- textarea
- standalone checkbox boolean
- radio / checkbox groups with captured options
- select
- combobox / popup-based controls
- file input is rejected intentionally

The script intentionally avoids unsupported cases and returns a structured failure instead of breaking page behavior.

## 9) Page unsupported vs field unsupported

These remain separate states in the real flow:

- Unsupported page:
  - the page cannot be scanned meaningfully with the current strategy
  - the system should stop before fill attempts
  - no fill execution should be attempted on a page-level unsupported target

- Unsupported field:
  - the page is valid and the field was detected
  - the field is not safely autofillable with the current behavior
  - the field is left in review or marked as unsupported in page JavaScript

This distinction is already represented in the app flow through `RequiresManualReview` and the `unsupportedInPageJavaScript` strategy in the rules JSON.

## 10) JSON fill data flow remains the contract

The fill path is intentionally structured as a JSON contract rather than direct imperative state changes:

1. scan result produces a field model
2. the model gets a matched value or a build-fill plan
3. a `fillStrategy` is chosen from the field metadata or rules payload
4. the browser script executes the DOM mutation
5. the script returns a structured JSON result
6. the app validates success, review state, or unsupported behavior

That keeps the browser mutation logic isolated and makes the page behavior predictable.

## 11) Why this flow is safe

This flow keeps the browser mutation logic isolated from app logic:

- page decides which fields are eligible
- script decides how to mutate the DOM
- app only validates result status and continues
- browser-side cleanup prevents focus leakage between fills
- unsupported pages and unsupported fields are handled separately

This is the correct structure for a WebView-based autofill app: the app orchestrates, the browser script executes the DOM mutation, and the result is treated as an operation result rather than a direct imperative state change.
