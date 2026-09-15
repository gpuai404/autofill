# Job-Application Autofill App — Product Blueprint

*A production, consumer-facing Android app, published by a recruitment company, that helps job seekers fill out job applications without retyping the same information into every posting. This document reasons from the problem and the constraints only — it doesn't assume or reference any prior draft, name, or codebase. Two shape decisions are treated as settled going in: the app is Android-first, and the core mechanic is a full scan → propose → review → approve → fill flow, not a lighter "just trust it" autofill. Everything below is reasoned from those two starting points, with the reasoning for both made explicit in Section 10.*

---

## 1. The API and services landscape

This comes first on purpose. For a product like this, the question that determines whether the build succeeds isn't "what does the screen look like" — it's "which parts of the experience require a live backend, why, and what does each one need to receive and return." Getting that wrong (discovering mid-build that a field the app can't handle locally has nowhere to escalate to, for instance) is expensive to fix after the fact. Everything from Section 2 onward assumes the services described here exist and behave as specified.

### 1.1 What deliberately stays on-device

Before listing backend services, it's worth being explicit about the one piece of this product that does *not* call an API: reading the live job-application page and figuring out what each field is asking for. That work happens entirely on the phone, inside the in-app browser. Three reasons all point the same direction:

- **Privacy.** The DOM of a third-party application page often already contains the user's typed-in name, résumé text, or a half-finished answer. Sending that to a server on every scan means a copy of the applicant's in-progress data leaves the device on a page that isn't even the app's own UI. Keeping detection local avoids that entirely.
- **Latency.** Field detection needs to feel close to instantaneous — a round trip to a server on every scan would turn the deliberate, visible "reading the page" moment into something that feels broken rather than honest.
- **No per-user state involved.** Detection logic is a set of rules and heuristics shipped with the app and updated on the normal release cadence. There's nothing to centralize.

Everything below this line *is* a real API, because each one either needs data the device doesn't have, needs to persist beyond a single session, or needs compute the device shouldn't be trusted or sized to do.

### 1.2 Identity & Profile Sync API
**Why it exists:** the free tier's core promise — "your profile survives losing your phone, reinstalling, or switching devices" — is by definition a server-side guarantee. There's no on-device-only way to keep a promise about what happens after the device is gone. It's also the anchor everything else depends on: no other service here is useful to a signed-out user.
**What it does:** account creation and login, profile CRUD, and resume-file storage (the file itself — parsing is a separate concern, below).
**Where it's used:** app launch (session restore), onboarding, the profile editor, and as the source of truth the field-decisioning and AI-writing APIs read from — both need the *current* profile, not a stale local copy.

### 1.3 Resume Parsing — vendor, not in-house
**Why it exists:** the entire point of resume import is that the user doesn't hand-type twenty fields — the resume does that work. Extracting structured data (work history, education, skills, dates) reliably across the range of real-world PDF and DOCX formats is a genuinely hard, well-trodden problem with mature vendors already solving it. Building a parser in-house means spending effort re-solving a solved problem instead of on the parts of this product that are actually novel.
**Where it's used:** once in the primary flow, onboarding step one, plus again any time a user uploads a new resume or a variant (multiple profile variants, premium).

### 1.4 Jobs-for-User API
**Why it exists:** this is the one place where being published by a recruitment company is a structural advantage, not just a branding one — the publisher plausibly already runs a jobs backend for its own recruiting business, and this app should sit on top of that rather than build a second job-search engine as a side project inside an autofill tool.
**What it does:** given a user's stored preferences (role, location/remote, seniority, salary floor), returns matching postings, paginated and refreshable.
**Where it's used:** the discovery list shown after the user sets preferences once during onboarding. The app's job here is presentation and hand-off into the browser — not search.

### 1.5 Posting Enrichment API (URL → structured job record)
**Why it's a different thing from 1.4:** pasting a link is the *other* first-class entry point — a user who found a role on LinkedIn, in an email, or on a site the jobs feed doesn't cover. A bare URL isn't useful for tracking, duplicate detection, or AI writing until it's turned into an actual record with a title, company, and description. This has to be a real fetch-and-parse service because job pages are arbitrary external HTML the app doesn't control.
**Where it's used:** the moment a link is pasted, before the browser even opens (so the app can show what it's about to load); the tracking board, so history shows real job data instead of raw URLs; and as the required input for AI writing — without a description, "tailor this to the posting" has nothing to work from.

