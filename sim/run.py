"""Simulator: synthetic patients walk through branching care paths; every department writes its own files.

Writes raw/<source>/... and raw/truth.json (the hidden answer key the assembler never reads).
"""

import json
import random
import shutil
from datetime import datetime, timedelta
from pathlib import Path

from .model import FACTS, GP_PRACTICE, NEIGHBOUR2_CODE, UNIT_CONVERSIONS, convert
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
    write_table_report,
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
        self.counter2 = 0  # second ID series for the newer sources
        self.hb_base: dict[str, float] = {}
        self.weight: dict[str, float] = {}
        self.bnp_prev = None

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

    def rel(self, path: Path) -> str:
        return path.relative_to(ROOT).as_posix()

    # ------------------------------------------------------------ building blocks

    def epic_lab(self, p: Patient, when: datetime, values: dict[str, float]) -> None:
        msg = self.next_id("MSG")
        path = RAW / "epic_lab" / f"{msg}.hl7"
        write_hl7(path, p, when, list(values.items()), msg)
        for fact, v in values.items():
            self.fact(p, fact, v, when, "epic_lab", self.rel(path))

    def ext_lab(self, p: Patient, when: datetime, values: dict[str, float], omit_bsn=False, dob_typo=False, **kw) -> None:
        batch = self.next_id("RLZ")
        path = RAW / "ext_lab" / f"{batch}.edi"
        write_edi(path, p, when, list(values.items()), batch, omit_bsn=omit_bsn, dob_typo=dob_typo,
                  decimal_comma=self.rng.random() < 0.6, **kw)
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
                         conclusion: str, facts: dict[str, float], heading: str = "Conclusie") -> None:
        path = RAW / "radiology" / f"{acc}_report.pdf"
        write_radiology_pdf(path, p, when, acc, title, findings, conclusion, heading=heading)
        for fact, v in facts.items():
            self.fact(p, fact, v, when, "radiology", self.rel(path))

    def gp_export(self, p: Patient, rows: list[tuple[str, datetime, float]], reason: str) -> None:
        """rows: (fact, measured at, value). The GP sends NHG numbers, not LOINC."""
        path = RAW / "gp" / f"{self.next_id2('HIS')}.csv"
        write_gp_export(path, p, [(FACTS[f]["nhg"], t, v, FACTS[f]["unit"].replace("mm[Hg]", "mmHg")) for f, t, v in rows], reason)
        for f, t, v in rows:
            self.fact(p, f, v, t, "gp", self.rel(path))

    def nb_lab(self, p: Patient, when: datetime, values: dict[str, float], units: dict[str, str]) -> None:
        """Maasland's own laboratory: LOINC-coded, but its own assays, and some results in another unit."""
        msg = self.next_id2("MZL")
        path = RAW / "nb_lab" / f"{msg}.hl7"
        rows = []
        for f, v in values.items():
            u = units.get(f, FACTS[f]["unit"])
            loinc = "33763-4" if (f, u) == ("nt_probnp", "pmol/L") else FACTS[f]["loinc"]
            sent = convert(UNIT_CONVERSIONS[(f, u)], v, back=True) if (f, u) in UNIT_CONVERSIONS else v
            rows.append((loinc, FACTS[f]["label"], sent, u))
        write_hl7_rows(path, p, when, rows, msg, "GLIMS", NEIGHBOUR2_CODE, "M" + str(100000 + int(p.bsn) % 900000))  # Maasland's own record number
        for f, v in values.items():
            self.fact(p, f, v, when, "nb_lab", self.rel(path))

    # ------------------------------------------------------------ clinical helpers

    @staticmethod
    def age(p: Patient, when: datetime) -> float:
        return (when.date() - p.dob).days / 365.25

    def egfr(self, p: Patient, crea_umol: float, when: datetime, version: int = 2009) -> int:
        """CKD-EPI from creatinine (mg/dL = µmol/L / 88.4).
        2009: Levey et al., Ann Intern Med 2009 (pmc.ncbi.nlm.nih.gov/articles/PMC2763564), race factor not used.
        2021: National Kidney Foundation (kidney.org/ckd-epi-creatinine-equation-2021-0)."""
        scr, f = crea_umol / 88.4, p.sex == "F"
        k = 0.7 if f else 0.9
        if version == 2021:
            a, e, base, ag, fem = (-0.241 if f else -0.302), -1.200, 142, 0.9938, 1.012
        else:
            a, e, base, ag, fem = (-0.329 if f else -0.411), -1.209, 141, 0.993, 1.018
        g = base * min(scr / k, 1) ** a * max(scr / k, 1) ** e * ag ** self.age(p, when) * (fem if f else 1)
        return round(g)

    def crea_for(self, p: Patient, target_egfr: float, when: datetime) -> float:
        """Creatinine (µmol/L) that gives this CKD-EPI 2009 eGFR: bisection, eGFR falls as creatinine rises."""
        lo, hi = 20.0, 1500.0
        for _ in range(60):
            mid = (lo + hi) / 2
            lo, hi = (mid, hi) if self.egfr(p, mid, when) > target_egfr else (lo, mid)
        return (lo + hi) / 2

    def renal(self, p: Patient, crea: float, when: datetime) -> dict:
        return {"creatinine": round(crea), "egfr": self.egfr(p, crea, when)}

    def hb(self, p: Patient, lo_shift: float = 0.0) -> float:
        """One baseline per patient, small jitter per draw, so Hb does not swing within hours."""
        r = self.rng
        base = self.hb_base.setdefault(p.pid, r.uniform(8.4, 10.0) if p.sex == "M" else r.uniform(7.5, 9.0))
        return round(base - lo_shift + r.uniform(-0.2, 0.2), 1)

    def lipids(self) -> dict:
        """LDL drawn, total cholesterol built from it (Friedewald, mmol/L: TC = LDL + HDL + TG / 2.2), so the panel adds up."""
        r = self.rng
        ldl, hdl, tg = round(r.uniform(1.9, 5.0), 1), round(r.uniform(0.8, 1.9), 1), round(r.uniform(0.7, 3.0), 1)
        return {"cholesterol": round(ldl + hdl + tg / 2.2, 1), "ldl": ldl, "hdl": hdl, "triglycerides": tg}

    @staticmethod
    def daytime(t: datetime, weekend: bool = False) -> datetime:
        """Next 08:00-17:00 slot; elective work on weekdays only. weekend=True: inpatient lists run every day."""
        if t.hour < 8:
            t = t.replace(hour=8, minute=30)
        elif t.hour >= 17:
            t = (t + timedelta(days=1)).replace(hour=8, minute=30)
        while not weekend and t.weekday() >= 5:
            t = (t + timedelta(days=1)).replace(hour=8, minute=30)
        return t

    def ecg(self, p: Patient, when: datetime, af: bool, ischaemic: bool) -> None:
        """A 12-lead ECG as the hospital's ECG system prints it: measurements and a conclusion in a PDF."""
        r = self.rng
        acc = self.next_id2("ECG")
        path = RAW / "ecg" / f"{acc}.pdf"
        hr, qrs, qtc = r.randint(70, 110) if af else r.randint(55, 95), r.randint(80, 108), r.randint(395, 455)
        pr = None if af else r.randint(130, 200)
        rhythm = "Atriumfibrilleren met wisselende ventrikelrespons" if af else "Sinusritme"
        st = "ST-depressie in V4-V6" if ischaemic else "geen ischemische afwijkingen"  # non-localising, fits any culprit vessel
        write_table_report(path, p, when, "Cardiologie", "ECG", "12-afleidingen ECG", acc, "Metingen", [
            ("Ventrikelfrequentie", f"{hr} /min"), ("PR-interval", f"{pr} ms" if pr else "-"), ("QRS-duur", f"{qrs} ms"),
            ("QT/QTc", f"{round(qtc * (60 / hr) ** 0.5)}/{qtc} ms")], f"{rhythm}; {st}.")
        vals = {"heart_rate": hr, "qrs": qrs, "qtc": qtc, "ecg_conclusion": f"{rhythm}; {st}"}
        if pr:
            vals["pr"] = pr
        for f, v in vals.items():
            self.fact(p, f, v, when, "ecg", self.rel(path))

    def cath_report(self, p: Patient, when: datetime, conclusion: str) -> None:
        acc = self.next_id2("CAG")
        path = RAW / "cathlab" / f"{acc}.pdf"
        pci = "PCI" in conclusion
        write_radiology_pdf(path, p, when, acc, "Coronairangiografie" + (" en PCI" if pci else ""),
                            "Toegang via de arteria radialis rechts. Linker en rechter coronairsysteem in meerdere projecties "
                            "afgebeeld. Geen complicaties.", conclusion + ".", dept="Hartcatheterisatie",
                            kind="CAG/PCI-verslag" if pci else "CAG-verslag")
        self.fact(p, "cag_result", conclusion, when, "cathlab", self.rel(path))

    def echo(self, p: Patient, when: datetime, device: str, lvef: int, faint: bool = False) -> None:
        """Echo 3 (older machine) only exports a screen capture; Echo 5 writes a DICOM structured report."""
        r = self.rng
        ivs = round(r.uniform(0.8, 1.2), 1)
        lvid = round(r.uniform(4.2, 5.6 if lvef >= 50 else 6.4), 1)
        acc = self.next_id("US")
        if device == "Echo 3":
            path = RAW / "echo" / f"{acc}.dcm"
            write_secondary_capture(path, p, when, acc, "TTE volledig", [f"LVEF    {lvef} %", f"IVSd    {ivs} cm", f"LVIDd   {lvid} cm"],
                                    r, device=device, faint={1} if faint else set())
            for f, v in (("lvef", lvef), ("ivs_thickness", round(ivs * 10)), ("lv_diameter", round(lvid * 10))):
                self.fact(p, f, v, when, "echo", self.rel(path))
            return
        tapse = round(r.uniform(1.7 if lvef >= 50 else 1.3, 2.6), 1)
        lavi, lvpw = r.randint(22, 42), round(ivs + r.uniform(-0.1, 0.1), 1)
        vmax = round(r.uniform(1.0, 1.9) if r.random() < 0.85 else r.uniform(2.0, 2.6), 1)  # at most mild aortic sclerosis/stenosis
        grad = max(3, round(4 * vmax ** 2 * r.uniform(0.55, 0.65)))  # synthetic: kept below the peak gradient 4·v² (simplified Bernoulli)
        path = RAW / "echo" / f"{acc}_sr.dcm"
        items = [("10230-1", "Left ventricular ejection fraction", lvef, "%"), ("18154-5", "Interventricular septum, diastole", ivs, "cm"),
                 ("29436-3", "LV internal diameter, diastole", lvid, "cm"), ("18152-9", "LV posterior wall, diastole", lvpw, "cm"),
                 ("77903-3", "TAPSE", tapse, "cm"), ("79984-1", "LA volume index (biplane)", lavi, "mL/m2"),
                 ("79964-3", "Aortic valve peak velocity", vmax, "m/s"), ("79962-7", "Aortic valve mean gradient", grad, "mm[Hg]")]
        write_sr(path, p, when, acc, "TTE volledig", items, device=device)
        for f, v in (("lvef", lvef), ("ivs_thickness", round(ivs * 10)), ("lv_diameter", round(lvid * 10)), ("lvpwd", round(lvpw * 10)),
                     ("tapse", round(tapse * 10)), ("lavi", lavi), ("av_vmax", round(vmax * 100)), ("av_meangrad", grad)):
            self.fact(p, f, v, when, "echo", self.rel(path))

    def ccta(self, p: Patient, when: datetime) -> str:
        """CT coronary angiography with calcium score; the stenosis grade is reported as CAD-RADS (2.0: 4A = 70-99%,
        invasive angiography). Very high scores only from age 55."""
        r = self.rng
        acc = self.ct(p, when, "CT coronair angiografie")
        top = [r.randint(401, 1200)] if self.age(p, when) >= 55 else []
        score = r.choice([0, 0, r.randint(1, 99), r.randint(100, 400), *top])
        cadrads = "0" if score == 0 else "1" if score < 100 else "2" if score <= 400 else "4A"
        finding = {"0": "Geen coronaire plaque.", "1": "Minimale plaque, stenose minder dan 25%.", "2": "Plaque met stenose van 25 tot 49%.",
                   "4A": "Uitgebreide verkalking met stenose van 70 tot 99% in de proximale LAD."}[cadrads]
        advice = "Advies: invasieve coronairangiografie." if cadrads == "4A" else "Advies: cardiovasculair risicomanagement."
        self.radiology_report(p, when, acc, "CT coronair angiografie",
                              f"Goede beeldkwaliteit. Agatston calciumscore: {score}. {finding} CAD-RADS {cadrads}.",
                              advice, {"calcium_score": score, "cad_rads": cadrads})
        if cadrads == "4A":
            self.cath_report(p, self.daytime(when + timedelta(days=r.randint(20, 45))), CAG_POSITIVE[1])
        return cadrads

    # ------------------------------------------------------------ chest pain
    # ESC 2023 ACS guideline (Eur Heart J 2023;44:3720), supplementary Table S4, hs-cTnT (Elecsys), ng/L:
    # rule-out 0h < 12 and 1h delta < 3; rule-in 0h >= 52 or 1h delta >= 5; otherwise observe, with a 3 h troponin (± echo);
    # observe with a relevant rise -> invasive angiography (here: 3 h value reaching the rule-in level of 52), otherwise
    # non-invasive imaging. NSTEMI: invasive angiography within 24 h. ECG first, in every route.
    # NHG-Standaard ACS: a GP sends a likely ACS by ambulance and does no troponin test; stable complaints go to the outpatient clinic.

    def troponins(self, cls: str) -> tuple[int, int]:
        r = self.rng
        if cls == "rule_out":
            t0 = r.randint(5, 11)  # most labs report below 5 as "<5"; kept at 5 or above here
            return t0, t0 + r.randint(0, 2)
        if cls == "observe":
            t0 = r.randint(12, 40)
            return t0, t0 + r.randint(0, 4)
        t0 = r.randint(30, 380)
        return t0, t0 + r.randint(6, 160)

    def nt_probnp(self, p: Patient, lvef: int, when: datetime, egfr: int) -> int:
        """Synthetic, tied to LVEF and raised with age and renal function, so the echo and the peptide tell one story."""
        r = self.rng
        v = r.uniform(80, 600) if lvef >= 50 else r.uniform(600, 2500) if lvef >= 40 else r.uniform(1500, 6000)
        return round(v * (1.6 if self.age(p, when) > 75 else 1) * (1.5 if egfr < 45 else 1))

    def chest_pain(self, p: Patient, t0: datetime, route: str, cls: str, device: str | None, faint: bool = False) -> None:
        r = self.rng
        cm = {"af": r.random() < 0.2, "dm": r.random() < 0.25, "ckd": r.random() < 0.15}
        crea = r.uniform(62, 100) * (1.7 if cm["ckd"] else 1)
        lvef = r.randint(30, 58) if cls == "rule_in" else r.randint(52, 66)
        self.bnp_prev = None
        if route == "gp":
            self.stable_chest_pain(p, t0, cm, crea, device or "Echo 5", lvef)
            return
        if route == "heuvelland":
            v0, v1 = self.troponins(cls)
            self.fact(p, "troponin_poc", round(v0 * r.uniform(0.6, 0.9)), t0, "offline", None,
                      loss=f"ER point-of-care result at {NEIGHBOUR_SHORT}, sent by fax")
            self.fact(p, "ecg_conclusion", "ECG at the referring hospital", t0, "offline", None,
                      loss="ECG printed and faxed with the transfer; not archived")
            self.ext_lab(p, t0 + timedelta(minutes=40), {"troponin": v0, **self.renal(p, crea, t0), "hb": self.hb(p),
                         "potassium": round(r.uniform(3.6, 4.9), 1), "sodium": r.randint(135, 144),
                         "urea": round(crea * 0.08 * r.uniform(0.85, 1.15), 1)})
            self.ext_lab(p, t0 + timedelta(hours=1, minutes=40), {"troponin": v1})
            arrive = t0 + timedelta(hours=r.randint(3, 5))
            peak = round(v1 * r.uniform(1.2, 2.5))
        elif route == "maasland":
            ti0 = r.randint(60, 2500)
            ti1 = round(ti0 * r.uniform(1.15, 1.9))
            nb = {"troponin_i": ti0, "ck": round(ti0 * r.uniform(0.3, 0.6) + r.randint(60, 150)), "sodium": r.randint(134, 144),
                  "potassium": round(r.uniform(3.5, 5.0), 1), "creatinine": round(crea), "egfr_2021": self.egfr(p, crea, t0, 2021)}
            units = {}
            if r.random() < 0.6:
                nb["nt_probnp"], units["nt_probnp"] = self.nt_probnp(p, lvef, t0, nb["egfr_2021"]), "pmol/L"
                self.bnp_prev = nb["nt_probnp"]
            else:
                nb["bnp"] = round(self.nt_probnp(p, lvef, t0, nb["egfr_2021"]) / r.uniform(4, 8))
            if r.random() < 0.3:
                nb["ddimer"], units["ddimer"] = round(r.uniform(0.3, 2.4), 2), "ug{FEU}/L"
            if cm["af"]:
                nb["digoxin"], units["digoxin"] = round(r.uniform(0.6, 1.6), 1), "nmol/L"
            self.fact(p, "ecg_conclusion", "ECG at the referring hospital", t0, "offline", None,
                      loss="ECG sent along as a paper print with the transfer; not archived")
            self.nb_lab(p, t0 + timedelta(minutes=30), nb, units)
            self.nb_lab(p, t0 + timedelta(hours=1, minutes=30), {"troponin_i": ti1}, {})
            arrive = t0 + timedelta(hours=r.randint(3, 6))
            peak = round(ti1 * r.uniform(0.25, 0.5))  # different assay: troponin T is lower than troponin I, still rising
        else:  # ambulance straight to our emergency department: the 0h/1h algorithm runs here
            v0, v1 = self.troponins(cls)
            self.ecg(p, t0 + timedelta(minutes=5), cm["af"], cls == "rule_in")
            self.epic_lab(p, t0 + timedelta(minutes=20), {"troponin": v0, **self.renal(p, crea, t0), "hb": self.hb(p),
                          "potassium": round(r.uniform(3.6, 4.9), 1), "sodium": r.randint(135, 144),
                          "glucose": round(r.uniform(5.5, 11.0) if cm["dm"] else r.uniform(4.8, 7.2), 1),
                          "crp": r.randint(1, 18), "wbc": round(r.uniform(5.0, 11.5), 1), "platelets": r.randint(160, 380),
                          **({"tsh": round(r.uniform(0.6, 4.2), 2), "inr": round(r.uniform(1.0, 3.1), 1)} if cm["af"] else {})})
            self.epic_lab(p, t0 + timedelta(hours=1, minutes=20), {"troponin": v1})
            if cls == "rule_out":
                if r.random() < 0.4:  # ESC: CCTA after discharge may find plaque
                    self.ccta(p, self.daytime(t0 + timedelta(days=r.randint(14, 42))))
                return
            if cls == "observe":
                rise = r.random() < 0.5
                v3 = r.randint(52, 120) if rise else v1 + r.randint(-1, 2)
                self.epic_lab(p, t0 + timedelta(hours=3, minutes=20), {"troponin": v3})
                if rise:  # relevant rise: admitted as NSTEMI
                    self.admission(p, t0 + timedelta(hours=4), round(v3 * r.uniform(1.1, 1.6)), cm, crea, device, faint,
                                   r.randint(48, 62), first_panel=False)
                    return
                if device:
                    self.echo(p, self.daytime(t0 + timedelta(hours=12), weekend=True), device, lvef, faint=faint)
                if not cm["af"]:  # AF: CT image quality is poor; functional testing instead (not part of this data)
                    self.ccta(p, self.daytime(t0 + timedelta(days=1)))
                return
            self.admission(p, t0 + timedelta(hours=r.randint(3, 5)), round(v1 * r.uniform(1.2, 2.5)), cm, crea, device, faint, lvef,
                           first_panel=False)
            return
        self.admission(p, arrive, peak, cm, crea, device, faint, lvef)

    def admission(self, p: Patient, arrive: datetime, peak: int, cm: dict, crea: float, device: str | None, faint: bool,
                  lvef: int, first_panel: bool = True) -> None:
        """NSTEMI admitted to cardiology: serial troponin, NT-proBNP, lipids and HbA1c next morning (ESC: all ACS),
        echo on the day list, invasive angiography on the next daytime list within 24 h."""
        r = self.rng
        cr = crea * r.uniform(0.95, 1.08)
        egfr = self.egfr(p, cr, arrive)
        bnp = round(self.bnp_prev * r.uniform(0.9, 1.3)) if self.bnp_prev else self.nt_probnp(p, lvef, arrive, egfr)
        panel = {"troponin": peak, "nt_probnp": bnp}
        if first_panel:  # transferred: our own admission panel; after our own ED the basics are already there
            self.ecg(p, arrive + timedelta(minutes=10), cm["af"], True)
            panel.update(**self.renal(p, cr, arrive), hb=self.hb(p), potassium=round(r.uniform(3.6, 4.9), 1), sodium=r.randint(134, 144),
                         glucose=round(r.uniform(5.5, 11.0) if cm["dm"] else r.uniform(4.8, 7.4), 1), crp=r.randint(1, 30),
                         wbc=round(r.uniform(5.5, 13.5), 1), platelets=r.randint(150, 390), mcv=r.randint(82, 98), aptt=r.randint(26, 34))
        if cm["af"]:
            panel.update(inr=round(r.uniform(1.0, 3.1), 1), tsh=round(r.uniform(0.6, 4.2), 2))
        self.epic_lab(p, arrive + timedelta(minutes=25), panel)
        tm = (arrive + timedelta(days=1)).replace(hour=7, minute=r.choice([0, 15, 30]))
        self.epic_lab(p, tm, {**self.lipids(), "hba1c": r.randint(48, 72) if cm["dm"] else r.randint(32, 41)})
        tc = self.daytime(arrive + timedelta(hours=r.randint(2, 16)), weekend=True)  # within 24 h, on the daytime list
        result = r.choice(CAG_POSITIVE + CAG_POSITIVE + ["Geen significante coronairstenosen; MINOCA, cardiale MRI geadviseerd"])
        self.cath_report(p, tc, result)
        if device:
            self.echo(p, self.daytime(tc + timedelta(hours=3), weekend=True), device, lvef, faint=faint)

    def stable_chest_pain(self, p: Patient, t0: datetime, cm: dict, crea: float, device: str, lvef: int) -> None:
        """Referred by the GP with exertional complaints: outpatient work-up, ECG and echo, no troponin; CCTA unless AF."""
        r = self.rng
        tg = (t0 - timedelta(days=r.randint(10, 40))).replace(hour=9, minute=r.choice([0, 10, 20, 30, 40, 50]))
        rows = [("sbp", tg, r.randint(122, 176)), ("dbp", tg, r.randint(70, 102)), ("heart_rate", tg, r.randint(58, 92)),
                ("weight", tg, round(r.uniform(62, 112), 1)), *[(k, tg, v) for k, v in self.lipids().items()]]
        if cm["dm"]:
            rows.append(("hba1c", tg, r.randint(48, 70)))
        self.gp_export(p, rows, "Pijn op de borst bij inspanning; verwijzing polikliniek cardiologie")
        tv = self.daytime(t0)
        self.ecg(p, tv, cm["af"], False)
        self.epic_lab(p, tv + timedelta(minutes=30), {**self.renal(p, crea, tv), "hb": self.hb(p), "potassium": round(r.uniform(3.7, 4.9), 1),
                                                      "glucose": round(r.uniform(4.8, 7.0), 1),
                                                      **({"tsh": round(r.uniform(0.6, 4.2), 2)} if cm["af"] else {})})
        self.echo(p, tv + timedelta(hours=1), device, lvef)
        if cm["af"]:
            return  # AF: CT image quality is poor; functional testing instead (not part of this data)
        self.ccta(p, self.daytime(tv + timedelta(days=r.randint(10, 30))))

    # ------------------------------------------------------------ pulmonary nodule
    # Fleischner Society 2017, single solid nodule: 6-8 mm -> CT at 6-12 months (then 18-24 months);
    # > 8 mm -> CT at 3 months, PET/CT or tissue sampling. Growth: an increase of >= 2 mm.
    # Growing nodule: PET-CT, CT-guided biopsy (INR and platelets first), pathology with immunohistochemistry,
    # spirometry + DLCO in every resection candidate (ERS/ESTS 2009), then the multidisciplinary meeting (MDO).

    def lung_nodule(self, p: Patient, t0: datetime, grows: bool, operable: bool = True, diagnosis: str = "adeno") -> None:
        r = self.rng
        smokers = ["roker, 30 pakjaren", "gestopt met roken, 25 pakjaren", "roker, 45 pakjaren"]
        smoker = r.choice(smokers if not operable or diagnosis == "squamous" else smokers + ["nooit gerookt"])
        lobe, lobe_x = r.choice([("rechter bovenkwab", "rechter bovenveld"), ("linker bovenkwab", "linker bovenveld"),
                                 ("rechter onderkwab", "rechter onderveld"), ("rechter bovenkwab", "rechter bovenveld")])
        crea = r.uniform(60, 110)
        emphysema = " Centrilobulair emfyseem." if not operable else ""
        if r.random() < 0.5:  # GP route: persistent cough, X-thorax by the GP, then referral
            tg = self.daytime((t0 - timedelta(days=r.randint(14, 40))).replace(hour=10, minute=r.choice([0, 15, 30, 45])))
            self.gp_export(p, [("crp_poc", tg, r.randint(5, 18)), ("sbp", tg, r.randint(118, 162)), ("dbp", tg, r.randint(68, 96)),
                               ("weight", tg, round(r.uniform(55, 98), 1))],
                           f"Aanhoudende hoest; {smoker}; X-thorax: verdichting {lobe_x}")
            exam, intro = "CT thorax met contrast", f"Verwezen na X-thorax met verdichting {lobe_x}."
        else:  # incidental finding on a CT made for another reason
            exam, intro = "CTA longembolie", "Geen longembolie. Bijkomende bevinding:"
        self.epic_lab(p, t0 - timedelta(hours=1), {**self.renal(p, crea, t0), "hb": self.hb(p)})  # eGFR before contrast
        size0 = r.randint(6, 8) if diagnosis == "carcinoid" else r.randint(7, 13) if grows else r.randint(6, 10)
        acc = self.ct(p, t0, exam, nodule_mm=size0)
        small = size0 <= 8
        advice = "Controle CT over 6 tot 12 maanden geadviseerd." if small else "Controle CT over 3 maanden geadviseerd."
        edge = "spiculair begrensd" if grows and diagnosis != "carcinoid" else "glad begrensd"
        self.radiology_report(p, t0, acc, exam,
                              f"{intro} Solitaire solide nodus in de {lobe}, diameter {size0} mm (gemiddelde van lange en korte as), "
                              f"{edge}. Geen pathologische lymfeklieren. Geen pleuravocht.{emphysema}",
                              f"Solitaire longnodus {lobe}. {advice}", {"nodule_size": size0})
        t1 = self.daytime((t0 + timedelta(days=r.randint(180, 330) if small else r.randint(85, 100))).replace(hour=r.randint(8, 16)))
        if t1 > END:
            return
        size1 = size0 + ((2 if diagnosis == "carcinoid" else r.randint(2, 4)) if grows else r.choice([-1, 0, 0, 1]))
        fu = "CT thorax low-dose, zonder contrast"
        acc = self.ct(p, t1, fu, nodule_mm=size1)
        if not grows:
            self.radiology_report(p, t1, acc, fu, f"Bekende nodus {lobe}, thans diameter {size1} mm (eerder {size0} mm). Stabiel.",
                                  "Stabiele longnodus. Controle CT over 18 tot 24 maanden na de eerste CT.", {"nodule_size": size1})
            t2 = self.daytime((t0 + timedelta(days=r.randint(540, 720))).replace(hour=r.randint(8, 16)))
            if t2 <= END:
                acc = self.ct(p, t2, fu, nodule_mm=size1)
                self.radiology_report(p, t2, acc, fu, f"Bekende nodus {lobe}, diameter {size1} mm. Ongewijzigd over twee jaar.",
                                      "Stabiele solide longnodus over twee jaar. Geen verdere controle nodig.", {"nodule_size": size1})
            return
        self.radiology_report(p, t1, acc, fu, f"Bekende nodus {lobe}, thans diameter {size1} mm (eerder {size0} mm). Toename.",
                              "Groei van de longnodus. PET-CT en weefseldiagnostiek geadviseerd.", {"nodule_size": size1})
        tpet = self.daytime(t1 + timedelta(days=r.randint(7, 14)))
        acc = self.ct(p, tpet, "PET-CT", nodule_mm=size1)
        suv = r.uniform(1.5, 2.5) if diagnosis == "carcinoid" else r.uniform(3.5, 11)  # typical carcinoid: low FDG uptake
        pet = f"FDG-avide nodus {lobe}, SUVmax {suv:.1f}; geen klier- of afstandsmetastasen".replace(".", ",", 1)
        self.radiology_report(p, tpet, acc, "PET-CT", f"{pet}.", f"{pet}.", {"pet_result": pet}, heading="PET-conclusie")
        tb = self.daytime(tpet + timedelta(days=r.randint(5, 10)))
        self.epic_lab(p, tb - timedelta(hours=2), {"inr": round(r.uniform(0.9, 1.2), 1), "platelets": r.randint(160, 420), "hb": self.hb(p)})
        t2 = self.daytime(tb + timedelta(days=r.randint(3, 6)))
        case = f"T{t2:%y}-{r.randint(10000, 99999)}"
        diag, micro = PATHOLOGY[diagnosis]
        pdf = RAW / "pathology" / f"{case}.pdf"
        write_pathology_pdf(pdf, p, t2, case, f"CT-geleide transthoracale naaldbiopsie, {lobe} (4 biopten)", micro, diag)
        self.fact(p, "path_diagnosis", diag, t2, "pathology", self.rel(pdf))
        slide = RAW / "pathology" / f"{case}.isyntax"
        write_slide_stub(slide, r)
        self.fact(p, "wsi_slide", "whole-slide image", t2, "pathology", self.rel(slide))
        tp = self.daytime(t2 + timedelta(days=r.randint(3, 8)))
        self.epic_lab(p, tp, {**self.renal(p, crea * r.uniform(0.95, 1.05), tp), "hb": self.hb(p), "sodium": r.randint(135, 145),
                              "potassium": round(r.uniform(3.6, 5.0), 1), "crp": r.randint(1, 25), "wbc": round(r.uniform(4.5, 11.5), 1),
                              "platelets": r.randint(160, 420), "inr": round(r.uniform(0.9, 1.2), 1), "aptt": r.randint(26, 34),
                              "alt": r.randint(10, 55), "ast": r.randint(12, 50), "alp": r.randint(45, 140), "ggt": r.randint(12, 90),
                              "bilirubin": r.randint(5, 22), "albumin": r.randint(33, 46)})
        # lung function: values are synthetic; % predicted is printed as the lab reports it, not computed from a reference equation
        pred, dlco_pred = (r.randint(80, 105), r.randint(80, 100)) if operable else (r.randint(32, 45), r.randint(30, 42))
        ref_fev1 = (4.0 if p.sex == "M" else 3.0) - 0.025 * max(0.0, self.age(p, tp) - 30)  # synthetic predicted value, falls with age
        fev1 = round(max(0.8, ref_fev1) * pred / 100, 2)
        ratio = r.uniform(0.70, 0.80) if operable else r.uniform(0.40, 0.55)
        fvc = round(fev1 / ratio, 2)
        dlco = round(((9.0 if p.sex == "M" else 7.5) - 0.04 * max(0.0, self.age(p, tp) - 30)) * dlco_pred / 100, 1)
        tf = tp + timedelta(hours=2)
        pdf = RAW / "pft" / f"{self.next_id2('LF')}.pdf"
        dec = lambda v, d=2: f"{v:.{d}f}".replace(".", ",")
        ppo = (round(pred * 0.75), round(dlco_pred * 0.75))  # synthetic post-operative estimate after lobectomy
        concl = ("Obstructief patroon. " if ratio < 0.7 else "Geen obstructie. ") + (
            "FEV1 en DLCO boven 80% van voorspeld." if operable else
            f"Ernstige obstructie. ppo-FEV1 {ppo[0]}% en ppo-DLCO {ppo[1]}% van voorspeld: onder 30%, hoog operatierisico (ERS/ESTS).")
        write_pft_pdf(pdf, p, tf, pdf.stem, [
            ("FEV1", f"{dec(fev1)} L  ({pred}% van voorspeld)"), ("FVC", f"{dec(fvc)} L"),
            ("FEV1/FVC", f"{round(100 * fev1 / fvc)} %"), ("DLCO", f"{dec(dlco, 1)} mmol/min/kPa  ({dlco_pred}% van voorspeld)")], concl)
        for f, v in (("fev1", fev1), ("fvc", fvc), ("fev1_fvc", round(100 * fev1 / fvc)), ("dlco", dlco)):
            self.fact(p, f, v, tf, "pft", self.rel(pdf))
        tm = self.daytime(tf + timedelta(days=r.randint(3, 7)))
        if tm <= END:
            stage = "cT1a N0 M0" if size1 <= 10 else "cT1b N0 M0" if size1 <= 20 else "cT1c N0 M0"
            plan = (f"Anatomische resectie (segmentectomie of lobectomie) {lobe}" if operable
                    else "Stereotactische radiotherapie (SBRT), medisch inoperabel")
            advice = f"{plan} bij {stage}" + ("; typering op het resectiepreparaat" if diagnosis == "carcinoid" else "")
            acc = self.next_id2("MDO")
            path = RAW / "mdo" / f"{acc}.pdf"
            write_radiology_pdf(path, p, tm, acc, "Multidisciplinair overleg longoncologie",
                                f"Besproken: CT, PET-CT, pathologie {case}, longfunctie. {smoker.capitalize()}.", advice + ".",
                                dept="Longoncologie", kind="MDO-verslag", heading="Advies")
            self.fact(p, "mdo_advice", advice, tm, "mdo", self.rel(path))

    # ------------------------------------------------------------ chronic kidney disease
    # Categories: KDIGO 2024 (G3a 45-59, G3b 30-44, G4 15-29) and NHG (A1 < 3, A2 3-30, A3 > 30 mg/mmol).
    # Risk colour: the KDIGO heat map. NHG control frequency: yellow once a year, orange twice a year. NHG referral:
    # ACR > 30 mg/mmol, red risk, eGFR fall >= 5 per year (>= 3 measurements in a year), or a confirmed fall of 25%
    # with a worse stage. KDIGO CKD-MBD 2017: Ca, P, PTH from G3a. NVvP lithium: level and creatinine every 3-6 months,
    # TSH and calcium yearly; refer at eGFR < 60. NHG DM2: HbA1c yearly, every 3 months while above target (53).
    # KDIGO 2012 anaemia: Hb < 13.0 g/dL (men) / < 12.0 g/dL (women), here × 0.6206 to mmol/L.

    @staticmethod
    def risk(egfr: float, acr: float) -> str:
        g = 0 if egfr >= 60 else 1 if egfr >= 45 else 2 if egfr >= 30 else 3
        a = 0 if acr < 3 else 1 if acr <= 30 else 2
        return [["green", "yellow", "orange"], ["yellow", "orange", "red"], ["orange", "red", "red"], ["red", "red", "red"]][g][a]

    @staticmethod
    def stage(egfr: float) -> int:
        return 0 if egfr >= 60 else 1 if egfr >= 45 else 2 if egfr >= 30 else 3

    def kidney(self, p: Patient, t0: datetime, k_idx: int, bsn_gaps: set[int], typo_visit: int | None) -> None:
        r = self.rng
        dm, lithium = k_idx in (0, 1, 4, 7, 10), k_idx in (2, 9)
        egfr = r.uniform(62, 70) if lithium else r.uniform(45, 58)
        acr = r.choice([r.uniform(1.0, 2.9), r.uniform(4, 25), r.uniform(4, 25)])
        fast = k_idx in (1, 8)  # two deliberate fast progressors
        decline = r.uniform(5, 8) if fast else r.uniform(1, 3) + (1.5 if acr > 3 else 0)
        acr_rise = r.uniform(1.1, 1.4)
        when, visit, history, reason = t0, 0, [], None
        k = r.uniform(4.0, 4.6)
        last_hba1c = last_tsh = None
        acr_high = 0  # NHG: albuminuria confirmed on a repeat before referral
        li = r.uniform(0.55, 0.8)
        hba1c = r.randint(48, 68) if dm else None
        while True:
            crea = self.crea_for(p, egfr, when) * r.gauss(1, 0.04)
            acr_seen = acr * r.lognormvariate(0, 0.3)
            vals = {**self.renal(p, crea, when), "potassium": round(k + r.gauss(0, 0.2), 1), "uacr": round(acr_seen, 1),
                    "glucose": round(r.uniform(5.5, 9.8) if dm else r.uniform(4.6, 6.6), 1)}
            if dm and (last_hba1c is None or (when - last_hba1c).days > (60 if hba1c > 53 else 300)):
                hba1c = max(45, min(80, hba1c + r.randint(-6, 4)))
                vals["hba1c"], last_hba1c = hba1c, when
            if lithium:
                li = min(0.9, max(0.45, li + r.gauss(0, 0.06)))
                vals["lithium"] = round(li, 2)
                if last_tsh is None or (when - last_tsh).days > 300:
                    tsh = round(r.uniform(0.8, 5.5), 2)
                    vals.update(tsh=tsh, calcium=round(r.uniform(2.2, 2.55), 2), **({"ft4": round(r.uniform(11, 18), 1)} if tsh > 4.0 else {}))
                    last_tsh = when
            self.ext_lab(p, when, vals, omit_bsn=visit in bsn_gaps, dob_typo=visit == typo_visit, requester=GP_PRACTICE)
            self.gp_export(p, [("sbp", when, r.randint(128, 158)), ("dbp", when, r.randint(72, 92))], "Controle chronische nierschade")
            history.append((when, vals["egfr"]))
            colour = self.risk(vals["egfr"], acr_seen)
            recent = [h for h in history if (when - h[0]).days <= 365]
            acr_high = acr_high + 1 if acr_seen > 30 else 0
            if acr_high >= 2:
                reason = "ernstig verhoogde albuminurie (ACR > 30 mg/mmol), bevestigd"
            elif colour == "red":
                reason = "chronische nierschade met sterk verhoogd risico"
            elif len(recent) >= 3 and recent[0][1] - recent[-1][1] >= 5:
                reason = "daling eGFR van 5 of meer per jaar"
            elif history[0][1] - vals["egfr"] >= 0.25 * history[0][1] and self.stage(vals["egfr"]) > self.stage(history[0][1]):
                reason = "daling eGFR van 25% met verslechtering van het stadium"
            elif lithium and vals["egfr"] < 60:
                reason = "lithiumgebruik met eGFR onder 60"
            if reason or when > END - timedelta(days=200):
                break
            gap = 42 if acr_high == 1 else 120 if lithium else 90 if dm and hba1c > 53 else 182 if colour == "orange" else 365
            when = (when + timedelta(days=gap + r.randint(-20, 20))).replace(hour=r.randint(8, 11), minute=r.choice([0, 15, 30, 45]))
            egfr -= decline * gap / 365
            acr *= acr_rise ** (gap / 365)
            k += r.uniform(0, 0.08)
            visit += 1
        if not reason:
            return  # still in GP care: results reach nephrology only as advice requests, no referral
        tr = when + timedelta(days=r.randint(7, 20))
        self.gp_export(p, [("sbp", tr, r.randint(130, 168)), ("dbp", tr, r.randint(75, 96)), ("heart_rate", tr, r.randint(60, 92)),
                           ("weight", tr, round(r.uniform(60, 118), 1))], f"Verwijzing internist-nefroloog: {reason}")
        tn = self.daytime((tr + timedelta(days=r.randint(21, 45))).replace(hour=9))
        egfr -= decline * (tn - when).days / 365
        ca0, pth0, bic = r.uniform(2.2, 2.45), r.gauss(0, 1.5), r.uniform(23, 26)  # per-patient offsets, then small walks
        iron = None
        n = 0
        while tn <= END and n < 8:
            crea = self.crea_for(p, egfr, tn) * r.gauss(1, 0.06)
            e = self.egfr(p, crea, tn)
            hb = self.hb(p, lo_shift=0.4 if e < 45 else 0.0)  # renal anaemia from G3b
            anaemic = hb < (8.07 if p.sex == "M" else 7.45)
            bic = min(27, max(19, bic + r.gauss(0, 0.8) - (0.6 if e < 30 else 0.2)))
            labs = {**self.renal(p, crea, tn), "potassium": round(k + r.gauss(0, 0.2), 1), "sodium": r.randint(136, 144), "hb": hb,
                    "urea": round(crea * 0.08 * r.uniform(0.9, 1.1), 1), "calcium": round(ca0 + r.gauss(0, 0.04), 2),
                    "phosphate": round(r.uniform(0.95, 1.3) + (0.25 if e < 30 else 0), 2), "pth": round(5 + 0.3 * (60 - e) + pth0 + r.gauss(0, 0.8), 1),
                    "bicarbonate": round(bic), "uacr": round(acr * r.lognormvariate(0, 0.3), 1)}
            if n == 0:
                labs.update(albumin=r.randint(36, 46), urine_hb=r.choice(["negatief", "negatief", "negatief", "1+"]), **self.lipids())
            if anaemic:
                iron = iron or {"ferritin": r.uniform(60, 400), "tsat": r.uniform(14, 32), "mcv": r.uniform(84, 96), "b12": r.uniform(200, 500),
                                "folate": r.uniform(8, 30)}
                iron = {"ferritin": iron["ferritin"] * r.lognormvariate(0, 0.15), "tsat": iron["tsat"] + r.gauss(0, 2),
                        "mcv": iron["mcv"] + r.gauss(0, 1.2), "b12": iron["b12"], "folate": iron["folate"]}
                labs.update(ferritin=round(iron["ferritin"]), tsat=round(iron["tsat"]), mcv=round(iron["mcv"]), b12=round(iron["b12"]),
                            folate=round(iron["folate"], 1))
            if dm:
                hba1c = max(45, min(80, hba1c + r.randint(-4, 3)))
                labs["hba1c"] = hba1c
            if lithium:
                li = min(0.9, max(0.45, li + r.gauss(0, 0.05)))
                labs.update(lithium=round(li, 2), tsh=round(r.uniform(0.8, 4.0), 2))
            self.epic_lab(p, tn, labs)
            self.epic_lab(p, tn + timedelta(minutes=40), {"sbp": r.randint(124, 150), "dbp": r.randint(70, 90),
                                                          "weight": round(self.weight.setdefault(p.pid, r.uniform(60, 110)) + r.gauss(0, 0.8), 1)})
            if n == 0:  # renal ultrasound after the first visit: both kidneys
                tu = self.daytime(tn + timedelta(days=r.randint(5, 14)))
                acc = self.next_id("US")
                path = RAW / "radiology" / f"{acc}.dcm"
                left = round(r.uniform(8.8, 10.8), 1)
                right = round(left + r.uniform(-0.5, 0.5), 1)
                write_secondary_capture(path, p, tu, acc, "Echo nieren", [f"Nier re  {right} cm", f"Nier li  {left} cm"], r, device="US 2")
                self.fact(p, "kidney_length_right", round(right * 10), tu, "radiology", self.rel(path))
                self.fact(p, "kidney_length", round(left * 10), tu, "radiology", self.rel(path))
            step = 120 if e < 30 or (e < 45 and acr > 3) else 180  # KDIGO grid: G3b with albuminuria and G4 about 3 times a year
            tn = self.daytime(tn + timedelta(days=step + r.randint(-15, 15)))
            egfr -= decline * r.uniform(0.5, 1.5) * step / 365
            acr *= acr_rise ** (step / 365)
            n += 1


