# Job Autofill

`JobAutofill` is a `.NET MAUI` Android-first app for helping users complete job application forms inside an in-app `WebView`.

The app opens a third-party job page, applies site-specific metadata when that website is known, falls back to a generic scanner when it is not, matches fields against a user profile, lets the user review the proposed values, and fills approved values back into the form. The user still reviews the page and submits the application manually.

## Project Overview

The solution is organized into a few clear layers:

- `src/JobAutofill.App` - MAUI UI, WebView integration, Android browser scripts, pages, and view models
- `src/JobAutofill.Core` - scan-to-approval workflow, local matching, API decision contracts, and fill planning
- `src/JobAutofill.Domain` - shared models such as profile, detected fields, options, and fill commands
- `src/JobAutofill.Infrastructure` - persistence and API client implementations
- `src/JobAutofill.Telemetry` - telemetry hooks
- `tests/JobAutofill.ScannerFixtures` - browser fixture coverage for scanner and fill behavior

## Core Flow

1. Open a job posting inside the app WebView.
2. Resolve website metadata for known sites, or fall back to the generic browser rules.
3. Scan the page for fillable fields.
4. Match obvious fields locally from the saved profile.
5. Send unresolved or ambiguous fields to an API decision layer when needed.
6. Show proposed values for user approval.
7. Fill only approved values back into the page.
8. Leave final form review and submission to the user.

## Features

- Android-first MAUI application structure with room for future iOS work
- In-app WebView workflow for third-party job application pages
- Website-aware metadata resolution for supported sites
- Generic field scanning fallback for sites without metadata
- Profile-based matching for obvious values
- API-assisted decisions for unresolved, ambiguous, free-text, and option-driven fields
- Approval-first fill flow so the app does not mutate forms without user confirmation
- Structured fill strategies for text inputs, selects, radios, checkboxes, and supported combobox patterns
- Separation between unsupported pages and unsupported fields
- Fixture-based scanner tests for browser behavior growth

## Current Direction

The current codebase is built around two paths: a metadata-driven path for websites we know about and a generic engine for websites we do not. The main product goal is still safe, reviewable autofill for job applications rather than one-click submission automation.
