# AccessFix AI architecture

AccessFix AI is a local hackathon prototype for one predefined React component. Its intended workflow is **Detect → Generate → Review → Approve → Apply → Verify**. Phase 0 establishes the development foundation; the workflow and API contracts below are planned work for later phases.

## Local services

- **Client:** React, Vite, JavaScript and Tailwind CSS. The dashboard owns the review interaction. A separate `/preview` route will render only the controlled demo component, without dashboard controls that could affect its scan results.
- **Server:** Node.js and Express. It will read the fixed demo source, coordinate scans, call Ollama, validate candidates and apply approved changes.
- **Browser automation:** Playwright with `@axe-core/playwright`, running Chromium against the configured local client preview. The browser is test infrastructure, not an arbitrary URL scanning service.
- **Inference:** A real local Ollama service using `qwen2.5-coder:1.5b`. Model unavailability is an error; there is no fabricated response or fallback patch.
- **Syntax validation:** `@babel/parser` will parse each proposed complete JSX module and verify that it has a default-exported React component.

```mermaid
flowchart LR
  D[React dashboard] -->|Local API| E[Express server]
  E -->|Fixed local preview URL| P[Playwright + axe-core]
  P --> V["/preview: ActiveDemo"]
  E -->|Source + detected issues| O[Local Ollama]
  O --> C[Proposed JSX]
  C --> R[Dashboard review]
  R -->|Explicit approval| E
  E -->|Validate and replace| F[ActiveDemo.jsx]
  F --> V
```

The browser uses relative `/api` requests through Vite's development proxy. Server configuration supplies the client and Ollama URLs, model and timeouts. Bind the development services to loopback; no deployment, account, database or hosted inference is required.

## Source layout

```text
client/                         React/Vite application
  src/
    demo/                       Planned in Phase 1
      OriginalDemo.jsx          Deliberately inaccessible baseline
      ActiveDemo.jsx            Sole runtime-editable source file
server/                         Express application
docs/architecture.md            Architecture and phase boundaries
```

`OriginalDemo.jsx` is the reset baseline. Only `ActiveDemo.jsx` may be modified by the application's API. Paths are resolved by the server from its own project location, never from a request. Development work may of course edit the repository normally.

## Planned API contracts

These contracts describe future behavior, not completed Phase 0 functionality. Return JSON errors in a consistent shape such as `{ "error": { "code": "MODEL_UNAVAILABLE", "message": "…" } }`, with useful HTTP status codes and no stack traces in browser responses.

| Endpoint | Input | Successful response and behavior | Phase |
| --- | --- | --- | --- |
| `GET /api/demo` | None | Current source, original source and current source fingerprint. | 1 |
| `POST /api/scan` | No URL or source input | A genuine axe report for the fixed preview, associated with the current source fingerprint and testing configuration. | 2 |
| `POST /api/generate-fix` | A current scan identifier | Send the server's current source and actual issues to Ollama; return a validated, stored candidate with identifier, proposed source and base fingerprint. Do not write the component. | 3 |
| `POST /api/apply-and-verify` | Candidate identifier and explicit approval | Reject stale or unapproved candidates; validate, apply, render and rescan. Return the actual before/after reports and remaining violations, or an error with rollback status. | 4 |
| `POST /api/reset` | None | Restore the controlled original source, invalidate saved scans/candidates and return the new source fingerprint. | 4 |

Keep scan and candidate records in process memory for this prototype. Restarting the server invalidates those records. The client must request a fresh scan after a source change. The apply endpoint accepts a stored candidate identifier rather than arbitrary replacement code.

## Detection and verification

1. Open the server-configured local `/preview` URL in a fresh browser context and wait for the component's ready signal and successful rendering.
2. Run one shared axe configuration for both baseline and verification: identical rules/tags, viewport, browser settings, page scope and readiness conditions. Store its identity with each report.
3. Normalize real axe violations into rule ID, impact, description, help text/link and affected nodes. Each affected node includes targets and the actionable failure summary returned by axe.
4. Preserve the raw meaning of results. A failed browser launch, navigation, compilation, rendering or scan is an error, never a zero-violation report.
5. Compare matching baseline and verification reports, showing counts, impacts, resolved rules and remaining problems. An applied candidate can still have accessibility violations.

Use **“no violations detected by automated checks”** when a completed scan returns zero violations. Automated testing does not establish full WCAG compliance; keyboard, screen-reader and other manual checks remain necessary.

## Generation, approval and safe application

1. Build the prompt from the controlled source and server-held scan. Request a complete JSX module with one default-exported React component and no explanation or Markdown.
2. Call local Ollama with a bounded timeout and response size. Remove surrounding Markdown fences if present, then parse and validate the full returned module. Reject incomplete, malformed or unexpected responses without changing any file.
3. Enforce a narrow component capability policy: permit the expected React imports and component structure; reject unexpected imports, dynamic execution, module-scope side effects and unrelated network or storage behavior. **Parsing JSX validates syntax; it is not a JavaScript sandbox.** No uploaded code or arbitrary repositories are accepted.
4. Store the candidate against the exact source fingerprint used to generate it. Display original and proposed source for review. Generation itself never applies a change.
5. Require the user's explicit Apply & Verify action. Serialize source-changing operations, recheck the base fingerprint and preserve the previous source before replacing `ActiveDemo.jsx`.
6. Wait for Vite to compile and the updated preview to render. Detect compilation errors, runtime exceptions and failed readiness before running the same accessibility scan again.
7. If application, compilation, rendering or verification fails, restore the preserved source and confirm that the previous preview renders. Report both the primary failure and rollback outcome. Do not overwrite `OriginalDemo.jsx` or silently substitute a hand-written fix.

Use bounded timeouts and close browser contexts on all paths. Distinguish service-unavailable, timeout, malformed-model-output, stale-candidate, validation, browser and rollback errors so the dashboard can explain a useful next step.

## Scope and phase gates

| Phase | Deliverable | Gate before continuing |
| --- | --- | --- |
| **0 — Setup and architecture** | Client/server scaffolding, dependencies, environment examples, startup/check scripts and architecture documentation. | Build and available foundation checks pass; summarize changes and stop. |
| **1 — Frontend dashboard and demo** | Accessible dashboard, deliberately buggy baseline, active component, isolated preview and source loading. | Check frontend build and dashboard/preview rendering; summarize and stop. |
| **2 — Accessibility detection engine** | Fixed-target Playwright/axe scan and real issue presentation. | Exercise baseline scan, repeatable configuration and browser failure paths; summarize and stop. |
| **3 — AI-generated fix engine** | Real Ollama inference, prompt constraints, JSX validation and side-by-side candidate review. | Exercise model success and unavailable/timeout/malformed output paths; confirm generation leaves the source unchanged; summarize and stop. |
| **4 — Apply-and-verify workflow** | Explicit approval, stale-source protection, controlled writes, rollback, genuine verification and reset. | Exercise the complete workflow and failed-application recovery; summarize and stop. |
| **5 — Testing, documentation and demo preparation** | Integration checks, manual accessibility checks, troubleshooting and reproducible demo instructions. | Demonstrate Detect → Fix → Verify with the real local model and actual scan reports. |

No phase includes arbitrary repository uploads, user-provided scan URLs, authentication, databases, payments or cloud deployment. Do not begin the next phase until the user requests it.
