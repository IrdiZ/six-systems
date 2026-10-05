"""One parser per source. Each returns plain records; linking and status happen in run.py."""

import hashlib
import json
import re
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

import hl7
import numpy as np
import pdfplumber
import pydicom
import pytesseract
from PIL import Image

from sim.model import (EXT_LAB_CODES, FACTS, LOINC_ALIASES, NHG_MEMO, NHG_TO_FACT, NOT_CONVERTIBLE, UNIT_CONVERSIONS,
                       convert, to_canonical)

LOINC_TO_FACT = {f["loinc"]: k for k, f in FACTS.items() if f["loinc"]} | LOINC_ALIASES
EXT_CODE_TO_FACT = {c["code"]: k for k, c in EXT_LAB_CODES.items()}


@dataclass
class Rec:
    fact: str
    value: object
    unit: str | None
    time: str
    source: str
    file: str
    status: str  # DATA | CONFLICT | PICTURE | LOST
    steps: list[str] = field(default_factory=list)
    excerpt: str = ""
    media: dict | None = None
    bsn: str | None = None


@dataclass
class Doc:
    """A file as the archive shows it: something a clinician can open."""
    file: str
    source: str
    time: str
    title: str
    kind: str
    media: str | None = None
    bsn: str | None = None
    link: str = ""  # how the file was tied to a patient


# ---------------------------------------------------------------- HL7v2

def parse_hl7(path: Path, rel: str, source: str = "epic_lab") -> tuple[dict, list[Rec], Doc]:
    msg = hl7.parse(path.read_bytes().decode())  # read_text() would turn \r into \n
    pid = msg.segment("PID")
    ids = str(pid[3]).split("~")
    mrn = next(i.split("^")[0] for i in ids if i.endswith("^PI"))
    bsn = next(i.split("^")[0] for i in ids if "NNNLD" in i)
    family, given = (str(pid[5]).split("^") + [""])[:2]
    dob = _hl7_date(str(pid[7]))
    person = {"bsn": bsn, "mrn": mrn, "family": family, "given": given, "dob": dob}
    recs = []
    for obx in msg.segments("OBX"):
        loinc, label = str(obx[3]).split("^")[:2]
        fact = LOINC_TO_FACT.get(loinc)
        if not fact:
            continue
        if str(obx[2]) == "ST":  # coded text result, e.g. a dipstick
            recs.append(Rec(fact=fact, value=str(obx[5]), unit=None, time=_hl7_time(str(obx[14])), source=source, file=rel,
                            status="DATA", bsn=bsn, steps=[f"LOINC {loinc} already on the message", "text result", "BSN in PID-3"],
                            excerpt=f"{pid}\n{obx}"))
            continue
        sent, unit, canon = float(str(obx[5])), str(obx[6]), FACTS[fact]["unit"]
        value, status, steps = sent, "DATA", [f"LOINC {loinc} already on the message"]
        if loinc != FACTS[fact]["loinc"]:
            steps = [f"LOINC {loinc} (sibling code, other property) → {FACTS[fact]['loinc']}"]
            status = "CONFLICT"
        if unit != canon and (fact, unit) in UNIT_CONVERSIONS:
            op = UNIT_CONVERSIONS[(fact, unit)]
            value = round(convert(op, sent), 0 if canon == "ng/L" else 2)
            steps.append(f"{sent:g} {unit} → {value:g} {canon} ({op[0]}{op[1]:g})")
            status = "CONFLICT"
        else:
            steps.append(f"unit {unit} already canonical")
        if fact in NOT_CONVERTIBLE:
            steps.append(NOT_CONVERTIBLE[fact])
        steps.append("BSN in PID-3")
        recs.append(Rec(
            fact=fact, value=value, unit=canon, time=_hl7_time(str(obx[14])),
            source=source, file=rel, status=status, bsn=bsn, steps=steps, excerpt=f"{pid}\n{obx}",
        ))
    t = _hl7_time(str(msg.segment("MSH")[7]))
    doc = Doc(rel, source, t, f"Lab results · {len(recs)} values", "hl7", bsn=bsn, link="BSN on the message")
    return person, recs, doc


