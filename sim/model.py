"""Shared vocabulary: canonical facts, their units and codes, and the fictional organisations."""

# Canonical facts. `unit` is the unit the truth is stored in and the unit the
# assembler must harmonise to (the Dutch exchange unit). `loinc` is the code the
# hospital files the result under; `nhg` is the NHG-Tabel 45 number a GP system uses.
# Codes checked on loinc.org / tx.fhir.org (LOINC 2.82) and bepalingen.nhg.org (Tabel 45 v45).
FACTS = {
    "troponin":       {"label": "Troponin T (hs)",        "unit": "ng/L",          "loinc": "67151-1", "kind": "lab"},
    "troponin_poc":   {"label": "Troponin (ER point-of-care)", "unit": "ng/L",     "loinc": None,      "kind": "lab"},
    "creatinine":     {"label": "Creatinine",             "unit": "umol/L",        "loinc": "14682-9", "kind": "lab", "nhg": "523"},
    "egfr":           {"label": "eGFR (CKD-EPI)",         "unit": "mL/min/1.73m2", "loinc": "62238-1", "kind": "lab", "nhg": "3583"},
    "glucose":        {"label": "Glucose",                "unit": "mmol/L",        "loinc": "14749-6", "kind": "lab", "nhg": "371"},
    "hb":             {"label": "Haemoglobin",            "unit": "mmol/L",        "loinc": "59260-0", "kind": "lab", "nhg": "412"},
    "lvef":           {"label": "LV ejection fraction",   "unit": "%",             "loinc": "10230-1", "kind": "measurement"},
    "ivs_thickness":  {"label": "IVS thickness (diastole)", "unit": "mm",          "loinc": "18154-5", "kind": "measurement"},
    "lv_diameter":    {"label": "LV diameter (diastole)", "unit": "mm",            "loinc": "29436-3", "kind": "measurement"},
    "kidney_length":  {"label": "Kidney length (left)",   "unit": "mm",            "loinc": "15288-4", "kind": "measurement"},
    "ct_exam":        {"label": "CT examination",         "unit": None,            "loinc": None,      "kind": "exam"},
    "ct_raw_data":    {"label": "CT raw projection data", "unit": None,            "loinc": None,      "kind": "raw"},
    "calcium_score":  {"label": "Coronary calcium score", "unit": "Agatston",      "loinc": None,      "kind": "measurement"},
    "nodule_size":    {"label": "Lung nodule diameter",   "unit": "mm",            "loinc": None,      "kind": "measurement"},
    "path_diagnosis": {"label": "Pathology diagnosis",    "unit": None,            "loinc": None,      "kind": "text"},
    "tumour_size":    {"label": "Tumour size (pathology)", "unit": "mm",           "loinc": "21889-1", "kind": "measurement"},
    "wsi_slide":      {"label": "Whole-slide image",      "unit": None,            "loinc": None,      "kind": "raw"},
    # cardiac
    "troponin_i":     {"label": "Troponin I (hs)",        "unit": "ng/L",          "loinc": "89579-7", "kind": "lab", "nhg": "4186"},
    "nt_probnp":      {"label": "NT-proBNP",              "unit": "ng/L",          "loinc": "33762-6", "kind": "lab", "nhg": "1968"},
    "bnp":            {"label": "BNP",                    "unit": "ng/L",          "loinc": "30934-4", "kind": "lab"},
    "ck":             {"label": "Creatine kinase",        "unit": "U/L",           "loinc": "2157-6",  "kind": "lab"},
    "digoxin":        {"label": "Digoxin",                "unit": "ug/L",          "loinc": "10535-3", "kind": "lab"},
    # chemistry
    "sodium":         {"label": "Sodium",                 "unit": "mmol/L",        "loinc": "2951-2",  "kind": "lab", "nhg": "624"},
    "potassium":      {"label": "Potassium",              "unit": "mmol/L",        "loinc": "2823-3",  "kind": "lab", "nhg": "513"},
    "calcium":        {"label": "Calcium",                "unit": "mmol/L",        "loinc": "2000-8",  "kind": "lab"},
    "phosphate":      {"label": "Phosphate",              "unit": "mmol/L",        "loinc": "14879-1", "kind": "lab"},
    "uacr":           {"label": "Albumin/creatinine ratio (urine)", "unit": "mg/mmol", "loinc": "32294-1", "kind": "lab", "nhg": "40"},
    "hba1c":          {"label": "HbA1c (IFCC)",           "unit": "mmol/mol",      "loinc": "59261-8", "kind": "lab", "nhg": "2816"},
    "lithium":        {"label": "Lithium",                "unit": "mmol/L",        "loinc": "14334-7", "kind": "lab"},
    "cholesterol":    {"label": "Cholesterol, total",     "unit": "mmol/L",        "loinc": "14647-2", "kind": "lab", "nhg": "192"},
    "ldl":            {"label": "LDL cholesterol",        "unit": "mmol/L",        "loinc": "22748-8", "kind": "lab", "nhg": "542"},
    "hdl":            {"label": "HDL cholesterol",        "unit": "mmol/L",        "loinc": "14646-4", "kind": "lab", "nhg": "446"},
    "triglycerides":  {"label": "Triglycerides",          "unit": "mmol/L",        "loinc": "14927-8", "kind": "lab", "nhg": "1377"},
    # haematology, inflammation, coagulation, blood gas
    "crp":            {"label": "C-reactive protein",     "unit": "mg/L",          "loinc": "1988-5",  "kind": "lab", "nhg": "227"},
    "crp_poc":        {"label": "CRP (GP point-of-care)", "unit": "mg/L",          "loinc": None,      "kind": "lab", "nhg": "3755"},
    "wbc":            {"label": "Leukocytes",             "unit": "10*9/L",        "loinc": "6690-2",  "kind": "lab", "nhg": "547"},
    "platelets":      {"label": "Platelets",              "unit": "10*9/L",        "loinc": "777-3",   "kind": "lab", "nhg": "1379"},
    "inr":            {"label": "INR",                    "unit": "{INR}",         "loinc": "6301-6",  "kind": "lab", "nhg": "508"},
    "pco2":           {"label": "pCO2 (arterial)",        "unit": "kPa",           "loinc": "2019-8",  "kind": "lab"},
    "po2":            {"label": "pO2 (arterial)",         "unit": "kPa",           "loinc": "2703-7",  "kind": "lab"},
    # vital signs (zib 2020 BloodPressure, HeartRate, BodyWeight)
    "sbp":            {"label": "Blood pressure, systolic",  "unit": "mm[Hg]",     "loinc": "8480-6",  "kind": "measurement", "nhg": "1744"},
    "dbp":            {"label": "Blood pressure, diastolic", "unit": "mm[Hg]",     "loinc": "8462-4",  "kind": "measurement", "nhg": "1740"},
    "heart_rate":     {"label": "Heart rate",             "unit": "/min",          "loinc": "8867-4",  "kind": "measurement", "nhg": "1875"},
    "weight":         {"label": "Body weight",            "unit": "kg",            "loinc": "29463-7", "kind": "measurement", "nhg": "357"},
    # echo, structured report (DICOM CID 12300 codes)
    "tapse":          {"label": "TAPSE",                  "unit": "mm",            "loinc": "77903-3", "kind": "measurement"},
    "lavi":           {"label": "LA volume index",        "unit": "mL/m2",         "loinc": "79984-1", "kind": "measurement"},
    # pulmonary function
    "fev1":           {"label": "FEV1",                   "unit": "L",             "loinc": "20150-9", "kind": "measurement"},
    "fvc":            {"label": "FVC",                    "unit": "L",             "loinc": "19870-5", "kind": "measurement"},
    "fev1_fvc":       {"label": "FEV1/FVC",               "unit": "%",             "loinc": "19926-5", "kind": "measurement"},
    "dlco":           {"label": "DLCO",                   "unit": "mmol/min/kPa",  "loinc": "19911-7", "kind": "measurement"},
    # second batch
    "egfr_2021":      {"label": "eGFR (CKD-EPI 2021)",    "unit": "mL/min/1.73m2", "loinc": "98979-8", "kind": "lab"},
    "ddimer":         {"label": "D-dimer (FEU)",          "unit": "mg{FEU}/L",     "loinc": "48065-7", "kind": "lab"},
    "mcv":            {"label": "MCV",                    "unit": "fL",            "loinc": "787-2",   "kind": "lab"},
    "tsh":            {"label": "TSH",                    "unit": "m[IU]/L",       "loinc": "3016-3",  "kind": "lab", "nhg": "1385"},
    "ft4":            {"label": "Free T4",                "unit": "pmol/L",        "loinc": "14920-3", "kind": "lab", "nhg": "348"},
    "alt":            {"label": "ALT",                    "unit": "U/L",           "loinc": "1742-6",  "kind": "lab"},
    "ast":            {"label": "AST",                    "unit": "U/L",           "loinc": "1920-8",  "kind": "lab"},
    "alp":            {"label": "Alkaline phosphatase",   "unit": "U/L",           "loinc": "6768-6",  "kind": "lab"},
    "ggt":            {"label": "Gamma-GT",               "unit": "U/L",           "loinc": "2324-2",  "kind": "lab"},
    "bilirubin":      {"label": "Bilirubin, total",       "unit": "umol/L",        "loinc": "14631-6", "kind": "lab"},
    "albumin":        {"label": "Albumin",                "unit": "g/L",           "loinc": "1751-7",  "kind": "lab"},
    "aptt":           {"label": "aPTT",                   "unit": "s",             "loinc": "14979-9", "kind": "lab"},
    "ldh":            {"label": "LDH",                    "unit": "U/L",           "loinc": "14804-9", "kind": "lab"},
    "cea":            {"label": "CEA",                    "unit": "ug/L",          "loinc": "2039-6",  "kind": "lab"},
    "urea":           {"label": "Urea",                   "unit": "mmol/L",        "loinc": "22664-7", "kind": "lab"},
    "pth":            {"label": "Parathyroid hormone",    "unit": "pmol/L",        "loinc": "14866-8", "kind": "lab"},
    "bicarbonate":    {"label": "Bicarbonate",            "unit": "mmol/L",        "loinc": "1963-8",  "kind": "lab"},
    "ferritin":       {"label": "Ferritin",               "unit": "ug/L",          "loinc": "2276-4",  "kind": "lab", "nhg": "328"},
    "lvpwd":          {"label": "LV posterior wall (diastole)", "unit": "mm",      "loinc": "18152-9", "kind": "measurement"},
    "av_vmax":        {"label": "Aortic valve peak velocity", "unit": "cm/s",      "loinc": "79964-3", "kind": "measurement"},
    "av_meangrad":    {"label": "Aortic valve mean gradient", "unit": "mm[Hg]",    "loinc": "79962-7", "kind": "measurement"},
    "cag_result":     {"label": "Coronary angiography, conclusion", "unit": None,    "loinc": None,      "kind": "text"},
    # third batch, after clinical review
    "pr":             {"label": "PR interval",            "unit": "ms",            "loinc": "8625-6",  "kind": "measurement"},
    "qrs":            {"label": "QRS duration",           "unit": "ms",            "loinc": "8633-0",  "kind": "measurement"},
    "qtc":            {"label": "QTc interval",           "unit": "ms",            "loinc": "8636-3",  "kind": "measurement"},
    "ecg_conclusion": {"label": "ECG, conclusion",        "unit": None,            "loinc": None,      "kind": "text"},
    "tsat":           {"label": "Transferrin saturation", "unit": "%",             "loinc": "2502-3",  "kind": "lab"},
    "b12":            {"label": "Vitamin B12",            "unit": "pmol/L",        "loinc": "14685-2", "kind": "lab"},
    "urine_hb":       {"label": "Blood in urine (dipstick)", "unit": None,         "loinc": "5794-3",  "kind": "text"},
    "kidney_length_right": {"label": "Kidney length (right)", "unit": "mm",        "loinc": "15291-8", "kind": "measurement"},
    "pet_result":     {"label": "PET-CT, conclusion",     "unit": None,            "loinc": None,      "kind": "text"},
    "mdo_advice":     {"label": "MDT meeting, advice",    "unit": None,            "loinc": None,      "kind": "text"},
    "cad_rads":       {"label": "CAD-RADS",               "unit": None,            "loinc": None,      "kind": "text"},
    "folate":         {"label": "Folate",                 "unit": "nmol/L",        "loinc": "14732-2", "kind": "lab"},
}