### 1.6 Field-Value Decisioning API
**Why it exists:** the on-device matcher is deliberately simple and fast — good at "this label says 'phone number,' fill the phone number," not good at an oddly-worded screening question or a multi-select with options that don't cleanly map to anything in the profile. Rather than guessing (which breaks the "never overstate confidence" principle) or leaving every hard field blank (which defeats the app on exactly the applications where it would help most), a backend decisioning layer — almost certainly model-backed — takes a harder look using the page context, the field's captured options, and the profile.
**What it does:** takes the batch of fields the local matcher couldn't confidently resolve and returns a decision per field — a value, an option to select, "ask the user," or "can't help here." Always still routed through the same review-and-approve step as everything else; this API proposes, it never fills directly.
**Where it's used:** every scan, for whatever subset of fields the local matcher flags as unresolved. This is the single most load-bearing service in the whole system — the free tier's usefulness on unusual sites depends on it existing and actually working, not sitting behind a stub.

### 1.7 AI Writing & Match-Scoring API (premium)
**Why it's kept separate from 1.6:** field decisioning answers short, structured questions. This generates prose — a cover-letter paragraph, a "why this role" answer, a match score against a specific posting — a different task shape, a larger payload, and a premium-gated one, worth keeping architecturally distinct even if the same underlying model provider sits behind both.
**Where it's used:** the premium review flow, always as an editable draft the user can change or reject, never inserted and submitted as-is.

### 1.8 Application Tracking & Notification Backend
**Why it exists:** the pipeline board and follow-up reminders need to persist and need to fire even when the app isn't open — client-only state can't do either.
**What it does:** stores each tracked application's stage (Saved → Applied → Interviewing → Offer → Closed) and schedules follow-up nudges.
**Where it's used:** auto-logs every completed fill; powers the tracking board; triggers "it's been two weeks, want to follow up?" nudges.

### 1.9 Push Notification Delivery
**Why it exists:** standard infrastructure sitting behind 1.8 (Firebase Cloud Messaging, given Android-first) — worth naming explicitly so it isn't forgotten in estimation, not a separate architectural decision.

### 1.10 Duplicate & Near-Duplicate Detection
**Why this is a service and not a local check:** catching "you already opened this exact posting" is trivial to do locally with a URL match. Catching "this is the same role, reposted under a new listing ID at the same company" requires comparing against the user's *full* history and running similarity matching on company + role + description — that needs the server-side data 1.8 already has, so it's a natural extension of the tracking backend rather than a new subsystem.
**Where it's used:** the moment a posting is opened, from either entry path, before the scan starts.

### 1.11 Subscription Billing
**Why it exists:** gates the premium tier. Google Play Billing, given Android-first — this is what makes the premium pieces of 1.7–1.9 enforceable at all.

### 1.12 Telemetry & Analytics
**Why it exists from day one, not bolted on later:** every metric this product actually cares about — time-to-fill versus manual completion, field-approved-without-edit rate, site coverage rate, free-to-premium conversion — is unmeasurable without instrumentation. This isn't optional infrastructure to add once the product feels validated; it's the only way to find out *whether* it's validated. It ships in the very first build, before there's even a premium tier to convert into.
**Where it's used:** scan start/complete, per-field approve/edit/reject, fill complete, review-screen exit (the closest available proxy for "went on to submit," since the app never sees the actual submit), paywall views and conversions.

