"""Write each department's data in its native, messy format.

Simplified but recognisable versions of HL7v2, EDIFACT, DICOM and PDF.
Realistic in shape, not certified in detail.
"""

import random
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from pydicom.dataset import Dataset, FileMetaDataset
from pydicom.uid import ExplicitVRLittleEndian, generate_uid
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from .model import (EXT_LAB, EXT_LAB_CODE, EXT_LAB_CODES, FACTS, GP_PRACTICE, HOSPITAL, HOSPITAL_CODE, NEIGHBOUR,
                    NHG_MEMO, PATH_LAB, to_local)
from .patients import Patient

CT_IMAGE = "1.2.840.10008.5.1.4.1.1.2"
SECONDARY_CAPTURE = "1.2.840.10008.5.1.4.1.1.7"


# ---------------------------------------------------------------- HL7v2 (internal lab)

def write_hl7(path: Path, p: Patient, when: datetime, results: list[tuple[str, float]], msg_id: str) -> None:
    rows = [(FACTS[f]["loinc"], FACTS[f]["label"], value, FACTS[f]["unit"]) for f, value in results]
    write_hl7_rows(path, p, when, rows, msg_id, "LABSYS", HOSPITAL_CODE, p.mrn)


def write_hl7_rows(path: Path, p: Patient, when: datetime, rows: list[tuple[str, str, float, str]], msg_id: str,
                   app: str, facility: str, mrn: str) -> None:
    """rows: (LOINC, label, value, unit as sent). PID-3 carries the sending facility's own record number."""
    ts = when.strftime("%Y%m%d%H%M")
    segs = [
        f"MSH|^~\\&|{app}|{facility}|RESULTS|{HOSPITAL_CODE}|{ts}||ORU^R01^ORU_R01|{msg_id}|P|2.5.1",
        f"PID|1||{mrn}^^^{facility}^PI~{p.bsn}^^^NLMINBIZA^NNNLD||{p.family}^{p.given}||{p.dob:%Y%m%d}|{p.sex}",
        f"OBR|1|{msg_id}||LAB^Laboratory panel^L|||{ts}",
    ]
    for i, (loinc, label, value, unit) in enumerate(rows, 1):
        kind, v = ("ST", value) if isinstance(value, str) else ("NM", _fmt(value, 2 if round(value, 2) != round(value, 1) else 1))
        segs.append(f"OBX|{i}|{kind}|{loinc}^{label}^LN||{v}|{unit or ''}|||||F|||{ts}")
    path.write_text("\r".join(segs) + "\r")


# ---------------------------------------------------------------- GP information system export (NHG Tabel 45)

