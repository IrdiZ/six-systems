# Handover

Status and next steps for this repo. Read this first when you start a new session.
Last update: 2026-10-05.

## Current state

- The prototype is complete and public. Two commits on `main`, no open branches or PRs.
- Live site (GitHub Pages, from `docs/`):
  - Demo: https://irdiz.github.io/six-systems/
  - Plain-language explainer: https://irdiz.github.io/six-systems/explained.html
- Result of the current build: 91% of facts in the archive, 26% usable as data, 87% recovered by the pipeline, 0 wrong values.

## Rebuild

```sh
uv sync
uv run python build.py     # simulate → assemble → export → docs/
```

Needs Tesseract (`brew install tesseract`). The build is deterministic (seed 7).

## Map of the code

| Part | Files | Job |
|---|---|---|
| Simulator | `sim/` | Makes 20 synthetic patients, writes each department's files to `raw/`, writes the answer key `raw/truth.json`. |
| Assembler | `assemble/` | Parses each source, links files to patients, converts codes and units, runs OCR and PDF extraction, scores against the answer key. |
| Export | `export/deid.py` | Pseudonymises, shifts dates, de-identifies DICOM, then checks its own output for leaks. |
| Viewer | `docs/index.html`, `docs/app.js`, `docs/style.css` | The interactive demo. Reads `docs/data/cases.js`. |
| Explainer | `docs/explained.html` | Plain-language walkthrough of one patient. |

## Techniques

- No LLM. All extraction is rule-based.
- OCR: Tesseract on echo screenshots. It misreads "cm" as "¢m" and loses 2 of 28 values. Treat it as a placeholder.
- PDF: `pdfplumber` plus fixed regex patterns. This is the most fragile part, because real reports use varied wording.

## Open items

1. **Add a disclaimer line.** Put it in the explainer, the demo and the README: "The percentages reflect how this simulation was built. They show the mechanism, not a measured rate at any hospital."
2. **Fix the PDF highlight box.** It is too wide on radiology reports. The cause is the fixed width in `parse_pdf` in `assemble/parsers.py`.
3. **Consider new status labels.** The product UI uses Structured / Converted / Unverified / Not received. These are clearer for clinicians than DATA / CONFLICT / PICTURE / LOST.
4. **Product UI from a collaborator.** A clinical-style UI (worklist, Verify and Request actions, management overview) exists outside this repo. Plan: add it as its own page, e.g. `docs/product.html`, through a branch and a PR, not directly on `main`.
5. **Possible next experiment.** Compare OCR engines (Tesseract, Apple Vision, PaddleOCR, a local vision model) with the answer-key scoring. Count values recovered and values wrong per engine.
6. **"Expected but missing" detection.** The demo knows a fax is missing only because of the answer key. A real system must infer it, e.g. from an ER visit with no troponin result, or an order with no result.

## Rules for this repo

- The repo is public. Commit only synthetic data and fictional organisations.
- Do not commit real names of people, real hospitals, or screenshots of real hospital software.
- Before each push, scan for private names and check `git status`.
- Use the GitHub no-reply address as the commit author. Do not add a co-author trailer.
- Review every PR from a collaborator on a branch before it goes to `main`.