NEIGHBOUR_SHORT = "Heuvelland ER"
END = datetime(2026, 9, 30)
CAG_POSITIVE = ["Eenvatslijden; PCI van de RCA met stentplaatsing", "Eenvatslijden; PCI van de LAD met stentplaatsing",
                "Tweevatslijden; PCI van de RCX, aanvullende revascularisatie gepland", "Drievatslijden; bespreking hartteam voor CABG"]
PATHOLOGY = {
    "adeno": ("Adenocarcinoom van de long, TTF-1 positief; PD-L1 TPS en moleculaire diagnostiek (NGS) aangevraagd",
              "Biopten met infiltratieve groei van atypische klierstructuren. Immunohistochemie: TTF-1 en napsine A positief, p40 negatief."),
    "squamous": ("Plaveiselcelcarcinoom van de long, p40 positief; PD-L1 TPS aangevraagd",
                 "Biopten met solide nesten van atypische plaveiselcellen met verhoorning. Immunohistochemie: p40 en CK5/6 positief, TTF-1 negatief."),
    "carcinoid": ("Carcinoïd/neuro-endocriene tumor, nadere typering op het resectiepreparaat",
                  "Biopten met organoïde nesten van monotone cellen. Immunohistochemie: chromogranine, synaptofysine en INSM1 positief; Ki-67 laag."),
}