def _hl7_date(s: str) -> str:
    return f"{s[:4]}-{s[4:6]}-{s[6:8]}"


def _hl7_time(s: str) -> str:
    return datetime.strptime(s[:12], "%Y%m%d%H%M").isoformat(timespec="minutes")


# ---------------------------------------------------------------- EDIFACT-style

def parse_edi(path: Path, rel: str) -> tuple[dict, list[Rec], Doc]:
    lines = [ln for ln in path.read_text().splitlines() if ln and not ln.startswith("UNA")]
    segs = [ln.rstrip("'").split("+") for ln in lines]
    pna = next(s for s in segs if s[0] == "PNA")
    bsn = pna[2].split(":")[0] if len(pna) > 2 and pna[2] else None
    su = pna[5].split(":")  # SU:surname:VV:prefix
    surname, prefix = su[1], (su[3] if len(su) > 3 else "")
    given = pna[6].split(":")[1]
    dob_raw = next(s for s in segs if s[0] == "DTM" and s[1].startswith("329"))[1].split(":")[1]
    when_raw = next(s for s in segs if s[0] == "DTM" and s[1].startswith("119"))[1].split(":")[1]
    person = {"bsn": bsn, "family": f"{prefix} {surname}".strip(), "given": given, "dob": _hl7_date(dob_raw)}
    t = datetime.strptime(when_raw, "%Y%m%d%H%M").isoformat(timespec="minutes")
    pna_line = next(ln for ln in lines if ln.startswith("PNA"))
    recs = []
    for i, s in enumerate(segs):
        if s[0] != "INV":
            continue
        code = s[1].split(":")[0]
        rsl = segs[i + 1]
        raw_value, unit = rsl[2], rsl[3]
        fact = EXT_CODE_TO_FACT.get(code)
        if not fact:
            continue
        c = EXT_LAB_CODES[fact]
        steps = [f"local code {code} → LOINC {FACTS[fact]['loinc']} (hand-made code map)"]
        v = float(raw_value.replace(",", "."))
        if "," in raw_value:
            steps.append(f"decimal comma '{raw_value}' although the header declares '.'")
        canon, value = FACTS[fact]["unit"], to_canonical(fact, v)
        if "formula" in c:
            a, b = c["formula"]
            steps.append(f"{raw_value} {unit} → {value:.1f} {canon} (formula: IFCC = {a:g} × NGSP − {-b:.2f}; a plain factor would be wrong)")
        elif unit != canon and c["factor"] != 1.0:
            steps.append(f"{raw_value} {unit} → {value:.1f} {canon} (×{c['factor']:.4g})")
        elif unit != canon:
            steps.append(f"unit label '{unit}' → '{canon}'")
        recs.append(Rec(
            fact=fact, value=round(value) if "formula" in c else round(value, 2), unit=canon, time=t, source="ext_lab", file=rel,
            status="CONFLICT", steps=steps, excerpt="\n".join([pna_line, lines[i], lines[i + 1]]),
        ))
    doc = Doc(rel, "ext_lab", t, f"Regional lab batch · {len(recs)} values", "edi")
    return person, recs, doc


# ---------------------------------------------------------------- GP information system export (NHG Tabel 45)

