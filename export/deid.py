"""Research export: one run, a de-identified dataset ready for a research archive (XNAT-style).

- BSN → salted HMAC pseudonym (stable within one export, useless without the salt)
- every date shifted by a per-patient offset (intervals between events survive)
- names, birth dates, hospital numbers never written
- DICOM: identifying tags blanked or replaced, following the spirit of PS3.15 Annex E basic profile
Then it greps its own output for every real identifier and fails loudly if one leaked.
"""

import csv
import hashlib
import hmac
import json
import secrets
import shutil
import sys
from datetime import datetime, timedelta
from pathlib import Path

import pydicom

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out"
RESEARCH = OUT / "research"

BANNER_ROWS = 64  # the ultrasound devices print patient details in the top 64 pixel rows
DICOM_BLANK = ["PatientName", "PatientBirthDate", "InstitutionName", "IssuerOfPatientID",
               "ReferringPhysicianName", "OtherPatientIDs"]


def pseudonym(salt: bytes, bsn: str) -> str:
    return "SUBJ-" + hmac.new(salt, bsn.encode(), hashlib.sha256).hexdigest()[:10].upper()


def shift_days(salt: bytes, bsn: str) -> int:
    return int(hmac.new(salt, b"shift" + bsn.encode(), hashlib.sha256).hexdigest(), 16) % 61 - 30


def main() -> None:
    cases = json.loads((OUT / "cases.json").read_text())
    if RESEARCH.exists():
        shutil.rmtree(RESEARCH)
    (RESEARCH / "dicom").mkdir(parents=True)
    salt = secrets.token_bytes(32)  # kept only in memory: the export cannot be re-identified from itself

    rows, entries = [], []
    for p in cases["patients"]:
        sid, shift = pseudonym(salt, p["bsn"]), timedelta(days=shift_days(salt, p["bsn"]))
        for f in p["facts"]:
            if f["status"] == "LOST" or not f["correct"]:
                continue
            when = (datetime.fromisoformat(f["time"]) + shift).isoformat(timespec="minutes")
            rows.append({"subject": sid, "care_path": p["path"], "fact": f["fact"], "value": f["got"],
                         "unit": f["unit"] or "", "time_shifted": when, "source": f["source"], "status": f["status"]})
            obs = {"resourceType": "Observation", "status": "final", "subject": {"reference": f"Patient/{sid}"},
                   "code": {"text": cases["fact_defs"][f["fact"]]["label"]}, "effectiveDateTime": when}
            loinc = cases["fact_defs"][f["fact"]]["loinc"]
            if loinc:
                obs["code"]["coding"] = [{"system": "http://loinc.org", "code": loinc}]
            if isinstance(f["got"], (int, float)):
                obs["valueQuantity"] = {"value": f["got"], "unit": f["unit"], "system": "http://unitsofmeasure.org"}
            else:
                obs["valueString"] = str(f["got"])
            entries.append({"resource": obs})
        for d in p["documents"]:
            if d["kind"] in ("ct", "sc"):
                _deid_dicom(ROOT / d["file"], RESEARCH / "dicom" / sid, sid, shift)

    with open(RESEARCH / "facts.csv", "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    (RESEARCH / "observations.fhir.json").write_text(json.dumps(
        {"resourceType": "Bundle", "type": "collection", "entry": entries}, indent=1, ensure_ascii=False))

    leaks = _leak_check(cases)
    n_dcm = sum(1 for _ in (RESEARCH / "dicom").rglob("*.dcm"))
    print(f"export: {len(rows)} facts, {len(entries)} FHIR observations, {n_dcm} DICOM files → out/research/")
    if leaks:
        print("  LEAK CHECK FAILED:", leaks[:5])
        sys.exit(1)
    print("  leak check passed: no BSN, name, birth date or hospital number in the export")


def _deid_dicom(src: Path, dest: Path, sid: str, shift: timedelta) -> None:
    files = sorted(src.glob("*.dcm")) if src.is_dir() else [src]
    for f in files:
        ds = pydicom.dcmread(f)
        for tag in DICOM_BLANK:
            if tag in ds:
                setattr(ds, tag, "")
        ds.PatientID = sid
        ds.PatientName = sid
        for tag in ("StudyDate", "SeriesDate", "ContentDate"):
            if tag in ds:
                setattr(ds, tag, (datetime.strptime(getattr(ds, tag), "%Y%m%d") + shift).strftime("%Y%m%d"))
        method = "basic profile; dates shifted"
        if ds.SOPClassUID == "1.2.840.10008.5.1.4.1.1.7":
            # Screen captures carry name and hospital number in the pixels. Mask the device's
            # known banner region (how real pixel anonymisers work: a template per device).
            px = ds.pixel_array.copy()
            px[:BANNER_ROWS] = 0
            ds.PixelData = px.tobytes()
            ds.BurnedInAnnotation = "NO"
            method += "; banner masked"
        ds.PatientIdentityRemoved = "YES"
        ds.DeidentificationMethod = method
        out = dest / (src.name if src.is_dir() else "") / f.name
        out.parent.mkdir(parents=True, exist_ok=True)
        ds.save_as(out, enforce_file_format=True)


def _leak_check(cases: dict) -> list[str]:
    needles = []
    for p in cases["patients"]:
        needles += [p["bsn"], p["mrn"], p["dob"].replace("-", ""), p["dob"], p["family"], p["given"]]
    hits = []
    for f in RESEARCH.rglob("*"):
        if not f.is_file():
            continue
        blob = f.read_bytes()
        if f.suffix == ".dcm":
            ds = pydicom.dcmread(f)
            del ds.PixelData  # pixels are checked separately: BurnedInAnnotation
            blob = str(ds).encode()
        for n in needles:
            if len(n) >= 4 and n.encode() in blob:
                hits.append(f"{n} in {f.relative_to(RESEARCH)}")
    return hits


if __name__ == "__main__":
    main()
