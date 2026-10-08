# One Patient, Six Systems

**Having every file about a patient is not the same as having the data.** This prototype simulates how hospital departments hand over data in their native formats. Then it measures how much of a "complete" patient case is actually usable as data.

| Page | What it shows |
|---|---|
| [Explained](https://irdiz.github.io/six-systems/explained.html) | The idea in plain language, with one patient's journey through the files |
| [The gap](https://irdiz.github.io/six-systems/) | Every fact for 40 patients, the archive view next to the computable view |
| [Clinical tool](https://irdiz.github.io/six-systems/handover/) | How a clinician could work with it: worklist, verify, request, management |

| | |
|---|---|
| **97%** | of all true facts have a file in the archive: the case *looks* complete |
| **56%** | arrive usable as data: coded, in the right unit, tied to the right patient |
| **96%** | recovered by this pipeline after code maps, unit maths, identity matching, OCR and PDF reading (0 wrong values) |

*The percentages reflect how this simulation was built. They show the mechanism, not a measured rate at any hospital.*

## In plain words

Doctors and researchers at hospitals keep saying the same thing: *"we only get partial data."* That sounds odd, because hospitals store everything. But they store it for a **person to look at**, not for a **computer to use**:

- An ultrasound machine saves a picture of its screen with the numbers on it.
- A neighbouring lab sends results with its own codes and units.
- An emergency result goes by fax and never enters any system.

It is like handing your accountant photos of receipts instead of a spreadsheet.

We can't use real patient data, so we made up a hospital:

1. **Simulator.** Invents 40 patients on branching care paths. It writes every department's files in its real, messy format, plus a hidden answer key with the true values.
2. **Assembler.** Turns those files into data. It links each file to a patient, translates codes and units, and reads numbers off images and PDFs.
3. **Scoring.** Compares the result with the answer key, which the assembler never saw.

**The question it asks.** The same gap shows up in two places, with different owners. One is care between organisations: neighbouring hospitals, regional labs, GPs. The other is getting data out for research and AI. The prototype exists to ask which of the two hurts more in practice.

## The four outcomes

Every true fact ends with one status. The pages use the names in the first column; the code uses the names in brackets.

| Status | Meaning |
|---|---|
| **Structured** (`DATA`) | Usable on arrival: coded, right unit, right patient |
| **Converted** (`CONFLICT`) | Usable after code, unit or identity repair |
| **Unverified** (`PICTURE`) | Only recoverable by reading an image or a PDF |
| **Not received** (`LOST`) | Never archived, not linkable to a patient, or unreadable |

## The sources

Forty patients follow three care paths: chest pain, lung nodule and kidney follow-up. The decision rules come from ESC 2023, Fleischner 2017, NHG and KDIGO, cited in `sim/run.py`. All organisations are fictional.

| Source | Format | What goes wrong, on purpose |
|---|---|---|
| Internal lab | HL7v2 ORU^R01, LOINC-coded | Nothing: the clean baseline |
| Regional lab | EDIFACT-style MEDLAB | Local codes, other units, decimal commas, missing BSNs |
| Referring hospital lab | HL7v2 ORU^R01, LOINC-coded | Its own assays (troponin I, BNP), a molar sibling code, nmol/L instead of µg/L |
| General practice | HIS export, NHG Tabel 45 | GP codes instead of LOINC, dates without times, a point-of-care test with no LOINC |
| Radiology | DICOM CT + PDF report | Raw projection data discarded; findings only in PDF text |
| Echo | DICOM Secondary Capture (and SR) | Measurements burned into pixels; the newer machine also writes a Structured Report |
| ECG | PDF report | Intervals and conclusion only in print |
| Catheterisation lab | PDF report | Conclusion only in print |
| Lung function | PDF report | Values only in a printed table |
| Pathology | PDF + proprietary slide | Diagnosis in PDF only; slide format unreadable |
| MDT meeting | PDF report | Advice only in print |
| Never archived | Fax, scanner memory | Never reaches any system |

Conversion factors come from published tables (AMA SI conversion table, NGSP for HbA1c, KDIGO for albumin/creatinine). HbA1c uses the IFCC formula, not a factor.

## How it works

```
sim/        simulator: patients, care paths, writes raw/<source>/* and a hidden raw/truth.json
assemble/   one parser per source, patient matching (BSN, then hospital number, then name + birth date),
            code and unit conversion, OCR (Tesseract) and PDF extraction, scoring against the answer key
export/     research export: HMAC pseudonyms, per-patient date shift, DICOM de-identification
            (tags + burned-in banner masking), then a leak check over its own output
docs/       the website (GitHub Pages): explained.html, index.html (the gap), handover/ (clinical tool)
video/      renders the clinical tool to MP4 from a timeline file
```

The assembler never reads `truth.json`. Scoring compares its output with the answer key afterwards. That makes the numbers honest: not "how much did we find", but "how much of the truth survived".

## Run it

Needs Python 3.11+, [uv](https://docs.astral.sh/uv/) and Tesseract (`brew install tesseract`).

```sh
uv sync
uv run python build.py                      # simulate → assemble → export → docs/
python docs/handover/standalone.py          # the clinical tool as one offline HTML file
open docs/index.html
```

Videos need Playwright and ffmpeg. See [video/README.md](video/README.md).

## Honest limits

- **All data is synthetic.** Every person, value and organisation is invented. BSNs pass the 11-proof check but belong to no one.
- **Not a medical device and not a product.** It is a question in the form of software.
- **Formats are simplified.** Realistic in shape, not certified in detail.
- **OCR readings are pinned.** Tesseract versions read the same pixels differently. `assemble/ocr_reference.json` keeps the reference build's readings per image, so every machine assembles the same case. Delete it to read with your own Tesseract.
- **OCR has it easy here.** The screen captures use clean fonts; real ones are messier. Even so, Tesseract misreads "cm" as "¢m" and fails on some values. The pages show this rather than hide it.
- **It shows the shape of the problem.** It is modelled on public information about a typical Dutch academic hospital, not on any hospital's real data flows.
