# Scan flow

This document describes the actual scan pipeline used by the Android WebView in the app.

## 1) Navigation and page load

The page opens with `UrlWebViewSource` and handles two browser events:

- `OnWebViewNavigating`: resets scan/fill flags and status
- `OnWebViewNavigated`: verifies `WebNavigationResult.Success`, then injects the detector script

Relevant flow in:
- `src/JobAutofill.App/Pages/JobBrowserPage.xaml.cs`

Step-by-step:

1. `OpenJob(...)` sets `JobWebView.Source = new UrlWebViewSource { Url = jobPost.Url }`
2. `OnWebViewNavigating` clears `_detectorInjected` and `_fillScriptInjected`
3. `OnWebViewNavigated` calls `EnsureDetectorInjectedAsync()`
4. `EnsureDetectorInjectedAsync()` loads:
   - `runtime/capability-probe.js`
   - `scanner/detector.js`
   - `scanner/field-control-rules.json`
5. The app executes one JavaScript block:

```javascript
window.__fieldControlRules = { ...json... };
// detector.js body
```

That means the page receives the generic browser behavior rules before scanning starts.

## 2) Injection contract

The detector script expects this global:

```javascript
window.__fieldControlRules
```

The app creates it from:

- Android asset `field-control-rules.json`
- Source file `src/JobAutofill.App/Platforms/Android/Scripts/scanner/field-control-rules.json`

## 3) Rules JSON shape

The app loads a rules file that describes how the detector should classify DOM controls:

```json
{
  "schemaVersion": 3,
  "fieldSelectors": ["input:not([type=\"hidden\"])", "textarea", "select"],
  "controlTypes": [
    {
      "controlType": "select",
      "family": "choice",
      "fillStrategy": "setNativeSelectValue",
      "valuePolicy": "mustMatchCapturedOption",
      "requiresCapturedOption": true
    }
  ]
}
```

This JSON tells the detector which selectors to examine and what behavior to apply for each control type.

## 4) Scan execution

After injection, the app calls:

```csharp
var rawResult = await ScanFieldsAsync();
```

`ScanFieldsAsync()` executes:

```javascript
(function () {
  window.__scanFieldsResult = '';
  window.__scanFieldsError = '';
  window.__scanFieldsDone = false;

  Promise.resolve(window.__scanFields())
    .then(function (fields) {
      window.__scanFieldsResult = encodeURIComponent(JSON.stringify(fields || []));
      window.__scanFieldsDone = true;
    })
    .catch(function (error) {
      window.__scanFieldsError = error && error.stack ? error.stack : String(error);
      window.__scanFieldsResult = encodeURIComponent(JSON.stringify([]));
      window.__scanFieldsDone = true;
    });

  return true;
})()
```

Then the app polls until `window.__scanFieldsDone === true`.

## 5) Result shape

The detector returns a list of detected fields, with enough detail to support matching and fill planning:

```json
[
  {
    "selector": "#firstName",
    "label": "First name",
    "inputType": "text",
    "controlType": "text",
    "controlFamily": "text",
    "fillStrategy": "setNativeValue",
    "requiresCapturedOption": false,
    "options": []
  }
]
```

The .NET model for this is:
- `DetectedField`
- `DetectedFieldOption`

## 6) Architecture boundary and unsupported states

The app separates the concerns cleanly:

- page lifecycle: WebView navigation and JS injection
- rules layer: browser behavior and field classification policy
- detector script: actual DOM scanning and field extraction

Site-specific metadata is intentionally not bundled. If real scan failures prove metadata is needed later, it should be added as a remote service/config layer rather than a local placeholder file.

### Page-level unsupported vs field-level unsupported

These are intentionally separate states:

- Unsupported page:
  - the page itself is not a valid target for the current strategy
  - examples: login/auth gates, unsupported page shells, unsupported frame contexts
  - behavior: exit before meaningful scan/fill logic

- Unsupported field:
  - the page is valid, but a specific field or control cannot be safely autofilled
  - examples: file inputs, custom widgets, unsupported JS-only controls
  - behavior: field remains visible in the scan result and is marked for review/manual handling

This separation matters because one page may still be usable while a subset of fields are not.

### Metadata service remains deferred

Generic scanning remains the default production path:

- `field-control-rules.json` handles generic DOM/control behavior
- Core local matching handles obvious profile fields
- the field-decision API handles unresolved, ambiguous, choice, or free-text fields
- any future website metadata should be remotely updateable and driven by observed failures

See `docs/scanner-capability-matrix.md` before adding new rule keys or control types.
