# Scanner Capability Matrix

The scanner/filler stack should grow by implemented capability, not by vague rule names.

## Runtime Script Layout

```text
src/JobAutofill.App/Platforms/Android/Scripts/
  runtime/
    dom-shared.js
    capability-probe.js
  scanner/
    detector.js
    field-control-rules.json
  filler/
    fill.js
```

`field-control-rules.json` should describe only behavior supported by `detector.js` and `fill.js`.
If a rule names a control type, option source, extraction action, or fill strategy, there must be matching runtime code and fixture coverage.

## Current Capabilities

| Capability | Scanner | Filler | Status | Notes |
| --- | --- | --- | --- | --- |
| Native text-like inputs | Generic DOM/ARIA scan | Native value setter | Supported | Includes text, email, phone, url, number, date-like, search, color, range. |
| Textarea | Generic DOM scan | Native value setter | Supported | Free-text profile/API values. |
| Contenteditable textbox | Generic DOM/ARIA scan | Contenteditable setter | Supported | Rich text is treated as plain text for now. |
| Native select | Native options scan | Select by captured option | Supported | API/Core must select from captured options. |
| Native radio group | Grouped option scan | Click matching option | Supported | Uses captured page options. |
| Checkbox boolean | Generic DOM scan | Set checked state | Supported | Standalone boolean fields only. |
| Checkbox groups | Grouped option scan | Click matching option | Partial | Selection mode can be ambiguous and should fall back to user/API decision. |
| ARIA/listbox combobox | Static + open-popup option scan | Open popup and select captured option | Supported | Editable combobox can fall back to typed text when safe. |
| ARIA/grid combobox | Static + open-popup grid option scan | Open popup and select captured option | Partial | Works for visible/selectable rows/cells; virtualized grids need fixtures before broadening. |
| File upload | Detection only | None | Manual | In-page JavaScript cannot set file paths safely. |
| Password/sensitive manual fields | Detection only | Skip | Manual | Requires explicit user handling. |
| Dialog picker | Detection as popup-like control only | None | Gap | Do not add runtime JSON rules until dialog option extraction and fill handlers exist. |
| Tree picker | Detection as popup-like control only | None | Gap | Do not add runtime JSON rules until tree option extraction and fill handlers exist. |
| Cross-origin iframe fields | Capability probe reports limits | None | Gap | Android WebView cannot inspect cross-origin frame DOM from the page context. |
| Closed shadow DOM | Capability probe reports limits | None | Gap | Closed roots are intentionally inaccessible. |

## API Context

`POST /api/field-decisions` receives:

- Page URL and host.
- Optional page locale and country hint.
- Scanner capability report from the app.
- Normalized detected fields.
- Profile data.

The API should decide unresolved fields using the facts already captured by the WebView. It should not scrape the page or invent invisible options. If scanner capability is partial or a field needs uncaptured options, the API should return a decision that keeps user approval/manual input in the loop.

## Adding A Capability

1. Add a representative fixture under `tests/JobAutofill.ScannerFixtures/fixtures`.
2. Add expected scan/fill behavior under `tests/JobAutofill.ScannerFixtures/expected`.
3. Implement scanner extraction in `detector.js`.
4. Implement fill behavior in `fill.js` when the capability is fillable.
5. Add or adjust `field-control-rules.json` only after runtime support exists.
6. Update this matrix from `Gap` or `Partial` to the new status.
