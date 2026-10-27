# AccessFix AI

A local React accessibility repair assistant built around **Detect → Generate → Review → Approve → Apply → Verify**.

**Current milestone: Phase 0 — setup and architecture.** The React/Vite/Tailwind client, Express health endpoint, environment configuration, dependency setup and foundation checks are implemented. The dashboard, login demo, `/preview` route, scans, model inference and file application are scheduled for later phases. No scan results or AI proposals are simulated.

## Requirements

- Node.js **24 LTS** recommended (`.nvmrc`); minimum 22.12.0, plus npm 10 or newer.
- Git for version control. This repository can be pushed to GitHub with normal Git tooling.
- Chromium for Playwright, needed when implementing scans in Phase 2.
- [Ollama](https://ollama.com/download) with **`qwen2.5-coder:1.5b`**, needed when implementing inference in Phase 3.

Phase 0 runs without a browser download or a running Ollama service. The inference implementation will use Node's built-in `fetch` to call the real local Ollama API; no hosted AI SDK is required.

## Run locally

Run from the repository root:

```sh
npm install
npm run dev
```

The npm workspace installs both applications with one root lockfile. `npm run dev` starts both processes; Ctrl+C stops them.

- Client: **http://127.0.0.1:5173**
- API health: **http://127.0.0.1:3001/api/health**
- Proxied API health: **http://127.0.0.1:5173/api/health**

The starter page displays the Phase 0 status. Its **Check local API health** link should return:

```json
{ "status": "ok", "service": "AccessFix AI API", "phase": 0 }
```

This checks Express connectivity only, not Chromium or model readiness. Workflow endpoints intentionally return 404 until their implementation phases. Vite's HTML fallback at `/preview` is not yet a demo preview route.

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

Only public browser settings may use a `VITE_` prefix. The starter uses relative `/api` requests; no browser secrets or remote services are needed.

## Checks and milestone testing

```sh
npm run check
```

This runs ESLint, Node's built-in tests for local configuration boundaries and real HTTP health/error responses, and a production client build. Individual commands are `npm run lint`, `npm test` and `npm run build`.

For a manual Phase 0 smoke test:

1. Start both processes with `npm run dev`.
2. Visit the client and confirm the Phase 0 page renders.
3. Follow **Check local API health** and confirm the JSON above. This verifies the Vite-to-Express proxy.
4. Request `POST /api/scan` and confirm a JSON 404 rather than a fabricated result.
5. Stop both processes with Ctrl+C.

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

Confirm that the exact `qwen2.5-coder:1.5b` tag is present. Other installed models are not silently substituted. Model downloads are intentionally not part of Phase 0.

## Project layout and next phases

```text
client/
  index.html
  vite.config.js               React + Tailwind, local API proxy
  src/
    main.jsx
    App.jsx                    Phase 0 starter page
    styles.css
    demo/                      OriginalDemo.jsx and ActiveDemo.jsx in Phase 1
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
| 1 | Frontend dashboard, controlled demo, `/preview`, source loading | Awaiting request |
| 2 | Real Playwright/axe detection and issue reporting | Awaiting request |
| 3 | Real Ollama generation, JSX validation and code review | Awaiting request |
| 4 | Approved apply, rollback, rescan and reset | Awaiting request |
| 5 | Integration tests, documentation and demo preparation | Awaiting request |

See [the architecture document](docs/architecture.md) for API contracts and the apply/rollback design. Each phase ends with checks, a milestone summary and a stop until the next phase is requested.

## Prototype boundaries

This prototype supports one predefined local React component. The future API will write only `client/src/demo/ActiveDemo.jsx`, after reviewing and explicitly approving a stored AI candidate. The original remains available for reset; failed application or verification triggers restoration of the previous source. Babel parsing is a syntax check, so the planned validation also restricts component capabilities before application.

There are no arbitrary repository uploads, user-supplied scan URLs, authentication, databases, payments or cloud deployment. Automated scans do not establish full WCAG compliance. Successful automated checks will be described as **“no violations detected by automated checks.”**

## References

- [Vite getting started](https://vite.dev/guide/)
- [Tailwind CSS with Vite](https://tailwindcss.com/docs/installation/using-vite)
- [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing)
- [Ollama generate API](https://docs.ollama.com/api/generate)