# One line per patient, so every journey can be read and checked. P001-P020 keep their names and numbers.
#   chest pain: (route, troponin class, echo device, faint IVSd)   route: heuvelland | maasland | ambulance | gp
#   lung nodule: (grows, operable, diagnosis)      kidney: index (diabetes, lithium, BSN gaps and a typing error by index)
SCHEDULE = {
    "P001": ("chest_pain", "heuvelland", "rule_in", "Echo 3", False), "P002": ("chest_pain", "ambulance", "rule_out", None, False),
    "P003": ("chest_pain", "gp", "stable", "Echo 5", False), "P004": ("chest_pain", "heuvelland", "rule_in", "Echo 5", False),
    "P005": ("chest_pain", "ambulance", "observe", "Echo 3", True), "P006": ("chest_pain", "maasland", "rule_in", "Echo 5", False),
    "P007": ("chest_pain", "gp", "stable", "Echo 3", False),
    "P008": ("lung_nodule", True, True, "adeno"), "P009": ("lung_nodule", True, True, "squamous"), "P010": ("lung_nodule", False, True),
    "P011": ("lung_nodule", True, True, "adeno"), "P012": ("lung_nodule", True, False, "squamous"), "P013": ("lung_nodule", False, True),
    **{f"P0{14 + i}": ("kidney", i) for i in range(7)},
    "P021": ("chest_pain", "ambulance", "rule_in", "Echo 3", False), "P022": ("chest_pain", "ambulance", "rule_out", None, False),
    "P023": ("chest_pain", "gp", "stable", "Echo 5", False), "P024": ("chest_pain", "maasland", "rule_in", "Echo 3", False),
    "P025": ("chest_pain", "ambulance", "observe", "Echo 5", False), "P026": ("chest_pain", "heuvelland", "rule_in", "Echo 5", False),
    "P027": ("chest_pain", "ambulance", "rule_out", None, False), "P028": ("chest_pain", "gp", "stable", "Echo 3", False),
    "P029": ("chest_pain", "ambulance", "rule_in", "Echo 5", False),
    "P030": ("lung_nodule", True, True, "adeno"), "P031": ("lung_nodule", False, True), "P032": ("lung_nodule", True, True, "carcinoid"),
    "P033": ("lung_nodule", False, True), "P034": ("lung_nodule", True, True, "adeno"), "P035": ("lung_nodule", False, True),
    **{f"P0{36 + i}": ("kidney", 7 + i) for i in range(5)},
}


