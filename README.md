# One Patient, Six Systems

**Having every file about a patient is not the same as having the data.** This prototype simulates how hospital departments hand over data in their native formats, then measures how much of a "complete" patient case is actually usable as data.

- **Interactive demo:** https://irdiz.github.io/six-systems/
- **Plain-language explainer:** https://irdiz.github.io/six-systems/explained.html

| | |
|---|---|
| **91%** | of all true facts have a file in the archive: the case *looks* complete |
| **26%** | arrive usable as data: coded, right unit, right patient |
| **87%** | recovered by this pipeline after code maps, unit maths, identity matching, OCR and PDF reading (0 wrong values) |

## What it does

Twenty synthetic patients move through three care paths (chest pain, lung nodule, kidney follow-up) across a fictional Dutch academic hospital, a neighbouring hospital, a regional lab and a shared pathology lab. Six sources, six formats:

| Source | Format | What goes wrong, on purpose |
|---|---|---|
| Internal lab | HL7v2 ORU^R01, LOINC-coded | nothing: the clean baseline |
| Regional lab | EDIFACT-style MEDLAB | local codes, other units, decimal commas, missing BSNs |
| Radiology | DICOM CT + PDF report | raw projection data discarded; findings only in PDF text |
| Echo | DICOM Secondary Capture | measurements burned into pixels |
| Pathology | PDF + proprietary slide | diagnosis in PDF only; slide format unreadable |
| Never archived | fax, scanner memory | never reaches any system |

Every true fact ends up as one of four outcomes: **DATA** (usable on arrival), **CONFLICT** (usable after code, unit or identity repair), **PICTURE** (only recoverable by reading an image or PDF), **LOST** (never archived, unlinkable, or unreadable).

## How it works

```
sim/        simulator: patients, care paths, writes raw/<source>/* and a hidden raw/truth.json
assemble/   parsers per source, patient matching (BSN → hospital number → name + birth date),
            code and unit harmonisation, OCR (Tesseract) and PDF extraction, scoring vs truth
export/     research export: HMAC pseudonyms, per-patient date shift, DICOM de-identification
            (tags + burned-in banner masking), then a leak check over its own output
docs/       the static viewer (GitHub Pages): index.html, explained.html, data/cases.js, media/
```

The assembler never reads `truth.json`. Scoring compares its output with the answer key afterwards, which is what makes the numbers honest: not "how much did we find" but "how much of the truth survived".

## Run it

Needs Python 3.11+, [uv](https://docs.astral.sh/uv/) and Tesseract (`brew install tesseract`).

```sh
uv sync
uv run python build.py     # simulate → assemble → export → docs/
open docs/index.html
```

## Honest limits

- **All data is synthetic.** Every person, value and organisation is invented. BSNs pass the 11-proof check but belong to no one.
- **Not a medical device and not a product.** It is a question in the form of software.
- **Formats are simplified.** Realistic in shape, not certified in detail.
- **OCR has it easy here.** The screen captures are drawn with clean fonts; real ones are messier. Even so, Tesseract misreads "cm" as "¢m" and fails outright on two values, which the demo shows rather than hides.
- **It shows the shape of the problem**, modelled on public information about a typical Dutch academic hospital, not any hospital's real data flows.