def parse_gp(path: Path, rel: str) -> tuple[dict, list[Rec], Doc]:
    lines = path.read_text(encoding="utf-8").splitlines()
    head = lines.index("BSN;Achternaam;Voorvoegsel;Voornaam;Geboortedatum;Geslacht")
    bsn, surname, prefix, given, dob, _ = lines[head + 1].split(";")
    d, m, y = dob.split("-")
    person = {"bsn": bsn, "family": f"{prefix} {surname}".strip(), "given": given, "dob": f"{y}-{m}-{d}"}
    start = lines.index("NHG-nr;Memo;Datum;Uitslag;Eenheid") + 1
    recs, times = [], []
    for ln in lines[start:]:
        if not ln.strip():
            continue
        nhg, memo, date, raw, unit = ln.split(";")
        fact = NHG_TO_FACT.get(nhg)
        if not fact:
            continue
        d, m, y = date.split("-")
        t = f"{y}-{m}-{d}T00:00"
        times.append(t)
        loinc, canon = FACTS[fact]["loinc"], FACTS[fact]["unit"]
        steps = [f"NHG Tabel 45 {nhg} {memo} → LOINC {loinc}" if loinc else f"NHG Tabel 45 {nhg} {memo}: point-of-care test, no LOINC; NHG code kept"]
        if unit != canon:
            steps.append(f"unit label '{unit}' → '{canon}'")
        steps.append("measurement date only, no time")
        recs.append(Rec(fact=fact, value=float(raw.replace(",", ".")), unit=canon, time=t, source="gp", file=rel,
                        status="CONFLICT", steps=steps, excerpt=f"{lines[head]}\n{lines[head + 1]}\n{lines[start - 1]}\n{ln}", bsn=bsn))
    reason = next((ln.split(":", 1)[1].strip() for ln in lines if ln.startswith("# reden")), "")
    doc = Doc(rel, "gp", max(times) if times else "", f"GP referral · {reason}", "his", bsn=bsn, link="BSN on the export")
    return person, recs, doc


# ---------------------------------------------------------------- DICOM

# Tesseract versions read the same pixels differently. The readings of the reference build are pinned per image
# (SHA-256 of the pixel data), so every machine assembles the same case. Delete the file to read with your own Tesseract.
OCR_REFERENCE = Path(__file__).with_name("ocr_reference.json")
_OCR_PINNED = json.loads(OCR_REFERENCE.read_text(encoding="utf-8")) if OCR_REFERENCE.exists() else {}


def parse_dicom(path: Path, rel: str, media_dir: Path) -> tuple[dict, list[Rec], Doc]:
    ds = pydicom.dcmread(path)
    t = datetime.strptime(ds.StudyDate + ds.StudyTime[:4], "%Y%m%d%H%M").isoformat(timespec="minutes")
    person = {"mrn": str(ds.PatientID)}
    if ds.SOPClassUID == "1.2.840.10008.5.1.4.1.1.88.33":
        return person, *_parse_sr(ds, rel, t)
    header = (f"(0010,0020) PatientID      {ds.PatientID}\n"
              f"(0010,0010) PatientName    {ds.PatientName}\n"
              f"(0008,1030) StudyDescr     {ds.StudyDescription}\n"
              f"(0008,0060) Modality       {ds.Modality}\n"
              f"(0008,0016) SOPClassUID    {ds.SOPClassUID.name}")
    png = media_dir / (Path(rel).with_suffix("").as_posix().replace("/", "_") + ".jpg")  # speckle compresses badly as PNG
    if ds.SOPClassUID == "1.2.840.10008.5.1.4.1.1.7":
        img = Image.fromarray(ds.pixel_array)
        img.save(png, quality=82)
        key = hashlib.sha256(ds.PixelData).hexdigest()
        if key in _OCR_PINNED:
            recs = [Rec(**{**r, "time": t, "file": rel}) for r in _OCR_PINNED[key]]
        else:
            recs = _ocr_measurements(img, rel, t, header, png.name)
        source = "echo" if rel.startswith("raw/echo") else "radiology"
        doc = Doc(rel, source, t, f"{ds.StudyDescription} · screen capture", "sc", media=png.name)
        return person, recs, doc
    raise ValueError(f"not a secondary capture: {rel}")


