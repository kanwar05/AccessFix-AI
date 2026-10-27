# AccessFix AI

A local React accessibility repair assistant built around **Detect → Generate → Review → Approve → Apply → Verify**.

**Current milestone: Phase 1 — frontend dashboard and accessibility demo.** The responsive dashboard displays an isolated login preview, actual JSX source and clear empty states for scanning, AI suggestions and verification. The working Phase 0 Express health endpoint, environment configuration, dependency setup and foundation checks remain in place. No scan results or AI proposals are simulated.

## Requirements

- Node.js **24 LTS** recommended (`.nvmrc`); minimum 22.12.0, plus npm 10 or newer.
- Git for version control. This repository can be pushed to GitHub with normal Git tooling.
- Chromium for Playwright, needed when implementing scans in Phase 2.
- [Ollama](https://ollama.com/download) with **`qwen2.5-coder:1.5b`**, needed when implementing inference in Phase 3.

The Phase 1 dashboard runs without a Playwright browser download or a running Ollama service. The future inference implementation will use Node's built-in `fetch` to call the real local Ollama API; no hosted AI SDK is required.

## Run locally

Run from the repository root:

```sh
npm install
npm run dev
```

The npm workspace installs both applications with one root lockfile. `npm run dev` starts both processes; Ctrl+C stops them.

- Client: **http://127.0.0.1:5173**
- Standalone demo preview: **http://127.0.0.1:5173/preview**
- API health: **http://127.0.0.1:3001/api/health**
- Proxied API health: **http://127.0.0.1:5173/api/health**

The dashboard checks local API connectivity on load and when **Recheck API connection** is activated; it does not poll continuously. Visiting either health URL should return:

```json
{ "status": "ok", "service": "AccessFix AI API", "phase": 0 }
```

This checks Express connectivity only, not Chromium or model readiness. The unchanged `phase: 0` describes the API milestone; the client is now at Phase 1. Workflow endpoints, including the reserved `GET /api/demo`, intentionally return 404 until their backend implementation phases. The dashboard currently reads source through Vite raw imports.

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
| `PREVIEW_URL` | server | `http://127.0.0.1:5173/preview` | Fixed future scan target; must be `/preview` on `CLIENT_ORIGIN`. |
| `OLLAMA_BASE_URL` | server | `http://127.0.0.1:11434` | Local Ollama HTTP origin. |
| `OLLAMA_MODEL` | server | `qwen2.5-coder:1.5b` | Exact model tag for real inference. |
| `OLLAMA_TIMEOUT_MS` | server | `120000` | Future inference timeout, capped at 600000 ms. |
| `SCAN_TIMEOUT_MS` | server | `30000` | Future scan timeout, capped at 120000 ms. |

If changing the API port, also update `API_PROXY_TARGET`. If changing the client port, also update `CLIENT_ORIGIN` and `PREVIEW_URL`. Keep the same host spelling across settings. The API and proxy reject non-loopback service origins.

Only public browser settings may use a `VITE_` prefix. The dashboard uses relative `/api` requests; no browser secrets or remote services are needed.

## Checks and milestone testing

```sh
npm run check
```

This runs ESLint, Node's built-in tests for local configuration boundaries and real HTTP health/error responses, and a production client build. Individual commands are `npm run lint`, `npm test` and `npm run build`.

For a manual Phase 1 smoke test:

1. Start both processes with `npm run dev`.
2. Visit the client and confirm the dashboard, login iframe, code comparison and before/after placeholders render. The API status should reflect a real health request.
3. Open `/preview` directly. It should show only the login demo, with no dashboard navigation or source panels. Try the password visibility toggle and submit the form; the demo stays local and sends no credentials.
4. Confirm **Scan Accessibility**, **Generate AI Fix**, **Apply & Verify** and **Reset Demo** are disabled with explanations. Results should say they are unavailable or not run, rather than display invented counts or successful fixes.
5. Inspect the original/current source panels and try copying source. They show the real module text; the AI panel has no proposed JSX yet.
6. Use only the keyboard to follow the skip link, dashboard navigation, preview link and available controls. Focus should remain visible. Resize to a narrow mobile width and confirm the dashboard remains usable, with code scrolling inside its panel.
7. Visit `/api/health` through the client origin and confirm the JSON above. Request `POST /api/scan` and confirm a JSON 404. The same applies to the other unimplemented workflow endpoints.
8. With the client and backend running in separate terminals, stop only the backend and activate **Recheck API connection**. Confirm the dashboard reports that the API is unavailable. Restart the backend and recheck to confirm recovery.
9. Stop both processes with Ctrl+C.

The intentional accessibility defects are restricted to `OriginalDemo.jsx` and `ActiveDemo.jsx`: the email and password fields lack accessible names, the icon-only password toggle lacks an accessible name, and helper text has low contrast. These are fixtures for the real axe scan in Phase 2. Their visual field captions are deliberately not associated labels. Do not use this demo form as a production login example.

Phase 1 browser QA used Playwright with an installed system Chrome. The dashboard and standalone preview rendered, keyboard navigation and source copying worked, API failure/retry behavior recovered, and no page-level horizontal overflow was observed at widths of 320, 390, 760, 900 and 1280 px. A QA-only axe run found no violations in the dashboard outside the intentional demo iframe; a separate scan of `/preview` detected the intended `label`, `button-name` and `color-contrast` violations. These development checks do not implement the product's scan endpoint or establish full WCAG compliance.

The production build validates compilation only; it does not exercise the planned accessibility scanner, AI engine or rollback workflow. `npm run preview --workspace client` serves the build for inspection on port 4173 without the development API proxy. Use `npm run dev` for the local workflow.

## Prepare later-phase prerequisites

Before Phase 2, install Playwright's Chromium:

```sh
npm run setup:browser
```

On Linux, Playwright may also require system dependencies (`npx playwright install --with-deps chromium`). Browser installation downloads binaries; it is separate from `npm install`.

Before Phase 3, start Ollama and pull the requested model:

```sh
ollama serve
```

If the Ollama desktop application is already running, use its existing service. In another terminal:

```sh
ollama pull qwen2.5-coder:1.5b
ollama list
```

Confirm that the exact `qwen2.5-coder:1.5b` tag is present. Other installed models are not silently substituted. Model downloads are intentionally not part of Phase 1.

## Project layout and next phases

```text
client/
  index.html
  vite.config.js               React + Tailwind, local API proxy
  src/
    main.jsx
    Routes.jsx                 Separate dashboard and preview entries
    App.jsx                    Phase 1 dashboard
    components/                Dashboard sections and shared controls
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
    app.js                     Health route and JSON error handling
    config.js                  Validated local settings and fixed demo paths
  test/                        Foundation configuration/HTTP checks
docs/architecture.md           Planned APIs, trust boundaries and phase gates
```

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Setup and architecture | Implemented |
| 1 | Frontend dashboard, controlled demo, `/preview`, raw source loading | Implemented |
| 2 | Real Playwright/axe detection and issue reporting | Awaiting request |
| 3 | Real Ollama generation, JSX validation and code review | Awaiting request |
| 4 | Approved apply, rollback, rescan and reset | Awaiting request |
| 5 | Integration tests, documentation and demo preparation | Awaiting request |

See [the architecture document](docs/architecture.md) for API contracts and the apply/rollback design. Each phase ends with checks, a milestone summary and a stop until the next phase is requested.

Phase 2 will connect **Scan Accessibility** to a fixed-target Playwright/axe scan, report genuine rule IDs, impacts, descriptions, targets and actionable summaries, and replace the issue placeholders with real results. AI generation, approved file application and reset remain later-phase work.

## Prototype boundaries

This prototype supports one predefined local React component. The future API will write only `client/src/demo/ActiveDemo.jsx`, after reviewing and explicitly approving a stored AI candidate. The original remains available for reset; failed application or verification triggers restoration of the previous source. Babel parsing is a syntax check, so the planned validation also restricts component capabilities before application.

There are no arbitrary repository uploads, user-supplied scan URLs, authentication, databases, payments or cloud deployment. Automated scans do not establish full WCAG compliance. Successful automated checks will be described as **“no violations detected by automated checks.”**

## References

- [Vite getting started](https://vite.dev/guide/)
- [Tailwind CSS with Vite](https://tailwindcss.com/docs/installation/using-vite)
- [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing)
- [Ollama generate API](https://docs.ollama.com/api/generate)