### 1.13 Compliance Data Service (site deny-list)
**Why it's a live service, not a file shipped in the app:** the list of platforms whose terms disallow automated form interaction changes over time and needs a legal-review process behind it. Baking it into the app binary means every change requires an app-store release to react to. Serving it from a small, frequently-refreshed endpoint means it can be updated the same day a concern is flagged.
**Where it's used:** checked the instant a posting URL is about to open, before the in-app browser even loads it — if the host is listed, the app shows a plain "can't help on this one" message instead of proceeding.

### 1.14 Build-vs-buy summary

| Service | In-house | Vendor underneath |
|---|---|---|
| Identity & Profile Sync (1.2) | ✅ core to the product | |
| Resume Parsing (1.3) | | ✅ — solved problem, not core |
| Jobs-for-User (1.4) | ✅ (or reuse the publisher's own backend) | |
| Posting Enrichment (1.5) | ✅ | |
| Field-Value Decisioning (1.6) | ✅ orchestration | hosted model provider |
| AI Writing / Match-Scoring (1.7) | ✅ orchestration | hosted model provider |
| Tracking & Notifications (1.8) | ✅ | |
| Push Delivery (1.9) | | ✅ FCM |
| Duplicate Detection (1.10) | ✅ (extends 1.8) | |
| Billing (1.11) | | ✅ Play Billing |
| Telemetry (1.12) | | ✅ standard analytics platform |
| Compliance Deny-list (1.13) | ✅ data + review process, thin serving layer | |

---

## 2. One-line pitch

The app watches the user fill out one job application, learns what it needs from that, and does the typing for every application after that — while the user stays in control of every field it touches and submits every application themselves.

---

## 3. The problem, and who it's for

Applying to jobs today means retyping the same facts into a different form on a different platform, dozens of times, with slightly different phrasing each time. The friction isn't finding jobs — it's the mechanical cost of applying to them, which pushes people toward applying to fewer roles than they should, or toward sloppy, rushed answers that hurt their chances.

- **The volume applicant** — early-career or between roles, applying to 15–40 postings a week across many companies and platforms. Time-per-application is the bottleneck, and losing track of what's already been applied to is a real, recurring problem.
- **The focused switcher** — employed, applying selectively to a handful of roles a month, wants each one well-tailored, cares more about quality and follow-up than raw speed.
- **The passive browser** — not actively searching, but wants a profile ready so that when the right posting appears, applying takes minutes instead of half an hour.

All three share the same need underneath: stop retyping the same information, and don't lose track of where things stand with each company.

---

## 4. Product principles

1. **The user always submits.** The app fills a form; it never clicks Submit. This is a permanent line, not a v1 limitation — auto-submission changes the legal, ethical, and trust profile of the product entirely, and shouldn't be revisited casually under growth pressure later.
2. **Nothing is written to a form without the user seeing and approving it first** — field by field, or through an explicit "approve everything I'm highly confident about" batch action the user actively chooses to use. Never silently.
3. **Works on any job site, not just a curated list.** The value proposition breaks if the app only works on the ten sites its makers thought of. Universal detection is the product, not a fallback for when the curated list runs out.
4. **The app never pretends to be more certain than it is.** A guessed answer is labeled as a guess. A field it can't confidently fill is left blank and flagged — never filled with a plausible-looking wrong value.
5. **Sensitive personal data — race, disability, veteran status, gender identity, and similar categories — gets its own consent, its own storage, and its own autofill opt-in, kept separate from the rest of the profile at every layer.** Collecting it, storing it, and offering to auto-fill it are three distinct choices, not one. (See Section 5 for why this has to be decided at the data-model level, not the UI level.)
6. **The app behaves like a careful human, not a script.** No instant, identical-looking submissions fired off in rapid succession across many companies — that pattern is exactly what gets applicants flagged by a site's own defenses, which hurts the person the app exists to help.

---

## 5. A design decision worth calling out on its own: sensitive data isn't a checkbox, it's a schema choice

It would be easy to treat Principle 5 as a UI detail — add a toggle somewhere, done. It isn't, for two reasons that both need deciding before the data model is written, not after:

**It's a storage decision.** If race, gender, veteran status, and disability status live as ordinary fields next to email and phone number, separating them later means a schema migration *and* re-consenting every existing user, because the original consent (if any) was never scoped to a separate category in the first place. Deciding the boundary up front — a distinct table or record, its own encryption/access path, its own deletion hook — costs nothing extra during initial build and a great deal to retrofit.

**It's a trust decision.** The review-and-approve mechanic (Section 10) only works if users learn to trust what gets proposed to them. If these fields are auto-proposed at the same confidence and in the same visual treatment as a phone number from the first release, that's the habit users form. Introducing a separate consent gate later doesn't read as an improvement — it reads as the app admitting it did something wrong, and asking for a decision the user thought they'd already made.

Concretely, this means: sensitive-category fields are never populated into the profile by default; a user has to explicitly opt in to storing this category at all, separately from account creation; and even once stored, the app defaults to *flagging* these fields for the user's own manual answer rather than auto-proposing a value, unless the user separately opts into auto-fill for this category specifically. All three opt-ins are visually and functionally distinct screens, not one settings toggle with three checkboxes stacked on it.

---

## 6. What the app does, by tier

### Free — the complete autofill mechanic, fully unlocked

Nothing that would make a user lose trust or lose data sits behind payment, because the mechanic itself is the reason to use the app at all.

- **Profile builder** — manual entry, plus resume import (API 1.3) that pre-fills most fields automatically.
- **Works on any job posting** — paste a link (API 1.5) or pick from a preference-filtered list (API 1.4).
- **Automatic field detection** — reads the live page on-device (Section 1.1) and identifies every fillable field, regardless of platform.
- **Confidence-scored proposals** — each field shows what the app would fill and why, sourced from either the local matcher or the decisioning API (1.6) when the local match isn't confident.
- **Field-by-field or batch approval** — approve everything the app is highly confident about in one action; handle uncertain fields individually.
- **One-tap fill of approved fields**, leaving the rest of the form untouched for the user to complete themselves.
- **Cloud-backed profile** (API 1.2) — persists across reinstalls and devices, as table-stakes reliability, not a premium perk.
- **"You already opened this posting" warning** — a simple, free safety net (local URL check, with the fuller near-duplicate version reserved for premium — 1.10).

### Premium — helping the user run the job search, not just fill forms faster

- **Application tracking board** (API 1.8) — every application moves through a pipeline with manual status updates and gentle follow-up reminders.
- **AI-assisted answers for open-ended questions** (API 1.7) — cover-letter paragraphs, "why interested," salary framing, always an editable draft.
- **Resume-to-posting match scoring** (API 1.7) — how well a resume's language lines up with a posting's stated requirements, with keyword gaps.
- **Multiple profile variants** — different resumes and emphasized skills, switchable per application.
- **Smarter near-duplicate detection** (API 1.10) — catches the same role reposted under a new listing ID, or a very similar role at the same company.
- **Application analytics** (API 1.12) — response rate, time-to-first-response, a simple funnel across tracked applications.
- **Full history export** (CSV/PDF) — useful for record-keeping as much as for unemployment or visa paperwork.

The boundary is deliberate: **free = don't lose data, fill any form reliably. Premium = help run the search like a project.**

---

## 7. The end-to-end experience

1. **Onboarding.** Import a resume (1.3) to seed most of the profile; fill in the rest. Set job preferences (role, location, seniority, salary floor) — this powers the discovery list. Sensitive-category data is *not* collected here by default (Section 5) — it's a separate, later, explicitly opt-in step.
2. **Finding a posting — two first-class paths.** Paste a link (works anywhere, no setup, the reliable baseline) or browse the preference-filtered list (1.4). A share-to-app option from other apps' share menus is a reasonable secondary convenience once both core paths are solid — never a replacement for either.
3. **The posting opens in-app.** A brief, visible "reading the page" moment happens before anything is proposed — the app doesn't pretend this is instantaneous.
4. **Review panel appears.** Every detected field is listed with its proposed value or a flag that it needs input, grouped so obvious fields (contact info, links) are easy to bulk-approve and judgment-call fields (screening questions, salary, sensitive-category items) get individual attention.
5. **Fill.** Approved values are written into the real page. The user can keep editing directly on the page afterward — the app never locks the form.
6. **Submit.** The user reviews the completed page and submits it themselves, the same way they always would.
7. **Tracked automatically (premium) or logged simply (free).** The application enters history without manual recording.
8. **Follow-through.** Premium users get nudges to follow up or update status; free users keep a simple "everywhere you've applied" list either way.

---

## 8. Trust, safety, and compliance posture

- **No automated submission, full stop.** The single biggest lever for staying on the right side of both job-site terms and basic user trust — not something to revisit under growth pressure.
- **Deliberate, human-paced interaction with any third-party site.** No instant simultaneous multi-tab activity, no identical rapid-fire timing across sessions, even without auto-submit.
- **A live, maintained deny-list** (API 1.13) checked before the app offers to assist on a given site, with a graceful "can't help here" fallback instead of silently proceeding.
- **Sensitive-category data gets its own consent, storage, and autofill opt-in** (Section 5) — a user can use every core feature while declining to store this category at all.
- **Every filled value is inspectable after the fact** — a user can always see exactly what was written and why.

---

## 9. Data & privacy approach

- Profile data is owned by the user, exportable or deletable completely, on demand — not just deactivated.
- Resume files and free-text answers are encrypted at rest; sensitive-category fields (Section 5) live in a separately encrypted, separately access-controlled store from the rest of the profile.
- A short, clear retention policy: history is kept for as long as the account exists, unless the user deletes individual entries or the account itself; deleting the account deletes the data, not just the login.
- Regional privacy regimes (GDPR, CCPA/CPRA, and equivalents elsewhere) are treated as a floor everywhere the app operates, not a checklist satisfied only where legally forced.
- AI-writing calls (1.7) send only what a specific request needs — the job description and relevant profile fields — never a standing feed of the full profile to a model provider.

---

## 10. Why Android-first, and why the full review-and-approve UI

**Android-first.** The primary personas skew toward exactly the segment of the market where Android has the largest install base globally — early-career and cost-conscious job seekers. Building one platform well and fast gets a credible, trustworthy version of the mechanic in front of real users sooner than splitting effort across two platforms from day one, and an in-app browser with page-level scripting access is a mature, well-supported capability on Android to build against. None of this rules out an iOS build later — it just says the first version should be the best possible version of one platform rather than a compromised version of two.

**The full review-and-approve mechanic, not a lighter "just trust it" autofill.** Three reasons this is the right call, not just the safer-sounding one:
- **Legal defensibility.** An app that fills forms without ever submitting, and never writes a value the user hasn't seen, has a materially different risk profile from one that acts more autonomously — this matters more, not less, for an app carrying a recruitment company's name.
- **Cold-start trust.** A brand-new app with no track record has to earn the benefit of the doubt. A visible review step, where the user can see exactly what's about to be typed and why, is how that trust gets built in the first sessions — a black-box autofill asks for trust it hasn't earned yet.
- **Error cost asymmetry.** A wrong value silently submitted on someone's job application is a meaningfully worse failure mode than a slightly slower fill experience. The review step trades a small amount of speed for eliminating the failure mode that would do the most damage to both the user and the publisher's reputation.

---

## 11. Why a recruitment company is a credible publisher for this

The app is deliberately **not** built to funnel users toward the publisher's own listings — it works the same everywhere, which is the whole point of the trust proposition. What a recruitment company brings instead is credibility, distribution, and inside knowledge of the application process that shapes better field-classification and safer defaults than a purely outside-in build would. If a tie-in to the publisher's own placement services ever makes sense, it should be an optional, clearly-labeled surface — never a default behavior baked into the core flow.

---

## 12. Rollout plan

- **Phase 1 — Prove the mechanic (Android).** Profile builder, universal on-device detection, review-gated fill, cloud-backed profile (1.2), paste-a-link (1.5), preference-filtered list (1.4), field-value decisioning (1.6) as a real service from the start — not a stub, since the free tier's usefulness depends on it. Telemetry (1.12) ships in this phase too. No AI writing, no tracking board yet. Goal: the free tier alone has to be good enough that people keep using it and recommend it.
- **Phase 2 — Premium v1.** Tracking board and reminders (1.8, 1.9), basic AI-assisted answers (1.7), subscription billing (1.11). Goal: validate that the free-to-premium split and pricing actually convert.
- **Phase 3 — iOS fast-follow**, sharing the same backend services and matching logic built in Phase 1, plus a fast-path layer for a handful of very high-traffic platforms to lift accuracy where most users spend most of their time.
- **Phase 4 — Deepen AI assistance** — resume-match scoring, smarter near-duplicate detection (1.10), richer analytics — informed by real usage data on where the free tier's limits actually cause people to upgrade.
- **Guided, multi-step form automation (auto-advancing through a multi-page application) stays explicitly out of scope** until Phases 1–4 are stable and a dedicated legal/safety review has taken place — it changes the product's risk profile enough to deserve its own decision point.

---

## 13. Key risks and how the product manages them

| Risk | Mitigation |
|---|---|
| A job site's terms prohibit automated form interaction | Live deny-list (1.13); never auto-submit anywhere, which materially reduces exposure even where automation is disallowed. |
| A user submits an application with a wrong or outdated value | Every field shown before fill, every fill shown before submit — nothing is invisible. |
| Sensitive data mishandling creates legal or reputational exposure | Separate consent, storage, and autofill opt-in for sensitive-category data (Section 5), decided at the data-model level from day one. |
| The detection engine misreads a field on an unusual site | Confidence scoring surfaced to the user; low-confidence fields default to flagged, not filled; decisioning API (1.6) as a real fallback, not a stub. |
| Free tier cannibalizes premium because the split feels arbitrary | The split is drawn at reliability-vs-management value, tested against real usage once live, not just intuition. |
| Field-decisioning or AI-writing provider has an outage | Local matcher continues to handle everything it can; affected fields degrade to "needs your input," never to a guess. |

---

## 14. Success metrics

- **Time-to-fill per application** vs. manual completion — the core value claim, measured via telemetry (1.12), not assumed.
- **Field-level approval-without-edit rate** — a strong proxy for trust in the matching and decisioning engines.
- **W1/W4 retention** and applications completed per active user per week.
- **Free-to-premium conversion rate**, and which premium feature drives it — this should directly steer roadmap investment.
- **Site/platform coverage rate** — the percentage of opened postings where the app successfully proposes at least the core fields, tracked over time as the leading indicator of engine health.

---

## 15. Monetization model

**Freemium**, with the boundary set by Section 6: never gate reliability or trust, only gate the extra layer of job-search management.

- **Free:** unlimited autofill, on any site, forever — the acquisition and retention engine, and it needs to be good enough on its own that people recommend it rather than tolerate it while waiting to upgrade.
- **Premium (subscription):** tracking board, AI writing assistance, resume-match scoring, multiple profiles, advanced duplicate detection, analytics, full export.
- A **free trial of Premium** during a user's first active job search is a natural way to demonstrate the tracking/AI value before asking for payment, rather than describing it on a paywall screen.
