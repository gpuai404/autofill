# Phase 1 Implementation Plan

Last updated: 2026-09-01

## Goal

Make the Android-first Phase 1 experience production-ready end-to-end:

1. The user can open a posting from a curated list or by pasting a link.
2. The app can decide whether the host is allowed, enrich the posting when needed, and load it in the in-app browser.
3. The WebView can resolve known-site metadata first and fall back to generic scanning when needed.
4. The app can propose values from profile data, escalate unresolved fields to a real decisioning API, and let the user approve before any fill happens.
5. The app can persist profile and session data through real storage boundaries and emit telemetry for the core funnel.

This plan is intentionally implementation-focused and avoids code-level detail.

## Scope

Phase 1 includes:

- Android app shell and in-app WebView flow
- Profile creation, editing, retrieval, and sync
- Resume import integration
- Jobs list entry path
- Paste-a-link entry path
- Compliance deny-list check before load
- Known-site metadata path plus generic scanner fallback
- Field-value decisioning API integration
- Review-and-approve fill flow
- Telemetry on the core journey

Phase 1 excludes:

- Premium tracking board
- Push reminders
- Subscription billing
- AI writing and match scoring
- Multi-profile premium variants

## Target architecture

Use a strict layered split:

- `JobAutofill.App`
  UI, navigation, page lifecycle, WebView orchestration, state presentation
- `JobAutofill.Core`
  Use cases, workflow orchestration, scan-to-approval rules, fill planning
- `JobAutofill.Domain`
  Stable business models, enums, policies, consent and profile concepts
- `JobAutofill.Infrastructure`
  API clients, persistence, secure storage, metadata sources, telemetry adapters

The app layer should not own business truth. It should call use cases and render results.

## Implementation order

Build in this order so each later feature has the dependencies it needs.

### 1. Stabilize domain boundaries

Define the models the rest of the system depends on before wiring more services.

#### Build

- Separate `Profile` into:
  - core identity and contact data
  - job preference data
  - resume metadata
  - custom answers
  - sensitive-category data
  - consent and autofill policy for sensitive data
- Add a `JobPosting` model that represents enriched posting data independently from the live WebView page.
- Add a lightweight `ApplicationContext` or `AutofillSession` model to carry:
  - source entry path
  - posting URL
  - enriched posting data if available
  - compliance result
  - metadata resolution result
  - scan result summary
- Add explicit models for:
  - user session
  - profile sync result
  - deny-list check result
  - site metadata resolution result
  - telemetry event payloads

#### Why first

Current implementation mixes demo profile state and autofill logic too closely. Phase 1 needs stable contracts before storage and APIs can be made real.

### 2. Define the production service contracts

Once domain models are stable, define the interfaces that represent real dependencies.

#### Build

- `IAuthSessionClient`
  - restore session
  - sign in
  - sign out
- `IProfileSyncClient`
  - fetch profile
  - update profile
  - upload resume reference
- `IResumeParsingClient`
  - submit resume
  - fetch parsed result
- `IJobsFeedClient`
  - fetch jobs by user preference
- `IPostingEnrichmentClient`
  - enrich raw URL into normalized posting data
- `ICompliancePolicyClient`
  - check whether a host is allowed before opening
- `ISiteMetadataProvider`
  - get host-specific metadata package or rules
- `IFieldDecisionClient`
  - send unresolved scanned fields and return decisions
- `ITelemetrySink`
  - record funnel and field-level events

#### Database and storage operations to plan

- local secure storage for:
  - auth/session token
  - cached profile snapshot
  - local draft edits
  - consent flags
- remote persistence for:
  - canonical profile
  - resume file reference
  - user preferences
- optional local cache tables for:
  - recently opened postings
  - last-known jobs list
  - recent enrichment results

### 3. Replace demo state with app-state use cases

Before building new screens or flows, remove direct dependence on hardcoded in-memory state.

#### Build

- `LoadCurrentProfileUseCase`
- `SaveProfileUseCase`
- `SyncProfileUseCase`
- `LoadJobsFeedUseCase`
- `OpenPostingUseCase`
- `PrepareAutofillReviewUseCase`
- `ApplyApprovedFillUseCase`

#### Responsibilities

- View models call use cases only.
- Use cases compose repositories, clients, and workflow classes.
- `ProfileRepository` owns the current profile boundary, starting with local SQLite storage and later adding remote sync.

#### Why here

This is the step that makes later API and persistence work plug into the app cleanly without spreading network and storage logic through pages and view models.

### 4. Implement profile persistence and sync

This is the first real backend dependency because every autofill proposal relies on profile truth.

#### Data flow

1. App launch restores auth session from secure storage.
2. App fetches profile from local cache for instant UI.
3. App syncs profile from server in background.
4. Profile editor updates local draft state.
5. Save action writes locally first, then sends remote update, then refreshes cache.
6. Sensitive-category data is stored and updated through separate consent-aware paths.

