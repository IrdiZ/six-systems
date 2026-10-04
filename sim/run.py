"""Simulator: synthetic patients walk through three care paths; every department writes its own files.

Writes raw/<source>/... and raw/truth.json (the hidden answer key the assembler never reads).
"""

import json
import random
import shutil
from datetime import datetime, timedelta
from pathlib import Path

from .model import FACTS, NEIGHBOUR_CODE, UNIT_CONVERSIONS, convert
from .patients import Patient, make_patients
from .writers import (
    write_ct_series,
    write_edi,
    write_gp_export,
    write_hl7,
    write_hl7_rows,
    write_pathology_pdf,
    write_pft_pdf,
    write_radiology_pdf,
    write_secondary_capture,
    write_slide_stub,
    write_sr,
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
        self.counter2 = 0  # files added later count separately, so the original file names stay put

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

    def next_id2(self, prefix: str) -> str:
        self.counter2 += 1
        return f"{prefix}{self.counter2:05d}"

    @staticmethod
    def extra2(p: Patient) -> random.Random:
        """Second batch, its own stream again, so the first batch keeps its values."""
        return random.Random(f"extra2:{SEED}:{p.pid}")

    @staticmethod
    def extra(p: Patient) -> random.Random:
        """Values added later come from their own stream, so every original value stays the same."""
        return random.Random(f"extra:{SEED}:{p.pid}")

    def rel(self, path: Path) -> str:
        return path.relative_to(ROOT).as_posix()

    # ------------------------------------------------------------ building blocks

    def epic_lab(self, p: Patient, when: datetime, values: dict[str, float], later: bool = False) -> None:
        msg = self.next_id2("LAB") if later else self.next_id("MSG")
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

    def gp_export(self, p: Patient, rows: list[tuple[str, datetime, float]], reason: str) -> None:
        """rows: (fact, measured at, value). The GP sends NHG numbers, not LOINC."""
        path = RAW / "gp" / f"{self.next_id2('HIS')}.csv"
        write_gp_export(path, p, [(FACTS[f]["nhg"], t, v, FACTS[f]["unit"].replace("mm[Hg]", "mmHg")) for f, t, v in rows], reason)
        for f, t, v in rows:
            self.fact(p, f, v, t, "gp", self.rel(path))

    def nb_lab(self, p: Patient, when: datetime, values: dict[str, float], units: dict[str, str]) -> None:
        """Heuvelland's own laboratory: LOINC-coded, but its own assays, and some results in another unit."""
        msg = self.next_id2("HZL")
        path = RAW / "nb_lab" / f"{msg}.hl7"
        rows = []
        for f, v in values.items():
            u = units.get(f, FACTS[f]["unit"])
            loinc = "33763-4" if (f, u) == ("nt_probnp", "pmol/L") else FACTS[f]["loinc"]
            sent = convert(UNIT_CONVERSIONS[(f, u)], v, back=True) if (f, u) in UNIT_CONVERSIONS else v
            rows.append((loinc, FACTS[f]["label"], sent, u))
        write_hl7_rows(path, p, when, rows, msg, "GLIMS", NEIGHBOUR_CODE, "H" + str(self.extra(p).randint(100000, 999999)))
        for f, v in values.items():
            self.fact(p, f, v, when, "nb_lab", self.rel(path))

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
        acc = echo_acc = self.next_id("US")
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
        # Added: the GP's risk profile, the referring hospital's own lab, a structured echo report.
        x = self.extra(p)
        tg = (t0 - timedelta(days=x.randint(30, 200))).replace(hour=9, minute=x.choice([0, 10, 20, 30, 40, 50]))
        rows = [("sbp", tg, x.randint(122, 176)), ("dbp", tg, x.randint(70, 102)), ("heart_rate", tg, x.randint(58, 96)),
                ("weight", tg, round(x.uniform(62, 112), 1)), ("cholesterol", tg, round(x.uniform(4.0, 7.6), 1)),
                ("ldl", tg, round(x.uniform(2.0, 5.2), 1)), ("hdl", tg, round(x.uniform(0.8, 1.9), 1)),
                ("triglycerides", tg, round(x.uniform(0.8, 3.2), 1))]
        if x.random() < 0.4:
            rows.append(("hba1c", tg, x.randint(44, 70)))
        self.gp_export(p, rows, "Pijn op de borst; cardiovasculair risicoprofiel")
        nb = {"troponin_i": round(peak * x.uniform(0.6, 2.5)), "ck": x.randint(60, 900),
              "sodium": x.randint(133, 144), "potassium": round(x.uniform(3.4, 5.1), 1)}
        units = {}
        if x.random() < 0.6:
            nb["nt_probnp"] = round(x.uniform(90, 4500))
            units["nt_probnp"] = "pmol/L"
        else:
            nb["bnp"] = round(x.uniform(30, 900))
        if x.random() < 0.35:
            nb["digoxin"] = round(x.uniform(0.6, 1.6), 1)
            units["digoxin"] = "nmol/L"
        y = self.extra2(p)
        nb.update(creatinine=y.randint(64, 140), egfr_2021=y.randint(42, 92))
        if y.random() < 0.5:
            nb["ddimer"] = round(y.uniform(0.2, 2.4), 2)
            units["ddimer"] = "ug{FEU}/L"
        self.nb_lab(p, t0 + timedelta(minutes=25), nb, units)
        self.epic_lab(p, t1 + timedelta(minutes=5), later=True, values={
            "potassium": round(x.uniform(3.5, 5.0), 1), "sodium": x.randint(134, 144), "nt_probnp": round(x.uniform(100, 5000)),
            "wbc": round(y.uniform(4.8, 12.5), 1), "platelets": y.randint(150, 390), "mcv": y.randint(82, 99), "crp": y.randint(1, 40),
            "tsh": round(y.uniform(0.5, 4.8), 2), "ft4": round(y.uniform(11, 22), 1),
        })
        tapse_cm, lavi = round(x.uniform(1.4, 2.6), 1), x.randint(22, 48)
        sr = RAW / "echo" / f"{echo_acc}_sr.dcm"
        lvpw_cm, vmax_ms, grad = round(y.uniform(0.8, 1.4), 1), round(y.uniform(1.0, 4.2), 1), y.randint(4, 46)
        write_sr(sr, p, te, echo_acc, "TTE volledig", [
            ("77903-3", "TAPSE", tapse_cm, "cm"), ("79984-1", "LA volume index (biplane)", lavi, "mL/m2"),
            ("18152-9", "LV posterior wall thickness, diastole", lvpw_cm, "cm"), ("79964-3", "Aortic valve peak velocity", vmax_ms, "m/s"),
            ("79962-7", "Aortic valve mean gradient", grad, "mm[Hg]")], device="Echo 5")
        self.fact(p, "tapse", round(tapse_cm * 10), te, "echo", self.rel(sr))
        self.fact(p, "lavi", lavi, te, "echo", self.rel(sr))
        self.fact(p, "lvpwd", round(lvpw_cm * 10), te, "echo", self.rel(sr))
        self.fact(p, "av_vmax", round(vmax_ms * 100), te, "echo", self.rel(sr))
        self.fact(p, "av_meangrad", grad, te, "echo", self.rel(sr))

    @staticmethod
    def _liver(y: random.Random) -> dict[str, float]:
        return {"alt": y.randint(10, 60), "ast": y.randint(12, 55), "alp": y.randint(45, 140), "ggt": y.randint(12, 90),
                "bilirubin": y.randint(5, 22), "albumin": y.randint(33, 46), "ldh": y.randint(140, 320), "cea": round(y.uniform(0.8, 12), 1)}

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
        # Added: the GP referral (persistent cough, CRP point-of-care) and the pre-operative work-up.
        x = self.extra(p)
        tg = (t0 - timedelta(days=x.randint(14, 40))).replace(hour=10, minute=x.choice([0, 15, 30, 45]))
        self.gp_export(p, [("crp_poc", tg, x.randint(5, 60)), ("sbp", tg, x.randint(118, 162)), ("dbp", tg, x.randint(68, 96)),
                           ("weight", tg, round(x.uniform(55, 98), 1))], "Aanhoudende hoest")
        tp = (t1 + timedelta(days=x.randint(3, 7))).replace(hour=8, minute=x.choice([10, 25, 40]))
        self.epic_lab(p, tp, later=True, values={
            "crp": x.randint(1, 25), "wbc": round(x.uniform(4.5, 11.5), 1), "platelets": x.randint(160, 420),
            "inr": round(x.uniform(0.9, 1.2), 1), "sodium": x.randint(135, 145), "potassium": round(x.uniform(3.6, 5.0), 1),
            "pco2": round(x.uniform(4.6, 6.0), 1), "po2": round(x.uniform(9.0, 12.5), 1),
            **self._liver(self.extra2(p)),
        })
        fev1, ratio, dlco = round(x.uniform(1.4, 3.4), 2), x.uniform(0.55, 0.80), round(x.uniform(4.5, 9.5), 1)
        fvc, pred = round(fev1 / ratio, 2), x.randint(55, 105)
        tf = tp + timedelta(hours=2)
        pdf = RAW / "pft" / f"{self.next_id2('LF')}.pdf"
        dec = lambda v, d=2: f"{v:.{d}f}".replace(".", ",")
        obstructive = fev1 / fvc < 0.7
        write_pft_pdf(pdf, p, tf, pdf.stem, [
            ("FEV1", f"{dec(fev1)} L  ({pred}% van voorspeld)"), ("FVC", f"{dec(fvc)} L"),
            ("FEV1/FVC", f"{round(100 * fev1 / fvc)} %"), ("DLCO", f"{dec(dlco, 1)} mmol/min/kPa")],
            ("Obstructief patroon." if obstructive else "Geen obstructie.") + " Diffusiecapaciteit beoordelen in relatie tot resectie.")
        for f, v in (("fev1", fev1), ("fvc", fvc), ("fev1_fvc", round(100 * fev1 / fvc)), ("dlco", dlco)):
            self.fact(p, f, v, tf, "pft", self.rel(pdf))

    def kidney(self, p: Patient, t0: datetime, bsn_gaps: set[int], typo_visit: int | None) -> None:
        r = self.rng
        x = self.extra(p)
        diabetic, lithium = x.random() < 0.6, x.random() < 0.3
        crea = r.uniform(110, 190)
        when = t0
        tg = (t0 - timedelta(days=x.randint(10, 30))).replace(hour=11, minute=x.choice([0, 20, 40]))
        self.gp_export(p, [("sbp", tg, x.randint(130, 172)), ("dbp", tg, x.randint(75, 98)), ("heart_rate", tg, x.randint(60, 92)),
                           ("weight", tg, round(x.uniform(60, 118), 1))], "Verminderde nierfunctie")
        k = x.uniform(4.0, 4.8)
        y = self.extra2(p)
        urea = y.uniform(8, 14)
        for visit in range(5):
            crea *= r.uniform(1.0, 1.12)
            egfr = max(12, round(4800 / crea))
            k += x.uniform(0, 0.25)
            added = {"potassium": round(k, 1), "uacr": round(x.uniform(3, 80))}
            if diabetic and visit in (0, 3):
                added["hba1c"] = x.randint(45, 75)
            if lithium:
                added["lithium"] = round(x.uniform(0.5, 1.0), 2)
            if visit == 4:
                added.update(calcium=round(x.uniform(2.1, 2.5), 2), phosphate=round(x.uniform(1.0, 1.8), 2))
            urea *= y.uniform(1.0, 1.15)
            added["urea"] = round(urea, 1)
            self.ext_lab(p, when, {
                "creatinine": round(crea, 1),
                "egfr": egfr,
                "glucose": round(r.uniform(5.2, 9.8), 1),
                **added,
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
            "potassium": round(k, 1),
            "hb": round(x.uniform(6.2, 8.4), 1),
            "pth": round(y.uniform(6, 32), 1), "bicarbonate": y.randint(17, 26), "ferritin": y.randint(40, 520),
        })


NEIGHBOUR_SHORT = "Heuvelland ER"


def main() -> None:
    rng = random.Random(SEED)
    if RAW.exists():
        shutil.rmtree(RAW)
    for sub in ("epic_lab", "ext_lab", "radiology", "echo", "pathology", "gp", "nb_lab", "pft"):
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
