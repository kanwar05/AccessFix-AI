# AccessFix AI: Exorcising the Invisible Ghosts Haunting the Web

## What I Built

AccessFix AI is a local-first accessibility repair assistant for a controlled React login component. It renders the component, discovers genuine accessibility barriers with Playwright and axe-core, asks a local open-weight coding model for a bounded repair proposal, requires explicit human approval, applies only allowlisted changes, and verifies the result with a fresh scan.

Ghost Mode is the creative interpretation for “Ghost in the Machine”: accessibility barriers can be invisible in a visual review while creating serious obstacles for users. The interface makes those real findings inspectable without inventing violations or claiming an unverified repair.

## Demo

- Live demo: _placeholder — not yet available_
- Video: _placeholder — record locally using [the demo script](./demo-script.md)_

The genuine demo shows a baseline scan, actual axe findings, local model generation, read-only proposal review, explicit approval, AST-restricted application, after-scan verification, and reset. The current recorded model run is documented in [demo results](./demo-results.md).

## Code

- Repository: _placeholder — add the public repository URL before publishing_
- Architecture: [docs/architecture.md](./architecture.md)

## How I Built It

- React and Vite frontend
- Node.js and Express backend
- Ollama with the configured open-weight `qwen2.5-coder:1.5b` model
- Playwright and axe-core for rendered accessibility evidence
- Babel AST validation and a narrower apply allowlist for proposal safety
- Explicit apply, genuine verification, rollback and reset workflow

## Why Does Open Innovation Matter?

Local inference keeps source code on the developer’s machine, avoids a paid proprietary inference API for the supported setup, and makes the model choice visible and replaceable. The repair is not blindly trusted: the server limits the proposal, a person approves it, and an independent browser scan checks the result.

This project claims local-first operation after setup; it does not claim that installing Node, Chromium and Ollama requires no network access.

## My Agent Session

_Placeholder — add an existing genuine DevRelay or development-session link before publishing. No session link is invented here._

## The Spirit of It

Invisible accessibility problems are the ghosts of the web. Ghost Mode names the apparition, shows the affected element and rule, and reserves “Ghost Removed” for a rule that the after-scan actually verifies as resolved.

## Prize Categories

No partner prize category is claimed in this draft. The project uses Ollama, Playwright, axe-core, React and Node.js; it does not claim Gemma usage or another partner technology that is not present.

## Results and Limitations

The recorded baseline found 3 violated rules across 4 affected elements: `button-name`, `color-contrast` and `label`. The configured `qwen2.5-coder:1.5b` run was rejected because its edit plan did not match the controlled source, so no verified before/after improvement is claimed. See [the full recorded results](./demo-results.md).

The supported apply policy handles only a narrow set of accessibility changes. Model output can be malformed or rejected, and automated accessibility testing cannot establish full WCAG conformance or replace manual keyboard, screen-reader and content testing.

## Tags

`devchallenge` `hf26challenge`
