# Handover

Status and next steps for this repo. Read this first when you start a new session.
Last update: 2026-10-08.

## Current state

- The prototype is public. PR #1 (@danilosolciaa: clinical tool UI, 40-patient simulation, video pipeline) is merged into `main`.
- Live site (GitHub Pages, from `docs/`):
  - Demo: https://irdiz.github.io/six-systems/
  - Plain-language explainer: https://irdiz.github.io/six-systems/explained.html
  - Clinical tool (@danilosolciaa): https://irdiz.github.io/six-systems/handover/
- Result of the current build: 40 patients, 1,664 facts. 97% in the archive, 56% usable as data, 96% recovered by the pipeline, 0 wrong values.

## Rebuild

```sh
uv sync
uv run python build.py     # simulate → assemble → export → docs/
```

Needs Tesseract (`brew install tesseract`). The build is deterministic (seed 7).

## Map of the code

| Part | Files | Job |
|---|---|---|
| Simulator | `sim/` | Makes 40 synthetic patients, writes each department's files to `raw/`, writes the answer key `raw/truth.json`. |
| Assembler | `assemble/` | Parses each source, links files to patients, converts codes and units, runs OCR and PDF extraction, scores against the answer key. |
| Export | `export/deid.py` | Pseudonymises, shifts dates, de-identifies DICOM, then checks its own output for leaks. |
| Viewer | `docs/index.html`, `docs/app.js`, `docs/style.css` | The interactive demo. Reads `docs/data/cases.js`. |
| Explainer | `docs/explained.html` | Plain-language walkthrough of one patient. |

## Techniques

- No LLM. All extraction is rule-based.
- OCR: Tesseract on echo screenshots. It misreads "cm" as "¢m" and fails on some values. Treat it as a placeholder. Readings are pinned in `assemble/ocr_reference.json`.
- PDF: `pdfplumber` plus fixed regex patterns. This is the most fragile part, because real reports use varied wording.

## Open items

1. **Fix the PDF highlight box.** It is too wide on radiology reports. The cause is the fixed width in `parse_pdf` in `assemble/parsers.py`.
2. **Clinical tool (`docs/handover/`) audit, 2026-10-08, not yet fixed.**
   - 14 facts are dated after the generation time (up to 2027-02-06). Cap timestamps in `sim/`.
   - The tool totals 1,627 results because it drops the 37 CT raw-data facts. The rest of the site says 1,664. Add a note or a total row.
   - The tool uses seven status words ("Not stored", "Not legible", "Code mapped", "Verified"). The site uses four. Show the subtype as detail text.
   - There is no "synthetic data" note in the visible UI, and the brand reads "DEMO".
   - There is no phone layout. Add a "best on a desktop screen" note.
3. **Possible next experiment.** Compare OCR engines (Tesseract, Apple Vision, PaddleOCR, a local vision model) with the answer-key scoring. Count values recovered and values wrong per engine.
4. **"Expected but missing" detection.** The demo knows a fax is missing only because of the answer key. A real system must infer it, e.g. from an ER visit with no troponin result, or an order with no result.

Done on 2026-10-08: timeline lanes follow each patient's sources (all 2,044 markers checked); hovered markers stay in place; fast-cut video (`video/timeline-pitch.json`); disclaimer on all pages; status labels Structured / Converted / Unverified / Not received; one design language across all three pages (shared top bar); Wegiz text corrected (BgZ now follows the EHDS dates, 2029 and 2031).

## Pages

| Page | Path | Notes |
|---|---|---|
| Explained | `docs/explained.html` | Walkthrough picks the chest-pain patient with the most steps; each step shows only if the data has it. |
| The gap | `docs/index.html` | Archive view versus computable view. |
| Clinical tool | `docs/handover/` | @danilosolciaa's UI. `docs/handover/standalone.py` writes a single offline HTML file. |
| Videos | `video/` | `timeline.json`: calm 2-minute walkthrough. `timeline-pitch.json`: 56-second fast cut for a voiceover. See `video/README.md`. |

## Rules for this repo

- The repo is public. Commit only synthetic data and fictional organisations.
- Do not commit real names of people, real hospitals, or screenshots of real hospital software.
- Before each push, scan for private names and check `git status`.
- Use the GitHub no-reply address as the commit author. Do not add a co-author trailer.
- Review every PR from a collaborator on a branch before it goes to `main`.
