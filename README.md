# AccessFix AI

A local accessibility repair assistant for one controlled React component: **Detect → Generate → Review → Approve → Apply → Verify → Reset**.

Playwright and axe-core inspect a deliberately inaccessible login demo. Ghost Mode presents the real findings. Local Ollama proposes a small repair, the server validates it, and a person explicitly approves application. A fresh browser scan reports what actually improved and what remains. Unsupported model output is rejected.

**Demo-ready:** a real `qwen2.5-coder:1.5b` repair resolved `color-contrast`, reducing 3 violated rules / 4 elements to 2 rules / 3 elements, with no introduced rule IDs. Independent Playwright/axe verification and reset passed. The final model run, screenshots and regression evidence are recorded in [demo results](docs/demo-results.md). Generated code or passing unit tests alone do not establish a repair.

## Requirements

- Node.js 24 LTS recommended (`.nvmrc`); minimum 22.12.0, with npm 10 or newer.
- Playwright's bundled Chromium.
- [Ollama](https://ollama.com/download), running locally with the exact **`qwen2.5-coder:1.5b`** tag installed.

The dashboard can load without Chromium or Ollama. Scanning needs Chromium; AI generation needs the configured model. Another installed browser or model is never silently substituted.

## Run locally

From the repository root:

```sh
npm ci
npm run setup:browser
```

Start the Ollama desktop application, or run its service in a separate terminal:

```sh
ollama serve
```

Use the existing service if the desktop application already started it. In another terminal, download the model and start AccessFix AI:

```sh
ollama pull qwen2.5-coder:1.5b
ollama list
npm run dev
```

`npm ci` installs both npm workspaces from the root lockfile. `npm run setup:browser` downloads the Chromium version matching Playwright. On Linux, browser system dependencies may also be needed: `npx playwright install --with-deps chromium`.

- Dashboard: **http://127.0.0.1:5173**
- Isolated demo: **http://127.0.0.1:5173/preview**
- API health: **http://127.0.0.1:3001/api/health**
- Proxied health: **http://127.0.0.1:5173/api/health**

`npm run dev` starts the client and API together; Ctrl+C stops them. Separate terminals can use `npm run dev:server` and `npm run dev:client`. Keep the dev processes running for scans and source updates. The production build is a compilation check; the static Vite preview server does not supply the development API proxy.

The health endpoint returns `{ "status": "ok", "service": "AccessFix AI API", "phase": 0 }`. It checks Express connectivity, not Chromium or model readiness. `phase: 0` is the original health contract, not the current project milestone.

## Use the repair workflow

1. Open the dashboard and select **Reset Demo** to restore the trusted original. Reset itself performs a real preview scan, then clears the current proposal and scan association.
2. Select **Scan Accessibility**. Expand findings for rule IDs, affected selectors, HTML and axe remediation guidance.
3. Enable **Ghost Mode** to see those same findings presented as ghosts.
4. Select **Generate AI Fix**. Ollama receives the actual controlled source and server-owned scan findings. Generation leaves the demo unchanged.
5. Review the proposed source against the exact source used for generation. A proposal is explicitly marked as not applied or verified.
6. Explicitly approve **Apply & Verify**. Only the stored, current proposal can be applied. The server reruns Playwright and axe-core and reports resolved, remaining and introduced rule IDs.
7. Select **Reset Demo**, then scan again to demonstrate restoration.

The original fixture has deliberately unnamed email/password inputs, an unnamed password visibility button and low-contrast helper text. A historical baseline found **3 violated rules affecting 4 unique elements**: `button-name`, `color-contrast` and `label`. These are observations from the demo, not values substituted into scan responses. See [the current evidence](docs/demo-results.md) for actual run identifiers and before/after results.

Ghost Mode reads completed scan and verification reports. **Ghost Removed** requires a resolved rule ID; **Still Haunting** and **New Apparition** reflect remaining and introduced rule IDs. It does not change source, scan rules or approval behavior.

## How generation stays small

The prompt requests a typed JSON edit plan with exactly one `set-static-color` operation targeting the existing `styles.helper.color` property. The model must choose a six-digit hexadecimal `value`, identify `ruleId: "color-contrast"` and explain its connection to the real finding in `reason`. The application does not supply a successful replacement color or fabricate a model answer.

Deterministic code validates the operation, the static source property, the genuine scan finding, value and explanation. It binds the helper paragraph's text to the actual finding's HTML and checks the chosen color against axe's reported background and contrast threshold using unrounded WCAG luminance math. Missing or ambiguous color data is rejected. It then changes only the color literal at its AST source span to produce a complete reviewable module. Arbitrary string replacement plans are rejected. The translated module passes both the existing JSX/capability validator and the unchanged AST comparison gate. Legacy complete-module output remains subject to both gates; the prompt and Ollama response schema request only the typed plan.

This bounded generation path targets contrast. It does not promise to repair every finding. The apply policy remains broader than the requested edit plan: it permits static `aria-label`, `htmlFor` and `id` additions, the controlled `p`-to-`label` conversion and a six-digit `styles.helper.color` change. It rejects unrelated styling, visible text, handler, import, expression and component structure changes.

Ollama is called through local `/api/chat`, with a JSON response schema, `stream: false`, temperature 0.1, an output limit of 4096 tokens and context of 8192 tokens. A response-size bound and generation deadline also apply. At most one correction request is allowed within that budget. Invalid JSON, unsupported edits, missing models, timeouts and unsafe code remain errors. There is no prepared repair fallback.

## Safety and verification

- Only `client/src/demo/ActiveDemo.jsx` is writable through the repair workflow. `OriginalDemo.jsx` remains the reset baseline.
- API callers cannot submit source, arbitrary targets, filesystem paths or scan findings. The server reads its fixed source and scans its configured `/preview` route.
- Scan, proposal and source fingerprints must remain current. A new scan invalidates the previous proposal; restarting the API clears its in-memory associations.
- The apply request must contain the matching `proposalId`, `scanId` and literal `approved: true`. The frontend requires a separate approval action; generation grants no permission to apply.
- The API rechecks the AST allowlist before writing. Failed application/rendering/scanning restores the prior active source. See the documented failure-path evidence for the checks exercised.
- Baseline and verification use the same `accessfix-axe-v1` policy: bundled headless Chromium, 1280 × 800 viewport, light color scheme, reduced motion and all default enabled axe rules, including contrast. Each scan uses fresh browser resources and closes them afterward.
- Reports distinguish violated rules, unique affected elements and incomplete rules. A failed scan is an error, never an empty successful report.

A completed scan may still contain violations. A verified improvement requires fewer violated rules and no newly introduced rule IDs. A scan with remaining issues is shown as such; verification alone does not claim full accessibility or WCAG conformance. Parsing and the prototype policy are not a general JavaScript sandbox.

## Environment configuration

Defaults work without `.env` files. For customization, copy `client/.env.example` to `client/.env` and `server/.env.example` to `server/.env`, then restart the relevant processes. In PowerShell:

```powershell
Copy-Item client/.env.example client/.env
Copy-Item server/.env.example server/.env
```

| Setting | Workspace | Default | Purpose |
| --- | --- | --- | --- |
| `CLIENT_PORT` | client | `5173` | Vite port, with strict port selection. |
| `API_PROXY_TARGET` | client | `http://127.0.0.1:3001` | Loopback API origin for `/api`. |
| `PORT` | server | `3001` | API port, bound to `127.0.0.1`. |
| `CLIENT_ORIGIN` | server | `http://127.0.0.1:5173` | Accepted local dashboard origin. |
| `PREVIEW_URL` | server | `http://127.0.0.1:5173/preview` | Must be `/preview` on `CLIENT_ORIGIN`. |
| `OLLAMA_BASE_URL` | server | `http://127.0.0.1:11434` | Loopback Ollama HTTP origin. |
| `OLLAMA_MODEL` | server | `qwen2.5-coder:1.5b` | Exact requested model tag. |
| `OLLAMA_TIMEOUT_MS` | server | `120000` | Total generation budget, including one possible correction; maximum 600000. |
| `OLLAMA_MAX_RESPONSE_BYTES` | server | `262144` | HTTP response limit; maximum 1048576. |
| `AI_MAX_CODE_BYTES` | server | `65536` | Controlled source/model content limit; maximum 131072. |
| `SCAN_TIMEOUT_MS` | server | `30000` | Scan deadline; maximum 120000. |

Update `API_PROXY_TARGET` with an API port change. Update `CLIENT_ORIGIN` and `PREVIEW_URL` with a client port change. Use consistent host spelling. The API and proxy reject non-loopback service origins and URLs containing credentials. A browser request's origin, when present, must match the configured client; cross-site browser requests are rejected. Local CLI requests may omit `Origin`.

`.env` files are ignored by Git. No API keys are required. Only public browser configuration belongs under a `VITE_` prefix.

## API and troubleshooting

| Endpoint | Input | Result |
| --- | --- | --- |
| `GET /api/health` | None | Express connectivity status. |
| `POST /api/scan` | Empty body or `{}` | Actual fixed-preview accessibility report. |
| `POST /api/generate-fix` | `{ "scanId": "current scan ID" }` | Stored, validated proposal, exact original/proposed source, model and identifiers; not applied. |
| `POST /api/apply-and-verify` | `{ "proposalId": "current proposal ID", "scanId": "current scan ID", "approved": true }` | Real before/after reports and rule comparison. |
| `POST /api/reset` | Empty body or `{}` | Trusted source restoration and real preview scan. |

Other routes, including `GET /api/demo`, return JSON 404 errors. Errors use `{ "error": { "code": "…", "message": "…" } }`.

| Error | Action |
| --- | --- |
| `BROWSER_NOT_INSTALLED` / `BROWSER_LAUNCH_FAILED` | Run `npm run setup:browser`; inspect required system dependencies. |
| `PREVIEW_UNAVAILABLE` / `PREVIEW_RENDER_FAILED` | Keep Vite running; inspect local configuration and render errors. |
| `SCAN_TIMEOUT` | Retry; adjust the scan deadline for local hardware if needed. |
| `OLLAMA_UNAVAILABLE` | Start the Ollama application or `ollama serve`. |
| `OLLAMA_MODEL_NOT_FOUND` | Pull the exact configured model tag. |
| `OLLAMA_TIMEOUT` | Retry or increase the generation budget within its cap. |
| `INVALID_AI_EDIT_PLAN` / `INVALID_AI_CODE` / `UNSUPPORTED_AI_CODE` / `UNSUPPORTED_PROPOSED_CHANGE` | Review the rejection and regenerate; validation is not bypassed. |
| `STALE_SCAN` / `STALE_SOURCE` / `STALE_PROPOSAL` | Scan the current source and generate a new proposal. |
| `SCAN_IN_PROGRESS` / `GENERATION_IN_PROGRESS` / `OPERATION_IN_PROGRESS` | Wait for the current operation to finish. |
| `APPLY_ROLLED_BACK` | Inspect the reported verification failure; the prior source was restored. |

## Checks

```sh
npm run check
```

This runs ESLint, server/client tests and the production build. Individual commands are `npm run lint`, `npm test` and `npm run build`. Unit and HTTP tests use controlled dependencies and do not prove real inference. The genuine Ollama/Playwright/axe cycle and screenshot evidence are recorded separately in [demo results](docs/demo-results.md) and [the verification record](docs/phase4-verification.md).

The final check passed **74 server tests and 2 Ghost Mode tests (76 total)**, lint and production build. The release-time `npm audit --json` reported zero known advisories; that is a dated dependency check, not a guarantee about future advisories.

To repeat the genuine integration proof, stop existing Vite/API processes, keep Ollama running, and run `node scripts/e2e-proof.mjs`. It starts local Vite/API services, records actual model output, and pauses for proposal-specific terminal review before accepting the browser approval dialog. It then runs application verification, a separate direct axe scan, reset and restoration rescan. New runs overwrite the proof and screenshots; results are not guaranteed to match this recorded run.

## Privacy, licensing and limitations

The default Qwen tag runs on the local Ollama service. AccessFix AI sends source and findings to that loopback service and makes no direct hosted inference calls. It has no analytics or credential storage, and the fixture's submit handler sends no credentials. Installation and model/browser downloads require network access. Review your Ollama configuration if changing the model or service; a loopback URL by itself does not establish the behavior of every possible downstream service.

AccessFix AI's source is licensed under [MIT](LICENSE), copyright 2026 Kanwar. Model weights are downloaded separately and are not included in this repository. **Qwen2.5-Coder-1.5B-Instruct is licensed under Apache 2.0**; see [third-party notices](THIRD_PARTY_NOTICES.md) for its official license and dependency acknowledgements.

This prototype supports one predefined local React component and a narrow repair policy. It has no arbitrary repository uploads, target URLs, authentication or hosted multi-user deployment. Its in-memory state supports one controlled workflow per server process. Small-model output can be invalid or rejected. Automated scans do not replace manual keyboard, screen-reader and content review.

## Source and submission materials

```text
client/src/
  App.jsx, Routes.jsx          Dashboard and isolated preview routing
  components/, hooks/         Review, approval, verification and request state
  lib/ghostMode.js            Labels derived from real findings and verification
  demo/OriginalDemo.jsx       Trusted deliberately inaccessible fixture
  demo/ActiveDemo.jsx         Only controlled source changed by apply/reset
  preview/                    Isolated preview rendering and styles
server/src/
  app.js, config.js           Fixed-target APIs, sessions and loopback settings
  services/
    accessibilityScanner.js   Real Playwright/axe scan and browser cleanup
    normalizeScan.js          Finding details and distinct counts
    buildRepairPrompt.js      Source/finding prompt for bounded model edits
    structuredRepair.js       Strict edit-plan validation and translation
    ollamaClient.js           Bounded local model requests
    validateProposal.js       JSX and capability validation
    fixGenerator.js           Source-bound generation and validation
    applyProposal.js          AST comparison, controlled write and rule comparison
server/test/, client/test/    Regression and safety tests
scripts/e2e-proof.mjs         Real integration proof with explicit review pause
docs/architecture.md          Trust boundaries and API behavior
docs/demo-script.md           90–120-second recording plan
docs/demo-results.md          Actual run evidence and limitations
docs/phase4-verification.md   Apply/verification safety record
docs/evidence/, screenshots/  Actual model/scan evidence and browser captures
docs/hacktoberfest-week4-submission.md
                             Submission draft with manual links still required
```

No commit, push or publication is performed by the verification workflow. Complete the remaining owner/submission steps in the result record before publishing.
