# Phase 4 verification

## Automated validation

Run from the repository root:

```powershell
npm test
npm run lint
npm run build
npm run check
```

The Phase 4 implementation currently has 65 passing server tests. The suite covers the AST allowlist, successful apply and verification, stale and duplicate approvals, verification failure rollback, reset, source immutability, scanner behavior, Ollama failures and the Phase 1-3 regression suite.

## Real local workflow

Environment tested on 2026-10-30:

- Node.js 24.21.0
- Ollama running locally
- Configured model: `qwen2.5-coder:1.5b`
- Vite client: `http://127.0.0.1:5173`
- Express API: `http://127.0.0.1:3001`
- Playwright Chromium available

Commands used:

```powershell
npm run dev
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3001/api/reset -ContentType application/json -Body '{}'
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3001/api/scan
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3001/api/generate-fix -ContentType application/json -Body '{"scanId":"..."}'
Invoke-WebRequest -Method Post -Uri http://127.0.0.1:3001/api/apply-and-verify -ContentType application/json -Body '{"proposalId":"...","scanId":"...","approved":true}'
```

Observed results:

| Step | Result |
| --- | --- |
| Reset before scan | Passed; preview rendered |
| Baseline scan | Passed; 3 rules, 4 affected elements |
| Baseline rules | `button-name`, `color-contrast`, `label` |
| Real Ollama generation | Passed; model `qwen2.5-coder:1.5b`, proposal returned |
| Apply and verify | Blocked by `UNSUPPORTED_PROPOSED_CHANGE` |
| Reset after blocked apply | Passed; preview rendered |
| Rescan after reset | Passed; 3 rules, 4 affected elements |
| Rescan rules | `button-name`, `color-contrast`, `label` |

The generated proposal was valid JSX, but the model changed visible component content outside the restricted accessibility-only AST policy. The proposal was not applied, no verification success was claimed, and the active demo remained unchanged. This is an intentional security outcome, not a failed accessibility assertion.

## Acceptance status

- [x] Explicit approval is required.
- [x] Only the predefined active demo can be modified.
- [x] Original demo remains immutable.
- [x] AST policy rejects unsupported generated changes.
- [x] Apply and reset operations are concurrency guarded.
- [x] Verification compares real before/after rule IDs.
- [x] Verification failures restore the prior active source.
- [x] Reset restores the trusted original source.
- [x] Automated tests, lint and production build pass.
- [ ] Real model proposal accepted and applied.
- [ ] Real before/after accessibility improvement recorded.

The final two items remain blocked until the configured model produces a proposal within the narrow allowlist. The correct response is regeneration or prompt refinement, not weakening the policy.