def _parse_sr(ds, rel: str, t: str) -> tuple[list[Rec], Doc]:
    """DICOM Structured Report: every measurement already carries a code and a unit. The clean path for echo."""
    recs = []
    for it in ds.ContentSequence:
        if it.ValueType != "NUM":
            continue
        code = it.ConceptNameCodeSequence[0]
        fact = LOINC_TO_FACT.get(code.CodeValue)
        if not fact:
            continue
        mv = it.MeasuredValueSequence[0]
        sent, unit, canon = float(mv.NumericValue), mv.MeasurementUnitsCodeSequence[0].CodeValue, FACTS[fact]["unit"]
        steps = [f"DICOM SR NUM item: LOINC {code.CodeValue} ({code.CodeMeaning}), UCUM unit {unit}"]
        value = sent
        if unit != canon and (fact, unit) in UNIT_CONVERSIONS:
            op = UNIT_CONVERSIONS[(fact, unit)]
            value = round(convert(op, sent), 1)
            steps.append(f"{sent:g} {unit} → {value:g} {canon} ({op[0]}{op[1]:g}, UCUM prefix)")
        recs.append(Rec(fact=fact, value=value, unit=canon, time=t, source="echo", file=rel, status="DATA", steps=steps,
                        excerpt=f"(0040,A043) ConceptName  {code.CodeValue}^LN^{code.CodeMeaning}\n"
                                f"(0040,A30A) NumericValue {mv.NumericValue}\n(0040,08EA) Units        {unit}^UCUM"))
    doc = Doc(rel, "echo", t, f"{ds.StudyDescription} · structured report", "sr")
    return recs, doc