NHG_TO_FACT = {f["nhg"]: k for k, f in FACTS.items() if f.get("nhg")}
NHG_MEMO = {"523": "KREA", "3583": "KREC", "371": "GLUC", "412": "HB", "4186": "HTNI", "1968": "NTPR", "624": "NA", "513": "K",
            "40": "ALBK", "2816": "HBAC", "192": "CHOL", "542": "LDL", "446": "HDL", "1377": "TRIG", "227": "CRP",
            "547": "LEUK", "1379": "TROM", "508": "INR", "1744": "RRSY", "1740": "RRDI", "1875": "POLS", "357": "GEW",
            "1385": "TSH", "348": "FT4", "328": "FERR"}

# The external lab speaks its own dialect: local codes and conventional units.
# factor converts the external unit into the canonical unit; `formula` replaces it where
# a plain factor would be wrong (HbA1c). Factors: AMA Manual of Style SI table
# (academic.oup.com/amamanualofstyle/si-conversion-calculator); HbA1c: NGSP master equation
# (ngsp.org/ifccngsp.asp); urine albumin/creatinine: KDIGO 2012.
EXT_LAB_CODES = {
    "troponin":   {"code": "TNTHS", "name": "Troponine T hs", "unit": "ug/L",  "factor": 1000.0,  "decimals": 3},
    "creatinine": {"code": "KREA",  "name": "Kreatinine",     "unit": "mg/dL", "factor": 88.4,    "decimals": 2},
    "egfr":       {"code": "EGFR",  "name": "eGFR CKD-EPI",   "unit": "ml/min", "factor": 1.0,    "decimals": 0},
    "glucose":    {"code": "GLUC",  "name": "Glucose nuchter", "unit": "mg/dL", "factor": 0.0555, "decimals": 0},
    "hb":         {"code": "HB",    "name": "Hemoglobine",    "unit": "g/dL",  "factor": 0.6206,  "decimals": 1},
    "potassium":  {"code": "KAL",   "name": "Kalium",         "unit": "mmol/l", "factor": 1.0,    "decimals": 1},
    "uacr":       {"code": "ACR",   "name": "Albumine/kreatinine ratio", "unit": "mg/g", "factor": 0.113, "decimals": 0},
    "hba1c":      {"code": "HBA1C", "name": "HbA1c",          "unit": "%",     "formula": (10.93, -23.50), "decimals": 1},
    "calcium":    {"code": "CA",    "name": "Calcium",        "unit": "mg/dL", "factor": 0.25,    "decimals": 1},
    "phosphate":  {"code": "FOSF",  "name": "Fosfaat",        "unit": "mg/dL", "factor": 0.323,   "decimals": 1},
    "lithium":    {"code": "LITH",  "name": "Lithium",        "unit": "meq/L", "factor": 1.0,     "decimals": 2},
    "sodium":     {"code": "NA",    "name": "Natrium",        "unit": "mmol/l", "factor": 1.0,    "decimals": 0},
    "tsh":        {"code": "TSH",   "name": "TSH",            "unit": "mU/l",  "factor": 1.0,     "decimals": 2},
    "ft4":        {"code": "FT4",   "name": "Vrij T4",        "unit": "ng/dL", "factor": 12.871,  "decimals": 2},
    "urea":       {"code": "BUN",   "name": "Ureumstikstof",  "unit": "mg/dL", "factor": 0.357,   "decimals": 0},
}

