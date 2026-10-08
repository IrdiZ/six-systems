# One Patient, Six Systems

**Having every file about a patient is not the same as having the data.** This prototype simulates how hospital departments hand over data in their native formats, then measures how much of a "complete" patient case is actually usable as data.

- **Interactive demo:** https://irdiz.github.io/six-systems/
- **Plain-language explainer:** https://irdiz.github.io/six-systems/explained.html

| | |
|---|---|
| **97%** | of all true facts have a file in the archive: the case *looks* complete |
| **56%** | arrive usable as data: coded, right unit, right patient |
| **96%** | recovered by this pipeline after code maps, unit maths, identity matching, OCR and PDF reading (0 wrong values) |

*The percentages reflect how this simulation was built. They show the mechanism, not a measured rate at any hospital.*

## What this is, in plain words

Doctors and researchers at hospitals keep saying the same thing: *"we only get partial data."* That sounds odd, because hospitals store everything. But they store it for a **person to look at**, not for a **computer to use**. An ultrasound machine saves a picture of its screen with the numbers on it. A neighbouring lab sends results with its own codes and units. An emergency result goes by fax and never enters any system at all. It is like handing your accountant photos of receipts instead of a spreadsheet.

We can't use real patient data, so we made up a hospital:

1. **Simulator.** Invents 40 fake patients and their care, each on its own branching care path, and writes every department's files in its real, messy format. It also writes a hidden answer key with the true values.
2. **Assembler.** Tries to turn all those files into clean data: works out which patient each file belongs to, translates codes and units, and reads numbers off images and PDFs.
3. **Scoring.** Compares the result against the answer key the assembler never saw.

The result: the archive **looks** 97% complete, but only 56% of it arrives as usable data. With a lot of repair work the assembler gets that to 96%, with zero wrong values. The gap is the problem, and the repair work is the part nobody currently owns.

**Follow one patient.** The [explainer page](https://irdiz.github.io/six-systems/explained.html) walks through one invented patient's heart scare, using their actual files:

1. A faxed emergency-room result that is lost.
2. A regional lab file that needs its units converted.
3. The hospital's own lab result, which arrives clean.
4. An echo whose numbers must be read off a screenshot (OCR misread "cm" as "¢m").
5. A CT scan whose raw data was thrown away.
6. A finding that exists only as a sentence in a PDF.

**The question it asks.** The same gap shows up in two places with different owners. One is care between organisations: neighbouring hospitals, regional labs, GPs. The other is getting data out for research and AI. The prototype exists to ask which of the two hurts more in practice.

**What's in the demo:**
- Every fact shown as one coloured square.
- Each patient's timeline, which flips from "archive view" (everything looks present) to "data view" (colour-coded by outcome).
- Click any value to see where it came from, with the spot highlighted on the echo image or PDF.
- A coverage map of patients by facts.
- A one-click de-identified research export with a check that no names or IDs leak.

## What it does

Forty synthetic patients move through three branching care paths (chest pain, lung nodule, kidney follow-up; the decision rules come from ESC 2023, Fleischner 2017, NHG and KDIGO, cited in `sim/run.py`) across a fictional Dutch academic hospital, a neighbouring hospital, a regional lab, a GP practice and a shared pathology lab. Nine sources, each in its own format:

| Source | Format | What goes wrong, on purpose |
|---|---|---|
| Internal lab | HL7v2 ORU^R01, LOINC-coded | nothing: the clean baseline |
| Regional lab | EDIFACT-style MEDLAB | local codes, other units, decimal commas, missing BSNs |
| Radiology | DICOM CT + PDF report | raw projection data discarded; findings only in PDF text |
| Echo | DICOM Secondary Capture | measurements burned into pixels |
| Pathology | PDF + proprietary slide | diagnosis in PDF only; slide format unreadable |
| Never archived | fax, scanner memory | never reaches any system |
| GP practice | HIS export, NHG Tabel 45 codes | GP codes instead of LOINC, date without time, a point-of-care test with no LOINC at all |
| Referring hospital lab | HL7v2 ORU^R01, LOINC-coded | its own assays (troponin I, BNP: never converted to troponin T or NT-proBNP), a molar sibling code, nmol/L instead of µg/L |
| Lung function | PDF report | values only in a printed table |

The echo lab's newer machine also writes a DICOM Structured Report (LOINC + UCUM), the clean path next to the screen capture. Conversion factors come from published tables (AMA SI conversion table, NGSP for HbA1c, KDIGO for albumin/creatinine); HbA1c uses the IFCC formula, not a factor.

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
- **OCR readings are pinned.** Tesseract versions read the same pixels differently; `assemble/ocr_reference.json` keeps the reference build's readings per image so every machine assembles the same case. Delete it to read with your own Tesseract.
- **OCR has it easy here.** The screen captures are drawn with clean fonts; real ones are messier. Even so, Tesseract misreads "cm" as "¢m" and fails outright on two values, which the demo shows rather than hides.
- **It shows the shape of the problem**, modelled on public information about a typical Dutch academic hospital, not any hospital's real data flows.