def parse_ct_series(folder: Path, rel: str, media_dir: Path) -> tuple[dict, list[Rec], Doc]:
    files = sorted(folder.glob("*.dcm"))
    ds = pydicom.dcmread(files[len(files) // 2])
    t = datetime.strptime(ds.StudyDate + ds.StudyTime[:4], "%Y%m%d%H%M").isoformat(timespec="minutes")
    hu = ds.pixel_array.astype(float) * ds.RescaleSlope + ds.RescaleIntercept
    lo, hi = -1150, 350
    img = Image.fromarray((np.clip((hu - lo) / (hi - lo), 0, 1) * 255).astype(np.uint8)).resize((320, 320))
    png = media_dir / (rel.replace("/", "_") + ".png")
    img.save(png)
    header = (f"(0010,0020) PatientID      {ds.PatientID}\n"
              f"(0008,1030) StudyDescr     {ds.StudyDescription}\n"
              f"(0008,0060) Modality       {ds.Modality}\n"
              f"(0020,0013) Images         {len(files)}")
    rec = Rec(fact="ct_exam", value=str(ds.StudyDescription), unit=None, time=t, source="radiology", file=rel,
              status="DATA", steps=["structured DICOM header"], excerpt=header, media={"png": png.name})
    doc = Doc(rel, "radiology", t, f"{ds.StudyDescription} · {len(files)} images", "ct", media=png.name)
    return {"mrn": str(ds.PatientID)}, [rec], doc


# Tolerant on purpose: real OCR turns "IVSd" into "IVSd_" and "cm" into "¢m" or "m".
SC_PATTERNS = {
    "lvef": (r"LVEF\S*\s*(\d+(?:[.,]\d+)?)\s*%", None),
    "ivs_thickness": (r"IVSd\S*\s*(\d+(?:[.,]\d+)?)\s*[c¢]?m", 10),
    "lv_diameter": (r"LVIDd\S*\s*(\d+(?:[.,]\d+)?)\s*[c¢]?m", 10),
    "kidney_length": (r"Nier\s*li\S*\s*(\d+(?:[.,]\d+)?)\s*[c¢]?m", 10),
    "kidney_length_right": (r"Nier\s*re\S*\s*(\d+(?:[.,]\d+)?)\s*[c¢]?m", 10),
}


def _ocr_measurements(img: Image.Image, rel: str, t: str, header: str, png: str) -> list[Rec]:
    grey = np.asarray(img.convert("L"))
    ink = np.where(grey > 200, 0, 255).astype(np.uint8)  # keep only bright burned-in text
    data = pytesseract.image_to_data(Image.fromarray(ink), output_type=pytesseract.Output.DICT, config="--psm 11")
    # group words into lines by vertical proximity (fixed buckets split 179 and 180 apart)
    lines: list[list[int]] = []
    for i in sorted((i for i, w in enumerate(data["text"]) if w.strip()), key=lambda i: data["top"][i]):
        if lines and abs(data["top"][i] - data["top"][lines[-1][0]]) < 15:
            lines[-1].append(i)
        else:
            lines.append([i])
    W, H = img.size
    recs = []
    for idxs in lines:
        idxs.sort(key=lambda i: data["left"][i])
        text = " ".join(data["text"][i] for i in idxs)
        for fact, (pattern, scale) in SC_PATTERNS.items():
            m = re.search(pattern, text)
            label = pattern.split(r"\S")[0].replace(r"\s*", " ")
            if not m and text.startswith(label):
                conf = min(float(data["conf"][i]) for i in idxs)
                recs.append(Rec(
                    fact=fact, value=None, unit=FACTS[fact]["unit"], time=t,
                    source="echo" if "echo" in rel else "radiology", file=rel, status="LOST",
                    steps=[f"OCR found the label {label} but not a readable value: \"{text}\" (confidence {conf:.0f}%)"],
                    excerpt=f"OCR line: \"{text}\"\n\n{header}", media={"png": png, "box": _line_box(data, idxs, W, H)},
                ))
                continue
            if not m:
                continue
            raw = float(m.group(1).replace(",", "."))
            steps = ["OCR on pixels burned into a DICOM Secondary Capture", f"OCR read: \"{m.group(0)}\""]
            value = raw
            if scale:
                value = round(raw * scale, 1)
                steps.append(f"{m.group(1)} cm → {value:g} mm")
            conf = min(float(data["conf"][i]) for i in idxs)
            steps.append(f"OCR confidence {conf:.0f}%")
            recs.append(Rec(
                fact=fact, value=value, unit=FACTS[fact]["unit"], time=t, source="echo" if "echo" in rel else "radiology",
                file=rel, status="PICTURE", steps=steps, excerpt=f"OCR line: \"{text}\"\n\n{header}",
                media={"png": png, "box": _line_box(data, idxs, W, H)},
            ))
    return recs


def _line_box(data: dict, idxs: list[int], W: int, H: int) -> list[float]:
    x0 = min(data["left"][i] for i in idxs)
    y0 = min(data["top"][i] for i in idxs)
    x1 = max(data["left"][i] + data["width"][i] for i in idxs)
    y1 = max(data["top"][i] + data["height"][i] for i in idxs)
    return _box(x0 - 6, y0 - 6, x1 + 6, y1 + 6, W, H)


def _box(x0, y0, x1, y1, W, H) -> list[float]:
    return [round(100 * x0 / W, 2), round(100 * y0 / H, 2), round(100 * (x1 - x0) / W, 2), round(100 * (y1 - y0) / H, 2)]


# ---------------------------------------------------------------- PDF

# fact: (pattern, text to highlight on the page; None = the matched value itself)
PDF_PATTERNS = {
    "calcium_score": (r"Agatston calciumscore:\s*(\d+)", "Agatston calciumscore"),
    "nodule_size": (r"diameter (\d+(?:[.,]\d+)?) mm", "diameter"),
    "tumour_size": (r"Tumorgrootte:\s*(\d+(?:[.,]\d+)?)\s*mm", "Tumorgrootte"),
    "path_diagnosis": (r"Conclusie\s+(.+?)\.(?:\s|$)", None, "pathology"),
    "pet_result": (r"PET-conclusie\s+(.+?)\.(?:\s|$)", None, "radiology"),
    "mdo_advice": (r"Advies\s+(.+?)\.(?:\s|$)", None, "mdo"),
    "heart_rate": (r"Ventrikelfrequentie\s+(\d+)", "Ventrikelfrequentie", "ecg"),
    "pr": (r"PR-interval\s+(\d+)", "PR-interval", "ecg"),
    "qrs": (r"QRS-duur\s+(\d+)", "QRS-duur", "ecg"),
    "qtc": (r"QT/QTc\s+\d+/(\d+)", "QT/QTc", "ecg"),
    "ecg_conclusion": (r"Conclusie\s+(.+?)\.(?:\s|$)", None, "ecg"),
    "cag_result": (r"Conclusie\s+(.+?)\.", None, "cathlab"),
    "fev1": (r"FEV1\s+(\d+[.,]\d+)\s*L", "FEV1"),
    "fvc": (r"(?<!/)FVC\s+(\d+[.,]\d+)\s*L", "FVC"),
    "fev1_fvc": (r"FEV1/FVC\s+(\d+)\s*%", "FEV1/FVC"),
    "dlco": (r"DLCO\s+(\d+[.,]\d+)\s*mmol", "DLCO"),
}


def parse_pdf(path: Path, rel: str, source: str, media_dir: Path) -> tuple[dict, list[Rec], Doc]:
    with pdfplumber.open(path) as pdf:
        page = pdf.pages[0]
        text = page.extract_text()
        png = media_dir / (rel.replace("/", "_") + ".png")
        page.to_image(resolution=72).save(png)
        W, H = page.width, page.height
        person = {}
        if m := re.search(r"BSN\s+(\d{9})", text):
            person["bsn"] = m.group(1)
        if m := re.search(r"Patiëntnummer\s+(\d+)", text):
            person["mrn"] = m.group(1)
        m = re.search(r"Datum\s+(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}:\d{2}))?", text)
        t = f"{m.group(3)}-{m.group(2)}-{m.group(1)}T{m.group(4) or '00:00'}"
        title = re.search(r"Onderzoek\s+(.+)", text)
        recs = []
        for fact, (pattern, anchor, *only) in PDF_PATTERNS.items():
            if only and only[0] != source:
                continue
            m = re.search(pattern, text, re.S)
            if not m:
                continue
            raw = " ".join(m.group(1).split())
            value = raw if FACTS[fact]["kind"] == "text" else float(raw.replace(",", "."))
            hits = page.search(anchor or raw, regex=False)
            box = None
            if hits:
                h = hits[0]
                box = _box(h["x0"] - 4, h["top"] - 3, min(W, h["x0"] + 330), h["bottom"] + 3, W, H)
            sentence = next((ln for ln in text.splitlines() if raw.split()[0] in ln), raw)
            recs.append(Rec(
                fact=fact, value=value, unit=FACTS[fact]["unit"], time=t, source=source, file=rel,
                status="PICTURE", steps=["text pulled out of a PDF with a pattern match", "no structured field behind it"],
                excerpt=f"PDF text: \"{sentence.strip()}\"", media={"png": png.name, "box": box},
            ))
    kind = "Pathology report" if source == "pathology" else "Pulmonary function report" if source == "pft" else "Coronary angiography report" if source == "cathlab" else "ECG" if source == "ecg" else "MDT meeting report" if source == "mdo" else "PET-CT report" if source == "pet" else f"Radiology report · {title.group(1).strip()}" if title else "Radiology report"
    return person, recs, Doc(rel, source, t, kind, "pdf", media=png.name)


def parse_slide(path: Path, rel: str) -> tuple[dict, list[Rec], Doc]:
    head = path.read_bytes()[:40]
    t = ""
    rec = Rec(fact="wsi_slide", value=None, unit=None, time=t, source="pathology", file=rel, status="LOST",
              steps=["vendor whole-slide format", "no open reader, no DICOM conversion available"],
              excerpt=f"first bytes: {head[:32]!r}")
    return {}, [rec], Doc(rel, "pathology", t, "Whole-slide image · proprietary", "wsi")
