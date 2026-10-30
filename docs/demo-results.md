# AccessFix AI demo results

## Recorded environment

- Date: 2026-10-30
- Node.js: 24.21.0
- Model configured: `qwen2.5-coder:1.5b`
- Browser: Playwright bundled Chromium
- Preview: `http://127.0.0.1:5173/preview`

## Verified local evidence

The Phase 4 verification run completed reset and genuine baseline scans:

| Step | Result |
| --- | --- |
| Reset before scan | Passed; preview rendered |
| Baseline scan | Passed; 3 rules, 4 affected elements |
| Baseline rules | `button-name`, `color-contrast`, `label` |
| Reset after the blocked generation attempt | Passed; preview rendered |
| Rescan after reset | Passed; 3 rules, 4 affected elements |

The configured Ollama model returned edit plans whose source fragments did not match the controlled source. The bounded correction attempt also failed validation with `INVALID_AI_EDIT_PLAN`. Therefore no proposal was applied, no after-repair improvement is claimed, and no Ghost Mode resolution state is claimed from that run.

## What remains to record

When a future local model run produces an accepted proposal, append the actual proposal ID, baseline and after-scan IDs, resolved/remaining/introduced rule IDs, apply result, verification result and reset result. Do not replace these placeholders with expected counts.

Automated axe results do not establish full WCAG conformance. Manual keyboard, screen-reader and content review remain necessary.
