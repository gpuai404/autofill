# Job Autofill

A .NET MAUI Android-first application for scanning job application forms, matching values from a user profile, and reviewing autofill actions before the user submits the form manually.

## Structure

- `src/JobAutofill.App` — MAUI pages, view models, WebView runtime adapter, and Android integration
- `src/JobAutofill.Core` — autofill workflow, local matching, API decision contracts, approval handling, and fill-command planning
- `src/JobAutofill.Domain` — platform-neutral models, metadata contracts, and browser control rule contracts
- `src/JobAutofill.Infrastructure` — concrete API clients, persistence, and external adapters
- `src/JobAutofill.Telemetry` — telemetry and analytics hooks
- `docs/` — architecture decisions and project documentation

## Current status

The repository is structured as a real-world MAUI app skeleton aligned with .NET 10 practices, with Android-first delivery and future cross-platform adoption in mind.
