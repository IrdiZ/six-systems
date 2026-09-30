"""Simulator: synthetic patients walk through three care paths; every department writes its own files.

Writes raw/<source>/... and raw/truth.json (the hidden answer key the assembler never reads).
"""

import json
import random
import shutil
from datetime import datetime, timedelta
from pathlib import Path

from .model import FACTS
from .patients import Patient, make_patients
from .writers import (
    write_ct_series,
    write_edi,
    write_hl7,
    write_pathology_pdf,
    write_radiology_pdf,
    write_secondary_capture,
    write_slide_stub,
)

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "raw"
SEED = 7

DIAGNOSES = [
    "Adenocarcinoom van de long",
    "Plaveiselcelcarcinoom van de long",
    "Carcinoïd tumor, typisch",
]


class World:
    def __init__(self, rng: random.Random):
        self.rng = rng
        self.truth: list[dict] = []
        self.counter = 0

    def next_id(self, prefix: str) -> str:
        self.counter += 1
        return f"{prefix}{self.counter:05d}"

    def fact(self, p: Patient, fact: str, value, when: datetime, source: str, file: str | None,
             loss: str | None = None) -> None:
        self.truth.append({
            "pid": p.pid,
            "bsn": p.bsn,
            "fact": fact,
            "value": value,
            "unit": FACTS[fact]["unit"],
            "time": when.isoformat(timespec="minutes"),
            "source": source,
            "file": file,
            "loss": loss,
        })

    def rel(self, path: Path) -> str:
        return str(path.relative_to(ROOT))

    # ------------------------------------------------------------ building blocks

    def epic_lab(self, p: Patient, when: datetime, values: dict[str, float]) -> None:
        msg = self.next_id("MSG")
        path = RAW / "epic_lab" / f"{msg}.hl7"
        write_hl7(path, p, when, list(values.items()), msg)
        for fact, v in values.items():
            self.fact(p, fact, v, when, "epic_lab", self.rel(path))

    def ext_lab(self, p: Patient, when: datetime, values: dict[str, float], omit_bsn=False, dob_typo=False) -> None:
        batch = self.next_id("RLZ")
        path = RAW / "ext_lab" / f"{batch}.edi"
        write_edi(path, p, when, list(values.items()), batch, omit_bsn=omit_bsn, dob_typo=dob_typo,
                  decimal_comma=self.rng.random() < 0.6)
        for fact, v in values.items():
            self.fact(p, fact, v, when, "ext_lab", self.rel(path))

    def ct(self, p: Patient, when: datetime, description: str, nodule_mm: float | None = None) -> str:
        acc = self.next_id("CT")
        folder = RAW / "radiology" / acc
        write_ct_series(folder, p, when, acc, description, self.rng, nodule_mm=nodule_mm)
        self.fact(p, "ct_exam", description, when, "radiology", self.rel(folder))
        self.fact(p, "ct_raw_data", "projection data", when, "offline", None,
                  loss="Raw projection data discarded at the scanner after reconstruction")
        return acc

    def radiology_report(self, p: Patient, when: datetime, acc: str, title: str, findings: str,
                         conclusion: str, facts: dict[str, float]) -> None:
        path = RAW / "radiology" / f"{acc}_report.pdf"
        write_radiology_pdf(path, p, when, acc, title, findings, conclusion)
        for fact, v in facts.items():
            self.fact(p, fact, v, when, "radiology", self.rel(path))

    # ------------------------------------------------------------ care paths

    def chest_pain(self, p: Patient, t0: datetime) -> None:
        r = self.rng
        peak = round(r.uniform(18, 420), 1)
        self.fact(p, "troponin_poc", round(peak * r.uniform(0.5, 0.8), 1), t0, "offline", None,
                  loss=f"ER point-of-care result at {NEIGHBOUR_SHORT}, sent by fax")
        self.ext_lab(p, t0 + timedelta(minutes=40), {
            "troponin": round(peak * r.uniform(0.7, 0.9), 1),
            "creatinine": round(r.uniform(62, 140), 1),
        })
        t1 = t0 + timedelta(hours=r.randint(3, 5))
        self.epic_lab(p, t1, {
            "troponin": peak,
            "creatinine": round(r.uniform(62, 140), 1),
            "hb": round(r.uniform(7.4, 9.8), 1),
        })
        te = (t1 + timedelta(days=1)).replace(hour=10, minute=r.randint(0, 59))
        lvef = r.randint(30, 64)
        ivs = round(r.uniform(0.8, 1.5), 1)
        lvid = round(r.uniform(4.2, 6.1), 1)
        acc = self.next_id("US")
        path = RAW / "echo" / f"{acc}.dcm"
        write_secondary_capture(path, p, te, acc, "TTE volledig", [
            f"LVEF    {lvef} %",
            f"IVSd    {ivs} cm",
            f"LVIDd   {lvid} cm",
        ], r, device="Echo 3")
        self.fact(p, "lvef", lvef, te, "echo", self.rel(path))
        self.fact(p, "ivs_thickness", round(ivs * 10), te, "echo", self.rel(path))
        self.fact(p, "lv_diameter", round(lvid * 10), te, "echo", self.rel(path))
        tc = te + timedelta(days=1, hours=2)
        acc = self.ct(p, tc, "CT coronair angiografie")
        score = r.choice([0, 0, r.randint(1, 99), r.randint(100, 400), r.randint(401, 1200)])
        self.radiology_report(
            p, tc, acc, "CT coronair angiografie",
            f"Goede beeldkwaliteit. Agatston calciumscore: {score}. Geen significante stenose in de LAD. "
            "Normale aanleg van de coronairarteriën.",
            "Zie calciumscore. Advies: cardiologische follow-up.",
            {"calcium_score": score},
        )

    def lung_nodule(self, p: Patient, t0: datetime) -> None:
        r = self.rng
        size0 = r.randint(6, 14)
        acc = self.ct(p, t0, "CT thorax met contrast", nodule_mm=size0)
        self.radiology_report(
            p, t0, acc, "CT thorax met contrast",
            f"Solitaire nodus in de rechter bovenkwab, diameter {size0} mm, glad begrensd. "
            "Geen pathologische lymfeklieren. Geen pleuravocht.",
            "Solitaire longnodus rechter bovenkwab. Controle CT over 3 maanden geadviseerd.",
            {"nodule_size": size0},
        )
        self.epic_lab(p, t0 + timedelta(hours=1), {
            "hb": round(r.uniform(7.2, 9.6), 1),
            "creatinine": round(r.uniform(60, 120), 1),
        })
        t1 = t0 + timedelta(days=r.randint(85, 95))
        size1 = size0 + r.randint(3, 9)
        acc = self.ct(p, t1, "CT thorax follow-up", nodule_mm=size1)
        self.radiology_report(
            p, t1, acc, "CT thorax follow-up",
            f"Bekende nodus rechter bovenkwab, thans diameter {size1} mm (eerder {size0} mm). Toename.",
            "Groei van de longnodus. Histologische bevestiging geadviseerd.",
            {"nodule_size": size1},
        )
        t2 = t1 + timedelta(days=r.randint(10, 18))
        case = f"T26-{r.randint(10000, 99999)}"
        diag = r.choice(DIAGNOSES)
        tumour = size1 + r.randint(-2, 3)
        pdf = RAW / "pathology" / f"{case}.pdf"
        write_pathology_pdf(pdf, p, t2, case, diag, tumour)
        self.fact(p, "path_diagnosis", diag, t2, "pathology", self.rel(pdf))
        self.fact(p, "tumour_size", tumour, t2, "pathology", self.rel(pdf))
        slide = RAW / "pathology" / f"{case}.isyntax"
        write_slide_stub(slide, r)
        self.fact(p, "wsi_slide", "whole-slide image", t2, "pathology", self.rel(slide))

    def kidney(self, p: Patient, t0: datetime, bsn_gaps: set[int], typo_visit: int | None) -> None:
        r = self.rng
        crea = r.uniform(110, 190)
        when = t0
        for visit in range(5):
            crea *= r.uniform(1.0, 1.12)
            egfr = max(12, round(4800 / crea))
            self.ext_lab(p, when, {
                "creatinine": round(crea, 1),
                "egfr": egfr,
                "glucose": round(r.uniform(5.2, 9.8), 1),
            }, omit_bsn=visit in bsn_gaps, dob_typo=visit == typo_visit)
            if visit == 2:
                tu = when + timedelta(days=6, hours=2)
                acc = self.next_id("US")
                path = RAW / "radiology" / f"{acc}.dcm"
                length = round(r.uniform(8.6, 10.9), 1)
                write_secondary_capture(path, p, tu, acc, "Echo nieren", [f"Nier li  {length} cm"], r, device="US 2")
                self.fact(p, "kidney_length", round(length * 10), tu, "radiology", self.rel(path))
            when += timedelta(days=r.randint(50, 70))
        self.epic_lab(p, when, {
            "creatinine": round(crea * 1.05, 1),
            "egfr": max(12, round(4800 / (crea * 1.05))),
            "glucose": round(r.uniform(5.2, 9.8), 1),
        })


