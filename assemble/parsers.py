"""One parser per source. Each returns plain records; linking and status happen in run.py."""

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

from sim.model import EXT_LAB_CODES, FACTS

LOINC_TO_FACT = {f["loinc"]: k for k, f in FACTS.items() if f["loinc"]}
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

def parse_hl7(path: Path, rel: str) -> tuple[dict, list[Rec], Doc]:
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
        recs.append(Rec(
            fact=fact, value=float(str(obx[5])), unit=str(obx[6]), time=_hl7_time(str(obx[14])),
            source="epic_lab", file=rel, status="DATA", bsn=bsn,
            steps=[f"LOINC {loinc} already on the message", f"unit {obx[6]} already canonical", "BSN in PID-3"],
            excerpt=f"{pid}\n{obx}",
        ))
    t = _hl7_time(str(msg.segment("MSH")[7]))
    doc = Doc(rel, "epic_lab", t, f"Lab results · {len(recs)} values", "hl7", bsn=bsn, link="BSN on the message")
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
        canon = FACTS[fact]["unit"]
        if unit != canon and c["factor"] != 1.0:
            steps.append(f"{raw_value} {unit} → {v * c['factor']:.1f} {canon} (×{c['factor']:.4g})")
        elif unit != canon:
            steps.append(f"unit label '{unit}' → '{canon}'")
        recs.append(Rec(
            fact=fact, value=round(v * c["factor"], 2), unit=canon, time=t, source="ext_lab", file=rel,
            status="CONFLICT", steps=steps, excerpt="\n".join([pna_line, lines[i], lines[i + 1]]),
        ))
    doc = Doc(rel, "ext_lab", t, f"Regional lab batch · {len(recs)} values", "edi")
    return person, recs, doc


# ---------------------------------------------------------------- DICOM

def parse_dicom(path: Path, rel: str, media_dir: Path) -> tuple[dict, list[Rec], Doc]:
    ds = pydicom.dcmread(path)
    t = datetime.strptime(ds.StudyDate + ds.StudyTime[:4], "%Y%m%d%H%M").isoformat(timespec="minutes")
    person = {"mrn": str(ds.PatientID)}
    header = (f"(0010,0020) PatientID      {ds.PatientID}\n"
              f"(0010,0010) PatientName    {ds.PatientName}\n"
              f"(0008,1030) StudyDescr     {ds.StudyDescription}\n"
              f"(0008,0060) Modality       {ds.Modality}\n"
              f"(0008,0016) SOPClassUID    {ds.SOPClassUID.name}")
    png = media_dir / (Path(rel).with_suffix("").as_posix().replace("/", "_") + ".jpg")  # speckle compresses badly as PNG
    if ds.SOPClassUID == "1.2.840.10008.5.1.4.1.1.7":
        img = Image.fromarray(ds.pixel_array)
        img.save(png, quality=82)
        recs = _ocr_measurements(img, rel, t, header, png.name)
        source = "echo" if rel.startswith("raw/echo") else "radiology"
        doc = Doc(rel, source, t, f"{ds.StudyDescription} · screen capture", "sc", media=png.name)
        return person, recs, doc
    raise ValueError(f"not a secondary capture: {rel}")


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
            label = pattern.split("\\")[0]
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
    "path_diagnosis": (r"Conclusie\s+(.+?)\.\s*Tumorgrootte", None),
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
        for fact, (pattern, anchor) in PDF_PATTERNS.items():
            m = re.search(pattern, text, re.S)
            if not m:
                continue
            raw = " ".join(m.group(1).split())
            value = raw if fact == "path_diagnosis" else float(raw.replace(",", "."))
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
    kind = "Pathology report" if source == "pathology" else f"Radiology report · {title.group(1).strip()}" if title else "Radiology report"
    return person, recs, Doc(rel, source, t, kind, "pdf", media=png.name)


def parse_slide(path: Path, rel: str) -> tuple[dict, list[Rec], Doc]:
    head = path.read_bytes()[:40]
    t = ""
    rec = Rec(fact="wsi_slide", value=None, unit=None, time=t, source="pathology", file=rel, status="LOST",
              steps=["vendor whole-slide format", "no open reader, no DICOM conversion available"],
              excerpt=f"first bytes: {head[:32]!r}")
    return {}, [rec], Doc(rel, "pathology", t, "Whole-slide image · proprietary", "wsi")
