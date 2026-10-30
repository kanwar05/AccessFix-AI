# AccessFix AI: Exorcising the Invisible Ghosts Haunting the Web

*This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 4: Ghost in the Machine](https://dev.to/challenges/hacktoberfest-week4-2026-10-26).*

> Local submission draft. Replace the public code/video placeholders and upload the real screenshots before publication. Do not publish this preparation note as article content.

## What I Built

A login form can look polished and still hide barriers: unnamed inputs, an icon-only button without an accessible name, or faint text. AccessFix AI reveals these “ghosts” through a real rendered accessibility scan, asks a local open-weight model for a small repair, and checks the result after explicit approval.

The application is deliberately scoped to one controlled React component. Ghost Mode shows real axe findings and keeps unresolved barriers visible. The safety boundary is part of the design: the model proposes a change, a person reviews it, and deterministic validators decide what the application is allowed to write.

## Demo

**Video: [add the genuine uploaded 90–120-second walkthrough URL before publishing].** A hosted demo URL is not currently available. The application runs locally using the README instructions.

On 30 October, the actual `qwen2.5-coder:1.5b` model selected a helper-text color change from `#a3a8b5` to `#000000`, based on axe's observed contrast failure. After review and approval, the fresh browser scan reported:

| Result | Before | After |
| --- | --- | --- |
| Violated rules | 3 | 2 |
| Unique affected elements | 4 | 3 |

**Resolved:** `color-contrast`. **Remaining:** `button-name`, `label`. **Introduced:** none. A separate Playwright context running axe directly confirmed the same result. Reset and another scan restored the original 3 rules and 4 affected elements.

![Actual baseline scan in Ghost Mode](screenshots/phase6-baseline.png)

![Actual verified improvement and remaining findings](screenshots/phase6-verified.png)

These are genuine application screenshots. The [complete evidence](demo-results.md) contains raw model output, proposal/scan IDs, approval records, the independent comparison and restoration hashes. Upload the screenshots to DEV and replace repository-relative evidence links with their real public locations when publishing.

## Code

**Public repository: [confirm public access and insert the real repository URL before publishing].** The configured Git remote is `https://github.com/kanwar05/AccessFix-AI.git`; this local verification did not establish public availability.

The code is MIT licensed, copyright 2026 Kanwar. See [architecture](architecture.md), [verification](phase4-verification.md) and [third-party notices](../THIRD_PARTY_NOTICES.md).

## How I Built It

React/Vite render the dashboard and isolated demo. Express owns the fixed source path and scan/proposal association. Playwright and axe-core inspect the actual rendered preview with all default enabled rules. Ollama serves the separately downloaded Apache-2.0-licensed Qwen2.5-Coder-1.5B-Instruct model locally.

The hardest failure was getting a small model to preserve unrelated JSX. An earlier rewrite deleted an existing comment and label styles, so the AST gate rejected it. Exact-string edits later confused browser HTML with source JSX. I kept the security policy and narrowed the model's output to a typed edit plan.

The model now selects a color and gives a finding-based reason. Deterministic code accepts only the existing supported color property, verifies the source/finding binding and numeric contrast, then translates the operation into reviewable JSX. Both the existing capability validator and AST comparison gate still run. The server checks the stored proposal and source fingerprints again before application.

One real Phase 6 candidate even passed code safety while making a false contrast claim. I rejected it during review and added a numeric check against axe's actual background and threshold. The next genuine model call produced the successful repair, and another real run repeated it after a final rollback fix. Even the final passing candidate's prose underestimated black-on-white contrast: the numeric check gives 21:1. This is why an AI rationale is never treated as verification.

The browser confirmation must be accepted before the frontend sends approval. The proof first canceled that dialog and observed zero apply requests and unchanged source. After explicit review, it accepted the dialog, applied the proposal, ran fresh verification and reset the demo. Failure-path regression tests cover rollback and rejected approvals.

Final checks: **74 server tests + 2 Ghost Mode tests**, lint and production build passed. The real model/browser proof runs separately from tests using injected dependencies.

## Why Does Open Innovation Matter?

With the documented Qwen/Ollama setup, source and findings stay on the developer's machine during inference. There is no hosted AI API key or per-request provider bill. The model tag, prompt, operation translator and validators are inspectable, so a rejected output can be understood and improved without granting the model broader write access.

Open weights also let someone reproduce the workflow with the exact model instead of trusting a screenshot of an opaque service. Installation and model/browser downloads require network access; the local inference claim applies after setup to the documented configuration. Different model/service configurations need their own privacy checks.

## My Agent Session

Optional: add a genuine exported development-session URL here, or remove this section before publication. No session URL has been invented or uploaded.

## The Spirit of It

The meaningful moment was small: one previously haunted rule disappeared after an independent scan, while two others stayed visible as **Still Haunting**. Ghost Mode makes hidden barriers inspectable, and the verification report earns each resolution claim. The project keeps its Halloween metaphor tied to real evidence.

## Prize Categories

No partner category is claimed. This project uses local Qwen/Ollama, React, Node.js, Playwright and axe-core; it does not claim an unimplemented sponsor integration.

## Limitations and disclosure

This is a controlled-component prototype with a narrow contrast-edit generation path. It does not repair arbitrary repositories or all accessibility barriers. Two violated rules remain after the demonstrated repair. Model output can be wrong or rejected; the AST policy is not a general JavaScript sandbox. Automated scans cannot establish full WCAG conformance or replace keyboard, screen-reader and content review.

AI coding assistance was used for implementation, debugging and this draft. Review and select the appropriate DEV AI disclosure setting when publishing; no external article has been created automatically.

Required tags: `devchallenge`, `hf26challenge`.

The [official rules](https://dev.to/page/hacktoberfest-week4-2026-10-26-contest-rules) require a published entry with code and demo links by **31 October 2026, 11:59 PM PDT / 1 November, 12:29 PM IST**. Confirm eligibility and the challenge-window new-work requirement before submitting.