NEIGHBOUR_SHORT = "Heuvelland ER"


def main() -> None:
    rng = random.Random(SEED)
    if RAW.exists():
        shutil.rmtree(RAW)
    for sub in ("epic_lab", "ext_lab", "radiology", "echo", "pathology"):
        (RAW / sub).mkdir(parents=True)

    patients = make_patients(rng, 20)
    world = World(rng)
    paths = ["chest_pain"] * 7 + ["lung_nodule"] * 6 + ["kidney"] * 7
    kidney_seen = 0
    for p, path in zip(patients, paths):
        p.path = path
        t0 = datetime(2026, rng.randint(1, 6), rng.randint(1, 28), rng.randint(7, 20), rng.choice([0, 15, 30, 45]))
        if path == "chest_pain":
            world.chest_pain(p, t0)
        elif path == "lung_nodule":
            world.lung_nodule(p, t0)
        else:
            # Some regional-lab files arrive without a BSN; one also has a hand-typed birth date error.
            gaps = {1} if kidney_seen in (0, 3, 5) else set()
            typo = 1 if kidney_seen == 3 else None
            if kidney_seen == 5:
                gaps.add(3)
            world.kidney(p, t0, gaps, typo)
            kidney_seen += 1

    truth = {
        "seed": SEED,
        "patients": [
            {"pid": p.pid, "bsn": p.bsn, "name": p.display, "given": p.given, "family": p.family,
             "dob": p.dob.isoformat(), "sex": p.sex, "mrn": p.mrn, "path": p.path}
            for p in patients
        ],
        "facts": world.truth,
    }
    (RAW / "truth.json").write_text(json.dumps(truth, indent=1, ensure_ascii=False))
    files = sum(1 for f in RAW.rglob("*") if f.is_file())
    print(f"simulator: {len(patients)} patients, {len(world.truth)} true facts, {files} files in raw/")


if __name__ == "__main__":
    main()