#### Build

- local profile cache
- secure token storage
- repository merge rules between cache and remote
- separate storage path for sensitive data consent state
- profile editor validation rules
- offline-safe save state handling

#### Integration points

- `ProfileEditorPage` loads profile via use case
- `JobBrowserWorkflowService` reads current profile from the repository-backed session context
- navigation should block autofill if there is no valid profile

### 5. Implement the posting entry flows

Phase 1 has two first-class ways into a posting: jobs list and paste-a-link.

#### 5A. Jobs list flow

##### Data flow

1. User preferences are loaded from profile data.
2. Jobs list requests postings from `IJobsFeedClient`.
3. Results are cached locally for quick reload.
4. Selecting a posting creates an `OpenPostingRequest`.

##### Build

- jobs list use case
- jobs list cache
- jobs list refresh and error state handling

#### 5B. Paste-a-link flow

##### Data flow

1. User pastes a raw URL.
2. App validates URL format.
3. App calls compliance check on the host.
4. If allowed, app calls posting enrichment.
5. App creates an `OpenPostingRequest` with:
  - original URL
  - canonical URL if returned
  - enriched posting title and company if available

##### Build

- URL validation
- compliance gate
- posting enrichment client
- paste flow UI state for loading, denied, failed enrichment, and fallback success

#### Integration points

- navigation service needs a single route into browser regardless of entry path
- browser page should receive an `OpenPostingRequest`, not raw strings

### 6. Build the open-posting orchestrator

This is the connection point between entry flows and the WebView.

#### Build

- `OpenPostingUseCase` that performs:
  - compliance check
  - optional enrichment
  - duplicate local URL check
  - initial telemetry
  - navigation handoff
- `OpenPostingResult` model with:
  - allowed or denied
  - normalized posting data
  - warning state
  - browser target URL

#### Why this matters

Without this orchestration, the jobs list and paste flow will each grow their own half-logic and diverge.

### 7. Refactor WebView orchestration around a scan pipeline

This is the heart of Phase 1 and should be explicit.

#### Target pipeline

1. Browser page receives open-posting context.
2. WebView loads the target page.
3. App resolves known-site metadata for the host.
4. If metadata exists, scanner uses metadata-assisted path.
5. If metadata does not exist or fails, scanner uses generic path.
6. Scanner returns detected fields and capability report.
7. Core workflow matches local profile values.
8. Unresolved fields are sent to decisioning API.
9. Review list is built for the UI.
10. User approves selected fields.
11. Fill planner generates fill commands.
12. WebView bridge injects fill commands.

#### Build

- `IPageScanOrchestrator`
- `IScanStrategyResolver`
- `MetadataBackedScannerStrategy`
- `GenericScannerStrategy`
- `WebViewBridge` request and response contracts that distinguish:
  - load state
  - metadata resolution state
  - scan result
  - fill result

#### Integration with WebView

- navigation updates:
  - loading page
  - checking support
  - reading page
  - preparing suggestions
  - ready for review
  - filling approved fields
- WebView page service should not make business decisions; it should execute browser operations and return structured results.

### 8. Replace placeholder field decisioning with a real API integration

This is the most important missing production component in the current code.

#### Data flow

1. Local matcher processes every normalized field.
2. Fields marked unresolved or ambiguous are batched.
3. Decision API receives:
  - page URL and host
  - enriched posting context when available
  - unresolved fields and options
  - capability report
  - current non-sensitive profile context by default
  - sensitive context only when explicit consent allows it
4. API returns per-field actions:
  - fill text
  - propose text
  - select option
  - ask user
  - skip
  - block
5. Workflow merges API results back into approval items.

#### Build

- request mapper from domain fields to API contract
- response validator so unsupported options are downgraded safely
- timeout and retry policy
- graceful degradation when API fails
- telemetry around local match rate versus API-assisted rate

#### Important rule

Decisioning is advisory only. It never writes directly to the page. Approval still happens in the app.

### 9. Make review and approval a first-class UI state

The docs require the review step to be central, not incidental.

#### Build

- grouped approval list:
  - high-confidence core profile fields
  - unresolved fields needing user input
  - blocked or unsupported fields
  - sensitive-category fields
- batch-approve behavior for safe high-confidence items
- per-field edit, reject, and manual override behavior
- clear explanation text for why each proposal exists

#### Data updates

- edits made by the user can optionally feed:
  - current fill request only
  - profile update suggestion later
- approval decisions should be captured for telemetry

#### Integration points

- `JobBrowserViewModel` should hold review state, not only a flat field list
- browser page should stay synchronized with approval status and fill availability

### 10. Finalize fill execution and verification

The last mile must be reliable and observable.

#### Build

- fill command generation from approved items
- command execution through WebView bridge
- result mapping for:
  - filled
  - skipped
  - not found
  - failed interaction
