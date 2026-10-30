# Apply, verification and final release record

Phase 6 closes the previously unfinished Phase 4 real-model acceptance checks. **One genuine local AI repair has now been applied and independently verified.** No new product phase or Ghost Mode redesign was introduced.

## Final checks

On 30 October 2026, `npm run check` passed **74 server tests and 2 Ghost Mode tests (76 total)**, lint and production build. The real integration script completed separately with `status: "passed"`; unit tests alone are not model-success evidence. npm's advisory audit returned zero known vulnerabilities.

| Requirement | Evidence |
| --- | --- |
| Real configured model | `qwen2.5-coder:1.5b`; actual prompt/content recorded in [proof JSON](evidence/phase6-proof.json) |
| Safe generation | Typed operation, real scan/source association, unrounded numeric contrast check, JSX validator and unchanged AST gate |
| Explicit approval | UI confirmation canceled first: zero apply POSTs and unchanged active bytes; proposal-specific terminal review and affirmative browser confirmation then produced exactly one apply POST |
| Missing/false approval rejected | HTTP regression test rejects omitted, false, string and injected-source approval bodies without applying |
| Unsafe proposals rejected | Tests reject changed handlers, imports, visible content, removed existing attributes, unrelated colors, arbitrary operations/paths and capability calls |
| Immutable original | Successful real run's before/after byte comparison and SHA-256; no final fixture diff |
| Write failure safety | Regression test proves failed atomic rename never writes proposed bytes directly to active/original paths |
| Rollback | Injected scan failure and post-scan source-read failure restore previous active source; original stays unchanged; error is `APPLY_ROLLED_BACK` |
| Independent verification | Real API after-scan plus separate Playwright context/direct AxeBuilder invocation agree |
| Ghost Mode | Actual remaining rules show Still Haunting; resolved contrast rule leaves current findings; verified result lists resolved ID |
| Reset | Real UI reset, fresh restoration scan, baseline rule IDs/counts/hash and byte equality all passed |

The apply write path no longer writes proposed source directly after a failed rename. An unnecessary post-rename read outside the verification rollback handler was removed, and the final post-scan integrity read is now inside that handler. Subsequent verification scan/read failures restore the previous source. The frontend's visible and screen-reader proposal status now reflect completed application accurately.

## Actual result

| Stage | Violated rules | Affected elements | Rule IDs |
| --- | --- | --- | --- |
| Before | 3 | 4 | `button-name`, `color-contrast`, `label` |
| After / independent after | 2 | 3 | `button-name`, `label` |
| After reset | 3 | 4 | `button-name`, `color-contrast`, `label` |

Resolved: **`color-contrast`**. Remaining: **`button-name`, `label`**. Introduced: **none**. Model-selected edit: `styles.helper.color`, `#a3a8b5` → `#000000`. Full scan IDs, raw response, timestamps, screenshots and hashes are in [demo results](demo-results.md).

The prior unsupported full-module changes were removal of an existing JSX comment and both label styles. The later exact-string strategy confused rendered HTML with JSX. Typed operations avoid asking the small model to copy or reconstruct that source. A first Phase 6 color proposal was also rejected during review for inaccurate contrast; its actual output and cleanup are retained in [rejected-review evidence](evidence/phase6-rejected-review.json).

## Repeat the real proof

Install from the README, start Ollama with `qwen2.5-coder:1.5b`, and stop conflicting Vite/API processes. From the repository root:

```powershell
node scripts/e2e-proof.mjs
```

Review its printed raw model response, code delta and stored proposal. Enter the exact proposal-specific approval only if accepted. The script has no automatic approval option. It cancels one browser confirmation before accepting an explicitly reviewed proposal, applies through the actual UI/API, analyzes a separate browser context, captures screenshots, resets and rescans. Failed runs record the blocker and attempt cleanup reset.

The recorded run used isolated ports because 3001 was occupied:

```powershell
$env:PORT='3101'
$env:CLIENT_ORIGIN='http://127.0.0.1:5273'
$env:PREVIEW_URL='http://127.0.0.1:5273/preview'
node scripts/e2e-proof.mjs
```

