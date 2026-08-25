# Job Autofill — Project Structure

**Platform:** Android (first release). iOS planned, not started.

## System Overview

A .NET MAUI Android app that opens a URL inside an in-app WebView — typically a third-party ATS job page (Workday, Greenhouse, and similar), but the app is not restricted to a fixed set of sites. It detects fillable form fields on whatever page loads, classifies them against a user-maintained profile via a backend ML endpoint, and fills approved values back into the page. The user reviews and submits manually.

## Prerequisites Before Development Starts

1. **Field decision endpoint contract.** Request/response shape for `IApiFieldDecisionClient` — unresolved or ambiguous detected fields are sent after local matching, and the API returns a fill/skip/block decision plus any selected captured options.
2. **Profile persistence format.** Concrete schema and storage choice (SQLite table design vs. serialized `Preferences`) for `Profile`.
3. **Review screen UX.** Separate page after scan, or an overlay on the live WebView? Decides whether `WebViewCompat.addWebMessageListener` (deferred in ADR-0001) needs to move into Tier 1.
4. **Error/retry behavior.** What Tier 1 does when the classification call fails or times out.

## Solution / Folder Structure

```
JobAutofill.sln
├── src/
│   ├── JobAutofill.App/                  # .NET MAUI app project
│   │   ├── Platforms/
│   │   │   ├── Android/
│   │   │   │   ├── Handlers/             # WebViewHandler.Mapper.AppendToMapping customizations
│   │   │   │   └── Scripts/              # runtime, scanner, and filler browser assets
│   │   │   └── iOS/                      # placeholder — not yet implemented
│   │   ├── Pages/                        # JobBrowserPage and other navigable pages
│   │   ├── Views/                        # Supporting pages/views such as ProfileEditor and JobsList
│   │   ├── ViewModels/                   # MVVM view models
│   │   └── Resources/
│   ├── JobAutofill.Core/                  # Workflow, local matching, API decision contracts, approval/fill planning
│   ├── JobAutofill.Domain/               # Platform-agnostic shared layer
│   │   ├── Models/                       # Profile, DetectedField, ApprovalItem, FillCommand
│   │   └── Rules/                        # Browser control rule contracts
│   ├── JobAutofill.Infrastructure/       # API client, persistence
│   │   ├── Api/                          # Refit interfaces + NSwag-generated client (Tier 3)
│   │   └── Persistence/                  # Local profile storage
│   └── JobAutofill.Telemetry/            # Structured telemetry (Tier 3)
├── tests/
│   └── JobAutofill.Tests/                # Unit test suite (Tier 3)
└── docs/
    ├── project-structure.md              # this document
    ├── adr-0001-webview-strategy.md      # WebView & autofill architecture decision
    └── decision-log.md                   # D1, D2, D3...
```

`JobAutofill.Domain` contains no Android- or iOS-specific types. That boundary is what lets iOS be added later without reworking the scan/classify/fill logic.

## §1 Core Flow — End-to-End (Tier 1)

**A. App startup — once, before any WebView exists**
1. `MauiProgram.cs` calls `WebViewHandler.Mapper.AppendToMapping("InjectDetectorScript", ...)`. This registers a delegate against the `WebViewHandler` type globally; it does not run yet.

**B. WebView instance created — once per `JobBrowserPage` shown**
2. MAUI creates the native `Android.Webkit.WebView` and connects the handler. Because `"InjectDetectorScript"` is a custom key, the delegate from step 1 fires exactly once here, before any navigation occurs.
3. **Runtime script is set here.** Inside that delegate: check `WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)`.
   - **Supported:** call `WebViewCompat.addDocumentStartJavaScript(...)` with the shared runtime script packaged from `Platforms/Android/Scripts/runtime/dom-shared.js`.
   - **Unsupported:** the regular bridge still injects the shared runtime after navigation.

**C. User navigates**
4. User provides a URL (any URL — not restricted to specific sites) and the WebView's `Source` is set, triggering navigation.
5. On the `Navigated` event, the app injects `capability-probe.js`, `field-control-rules.json`, and `detector.js`.

**D. Scan**
6. The app calls `window.__scanFields()` and receives normalized browser facts: selector, label, control metadata, option metadata, capability status, and source URL.

**E. Classify**
7. `FieldApprovalWorkflow` locally resolves obvious fields first, then `IApiFieldDecisionClient` sends unresolved, ambiguous, choice, or free-text fields to the backend field decision endpoint.

**F. Review**
8. Classified fields render on the Review screen (or overlay — Prerequisite #3, not yet decided). User confirms, edits, or manually fills anything unmapped.

**G. Fill**
9. **Fill script is set here.** For each approved `FillCommand`, the app calls `EvaluateJavaScriptAsync` with `fill.js` packaged from `Platforms/Android/Scripts/filler/fill.js`, targeting the field's selector, value, or selected captured options. The script returns a structured result.

**H. Submit**
10. User reviews the filled page inside the WebView and submits manually; the app does not auto-submit.

## §2 Data Model

| Model | Fields |
|---|---|
| `Profile` | Contact info, work authorization, EEO responses, documents, free-text answers |
| `DetectedField` | `Selector`, `Label`, `InputType`, `SourceUrl` |
| `ApprovalItem` | `DetectedField` + matched attribute, proposed value/options, status, reason |
| `FillCommand` | approved selector/value/options/fill strategy for browser execution |

## §3 Tiered Build Plan

- **Tier 1 — Core WebView Pipeline.** Everything in §1, proven on a physical Android device against real Workday/Greenhouse pages before anything below is built.
- **Tier 2 — Not yet defined.** Do not implement anything under Tier 2 without first scoping it here.
- **Tier 3 — Deferred until Tier 1 is proven.** Generated Refit/NSwag API client, structured telemetry, full unit test suite.

## §4 WebView & Autofill Architecture

See `adr-0001-webview-strategy.md` for the full decision, alternatives considered, and platform roadmap.

**Summary:** plain Android `WebView`, one-shot `EvaluateJavaScriptAsync` for scan/fill, `addDocumentStartJavaScript` for SPA-timing correctness, native customization via `WebViewHandler.Mapper.AppendToMapping`. Autofill Framework and HybridWebView both ruled out as wrong-shaped for this problem.

## Decision Log

### D3 — Android Autofill Framework: considered, declined
Covers only standardized fields, requires exclusive system-default autofill status, doesn't remove the need for the scan → classify → review loop for ATS-specific custom fields.

*(D1, D2: carry forward from prior project history if applicable.)*

## References

- [What's new in .NET MAUI for .NET 10](https://learn.microsoft.com/en-us/dotnet/maui/whats-new/dotnet-10?view=net-maui-10.0)
- [Build web apps in WebView — Android Developers](https://developer.android.com/develop/ui/views/layout/webapps/webview)
- [Chrome on Android: native third-party autofill services](https://android-developers.googleblog.com/2024/10/chrome-3p-autofill-services.html)