- post-fill UI summary

#### WebView integration details

- injection should operate only on approved commands
- bridge responses should include enough result detail to explain failures in UI and telemetry
- unsupported controls should remain review-visible even if they cannot be filled

### 11. Add telemetry for the whole funnel

Telemetry is part of Phase 1, not cleanup work for later.

#### Events to emit

- app launch
- session restored
- profile loaded
- profile save attempted and completed
- jobs list requested and loaded
- paste link requested
- compliance allowed or denied
- posting enrichment succeeded or failed
- browser page loaded
- metadata matched or not found
- scan started and completed
- field counts by category
- local match count
- API decision count
- approval count
- edit and reject count
- fill started and completed

#### Why now

Without telemetry, Phase 1 cannot prove whether the mechanic is actually useful.

### 12. Add local history and minimal duplicate warning

This is a small but useful Phase 1 support feature.

#### Build

- local store of visited posting URLs
- canonical URL comparison when enrichment provides a normalized URL
- simple warning banner if the user already opened the same posting

#### Why late in the sequence

It depends on posting open orchestration and enriched posting data, but it should stay simple in Phase 1.

## How the pieces connect

## End-to-end data flow

1. User launches app.
2. Session is restored from secure storage.
3. Profile is loaded from cache and synced from backend.
4. User opens a posting from jobs list or paste-a-link.
5. Compliance check runs before browser navigation.
6. Posting enrichment runs for pasted or ambiguous URLs and returns normalized job data.
7. Navigation opens browser page with an `OpenPostingRequest`.
8. WebView loads page and resolves known-site metadata.
9. Scanner produces detected fields plus capability report.
10. Core workflow normalizes fields and attempts local profile matching.
11. Unresolved fields are sent to field decisioning API.
12. Approval items are built and shown in UI.
13. User approves, edits, or rejects values.
14. Approved items become fill commands.
15. WebView bridge injects commands into the live page.
16. Fill results and user actions are recorded in telemetry.

## Key components by responsibility

### App layer

- pages
- view models
- navigation service
- browser status service
- WebView bridge and browser page service

### Core layer

- profile-oriented use cases
- posting open use case
- scan orchestration use case
- field approval workflow
- fill command planner
- domain policies around consent and approval

### Infrastructure layer

- API clients
- local cache repositories
- secure storage adapter
- metadata provider
- telemetry adapter

## Near-term class and function direction

These do not need to be built all at once, but they should guide refactoring.

- `ProfileAggregate` or equivalent domain model split
- `SensitiveProfileData` and `SensitiveDataConsentPolicy`
- `OpenPostingUseCase`
- `LoadJobsFeedUseCase`
- `EnrichPostingUseCase`
- `CheckComplianceUseCase`
- `PrepareAutofillReviewUseCase`
- `ApplyApprovedFillUseCase`
- `PageScanOrchestrator`
- `ScanStrategyResolver`
- `RemoteProfileRepository`
- `CachedProfileRepository`
- `DecisionApiClient`
- `PostingEnrichmentClient`
- `CompliancePolicyClient`
- `TelemetryDispatcher`

## Suggested milestone sequence

### Milestone 1: Structural refactor

- stabilize domain models
- introduce production service interfaces
- move view models onto use cases
- remove hardcoded profile-as-truth behavior

### Milestone 2: Real profile lifecycle

- session restore
- local cache
- remote profile sync
- profile editor save flow
- sensitive data consent split

### Milestone 3: Posting open flows

- jobs feed integration
- paste-a-link integration
- compliance gate
- browser navigation contract

### Milestone 4: Scan and review productionization

- metadata-first scanner orchestration
- generic fallback
- real decisioning API
- grouped review UI

### Milestone 5: Fill reliability and telemetry

- fill result tracking
- full funnel telemetry
- duplicate warning
- release hardening and test coverage

## Testing and validation plan

Each milestone should ship with validation, not after it.

### Unit coverage

- domain policies
- profile merge rules
- decisioning response mapping
- approval workflow status rules
- fill command planning

### Integration coverage

- profile cache plus sync repository behavior
- posting open orchestration
- compliance and enrichment sequence
- decisioning fallback behavior

### Browser fixture coverage

- known-site metadata path
- generic fallback path
- fill success and partial failure cases
- unsupported control visibility

### Manual QA focus

- profile edits surviving app restart
- denied host behavior before browser load
- paste-a-link with and without enrichment success
- unresolved fields becoming user-review items rather than silent failures
- fill only touching approved fields

## Recommended first implementation task

Start with the structural refactor, not new UI:

1. split the current profile model into production-ready domain pieces
2. define the missing service interfaces and use cases
3. move app state access behind repository-backed use cases

That gives every later feature a clean place to land and prevents Phase 1 work from deepening the current demo-oriented structure.
