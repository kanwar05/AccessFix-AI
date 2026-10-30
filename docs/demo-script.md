# AccessFix AI demo script

Target length: 90–120 seconds. Run locally with the documented `npm run dev` command. Do not present placeholder, cached, or fabricated model output as live output.

## Opening — 0:00–0:15

Show the AccessFix AI dashboard and say: “A page can look correct while invisible barriers prevent people from using it. AccessFix AI finds those barriers in the rendered component.”

Point out that the dashboard is local-first and that the configured model is shown after a proposal is generated.

## Discovery — 0:15–0:35

1. Open the original login preview.
2. Turn on **Ghost Mode**.
3. Select **Scan Accessibility**.
4. Expand the actual axe findings and show the rule ID, impact, affected selector and remediation guidance.

Say: “These ghosts are not a scripted list. They are the findings from this completed Playwright and axe-core scan.”

## AI repair — 0:35–0:58

1. Select **Generate AI Fix**.
2. Show the configured Ollama model and the read-only proposal.
3. Explain that the proposal is source-bound and has not changed the preview.
4. Review the code comparison before selecting **Approve & Apply**.

If the model is unavailable or its output is rejected by the safety gate, show the error honestly and continue with the safety explanation. Do not substitute a prepared patch.

## Safety and proof — 0:58–1:20

After an accepted proposal, show the explicit approval action, the AST-restricted apply step and the genuine after-scan. In Ghost Mode, show **Ghost Removed**, **Still Haunting** and **New Apparition** only when the verification report contains those rule IDs.

Say: “The model suggests a change; a human approves it; the server restricts what can be written; Playwright and axe-core provide the proof.”

## Ending — 1:20–1:40

Select **Reset Demo** and show that the trusted original is restored. End with: “AccessFix AI reveals and repairs hidden web accessibility problems using open-weight AI, while keeping the source local and the evidence visible.”

## Recording checklist

- Use a fresh scan for the recording.
- Capture the model name, scan ID, baseline counts and after-scan counts.
- Do not claim a repair unless verification returns it.
- If generation is blocked, record the exact error and label the workflow as blocked.
- Respect reduced motion and keep the browser zoom/viewport readable.
