# Production flow

The production pipeline is:

```text
WebView scan
-> local profile match for obvious fields
-> API decision for unresolved, choice, ambiguous, or free-text fields
-> user approval
-> approved fill commands
-> WebView fill
```

## Layer responsibilities

- `JobAutofill.App`: MAUI UI, page state, WebView adapter usage, and user approval actions.
- `JobAutofill.Core`: use-case flow, local matching, API decision contracts, approval item creation, and fill-command creation.
- `JobAutofill.Domain`: platform-neutral profile and field models.
- `JobAutofill.Infrastructure`: concrete API, persistence, and telemetry adapters.

## Approval rule

A field that has a proposed value is not automatically fillable. It first becomes an approval item.

Only approved fields can become fill commands. This keeps the API/local matcher from directly mutating third-party job forms.

## API decision contract

Choice controls must send their extracted options to the API. The API should return selected option values from the captured set.

Free-text controls may return proposed text, but the user must approve it before fill.
