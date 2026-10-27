# AccessFix AI

A local React accessibility repair assistant built around **Detect → Generate → Review → Approve → Apply → Verify**.

**Current milestone: Phase 2 — real accessibility detection.** The existing dashboard scans its controlled React login preview with headless Chromium and axe-core, then displays genuine rule findings, affected selectors, severity and remediation details. The first successful scan is retained as the baseline in frontend memory. AI generation, source application, reset and after-repair verification remain unavailable.

## Requirements

- Node.js **24 LTS** recommended (`.nvmrc`); minimum 22.12.0, plus npm 10 or newer.
- Git for version control. This repository can be pushed to GitHub with normal Git tooling.
- Playwright's bundled Chromium, required for accessibility scans.
- [Ollama](https://ollama.com/download) with **`qwen2.5-coder:1.5b`**, needed when implementing inference in Phase 3.

The dashboard itself can load without Chromium, but scanning requires the browser installation below. Phase 2 does not call Ollama. The future inference implementation will use Node's built-in `fetch` to call the real local Ollama API; no hosted AI SDK is required.

## Run locally

Run from the repository root:

```sh
npm install
npm run setup:browser
npm run dev
```

The npm workspace installs both applications with one root lockfile. `npm run dev` starts both processes; Ctrl+C stops them.

`npm run setup:browser` downloads the Chromium version used by the installed Playwright package. It is separate from `npm install`. On Linux, system dependencies may also be needed: `npx playwright install --with-deps chromium`. The scanner does not silently substitute an installed Chrome or Edge browser.

- Client: **http://127.0.0.1:5173**
- Standalone demo preview: **http://127.0.0.1:5173/preview**
- API health: **http://127.0.0.1:3001/api/health**
- Proxied API health: **http://127.0.0.1:5173/api/health**

The dashboard checks local API connectivity on load and when **Recheck API connection** is activated; it does not poll continuously. Visiting either health URL should return:

```json
{ "status": "ok", "service": "AccessFix AI API", "phase": 0 }
```

This checks Express connectivity only, not Chromium or model readiness. The `phase: 0` field is preserved for compatibility with the original health contract; it is not the product milestone. `POST /api/scan` is implemented. `GET /api/demo`, AI generation, applying changes and reset remain unimplemented and return JSON 404 errors. The dashboard continues to read source through Vite raw imports.

To run each process in a separate terminal:

```sh
npm run dev:server
npm run dev:client
```

## Environment configuration

Defaults work without creating `.env` files. To customize them, copy `client/.env.example` to `client/.env` and `server/.env.example` to `server/.env`. In PowerShell:

```powershell
Copy-Item client/.env.example client/.env
Copy-Item server/.env.example server/.env
```

Restart the relevant process after changing settings. `.env` files are ignored by Git.

| Setting | Location | Default | Purpose |
| --- | --- | --- | --- |
| `CLIENT_PORT` | client | `5173` | Vite development port; fails rather than silently selecting another port. |
| `API_PROXY_TARGET` | client | `http://127.0.0.1:3001` | Local Express origin for Vite's `/api` proxy. |
| `PORT` | server | `3001` | Express port; bound to `127.0.0.1`. |
| `CLIENT_ORIGIN` | server | `http://127.0.0.1:5173` | Local client origin. |
| `PREVIEW_URL` | server | `http://127.0.0.1:5173/preview` | Fixed scan target; must be `/preview` on `CLIENT_ORIGIN`. |
| `OLLAMA_BASE_URL` | server | `http://127.0.0.1:11434` | Local Ollama HTTP origin. |
| `OLLAMA_MODEL` | server | `qwen2.5-coder:1.5b` | Exact model tag for real inference. |
| `OLLAMA_TIMEOUT_MS` | server | `120000` | Future inference timeout, capped at 600000 ms. |
| `SCAN_TIMEOUT_MS` | server | `30000` | Scan time budget, capped at 120000 ms. |

If changing the API port, also update `API_PROXY_TARGET`. If changing the client port, also update `CLIENT_ORIGIN` and `PREVIEW_URL`. Keep the same host spelling across settings. The API and proxy reject non-loopback service origins.

Only public browser settings may use a `VITE_` prefix. The dashboard uses relative `/api` requests; no browser secrets or remote services are needed.

## Run an accessibility scan

Start the client and server, open the dashboard, and select **Scan Accessibility**. The button shows a loading state and cannot start another request while scanning. Expand individual findings to inspect affected selectors and axe's failure summaries. A failed scan displays an error and can be retried; it is never reported as a clean result.

You can also call the same endpoint from a second PowerShell terminal:

```powershell
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:5173/api/scan' | ConvertTo-Json -Depth 12
```

Or from a shell with curl:

```sh
curl -X POST http://127.0.0.1:5173/api/scan
```

The endpoint accepts no scan target or source. An empty request or an empty JSON object is allowed; query parameters and nonempty inputs are rejected. It always scans the server-configured local `/preview` route, never an uploaded component, arbitrary URL or caller-supplied filesystem path. A browser's `Origin`, when present, must match the configured dashboard origin; local CLI requests can omit it. Cross-site browser requests are rejected. Only one scan runs at a time per server process; another request receives HTTP 409 with `SCAN_IN_PROGRESS`.

### Scan behavior and response

Each scan opens a fresh headless Chromium context, navigates to the fixed preview, waits for the visible `ActiveDemo` readiness marker, checks rendering, and runs axe-core. The shared `accessfix-axe-v1` policy uses a 1280 × 800 viewport, light color scheme, reduced motion and all default enabled axe rules. It does not disable contrast checks or filter out selected impacts. Browser resources are closed after success or failure.

The response includes:

| Field | Meaning |
| --- | --- |
| `status`, `scanId`, `scannedAt` | Completed scan status, unique identifier and ISO timestamp. |
| `previewUrl`, `sourceHash`, `configuration` | Controlled target, SHA-256 source fingerprint and the engine/testing policy used. |
| `violatedRuleCount` | Number of distinct violated axe rules. |
| `affectedElementCount` | Number of unique selector paths across violation nodes; one element can violate several rules. |
| `severityBreakdown` | Violated **rule** counts for `critical`, `serious`, `moderate`, `minor` and `unclassified`. |
| `incompleteRuleCount` | Rules requiring further review rather than a definite violation result. |
| `violations` | Genuine rule findings with help, description, impact, WCAG tags, documentation and affected nodes. |

Each finding retains `id`, `help`, `description`, `recommendedAction`, `impact`, `tags`, `wcagTags`, `helpUrl`, its affected-element count and `nodes`. Nodes retain the actual axe `target`, `html`, impact, `failureSummary` and `checks` (`any`, `all`, `none`) with engine-provided guidance. Counts for rules and elements are intentionally separate.

The first successful scan becomes the frontend baseline. Later successes update the latest findings without replacing that initial baseline; errors do not overwrite either successful report. A failed rescan clearly labels retained previous findings. Reloading the dashboard clears this in-memory state. The before card can display this real baseline, while the after card remains **Not verified** until Phase 4. Scanning reads source for identification and does not rewrite it.

### Observed Phase 2 scan

A real `POST /api/scan` through the Vite proxy completed against the unchanged login demo using bundled Chromium and axe-core **4.14.0**. It reported **3 violated rules affecting 4 unique elements**. All four deliberate defects were detected:

| Deliberate defect | Actual rule | Impact | Actual affected selector |
| --- | --- | --- | --- |
| Email input has no accessible name | `label` | Critical | `#demo-email` |
| Password input has no accessible name | `label` | Critical | `#demo-password` |
| Icon-only button has no accessible name | `button-name` | Critical | `button[type="button"]` |
| Helper text has low contrast | `color-contrast` | Serious | `p:nth-child(4)` |

This is an excerpt from that actual response; source fingerprint, policy details and most finding/node fields are omitted here for readability:

```json
{
  "status": "completed",
  "scanId": "21cea570-2dee-4fd0-ae68-6ccbdedb8d37",
  "scannedAt": "2026-10-27T06:15:17.377Z",
  "previewUrl": "http://127.0.0.1:5173/preview",
  "violatedRuleCount": 3,
  "affectedElementCount": 4,
  "severityBreakdown": {
    "critical": 2,
    "serious": 1,
    "moderate": 0,
    "minor": 0,
    "unclassified": 0
  },
  "incompleteRuleCount": 0,
  "violations": [
    {
      "id": "button-name",
      "impact": "critical",
      "nodes": [{ "target": ["button[type=\"button\"]"] }]
    },
    {
      "id": "color-contrast",
      "impact": "serious",
      "nodes": [{ "target": ["p:nth-child(4)"] }]
    },
    {
      "id": "label",
      "impact": "critical",
      "nodes": [
        { "target": ["#demo-email"] },
        { "target": ["#demo-password"] }
      ]
    }
  ]
}
```

The browser disconnected after completion, both demo files were byte-identical before and after the scan, the proxied health response was unchanged, and the later-phase POST endpoints still returned JSON 404 errors. These are observed validation results, not predefined values returned by the engine. New scans have their own identifiers and timestamps, and findings can change if source or axe versions change.

### Scan errors

Errors use `{ "error": { "code": "…", "message": "…" } }` with a helpful HTTP status. Common recovery actions:

| Condition | Response | Recovery |
| --- | --- | --- |
| Chromium is missing | 503 `BROWSER_NOT_INSTALLED` | Run `npm run setup:browser`, then retry. |
| Chromium cannot launch | 503 `BROWSER_LAUNCH_FAILED` | Inspect browser/system-dependency errors and retry. |
| Preview is unavailable | 503 `PREVIEW_UNAVAILABLE` | Start Vite and check `CLIENT_ORIGIN` / `PREVIEW_URL`. |
| Scan exceeds its time budget | 504 `SCAN_TIMEOUT` | Check the local preview and retry; adjust `SCAN_TIMEOUT_MS` if needed. |
| Preview compilation or runtime failure | 422 `PREVIEW_RENDER_FAILED` | Fix the local rendering error before scanning. |
| Another scan is running | 409 `SCAN_IN_PROGRESS` | Wait for the active request to finish. |
| Source changes during a scan | 409 `SOURCE_CHANGED` | Retry so the report describes one consistent source version. |
| Unsupported target/source/query input | 400 `UNSUPPORTED_SCAN_INPUT` | Send no parameters, or an empty JSON object. |
| A browser request comes from another origin | 403 `ORIGIN_NOT_ALLOWED` | Start the scan from the configured local dashboard. |
| A nonempty body has the wrong content type | 415 `UNSUPPORTED_MEDIA_TYPE` | Send an empty request or `application/json` with `{}`. |
| Unexpected axe failure | 500 `SCAN_FAILED` | Inspect the server terminal and retry. |

No failed navigation, browser launch, rendering or analysis is converted into an empty successful report.

## Checks and milestone testing

```sh
npm run check
```

This runs ESLint, Node's built-in tests for configuration, response normalization, severity/count semantics, scanner failures and HTTP endpoints, and a production client build. Individual commands are `npm run lint`, `npm test` and `npm run build`. The automated unit/HTTP tests do not require Chromium; use a real local scan to exercise the browser engine.

For a manual Phase 2 smoke test:

1. Start both processes with `npm run dev`.
2. Visit the client and confirm the dashboard, login iframe and actual code panels render. The API status should reflect a real health request.
3. Open `/preview` directly. It should show only the login demo, with no dashboard navigation or source panels. Try the password visibility toggle and submit the form; the demo stays local and sends no credentials.
4. Select **Scan Accessibility**. Confirm its loading state, real rule/element counts, severity breakdown and expandable issue details. Repeat the scan and confirm the initial baseline remains in the before card. The after card must remain unverified.
5. Inspect and copy the original/current JSX. Scanning must leave both files unchanged. **Generate AI Fix**, **Apply & Verify** and **Reset Demo** remain disabled with explanations; the AI panel has no proposed JSX.
6. Use only the keyboard to follow the skip link, dashboard navigation, preview link and available controls. Focus should remain visible. Resize to a narrow mobile width and confirm the dashboard remains usable, with code scrolling inside its panel.
7. Visit `/api/health` through the client origin and confirm the JSON above. Try the PowerShell scan command and inspect the real response. Other unimplemented workflow endpoints should still return JSON 404 errors.
8. With the client and backend in separate terminals, stop only the backend and retry a scan. Confirm a clear error, then restart the backend and retry successfully. You can also use **Recheck API connection** to test the separate health indicator. A failure must not erase the successful baseline or pretend that the page has no issues.
9. Stop both processes with Ctrl+C.

The intentional accessibility defects are restricted to `OriginalDemo.jsx` and `ActiveDemo.jsx`: the email and password fields lack accessible names, the icon-only password toggle lacks an accessible name, and helper text has low contrast. Their visual field captions are deliberately not associated labels. The demo is unchanged from Phase 1; do not use it as a production login example.

Automated scanning cannot establish full WCAG compliance. A successful scan with no violations says **“No accessibility violations were detected by the automated scan.”** It does not prove that labels are meaningful, keyboard behavior is correct in every state or the full experience works with assistive technology. Review incomplete results and continue manual keyboard and screen-reader testing.

Phase 2 validation passed `npm run check` (lint, 27 tests and the production build). Real dashboard scans with bundled Chromium, including successful rescans, displayed 3 violated rules across 4 elements with expandable guidance and actual selectors. Keyboard navigation and layouts at 320, 390, 760, 900 and 1280 px were checked. Scan loading disabled repeated frontend requests, the backend rejected overlap with 409, and the first baseline timestamp remained unchanged after rescans and errors. Explicitly intercepted responses exercised API/network failures, malformed reports and zero-violation/incomplete-result UI states without changing the demo; genuine scan results were restored afterward. Dashboard axe checks excluded the intentional demo iframe and passed with expanded findings, hovered controls and mobile layout. All three scanner browsers disconnected after completion, and both demo files retained their original bytes. Real Playwright failure-path checks also covered a missing executable, an unavailable preview, an unfollowed redirect and a render timeout, with all failure-path browsers closed. Browser-close failures are retried and reported rather than silently treated as successful cleanup. These checks do not implement AI fixes or establish full WCAG compliance.

The production build validates compilation only; it does not launch the scanner or exercise the future AI/apply workflow. `npm run preview --workspace client` serves the build for inspection on port 4173 without the development API proxy. Use `npm run dev` for the supported local scan workflow.

## Prepare later-phase prerequisites

Before Phase 3, start Ollama and pull the requested model:

```sh
ollama serve
```

If the Ollama desktop application is already running, use its existing service. In another terminal:

```sh
ollama pull qwen2.5-coder:1.5b
ollama list
```

Confirm that the exact `qwen2.5-coder:1.5b` tag is present. Other installed models are not silently substituted. Model downloads and inference are intentionally not part of Phase 2.

## Project layout and next phases

```text
client/
  index.html
  vite.config.js               React + Tailwind, local API proxy
  src/
    main.jsx
    Routes.jsx                 Separate dashboard and preview entries
    App.jsx                    Dashboard and scan/baseline state
    components/                Dashboard sections and shared controls
    hooks/                     Scan request/loading/error state
    styles.css
    preview/
      Preview.jsx              Renders only ActiveDemo
      preview.css              Isolated preview page styles
    demo/
      OriginalDemo.jsx         Deliberately inaccessible baseline
      ActiveDemo.jsx           Current controlled preview component
server/
  src/
    index.js                   Environment loading and server lifecycle
    app.js                     Health/scan routes and JSON error handling
    config.js                  Validated local settings and fixed demo paths
    services/
      accessibilityScanner.js  Controlled Playwright/axe browser scan
      normalizeScan.js         Genuine result normalization and counts
  test/                        Configuration, scanner, normalization and HTTP checks
docs/architecture.md           Planned APIs, trust boundaries and phase gates
```

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Setup and architecture | Implemented |
| 1 | Frontend dashboard, controlled demo, `/preview`, raw source loading | Implemented |
| 2 | Real Playwright/axe detection and issue reporting | Implemented |
| 3 | Real Ollama generation, JSX validation and code review | Awaiting request |
| 4 | Approved apply, rollback, rescan and reset | Awaiting request |
| 5 | Integration tests, documentation and demo preparation | Awaiting request |

See [the architecture document](docs/architecture.md) for API contracts and the apply/rollback design. Each phase ends with checks, a milestone summary and a stop until the next phase is requested.

Phase 3 will connect real local Ollama inference, validate complete JSX proposals and provide reviewable AI output. Scanning never applies a fix. Approved file application, rollback, after-repair verification and reset remain Phase 4 work.

## Prototype boundaries

This prototype supports one predefined local React component. The future API will write only `client/src/demo/ActiveDemo.jsx`, after reviewing and explicitly approving a stored AI candidate. The original remains available for reset; failed application or verification triggers restoration of the previous source. Babel parsing is a syntax check, so the planned validation also restricts component capabilities before application.

There are no arbitrary repository uploads, user-supplied scan URLs, authentication, databases, payments or cloud deployment. No Phase 2 endpoint writes the demo source. Automated scans do not establish full WCAG compliance.

## References

- [Vite getting started](https://vite.dev/guide/)
- [Tailwind CSS with Vite](https://tailwindcss.com/docs/installation/using-vite)
- [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing)
- [Ollama generate API](https://docs.ollama.com/api/generate)