These settings affect that terminal session. The repository's defaults remain 3001/5173. Running the script replaces the current proof/screenshot artifacts with the new actual outcome. It never substitutes a prepared successful color.

## Public release and manual submission

The release preparation includes MIT licensing (copyright 2026 Kanwar), third-party/model notices, reproducible setup, safe environment examples, qualified local-inference/privacy claims, actual screenshots and known limitations. No credential matches were found in the bounded tracked-tree/history audit. No commit, push, deployment, external article write or publication was performed.

Before submission:

1. Review the working changes, then commit/push them manually when ready.
2. Make the actual repository publicly readable and verify its URL; local Git already configures `https://github.com/kanwar05/AccessFix-AI.git`, but public availability has not been established by this proof.
3. Record/upload the genuine [90–120-second demo](demo-script.md) and add the real video URL to the article. A public hosted inference service is unnecessary for the local walkthrough.
4. Copy the [submission draft](hacktoberfest-week4-submission.md) into the official DEV template, upload screenshots, fix repository-relative links for DEV, replace the code/video placeholders and use the required tags. Review AI-assistance disclosure and author/team details.
5. Optionally add a genuine agent-session link; omit that optional section if none is shared. No session URL has been fabricated or uploaded.
6. Review eligibility/rules and publish manually before the deadline. The official [Week 4 contest rules](https://dev.to/page/hacktoberfest-week4-2026-10-26-contest-rules) close entries **31 October 2026 at 11:59 PM PDT**, equivalent to **1 November 2026 at 12:29 PM IST**. The local history begins 27 October; the owner should confirm that the full project meets the new-work requirement.

The local prototype is demo-ready and technically ready for a public source release. The DEV entry remains unfinished until the real public code and demo links are added and the owner publishes it. Automated axe checks are partial accessibility evidence, not full WCAG certification.

## Final Git status and exact changed files

Branch: `main`. HEAD remains `f626f03` (`feat: add Ghost Mode and Hacktoberfest submission assets`). **24 modified tracked files and 7 new untracked files; nothing staged or committed.** No final diff in `OriginalDemo.jsx` or `ActiveDemo.jsx`. Environment examples and dependencies were inspected without changes; lockfile changes are license metadata only.

```text
 M README.md
 M client/package.json
 M client/src/components/CodeComparison.jsx
 M docs/architecture.md
 M docs/demo-results.md
 M docs/demo-script.md
 M docs/hacktoberfest-week4-submission.md
 M docs/phase4-verification.md
 M package-lock.json
 M package.json
 M server/package.json
 M server/src/app.js
 M server/src/index.js
 M server/src/services/applyProposal.js
 M server/src/services/buildRepairPrompt.js
 M server/src/services/fixGenerator.js
 M server/src/services/ollamaClient.js
 M server/src/services/structuredRepair.js
 M server/test/applyProposal.test.js
 M server/test/fixGenerator.test.js
 M server/test/ollamaClient.test.js
 M server/test/phase4Endpoint.test.js
 M server/test/repairPrompt.test.js
 M server/test/structuredRepair.test.js
?? LICENSE
?? THIRD_PARTY_NOTICES.md
?? docs/evidence/phase6-proof.json
?? docs/evidence/phase6-rejected-review.json
?? docs/screenshots/phase6-baseline.png
?? docs/screenshots/phase6-verified.png
?? scripts/e2e-proof.mjs
```

## Community Wisdom

### [Using LLMs to do security analysis at the git diff level — what works, what doesn't, and why structured output matters](https://dev.to/diffsense/using-llms-to-do-security-analysis-at-the-git-diff-level-what-works-what-doesnt-and-why-2a14)

> **Source:** [DiffSense](https://dev.to/diffsense)
> **Tags:** `python`, `devops`, `security`, `ai`
>
> The author describes structured JSON for machine-consumed findings and keeps model analysis as one layer before human review. This is one implementation account, with no comments shown when reviewed; it does not establish community consensus or validate AccessFix AI. The local validators and recorded independent scans provide this project's evidence.
>
> [Read Full Discussion](https://dev.to/diffsense/using-llms-to-do-security-analysis-at-the-git-diff-level-what-works-what-doesnt-and-why-2a14)