# LOINC-coded results that arrive under a sibling code or in another unit. key: (fact, unit as sent).
# NT-proBNP pmol/L: FDA 510(k) K042347 (125 pg/mL = 14.8 pmol/L); digoxin: AMA (ng/mL × 1.281 = nmol/L).
UNIT_CONVERSIONS = {
    ("nt_probnp", "pmol/L"): ("÷", 0.118),
    ("digoxin", "nmol/L"): ("÷", 1.281),
    ("tapse", "cm"): ("×", 10),
    ("lvpwd", "cm"): ("×", 10),
    ("ivs_thickness", "cm"): ("×", 10),
    ("lv_diameter", "cm"): ("×", 10),
    ("av_vmax", "m/s"): ("×", 100),
    ("ddimer", "ug{FEU}/L"): ("×", 0.001),  # SI prefix within FEU; never FEU to DDU
}


def convert(op: tuple[str, float], value: float, back: bool = False) -> float:
    sign, k = op
    return value * k if (sign == "×") != back else value / k
LOINC_ALIASES = {"33763-4": "nt_probnp"}  # NT-proBNP [Moles/volume]

# Never converted into another fact, whatever the unit: a different molecule or assay.
NOT_CONVERTIBLE = {
    "troponin_i": "Troponin I assay of the sender. Not convertible to troponin T: each assay has its own 99th percentile.",
    "bnp": "BNP, not NT-proBNP: a different molecule. Not converted; kept as a separate result.",
    "egfr_2021": "eGFR by the CKD-EPI 2021 equation; ours reports CKD-EPI. Not on the same trend line: recompute from creatinine.",
}


