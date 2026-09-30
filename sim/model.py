"""Shared vocabulary: canonical facts, their units and codes, and the fictional organisations."""

# Canonical facts. `unit` is the unit the truth is stored in and the unit the
# assembler must harmonise to. `loinc` only exists for lab tests.
FACTS = {
    "troponin":       {"label": "Troponin T (hs)",        "unit": "ng/L",          "loinc": "67151-1", "kind": "lab"},
    "troponin_poc":   {"label": "Troponin (ER point-of-care)", "unit": "ng/L",     "loinc": None,      "kind": "lab"},
    "creatinine":     {"label": "Creatinine",             "unit": "umol/L",        "loinc": "14682-9", "kind": "lab"},
    "egfr":           {"label": "eGFR (CKD-EPI)",         "unit": "mL/min/1.73m2", "loinc": "62238-1", "kind": "lab"},
    "glucose":        {"label": "Glucose",                "unit": "mmol/L",        "loinc": "14749-6", "kind": "lab"},
    "hb":             {"label": "Haemoglobin",            "unit": "mmol/L",        "loinc": "59260-0", "kind": "lab"},
    "lvef":           {"label": "LV ejection fraction",   "unit": "%",             "loinc": None,      "kind": "measurement"},
    "ivs_thickness":  {"label": "IVS thickness (diastole)", "unit": "mm",          "loinc": None,      "kind": "measurement"},
    "lv_diameter":    {"label": "LV diameter (diastole)", "unit": "mm",            "loinc": None,      "kind": "measurement"},
    "kidney_length":  {"label": "Kidney length (left)",   "unit": "mm",            "loinc": None,      "kind": "measurement"},
    "ct_exam":        {"label": "CT examination",         "unit": None,            "loinc": None,      "kind": "exam"},
    "ct_raw_data":    {"label": "CT raw projection data", "unit": None,            "loinc": None,      "kind": "raw"},
    "calcium_score":  {"label": "Coronary calcium score", "unit": "Agatston",      "loinc": None,      "kind": "measurement"},
    "nodule_size":    {"label": "Lung nodule diameter",   "unit": "mm",            "loinc": None,      "kind": "measurement"},
    "path_diagnosis": {"label": "Pathology diagnosis",    "unit": None,            "loinc": None,      "kind": "text"},
    "tumour_size":    {"label": "Tumour size (pathology)", "unit": "mm",           "loinc": None,      "kind": "measurement"},
    "wsi_slide":      {"label": "Whole-slide image",      "unit": None,            "loinc": None,      "kind": "raw"},
}

# The external lab speaks its own dialect: local codes and conventional units.
# factor converts the external unit into the canonical unit.
EXT_LAB_CODES = {
    "troponin":   {"code": "TNTHS", "name": "Troponine T hs", "unit": "ug/L",  "factor": 1000.0,  "decimals": 3},
    "creatinine": {"code": "KREA",  "name": "Kreatinine",     "unit": "mg/dL", "factor": 88.42,   "decimals": 2},
    "egfr":       {"code": "EGFR",  "name": "eGFR CKD-EPI",   "unit": "ml/min", "factor": 1.0,    "decimals": 0},
    "glucose":    {"code": "GLUC",  "name": "Glucose nuchter", "unit": "mg/dL", "factor": 1 / 18.016, "decimals": 0},
    "hb":         {"code": "HB",    "name": "Hemoglobine",    "unit": "g/dL",  "factor": 0.6206,  "decimals": 1},
}

# Six source systems, as the viewer shows them.
SOURCES = {
    "epic_lab":  {"label": "Internal lab",        "system": "EHR lab module (Epic Beaker-like)", "format": "HL7v2 ORU^R01"},
    "ext_lab":   {"label": "Regional lab",        "system": "Neighbour hospital / regional lab", "format": "EDIFACT-style MEDLAB"},
    "radiology": {"label": "Radiology",           "system": "Imaging archive (Sectra-like PACS)", "format": "DICOM + PDF report"},
    "echo":      {"label": "Echo / cardiology",   "system": "Ultrasound device into the PACS",   "format": "DICOM Secondary Capture"},
    "pathology": {"label": "Pathology",           "system": "Shared regional pathology lab",     "format": "PDF + proprietary slide"},
    "offline":   {"label": "Never archived",      "system": "Fax, scanner memory, paper",        "format": "none"},
}

# Fictional organisations. Modelled on a typical Dutch academic hospital; none are real.
HOSPITAL = "Academisch Ziekenhuis Zuid"
HOSPITAL_CODE = "AZZUID"
NEIGHBOUR = "Heuvelland Ziekenhuis"
EXT_LAB = "Regiolab Zuid"
EXT_LAB_CODE = "REGIOLABZUID"
PATH_LAB = "Pathologie Limburg Samenwerking"