def main() -> None:
    rng = random.Random(SEED)
    if RAW.exists():
        shutil.rmtree(RAW)
    for sub in ("epic_lab", "ext_lab", "radiology", "echo", "pathology", "gp", "nb_lab", "pft", "cathlab", "ecg", "mdo"):
        (RAW / sub).mkdir(parents=True)

    patients = make_patients(rng, len(SCHEDULE))
    world = World(rng)
    for p in patients:
        plan = SCHEDULE[p.pid]
        p.path = plan[0]
        if p.path == "kidney":
            t0 = datetime(2024, rng.randint(1, 12), rng.randint(1, 28), rng.randint(8, 11), rng.choice([0, 15, 30, 45]))
            i = plan[1]
            gaps = {1} if i in (0, 3, 5) else set()  # some regional-lab files arrive without a BSN
            if i == 5:
                gaps.add(3)
            world.kidney(p, t0, i, gaps, 1 if i == 3 else None)  # one also has a hand-typed birth date error
        elif p.path == "lung_nodule":
            p.dob = p.dob.replace(year=rng.randint(1945, 1966))  # lung cancer is mostly seen at 60-80
            t0 = datetime(2025, rng.randint(1, 12), rng.randint(1, 28), rng.randint(8, 16), rng.choice([0, 15, 30, 45]))
            world.lung_nodule(p, World.daytime(t0), *plan[1:])
        else:
            t0 = datetime(2026, rng.randint(1, 8), rng.randint(1, 28), rng.randint(7, 20), rng.choice([0, 15, 30, 45]))
            world.chest_pain(p, t0, *plan[1:])

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
