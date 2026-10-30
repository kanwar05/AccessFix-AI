# Phase 4 verification

## Automated validation

Run from the repository root:

```powershell
npm test
npm run lint
npm run build
npm run check
```

The Phase 4 implementation currently has 68 passing server tests. The suite covers the AST allowlist, successful apply and verification, stale and duplicate approvals, verification failure rollback, reset, source immutability, scanner behavior, Ollama failures, structured edit plans and the Phase 1-3 regression suite.

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
| Real Ollama generation | Blocked; `qwen2.5-coder:1.5b` returned edit plans whose `find` fragments did not match the controlled source |
| Apply and verify | Not offered because generation-time validation rejected the proposal |
| Reset after blocked apply | Passed; preview rendered |
| Rescan after reset | Passed; 3 rules, 4 affected elements |
| Rescan rules | `button-name`, `color-contrast`, `label` |

The model was first asked for a minimal exact-string edit plan and was given verbatim source anchors. It still returned axe-rendered/browser HTML fragments and replacements that changed wrappers or visible content; the bounded correction returned another non-matching fragment. Generation therefore failed with `INVALID_AI_EDIT_PLAN`, before approval or apply. The proposal was not applied, no verification success was claimed, and the active demo remained unchanged. This is an intentional security outcome, not a failed accessibility assertion. The installed `qwen2.5-coder:7b` model exhibited the same full-module restructuring behavior in a separate evaluation.

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

The final two items remain blocked until a configured local model produces exact source edits within the narrow allowlist. The correct response is bounded regeneration or prompt refinement, not weakening the policy.
