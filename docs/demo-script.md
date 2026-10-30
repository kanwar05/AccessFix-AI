# AccessFix AI demo script

Target: **110 seconds**. Use the local dashboard with Ollama and the exact `qwen2.5-coder:1.5b` model running. Start with **Reset Demo** in the verification section. Keep source review readable; use genuine application results throughout.

| Time | Screen and action | Narration |
| --- | --- | --- |
| 0:00–0:10 | Show the local dashboard and login preview. | “A page can look fine while invisible accessibility barriers haunt it. AccessFix AI makes those barriers visible.” |
| 0:10–0:28 | Enable Ghost Mode, select **Scan Accessibility**, expand actual findings. | “Playwright opens this controlled React preview and axe-core checks the rendered page. These rule IDs, selectors and failure summaries come from that scan.” |
| 0:28–0:50 | Select **Generate AI Fix**. Show the real generation/loading state, then model name and rationale. | “Qwen runs locally through Ollama. It chooses a small edit from the real findings and explains the choice. The server translates only a supported operation; both code validators still apply.” |
| 0:50–1:08 | Compare the original and proposed helper color. Select **Approve & Apply**, cancel the first confirmation, then review and explicitly accept the second. | “Generation changes nothing. Canceling approval also changes nothing. After review, I approve this proposal for the active demo.” |
| 1:08–1:33 | Show the genuine before/after verification counts and resolved/remaining IDs. Return to Ghost Mode and expand remaining findings. | “A fresh browser scan checks the result. The verified report shows what resolved and what remains. The remaining ghosts are still visible; no new violation is hidden.” |
| 1:33–1:50 | Select the enabled **Reset Demo** in the verification section, then **Scan Accessibility**. | “Reset restores the trusted original, and another scan confirms the initial barriers are back. The model proposes, a person approves, and the browser supplies the evidence.” |

The recorded counts and exact model-selected change are in [demo results](demo-results.md). Use the new run's results when recording; do not assume the model will choose the same color again.

Ghost Mode renders the latest findings. A resolved rule disappears from that list; its ID remains in the verification report. **Still Haunting** means the after-scan still reports that rule. **New Apparition** is shown only if a new rule was actually introduced. Do not promise an individual “Ghost Removed” card after it has left the current findings list.

If local inference takes longer than this plan allows, record the complete real workflow, then trim only waiting time and label the cut with actual elapsed time. Do not splice in a prepared patch, cached proposal or fabricated success. If generation or validation fails, show the error and describe that take as blocked.

Before recording, run `npm run check`, keep Vite/API/Ollama running, and verify that the baseline is restored. Avoid exposing unrelated windows or personal data. The fixture's credentials are demonstration strings. Automated axe results do not establish full WCAG conformance; keyboard, screen-reader and content review remain necessary.

For a repeatable evidence run with an explicit review pause, stop existing Vite/API processes and run `node scripts/e2e-proof.mjs`. Read the generated plan and exact source delta before entering the requested proposal-specific approval. The script calls the actual model, exercises the browser confirmation and reset, and writes new evidence and screenshots.
