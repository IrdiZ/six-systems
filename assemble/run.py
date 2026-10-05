"""Assembler: read every department's files, link them to patients, harmonise, extract, score.

Writes out/cases.json and out/media/*.png.
"""

import json
import shutil
from dataclasses import asdict
from datetime import datetime
from pathlib import Path

from sim.model import EXT_LAB_CODES, FACTS, NHG_TO_FACT, NOT_CONVERTIBLE, SOURCES, UNIT_CONVERSIONS

from .identity import IdentityIndex
from .parsers import Doc, Rec, parse_ct_series, parse_dicom, parse_edi, parse_gp, parse_hl7, parse_pdf, parse_slide
from .score import score, summarise

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "raw"
OUT = ROOT / "out"


def rel(p: Path) -> str:
    return p.relative_to(ROOT).as_posix()


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    media = OUT / "media"
    media.mkdir(parents=True)

    ids = IdentityIndex()
    recs: list[Rec] = []
    docs: list[Doc] = []
    unlinked: dict[str, dict] = {}

    # 1. The EHR is the identity backbone: it knows BSN, hospital number, name and birth date.
    for f in sorted((RAW / "epic_lab").glob("*.hl7")):
        person, r, d = parse_hl7(f, rel(f))
        ids.learn(person["bsn"], person["mrn"], person["family"], person["given"], person["dob"])
        recs += r
        docs.append(d)

    # 2. Regional lab: BSN if present, otherwise name + birth date, otherwise nobody.
    for f in sorted((RAW / "ext_lab").glob("*.edi")):
        person, r, d = parse_edi(f, rel(f))
        bsn, how = person["bsn"], "BSN on the message"
        if not bsn:
            bsn = ids.from_name_dob(person["family"], person["dob"])
            how = "no BSN on file: matched on surname + birth date"
        if not bsn:
            unlinked[d.file] = {
                "file": d.file, "source": "ext_lab", "time": d.time, "title": d.title,
                "who": f"{person['given']} {person['family']}, born {person['dob']}",
                "reason": "No BSN, and no patient with this surname and birth date",
                "excerpt": "\n".join(ln for ln in f.read_text().splitlines() if ln.startswith(("PNA", "DTM"))),
            }
            for x in r:
                x.steps.append("could not be linked to any patient")
            recs += r
            continue
        for x in r:
            x.bsn = bsn
            if how != "BSN on the message":
                x.steps.insert(0, how)
        d.bsn, d.link = bsn, how
        recs += r
        docs.append(d)

    # 2b. Senders that put the BSN on every file: the referring hospital's lab and the GP's referral export.
    #     Their own record numbers mean nothing here, so nothing is learned from them.
    for f in sorted((RAW / "nb_lab").glob("*.hl7")):
        person, r, d = parse_hl7(f, rel(f), source="nb_lab")
        d.bsn, d.link = person["bsn"], "BSN on the message (sender's own record number ignored)"
        recs += r
        docs.append(d)
    for f in sorted((RAW / "gp").glob("*.csv")):
        person, r, d = parse_gp(f, rel(f))
        recs += r
        docs.append(d)

    # 3. Imaging: the archive knows the hospital number, which the EHR maps to a BSN.
    for folder in sorted(p for p in (RAW / "radiology").iterdir() if p.is_dir()):
        person, r, d = parse_ct_series(folder, rel(folder), media)
        _link_mrn(ids, person, r, d)
        recs += r
        docs.append(d)
    for f in sorted([*(RAW / "echo").glob("*.dcm"), *(RAW / "radiology").glob("*.dcm")]):
        person, r, d = parse_dicom(f, rel(f), media)
        _link_mrn(ids, person, r, d)
        recs += r
        docs.append(d)

    # 4. Reports.
    for f in sorted((RAW / "radiology").glob("*.pdf")):
        person, r, d = parse_pdf(f, rel(f), "radiology", media)
        _link_mrn(ids, person, r, d)
        recs += r
        docs.append(d)
    for f in sorted((RAW / "pft").glob("*.pdf")):
        person, r, d = parse_pdf(f, rel(f), "pft", media)
        _link_mrn(ids, person, r, d)
        recs += r
        docs.append(d)
    path_docs = {}
    for f in sorted((RAW / "pathology").glob("*.pdf")):
        person, r, d = parse_pdf(f, rel(f), "pathology", media)
        for x in r:
            x.bsn = person.get("bsn")
        d.bsn, d.link = person.get("bsn"), "BSN printed on the report"
        path_docs[f.stem] = d
        recs += r
        docs.append(d)
    for f in sorted((RAW / "pathology").glob("*.isyntax")):
        _, r, d = parse_slide(f, rel(f))
        twin = path_docs.get(f.stem)
        for x in r:
            x.bsn, x.time = twin.bsn, twin.time
        d.bsn, d.time, d.link = twin.bsn, twin.time, "case number shared with the report"
        recs += r
        docs.append(d)

    # 5. Score against the answer key and group per patient.
    truth = json.loads((RAW / "truth.json").read_text())
    rows = score(truth, recs, set(unlinked))
    summary = summarise(rows)
    patients = []
    for p in truth["patients"]:
        facts = sorted((r for r in rows if r["bsn"] == p["bsn"]), key=lambda r: r["time"])
        pdocs = sorted((asdict(d) for d in docs if d.bsn == p["bsn"]), key=lambda d: d["time"])
        patients.append({**p, "facts": facts, "documents": pdocs, "summary": summarise(facts)})

    out = {
        "generated": datetime.now().isoformat(timespec="seconds"),
        "summary": summary,
        "sources": SOURCES,
        "fact_defs": FACTS,
        # the maps the assembler applied, so a viewer can show them without copying them
        "code_maps": {
            "ext_lab": EXT_LAB_CODES,
            "units": [{"fact": f, "unit": u, "op": op[0], "k": op[1]} for (f, u), op in UNIT_CONVERSIONS.items()],
            "nhg": NHG_TO_FACT,
            "not_convertible": NOT_CONVERTIBLE,
        },
        "patients": patients,
        "unlinked": list(unlinked.values()),
    }
    (OUT / "cases.json").write_text(json.dumps(out, indent=1, ensure_ascii=False, default=str))
    s = summary
    print(f"assembler: {len(docs)} documents linked, {len(unlinked)} unlinked, {s['facts']} facts scored")
    print(f"  archive shows {s['archive_pct']}% · usable as data {s['usable_pct']}% · "
          f"recovered by pipeline {s['recovered_pct']}% · wrong values {s['wrong']}")
    print("  by status:", s["by_status"])


def _link_mrn(ids: IdentityIndex, person: dict, recs: list[Rec], doc: Doc) -> None:
    bsn = person.get("bsn") or ids.from_mrn(person.get("mrn", ""))
    for x in recs:
        x.bsn = bsn
        x.steps.append(f"hospital number {person.get('mrn')} → BSN via the EHR")
    doc.bsn, doc.link = bsn, "hospital number, mapped to BSN via the EHR"


if __name__ == "__main__":
    main()