def write_gp_export(path: Path, p: Patient, rows: list[tuple[str, datetime, float, str]], reason: str) -> None:
    """A referral's measurement section as a GP system exports it: NHG numbers, Dutch dates, decimal commas.
    rows: (NHG number, date, value, unit as the GP system writes it)."""
    lines = [
        f"# {GP_PRACTICE} · verwijzing · export huisartsinformatiesysteem",
        f"# reden: {reason}",
        "BSN;Achternaam;Voorvoegsel;Voornaam;Geboortedatum;Geslacht",
        f"{p.bsn};{p.surname};{p.prefix};{p.given};{p.dob:%d-%m-%Y};{p.sex}",
        "",
        "NHG-nr;Memo;Datum;Uitslag;Eenheid",
    ]
    for nhg, when, value, unit in rows:
        v = _fmt(value, 0 if float(value).is_integer() else 1).replace(".", ",")
        lines.append(f"{nhg};{NHG_MEMO.get(nhg, '')};{when:%d-%m-%Y};{v};{unit}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


# ---------------------------------------------------------------- EDIFACT-style (regional lab)

def write_edi(
    path: Path,
    p: Patient,
    when: datetime,
    results: list[tuple[str, float]],
    batch_id: str,
    omit_bsn: bool = False,
    dob_typo: bool = False,
    decimal_comma: bool = True,
    requester: str = NEIGHBOUR,
) -> None:
    dob = p.dob
    if dob_typo:  # day and month swapped by hand at the counter
        dob = dob.replace(day=dob.month, month=dob.day) if dob.day <= 12 and dob.day != dob.month else dob.replace(year=dob.year + 1)
    bsn = "" if omit_bsn else f"{p.bsn}:BSN"
    lines = [
        "UNA:+.? '",
        f"UNB+UNOC:3+{EXT_LAB_CODE}+{HOSPITAL_CODE}+{when:%y%m%d:%H%M}+{batch_id}'",
        "UNH+1+MEDLAB:1:1:NL'",
        f"BGM+LRP+{batch_id}'",
        f"NAD+SND+++{EXT_LAB}'",
        f"NAD+REQ+++{requester}'",
        f"PNA+PAT+{bsn}+++SU:{p.surname}:VV:{p.prefix}+FO:{p.given}'",
        f"DTM+329:{dob:%Y%m%d}:102'",
        f"DTM+119:{when:%Y%m%d%H%M}:203'",
    ]
    for fact, value in results:
        c = EXT_LAB_CODES[fact]
        v = _fmt(to_local(fact, value), c["decimals"])
        if decimal_comma:
            v = v.replace(".", ",")
        lines += [f"INV+{c['code']}:{c['name']}:L'", f"RSL+NV+{v}+{c['unit']}'"]
    lines += [f"UNT+{len(lines) - 1}+1'", f"UNZ+1+{batch_id}'"]
    path.write_text("\n".join(lines) + "\n")


# ---------------------------------------------------------------- DICOM

def _dicom_base(p: Patient, when: datetime, sop_class: str, accession: str, description: str, modality: str) -> Dataset:
    meta = FileMetaDataset()
    meta.MediaStorageSOPClassUID = sop_class
    meta.MediaStorageSOPInstanceUID = generate_uid()
    meta.TransferSyntaxUID = ExplicitVRLittleEndian
    ds = Dataset()
    ds.file_meta = meta
    ds.SOPClassUID = sop_class
    ds.SOPInstanceUID = meta.MediaStorageSOPInstanceUID
    ds.PatientName = f"{p.family}^{p.given}"
    ds.PatientID = p.mrn  # the archive knows the hospital number, not the BSN
    ds.IssuerOfPatientID = HOSPITAL_CODE
    ds.PatientBirthDate = p.dob.strftime("%Y%m%d")
    ds.PatientSex = p.sex
    ds.InstitutionName = HOSPITAL
    ds.StudyDate = ds.SeriesDate = ds.ContentDate = when.strftime("%Y%m%d")
    ds.StudyTime = ds.SeriesTime = ds.ContentTime = when.strftime("%H%M%S")
    ds.AccessionNumber = accession
    ds.StudyDescription = description
    ds.Modality = modality
    ds.StudyInstanceUID = generate_uid()
    ds.SeriesInstanceUID = generate_uid()
    return ds


def write_ct_series(folder: Path, p: Patient, when: datetime, accession: str, description: str,
                    rng: random.Random, nodule_mm: float | None = None, slices: int = 5) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    base = _dicom_base(p, when, CT_IMAGE, accession, description, "CT")
    n = 160
    yy, xx = np.mgrid[0:n, 0:n]
    nrng = np.random.default_rng(rng.randint(0, 2**31))
    for i in range(slices):
        img = np.full((n, n), -1000, np.int16)
        body = ((xx - n / 2) / 70) ** 2 + ((yy - n / 2) / 52) ** 2 <= 1
        img[body] = 40
        for cx in (n / 2 - 30, n / 2 + 30):  # lungs
            lung = ((xx - cx) / 24) ** 2 + ((yy - n / 2) / 38) ** 2 <= 1
            img[lung] = -820
        if "coronair" in description.lower():
            heart = ((xx - n / 2 - 4) / 20) ** 2 + ((yy - n / 2 - 6) / 18) ** 2 <= 1
            img[heart] = 60
        if nodule_mm and abs(i - slices // 2) <= 1:
            r = max(1.5, nodule_mm / 3)
            nod = (xx - (n / 2 + 34)) ** 2 + (yy - (n / 2 - 14)) ** 2 <= r**2
            img[nod] = 30
        img = (img + nrng.normal(0, 18, img.shape)).astype(np.int16)
        ds = base.copy()
        ds.file_meta = base.file_meta.copy()
        ds.SOPInstanceUID = ds.file_meta.MediaStorageSOPInstanceUID = generate_uid()
        ds.InstanceNumber = i + 1
        ds.SliceThickness = 3.0
        ds.Rows, ds.Columns = img.shape
        ds.SamplesPerPixel = 1
        ds.PhotometricInterpretation = "MONOCHROME2"
        ds.BitsAllocated = ds.BitsStored = 16
        ds.HighBit = 15
        ds.PixelRepresentation = 1
        ds.RescaleIntercept, ds.RescaleSlope = 0, 1
        ds.WindowCenter, ds.WindowWidth = -400, 1500
        ds.PixelData = img.tobytes()
        ds.save_as(folder / f"slice_{i + 1:03d}.dcm", enforce_file_format=True)


def _font(size: int) -> ImageFont.ImageFont:
    return ImageFont.load_default(size=size)


def write_secondary_capture(path: Path, p: Patient, when: datetime, accession: str, description: str,
                            lines: list[str], rng: random.Random, device: str, faint: set[int] = frozenset()) -> None:
    """An ultrasound screen grab: a speckle sector plus the measurements burned into the pixels.
    faint: lines whose value the sonographer's caliper overlay left low-contrast (the label stays readable)."""
    w, h = 900, 600
    nrng = np.random.default_rng(rng.randint(0, 2**31))
    yy, xx = np.mgrid[0:h, 0:w]
    apex_x, apex_y = 330, 40
    ang = np.degrees(np.arctan2(xx - apex_x, yy - apex_y))
    rad = np.hypot(xx - apex_x, yy - apex_y)
    sector = (np.abs(ang) < 38) & (rad < 520) & (rad > 20)
    speckle = np.clip(nrng.gamma(1.6, 38, (h, w)), 0, 170)
    tissue = np.where(sector, speckle, 0)
    # a dark cavity, so it reads as a heart or kidney at a glance
    cav = ((xx - apex_x) / 70) ** 2 + ((yy - 300) / 120) ** 2 <= 1
    tissue[cav & sector] *= 0.15
    rgb = np.stack([tissue] * 3, -1).astype(np.uint8)
    img = Image.fromarray(rgb, "RGB")
    d = ImageDraw.Draw(img)
    d.text((20, 14), f"{HOSPITAL}  {device}", fill=(150, 150, 150), font=_font(16))
    d.text((20, 36), f"{p.family.upper()}, {p.given}   {p.mrn}", fill=(150, 150, 150), font=_font(16))
    d.rectangle((640, 110, 880, 130 + 46 * len(lines)), outline=(90, 90, 90))
    for i, line in enumerate(lines):
        if i in faint:
            label, _, rest = line.partition(" ")
            d.text((656, 124 + 46 * i), label, fill=(255, 255, 255), font=_font(30))
            d.text((656 + d.textlength(label + " ", font=_font(30)), 124 + 46 * i), rest, fill=(120, 120, 120), font=_font(30))
        else:
            d.text((656, 124 + 46 * i), line, fill=(255, 255, 255), font=_font(30))
    ds = _dicom_base(p, when, SECONDARY_CAPTURE, accession, description, "US")
    ds.ConversionType = "WSD"
    ds.Rows, ds.Columns = h, w
    ds.SamplesPerPixel = 3
    ds.PhotometricInterpretation = "RGB"
    ds.PlanarConfiguration = 0
    ds.BitsAllocated = ds.BitsStored = 8
    ds.HighBit = 7
    ds.PixelRepresentation = 0
    ds.PixelData = np.asarray(img).tobytes()
    ds.save_as(path, enforce_file_format=True)


COMPREHENSIVE_SR = "1.2.840.10008.5.1.4.1.1.88.33"


def write_sr(path: Path, p: Patient, when: datetime, accession: str, description: str,
             items: list[tuple[str, str, float, str]], device: str) -> None:
    """A structured echo report (DICOM SR): each measurement a NUM item with a LOINC concept and a UCUM unit.
    Flat for brevity; a real TID 5200 report nests these in containers. items: (LOINC, meaning, value, UCUM)."""
    ds = _dicom_base(p, when, COMPREHENSIVE_SR, accession, description, "SR")
    ds.ManufacturerModelName = device
    ds.ValueType = "CONTAINER"
    ds.ContinuityOfContent = "SEPARATE"
    ds.ConceptNameCodeSequence = [_code("125200", "DCM", "Adult Echocardiography Procedure Report")]
    content = []
    for loinc, meaning, value, ucum in items:
        it = Dataset()
        it.RelationshipType = "CONTAINS"
        it.ValueType = "NUM"
        it.ConceptNameCodeSequence = [_code(loinc, "LN", meaning)]
        mv = Dataset()
        mv.NumericValue = _fmt(value, 1)
        mv.MeasurementUnitsCodeSequence = [_code(ucum, "UCUM", ucum)]
        it.MeasuredValueSequence = [mv]
        content.append(it)
    ds.ContentSequence = content
    ds.save_as(path, enforce_file_format=True)


def _code(value: str, scheme: str, meaning: str) -> Dataset:
    c = Dataset()
    c.CodeValue, c.CodingSchemeDesignator, c.CodeMeaning = value, scheme, meaning
    return c


# ---------------------------------------------------------------- PDF reports

def _pdf_header(c: canvas.Canvas, org: str, title: str) -> float:
    W, H = A4
    c.setFillColorRGB(0.12, 0.2, 0.3)
    c.rect(0, H - 22 * mm, W, 22 * mm, fill=1, stroke=0)
    c.setFillColorRGB(1, 1, 1)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(18 * mm, H - 13 * mm, org)
    c.setFont("Helvetica", 10)
    c.drawRightString(W - 18 * mm, H - 13 * mm, title)
    c.setFillColorRGB(0, 0, 0)
    return H - 34 * mm


def _pdf_lines(c: canvas.Canvas, y: float, rows: list[tuple[str, str]], size: int = 10) -> float:
    for label, value in rows:
        c.setFont("Helvetica-Bold", size)
        c.drawString(18 * mm, y, label)
        c.setFont("Helvetica", size)
        c.drawString(58 * mm, y, value)
        y -= 6 * mm
    return y


def _pdf_paragraph(c: canvas.Canvas, y: float, heading: str, text: str) -> float:
    c.setFont("Helvetica-Bold", 11)
    c.drawString(18 * mm, y, heading)
    y -= 6 * mm
    c.setFont("Helvetica", 10)
    words, line = text.split(), ""
    for word in words:
        if c.stringWidth(line + " " + word, "Helvetica", 10) > 170 * mm:
            c.drawString(18 * mm, y, line.strip())
            y -= 5 * mm
            line = ""
        line += " " + word
    c.drawString(18 * mm, y, line.strip())
    return y - 9 * mm


def write_radiology_pdf(path: Path, p: Patient, when: datetime, accession: str, title: str,
                        findings: str, conclusion: str, dept: str = "Radiologie", kind: str = "Radiologieverslag",
                        heading: str = "Conclusie") -> None:
    c = canvas.Canvas(str(path), pagesize=A4)
    y = _pdf_header(c, HOSPITAL + " · " + dept, kind)
    y = _pdf_lines(c, y, [
        ("Patiënt", f"{p.family}, {p.given}"),
        ("Geboortedatum", p.dob.strftime("%d-%m-%Y")),
        ("Patiëntnummer", p.mrn),
        ("Onderzoek", title),
        ("Datum", when.strftime("%d-%m-%Y %H:%M")),
        ("Accessienummer", accession),
    ])
    y -= 4 * mm
    y = _pdf_paragraph(c, y, "Bevindingen", findings)
    _pdf_paragraph(c, y, heading, conclusion)
    c.save()


def write_pathology_pdf(path: Path, p: Patient, when: datetime, case_id: str, material: str, microscopy: str,
                        conclusion: str) -> None:
    """A biopsy report: diagnosis and immunohistochemistry, no tumour size (that comes from CT or a resection specimen)."""
    c = canvas.Canvas(str(path), pagesize=A4)
    y = _pdf_header(c, PATH_LAB, "Pathologieverslag")
    y = _pdf_lines(c, y, [
        ("Patiënt", f"{p.family}, {p.given}"),
        ("Geboortedatum", p.dob.strftime("%d-%m-%Y")),
        ("BSN", p.bsn),
        ("Aanvrager", HOSPITAL),
        ("Materiaal", material),
        ("Datum", when.strftime("%d-%m-%Y")),
        ("T-nummer", case_id),
    ])
    y -= 4 * mm
    y = _pdf_paragraph(c, y, "Microscopie", microscopy)
    _pdf_paragraph(c, y, "Conclusie", conclusion + ".")
    c.save()


def write_table_report(path: Path, p: Patient, when: datetime, dept: str, kind: str, exam: str, exam_id: str,
                       heading: str, rows: list[tuple[str, str]], conclusion: str) -> None:
    """A measurement report printed as a table (lung function, ECG): no structured export behind it."""
    c = canvas.Canvas(str(path), pagesize=A4)
    y = _pdf_header(c, HOSPITAL + " · " + dept, kind)
    y = _pdf_lines(c, y, [
        ("Patiënt", f"{p.family}, {p.given}"),
        ("Geboortedatum", p.dob.strftime("%d-%m-%Y")),
        ("Patiëntnummer", p.mrn),
        ("Onderzoek", exam),
        ("Datum", when.strftime("%d-%m-%Y %H:%M")),
        ("Onderzoeksnummer", exam_id),
    ])
    y -= 4 * mm
    c.setFont("Helvetica-Bold", 11)
    c.drawString(18 * mm, y, heading)
    y = _pdf_lines(c, y - 7 * mm, rows)
    _pdf_paragraph(c, y - 3 * mm, "Conclusie", conclusion)
    c.save()


def write_pft_pdf(path: Path, p: Patient, when: datetime, exam_id: str, rows: list[tuple[str, str]], conclusion: str) -> None:
    write_table_report(path, p, when, "Longfunctie", "Longfunctieverslag", "Spirometrie en diffusiecapaciteit", exam_id,
                       "Meetwaarden (na bronchodilatatie)", rows, conclusion)


def write_slide_stub(path: Path, rng: random.Random) -> None:
    """Stand-in for a vendor whole-slide image: proprietary header, opaque payload."""
    path.write_bytes(b"iSyntax\x00PROPRIETARY-WSI\x00v2\x00" + rng.randbytes(4096))


def _fmt(value: float, decimals: int) -> str:
    return f"{value:.{decimals}f}"
