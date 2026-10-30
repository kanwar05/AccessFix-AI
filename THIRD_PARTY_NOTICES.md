# Third-party notices

AccessFix AI uses separately licensed dependencies and a separately downloaded model. The project's [MIT license](LICENSE) applies to AccessFix AI's own source; each dependency and model retains its respective license.

## Default local model

The documented Ollama tag is **`qwen2.5-coder:1.5b`**, based on Qwen2.5-Coder-1.5B-Instruct from the Qwen team, Alibaba Cloud.

- [Official Ollama tag and packaged license](https://ollama.com/library/qwen2.5-coder:1.5b)
- [Official upstream model card](https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct)
- [Official upstream Apache License 2.0 text](https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct/blob/main/LICENSE)
- [Qwen model-family licensing statement](https://qwenlm.github.io/blog/qwen2.5-coder-family/#model-license)

The exact 1.5B model is licensed under **Apache License 2.0**. This statement applies to the documented model, not every Qwen model size or later release. The model weights are not bundled with AccessFix AI; `ollama pull qwen2.5-coder:1.5b` downloads them separately. The Ollama listing identifies a Q4_K_M package of approximately 986 MB; actual storage and runtime memory requirements vary. Review and retain the model's license and notices if redistributing its weights or modified derivatives.

Ollama is also installed separately. Its [source and license](https://github.com/ollama/ollama/blob/main/LICENSE) apply to that software independently of model licensing.

## Main application dependencies

The root `package-lock.json` records exact installed versions. The following license identifiers were inspected in the installed package manifests for this release preparation; each package's included license governs its use.

| Package | Inspected version | License |
| --- | --- | --- |
| `react`, `react-dom` | 19.3.1 | MIT |
| `vite` | 8.3.5 | MIT |
| `express` | 5.3.0 | MIT |
| `playwright` | 1.64.1 | Apache-2.0 |
| `@axe-core/playwright`, `axe-core` | 4.14.0 | MPL-2.0 |
| `@babel/parser` | 7.29.11 | MIT |
| `tailwindcss` | 4.3.3 | MIT |
| `dotenv` | 18.0.9 | BSD-2-Clause |

Development tools and transitive packages have their own licenses. Preserve their distributed license/notice files when redistributing dependencies. This table acknowledges the main inspected packages; it is not a complete dependency license inventory.

Playwright downloads Chromium separately, including its third-party notices. Neither browser binaries nor npm dependencies nor model weights are committed in this repository.