def to_canonical(fact: str, value: float) -> float:
    c = EXT_LAB_CODES[fact]
    if "formula" in c:
        a, b = c["formula"]
        return value * a + b
    return value * c["factor"]


def to_local(fact: str, value: float) -> float:
    c = EXT_LAB_CODES[fact]
    if "formula" in c:
        a, b = c["formula"]
        return (value - b) / a
    return value / c["factor"]


# Six source systems, as the viewer shows them.
SOURCES = {
    "epic_lab":  {"label": "Internal lab",        "system": "EHR lab module (Epic Beaker-like)", "format": "HL7v2 ORU^R01"},
    "ext_lab":   {"label": "Regional lab",        "system": "Neighbour hospital / regional lab", "format": "EDIFACT-style MEDLAB"},
    "radiology": {"label": "Radiology",           "system": "Imaging archive (Sectra-like PACS)", "format": "DICOM + PDF report"},
    "echo":      {"label": "Echo / cardiology",   "system": "Ultrasound device into the PACS",   "format": "DICOM Secondary Capture"},
    "pathology": {"label": "Pathology",           "system": "Shared regional pathology lab",     "format": "PDF + proprietary slide"},
    "offline":   {"label": "Never archived",      "system": "Fax, scanner memory, paper",        "format": "none"},
    "gp":        {"label": "General practice",    "system": "GP information system (HIS)",       "format": "HIS export, NHG Tabel 45"},
    "nb_lab":    {"label": "Referring hospital lab", "system": "Neighbour hospital LIS",          "format": "HL7v2 ORU^R01"},
    "pft":       {"label": "Lung function",       "system": "Pulmonary function lab",            "format": "PDF report"},
    "cathlab":   {"label": "Catheterisation lab", "system": "Cardiology reporting system",       "format": "PDF report"},
    "ecg":       {"label": "ECG",                 "system": "ECG management system",             "format": "PDF report"},
    "mdo":       {"label": "MDT meeting",         "system": "Oncology MDT reporting",            "format": "PDF report"},
}

# Fictional organisations. Modelled on a typical Dutch academic hospital; none are real.
HOSPITAL = "Academisch Ziekenhuis Zuid"
HOSPITAL_CODE = "AZZUID"
NEIGHBOUR = "Heuvelland Ziekenhuis"
NEIGHBOUR_CODE = "HEUVELLAND"
NEIGHBOUR2 = "Maasland Ziekenhuis"  # a second referring hospital with its own laboratory and troponin I assay
NEIGHBOUR2_CODE = "MAASLAND"
EXT_LAB = "Regiolab Zuid"
EXT_LAB_CODE = "REGIOLABZUID"
PATH_LAB = "Pathologie Limburg Samenwerking"
GP_PRACTICE = "Huisartsenpraktijk Molenveld"
