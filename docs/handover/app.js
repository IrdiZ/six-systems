// Handover prototype. Reads six-sys's generated cases (window.CASES) and adds
// the clinician and data-management screens on top. No build step, no deps.
// Everything the user does (refer, request, attach, verify, reconcile) lives in memory.
// All on-screen wording is ours, in clinical and health-IT terms; six-sys's own
// explanatory strings (steps, reasons, labels) are never shown.

const C = window.CASES;
const MEDIA = "../media/";
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// CT raw projection data is a physics artefact, not a clinical result: left out here.
for (const p of C.patients) p.facts = p.facts.filter((f) => f.fact !== "ct_raw_data");
const all = () => C.patients.flatMap((p) => p.facts); // results filed during the session are counted too

// ------------------------------------------------------------ vocabulary

// Care path in six-sys → the department that owns the patient here.
const DEPTS = {
  cardiology: { label: "Cardiology", path: "chest_pain" },
  pulmonology: { label: "Pulmonology", path: "lung_nodule" },
  nephrology: { label: "Nephrology", path: "kidney" },
};
// Fictional organisations, as named in six-systems/sim/model.py.
const HOSPITAL = "Academisch Ziekenhuis Zuid";
const TARGETS = [
  { group: "Institution", items: ["Heuvelland Ziekenhuis", "Regiolab Zuid", "Pathologie Limburg Samenwerking", "General practitioner"] },
  { group: "Department, " + HOSPITAL, items: ["Cardiology", "Pulmonology", "Nephrology", "Radiology", "Oncology", "Cardiothoracic surgery"] },
];
const SOURCE = {
  epic_lab: { label: "Clinical chemistry", sender: "AZ Zuid, clinical chemistry", system: "Laboratory information system", format: "HL7 v2 ORU^R01" },
  ext_lab: { label: "External laboratory", sender: "Regiolab Zuid", system: "External laboratory information system", format: "EDIFACT MEDLAB" },
  radiology: { label: "Radiology", sender: "AZ Zuid, radiology", system: "PACS", format: "DICOM, PDF report" },
  echo: { label: "Echocardiography", sender: "AZ Zuid, echocardiography", system: "Ultrasound modality, PACS", format: "DICOM Secondary Capture" },
  pathology: { label: "Pathology", sender: "Pathologie Limburg Samenwerking", system: "External pathology information system", format: "PDF report, whole-slide image" },
  offline: { label: "Point-of-care testing", sender: "Heuvelland Ziekenhuis, emergency department", system: "Point-of-care analyser", format: "Fax" },
  nb_lab: { label: "Referring hospital laboratory", sender: "Heuvelland Ziekenhuis, clinical chemistry", system: "Laboratory information system", format: "HL7 v2 ORU^R01" },
  gp: { label: "General practice", sender: "Huisartsenpraktijk Molenveld", system: "GP information system", format: "HIS export, NHG Tabel 45" },
  pft: { label: "Pulmonary function", sender: "AZ Zuid, pulmonary function laboratory", system: "Spirometry workstation", format: "PDF report" },
};
const LABEL = {
  troponin: "Troponin T, high-sensitivity", troponin_poc: "Troponin, point-of-care", creatinine: "Creatinine", egfr: "eGFR (CKD-EPI)",
  glucose: "Glucose", hb: "Haemoglobin", lvef: "LV ejection fraction (LVEF)", ivs_thickness: "Interventricular septum, diastole (IVSd)",
  lv_diameter: "LV internal diameter, diastole (LVIDd)", kidney_length: "Renal length, left", ct_exam: "CT examination",
  calcium_score: "Coronary artery calcium score", nodule_size: "Pulmonary nodule diameter", path_diagnosis: "Histopathological diagnosis",
  tumour_size: "Tumour size", wsi_slide: "Whole-slide image",
  troponin_i: "Troponin I, high-sensitivity", nt_probnp: "NT-proBNP", bnp: "BNP", ck: "Creatine kinase (CK)", digoxin: "Digoxin",
  sodium: "Sodium", potassium: "Potassium", calcium: "Calcium", phosphate: "Phosphate", uacr: "Albumin/creatinine ratio, urine",
  hba1c: "HbA1c (IFCC)", lithium: "Lithium", cholesterol: "Cholesterol, total", ldl: "LDL cholesterol", hdl: "HDL cholesterol",
  triglycerides: "Triglycerides", crp: "C-reactive protein (CRP)", crp_poc: "CRP, point-of-care (general practice)", wbc: "Leukocytes",
  platelets: "Platelets", inr: "INR", pco2: "pCO2, arterial", po2: "pO2, arterial", sbp: "Blood pressure, systolic",
  dbp: "Blood pressure, diastolic", heart_rate: "Heart rate", weight: "Body weight", tapse: "TAPSE", lavi: "Left atrial volume index (LAVI)",
  fev1: "FEV1", fvc: "FVC", fev1_fvc: "FEV1/FVC", dlco: "DLCO (diffusing capacity)",
  egfr_2021: "eGFR (CKD-EPI 2021)", ddimer: "D-dimer (FEU)", mcv: "MCV", tsh: "TSH", ft4: "Free T4", alt: "ALT", ast: "AST",
  alp: "Alkaline phosphatase", ggt: "Gamma-GT", bilirubin: "Bilirubin, total", albumin: "Albumin", ldh: "LDH", cea: "CEA", urea: "Urea",
  pth: "Parathyroid hormone (PTH)", bicarbonate: "Bicarbonate", ferritin: "Ferritin", lvpwd: "LV posterior wall, diastole (LVPWd)",
  av_vmax: "Aortic valve peak velocity", av_meangrad: "Aortic valve mean gradient",
};
// six-sys stores report text in Dutch; shown translated.
const TR = {
  "CT coronair angiografie": "CT coronary angiography", "CT thorax met contrast": "CT thorax with contrast", "CT thorax follow-up": "CT thorax, follow-up",
  "Plaveiselcelcarcinoom van de long": "Squamous cell carcinoma of the lung", "Carcinoïd tumor, typisch": "Typical carcinoid tumour",
};
const unit = (u) => String(u || "").replace(/\bu(mol|g)\b/g, "µ$1").replace("1.73m2", "1.73 m²").replace("mm[Hg]", "mmHg").replace("10*9/L", "× 10⁹/L")
  .replace("{INR}", "").replace("mL/m2", "mL/m²").replace("m[IU]/L", "mU/L").replace("mg{FEU}/L", "mg/L FEU").replace("ug{FEU}/L", "µg/L FEU");
const label = (f) => LABEL[f.fact] || f.fact;
// External laboratory dialect as the assembler applied it (six-systems/sim/model.py, EXT_LAB_CODES, shipped in cases.js).
const CM_ = C.code_maps;
const EXT_LAB_CODES = Object.fromEntries(Object.entries(CM_.ext_lab).map(([k, c]) => [k, [c.code, c.unit,
  c.formula ? `IFCC = ${c.formula[0]} × NGSP − ${(-c.formula[1]).toFixed(2)}` : c.factor]]));
const NOT_CONVERTIBLE = CM_.not_convertible;
const TABS = [
  ["all", "All results"], ["gp", "General practice"], ["lab", "Laboratory"], ["imaging", "Radiology"], ["echo", "Echocardiography"],
  ["function", "Pulmonary function"], ["pathology", "Pathology"], ["missing", "Not received"], ["transfers", "Audit trail"],
];
const RANK = { LOST: 4, PICTURE: 3, CONFIRMED: 2, CONFLICT: 1, DATA: 0 };
// The six-sys codes stay in the data; these are the words on screen.
const WORD = { DATA: "Structured", CONFLICT: "Converted", PICTURE: "Unverified", CONFIRMED: "Verified", LOST: "Not received" };

// ------------------------------------------------------------ demo scenarios (scenarios.js), patched into CASES before anything below is built
// With ?s= or ?t= the clock is fixed and random IDs are seeded, so a scene replays the same; without, nothing changes.

const Q = new URLSearchParams(location.search);
const SC = (window.SCENARIOS || {})[Q.get("s")] || {};
const DEMO = Q.has("s") || Q.has("t");
const CLOCK = (Q.get("t") || SC.now || (DEMO ? C.generated : "")).replace("T", " ").slice(0, 16);
let SEED = 7; // six-sys's own seed; mulberry32
const rand = DEMO ? () => { let t = (SEED += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; } : Math.random;
C.unlinked ||= [];
const ABBR = { lvef: "LVEF", ivs_thickness: "IVSd", lv_diameter: "LVIDd", kidney_length: "Nier li" }; // labels burned into the screen captures
const CM = ["ivs_thickness", "lv_diameter", "kidney_length"]; // shown in cm on the image, stored in mm
const PDF_PREFIX = { calcium_score: "Agatston calciumscore: ", nodule_size: "diameter ", tumour_size: "Tumorgrootte: " }; // text before the value in the report
const PATCH = {}; // image file → { name, values }: text to redraw on it (paintMedia)
// Converted means a unit conversion took place; a code mapping alone leaves value and unit as sent.
const unitConverted = (f) => (f.steps || []).some((x) => /[×÷]/.test(x));
const wordOf = (f) => { const v = verdict(f); return v === "LOST" && illegible(f) ? "Not legible" : v === "CONFLICT" && !unitConverted(f) ? "Code mapped" : WORD[v]; };
const patchOf = (png) => (PATCH[png] ||= { values: [] });
// A measurement whose screen capture arrived but cannot be read: the image is there, the value is not.
const illegible = (f) => f.status === "LOST" && !!f.media?.box && !f.media.png.endsWith(".pdf.png");
// Swap one number in a string, not when it is part of a longer number.
const swap = (s, a, b) => String(s ?? "").replace(new RegExp(`(?<![\\w.,])${String(a).replace(/\./g, "\\.")}(?![\\w]|[.,]\\d)`, "g"), b);
// A result's value lives in got, truth_value, the conversion steps, the source excerpt and, for images, the pixels: all follow.
function setFact(f, v, status) {
  if (v != null && !Number.isNaN(v) && typeof (f.truth_value ?? 0) === "number") {
    const was = f.truth_value ?? f.got;
    if (f.source === "ext_lab") {
      const conv = (f.steps || []).find((x) => x.includes("→") && x.includes("×")), k = conv ? Number(/×\s*([\d.]+)/.exec(conv)[1]) : 1;
      const rep = /RSL\+NV\+([^+]+)\+/.exec(f.excerpt || "")?.[1] || (conv ? conv.split(" ")[0] : String(was));
      const nr = (v / k).toFixed((rep.split(/[.,]/)[1] || "").length).replace(".", rep.includes(",") ? "," : ".");
      f.steps = (f.steps || []).map((x) => (x === conv ? swap(x, rep, nr).replace(/→ [\d.]+/, `→ ${v.toFixed(1)}`) : swap(x, rep, nr)));
      f.excerpt = (f.excerpt || "").replace(`RSL+NV+${rep}+`, `RSL+NV+${nr}+`);
    } else if (f.source === "epic_lab") f.excerpt = (f.excerpt || "").replace(`|${was}|`, `|${v}|`);
    else if (f.media?.box && f.media.png.endsWith(".jpg")) {
      const img = (x) => (CM.includes(f.fact) ? (x / 10).toFixed(1) : String(x)), a = img(was), b = img(v);
      f.steps = (f.steps || []).map((x) => (/ cm → /.test(x) ? `${b} cm → ${v} mm` : swap(x, a, b)));
      Object.assign(f, { reason: swap(f.reason, a, b), excerpt: swap(f.excerpt, a, b) });
      patchOf(f.media.png).values.push({ box: f.media.box, from: a, to: b });
    } else if (f.media?.box && PDF_PREFIX[f.fact]) {
      const b = String(v).replace(".", ",");
      f.excerpt = swap(f.excerpt, String(was), b);
      patchOf(f.media.png).values.push({ box: f.media.box, prefix: PDF_PREFIX[f.fact], from: String(was), to: b, pdf: true });
    }
    f.truth_value = v;
  }
  // Status set on purpose. An image read gets the steps its new status implies; no confidence is made up.
  if (status && status !== f.status && ABBR[f.fact] && f.media?.box) {
    const t = f.truth_value, line = `${ABBR[f.fact]} ${CM.includes(f.fact) ? (t / 10).toFixed(1) + " cm" : t + "%"}`, id = (f.steps || []).filter((x) => x.startsWith("hospital number"));
    if (status === "LOST") f.steps = [(f.reason = `OCR found the label ${ABBR[f.fact]} but not a readable value: "${line}"`), ...id];
    else if (f.status === "LOST") {
      f.steps = ["OCR on pixels burned into a DICOM Secondary Capture", `OCR read: "${line}"`, ...(CM.includes(f.fact) ? [`${(t / 10).toFixed(1)} cm → ${t} mm`] : []), ...id];
      f.reason = "Recovered by reading an image or PDF; there is no structured field behind it";
    }
  }
  if (status) f.status = status;
  f.got = f.status === "LOST" ? null : f.truth_value ?? f.got;
}
for (const s of [...(SC.set || []), ...Q.getAll("set")]) {
  const [, key, val = "", status] = /^([^=]+)=([^:]*)(?::(\w+))?$/.exec(s) || [];
  if (!key) continue;
  const [pid, fact, ...rest] = key.split("."), src = rest.find((x) => !/^\d+$/.test(x)), n = Number(rest.find((x) => /^\d+$/.test(x)) || 1);
  const f = C.patients.find((p) => p.pid === pid)?.facts.filter((x) => x.fact === fact && (!src || x.source === src))[n - 1];
  if (f) setFact(f, val.trim() === "" ? null : Number(val.replace(",", ".")), ["DATA", "CONFLICT", "PICTURE", "LOST"].includes(status) ? status : null);
}
for (const s of [...(SC.name || []), ...Q.getAll("name")]) {
  const [, pid, given, family] = /^(\w+)\.(\S+)\s+(.+)$/.exec(s.trim()) || [], p = C.patients.find((x) => x.pid === pid);
  if (!p) continue;
  Object.assign(p, { given, family, name: `${given} ${family}` });
  for (const f of p.facts) if (/\.(jpg|pdf\.png)$/.test(f.media?.png || "")) patchOf(f.media.png).name = p;
}
// Redraw the changed text on the image: paint over the old value with the background, shift what follows, write the new value.
const IMG = {}; // image file → patched data URL
const mediaSrc = (png) => IMG[png] || window.MEDIA_DATA?.[png] || MEDIA + png;
function paintMedia() {
  for (const p of C.patients) for (const f of p.facts) if (illegible(f)) (patchOf(f.media.png).obscure ||= []).push(f.media.box);
  return Promise.all(Object.entries(PATCH).map(([png, { name, values, obscure }]) => new Promise((done) => {
    const img = new Image();
    img.onerror = done;
    img.onload = () => {
      try {
        const c = document.createElement("canvas"), g = c.getContext("2d"), W = (c.width = img.naturalWidth), H = (c.height = img.naturalHeight), pdf = png.endsWith(".pdf.png");
        g.drawImage(img, 0, 0);
        for (const v of values) {
          const [x, y, w, h] = v.box.map((n, i) => (n * (i % 2 ? H : W)) / 100);
          if (v.pdf) { // Helvetica 10 pt at 72 dpi; the box starts 4 pt left of and 3 pt above the label
            g.font = "10px Helvetica, Arial, sans-serif";
            const vx = x + 4 + g.measureText(v.prefix).width, ow = g.measureText(v.from).width, nw = g.measureText(v.to).width, top = Math.floor(y + 2), hh = Math.ceil(h - 4);
            const x1 = Math.ceil(vx + ow), tail = g.getImageData(x1, top, W - x1, hh), d = g.getImageData(Math.floor(vx), top, x1 - Math.floor(vx), hh);
            const ink = [...Array(hh).keys()].filter((j) => [...Array(d.width).keys()].some((i) => d.data[(j * d.width + i) * 4] < 140)); // the old digits: their bottom is the baseline
            g.fillStyle = "#fff"; g.fillRect(Math.floor(vx), top, W, hh);
            g.putImageData(tail, Math.round(x1 + nw - ow), top);
            g.fillStyle = "#000"; g.fillText(v.to, vx, ink.length ? top + ink[ink.length - 1] + 1 : y + 3 + 7.18);
            continue;
          }
          // Screen capture: find the value by its ink. Words are split by gaps of 7 px; the value follows the widest gap.
          const X = Math.round(x), Y = Math.round(y), bw = Math.round(w), bh = Math.round(h), d = g.getImageData(X, Y, bw, bh).data, lum = (i, j) => d[(j * bw + i) * 4];
          const words = [];
          for (let i = 0; i < bw; i++) if ([...Array(bh).keys()].some((j) => lum(i, j) > 128)) { const l = words[words.length - 1]; if (l && i - l[1] < 7) l[1] = i; else words.push([i, i]); }
          let k = 1;
          for (let j = 2; j < words.length; j++) if (words[j][0] - words[j - 1][1] > words[k][0] - words[k - 1][1]) k = j;
          if (!words[k]) continue;
          const [a, b] = words[k], rows = [...Array(bh).keys()].filter((j) => [...Array(b - a + 1).keys()].some((i) => lum(a + i, j) > 128));
          const top = rows[0], bot = rows[rows.length - 1];
          g.font = `${Math.round((bot - top + 1) / 0.7)}px "Segoe UI", "Helvetica Neue", Arial, sans-serif`;
          const m = g.measureText(v.to), nw = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
          const tail = g.getImageData(X + b + 1, Y, bw - b - 1, bh);
          g.fillStyle = "#000"; g.fillRect(X + a, Y, bw - a, bh);
          g.putImageData(tail, Math.round(X + a + nw), Y);
          g.fillStyle = "#fff"; g.fillText(v.to, X + a + m.actualBoundingBoxLeft, Y + bot + 1);
        }
        for (const bx of obscure || []) { // the value only; the label stays readable
          const [x, y, w, h] = bx.map((n, i) => (n * (i % 2 ? H : W)) / 100), X = Math.round(x), Y = Math.round(y), bw = Math.round(w), bh = Math.round(h);
          const d = g.getImageData(X, Y, bw, bh).data, lit = (i) => [...Array(bh).keys()].some((j) => d[(j * bw + i) * 4] > 128), words = [];
          for (let i = 0; i < bw; i++) if (lit(i)) { const l = words[words.length - 1]; if (l && i - l[1] < 7) l[1] = i; else words.push([i, i]); }
          const a = words.length > 1 ? words[1][0] - 3 : 0, rx = X + a, rw = bw - a;
          let seed = [...png].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) >>> 0, 7);
          const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
          // smear the digits horizontally (as a dropped-frame capture does), with soft edges, then speckle that fades out
          const sm = document.createElement("canvas"), sg = sm.getContext("2d"); sm.width = rw + 8; sm.height = bh;
          sg.filter = "blur(2px)"; for (let k = -4; k <= 4; k++) sg.drawImage(c, rx - 4, Y, rw + 8, bh, k * 2.6, (k % 2) * 1.5, rw + 8, bh);
          const fade = g.createLinearGradient(rx - 4, 0, rx + rw + 4, 0); fade.addColorStop(0, "rgba(0,0,0,0)"); fade.addColorStop(0.12, "#000"); fade.addColorStop(0.88, "#000"); fade.addColorStop(1, "rgba(0,0,0,0)");
          sg.globalCompositeOperation = "destination-in"; sg.filter = "none"; sg.fillStyle = (() => { const q = sg.createLinearGradient(0, 0, rw + 8, 0); q.addColorStop(0, "rgba(0,0,0,0)"); q.addColorStop(0.12, "#000"); q.addColorStop(0.88, "#000"); q.addColorStop(1, "rgba(0,0,0,0)"); return q; })(); sg.fillRect(0, 0, rw + 8, bh);
          g.fillStyle = "rgba(0,0,0,.8)"; g.fillRect(rx + 2, Y + 2, rw - 4, bh - 4); g.globalAlpha = 0.5; g.drawImage(sm, rx - 4, Y); g.globalAlpha = 1;
          for (let k = 0; k < rw * bh * 0.34; k++) { const v = 60 + rnd() * 150 | 0, px = rnd(); g.fillStyle = `rgba(${v},${v},${v},${(0.25 + rnd() * 0.45) * Math.min(1, px * 6, (1 - px) * 6)})`; g.fillRect(rx + px * rw, Y + rnd() * bh, 1, 1); }
          g.strokeStyle = "rgba(235,215,90,.9)"; g.lineWidth = 1.2; g.setLineDash([3, 2]); g.beginPath(); g.moveTo(rx - 2, Y + bh * 0.55); g.lineTo(rx + rw * 0.9, Y + bh * 0.4); g.stroke(); g.setLineDash([]);
          for (const [cx, cy] of [[rx + 1, Y + bh * 0.55], [rx + rw * 0.9, Y + bh * 0.4]]) { g.beginPath(); g.moveTo(cx - 4, cy); g.lineTo(cx + 4, cy); g.moveTo(cx, cy - 4); g.lineTo(cx, cy + 4); g.stroke(); }
        }
        if (name && pdf) { // the patient row of the report header
          g.font = "10px Helvetica, Arial, sans-serif";
          g.fillStyle = "#fff"; g.fillRect(163, 86, W - 170, 14);
          g.fillStyle = "#000"; g.fillText(`${name.family}, ${name.given}`, 164.41, 96.38);
        } else if (name) { // the second banner line of the capture
          g.font = "15px Arial, Helvetica, sans-serif"; g.textBaseline = "top";
          g.fillStyle = "#000"; g.fillRect(16, 34, 290, 22);
          g.fillStyle = "rgb(150,150,150)"; g.fillText(`${name.family.toUpperCase()}, ${name.given}   ${name.mrn}`, 20, 37);
        }
        IMG[png] = c.toDataURL(pdf ? "image/png" : "image/jpeg", 0.95);
      } catch {} // a canvas tainted by file:// keeps the original image
      done();
    };
    img.src = mediaSrc(png);
  })));
}

// ------------------------------------------------------------ session state

const S = { asked: {}, q: {}, access: [], viewed: null, log: [], confirmed: {}, resolved: {}, added: {}, sel: {}, pick: {}, intake: [], off: {}, draft: null };
const factKey = (f) => `${f.pid}|${f.fact}|${f.time}|${f.source}`;
const verdict = (f) => (f.status === "PICTURE" && S.confirmed[factKey(f)] ? "CONFIRMED" : f.status);

// ------------------------------------------------------------ documents: one received file = one document

function category(f) {
  if (f.source === "radiology") return "imaging";
  if (f.source === "echo" || f.source === "pathology" || f.source === "gp") return f.source;
  if (f.source === "pft") return "function";
  return "lab";
}
function docTitle(file, f) {
  if (!file) return "Troponin, point-of-care";
  if (f.source === "epic_lab") return "Laboratory report";
  if (f.source === "ext_lab") return "External laboratory report";
  if (f.source === "nb_lab") return "Referring hospital laboratory report";
  if (f.source === "gp") return "GP referral, measurements";
  if (f.source === "pft") return "Pulmonary function test";
  if (f.source === "echo") return file.endsWith("_sr.dcm") ? "Echocardiogram, structured report" : "Transthoracic echocardiogram";
  if (f.source === "pathology") return file.endsWith(".pdf") ? "Pathology report" : "Whole-slide image";
  if (file.endsWith(".pdf")) return "Radiology report";
  return f.fact === "ct_exam" ? TR[f.truth_value] || f.truth_value : "Renal ultrasound";
}
const docRef = (file) => (file ? file.split("/").pop().replace(/(_report|_sr)?\.\w+$/, "") : "");
const full = (i) => (i.ref ? `${i.title} ${i.ref}` : i.title);
function docFormat(file, f) {
  if (!file) return "Fax";
  if (file.endsWith(".hl7")) return "HL7 v2 ORU^R01";
  if (file.endsWith(".edi")) return "EDIFACT MEDLAB";
  if (file.endsWith(".csv")) return "HIS export, NHG Tabel 45";
  if (file.endsWith("_sr.dcm")) return "DICOM Structured Report";
  if (file.endsWith(".pdf")) return "PDF report";
  if (file.endsWith(".isyntax")) return "Proprietary whole-slide format";
  if (f.source === "echo" || file.endsWith(".dcm")) return "DICOM Secondary Capture";
  return "DICOM CT series";
}
function identifiedBy(it) {
  const f = it.facts[0];
  if (!it.file || !f) return "";
  if (f.status === "LOST" && f.source === "ext_lab") return "Unmatched: no BSN, no match on name and date of birth";
  if (f.source === "epic_lab" || f.source === "gp") return "BSN";
  if (f.source === "nb_lab") return "BSN (the sender's own patient number is not used)";
  if (f.source === "pft") return "Patient number, cross-referenced to BSN";
  if (f.source === "ext_lab") return (f.steps || []).some((s) => s.startsWith("no BSN")) ? "Name and date of birth (BSN absent)" : "BSN";
  if (f.source === "radiology" || f.source === "echo") return "Patient number, cross-referenced to BSN";
  return "Name and date of birth on the report";
}

const ITEMS = {}; // pid → documents
for (const p of C.patients) {
  const byFile = new Map();
  for (const f of p.facts) {
    const k = f.file || factKey(f);
    if (!byFile.has(k)) byFile.set(k, { pid: p.pid, file: f.file, time: f.time, facts: [], source: f.source });
    byFile.get(k).facts.push(f);
  }
  ITEMS[p.pid] = [...byFile.values()].sort((a, b) => a.time.localeCompare(b.time)).map((it, i) => {
    const f = it.facts[0];
    return { ...it, id: String(i + 1), cat: category(f), title: docTitle(it.file, f), ref: docRef(it.file), format: docFormat(it.file, f), origin: SOURCE[f.source].sender };
  });
}
// A report with no patient match is not in anyone's record until it is matched in To file (the data knows whose it is; the hospital does not).
const unmatched = (x) => x.source === "ext_lab" && !!x.file && C.unlinked.some((u) => u.file === x.file) && !S.resolved["U|" + x.file]?.startsWith("Matched");
const itemsOf = (pid) => ITEMS[pid].filter((i) => !unmatched(i)).concat(S.added[pid] || []);
const worst = (it) => (it.added ? "PICTURE" : it.facts.map(verdict).reduce((w, v) => (RANK[v] > RANK[w] ? v : w), "DATA"));
const patient = (pid) => C.patients.find((p) => p.pid === pid);
const deptOf = (p) => Object.keys(DEPTS).find((d) => DEPTS[d].path === p.path);
const lostOf = (p) => p.facts.filter((f) => f.status === "LOST" && !unmatched(f));
const unverifiedOf = (p) => p.facts.filter((f) => verdict(f) === "PICTURE");
// Which patient each seeded story uses. Defaults by position in the care-path cohort, which in the published data gives
// P001 and P004 answered by fax, P003 link opened, P004 fax, P005 chat, P007 GP letter, P014 no consent, P016 rejected.
const cohort = (path) => C.patients.filter((p) => p.path === path).map((p) => p.pid);
const CP = cohort("chest_pain"), KID = cohort("kidney");
const ROLE = { answered: [CP[0], CP[3]], opened: [CP[2]], gp: CP[CP.length - 1], noConsent: [KID[0]], rejected: [KID[2]], ...SC.roles };
ROLE.fax ??= [...ROLE.answered].reverse().find((pid) => patient(pid)?.facts.some((f) => f.fact === "troponin_poc"));
ROLE.chat ??= CP.filter((pid) => patient(pid).facts.some((f) => f.source === "echo" && f.status === "LOST")).pop();

// ------------------------------------------------------------ formatting

const pad = (n) => String(n).padStart(2, "0");
const stamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmtTime = (t) => (t ? t.replace("T", " ").slice(0, 16) : "");
const fmtDate = (d) => d.split("-").reverse().join("-");
const later = (t, min) => stamp(new Date(new Date(t.replace(" ", "T")).getTime() + min * 6e4));
const now = () => CLOCK || stamp(new Date());
const age = (dob) => {
  const n = CLOCK ? new Date(CLOCK.replace(" ", "T")) : new Date(), b = new Date(dob);
  return n.getFullYear() - b.getFullYear() - (n < new Date(n.getFullYear(), b.getMonth(), b.getDate()) ? 1 : 0);
};
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 + "%" : "–");
const st = (v, word = WORD[v]) => `<span class="st ${v}">${esc(word)}</span>`;
function value(f) {
  if (f.status === "LOST" || f.got == null) return `<span class="dim">–</span>`;
  const u = unit(C.fact_defs[f.fact]?.unit);
  return `${esc(TR[f.got] || f.got)}${u ? ` <span class="dim">${esc(u)}</span>` : ""}`;
}
// The value as the sender reported it, for converted results.
const convStep = (f) => (f.steps || []).find((x) => x.includes("→") && /[×÷]|formula/.test(x));
function asReceived(f) {
  const s = convStep(f);
  if (s) return unit(s.split("→")[0].trim());
  return "";
}
// The conversion as six-sys applied it, e.g. "× 1000", and any repairs to the message (data management only).
const conversionOf = (f) => { const s = convStep(f) || ""; return (/IFCC = [^;)]+/.exec(s) || /[×÷]\s*[\d.,/]+/.exec(s) || [""])[0].replace(/^([×÷])\s*/, "$1 "); };
const repairsOf = (f) => (f.steps || []).filter((x) => /^decimal comma/.test(x));
const ocrConfidence = (f) => (/confidence (\d+)%/.exec([f.reason, ...(f.steps || [])].join(" ")) || [])[1];
// One professional sentence per result, by status and source.
function remark(f) {
  const v = verdict(f);
  if (f.captured && v === "PICTURE") return `Received via ${f.captured.via.replace(/^Upload link$/, "upload link")}${f.captured.by ? `, entered by ${f.captured.by}` : ""}. ${f.got == null ? "Value not entered." : "Verification required."}`;
  if (v === "DATA" && f.db) return `Structured value from ${f.db} (data source bridge), ${f.dbAt}.`;
  if (v === "DATA" && NOT_CONVERTIBLE[f.fact]) return NOT_CONVERTIBLE[f.fact];
  if (v === "DATA" && (f.file || "").endsWith("_sr.dcm")) return "Structured report (DICOM SR): LOINC-coded measurement with a UCUM unit.";
  if (v === "DATA") return f.source === "radiology" ? "DICOM header attribute." : f.source === "nb_lab" ? "LOINC-coded result from the referring hospital's laboratory." : "LOINC-coded result in SI units.";
  if (v === "CONFLICT" && f.source === "gp") return f.fact === "crp_poc" ? "Point-of-care test coded in NHG Tabel 45; there is no LOINC code for it. Value as recorded by the GP."
    : "NHG Tabel 45 code mapped to LOINC on receipt. Value and unit as recorded by the GP; date only, no time.";
  if (v === "CONFLICT" && f.source === "nb_lab") return "Unit converted on receipt with a published factor. Original value retained.";
  if (v === "CONFLICT" && f.fact === "hba1c") return "Local code mapped to LOINC. Converted from % (NGSP) with the IFCC master equation, not a factor. Original value retained.";
  if (v === "CONFLICT") return unitConverted(f) ? "Local code mapped to LOINC and unit converted on receipt. Original value retained." : "Local code mapped to LOINC on receipt. Value and unit unchanged.";
  if (v === "CONFIRMED") return `Verified against the source image by ${S.confirmed[factKey(f)]}.`;
  if (v === "PICTURE") return (f.file || "").endsWith(".pdf")
    ? "Value extracted from the report text. No structured result available. Verification required."
    : (C.patients.find((p) => p.pid === f.pid)?.facts.some((x) => x.file === (f.file || "").replace(/\.dcm$/, "_sr.dcm"))
      ? "Not in the structured report (DICOM SR) of this examination; only on the exported screen capture. Value extracted from the image by optical character recognition. Verification required."
      : "No structured report (DICOM SR). Value extracted from the image by optical character recognition. Verification required.");
  if (f.fact === "troponin_poc") return "Point-of-care result reported by fax. No electronic result received.";
  if (f.fact === "wsi_slide") return "Proprietary whole-slide format. No DICOM WSI conversion available.";
  if (f.source === "ext_lab") return "Result received without BSN. No patient match on name and date of birth.";
  return "Image received; the measurement is not legible on the exported screen capture.";
}
// A fixed-layout table: cols = [[header, width, cls]]; cells carry a title so truncated text stays readable.
// cols = [[header, width, cls, priority]]. Priority 2 columns drop out when the pane is under 860px wide, priority 3
// under 1060px, priority 4 (needed, but least of the needed) under 700px, so the columns that stay are wide enough to read; hidden ones remain in the detail pane and the export.
let GRID = 0;
function table(cols, rows) {
  const id = "g" + ++GRID, hide = (p, w) => cols.map((c, i) => (c[3] === p || (p < 4 && c[3] > p && c[3] < 4) ? `#${id} col:nth-child(${i + 1}), #${id} tr > :nth-child(${i + 1})` : "")).filter(Boolean).join(", ");
  const css = [[2, 860], [3, 1060], [4, 700]].map(([p, w]) => hide(p, w) && `@container list (max-width: ${w}px) { ${hide(p, w)} { display: none; } }`).join(" ");
  return `${css ? `<style>${css}</style>` : ""}<table class="grid" id="${id}"><colgroup>${cols.map((c) => `<col${c[1] ? ` style="width:${c[1]}"` : ""}>`).join("")}</colgroup>
    <tr>${cols.map((c) => `<th class="${c[2] || ""}">${c[0]}</th>`).join("")}</tr>${rows.join("") || `<tr><td colspan="${cols.length}" class="dim">None</td></tr>`}</table>`;
}
const td = (html, cls = "", title = "") => `<td class="${cls}"${title ? ` title="${esc(title)}"` : ""}>${html}</td>`;
const tdt = (text, cls = "") => td(esc(text), cls, text);
// One search box per list: hides rows whose text (or data-q, which also holds columns not shown) lacks every word typed.
const filterBox = (scope) => `<input type="search" class="filter" data-filter="${scope}" placeholder="Search" value="${esc(S.q[scope] || "")}" aria-label="Search">`;
function applyFilters() {
  for (const box of document.querySelectorAll("[data-filter]")) {
    const words = box.value.toLowerCase().split(/\s+/).filter(Boolean), scope = box.closest(".pane, .side");
    for (const el of scope.querySelectorAll("table.grid tr:not(:has(th)), a[data-q]")) el.hidden = !words.every((w) => (el.dataset.q || el.textContent).toLowerCase().includes(w));
  }
  // sticky table headers sit under the panel header, whatever its height
  for (const h of document.querySelectorAll(".pane > .phead")) h.parentNode.style.setProperty("--ph", h.offsetHeight + "px");
}
document.addEventListener("input", (e) => { const b = e.target.dataset?.filter; if (b) { S.q[b] = e.target.value; applyFilters(); } });
addEventListener("resize", applyFilters);
const phead = (title, sub = "", extra = "") => `<div class="phead"><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ""}${extra}</div>`;

// Twiin carries the BgZ plus the referral letter as FHIR STU3, sender notifies and the recipient fetches (Notified Pull).
const TWIIN_FORMAT = "BgZ and referral letter (FHIR STU3)";
const REGION = "Regionaal data-ecosysteem Zuid"; // fictional regional data platform (openEHR and FHIR, joined through Twiin)

// ------------------------------------------------------------ seeded referrals and requests (synthetic, built from each patient's own documents)

function seedLog() {
  let n = 0;
  const add = (o) => { const l = { id: "L" + ++n, ...o }; S.log.push(l); return l; };
  const hist = (time, steps) => steps.map(([min, s]) => [later(time, min), s]);
  for (const p of C.patients) {
    const items = ITEMS[p.pid], last = fmtTime(items[items.length - 1].time), dept = DEPTS[deptOf(p)].label;
    const hl7 = items.filter((i) => i.format === "HL7 v2 ORU^R01").map(full);
    if (p.path === "chest_pain") {
      const t = later(last, 26 * 60), poc = p.facts.find((f) => f.fact === "troponin_poc"), tr = poc && later(fmtTime(poc.time), 6 * 60);
      add({ time: t, kind: "send", from: dept, to: "Heuvelland Ziekenhuis", pid: p.pid, format: TWIIN_FORMAT, channel: "Twiin",
        what: [...hl7, ...items.filter((i) => i.cat === "echo" || i.format === "PDF report").map(full)],
        q: "Back-referral after chest pain work-up. Please continue follow-up. Echocardiography values are unverified.",
        history: hist(t, [[0, "Sent: notification to recipient"], [14, "Fetched by recipient"], [190, "Acknowledged"]]) });
      // discharge letter to the GP over ZorgMail, as for every patient leaving the chest pain clinic
      const tg = later(t, 2 * 60);
      add({ time: tg, kind: "send", from: dept, to: "General practitioner", pid: p.pid, format: "PDF summary", channel: "ZorgMail", what: hl7.slice(-1),
        q: "Discharge letter after chest pain work-up, with the latest laboratory results.", history: hist(tg, [[0, "Sent"], [1, "Delivered"], [24 * 60, "Acknowledged"]]) });
      if (!poc) continue;
      // Requests go over the network the emergency department already uses; the upload link is the fallback (one patient here).
      const answered = ROLE.answered.includes(p.pid), opened = ROLE.opened.includes(p.pid), link = opened;
      const steps = answered ? [[0, "Sent"], [1, "Delivered"], [2 * 24 * 60, "Answered: result provided by fax"]]
        : [[0, "Sent"], [1, "Delivered"], ...(link ? [[3 * 60, "Link opened by recipient"]] : [])];
      const l = add({ time: tr, kind: "request", from: dept, to: SOURCE.offline.sender, pid: p.pid, what: [LABEL.troponin_poc], facts: ["troponin_poc"], format: "Result request",
        channel: link ? "Upload link" : "ZorgMail", q: "Please provide the point-of-care troponin as a structured result.", history: hist(tr, steps) });
      if (link) {
        l.portal = newLink(tr, n);
        if (l.portal.until < now()) { l.portal.state = "expired"; l.history.push([l.portal.until, "Expired: link not used"]); }
      }
    } else if (p.path === "lung_nodule") {
      const tp = fmtTime(items.find((i) => i.cat === "pathology")?.time || last), t = later(tp, -9 * 24 * 60), tr = later(tp, 2 * 24 * 60);
      add({ time: t, kind: "send", from: dept, to: "Pathologie Limburg Samenwerking", pid: p.pid, format: "PDF summary", channel: "ZorgMail",
        what: items.filter((i) => i.title === "Radiology report").map(full).slice(-1),
        q: "Growing nodule in the right upper lobe. Histology requested. Please report tumour size.",
        history: hist(t, [[0, "Sent"], [2, "Delivered"], [60, "Acknowledged"]]) });
      add({ time: tr, kind: "request", from: dept, to: "Pathologie Limburg Samenwerking", pid: p.pid, what: [LABEL.wsi_slide], facts: ["wsi_slide"], format: "Result request", channel: "ZorgMail",
        q: "Please provide the whole-slide image as DICOM WSI for the multidisciplinary team meeting.",
        history: hist(tr, [[0, "Sent"], [1, "Delivered"], [3 * 24 * 60, "Declined: no DICOM export available"]]) });
    } else {
      const t = later(last, 3 * 60);
      add({ time: t, kind: "send", from: dept, to: "General practitioner", pid: p.pid, what: hl7, format: "HL7 v2 ORU^R01", channel: "ZorgMail",
        q: "Progressive rise in creatinine over five visits. Please review medication and repeat renal function in four weeks.",
        history: hist(t, ROLE.rejected.includes(p.pid) ? [[0, "Sent"], [0, "Rejected by recipient: unknown code"]] : [[0, "Sent"], [1, "Delivered"]]) });
      // Making data available needs explicit consent (Wabvpz art. 15a). The regional platform checks it in Mitz and reports
      // the outcome; this application does not decide it. One patient has no consent registered (synthetic).
      const ts = later(last, 4 * 60), yes = !ROLE.noConsent.includes(p.pid);
      add({ time: ts, kind: "share", from: dept, to: REGION, pid: p.pid, what: hl7.slice(-1), format: "FHIR Observations (laboratory results)", channel: "Regional platform",
        q: "Latest renal function results, for the regional care pathway.",
        history: hist(ts, [[0, "Made available"], [1, yes ? "Accepted by platform: consent registered in Mitz" : "Accepted by platform: no consent registered in Mitz, not shown to other providers"]]) });
    }
  }
  const u = C.unlinked[0];
  if (u) {
    const t = later(fmtTime(u.time), 4 * 24 * 60);
    add({ time: t, kind: "request", from: "Data management", to: "Regiolab Zuid", pid: null, who: u.who, what: ["External laboratory report " + docRef(u.file)], format: "Result request", channel: "ZorgMail",
      q: "Report received without BSN; date of birth does not match. Please resend including BSN.", history: hist(t, [[0, "Sent"], [1, "Delivered"]]) });
  }
}
// One-time upload link for a sender without an electronic link: one patient, one request, 7 days, single use.
// Seeded links get a fixed token and code; links made during the session get random ones.
function newLink(time, seed) {
  const r = seed ? (k) => ((seed * 7919 * k) % 1e6) : () => Math.floor(rand() * 1e6);
  const b36 = (x) => x.toString(36).toUpperCase().padStart(4, "0").slice(-4);
  return { token: `UL-${b36(r(3))}-${b36(r(5))}`, until: later(time, 7 * 24 * 60).slice(0, 10) + " 23:59", state: "active" };
}
seedLog();
const lastStatus = (l) => l.history[l.history.length - 1][1];
const failed = (s) => /^(Rejected|Declined|Expired|Revoked|Not sent)/.test(s);
const KIND = { send: "Referral", request: "Result request", share: "Made available" };

// ------------------------------------------------------------ directory, channels, routing (synthetic: AGB and URA numbers and addresses are invented for the demo)

const FAX_NO = "+31 43 555 0140"; // synthetic
const DIR = [
  { name: "Heuvelland Ziekenhuis", type: "Hospital", dept: "Cardiology", agb: "06011234", ura: "90001234", channel: "Twiin", status: "Verified", verified: "URA matched in ZORG-AB", region: true,
    points: [["Twiin", "ZORG-AB: Heuvelland Ziekenhuis, cardiology (notification address)"], ["ZorgMail", "ZorgMail address book: Heuvelland Ziekenhuis, cardiology"]] },
  { name: SOURCE.offline.sender, type: "Hospital", dept: "Emergency department", agb: "06011235", ura: "90001234", channel: "ZorgMail", status: "Verified", verified: "URA matched in ZORG-AB", region: true,
    fax: FAX_NO, remark: "Point-of-care results are not in their laboratory system; this sender still falls back to fax. Requests go through ZorgMail; the upload link is the fallback.",
    points: [["ZorgMail", "ZorgMail address book: Heuvelland Ziekenhuis, emergency department"], ["Twiin", "ZORG-AB: Heuvelland Ziekenhuis, emergency department"], ["Upload link", "Fallback: one-time link, sign-in with UZI pass"], ["Fax number", "For recognising incoming faxes; fax is not used to send"]] },
  { name: "Regiolab Zuid", type: "Laboratory", dept: "", agb: "25010987", ura: "90004567", channel: "ZorgMail", status: "Verified", verified: "AGB checked against the Vektis register",
    points: [["ZorgMail", "EDIFACT MEDLAB, ZorgMail address book: Regiolab Zuid"]] },
  { name: "Pathologie Limburg Samenwerking", type: "Pathology laboratory", dept: "", agb: "25020456", ura: "90007890", channel: "ZorgMail", status: "Verified", verified: "AGB checked against the Vektis register",
    points: [["ZorgMail", "PDF report, ZorgMail address book: Pathologie Limburg Samenwerking"]] },
  { name: "General practitioner", type: "GP practice", dept: "", agb: "", ura: "", channel: "ZorgMail", status: "Verified", verified: "Per patient, from the patient's registration",
    points: [["ZorgMail", "HL7 v2, the patient's registered GP"]] },
  { name: "Huisartsenpost Zuid", type: "Out-of-hours GP service", dept: "", agb: "", ura: "", channel: "Secure e-mail with access code", status: "Temporary", verified: "Not verified", expires: "2026-10-30",
    remark: "Temporary contact for one exchange. Removed when it expires.", points: [["Secure e-mail with access code", "triage@hapzuid.example"]] },
];
const dirOf = (name) => DIR.find((d) => d.name === name);
// The connection each source arrives through (Management > Connections).
const SOURCE_CHAN = { epic_lab: "lis", echo: "dicom", radiology: "dicom", ext_lab: "medlab", pathology: "path", nb_lab: "twiin", gp: "zd", offline: "fax" };
const chanOf = (it) => !it.via && !it.added && CHANNELS.find((c) => c.id === SOURCE_CHAN[it.source]);
const faxOf = (no) => DIR.find((d) => d.fax === no);
const INTERNAL = TARGETS[1].items;
const FORMATS = { Twiin: [TWIIN_FORMAT], ZorgMail: ["HL7 v2 ORU^R01", "PDF summary"], "Secure e-mail with access code": ["PDF summary"], Fax: ["PDF summary"], "Worklist (internal)": ["FHIR R4 bundle", "PDF summary"] };
function channelsFor(name) {
  if (INTERNAL.includes(name)) return ["Worklist (internal)"];
  const d = dirOf(name), own = (d?.points || []).map((x) => x[0]).filter((c) => c !== "Upload link" && !c.startsWith("Fax"));
  return [...new Set([d?.channel !== "Upload link" && d?.channel, ...own, "Secure e-mail with access code"].filter(Boolean))];
}

// Every document that arrived, with the patient's name: what the channels and routing rules count.
const docs = () => C.patients.flatMap((p) => itemsOf(p.pid).filter((i) => i.file || i.added || i.via).map((i) => ({ ...i, who: p.name })));
const docMsg = (i) => ({ time: i.receivedAt || fmtTime(i.time), who: i.who, what: full(i), status: i.via ? "Filed" : identifiedBy(i).startsWith("Unmatched") ? "No patient match" : "Filed" });
const fromSrc = (...s) => () => docs().filter((i) => s.includes(i.source) && !i.via).map(docMsg);
const fromIntake = (id) => () => S.intake.filter((i) => i.channel === id).map((i) => ({ time: i.time, who: i.pid ? patient(i.pid).name : "–", what: i.subject, status: i.status }));
const fromLog = (test) => () => S.log.filter(test).map((l) => ({ time: l.time, who: l.pid ? patient(l.pid).name : l.who, what: `${l.to}: ${l.what.join("; ")}`, status: lastStatus(l) }));
// Certificates: an UZI server certificate authenticates the hospital on Twiin and the LSP (valid 2 years since Nov 2025).
// From 12 Nov 2026 the UZI register issues from the PKIoverheid G4 hierarchy; trust stores must hold the G4 CA certificates.
// Serial numbers and dates are synthetic.
const G4_DATE = "2026-11-12";
const CERTS = {
  xchg: { name: "UZI server certificate", subject: "xchg01.azzuid.example", serial: "4F2A 91C3", from: "2025-12-01", until: "2027-11-30", g4: false },
  lsp: { name: "UZI server certificate", subject: "lsp01.azzuid.example", serial: "3B77 0E15", from: "2023-11-27", until: "2026-11-26", g4: false, note: "Renewal letter received 60 days before expiry" },
};
const daysTo = (d) => Math.round((new Date(d + "T00:00") - new Date(now().slice(0, 10) + "T00:00")) / 864e5);
const certIssue = (c) => !c ? "" : daysTo(c.until) < 0 ? "Expired" : daysTo(c.until) <= 60 ? `Expires in ${plural(daysTo(c.until), "day")}`
  : !c.g4 && daysTo(G4_DATE) >= 0 ? "G4 CA certificates not in the trust store" : "";
// Joining Twiin, as its implementation plan lays it out: enrolment, agreement, self-assessment, DPIA, a validated supplier node,
// validation with a Twiin service provider, a test, then one department pair before widening. Dates synthetic.
const ONBOARD = ["Enrolment form submitted", "Participant agreement signed", "Self-assessment of participant conditions", "DPIA approved",
  "Supplier's Twiin node validated", "Validation with a Twiin service provider", "Test in the Twiin test environment", "Controlled go-live: one department pair", "Further departments and institutions"];
const steps = (dates, cur) => ONBOARD.map((x, i) => ({ step: x, state: i < dates.length ? "Done" : i === dates.length && cur ? "In progress" : "Not started", date: dates[i] || "" }));
const ACK_HL7 = "Original mode. AA: filed. AE: to the error queue, no automatic resend. AR: resent 3 times at 5-minute intervals, then to the error queue.";

const CHANNELS = [
  { id: "lis", name: "Clinical chemistry results", type: "HL7 v2 listener (MLLP)", dir: "Inbound", scope: "Internal", source: "Laboratory information system, interface engine port 6661", route: "By care pathway", ack: ACK_HL7, msgs: fromSrc("epic_lab") },
  { id: "dicom", name: "Imaging and echocardiography", type: "DICOM receiver (C-STORE)", dir: "Inbound", scope: "Internal", source: "PACS, AE title AZZ_HANDOVER", route: "By care pathway", ack: "DICOM C-STORE response status; failures retried by the sender", msgs: fromSrc("radiology", "echo") },
  { id: "adt", name: "Patient administration", type: "HL7 v2 listener (ADT A04, A08, A40)", dir: "Internal", scope: "Internal", source: "Patient administration, interface engine port 6662", route: "Patient master index: matching on BSN, name and date of birth", ack: ACK_HL7 },
  { id: "twiin", name: "Twiin: BgZ and correspondence", type: "Twiin Notified Pull (FHIR STU3), through the EHR supplier's validated Twiin node", dir: "Outbound and inbound", scope: "National",
    source: "ZORG-AB address book; mutual TLS with the UZI server certificate", route: "Referrals and result requests to providers in ZORG-AB", cert: "xchg", env: "Production",
    onboard: steps(["2025-03-10", "2025-04-02", "2025-04-20", "2025-05-14", "2025-03-01", "2025-06-18", "2025-09-02", "2025-10-06", "2026-01-12"]),
    ack: "The sender notifies; the recipient fetches. A fetch counts as receipt.", msgs: () => [...fromLog((l) => l.channel === "Twiin")(), ...fromSrc("nb_lab")()] },
  { id: "portaal", name: "Twiin Portaal: images", type: "Image and report send and receive portal", dir: "Outbound and inbound", scope: "National", source: "Radiology; received studies imported into PACS",
    route: "Radiology worklist", env: "Production", ack: "Download by the recipient is shown to the sender", msgs: () => [] },
  { id: "lsp", name: "National switch point (LSP)", type: "AORTA (HL7 v3): medication history query by BSN", dir: "Query", scope: "National", source: "Pharmacy and GP data; the data stays at the source",
    route: "Look-up from the patient record", cert: "lsp", env: "Production", ack: "Synchronous answer" },
  { id: "zd", name: "ZorgDomein: GP referrals", type: "ZorgDomein EHR link (HL7 v2)", dir: "Inbound", scope: "National", source: "Referral catalogue of AZ Zuid, products per specialty", route: "By specialty", ack: ACK_HL7, msgs: fromSrc("gp") },
  { id: "medlab", name: "Regiolab Zuid", type: "ZorgMail mailbox (EDIFACT MEDLAB)", dir: "Inbound", scope: "Regional", source: "ZorgMail, laboratory mailbox AZ Zuid", route: "By care pathway; no patient match to To file",
    ack: "ZorgMail delivery receipt", msgs: fromSrc("ext_lab"),
    errors: () => C.unlinked.filter((u) => !S.resolved["U|" + u.file]).map((u) => ({ time: fmtTime(u.time), who: u.who, what: "External laboratory report " + docRef(u.file), status: "No patient match" })) },
  { id: "path", name: "Pathologie Limburg Samenwerking", type: "ZorgMail mailbox (PDF)", dir: "Inbound", scope: "Regional", source: "ZorgMail, pathology mailbox AZ Zuid", route: "Pulmonology; copy to MDT meeting list", ack: "ZorgMail delivery receipt", msgs: fromSrc("pathology") },
  { id: "region", name: "Regional data platform", type: "openEHR and FHIR, joined through Twiin; the regional cooperation organisation is the Twiin service provider", dir: "Outbound and inbound", scope: "Regional",
    source: REGION, route: "Shared results; the platform checks consent in Mitz", cert: "xchg", env: "Production, Nephrology only",
    onboard: steps(["2026-02-02", "2026-02-20", "2026-03-11", "2026-04-08", "2025-03-01", "2026-06-15", "2026-08-24"], true),
    ack: "FHIR response; HTTP 201 counts as accepted", msgs: fromLog((l) => l.channel === "Regional platform"),
    remark: "The regional platform is being built for the whole region. This connection is ready for it: Nephrology is attached first, the other departments follow one at a time, each publishing and reading through its own worklist without a project of its own." },
  { id: "out-zm", name: "Referrals and requests, ZorgMail", type: "ZorgMail (HL7 v2, EDIFACT, PDF)", dir: "Outbound", scope: "National", source: "ZorgMail address book", route: "Referrals and requests to the ZorgMail address book",
    ack: "HL7 v2: AA or AE from the recipient; otherwise delivery receipt", msgs: fromLog((l) => l.channel === "ZorgMail") },
  { id: "out-link", name: "Upload links and secure e-mail", type: "Secure e-mail gateway; links signed in with UZI pass", dir: "Outbound", scope: "Own", source: "Recipients without an electronic link", route: "Recipients without an electronic link",
    ack: "None: the recipient's upload or reply is the answer", msgs: fromLog((l) => l.channel === "Upload link" || l.channel === "Secure e-mail with access code") },
  { id: "portal", name: "Upload links", type: "Upload portal (HTTPS)", dir: "Inbound", scope: "Own", source: "One-time links for senders without an electronic link", route: "Answer to a result request: requesting department",
    msgs: () => docs().filter((i) => i.via === "Upload link").map(docMsg) },
  { id: "fax", name: "Fax inbox, cardiology", type: "Fax-to-mail inbox", dir: "Inbound", scope: "Own", source: "Fax server to mailbox, OCR on arrival", route: "To file", msgs: fromIntake("fax"), intake: true },
  { id: "mail", name: "Cardiology secure mailbox", type: "Secure mail mailbox (ZorgMail, ZIVVER)", dir: "Inbound", scope: "Own", source: "cardiologie@azzuid.example", route: "To file", msgs: fromIntake("mail"), intake: true },
  { id: "folder", name: "Scanning folder, outpatient clinic", type: "Shared folder watch", dir: "Inbound", scope: "Own", source: "\\\\fs01\\scan\\cardiology", route: "To file", msgs: fromIntake("folder"), intake: true },
  { id: "chat", name: "Cardiology department chat", type: "Secure chat (message board)", dir: "Inbound", scope: "Own", source: "Department group; messages that carry a patient number", route: "To file", msgs: fromIntake("chat"), intake: true },
];
const onboarding = (c) => !!c.onboard?.some((x) => x.state !== "Done");
const chanState = (c) => (S.off[c.id] ? "Paused" : onboarding(c) ? "Onboarding" : "Started");


// ------------------------------------------------------------ central intake: results that arrive outside the interfaces (seeded from the patients' own not-received results)

function seedIntake() {
  const add = (o) => S.intake.push({ key: "I" + (S.intake.length + 1), status: "Open", ...o });
  const p4 = patient(ROLE.fax), poc = p4?.facts.find((f) => f.fact === "troponin_poc");
  if (poc) add({ time: later(fmtTime(poc.time), 6 * 60 + 2 * 24 * 60 + 40), channel: "fax", from: SOURCE.offline.sender, subject: "Fax, 1 page: point-of-care troponin",
    calling: FAX_NO, tsi: "HEUVELLAND SEH", // synthetic number; the header text is whatever the sender typed into the machine
    pid: p4.pid, match: "Name and date of birth read from the fax (OCR), one match in the patient master index", fact: "troponin_poc", value: poc.truth_value,
    text: `FAX  ${SOURCE.offline.sender}\nTo: Cardiology, ${HOSPITAL}\nPatient: ${p4.family}, ${p4.given[0]}.   Date of birth: ${fmtDate(p4.dob)}\nTroponin (POCT)  ${String(poc.truth_value).replace(".", ",")} ng/L   ${fmtTime(poc.time)}` });
  const p5 = patient(ROLE.chat), ivs = p5?.facts.find((f) => f.source === "echo" && f.status === "LOST");
  if (ivs) add({ time: later(fmtTime(ivs.time), 3 * 60), channel: "chat", internal: true, from: "Echocardiography, " + HOSPITAL, subject: `Chat message: ${ABBR[ivs.fact]} measurement`,
    pid: p5.pid, match: "Patient number in the message", fact: "ivs_thickness", value: ivs.truth_value,
    text: `[Cardiology department chat]\nSonographer: Patient no. ${p5.mrn}, echo today. ${ABBR[ivs.fact]} ${ivs.truth_value} ${unit(C.fact_defs[ivs.fact].unit)}. Measurement is not legible on the exported image.` });
  const p7 = patient(ROLE.gp);
  if (p7 && ITEMS[p7.pid][0]) add({ time: later(fmtTime(ITEMS[p7.pid][0].time), -24 * 60), channel: "mail", title: "Referral letter and ECG, general practitioner", from: "Huisartsenpraktijk Molenveld", email: "praktijk@molenveld.example", subject: "Referral letter and ECG, 2 attachments",
    pid: p7.pid, match: "BSN in the letter, matched", fact: null,
    text: `From: praktijk@molenveld.example\nTo: cardiologie@azzuid.example\nSubject: Referral ${p7.family}, BSN ${p7.bsn}\nAttachments: referral_letter.pdf, ecg.pdf` });
  const pts = C.patients.filter((p) => p.path === "chest_pain"), last = pts.flatMap((p) => ITEMS[p.pid]).map((i) => fmtTime(i.time)).sort().pop();
  if (last) add({ time: later(last, 60), channel: "folder", internal: true, title: "Scanned document", from: "Scanner, cardiology outpatient clinic", subject: "Scanned document, 2 pages", pid: null, match: "No patient identifiers found on the scan", fact: null,
    text: "\\\\fs01\\scan\\cardiology\\scan_0412.pdf\n2 pages, 300 dpi. OCR found no BSN, patient number or date of birth." });
}
seedIntake();

// ------------------------------------------------------------ legal basis and acknowledgement
// The legal basis of each exchange, shown read-only: consent is not decided here.
// Referral or request to a provider who takes part in the treatment: consent is presumed (WGBO art. 7:457).
// Making data available through an exchange system needs explicit consent (Wabvpz art. 15a); the platform checks it in Mitz.
const BASIS_WHY = {
  "Same institution": "Within the hospital, for the patient's treatment.",
  "Presumed consent (treatment relationship)": "The recipient takes part in the treatment, so consent is presumed (WGBO art. 7:457). The patient may object.",
  "Explicit consent, checked in Mitz by the platform": "Making data available through an exchange system needs the patient's explicit consent (Wabvpz art. 15a). The regional platform checks it in Mitz before other providers can see the data.",
};
const basisOf = (l) => (l.kind === "share" ? "Explicit consent, checked in Mitz by the platform" : INTERNAL.includes(l.to) ? "Same institution" : "Presumed consent (treatment relationship)");
function ackOf(l) {
  const h = l.history.map((x) => x[1]), has = (re) => h.some((x) => re.test(x));
  if (has(/^Not sent/)) return "Not sent";
  if (l.channel === "Twiin") return has(/^Fetched/) ? "Fetched by recipient" : "Notified, not fetched";
  if (l.channel === "Regional platform") return has(/^Accepted/) ? "Accepted (HTTP 201)" : "Pending";
  if (["Upload link", "Secure e-mail with access code", "Fax"].includes(l.channel)) return "Not applicable";
  if (l.channel === "Worklist (internal)") return "Accepted (AA)";
  if (has(/^Rejected/)) return /HL7/.test(l.format) ? "Error (AE)" : "Rejected";
  if (has(/^(Delivered|Acknowledged|Answered|Link opened)/)) return /HL7/.test(l.format) ? "Accepted (AA)" : "Delivery receipt";
  return "Pending";
}
// What the hospital's side sent back for a received document.
function ackIn(it, from) {
  if (it?.via || it?.added) return "Not applicable";
  const f = it?.format || "";
  if (/^HL7/.test(f)) return "Accepted (AA)";
  if (/^DICOM/.test(f)) return "Stored (C-STORE success)";
  if (f === "Fax") return "Not applicable";
  return /AZ Zuid/.test(from) ? "Accepted (AA)" : "Delivery receipt";
}
// Short words in the grids, the full wording in the tooltip and the detail pane.
const SHORT = { "Accepted (AA)": "AA", "Error (AE)": "AE", "Delivery receipt": "Receipt", "Stored (C-STORE success)": "Stored",
  "Fetched by recipient": "Fetched", "Notified, not fetched": "Not fetched", "Accepted (HTTP 201)": "Accepted", "Not applicable": "–" };
const flagCell = (x) => { const w = SHORT[x] || x; return td(/^(Not sent|Error|Rejected)/.test(x) ? st("FAIL", w) : /^(Notified|Pending)/.test(x) ? st("PICTURE", w) : esc(w), "", x); };

// ------------------------------------------------------------ access log (NEN 7513): who did what, to which patient, on what basis
// Seeded entries come from the seeded referrals and requests; users are synthetic.
const USERS = { Cardiology: ["L. Hermans", "Cardiologist"], Pulmonology: ["S. Bakker", "Pulmonologist"], Nephrology: ["R. Jansen", "Nephrologist"], "Data management": ["M. Claessens", "Data manager"] };
const reqId = () => "REQ-" + rand().toString(16).slice(2, 10).toUpperCase();
const ACTION = (l) => l.kind === "send" ? "Sent referral" : l.kind === "request" ? "Requested result" : "Made available";
function logAccess(o) {
  S.access.push({ id: "A" + (S.access.length + 1), time: now(), user: "User", role: CTX?.admin ? "Data manager" : CTX?.dept ? `Clinician, ${DEPTS[CTX.dept].label}` : "Clinician",
    pid: null, basis: CTX?.admin ? "Data management" : "Treatment relationship", system: "Handover application", req: reqId(), ...o });
}
function seedAccess() {
  for (const l of S.log) {
    const [user, role] = USERS[l.from] || USERS["Data management"], dm = l.from === "Data management";
    S.access.push({ id: "A" + (S.access.length + 1), time: later(l.time, -12), user, role, pid: l.pid, who: l.who, action: dm ? "Viewed report" : "Viewed record", object: dm ? l.what.join("; ") : "Patient record",
      basis: dm ? "Data management" : "Treatment relationship", system: "Handover application", req: reqId() });
    S.access.push({ id: "A" + (S.access.length + 1), time: l.time, user, role, pid: l.pid, who: l.who, action: ACTION(l), object: `${l.to}: ${l.what.join("; ")}`, basis: basisOf(l), system: l.channel || "Handover application", req: reqId() });
  }
}
seedAccess();

// A result that arrives late fills the not-received result if there is one; otherwise it becomes a new document.
const fileFormat = (u) => (u.type === "application/pdf" ? "PDF report" : u.type?.startsWith("image/") ? "Image" : /\.hl7$/i.test(u.name) ? "HL7 v2" : /\.dcm$/i.test(u.name) ? "DICOM" : "Document");
const toNum = (v) => (v === "" || v == null ? null : Number(String(v).replace(",", ".")));
const catOf = (fact) => (["lvef", "ivs_thickness", "lv_diameter"].includes(fact) ? "echo" : ["calcium_score", "nodule_size", "kidney_length", "ct_exam"].includes(fact) ? "imaging"
  : ["path_diagnosis", "tumour_size", "wsi_slide"].includes(fact) ? "pathology" : "lab");
function fileResult(pid, { fact, value, via, by, upload, origin, title, cat }) {
  const p = patient(pid), at = now(), captured = { via, by, at };
  const f = fact && p.facts.find((x) => x.fact === fact && x.status === "LOST");
  if (f) {
    Object.assign(f, { status: "PICTURE", got: toNum(value), captured });
    const it = ITEMS[pid].find((i) => i.facts.includes(f));
    Object.assign(it, { via, receivedAt: at, origin: origin || it.origin, upload: upload || it.upload, format: upload ? fileFormat(upload) : "Manual entry" });
    return it;
  }
  const facts = fact && toNum(value) != null ? [{ pid, fact, time: at.replace(" ", "T"), source: "added", file: null, status: "PICTURE", got: toNum(value), captured }] : [];
  p.facts.push(...facts);
  const list = (S.added[pid] ||= []);
  const it = { id: String(ITEMS[pid].length + list.length + 1), pid, added: true, via, receivedAt: at, file: null, time: at.replace(" ", "T"), cat: cat || (fact ? catOf(fact) : "lab"), source: "added",
    title: title || upload?.name || "Attached document", ref: "", format: upload ? fileFormat(upload) : "Document", origin: origin || "Not documented", facts, upload };
  list.push(it);
  return it;
}
const statusCell = (s) => (failed(s) ? st("FAIL", s) : esc(s));

// ------------------------------------------------------------ routing

let CTX = null; // what the keyboard and action bar act on

function route() {
  const [, mode = "clinic", a, b, c, d] = location.hash.split("/");
  document.body.classList.toggle("portal", mode === "portal");
  if (mode === "portal") return renderPortal(a);
  document.querySelectorAll("#mode a").forEach((x) => x.classList.toggle("on", x.dataset.mode === mode));
  const deptSel = $("#dept");
  deptSel.parentElement.style.visibility = mode === "admin" ? "hidden" : "";
  if (mode === "admin") return renderAdmin(a || "overview", b && decodeURIComponent(b));
  const dept = DEPTS[a] ? a : "cardiology";
  deptSel.value = dept;
  renderClinic(dept, b, c || "all", d);
}
const go = (h) => (location.hash = h);
window.addEventListener("hashchange", route);

$("#dept").innerHTML = Object.entries(DEPTS).map(([k, d]) => `<option value="${k}">${d.label}</option>`).join("");
$("#dept").addEventListener("change", (e) => go(`#/clinic/${e.target.value}`));

// ------------------------------------------------------------ clinician side

const mark = (v, n, word) => (n ? `<span class="st bare ${v}" title="${plural(n, "result")} ${word}">${n}</span>` : "");

function renderClinic(dept, pid, tab, itemId) {
  const pts = C.patients.filter((p) => p.path === DEPTS[dept].path);
  const p = patient(pid);
  if (p && S.viewed !== p.pid) { S.viewed = p.pid; logAccess({ pid: p.pid, role: `Clinician, ${DEPTS[dept].label}`, basis: "Treatment relationship", action: "Viewed record", object: "Patient record" }); }
  if (pid === "recon") pid = "intake"; // the old Results to Resolve address
  const toFile = queues(dept).filter((r) => r.status === "Open").length;
  const side = `<aside class="side"><h3 class="inbox">Inbox</h3>
    <a href="#/clinic/${dept}/intake" class="${pid === "intake" ? "on" : ""}"><span>To file</span><span class="marks">${toFile || ""}</span></a>
    <h3>${DEPTS[dept].label} worklist</h3><div class="sfilter">${filterBox("side")}</div>${pts.map((x) =>
    `<a href="#/clinic/${dept}/${x.pid}" class="${x === p ? "on" : ""}" data-pid="${x.pid}" data-q="${esc([x.name, x.mrn, x.bsn, fmtDate(x.dob)].join(" "))}"><span>${esc(x.family)}, ${esc(x.given)}</span>
      <span class="marks">${mark("PICTURE", unverifiedOf(x).length, "unverified")}${mark("LOST", lostOf(x).length, "not received")}</span></a>`).join("")}</aside>`;

  if (pid === "intake") return renderQueue(dept, tab, side, pts);
  if (!p) {
    CTX = { dept, pts };
    $("#app").innerHTML = side + `<section class="work">${worklist(dept, pts)}${actionBar(false)}</section>`;
    return;
  }
  const items = itemsOf(p.pid);
  const inTab = (t) => (t === "missing" ? items.filter((i) => i.facts.some((f) => f.status === "LOST" && !illegible(f))) : t === "all" || t === "transfers" ? items : items.filter((i) => i.cat === t));
  const shown = inTab(tab);
  const it = shown.find((i) => i.id === itemId) || shown.find((i) => ["LOST", "PICTURE"].includes(worst(i))) || shown[0];
  CTX = { dept, p, tab, items: shown, it, pts };

  const count = (t) => (t === "transfers" ? auditOf(p).length : inTab(t).length);
  const tabs = `<nav class="tabs">${TABS.filter(([k]) => ["all", "missing", "transfers"].includes(k) || count(k)).map(([k, l]) =>
    `<a href="#/clinic/${dept}/${p.pid}/${k}" class="${k === tab ? "on" : ""}" data-tab="${k}">${l}<span class="n">${count(k)}</span></a>`).join("")}</nav>`;

  const body = tab === "transfers"
    ? `<div class="split"><div class="pane full">${auditGrid(p)}</div></div>`
    : `<div class="split"><div class="pane list">${docGrid(shown, it, dept, p, tab)}</div><div class="pane detail">${it ? docDetail(it) : `<p class="empty">None</p>`}</div></div>`;
  $("#app").innerHTML = side + `<section class="work">${banner(p, dept)}${tabs}${body}${actionBar(true)}</section>`;
}

// The inbox, per department: one queue of what arrived without a patient.
// needs a person (the same results the worklist marks amber and red), plus unmatched external reports,
// which go to Nephrology because Regiolab Zuid serves the renal path.
function queues(dept) {
  // Captured documents (fax, mailbox, folder, chat) and laboratory reports with no patient match: nothing here has a patient yet.
  // Unmatched reports go to Nephrology because Regiolab Zuid serves the renal path.
  const docs = S.intake.filter((i) => (i.pid ? deptOf(patient(i.pid)) : "cardiology") === dept);
  const reports = dept === "nephrology" ? reconRows().filter((x) => x.u).map((x) => ({ key: x.key, time: x.time, from: SOURCE[x.src].sender, subject: x.what, who: x.who,
    status: S.resolved[x.key] || "Open", recon: x })) : [];
  return [...docs, ...reports].sort((a, b) => b.time.localeCompare(a.time));
}
function renderQueue(dept, key, side, pts) {
  const rows = queues(dept), k = decodeURIComponent(key || ""), cur = rows.find((r) => r.key === k) || rows[0];
  const tr = (r, cells) => `<tr class="row ${r === cur ? "sel" : ""}" data-href="#/clinic/${dept}/intake/${encodeURIComponent(r.key)}">${cells}</tr>`;
  const who = (r) => (r.recon ? st("LOST", "No patient match") : r.pid ? esc(patient(r.pid).name) : "–");
  const list = phead("To file", "", filterBox("intake")) +
    table([["Date and time", "150px", "", 2], ["Sender", "25%", "", 3], ["Subject"], ["Patient", "200px"], ["Status", "100px"]],
      rows.map((r) => tr(r, `${td(r.time)}${td(r.recon || known(r) ? esc(r.from) : st("PICTURE", r.from), "", r.from)}${tdt(r.subject)}${td(who(r), "", r.recon ? r.who : "")}${td(r.status === "Open" ? st("PICTURE", S.asked[r.key] ? "Requested again" : "Open") : esc(r.status), "", r.status)}`)));
  const detail = cur ? (cur.recon ? reconDetail(cur.recon) : intakeDetail(cur)) : `<p class="empty">Nothing to file for ${DEPTS[dept].label}.</p>`;
  CTX = { dept, pts, queue: "intake" };
  $("#app").innerHTML = side + `<section class="work queue"><div class="split"><div class="pane list">${list}</div><div class="pane detail">${detail}</div></div>${actionBar(false)}</section>`;
}

function worklist(dept, pts) {
  const rows = pts.map((p, i) => {
    const items = itemsOf(p.pid), last = items[items.length - 1];
    return `<tr class="row ${i === 0 ? "sel" : ""}" data-href="#/clinic/${dept}/${p.pid}" data-pid="${p.pid}" data-q="${esc([p.name, p.mrn, p.bsn, fmtDate(p.dob)].join(" "))}">
      ${tdt(`${p.family}, ${p.given}`)}${td(p.sex)}${td(age(p.dob), "num")}${td(fmtDate(p.dob))}${td(p.mrn)}${td(fmtTime(last.time))}
      ${td(items.length, "num")}${td(unverifiedOf(p).length || "", "num")}${td(lostOf(p).length || "", "num")}</tr>`;
  });
  return `<div class="split"><div class="pane full">${phead(DEPTS[dept].label + " worklist", plural(pts.length, "patient"), filterBox("worklist"))}
    ${table([["Patient"], ["Sex", "60px"], ["Age", "70px", "num"], ["Date of birth", "120px"], ["Patient no.", "120px"], ["Last result", "150px"],
      ["Documents", "100px", "num"], ["Unverified", "100px", "num"], ["Not received", "120px", "num"]], rows)}</div></div>`;
}

function banner(p, dept) {
  const ill = lostOf(p).filter(illegible).length, lost = lostOf(p).length - ill, pic = unverifiedOf(p).length;
  const field = (l, v) => `<div><label>${l}</label>${v}</div>`;
  return `<div class="banner">
    <div class="name"><b>${esc(p.family.toUpperCase())}, ${esc(p.given)}</b><span>${p.sex === "M" ? "Male" : "Female"}, ${age(p.dob)} y</span></div>
    <div class="fields">${field("Date of birth", fmtDate(p.dob))}${field("Patient no.", p.mrn)}${field("BSN", p.bsn)}</div>
    <div class="alerts">${[["Not received", lost, "LOST"], ["Not legible", ill, "LOST"], ["Unverified", pic, "PICTURE"]].filter(([, n]) => n).map(([l, n, v]) => field(l, st(v, n))).join("")
      || field("Results", `<span class="dim">All received</span>`)}</div></div>`;
}

function docGrid(items, sel, dept, p, tab) {
  const rows = items.map((i) => `<tr class="row ${i === sel ? "sel" : ""}" data-href="#/clinic/${dept}/${p.pid}/${tab}/${i.id}" data-doc="${i.id}">
    ${td(i.receivedAt || fmtTime(i.time))}${tdt(i.title)}${tdt(i.origin)}${td(docStatus(i))}</tr>`);
  return table([["Date and time", "152px", "", 2], ["Document"], ["Sender", "26%", "", 3], ["Status", "150px"]], rows);
}

// A document can hold several results: say how many still need attention, so the counts add up to the worklist's.
function docStatus(i) {
  const n = (v) => i.facts.filter((f) => verdict(f) === v).length, unv = n("PICTURE"), ill = i.facts.filter(illegible).length, lost = n("LOST") - ill;
  if (i.added || unv + lost + ill < 2) return ill ? st("LOST", "Not legible") : worst(i) === "CONFLICT" && !i.facts.some(unitConverted) ? st("CONFLICT", "Code mapped") : st(worst(i));
  return `<span class="stack">${unv ? st("PICTURE", `${unv} unverified`) : ""}${ill ? st("LOST", `${ill} not legible`) : ""}${lost ? st("LOST", `${lost} not received`) : ""}</span>`;
}
function docDetail(it, admin = false) {
  const fsel = it.facts.find((f) => factKey(f) === S.sel.fact) || it.facts[0];
  const rows = it.facts.map((f) => `<tr class="row ${f === fsel ? "sel" : ""}" data-fact="${esc(factKey(f))}">
    ${tdt(label(f))}${td(value(f), typeof f.got === "number" || f.got == null || f.status === "LOST" ? "num" : "", TR[f.got] || "")}${td(st(verdict(f), wordOf(f)))}</tr>`);
  const src = SOURCE[it.source] || { system: it.via || "Manual upload" };
  const cap = it.facts.find((f) => f.captured)?.captured;
  return `
    ${it.facts.length ? table([["Test"], ["Result", "28%", "num"], ["Status", "30%"]], rows) : `<p class="empty">Attached document. No structured results.</p>`}
    ${resultBlock(fsel, admin)}
    ${it.upload ? uploadView(it.upload) : viewer(fsel, it)}
    ${admin ? `<div class="block"><h4>Provenance</h4><dl class="kv">
      <dt>Performing organisation</dt><dd>${esc(it.origin)}</dd>
      ${it.via ? `<dt>Received via</dt><dd>${esc(it.via)}, ${esc(it.receivedAt)}</dd>` : ""}
      ${cap?.by ? `<dt>Entered by</dt><dd>${esc(cap.by)}</dd>` : ""}
      <dt>Source system</dt><dd>${esc(src.system)}</dd>
      <dt>Message format</dt><dd>${esc(it.format)}</dd>
      <dt>Acknowledgement</dt><dd>${esc(ackIn(it, it.origin))}</dd>
      ${it.ref ? `<dt>Document ID</dt><dd>${esc(it.ref)}</dd>` : ""}
      ${identifiedBy(it) ? `<dt>Patient identification</dt><dd>${esc(identifiedBy(it))}</dd>` : ""}
      ${it.facts.flatMap(repairsOf).length ? `<dt>Repairs applied</dt><dd>${esc([...new Set(it.facts.flatMap(repairsOf))].join("; "))}</dd>` : ""}
      ${it.upload?.sha ? `<dt>Integrity (SHA-256)</dt><dd class="wrap">${esc(it.upload.sha)}</dd>` : ""}</dl></div>`
    : `<div class="block"><h4>Origin</h4><dl class="kv">
      <dt>Performing organisation</dt><dd>${dirOf(it.origin.split(",")[0]) ? `<a class="link" href="#/admin/directory/${encodeURIComponent(it.origin.split(",")[0])}">${esc(it.origin)}</a>` : esc(it.origin)}</dd>
      ${chanOf(it) ? `<dt>Received through</dt><dd><a class="link" href="#/admin/channels/${chanOf(it).id}">${esc(chanOf(it).name)}</a> <span class="dim">· ${esc(it.format)}</span></dd>` : ""}
      ${it.receivedAt ? `<dt>Received</dt><dd>${esc(it.receivedAt)}${it.via ? `, ${esc(it.via)}` : ""}</dd>` : ""}
      ${cap?.by ? `<dt>Entered by</dt><dd>${esc(cap.by)}</dd>` : ""}
      ${S.confirmed[factKey(fsel)] ? `<dt>Verified by</dt><dd>${esc(S.confirmed[factKey(fsel)])}</dd>` : ""}
      ${identifiedBy(it) && identifiedBy(it) !== "BSN" && !/cross-referenced to BSN/.test(identifiedBy(it)) ? `<dt>Patient identification</dt><dd>${esc(identifiedBy(it))}</dd>` : ""}</dl></div>`}`;
}

function resultBlock(f, admin = false) {
  if (!f) return "";
  const v = verdict(f), loinc = C.fact_defs[f.fact]?.loinc, link = openLink(f);
  const req = [...S.log].reverse().find((l) => l.kind === "request" && l.pid === f.pid && l.facts?.includes(f.fact));
  const action = v === "LOST" && link ? `<p class="note dim">Upload link sent ${esc(link.time)} to ${esc(link.to)}.${/upload link sent/i.test(lastStatus(link)) ? "" : ` ${esc(lastStatus(link).replace(": ", ", "))}.`}</p>
      <div class="inline"><button data-act="portal" data-arg="${link.portal.token}">Open as sender (demo)</button></div>`
    : v === "LOST" && f.source !== "ext_lab" && f.source !== "echo" ? `<div class="inline"><button data-act="request">Request result <kbd>R</kbd></button>${req?.live && VIEWABLE.includes(req.channel) ? `<button data-act="recv" data-arg="${req.id}">View as recipient (demo)</button>` : ""}</div>`
    : v === "PICTURE" ? `<div class="inline"><button data-act="confirm">Verify result <kbd>V</kbd></button></div>` : "";
  const m = f.status === "CONFLICT" && (f.source === "ext_lab" ? EXT_LAB_CODES[f.fact] : [(f.steps || [])[0]?.split(" → ")[0].replace(/ \(.*$/, "") || ""]);
  return `<div class="block"><h4>${esc(label(f))}</h4><dl class="kv">
    ${m ? `${asReceived(f) ? `<dt>Reported value</dt><dd>${esc(asReceived(f))}</dd>` : ""}
      ${conversionOf(f) ? `<dt>Conversion</dt><dd>${esc(conversionOf(f))} → ${f.got} ${esc(unit(C.fact_defs[f.fact].unit))}</dd>` : ""}
      ${admin ? `<dt>Code mapping</dt><dd>${esc(m[0])} → ${loinc ? `LOINC ${loinc}` : "no LOINC"} · ${esc(mapNote(f))}</dd>` : loinc ? `<dt>LOINC</dt><dd>${loinc}</dd>` : ""}` : loinc ? `<dt>LOINC</dt><dd>${loinc}</dd>` : ""}
    <dt>Remark</dt><dd>${esc(remark(f))}</dd></dl>${action}</div>`;
}
function viewer(f, it) {
  // a structured message without an image is printed as it was sent; with nothing to show there is no viewer (the remark says why)
  if (!f?.media && it && !it.added && !it.via && it.file && !it.facts.every((x) => x.status === "LOST"))
    return uploadView({ name: it.ref || it.title, type: "image/svg+xml", url: printPage(it), note: "Page 1" });
  if (!f?.media) return "";
  const b = f.media.box;
  return `<div class="viewer"><div class="bar"><b>${esc(f.media.png.replace(/^raw_\w+?_/, "").replace(/\.(pdf\.png|jpg|png)$/, ""))}</b><span>${esc(label(f))}</span>${expandBtn}</div>
    <div class="stage" title="Click to expand"><div class="frame"><img src="${mediaSrc(f.media.png)}" alt="">${b ? `<div class="box" style="left:${b[0]}%;top:${b[1]}%;width:${b[2]}%;height:${b[3]}%"></div>` : ""}</div></div></div>`;
}

// A file that came in through an upload link, intake or manual attachment; the viewer stays the only dark surface.
const kb = (n) => (n > 1e6 ? (n / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1e3)) + " kB");
function uploadView(u) {
  const body = !u.url ? `<p class="empty">${esc(u.name)} · original kept in the source system</p>`
    : u.type?.startsWith("image/") ? `<div class="frame"><img src="${u.url}" alt="">${u.box ? `<div class="box" style="left:${u.box[0]}%;top:${u.box[1]}%;width:${u.box[2]}%;height:${u.box[3]}%"></div>` : ""}</div>`
    : u.type === "application/pdf" ? `<iframe src="${u.url}" title="${esc(u.name)}"></iframe>` : `<p class="empty">${esc(u.name)} · no preview for this file type</p>`;
  return `<div class="viewer"><div class="bar"><b>${esc(u.name)}</b><span>${u.size ? kb(u.size) : esc(u.note || "")}</span>${u.url ? expandBtn : ""}</div><div class="stage">${body}</div></div>`;
}
const expandBtn = `<button class="vx" data-expand title="Expand (F)">Expand</button>`;
// Expanded view: the same document, full window; the marking around the value can be switched off (M).
function expandViewer(v) {
  if (!v) return;
  const o = document.createElement("div");
  o.id = "lightbox";
  o.innerHTML = `<div class="bar">${v.querySelector(".bar").innerHTML}
    ${v.querySelector(".box") ? `<label class="vx"><input type="checkbox" checked data-marking> Show marking <kbd>M</kbd></label>` : ""}<button class="vx" data-shrink>Close <kbd>Esc</kbd></button></div>
    <div class="stage">${v.querySelector(".stage").innerHTML}</div>`;
  o.querySelector("[data-expand]").remove();
  document.body.append(o);
  o.addEventListener("change", (e) => { if (e.target.dataset.marking !== undefined) o.classList.toggle("nomark", !e.target.checked); });
  o.addEventListener("click", (e) => { if (!e.target.closest("label")) o.remove(); }); // anywhere closes it, except the marking switch
}
document.addEventListener("click", (e) => { if (e.target.closest("[data-expand]")) expandViewer(e.target.closest(".viewer")); });
document.addEventListener("click", (e) => { const v = e.target.closest("#app .viewer .stage"); if (v && v.closest(".viewer").querySelector("[data-expand]")) expandViewer(v.closest(".viewer")); });
const openLink = (f) => [...S.log].reverse().find((l) => l.pid === f.pid && l.facts?.includes(f.fact) && l.portal?.state === "active");

// Every received document, for one patient.
function received(p) {
  return itemsOf(p.pid).filter((i) => i.file || i.added || i.via).map((i) => ({
    time: i.receivedAt || fmtTime(i.time), event: "Received", from: i.origin, to: HOSPITAL, pid: p.pid, who: p.name, what: full(i), format: i.format,
    status: i.via ? `Received via ${i.via}` : i.added ? "Attached manually" : identifiedBy(i).startsWith("Unmatched") ? "Unmatched" : "Received", item: i,
  }));
}
function auditOf(p) {
  const out = S.log.filter((l) => l.pid === p.pid).map((l) => ({ time: l.time, event: { send: "Referral sent", request: "Result requested", share: "Made available" }[l.kind], from: l.from, to: l.to, what: l.what.join("; "), format: l.channel ? `${l.format}, ${l.channel}` : l.format, status: lastStatus(l) }));
  return [...received(p), ...out].sort((a, b) => b.time.localeCompare(a.time));
}
function auditGrid(p) {
  const rows = auditOf(p).map((r) => `<tr>${td(r.time)}${td(r.event)}${tdt(r.from)}${tdt(r.to)}${td(r.what.split("; ").map(esc).join("<br>"))}${tdt(r.format)}${td(statusCell(r.status), "", r.status)}</tr>`);
  return phead("Audit trail", "", filterBox("audit")) + table([["Date and time", "128px"], ["Event", "120px"], ["Sender", "16%"], ["Recipient", "16%"], ["Content"], ["Format and channel", "15%"], ["Status", "14%"]], rows);
}

function actionBar(hasPatient) {
  const it = CTX?.it;
  const f = it && (it.facts.find((x) => factKey(x) === S.sel.fact) || it.facts[0]);
  return `<div class="actions">
    <button data-act="send" ${hasPatient ? "" : "disabled"}>Refer <kbd>S</kbd></button>
    <button data-act="add" ${hasPatient ? "" : "disabled"}>Attach document <kbd>A</kbd></button>
    <button data-act="request" ${hasPatient && requestable(CTX.p).length ? "" : "disabled"}>Request result <kbd>R</kbd></button>
    <button data-act="confirm" ${f && verdict(f) === "PICTURE" ? "" : "disabled"}>Verify result <kbd>V</kbd></button>
    <span class="spacer"></span>
    <span class="status">${esc(S.flash || "↑↓ select · [ ] previous / next patient")}</span></div>`;
}

// ------------------------------------------------------------ dialogs

function openDialog(html) { const d = $("#dialog"); d.innerHTML = html; d.hidden = false; $("select, input, textarea, button", d)?.focus(); }
function closeDialog() { $("#dialog").hidden = true; $("#dialog").innerHTML = ""; }
const dlgHead = (title, p) => `<header><b>${title}</b><span class="pt">${esc(p.family)}, ${esc(p.given)} · ${fmtDate(p.dob)} · ${p.mrn}</span></header>`;
function logOut(o) {
  const l = { id: "L" + (S.log.length + 1), time: now(), history: [[now(), "Sent"]], live: true, ...o }; // live: sent in this session
  S.log.push(l);
  logAccess({ pid: l.pid, action: ACTION(l), object: `${l.to}: ${l.what.join("; ")}`, basis: basisOf(l), system: l.channel || "Handover application" });
  return l;
}
const opt = (v, sel, text = v) => `<option value="${esc(v)}" ${v === sel ? "selected" : ""}>${esc(text)}</option>`;
// One line under the recipient: who they are in the directory.
function dirLine(name, channel) {
  const d = dirOf(name);
  const who = INTERNAL.includes(name) ? `Department of ${HOSPITAL}` : !d ? "Not a registered institution"
    : d.status === "Temporary" ? `Temporary contact, expires ${d.expires}` : `${d.status}: ${d.verified}`;
  return who;
}

function sendDialog(preTo) {
  const { p, it, dept } = CTX, draft = S.draft;
  S.draft = null;
  const items = itemsOf(p.pid).filter((i) => i.facts.some((f) => f.status !== "LOST") || i.added);
  const to0 = preTo || DIR[0].name;
  const opts = `<optgroup label="Institution">${DIR.map((d) => opt(d.name, to0, d.status === "Temporary" ? `${d.name} (temporary)` : d.name)).join("")}</optgroup>
    <optgroup label="Department, ${esc(HOSPITAL)}">${INTERNAL.filter((x) => x !== DEPTS[dept].label).map((x) => opt(x, to0)).join("")}</optgroup>
    <option value="__new">New institution…</option>`;
  openDialog(`<form class="dlg" id="f-send">${dlgHead("Referral", p)}
    <div class="body">
      <label class="field"><span>Recipient</span><select name="to">${opts}</select></label>
      <div class="field"><span></span><div class="dim" id="send-dir"></div></div>
      <label class="field"><span>Channel</span><select name="channel"></select></label>
      <label class="field"><span>Message format</span><select name="format"></select></label>
      <label class="field"><span>Clinical question <span class="req">*</span></span><textarea name="q" required>${esc(draft?.q || "")}</textarea></label>
      <div class="field"><span>Enclosures</span>${table([["", "44px"], ["Document"], ["Date and time", "152px"], ["Results", "70px", "num"], ["Status", "150px"]],
        items.map((i) => `<tr>${td(`<input type="checkbox" name="it" value="${i.id}" ${(draft ? draft.ids.includes(i.id) : i === it || !items.includes(it)) ? "checked" : ""}>`)}${tdt(i.title)}${td(i.receivedAt || fmtTime(i.time))}${td(i.facts.length || "", "num")}${td(st(worst(i)))}</tr>`))}</div>
      <div class="field"><span>Recipient receives</span><div id="send-preview"></div></div>
    </div>
    <footer><span class="left" id="send-hint"></span><button type="button" data-act="close">Cancel</button><button class="primary">Send referral</button></footer></form>`);
  const f = $("#f-send");
  const channels = () => {
    const ch = channelsFor(f.to.value);
    f.channel.innerHTML = ch.map((c) => opt(c, ch[0])).join("");
    formats();
  };
  const formats = () => {
    f.format.innerHTML = (FORMATS[f.channel.value] || ["PDF summary"]).map((x) => opt(x)).join("");
    $("#send-dir").textContent = dirLine(f.to.value, f.channel.value);
  };
  const as = { DATA: "Structured result", CONFLICT: "Structured result, original value retained", CONFIRMED: "Structured result, verified", PICTURE: "Image with unverified value", LOST: "Not included: result not received" };
  const check = () => {
    const ids = [...f.querySelectorAll("[name=it]:checked")].map((x) => x.value);
    const facts = itemsOf(p.pid).filter((i) => ids.includes(i.id)).flatMap((i) => i.facts);
    $("#send-preview").innerHTML = facts.length ? table([["Test"], ["Result", "26%", "num"], ["Transmitted as", "42%"]],
      facts.map((x) => `<tr>${tdt(label(x))}${td(value(x), typeof x.got === "number" ? "num" : "")}${td(st(verdict(x), as[verdict(x)]), "", as[verdict(x)])}</tr>`)) : `<span class="dim">No enclosures selected</span>`;
    const q = f.q.value.trim(), pic = facts.filter((x) => verdict(x) === "PICTURE").length;
    $("#send-hint").textContent = !q ? "Clinical question is mandatory" : pic ? `${plural(pic, "result")} unverified` : "";
    f.querySelector("button.primary").disabled = !ids.length || !q;
  };
  f.to.addEventListener("change", () => {
    if (f.to.value !== "__new") return channels();
    S.draft = { q: f.q.value, ids: [...f.querySelectorAll("[name=it]:checked")].map((x) => x.value) };
    contactDialog({}, (c) => sendDialog(c.name), () => sendDialog());
  });
  f.channel.addEventListener("change", formats);
  f.addEventListener("input", check); f.addEventListener("change", check); channels(); check();
  f.addEventListener("submit", (e) => {
    e.preventDefault();
    const d = new FormData(f), ids = d.getAll("it");
    const sel = itemsOf(p.pid).filter((i) => ids.includes(i.id));
    logOut({ kind: "send", from: DEPTS[dept].label, to: d.get("to"), pid: p.pid, what: sel.map(full), format: d.get("format"), channel: d.get("channel"), q: d.get("q") });
    flash(`Referral sent to ${d.get("to")} by ${d.get("channel")}`);
  });
}

// Add an institution to the directory. A temporary contact covers one exchange with a sender who is not a client.
function contactDialog(pre = {}, done, cancel) {
  const types = ["Hospital", "Laboratory", "Pathology laboratory", "GP practice", "Out-of-hours GP service", "Other"];
  const chans = ["ZorgMail", "Twiin", "Secure e-mail with access code", "Upload link"];
  const checks = ["Not verified", "AGB checked against the Vektis register", "URA matched in ZORG-AB", "Confirmed by telephone call-back"];
  openDialog(`<form class="dlg" id="f-dir"><header><b>New institution</b><span class="pt">Institutions</span></header>
    <div class="body">
      <label class="field"><span>Name <span class="req">*</span></span><input name="name" required value="${esc(pre.name || "")}"></label>
      <label class="field"><span>Type</span><select name="type">${types.map((x) => opt(x, pre.type)).join("")}</select></label>
      <label class="field"><span>Department</span><input name="dept"></label>
      <label class="field"><span>AGB code</span><input name="agb" inputmode="numeric" maxlength="8" placeholder="8 digits, Vektis"></label>
      <label class="field"><span>URA number</span><input name="ura" inputmode="numeric" maxlength="8" placeholder="8 digits, UZI register"></label>
      <label class="field"><span>Preferred channel</span><select name="channel">${chans.map((x) => opt(x, pre.email ? "Secure e-mail with access code" : "ZorgMail")).join("")}</select></label>
      <label class="field"><span>Address</span><input name="addr" value="${esc(pre.email || "")}" placeholder="Secure e-mail, endpoint or registered phone number"></label>
      <label class="field"><span>Relation</span><select name="rel"><option value="temp">Temporary: this exchange only, expires after 30 days</option><option value="perm">Permanent</option></select></label>
      <label class="field"><span>Verification</span><select name="check">${checks.map((x) => opt(x)).join("")}</select></label>
    </div>
    <footer><span class="left">Verification and every exchange are logged (NEN 7513).</span><button type="button" id="dir-cancel">Cancel</button><button class="primary">Register institution</button></footer></form>`);
  $("#dir-cancel").addEventListener("click", () => (cancel ? cancel() : closeDialog()));
  $("#f-dir").addEventListener("submit", (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target)), temp = d.rel === "temp";
    const c = { name: d.name.trim(), type: d.type, dept: d.dept, agb: d.agb, ura: d.ura, channel: d.channel, points: [[d.channel, d.addr || "Not documented"]],
      status: temp ? "Temporary" : d.check === "Not verified" ? "Unverified" : "Verified", verified: d.check, expires: temp ? later(now(), 30 * 24 * 60).slice(0, 10) : "",
      remark: temp ? "Temporary contact for one exchange. Removed when it expires." : "", added: now() };
    DIR.push(c);
    done ? done(c) : flash(`${c.name} registered as an institution`);
  });
}

// Results not received that a clinician can ask the sender for (unmatched and illegible ones go to data management).
const requestable = (p) => lostOf(p).filter((f) => f.source !== "ext_lab" && f.source !== "echo" && !openLink(f));
const reqChannel = (to) => dirOf(to)?.channel || "ZorgMail";
// Existing networks first; our own upload link only as the fallback for senders without any of them.
const SEARCH = "Regional platform (search)";
const reqChannels = (to) => [...new Set([reqChannel(to), ...(dirOf(to)?.region ? [SEARCH] : []),
  ...(dirOf(to)?.points || []).map((x) => x[0]).filter((c) => c !== "Upload link" && !c.startsWith("Fax")), "ZorgMail", "Secure e-mail with access code", "Upload link"])];
const chanLabel = (c) => (c === "Upload link" ? "Upload link (fallback)" : c);
function requestDialog() {
  const { p, dept } = CTX;
  const lost = requestable(p);
  const pick = (f, i) => `<select name="ch${i}">${reqChannels(SOURCE[f.source].sender).map((c) => `<option value="${esc(c)}">${esc(chanLabel(c))}</option>`).join("")}</select>`;
  openDialog(`<form class="dlg" id="f-req">${dlgHead("Result request", p)}
    <div class="body">${table([["", "44px"], ["Test", "26%"], ["Date and time", "152px"], ["Recipient"], ["Channel", "190px"]],
      lost.map((f, i) => `<tr>${td(`<input type="checkbox" name="f" value="${i}" checked>`)}${tdt(label(f))}${td(fmtTime(f.time))}${tdt(SOURCE[f.source].sender)}${td(pick(f, i))}</tr>`))}
      <label class="field"><span>Message</span><textarea name="q">Please provide the result as a structured message (HL7 v2 ORU or FHIR Observation).</textarea></label></div>
    <footer><button type="button" data-act="close">Cancel</button><button class="primary">Send request</button></footer></form>`);
  // the regional platform is searched, not asked: choosing it opens the query at once
  $("#f-req").addEventListener("change", (e) => { const i = e.target.name?.match(/^ch(\d+)$/)?.[1]; if (i != null && e.target.value === SEARCH) searchRegion(factKey(lost[i])); });
  $("#f-req").addEventListener("submit", (e) => {
    e.preventDefault();
    const d = new FormData(e.target), idx = d.getAll("f").map(Number);
    let n = 0;
    for (const i of idx) {
      const to = SOURCE[lost[i].source].sender, channel = d.get("ch" + i);
      if (channel === SEARCH) continue;
      const l = logOut({ kind: "request", from: DEPTS[dept].label, to, pid: p.pid, what: [label(lost[i])], facts: [lost[i].fact], format: "Result request", channel, q: d.get("q") });
      if (channel === "Upload link") { l.portal = newLink(l.time); l.history.push([now(), "Upload link sent; sign-in with UZI pass"]); publishLink(l); n++; }
    }
    flash(`${plural(idx.length, "result request")} sent${n ? `, ${plural(n, "upload link")} created` : ""}`);
  });
}

// The recipient's side of a request over an existing network (demo): the ZorgMail message or secure e-mail as it lands
// in their mailbox, or the Twiin notification and the FHIR Task their EHR fetches. A reply comes back as a structured result.
const VIEWABLE = ["ZorgMail", "Twiin", "Secure e-mail with access code"];
function recipientView(l) {
  const p = patient(l.pid), f = p.facts.find((x) => l.facts.includes(x.fact)), sender = `${l.from}, ${HOSPITAL}`;
  const letter = `<dl class="kv"><dt>Patient</dt><dd>${esc(p.name)} · born ${fmtDate(p.dob)}</dd><dt>Requested</dt><dd>${esc(l.what.join(", "))}${f ? `, ${fmtTime(f.time)}` : ""}</dd>
    <dt>Message</dt><dd>${esc(l.q || "")}</dd><dt>Reference</dt><dd>${esc(l.id)}</dd></dl>`;
  const task = JSON.stringify({ resourceType: "Task", status: "requested", intent: "order", code: { text: "Result request" }, authoredOn: l.time.replace(" ", "T"),
    for: { identifier: { system: "http://fhir.nl/fhir/NamingSystem/bsn", value: p.bsn } },
    requester: { agent: { display: sender } }, owner: { display: l.to }, description: `${l.what.join(", ")}: ${l.q || ""}` }, null, 2);
  const body = l.channel === "Twiin"
    ? `<div class="block"><h4>Notification in the recipient's EHR</h4><dl class="kv"><dt>From</dt><dd>${esc(sender)} (Twiin, ZORG-AB)</dd><dt>Received</dt><dd>${l.time}</dd>
        <dt>Type</dt><dd>Result request; the EHR fetches the task (Notified Pull)</dd></dl></div>
      <div class="block"><h4>Fetched task</h4>${letter}</div><div class="block"><h4>As transported (FHIR Task, STU3)</h4><pre class="raw">${esc(task)}</pre></div>`
    : `<div class="block"><h4>${l.channel === "ZorgMail" ? "ZorgMail inbox" : "Secure e-mail"} · ${esc(l.to)}</h4><dl class="kv"><dt>From</dt><dd>${esc(sender)}${l.channel === "ZorgMail" ? " (ZorgMail address book)" : ""}</dd>
        <dt>Received</dt><dd>${l.time}</dd><dt>Subject</dt><dd>Result request: ${esc(l.what.join(", "))}, ${esc(p.family)}, born ${fmtDate(p.dob)}</dd></dl></div>
      <div class="block"><h4>Message</h4>${letter}</div>`;
  const open = f && f.status === "LOST";
  openDialog(`<form class="dlg" id="f-recv"><header><b>As the recipient sees it</b><span class="pt">${esc(l.to)} · ${esc(l.channel)} · demo</span></header>
    <div class="body" style="gap:0;padding:0">${body}
      ${open ? `<div class="block"><h4>Reply with the result</h4><div class="inline" style="margin:0"><input name="v" inputmode="decimal"> <span class="dim">${esc(unit(C.fact_defs[f.fact]?.unit))} · returned over ${esc(l.channel)} as a structured result</span></div></div>` : ""}</div>
    <footer><button type="button" data-act="close">Close</button>${open ? `<button class="primary">Send result (demo)</button>` : ""}</footer></form>`);
  $("#f-recv").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = toNum(e.target.v.value);
    if (v == null) return flash("Enter the value");
    const it = fileResult(l.pid, { fact: f.fact, value: v, via: l.channel, by: l.to, origin: l.to });
    Object.assign(f, { status: "DATA" }); Object.assign(it, { format: l.channel === "Twiin" ? "FHIR Observation" : "HL7 v2 ORU^R01" });
    l.history.push([now(), `Answered: structured result over ${l.channel}`]);
    logAccess({ pid: l.pid, user: l.to, role: "External sender", action: "Returned result", object: LABEL[f.fact], basis: "Answer to a result request", system: l.channel });
    closeDialog(); flash(`${LABEL[f.fact]} received over ${l.channel} for ${p.name}: structured`); route();
  });
}

// A search on the regional platform: a FHIR query that answers at once, not a message to a person. Logged as access (NEN 7513).
function searchRegion(key) {
  const p = CTX.p, f = p.facts.find((x) => factKey(x) === key), loinc = C.fact_defs[f.fact]?.loinc, sender = SOURCE[f.source]?.sender, u = unit(C.fact_defs[f.fact].unit);
  const query = `GET [regional platform]/Observation?patient.identifier=http://fhir.nl/fhir/NamingSystem/bsn|${p.bsn}${loinc ? `&code=http://loinc.org|${loinc}` : ""}&date=ge${f.time.slice(0, 10)}`;
  // Demo: the sender publishes its results to the regional platform, so the search finds the one the hospital is missing (synthetic).
  const hit = f.status === "LOST" && f.truth_value != null;
  const obs = hit && { resourceType: "Observation", status: "final", code: loinc ? { coding: [{ system: "http://loinc.org", code: loinc }], text: LABEL[f.fact] } : { text: LABEL[f.fact] },
    subject: { identifier: { system: "http://fhir.nl/fhir/NamingSystem/bsn", value: p.bsn } }, effectiveDateTime: f.time,
    valueQuantity: { value: f.truth_value, unit: u, system: "http://unitsofmeasure.org", code: C.fact_defs[f.fact].unit }, performer: [{ display: sender }] };
  const bundle = JSON.stringify({ resourceType: "Bundle", type: "searchset", total: hit ? 1 : 0, ...(hit ? { entry: [{ resource: obs }] } : {}) }, null, 2);
  openDialog(`<div class="dlg"><header><b>Regional platform search</b><span class="pt">${esc(p.name)} · ${esc(label(f))}</span></header>
    <div class="body" style="gap:0;padding:0">
      <div class="block"><dl class="kv"><dt>Looking for</dt><dd>${esc(label(f))}${loinc ? ` (LOINC ${loinc})` : ""} from ${f.time.slice(0, 10)}</dd><dt id="rs-l" hidden>Result</dt><dd id="rs-state" hidden></dd></dl></div>
      <div class="block"><h4>Query</h4><pre class="raw">${esc(query)}</pre></div>
      <div class="block" id="rs-resp" hidden><h4>Response</h4><pre class="raw">${esc(bundle)}</pre></div></div>
    <footer><button type="button" data-act="close">Close</button><button type="button" class="primary" id="rs-go">Search</button>
      <button type="button" id="rs-other" hidden>Request another way</button><button type="button" class="primary" id="rs-import" hidden>Import result</button></footer></div>`);
  $("#rs-go").addEventListener("click", (e) => {
    e.target.disabled = true; e.target.textContent = "Searching…";
    logAccess({ pid: p.pid, action: "Searched regional platform", object: label(f), basis: "Explicit consent, checked in Mitz by the platform", system: "Regional platform" });
    setTimeout(() => {
      $("#rs-state").innerHTML = hit ? `${st("DATA", "1 result found")} · ${esc(String(f.truth_value).replace(".", ","))} ${esc(u)} · ${fmtTime(f.time)} · ${esc(sender)}` : st("LOST", "No result found");
      $("#rs-l").hidden = $("#rs-state").hidden = $("#rs-resp").hidden = false; e.target.hidden = true;
      $("#rs-other").hidden = false; if (hit) $("#rs-import").hidden = false; // the other request channels stay one click away
    }, 700);
  });
  $("#rs-other").addEventListener("click", () => requestDialog());
  $("#rs-import").addEventListener("click", () => {
    const it = fileResult(p.pid, { fact: f.fact, value: f.truth_value, via: "Regional platform", by: sender, origin: sender });
    Object.assign(f, { status: "DATA" }); Object.assign(it, { format: "FHIR Observation" });
    logAccess({ pid: p.pid, action: "Imported result from regional platform", object: label(f), basis: "Explicit consent, checked in Mitz by the platform", system: "Regional platform" });
    closeDialog(); flash(`${label(f)} imported from the regional platform: structured`); route();
  });
}

// Back to the sender of something that cannot be filed: same channels as a result request, the message says what is missing.
function askAgain(key) {
  const i = S.intake.find((x) => x.key === key), x = !i && reconRows().find((y) => y.key === key);
  const to = i ? i.from.replace(/^Scanner, (.)/, (m, c) => c.toUpperCase()) : SOURCE[x.src].sender, internal = i?.internal;
  const chans = internal ? ["Worklist (internal)", "Secure e-mail with access code"] : reqChannels(to).filter((c) => c !== SEARCH);
  const q = i ? (i.channel === "folder" ? "Scanned document without patient label. Please send it again with the patient label." : "Received without patient identification. Please send it again with name, date of birth and BSN.")
    : "Report received without BSN; date of birth does not match. Please send it again including BSN.";
  openDialog(`<form class="dlg" id="f-ask"><header><b>Request again</b><span class="pt">${esc(i ? i.subject : x.what)}</span></header>
    <div class="body"><div class="field"><span>Recipient</span><div>${esc(to)}</div></div>
      <label class="field"><span>Channel</span><select name="ch">${chans.map((c) => `<option value="${esc(c)}">${esc(chanLabel(c))}</option>`).join("")}</select></label>
      <label class="field"><span>Message</span><textarea name="q">${esc(q)}</textarea></label></div>
    <footer><button type="button" data-act="close">Cancel</button><button class="primary">Send request</button></footer></form>`);
  $("#f-ask").addEventListener("submit", (e) => {
    e.preventDefault();
    const d = new FormData(e.target), channel = d.get("ch");
    logOut({ kind: "request", from: i ? "Cardiology" : "Data management", to, pid: null, who: i ? i.subject : x.who, what: [i ? i.subject : x.what], format: i ? "Message" : "Result request", channel, q: d.get("q") });
    S.asked[key] = `Requested again ${now()} through ${channel}`;
    closeDialog(); flash(`Requested again from ${to}`); route();
  });
}

function addDialog() {
  const { p } = CTX;
  const lostFacts = [...new Set(lostOf(p).map((f) => f.fact))], other = Object.keys(LABEL).filter((k) => !lostFacts.includes(k) && C.fact_defs[k]?.unit);
  const kinds = [["lab", "Laboratory report"], ["imaging", "Radiology report"], ["echo", "Echocardiography report"], ["pathology", "Pathology report"], ["lab", "Correspondence"]];
  openDialog(`<form class="dlg" id="f-add">${dlgHead("Attach document", p)}
    <div class="body">
      <label class="field"><span>Document type</span><select name="kind">${kinds.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></label>
      <label class="field"><span>Sender</span><input name="from" list="dir-names" placeholder="Registered institution, or a new one"></label>
      <datalist id="dir-names">${[...DIR.map((d) => d.name), ...INTERNAL].map((x) => `<option value="${esc(x)}">`).join("")}</datalist>
      <div class="field"><span></span><div class="dim" id="add-dir"></div></div>
      <label class="field"><span>File</span><input type="file" name="file" accept=".pdf,image/*,.hl7,.edi,.dcm,.txt"></label>
      <div class="field"><span></span><div id="add-prev"></div></div>
      <label class="field"><span>Result in document</span><select name="fact"><option value="">None: document only</option>
        ${lostFacts.length ? `<optgroup label="Not received for this patient">${lostFacts.map((k) => opt(k, "", LABEL[k] || k)).join("")}</optgroup>` : ""}
        <optgroup label="Other tests">${other.map((k) => opt(k, "", LABEL[k])).join("")}</optgroup></select></label>
      <div class="field" id="add-val" hidden><span>Value</span><div class="inline" style="margin:0"><input name="value" inputmode="decimal"> <span id="add-unit" class="dim"></span>
        <span class="dim">Entered values are unverified until a second person verifies them.</span></div></div>
      <label class="field"><span>Comment</span><textarea name="note"></textarea></label></div>
    <footer><button type="button" data-act="close">Cancel</button><button class="primary">Attach</button></footer></form>`);
  const f = $("#f-add");
  let url = null;
  f.from.addEventListener("input", () => {
    const v = f.from.value.trim(), d = dirOf(v);
    $("#add-dir").textContent = !v || INTERNAL.includes(v) ? "" : d ? dirLine(v) : "Not registered: added as a temporary institution on attach";
  });
  f.file.addEventListener("change", () => {
    const file = f.file.files[0];
    if (url) URL.revokeObjectURL(url);
    url = file ? URL.createObjectURL(file) : null;
    $("#add-prev").innerHTML = file ? uploadView({ name: file.name, type: file.type, size: file.size, url }) : "";
  });
  f.fact.addEventListener("change", () => {
    $("#add-val").hidden = !f.fact.value;
    $("#add-unit").textContent = unit(C.fact_defs[f.fact.value]?.unit);
  });
  f.addEventListener("submit", (e) => {
    e.preventDefault();
    const d = new FormData(f), file = f.file.files[0], from = d.get("from").trim();
    let note = "";
    if (from && !INTERNAL.includes(from) && !dirOf(from)) {
      DIR.push({ name: from, type: "Other", dept: "", agb: "", ura: "", channel: "Upload link", points: [], status: "Temporary", verified: "Not verified",
        expires: later(now(), 30 * 24 * 60).slice(0, 10), remark: "Added on manual attachment. Removed when it expires.", added: now() });
      note = `; ${from} registered as a temporary institution`;
    }
    const kind = f.kind.selectedOptions[0].textContent;
    const it = fileResult(p.pid, { fact: d.get("fact"), value: d.get("value"), via: "Manual upload", by: "User", origin: from || "Not documented", title: file?.name || kind, cat: d.get("kind"),
      upload: file && { name: file.name, type: file.type, size: file.size, url } });
    logAccess({ pid: p.pid, action: "Attached document", object: it.title });
    flash(`${it.facts.length ? label(it.facts[0]) + " entered, unverified" : "Document attached"}${note}`);
  });
}

function confirmValue() {
  const f = CTX?.it && (CTX.it.facts.find((x) => factKey(x) === S.sel.fact) || CTX.it.facts[0]);
  if (!f || verdict(f) !== "PICTURE") return;
  S.confirmed[factKey(f)] = "User, " + now();
  logAccess({ pid: f.pid, action: "Verified result", object: label(f) });
  flash(`${label(f)} verified`);
}

function flash(msg) { S.flash = msg; closeDialog(); route(); setTimeout(() => { if (S.flash === msg) S.flash = ""; }, 4000); }

// ------------------------------------------------------------ data sources: bridges to databases the hospital already keeps
// The raw rows are written the way departmental databases really look (free-text units, comma decimals, dd-mm-yy,
// stray spaces, duplicates), built from the patients' own values; the transformations below really parse them.

const dmy = (t, yy) => { const [y, m, d] = t.slice(0, 10).split("-"); return `${d}-${m}-${yy ? y.slice(2) : y}`; };
const fromDmy = (s) => { const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(String(s).trim()); if (!m) return null; const y = m[3].length === 2 ? "20" + m[3] : m[3]; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; };
const dec = (s) => { const m = /^[<>]?\s*(\d+(?:[.,]\d+)?)/.exec(String(s ?? "").trim()); return m ? Number(m[1].replace(",", ".")) : null; };
const comma = (n) => String(n).replace(".", ",");
const byMrn = (s) => C.patients.find((p) => p.mrn === String(s).trim());
const byNameDob = (name, dob) => C.patients.find((p) => dob && p.dob === dob && name.split(",")[0].trim().toLowerCase() === p.family.toLowerCase());

function echoRows() {
  const rows = [];
  C.patients.filter((p) => p.path === "chest_pain").forEach((p, i) => {
    const it = ITEMS[p.pid].find((x) => x.cat === "echo"); if (!it) return;
    const v = (k) => it.facts.find((f) => f.fact === k)?.truth_value;
    rows.push({ patnr: i === 2 ? ` ${p.mrn} ` : i === 5 ? p.mrn.slice(0, -2) + p.mrn.slice(-1) + p.mrn.slice(-2, -1) : p.mrn, datum: dmy(it.time, true),
      EF: v("lvef") == null ? "" : i % 2 ? `${v("lvef")}%` : `${v("lvef")}`, IVS: v("ivs_thickness") == null ? "" : comma(v("ivs_thickness").toFixed(1)),
      LVIDd: v("lv_diameter") == null ? "" : i % 3 === 1 ? comma((v("lv_diameter") / 10).toFixed(1)) : String(v("lv_diameter")),
      opm: ["", "poor acoustic window", "", "see report", "", "", ""][i] || "" });
  });
  if (rows[0]) rows.splice(1, 0, { ...rows[0] }); // entered twice
  return rows;
}
function renalRows() {
  const rows = [];
  C.patients.filter((p) => p.path === "kidney").forEach((p, i) => {
    const visits = p.facts.filter((f) => f.fact === "creatinine");
    visits.forEach((f, j) => {
      const e = p.facts.find((x) => x.fact === "egfr" && x.time === f.time)?.truth_value;
      rows.push({ Naam: `${p.family}, ${p.given[0]}.`, "Geb.datum": i === 3 && j === 0 ? "" : j % 2 ? dmy(p.dob).replace(/-/g, "/") : dmy(p.dob), Datum: dmy(f.time),
        "Kreat (umol/l)": j === 4 ? `${comma(f.truth_value)} H` : comma(f.truth_value), eGFR: e == null ? "" : e < 30 && j % 2 ? `${e} L` : String(e) });
    });
  });
  return rows;
}
const LOCAL_LAB = { TROP: "troponin", KREA: "creatinine", EGFR: "egfr", GLUC: "glucose", HB: "hb", K: "potassium", NA: "sodium", NTPRO: "nt_probnp",
  CRP: "crp", LEUK: "wbc", TROM: "platelets", INR: "inr", PCO2: "pco2", PO2: "po2", MCV: "mcv", TSH: "tsh", FT4: "ft4", ALAT: "alt",
  ASAT: "ast", AF: "alp", GGT: "ggt", BILI: "bilirubin", ALB: "albumin", LD: "ldh", CEA: "cea", PTH: "pth", BIC: "bicarbonate", FERR: "ferritin" };
function labRows() {
  return C.patients.flatMap((p) => p.facts.filter((f) => f.source === "epic_lab").map((f) => ({
    PATID: p.mrn, BEPALING: Object.keys(LOCAL_LAB).find((k) => LOCAL_LAB[k] === f.fact), UITSLAG: comma(f.truth_value),
    EENHEID: String(C.fact_defs[f.fact].unit).replace("umol/L", "umol/l").replace("mL/min/1.73m2", "ml/min"), DATUMTIJD: f.time.replace(/[-T:]/g, "") })));
}

const DBS = [
  { id: "echo-db", name: "Echocardiography measurements", kind: "Microsoft Access database", owner: "Cardiology, echocardiography laboratory",
    conn: "\\\\fs01\\cardio\\echo\\echo_metingen.accdb, table tblMetingen", account: "svc_handover_ro, read-only share access", schedule: "Nightly at 02:00",
    cols: [["patnr", "Patient no.", "Trim spaces; must exist in the patient master index"], ["datum", "Examination date", "dd-mm-yy to date"],
      ["EF", "LV ejection fraction (LVEF)", "Strip %"], ["IVS", "IVSd", "Comma decimal"], ["LVIDd", "LVIDd", "Values under 10 read as cm, × 10 to mm"], ["opm", "Remark", "Free text, kept as remark"]],
    match: "Patient no. against the patient master index", rows: echoRows,
    parse: (r) => ({ p: byMrn(r.patnr), date: fromDmy(r.datum), values: { lvef: dec(r.EF), ivs_thickness: dec(r.IVS), lv_diameter: dec(r.LVIDd) < 10 ? Math.round(dec(r.LVIDd) * 10) : dec(r.LVIDd) } }) },
  { id: "renal-xlsx", name: "Renal function follow-up list", kind: "Excel workbook, kept by hand", owner: "Nephrology outpatient clinic",
    conn: "\\\\fs01\\nefro\\nierfunctie_controles.xlsx, sheet Blad1", account: "svc_handover_ro, read-only share access", schedule: "Hourly, when the file has changed",
    cols: [["Naam", "Patient", "Surname and initial; matched with date of birth"], ["Geb.datum", "Date of birth", "dd-mm-yyyy or dd/mm/yyyy"], ["Datum", "Date", "dd-mm-yyyy"],
      ["Kreat (umol/l)", "Creatinine", "Comma decimal; flag H dropped; µmol/L"], ["eGFR", "eGFR (CKD-EPI)", "Flag L dropped"]],
    match: "Surname and date of birth", rows: renalRows,
    parse: (r) => ({ p: byNameDob(r.Naam, fromDmy(r["Geb.datum"])), date: fromDmy(r.Datum), values: { creatinine: dec(r["Kreat (umol/l)"]), egfr: dec(r.eGFR) } }) },
  { id: "lab-csv", name: "Clinical chemistry archive", kind: "CSV export, semicolon, Latin-1", owner: "Clinical chemistry",
    conn: "sftp://labarchive.azzuid.example/export/uitslagen_*.csv", account: "svc_handover_ro, SFTP key", schedule: "Nightly at 03:00",
    cols: [["PATID", "Patient no.", "As is"], ["BEPALING", "Test", "Local code to LOINC (TROP, KREA, EGFR, GLUC, HB)"], ["UITSLAG", "Result", "Comma decimal"],
      ["EENHEID", "Unit", "To UCUM (umol/l → µmol/L)"], ["DATUMTIJD", "Date and time", "yyyymmddhhmm"]],
    match: "Patient no. against the patient master index", rows: labRows,
    parse: (r) => ({ p: byMrn(r.PATID), date: `${r.DATUMTIJD.slice(0, 4)}-${r.DATUMTIJD.slice(4, 6)}-${r.DATUMTIJD.slice(6, 8)}T${r.DATUMTIJD.slice(8, 10)}:${r.DATUMTIJD.slice(10, 12)}`, values: { [LOCAL_LAB[r.BEPALING]]: dec(r.UITSLAG) } }) },
];
DBS.forEach((d) => (d.synced = d.id === "lab-csv" ? "Nightly, last run 03:00" : "Today 02:00"));

// Run the transformations and compare every value with what the hospital already holds for that patient and date.
function profile(db) {
  const raw = db.rows(), seen = new Set();
  const out = raw.map((r) => {
    const key = JSON.stringify(r), dup = seen.has(key); seen.add(key);
    const m = db.parse(r), vals = Object.entries(m.values).filter(([, v]) => v != null);
    if (dup) return { r, m, status: "Duplicate", vals, hits: [] };
    if (!m.p) return { r, m, status: "No patient match", vals, hits: [] };
    if (!m.date || !vals.length) return { r, m, status: "Not parsed", vals, hits: [] };
    const hits = vals.map(([fact, v]) => ({ fact, v, f: m.p.facts.find((f) => f.fact === fact && f.time.startsWith(m.date)) }));
    const upd = hits.filter((h) => h.f && ["PICTURE", "LOST"].includes(h.f.status) && !S.confirmed[factKey(h.f)]);
    const diff = hits.filter((h) => h.f && h.f.got != null && h.f.status !== "LOST" && Math.abs(h.f.got - h.v) > 0.5);
    return { r, m, vals, hits, upd, status: upd.length ? "Adds structured value" : diff.length ? "Differs from received" : hits.some((h) => h.f) ? "Already received" : "New result" };
  });
  const n = (s) => out.filter((x) => x.status === s).length;
  return { out, rows: raw.length, matched: out.filter((x) => x.m.p && x.status !== "Duplicate").length, nomatch: n("No patient match"), dup: n("Duplicate"),
    bad: n("Not parsed"), diff: n("Differs from received"), upd: out.reduce((a, x) => a + (x.upd?.length || 0), 0) };
}
// Values the database holds as structured data replace image-extracted or missing ones. The original stays in the audit trail.
function applyDb(db) {
  let n = 0;
  for (const x of profile(db).out) for (const h of x.upd || []) {
    Object.assign(h.f, { status: "DATA", got: h.v, db: db.name, dbAt: now() }); n++;
  }
  db.applied = (db.applied || 0) + n;
  flash(`${plural(n, "result")} updated from ${db.name}`);
}

// ------------------------------------------------------------ data management: intake, data sources, channels, routing, directory

const chanName = (id) => CHANNELS.find((c) => c.id === id)?.name || id;
const known = (i) => i.internal || !!dirOf(i.from);
function intakeDetail(i) {
  const c = CHANNELS.find((x) => x.id === i.channel), ok = known(i), open = i.status === "Open";
  const ans = i.pid && i.fact && [...S.log].reverse().find((l) => l.kind === "request" && l.pid === i.pid && l.facts?.includes(i.fact)); // the request this answers
  const pts = C.patients.map((p) => `<option value="${p.pid}" ${p.pid === i.pid ? "selected" : ""}>${esc(p.family)}, ${esc(p.given)} · ${fmtDate(p.dob)} · ${p.mrn}</option>`).join("");
  return `
    <div class="block"><dl class="kv"><dt>Received</dt><dd>${i.time} · ${esc(c.name)}</dd>
      ${i.channel === "fax" ? `<dt>From</dt><dd>${faxOf(i.calling) ? `${esc(faxOf(i.calling).name)} <span class="dim">· matched by fax number</span>` : `${st("PICTURE", "Unknown fax number")} <span class="dim">· call back on a number from Institutions</span>`}</dd>`
      : i.channel === "folder" ? "" : `<dt>From</dt><dd>${esc(i.from)}${ok ? "" : ` · ${st("PICTURE", "Not a registered institution")}`}</dd>`}
      ${ans ? `<dt>Answers</dt><dd>Result request of ${esc(ans.time.slice(0, 10))} (${esc(ans.channel)})</dd>` : ""}</dl></div>
    <div class="block"><h4>Filing</h4>${open ? `
      <label class="field"><span>Patient</span><select id="i-pid"><option value="">Select patient</option>${pts}</select></label>
      <div class="field"><span></span><div class="dim">${esc(i.match)}</div></div>
      ${i.fact ? `<div class="field"><span>${esc(LABEL[i.fact])}</span><div class="inline" style="margin:0"><input id="i-val" value="${esc(comma(i.value))}">
        <span class="dim">${esc(unit(C.fact_defs[i.fact].unit))} · ${i.channel === "fax" ? "read from the fax by text recognition" : "read from the message"}, filed as unverified</span></div></div>` : ""}
      <div class="inline">${ok ? "" : `<button data-q-act="i-dir" data-key="${i.key}">Register sender as institution</button>`}
        <button class="primary" data-q-act="i-file" data-key="${i.key}" ${ok ? "" : "disabled"}>File to patient</button>
        ${!i.pid ? `<button data-q-act="ask" data-key="${i.key}">Request again</button>` : ""}
        <button data-q-act="i-reject" data-key="${i.key}">Reject</button></div>${S.asked[i.key] ? `<p class="note dim">${esc(S.asked[i.key])}</p>` : ""}` : `<div>${esc(i.status)}</div>`}</div>
    ${scanFile(i) ? uploadView(scanFile(i)) : chatImage(i) ? viewer(chatImage(i)) : ""}
    ${originOf(i)}
    ${["fax", "chat"].includes(i.channel) ? `<div class="block"><h4>${i.channel === "fax" ? "Text read from the fax (OCR)" : "Message"}</h4><pre class="raw">${esc(i.text)}</pre></div>` : ""}`;
}
// Where a captured document came from, stated the way a patient record states it.
function originOf(i) {
  const c = CHANNELS.find((x) => x.id === i.channel), lines = i.text.split("\n");
  const sender = i.channel === "fax" ? (faxOf(i.calling)?.name || "Unknown fax number") : i.channel === "folder" ? i.from.replace(/^Scanner, (.)/, (m, x) => x.toUpperCase()) : i.from;
  const doc = { fax: "Fax, 1 page", folder: `${lines[0].split("\\").pop()}, ${lines[1]?.split(".")[0] || ""}`, mail: lines.find((l) => l.startsWith("Attachments:")) || "", chat: "Chat message" }[i.channel];
  const ident = i.channel === "folder" ? "None: no BSN, patient number or date of birth found on the scan" : i.match;
  return `<div class="block"><h4>Origin</h4><dl class="kv">
    <dt>Sender</dt><dd>${esc(sender)}${i.email ? ` <span class="dim">· ${esc(i.email)}</span>` : ""}</dd>
    <dt>Received through</dt><dd>${esc(c.name)} <span class="dim">· ${esc(c.type)}</span></dd>
    ${doc ? `<dt>Document</dt><dd>${esc(doc)}</dd>` : ""}
    <dt>Patient identification</dt><dd>${esc(ident)}</dd></dl></div>`;
}
// A chat message about a measurement: the exported capture it refers to, from the patient's own record.
const chatImage = (i) => i.channel === "chat" && i.pid && patient(i.pid).facts.find((f) => f.fact === i.fact && f.media);
const scanFile = (i) => i.channel !== "chat" && { name: { fax: "Fax", mail: "referral_letter.pdf" }[i.channel] || i.text.split("\n")[0].split("\\").pop(), type: "image/svg+xml",
  url: scanPage(i), note: i.channel === "folder" ? "Page 1 of 2" : "Page 1",
  box: i.channel === "fax" && i.fact ? [7.6, 19.8, 58, 2.6] : null }; // the result line on the fax page (4th line of the text)
// A captured document as the scanned page that came in, drawn from the item's own text and the patient's data only.
function scanPage(i) {
  const p = i.pid && patient(i.pid);
  let body, font = "Arial, Helvetica, sans-serif";
  if (i.channel === "fax") {
    font = "'Courier New', monospace";
    body = T(36, 28, `${i.time}   FROM: ${i.tsi || i.from}   P.1/1`, 'font-size="10"') + rule(36, 36, 523)
      + i.text.split("\n").map((l, k) => T(50, 110 + k * 24, l, `font-size="12" ${k ? "" : B}`)).join("");
  } else if (i.channel === "mail") {
    body = T(60, 80, i.from, `font-size="18" ${B}`) + T(60, 98, i.email || "", 'font-size="10"') + rule(60, 110, 475)
      + T(60, 150, `To: Cardiology, ${HOSPITAL}`, 'font-size="11"') + T(60, 166, `Date: ${fmtDate(i.time.slice(0, 10))}`, 'font-size="11"')
      + T(60, 210, "Re: referral", `font-size="12" ${B}`)
      + (p ? [`Patient: ${p.family}, ${p.given}`, `Date of birth: ${fmtDate(p.dob)}`, `BSN: ${p.bsn}`].map((l, k) => T(60, 236 + k * 16, l, 'font-size="11"')).join("") : "")
      + ["Dear colleague,", "", "I would be grateful if you would assess this patient at your cardiology outpatient", "clinic for chest pain. The ECG is attached.", "",
        "Kind regards,", "", "General practitioner", i.from].map((l, k) => T(60, 310 + k * 16, l, 'font-size="11"')).join("");
  } else {
    // a printed consultation form whose patient label was never stuck on: why nothing on it identifies the patient
    const para = (y, lines) => lines.map((l, k) => T(60, y + k * 15, l, 'font-size="10.5"')).join("");
    body = T(60, 70, HOSPITAL, `font-size="14" ${B}`) + T(60, 88, "Cardiology outpatient clinic · Consultation form", 'font-size="11"') + rule(60, 98, 475)
      + `<rect x="330" y="112" width="205" height="72" fill="none" stroke="#9a9a9a" stroke-dasharray="4 3"/>` + T(432, 152, "Patient label", 'font-size="10" fill="#9a9a9a" text-anchor="middle"')
      + T(60, 126, "Clinician", 'font-size="10.5"') + rule(130, 128, 170) + T(60, 152, "Date", 'font-size="10.5"') + rule(130, 154, 170)
      + T(60, 214, "Complaint and history", `font-size="11" ${B}`)
      + para(236, ["Chest pain on exertion for several weeks, radiating to the left arm, settling with rest.", "No pain at rest. Known hypertension, on treatment. Non-smoker.",
        "Referred by the general practitioner for further assessment."])
      + T(60, 302, "Examination", `font-size="11" ${B}`)
      + para(324, ["Alert, no distress. Heart sounds regular, no murmur. Chest clear.", "No peripheral oedema."])
      + T(60, 376, "Plan", `font-size="11" ${B}`)
      + para(398, ["Exercise ECG and echocardiography. Review with results.", "Laboratory: troponin, renal function, lipid profile."])
      + T(297, 800, "1 / 2", 'font-size="9" text-anchor="middle"');
  }
  return sheet(body, font, true);
}
// An A4 page as an SVG data URL; a scan gets a grey cast, noise and a slight skew.
const T = (x, y, t, o = "") => `<text x="${x}" y="${y}" ${o}>${esc(t)}</text>`, B = 'font-weight="700"';
const rule = (x, y, w) => `<line x1="${x}" y1="${y}" x2="${x + w}" y2="${y}" stroke="#555" stroke-width=".6"/>`;
const sheet = (body, font, scan) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 595 842" width="595" height="842">
  ${scan ? `<defs><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 .35 0 0 0 0 .35 0 0 0 0 .35 .14 0 0 0 0"/></filter></defs>` : ""}
  <rect width="595" height="842" fill="${scan ? "#eeece4" : "#fff"}"/><g ${scan ? 'transform="rotate(-.4 297 421)" ' : ""}fill="#232327" font-family="${font}">${body}</g>
  ${scan ? `<rect width="595" height="842" filter="url(#n)"/>` : ""}</svg>`);
// A document with no image of its own, printed from the data: a laboratory report as the sender reported it, or a page
// that says what was expected and did not arrive. Rows are [label, value] or, in the table, [test, result, unit].
function printPage(it) {
  const p = patient(it.pid), lost = it.facts.every((f) => f.status === "LOST"), lab = !lost;
  const kv = [["Patient", `${p.family}, ${p.given}`], ["Date of birth", fmtDate(p.dob)], ["Patient no.", p.mrn], ["Date and time", fmtTime(it.time)]];
  // the test name and value as the message carries them (OBX for HL7, INV and RSL for EDIFACT), else ours
  const row = (f) => {
    const x = f.excerpt || "", obx = /OBX\|\d+\|\w+\|[^^]*\^([^^]+)\^LN\|\|([^|]*)\|([^|]*)\|/.exec(x), inv = /INV\+(\w+):([^:']+)/.exec(x), rsl = /RSL\+NV\+([^+]+)\+([^']+)'/.exec(x);
    const sent = (f.steps || []).map((s) => /^([\d.,]+)\s*([^\s→]+) → /.exec(s)).find(Boolean); // e.g. "1.9 cm → 19 mm": the value as the sender wrote it
    return obx ? [obx[1], obx[2], unit(obx[3])] : inv && rsl ? [`${inv[2]} (${inv[1]})`, rsl[1], unit(rsl[2])] : sent ? [label(f), sent[1], unit(sent[2])] : [label(f), TR[f.got] || f.got || "", unit(C.fact_defs[f.fact]?.unit)];
  };
  const head = lab ? [T(60, 70, it.origin, `font-size="15" ${B}`), T(60, 88, `${it.title} ${it.ref}`, 'font-size="11"')]
    : [T(60, 70, it.file ? "No preview available" : "Document not received", `font-size="15" ${B}`), T(60, 88, full(it), 'font-size="11"')];
  if (!lab) kv.push(["Sender", it.origin], ["Format", it.format]);
  const table = lab ? [["Test", "Result", "Unit"], ...it.facts.map(row)] : [["Test", "Status"], ...it.facts.map((f) => [label(f), WORD[verdict(f)]])];
  let y = 124;
  const body = [...head, rule(60, 98, 475), ...kv.map(([l, v]) => T(60, (y += 16), l, 'font-size="10"') + T(170, y, v, 'font-size="10"')),
    ...table.map((r, k) => r.map((c, j) => T([60, 320, 420][j], (y += j ? 0 : k ? 16 : 34), c, `font-size="10" ${k ? "" : B}`)).join("") + (k ? "" : rule(60, y + 5, 475))),
    ...(lost ? (remark(it.facts[0]).match(/.{1,90}(\s|$)/g) || []).map((l, k) => T(60, (y += k ? 14 : 30), l.trim(), 'font-size="10"')) : [])];
  return sheet(body.join(""), "Arial, Helvetica, sans-serif");
}

const rowStatus = (o) => o.status === "Adds structured value" ? td(st("DATA", o.status), "", `${o.m.p.name}: ${o.upd.map((h) => LABEL[h.fact]).join(", ")}`)
  : ["No patient match", "Duplicate", "Not parsed"].includes(o.status) ? td(st("LOST", o.status), "", o.status)
  : o.status === "Differs from received" ? td(st("PICTURE", o.status), "", o.status) : tdt(`${o.status}${o.m.p ? ", " + o.m.p.name : ""}`);
function sourceDetail(d, x) {
  const kpi = (l, v) => `<div class="kpi"><label>${l}</label><b>${v}</b></div>`;
  const heads = x ? Object.keys(x.out[0]?.r || {}) : [];
  return `
    <div class="block"><dl class="kv"><dt>Type</dt><dd>${esc(d.kind)}</dd><dt>Connection</dt><dd>${esc(d.conn)}</dd><dt>Account</dt><dd>${esc(d.account)}</dd>
      <dt>Access</dt><dd>Read-only. Nothing is written back to the source.</dd><dt>Patient matching</dt><dd>${esc(d.match)}</dd>
      <dt>Schedule</dt><dd>${esc(d.schedule)}</dd><dt>Owner</dt><dd>${esc(d.owner)}</dd><dt>Last sync</dt><dd>${esc(d.synced)}</dd></dl>
      <div class="inline"><button data-q-act="db-test" data-key="${d.id}">Test connection</button><button data-q-act="db-sync" data-key="${d.id}">Sync now</button>
        ${x?.upd ? `<button class="primary" data-q-act="db-apply" data-key="${d.id}">Update ${plural(x.upd, "result")}</button>` : ""}</div></div>
    <div class="block"><h4>Column mapping</h4>${table([["Source column", "26%"], ["Field", "30%"], ["Transformation"]], d.cols.map((c) => `<tr>${td(`<code>${esc(c[0])}</code>`, "", c[0])}${tdt(c[1])}${tdt(c[2])}</tr>`))}</div>
    ${x ? `<div class="block"><h4>Data quality, last sync</h4><div class="kpis mini">${kpi("Rows", x.rows)}${kpi("Matched", x.matched)}${kpi("No patient match", x.nomatch)}${kpi("Duplicates", x.dup)}${kpi("Not parsed", x.bad)}${kpi("New structured values", x.upd)}</div>
      ${x.upd ? `<p class="dim" style="margin:8px 0 0">${plural(x.upd, "value")} on screen as unverified or not received ${x.upd === 1 ? "is" : "are"} held here as data. Updating replaces them; the received value stays in the audit trail.</p>` : ""}</div>
      <div class="block"><h4>Rows as stored in the source</h4>${table([...heads.map((h) => [esc(h)]), ["Result of mapping", "30%"]], x.out.map((o) => `<tr>${heads.map((h) => tdt(o.r[h])).join("")}${rowStatus(o)}</tr>`))}</div>`
      : `<div class="block"><p class="empty" style="padding:0">First sync pending.</p></div>`}`;
}

function channelDetail(c) {
  const ms = (c.msgs ? c.msgs() : []).sort((a, b) => b.time.localeCompare(a.time)), er = c.errors ? c.errors() : [];
  const grid = (rs) => table([["Date and time", "152px"], ["Patient", "26%"], ["Content"], ["Status", "24%"]],
    rs.slice(0, 50).map((r) => `<tr>${td(r.time)}${tdt(r.who)}${tdt(r.what)}${td(failed(r.status) || r.status === "No patient match" ? st("LOST", r.status) : esc(r.status), "", r.status)}</tr>`));
  return `
    <div class="block"><dl class="kv"><dt>Type</dt><dd>${esc(c.type)}</dd><dt>Direction</dt><dd>${c.dir}</dd><dt>Scope</dt><dd>${esc(c.scope || "")}</dd><dt>Source</dt><dd>${esc(c.source)}</dd>
      <dt>Default route</dt><dd>${esc(c.route)}</dd><dt>State</dt><dd>${chanState(c)}</dd>${c.env ? `<dt>Environment</dt><dd>${c.env}</dd>` : ""}
      ${c.ack ? `<dt>Acknowledgement</dt><dd>${esc(c.ack)}</dd>` : ""}${c.remark ? `<dt>Remark</dt><dd>${esc(c.remark)}</dd>` : ""}${recogLine("channel", c.id)}</dl>
      <div class="inline"><button data-q-act="ch-toggle" data-key="${c.id}">${S.off[c.id] ? "Start" : "Pause"}</button><button data-q-act="ch-test" data-key="${c.id}">Test connection</button></div></div>
    ${certBlock(c)}${onboardBlock(c)}
    ${er.length ? `<div class="block"><h4>Error queue</h4>${grid(er)}<div class="inline"><button data-href="#/clinic/nephrology/intake">Open in To file</button></div></div>` : ""}
    ${c.msgs ? `<div class="block"><h4>Messages</h4>${grid(ms)}</div>` : `<div class="block"><p class="empty" style="padding:0">Look-up channel. Messages are not stored.</p></div>`}`;
}

function certBlock(c) {
  const k = CERTS[c.cert];
  if (!k) return "";
  const iss = certIssue(k), d = daysTo(k.until);
  return `<div class="block"><h4>Certificate</h4><dl class="kv"><dt>Certificate</dt><dd>${esc(k.name)}</dd><dt>Subject</dt><dd>${esc(k.subject)}</dd><dt>Serial number</dt><dd>${k.serial}</dd>
      <dt>Valid</dt><dd>${k.from} to ${k.until} <span class="dim">(${d < 0 ? "expired" : plural(d, "day") + " left"})</span></dd>
      <dt>Trust store</dt><dd>${k.g4 ? "G4 CA certificates loaded" : `G4 CA certificates not loaded. The UZI register issues from G4 from ${G4_DATE}.`}</dd>
      ${k.note ? `<dt>Remark</dt><dd>${esc(k.note)}</dd>` : ""}${iss ? `<dt>Issue</dt><dd>${st("PICTURE", iss)}</dd>` : ""}</dl>
    <div class="inline">${k.g4 ? "" : `<button data-q-act="cert-g4" data-key="${c.cert}">G4 CA certificates loaded</button>`}
      ${d <= 60 && !k.renew ? `<button data-q-act="cert-renew" data-key="${c.cert}">Renewal requested</button>` : ""}</div></div>`;
}
function onboardBlock(c) {
  if (!c.onboard) return "";
  const next = c.onboard.find((x) => x.state !== "Done");
  return `<div class="block"><h4>Onboarding (Twiin)</h4>${table([["Step"], ["State", "110px"], ["Date", "100px"]],
      c.onboard.map((x) => `<tr>${tdt(x.step)}${td(x.state === "Done" ? st("DATA", "Done") : x.state === "In progress" ? st("PICTURE", "In progress") : `<span class="dim">Not started</span>`)}${td(x.date)}</tr>`))}
    ${next ? `<div class="inline"><button data-q-act="ch-step" data-key="${c.id}">Step done: ${esc(next.step)}</button></div>` : ""}</div>`;
}


const dirStatus = (d) => d.status === "Verified" ? st("DATA", "Verified") : d.status === "Temporary" ? st("CONFLICT", "Temporary") : st("PICTURE", d.status);
function dirDetail(d) {
  const ex = S.log.filter((l) => l.to === d.name).sort((a, b) => b.time.localeCompare(a.time));
  const ins = S.intake.filter((i) => i.from === d.name);
  return `
    <div class="block"><dl class="kv"><dt>Type</dt><dd>${esc(d.type)}</dd>${d.dept ? `<dt>Department</dt><dd>${esc(d.dept)}</dd>` : ""}
      <dt>AGB code</dt><dd>${esc(d.agb || "Not documented")}</dd><dt>URA number</dt><dd>${esc(d.ura || "Not documented")}</dd><dt>Preferred channel</dt><dd>${esc(d.channel)}</dd>${recogLine("institution", d.name)}
      <dt>Status</dt><dd>${dirStatus(d)}</dd><dt>Verification</dt><dd>${esc(d.verified)}</dd>${d.expires ? `<dt>Expires</dt><dd>${d.expires}</dd>` : ""}
      ${d.remark ? `<dt>Remark</dt><dd>${esc(d.remark)}</dd>` : ""}${d.added ? `<dt>Added</dt><dd>${d.added}, User</dd>` : ""}</dl>
      <div class="inline">${d.status !== "Verified" ? `<button data-q-act="dir-verify" data-key="${esc(d.name)}">Verified by telephone call-back</button>` : ""}
        ${d.status === "Temporary" ? `<button data-q-act="dir-perm" data-key="${esc(d.name)}">Make permanent</button>` : ""}</div></div>
    <div class="block"><h4>Contact points</h4>${table([["Channel", "36%"], ["Address"]], d.points.map(([c, a]) => `<tr>${tdt(c)}${tdt(a)}</tr>`))}</div>
    <div class="block"><h4>Exchanges</h4>${table([["Date and time", "152px"], ["Type", "112px"], ["Patient", "26%"], ["Status"]],
      [...ex.map((l) => `<tr>${td(l.time)}${td(KIND[l.kind])}${tdt(l.pid ? patient(l.pid).name : l.who)}${td(statusCell(lastStatus(l)), "", lastStatus(l))}</tr>`),
       ...ins.map((i) => `<tr>${td(i.time)}${td("Received")}${tdt(i.pid ? patient(i.pid).name : "–")}${tdt(i.status)}</tr>`)])}</div>`;
}

// Upload link state, on the request it belongs to.
const LINK_STATE = { active: "Active", used: "Used: result uploaded", expired: "Expired", revoked: "Revoked", closed: "Closed: request answered otherwise", locked: "Locked: three failed verification attempts" };
function linkBlock(l) {
  const k = l.portal;
  if (!k) return "";
  return `<div class="block"><h4>Upload link</h4><dl class="kv"><dt>Link</dt><dd>${k.token}</dd><dt>Scope</dt><dd>This patient and this request only; single use</dd>
    <dt>Valid until</dt><dd>${k.until}</dd><dt>Verification</dt><dd>Sign-in with UZI pass (Zorg-ID), then the patient's date of birth</dd><dt>State</dt><dd>${LINK_STATE[k.state]}</dd>
    ${k.opened ? `<dt>Opened</dt><dd>${k.opened}</dd>` : ""}${k.by ? `<dt>Uploaded by</dt><dd>${esc(k.by)}, ${k.uploaded}</dd><dt>Files</dt><dd>${esc(k.files.join("; ") || "None: value entered only")}</dd>` : ""}</dl>
    <div class="inline">${k.state === "active" ? `<button class="primary" data-act="portal" data-arg="${k.token}">Open as sender (demo)</button><button data-act="revoke" data-arg="${l.id}">Revoke link</button>` : ""}
      ${["expired", "revoked", "locked"].includes(k.state) ? `<button data-act="relink" data-arg="${l.id}">Send new link</button>` : ""}</div></div>`;
}

function channelDialog() {
  const types = ["HL7 v2 listener (MLLP)", "Twiin (Notified Pull, FHIR STU3)", "ZorgMail mailbox (EDIFACT, HL7 v2)", "Secure mail mailbox (ZorgMail, ZIVVER)", "Fax-to-mail inbox", "Shared folder watch", "Secure chat (message board)", "DICOM receiver (C-STORE)"];
  const routes = ["To file", "By care pathway", ...Object.values(DEPTS).map((d) => d.label + " worklist")];
  openDialog(`<form class="dlg" id="f-ch"><header><b>New connection</b><span class="pt">Connections</span></header><div class="body">
      <label class="field"><span>Name <span class="req">*</span></span><input name="name" required></label>
      <label class="field"><span>Type</span><select name="type">${types.map((x) => opt(x)).join("")}</select></label>
      <label class="field"><span>Source</span><input name="source" placeholder="Port, mailbox address, folder or endpoint"></label>
      <label class="field"><span>Default route</span><select name="route">${routes.map((x) => opt(x)).join("")}</select></label></div>
    <footer><span class="left">Unstructured channels (mail, fax, folder, chat) always go to To file first.</span><button type="button" data-act="close">Cancel</button><button class="primary">Add connection</button></footer></form>`);
  $("#f-ch").addEventListener("submit", (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target)), id = "c" + CHANNELS.length;
    CHANNELS.push({ id, name: d.name, type: d.type, dir: "Inbound", source: d.source || "Not documented", route: d.route, msgs: () => [] });
    flash(`Connection ${d.name} added and started`);
    go(`#/admin/channels/${id}`);
  });
}

// Bridge to a database the hospital already keeps. Five steps; the example is the cardiology Holter list.
const DB_KINDS = { "Microsoft SQL Server, read-only view": ["sqlcardio01.azzuid.example", "CARDIO_DB"], "Oracle, read-only view": ["oracardio.azzuid.example:1521", "CARDIO"],
  "ODBC data source": ["DSN=CardioArchive", ""], "Microsoft Access database": ["\\\\fs01\\cardio\\holter\\holter.accdb", ""], "Excel workbook": ["\\\\fs01\\cardio\\holter\\holter_2026.xlsx", ""],
  "CSV export folder": ["\\\\fs01\\export\\holter\\*.csv", ""] };
const FIELDS = ["Not mapped", "Patient no.", "BSN", "Patient name", "Date of birth", "Examination date", "Date and time", "Heart rate, mean", "Heart rate, maximum", "Pauses over 2 s", "Result", "Unit", "Remark"];
const HOLTER = [["Patientnr", "Patient no.", "Trim spaces; must exist in the patient master index"], ["Datum onderzoek", "Examination date", "dd-mm-yyyy to date"],
  ["Gem HF", "Heart rate, mean", "Integer, /min"], ["Max HF", "Heart rate, maximum", "Integer, /min"], ["Pauzes >2s", "Pauses over 2 s", "Integer; empty read as 0"],
  ["Conclusie", "Remark", "Free text, kept as remark"], ["Ingevoerd door", "Not mapped", "Not imported"]];
let W = null;
function dbDialog(step = 1) {
  W ||= { kind: "Microsoft Access database", name: "Holter recordings", owner: "Cardiology, function department", tested: false, table: "", map: HOLTER.map((c) => c[1]),
    schedule: "Nightly at 02:00", match: "Patient no. against the patient master index" };
  const steps = ["Source", "Connection", "Table", "Column mapping", "Schedule and review"];
  const [host, dbn] = DB_KINDS[W.kind];
  const tables = /Excel/.test(W.kind) ? ["Blad1", "Blad2 (old)"] : /CSV/.test(W.kind) ? ["holter_20261001.csv", "holter_20260930.csv"] : ["tblHolter", "tblHolter_oud", "qryHolterExport"];
  W.host ??= host; W.db ??= dbn; W.table ||= tables[0];
  const body = [
    () => `<label class="field"><span>Type</span><select name="kind">${Object.keys(DB_KINDS).map((k) => opt(k, W.kind)).join("")}</select></label>
      <label class="field"><span>Name</span><input name="name" value="${esc(W.name)}"></label>
      <label class="field"><span>Owner</span><input name="owner" value="${esc(W.owner)}"></label>
      <div class="field"><span></span><div class="dim">The bridge only reads. Nothing is written to the source, and the department keeps working in it as before.</div></div>`,
    () => `<label class="field"><span>Server or file</span><input name="host" value="${esc(W.host)}"></label>
      ${dbn ? `<label class="field"><span>Database</span><input name="db" value="${esc(W.db)}"></label>` : ""}
      <label class="field"><span>Account</span><input name="acct" value="svc_handover_ro" readonly></label>
      <div class="field"><span>Credential</span><div class="dim">Service account from the hospital's credential vault. Not shown, not stored here.</div></div>
      <div class="field"><span></span><div class="inline" style="margin:0"><button type="button" id="w-test">Test connection</button>
        <span id="w-res" class="dim">${W.tested ? `Connected with read rights only. ${tables.length} tables found.` : ""}</span></div></div>`,
    () => `<div class="field"><span>Table or sheet</span><div>${tables.map((t) => `<label style="display:block"><input type="radio" name="table" value="${esc(t)}" ${t === W.table ? "checked" : ""}> <code>${esc(t)}</code></label>`).join("")}</div></div>
      <div class="field"><span>Columns</span><div>${HOLTER.map((c) => `<code>${esc(c[0])}</code>`).join(", ")}</div></div>`,
    () => `${table([["Source column", "26%"], ["Field", "34%"], ["Transformation"]], HOLTER.map((c, i) => `<tr>${td(`<code>${esc(c[0])}</code>`)}
        ${td(`<select name="m${i}">${FIELDS.map((x) => opt(x, W.map[i])).join("")}</select>`)}${tdt(W.map[i] === "Not mapped" ? "Not imported" : c[2])}</tr>`))}
      <div class="dim">Suggested from the column names. Check each one; sample rows are shown after the first sync.</div>`,
    () => `<label class="field"><span>Schedule</span><select name="schedule">${["Every 5 minutes", "Hourly, when the source has changed", "Nightly at 02:00"].map((x) => opt(x, W.schedule)).join("")}</select></label>
      <label class="field"><span>Patient matching</span><select name="match">${["Patient no. against the patient master index", "BSN", "Surname and date of birth"].map((x) => opt(x, W.match)).join("")}</select></label>
      <div class="field"><span>Summary</span><dl class="kv"><dt>Source</dt><dd>${esc(W.kind)}: ${esc(W.host)}${W.db ? ", " + esc(W.db) : ""}, ${esc(W.table)}</dd><dt>Name</dt><dd>${esc(W.name)}</dd>
        <dt>Owner</dt><dd>${esc(W.owner)}</dd><dt>Columns mapped</dt><dd>${W.map.filter((m) => m !== "Not mapped").length} of ${HOLTER.length}</dd><dt>Access</dt><dd>Read-only</dd></dl></div>`,
  ][step - 1]();
  openDialog(`<form class="dlg" id="f-db"><header><b>Connect department database</b><span class="pt">Step ${step} of 5: ${steps[step - 1]}</span></header><div class="body">${body}</div>
    <footer>${step > 1 ? `<button type="button" id="w-back" class="left-btn">Back</button>` : ""}<span class="left"></span><button type="button" data-act="close">Cancel</button>
      <button class="primary" ${step === 2 && !W.tested ? "disabled" : ""}>${step === 5 ? "Connect database" : "Next"}</button></footer></form>`);
  const f = $("#f-db");
  const keep = () => { for (const [k, v] of new FormData(f)) if (/^m\d+$/.test(k)) W.map[+k.slice(1)] = v; else if (k !== "acct") W[k] = v; };
  $("#w-back")?.addEventListener("click", () => { keep(); dbDialog(step - 1); });
  $("#w-test")?.addEventListener("click", () => { keep(); W.tested = true; dbDialog(2); });
  if (step === 1) f.kind.addEventListener("change", () => { W.kind = f.kind.value; W.host = W.db = undefined; W.tested = false; W.table = ""; });
  f.addEventListener("submit", (e) => {
    e.preventDefault(); keep();
    if (step < 5) return dbDialog(step + 1);
    const id = "db" + (DBS.length + 1);
    DBS.push({ id, name: W.name, kind: W.kind, owner: W.owner, conn: `${W.host}${W.db ? ", " + W.db : ""}, ${W.table}`, account: "svc_handover_ro, read-only (credential in the hospital vault)",
      schedule: W.schedule, match: W.match, synced: "First sync pending", cols: HOLTER.map((c, i) => [c[0], W.map[i], W.map[i] === "Not mapped" ? "Not imported" : c[2]]) });
    flash(`${W.name} connected; first sync ${W.schedule.toLowerCase()}`);
    W = null;
    go(`#/admin/sources/${id}`);
  });
}

// ------------------------------------------------------------ sender portal: what an external sender sees after opening an upload link

const initials = (p) => `${p.given[0]}. ${p.family.split(" ").pop()[0]}.`;
function portalView(l) {
  const p = patient(l.pid), f = p.facts.find((x) => x.fact === l.facts[0]);
  return { token: l.portal.token, until: l.portal.until, state: l.portal.state, ref: l.id, from: `${l.from}, ${HOSPITAL}`, to: l.to,
    initials: initials(p), yob: p.dob.slice(0, 4), dob: p.dob, date: f ? fmtTime(f.time) : "", q: l.q || "", tests: l.facts.map((k) => [k, LABEL[k] || k, unit(C.fact_defs[k]?.unit)]) };
}
// The portal finds its request from the window that opened it; links are also published in this browser
// (BroadcastChannel, localStorage) so a link pasted into another tab works as well. Demo only: no server.
const BC = "BroadcastChannel" in window ? new BroadcastChannel("six-sys-portal") : null;
function publishLink(l) {
  try { const all = JSON.parse(localStorage.getItem("six-sys-links") || "{}"); all[l.portal.token] = portalView(l); localStorage.setItem("six-sys-links", JSON.stringify(all)); } catch {}
}
const openPortal = (token) => { const l = S.log.find((x) => x.portal?.token === token); if (l) publishLink(l); window.open(`${location.href.split("#")[0]}#/portal/${token}`, "_blank", "width=1000,height=800"); };
function receiveUpload(l, m) {
  const files = m.files || [], f0 = files[0];
  const upload = f0 && { name: f0.file.name, type: f0.file.type, size: f0.file.size, sha: f0.sha, url: URL.createObjectURL(f0.file) };
  const by = `${m.who.name}, ${m.who.role.toLowerCase()}${m.who.reg ? ` (${m.who.reg})` : ""}`;
  for (const fact of l.facts) fileResult(l.pid, { fact, value: m.values?.[fact], via: "Upload link", by, upload, origin: l.to });
  Object.assign(l.portal, { state: "used", uploaded: now(), by, files: files.map((x) => `${x.file.name} (${kb(x.file.size)})`) });
  l.history.push([now(), "Answered: uploaded via upload link"]);
  logAccess({ pid: l.pid, user: m.who.name, role: `External sender, ${m.who.role.toLowerCase()}`, action: "Uploaded result", object: l.facts.map((k) => LABEL[k] || k).join(", "),
    basis: "Upload link: one patient, one request", system: "Upload portal" });
  flash(`${LABEL[l.facts[0]]} received via upload link for ${patient(l.pid).name}; filed to the ${l.from} worklist as unverified`);
}
function onPortal(e) {
  const m = e.data || {}, l = m.token && S.log.find((x) => x.portal?.token === m.token);
  if (!l) return m.t === "portal-hello" && e.source?.postMessage({ t: "portal-req", req: null }, "*");
  if (m.t === "portal-hello") {
    if (l.portal.state === "active" && !l.portal.opened) { l.portal.opened = now(); l.history.push([now(), "Link opened by recipient"]); route(); }
    e.source?.postMessage({ t: "portal-req", req: portalView(l) }, "*");
  }
  if (m.t === "portal-locked" && l.portal.state === "active") { l.portal.state = "locked"; l.history.push([now(), "Revoked: locked after three failed verification attempts"]); route(); }
  if (m.t === "portal-upload" && l.portal.state === "active") receiveUpload(l, m);
}
window.addEventListener("message", onPortal);
if (BC) BC.onmessage = (e) => { if (!document.body.classList.contains("portal")) onPortal(e); };
const toHospital = (m) => { window.opener?.postMessage(m, "*"); BC?.postMessage(m); };

const PS = {};
function portalLookup(token) {
  const local = () => {
    const l = S.log.find((x) => x.portal?.token === token);
    if (l) return portalView(l);
    try { return JSON.parse(localStorage.getItem("six-sys-links") || "{}")[token] || null; } catch { return null; }
  };
  if (!window.opener) { PS.req = local(); BC?.postMessage({ t: "portal-hello", token }); return; }
  const done = (req) => { if (PS.req !== undefined) return; PS.req = req; route(); };
  const t = setTimeout(() => done(local()), 800);
  window.addEventListener("message", (e) => { if (e.data?.t === "portal-req") { clearTimeout(t); done(e.data.req || local()); } });
  window.opener.postMessage({ t: "portal-hello", token }, "*");
}
function renderPortal(token) {
  CTX = { portal: true };
  if (PS.token !== token) { Object.assign(PS, { token, req: undefined, step: "verify", err: "", tries: 0, files: [], uzi: null }); portalLookup(token); }
  const r = PS.req;
  const card = (title, body, foot = "") => `<form class="dlg portal-card" id="pf"><header><b>${title}</b>${r ? `<span class="pt">Request ${esc(r.ref)}</span>` : ""}</header>
    <div class="body">${body}</div>${foot ? `<footer>${foot}</footer>` : ""}</form>`;
  const summary = (full) => `<dl class="kv"><dt>Requested by</dt><dd>${esc(r.from)}</dd><dt>Addressed to</dt><dd>${esc(r.to)}</dd>
    <dt>Patient</dt><dd>${esc(r.initials)}, ${full ? `born ${fmtDate(r.dob)}` : `year of birth ${r.yob}`}</dd>
    <dt>Requested</dt><dd>${esc(r.tests.map((t) => t[1]).join(", "))}${r.date ? `, ${esc(r.date)}` : ""}</dd>${full && r.q ? `<dt>Message</dt><dd>${esc(r.q)}</dd>` : ""}
    <dt>Link valid until</dt><dd>${esc(r.until)}</dd></dl>`;
  const why = !r ? "The link is not recognised." : { used: "A result has already been uploaded with this link.", revoked: "The requesting department has withdrawn this link.",
    expired: `The link expired on ${esc(r.until)}.`, locked: "The link is locked after three failed verification attempts.", closed: "The request has been closed." }[r.state];
  let body;
  if (r === undefined) body = card("Opening link", `<p class="dim">Checking the link…</p>`);
  else if (PS.step === "done") body = card("Result received", `<dl class="kv"><dt>Reference</dt><dd>${esc(r.token)}</dd><dt>Received</dt><dd>${PS.receipt.at}</dd>
      <dt>Uploaded by</dt><dd>${esc(PS.receipt.by)}</dd><dt>Files</dt><dd>${PS.receipt.files.map((x) => `${esc(x.file.name)} · SHA-256 ${x.sha ? esc(x.sha.slice(0, 16)) + "…" : "–"}`).join("<br>") || "None"}</dd>
      ${PS.receipt.values ? `<dt>Values</dt><dd>${esc(PS.receipt.values)}</dd>` : ""}</dl>
      <p>The link is now closed. ${esc(r.from)} has been notified. You can close this window.</p>`, `<button type="button" class="primary" id="pf-close">Close window</button>`);
  else if (why && r.state !== "active") body = card("This link is no longer valid", `<p>${why}</p><p class="dim">Please contact the requesting department${r ? `: ${esc(r.from)}` : ""}.</p>`);
  else if (PS.step === "verify") body = card("Result request", `${summary(false)}
      <div class="field"><span>Identification</span><div>${PS.uzi ? st("DATA", `Signed in with UZI pass: ${PS.uzi.name}, ${PS.uzi.role.toLowerCase()}`)
        : `<button type="button" id="pf-uzi">Sign in with UZI pass (Zorg-ID)</button>`}
        <div class="dim">Healthcare professionals sign in with their UZI pass through the Zorg-ID app, as on hospital referrer portals.</div></div></div>
      <label class="field"><span>Patient's date of birth</span><input type="date" name="dob"></label>
      ${PS.err ? `<div class="field"><span></span><div class="req">${esc(PS.err)}</div></div>` : ""}`, `<button class="primary">Continue</button>`);
  else body = card("Upload result", `${summary(true)}
      <label class="field"><span>Files</span><input type="file" name="files" multiple accept=".pdf,image/*,.hl7,.edi,.dcm,.txt"></label>
      <div class="field"><span></span><div id="pf-files" class="dim">PDF, image, HL7, EDIFACT or DICOM. Each file is checked for malware on arrival.</div></div>
      ${r.tests.map(([k, l, u]) => `<div class="field"><span>${esc(l)}</span><div class="inline" style="margin:0"><input name="v-${k}" inputmode="decimal"> <span class="dim">${esc(u)} · optional: the value as a structured result</span></div></div>`).join("")}
      <div class="field"><span>Uploaded by</span><div>${esc(PS.uzi.name)}, ${esc(PS.uzi.role.toLowerCase())} <span class="dim">· identified by UZI pass</span></div></div>
      <div class="field"><span></span><label><input type="checkbox" name="ok"> I declare that these documents concern the patient identified above and that I am authorised to share them.</label></div>`,
    `<span class="left" id="pf-hint"></span><button class="primary" disabled>Upload</button>`);
  $("#app").innerHTML = `<div class="portal-page"><div class="portal-top"><b>${HOSPITAL}</b><span>Secure result upload</span></div>
    <div class="portal-main">${body}<p class="portal-foot">Single-use link for one patient and one request. Every action on this page is logged (NEN 7513).</p></div></div>`;
  $("#pf-close")?.addEventListener("click", () => window.close());
  const f = $("#pf");
  if (!f || !r || r.state !== "active" || PS.step === "done") return;
  // demo: the UZI pass sign-in succeeds and returns the pass holder (synthetic)
  $("#pf-uzi")?.addEventListener("click", () => { PS.uzi = { name: "A. Smeets", role: "Physician" }; PS.err = ""; route(); });
  if (PS.step === "verify") return f.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!PS.uzi) { PS.err = "Sign in with your UZI pass first."; return route(); }
    if (f.dob.value === r.dob) { PS.step = "upload"; PS.err = ""; return route(); }
    PS.tries++;
    if (PS.tries >= 3) { r.state = "locked"; toHospital({ t: "portal-locked", token: r.token }); }
    PS.err = `Date of birth does not match. ${3 - PS.tries} attempts left.`;
    route();
  });
  const check = () => {
    const vals = r.tests.some(([k]) => f["v-" + k].value.trim()), files = PS.files.length && PS.files.every((x) => x.scan === "Clean");
    const busy = PS.files.some((x) => x.scan !== "Clean");
    $("#pf-hint").textContent = busy ? "Checking files…" : !files && !vals ? "Add a file or enter the value" : !f.ok.checked ? "Confirm the declaration" : "";
    f.querySelector("button.primary").disabled = busy || (!files && !vals) || !f.ok.checked;
  };
  const showFiles = () => {
    $("#pf-files").innerHTML = PS.files.length ? table([["File"], ["Size", "70px", "num"], ["SHA-256", "34%"], ["Check", "104px"]], PS.files.map((x) =>
      `<tr>${tdt(x.file.name)}${td(kb(x.file.size), "num")}${td(x.sha ? esc(x.sha.slice(0, 16)) + "…" : "…", "", x.sha)}${td(x.scan === "Clean" ? st("DATA", "Clean") : st("PICTURE", "Scanning"))}</tr>`)) : "";
    check();
  };
  f.files.addEventListener("change", () => {
    PS.files = [...f.files.files].map((file) => ({ file, sha: "", scan: "Scanning" }));
    showFiles();
    PS.files.forEach(async (x) => {
      try { x.sha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await x.file.arrayBuffer()))].map((b) => b.toString(16).padStart(2, "0")).join(""); } catch { x.sha = ""; }
      setTimeout(() => { x.scan = "Clean"; showFiles(); }, 700);
    });
  });
  f.addEventListener("input", check); f.addEventListener("change", check);
  f.addEventListener("submit", (e) => {
    e.preventDefault();
    const values = Object.fromEntries(r.tests.map(([k]) => [k, f["v-" + k].value.trim()]).filter(([, v]) => v));
    const who = { ...PS.uzi, reg: "UZI pass" };
    toHospital({ t: "portal-upload", token: r.token, files: PS.files.map(({ file, sha }) => ({ file, sha })), values, who });
    try { const all = JSON.parse(localStorage.getItem("six-sys-links") || "{}"); if (all[r.token]) all[r.token].state = "used"; localStorage.setItem("six-sys-links", JSON.stringify(all)); } catch {}
    PS.receipt = { at: now(), by: `${who.name}, ${who.role.toLowerCase()}`, files: PS.files, values: r.tests.filter(([k]) => values[k]).map(([k, l, u]) => `${l}: ${values[k]} ${u}`).join("; ") };
    PS.step = "done";
    route();
  });
}

// ------------------------------------------------------------ data management

function reconRows() {
  const rows = [];
  for (const u of C.unlinked) rows.push({ key: "U|" + u.file, time: fmtTime(u.time), kind: "Unmatched patient", who: u.who, src: "ext_lab", what: "External laboratory report " + docRef(u.file),
    why: "Report received without BSN. No patient match on name and date of birth.", raw: u.raw || u.excerpt, u });
  for (const p of C.patients) for (const f of p.facts)
    if (f.status === "LOST" && f.source === "echo") rows.push({ key: factKey(f), time: fmtTime(f.time), kind: "Illegible measurement", who: p.name, src: f.source, what: label(f), why: remark(f), f });
  return rows.sort((a, b) => b.time.localeCompare(a.time));
}
const convertedRows = () => C.patients.flatMap((p) => p.facts.filter((f) => f.status === "CONFLICT").map((f) => ({ key: factKey(f), time: fmtTime(f.time), who: p.name, f })))
  .sort((a, b) => b.time.localeCompare(a.time));
const inboundRows = () => [...C.patients.flatMap((p) => received(p).filter((r) => r.status !== "Unmatched").map((r) => ({ ...r, key: "R|" + r.pid + "|" + r.item.id }))),
  ...reconRows().filter((r) => r.u).map((r) => ({ key: r.key, time: r.time, from: "Regiolab Zuid", who: r.who, what: r.what, format: "EDIFACT MEDLAB", status: "Unmatched", u: r.u }))]
  .sort((a, b) => b.time.localeCompare(a.time));
const outboundRows = () => [...S.log].sort((a, b) => b.time.localeCompare(a.time));

// Code mappings per sender: local code and unit to LOINC and one UCUM unit, reviewed and versioned like a terminology table.
// Regiolab Zuid's codes and factors come from six-sys (EXT_LAB_CODES); reviewers, dates and specimens are synthetic.
const SPECIMEN = { troponin: "Serum or plasma", creatinine: "Serum", egfr: "Serum (calculated)", glucose: "Plasma", hb: "Whole blood",
  potassium: "Serum or plasma", sodium: "Serum or plasma", nt_probnp: "Serum or plasma", crp: "Serum or plasma", wbc: "Whole blood", platelets: "Whole blood",
  inr: "Platelet-poor plasma", pco2: "Arterial blood", po2: "Arterial blood", uacr: "Urine", hba1c: "Whole blood", calcium: "Serum or plasma",
  phosphate: "Serum or plasma", lithium: "Serum or plasma", digoxin: "Serum or plasma", troponin_i: "Serum or plasma", ck: "Serum or plasma",
  urea: "Serum or plasma", ddimer: "Platelet-poor plasma", mcv: "Whole blood", tsh: "Serum or plasma", ft4: "Serum or plasma", ferritin: "Serum or plasma" };
const EGFR_NOTE = "The sender does not state the eGFR equation. CKD-EPI 2009 and 2021 can differ by more than 10%, so values from two laboratories may not belong on one trend line.";
const NB_LOINC = { nt_probnp: "33763-4" }; // the molar sibling code Heuvelland sends
const MAPS = [
  ...Object.entries(EXT_LAB_CODES).map(([fact, [code, u, factor]]) => ({ src: "ext_lab", sender: "Regiolab Zuid", format: "EDIFACT MEDLAB", code, localUnit: u, fact, factor: String(factor),
    equation: fact === "egfr" ? "Not stated by sender" : "", range: "Sender's reference range, shown as received", status: fact === "egfr" ? "Flagged" : "Approved",
    by: fact === "egfr" ? "" : "Clinical chemist, AZ Zuid", on: fact === "egfr" ? "" : "2026-03-02", version: fact === "egfr" ? 1 : 2, note: fact === "egfr" ? EGFR_NOTE : "" })),
  ...CM_.units.filter((u) => C.fact_defs[u.fact].kind === "lab").map((u) => ({ src: "nb_lab", sender: "Heuvelland Ziekenhuis", format: "HL7 v2 ORU^R01", code: NB_LOINC[u.fact] || C.fact_defs[u.fact].loinc,
    localUnit: u.unit, fact: u.fact, factor: u.op === "÷" ? `1/${u.k}` : String(u.k), equation: "", range: "Sender's reference range, shown as received", status: "Approved",
    by: "Clinical chemist, AZ Zuid", on: "2026-04-14", version: 1, note: "" })),
  ...Object.entries(CM_.nhg).map(([code, fact]) => ({ src: "gp", sender: "General practitioner", format: "HIS export, NHG Tabel 45", code, localUnit: C.fact_defs[fact].unit, fact, factor: "1",
    equation: "", range: "Not sent", status: "Approved", by: "Clinical chemist, AZ Zuid", on: "2026-01-12", version: 1,
    note: C.fact_defs[fact].loinc ? "" : "Point-of-care test: NHG code kept, no LOINC equivalent." })),
  ...Object.entries(LOCAL_LAB).map(([code, fact]) => ({ src: "epic_lab", sender: "AZ Zuid, clinical chemistry", format: "HL7 v2 ORU^R01", code, localUnit: C.fact_defs[fact].unit, fact, factor: "1",
    equation: fact === "egfr" ? "CKD-EPI 2009" : "", range: "Own laboratory's reference range", status: "Approved", by: "Clinical chemist, AZ Zuid", on: "2025-11-18", version: 1, note: "" })),
].map((m, i) => ({ ...m, id: "M" + (i + 1) }));
const factorText = (x) => (x === "1" ? "None: same quantity, unit written to UCUM" : x.startsWith("IFCC") ? `Formula: ${x}` : x.startsWith("1/") ? `÷ ${x.slice(2)}` : `× ${x}`);
const mapOf = (f) => MAPS.find((m) => !m.custom && m.fact === f.fact && m.src === f.source);
const mapNote = (f) => { const m = mapOf(f); return m ? `mapping ${m.id}, version ${m.version}, ${m.status.toLowerCase()}${m.equation && f.fact === "egfr" ? `, equation: ${m.equation}` : ""}` : ""; };
const mapApplied = (m) => m.custom || m.src === "epic_lab" ? [] : convertedRows().filter((r) => r.f.fact === m.fact && r.f.source === m.src);
const mapCount = (m) => m.custom ? 0 : m.src !== "epic_lab" ? mapApplied(m).length : all().filter((f) => f.source === "epic_lab" && f.fact === m.fact).length;
const mapStatus = (m) => (m.status === "Approved" ? st("DATA", "Approved") : st("PICTURE", m.status));
const EQUATIONS = ["CKD-EPI 2009", "CKD-EPI 2021", "Not stated: keep on a separate trend line"];
// Tests a mapping can point at: those with a LOINC code in six-sys's own definitions (no codes invented here).
const MAPPABLE = Object.keys(C.fact_defs).filter((k) => C.fact_defs[k].loinc && LABEL[k]);
function mapDialog() {
  const senders = [...new Set(["AZ Zuid, clinical chemistry", ...DIR.filter((d) => /Laboratory|Hospital|GP/.test(d.type)).map((d) => d.name)])];
  openDialog(`<form class="dlg" id="f-map"><header><b>New code mapping</b><span class="pt">Code and Unit Conversion</span></header><div class="body">
      <label class="field"><span>Sender</span><select name="sender">${senders.map((x) => opt(x, "Regiolab Zuid")).join("")}</select></label>
      <label class="field"><span>Message format</span><select name="format">${["EDIFACT MEDLAB", "HL7 v2 ORU^R01", "FHIR Observation"].map((x) => opt(x)).join("")}</select></label>
      <label class="field"><span>Local code <span class="req">*</span></span><input name="code" required placeholder="As the sender writes it, e.g. TNT or KREAT"></label>
      <label class="field"><span>Local unit <span class="req">*</span></span><input name="localUnit" required placeholder="As received, e.g. ug/L or mg/dl"></label>
      <label class="field"><span>Test</span><select name="fact">${MAPPABLE.map((k) => opt(k, "", LABEL[k])).join("")}</select></label>
      <div class="field"><span></span><div class="dim" id="map-target"></div></div>
      <label class="field"><span>Conversion factor</span><input name="factor" value="1" inputmode="decimal"></label>
      <div class="field"><span></span><div class="dim" id="map-prev"></div></div>
      <label class="field" id="map-eq" hidden><span>Equation</span><select name="equation">${EQUATIONS.map((x) => opt(x)).join("")}</select></label>
      <label class="field"><span>Reference range</span><select name="range">${["Sender's reference range, shown as received", "Own laboratory's reference range"].map((x) => opt(x)).join("")}</select></label>
      <div class="field"><span></span><div class="req" id="map-err"></div></div></div>
    <footer><span class="left">Saved as a draft. It is applied once a clinical chemist approves it.</span><button type="button" data-act="close">Cancel</button><button class="primary">Save draft</button></footer></form>`);
  const f = $("#f-map");
  const show = () => {
    const d = C.fact_defs[f.fact.value], x = Number(String(f.factor.value).replace(",", "."));
    $("#map-target").textContent = `LOINC ${d.loinc} · unit ${unit(d.unit)} (UCUM ${d.unit}) · specimen ${SPECIMEN[f.fact.value] || "not set"}`;
    $("#map-prev").textContent = x > 0 ? `1 ${f.localUnit.value || "local unit"} becomes ${String(x).replace(".", ",")} ${unit(d.unit)}` : "Enter a number above zero";
    $("#map-eq").hidden = f.fact.value !== "egfr";
    const dup = MAPS.find((m) => m.sender === f.sender.value && m.code.toLowerCase() === f.code.value.trim().toLowerCase());
    $("#map-err").textContent = dup ? `${f.sender.value} already has a mapping for ${dup.code}: ${dup.id}` : "";
    f.querySelector("button.primary").disabled = !!dup || !(x > 0);
  };
  f.addEventListener("input", show); f.addEventListener("change", show); show();
  f.addEventListener("submit", (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f)), id = "M" + (Math.max(...MAPS.map((m) => Number(m.id.slice(1)))) + 1);
    MAPS.push({ id, sender: d.sender, format: d.format, code: d.code.trim(), localUnit: d.localUnit.trim(), fact: d.fact, factor: String(Number(d.factor.replace(",", "."))),
      equation: d.fact === "egfr" ? d.equation : "", range: d.range, status: "Draft", by: "", on: "", version: 1, custom: true, created: `User, ${now()}`,
      note: "New mapping. A clinical chemist checks code, unit and factor before it is applied to incoming messages." });
    logAccess({ action: "Drafted code mapping", object: `${d.sender} ${d.code.trim()} → LOINC ${C.fact_defs[d.fact].loinc}`, basis: "Data management" });
    flash(`Mapping ${id} saved as a draft`);
    go(`#/admin/mapping/${id}`);
  });
}
function mapDetail(m) {
  const d = C.fact_defs[m.fact], rows = mapApplied(m);
  const approve = m.status !== "Approved" ? `<div class="block"><h4>Review</h4><p style="margin:0 0 8px">${esc(m.note)}</p>
      ${m.fact === "egfr" ? `<label class="field"><span>Equation</span><select id="m-eq">${EQUATIONS.map((x) => opt(x, m.equation)).join("")}</select></label>` : ""}
      <div class="inline"><button class="primary" data-q-act="map-approve" data-key="${m.id}">Approve mapping</button>
        ${m.status === "Draft" ? `<button data-q-act="map-discard" data-key="${m.id}">Discard draft</button>` : ""}</div></div>` : "";
  return `<div class="block"><dl class="kv"><dt>Mapping</dt><dd>${m.id}, version ${m.version}</dd><dt>Sender</dt><dd>${esc(m.sender)}</dd><dt>Message format</dt><dd>${esc(m.format)}</dd>
      <dt>Local code</dt><dd><code>${esc(m.code)}</code></dd><dt>Local unit</dt><dd><code>${esc(m.localUnit)}</code></dd><dt>Test</dt><dd>${esc(LABEL[m.fact])}</dd>
      <dt>LOINC</dt><dd>${esc(d.loinc || "")}</dd><dt>Specimen</dt><dd>${esc(SPECIMEN[m.fact] || "")}</dd><dt>Unit (UCUM)</dt><dd><code>${esc(d.unit)}</code></dd>
      <dt>Conversion</dt><dd>${factorText(m.factor)}</dd>${m.equation ? `<dt>Equation</dt><dd>${esc(m.equation)}</dd>` : ""}<dt>Reference range</dt><dd>${esc(m.range)}</dd>
      <dt>Equivalence</dt><dd>Equal</dd><dt>Status</dt><dd>${mapStatus(m)}</dd><dt>Reviewed by</dt><dd>${esc(m.by || "Not reviewed")}</dd>
      <dt>Effective from</dt><dd>${esc(m.on || "Not approved")}</dd><dt>Re-review</dt><dd>When the sender changes analyser, method, unit or reference range</dd>
      ${m.note && m.status === "Approved" ? `<dt>Remark</dt><dd>${esc(m.note)}</dd>` : ""}</dl></div>${approve}
    <div class="block"><h4>Applied to</h4>${!m.custom && m.src !== "epic_lab"
      ? table([["Date and time", "152px"], ["Patient", "30%"], ["As received"], ["Result", "26%", "num"]],
          rows.map((r) => `<tr class="row" data-href="#/clinic/${deptOf(patient(r.f.pid))}/${r.f.pid}">${td(r.time)}${tdt(r.who)}${tdt(asReceived(r.f))}${td(`${r.f.got} ${esc(unit(d.unit))}`, "num")}</tr>`))
      : m.custom ? `<p class="dim" style="margin:0">Created by ${esc(m.created)}. ${m.status === "Approved" ? "Applies to messages received from now on." : "Not applied until approved."}</p>`
      : `<p class="dim" style="margin:0">${plural(mapCount(m), "result")} received with this code. No conversion: the code and unit are already LOINC and UCUM.</p>`}</div>`;
}

// ------------------------------------------------------------ text recognition: reading values from images and PDFs
// A profile says what to read, how, and from where: it is attached to a connection or to an institution. The reads
// for the built-in profiles are six-sys's own (Tesseract on burned-in text, or a pattern match in a PDF's text layer),
// with the line it read, its confidence and its box on the image. Thresholds and the fax and scan profiles are ours.
const METHODS = { ocr: "Optical character recognition on burned-in text (Tesseract)", pdf: "Pattern match in the PDF's text layer" };
const ocrFact = (src, facts) => (f) => f.source === src && facts.includes(f.fact) && f.file && !/proprietary|vendor/i.test(f.reason || "");
const RECOG = [
  { id: "T1", name: "Echocardiography measurements on screen captures", hook: { kind: "channel", id: "dicom" }, method: "ocr", doc: "DICOM Secondary Capture, echocardiography",
    facts: ["lvef", "ivs_thickness", "lv_diameter"], min: 60, on: true, match: ocrFact("echo", ["lvef", "ivs_thickness", "lv_diameter"]) },
  { id: "T2", name: "Renal ultrasound measurements on screen captures", hook: { kind: "channel", id: "dicom" }, method: "ocr", doc: "DICOM Secondary Capture, ultrasound",
    facts: ["kidney_length"], min: 60, on: true, match: ocrFact("radiology", ["kidney_length"]) },
  { id: "T3", name: "Radiology reports", hook: { kind: "channel", id: "dicom" }, method: "pdf", doc: "PDF report, radiology",
    facts: ["calcium_score", "nodule_size"], min: null, on: true, match: ocrFact("radiology", ["calcium_score", "nodule_size"]) },
  { id: "T4", name: "Pathology reports", hook: { kind: "institution", id: "Pathologie Limburg Samenwerking" }, method: "pdf", doc: "PDF report, pathology",
    facts: ["path_diagnosis", "tumour_size"], min: null, on: true, match: ocrFact("pathology", ["path_diagnosis", "tumour_size"]) },
  { id: "T5", name: "Faxed results", hook: { kind: "channel", id: "fax" }, method: "ocr", doc: "Fax page", facts: ["troponin_poc"], min: 60, on: true, intake: "fax" },
  { id: "T6", name: "Patient identifiers on scanned documents", hook: { kind: "channel", id: "folder" }, method: "ocr", doc: "Scanned page", facts: [], ids: true, min: 60, on: true, intake: "folder" },
];
const hookName = (h) => (h.kind === "channel" ? chanName(h.id) : h.id);
const hookHref = (h) => (h.kind === "channel" ? `#/admin/channels/${h.id}` : `#/admin/directory/${encodeURIComponent(h.id)}`);
const hookText = (h) => `${h.kind === "channel" ? "Connection" : "Institution"}: ${hookName(h)}`;
const recogFor = (kind, id) => RECOG.filter((t) => t.hook.kind === kind && t.hook.id === id);
// The line the profile read: OCR line for images, the matching sentence for PDFs.
function lineRead(f) {
  const s = [f.reason, ...(f.steps || [])].join("\n"), m = /OCR read: "([^"]+)"|readable value: "([^"]+)"/.exec(s);
  if (m) return m[1] || m[2];
  const x = /PDF text: "([^"]+)"/.exec(f.excerpt || "");
  return x && f.got != null && x[1].includes(String(f.got).replace(/\.0$/, "")) ? x[1] : "";
}
function reads(t) {
  if (t.intake) return S.intake.filter((i) => i.channel === t.intake).map((i) => ({ key: i.key, time: i.time, who: i.pid ? patient(i.pid).name : "–", doc: i.subject,
    field: t.ids ? "BSN, patient number, date of birth" : LABEL[i.fact] || "", line: (i.text.split("\n").find((x) => /Troponin|OCR found/.test(x)) || "").trim(), conf: null,
    value: i.fact ? `${comma(i.value)} ${unit(C.fact_defs[i.fact]?.unit)}` : "", status: i.status === "Open" ? "To file" : i.status, href: `#/clinic/cardiology/intake/${i.key}` }));
  return C.patients.flatMap((p) => p.facts.filter(t.match).map((f) => {
    const it = ITEMS[p.pid].find((x) => x.facts.includes(f)), v = verdict(f), conf = ocrConfidence(f);
    return { key: factKey(f), time: fmtTime(f.time), who: p.name, doc: full(it), field: label(f), line: lineRead(f), conf: conf == null ? null : Number(conf),
      value: f.got == null ? "" : `${TR[f.got] || f.got} ${unit(C.fact_defs[f.fact]?.unit)}`.trim(), status: v === "LOST" ? "Not legible" : v === "DATA" ? "Replaced by structured value" : WORD[v],
      href: `#/clinic/${deptOf(p)}/${p.pid}/all/${it.id}`, f };
  })).sort((a, b) => b.time.localeCompare(a.time));
}
const below = (t, r) => t.min != null && r.conf != null && r.conf < t.min;
const lowCount = (t) => reads(t).filter((r) => below(t, r)).length;
function recogDetail(t) {
  const rs = reads(t), conf = (r) => (r.conf == null ? `<span class="dim">–</span>` : below(t, r) ? st("FAIL", r.conf + "%") : r.conf + "%");
  const hooks = [...CHANNELS.map((c) => ["channel", c.id, `Connection: ${c.name}`]), ...DIR.map((d) => ["institution", d.name, `Institution: ${d.name}`])];
  return `<div class="block"><dl class="kv"><dt>Profile</dt><dd>${esc(t.name)}</dd>
      <dt>Attached to</dt><dd><select data-recog-hook="${t.id}">${hooks.map(([k, id, l]) => `<option value="${k}|${esc(id)}" ${t.hook.kind === k && t.hook.id === id ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></dd>
      <dt>Method</dt><dd>${METHODS[t.method]}</dd><dt>Document type</dt><dd>${esc(t.doc)}</dd>
      <dt>Values read</dt><dd>${esc(t.ids ? "BSN, patient number and date of birth, to find the patient" : t.facts.map((k) => LABEL[k]).join(", "))}</dd>
      <dt>Minimum confidence</dt><dd>${t.min == null ? "Not applicable: the PDF text is exact; the pattern match is what can fail"
        : `<select data-recog-min="${t.id}">${[50, 60, 70, 80, 90].map((x) => `<option ${x === t.min ? "selected" : ""}>${x}</option>`).join("")}</select> %`}</dd>
      <dt>Below the minimum</dt><dd>Filed as unverified with a low-confidence flag; never as a structured result</dd>
      <dt>Not legible</dt><dd>Shown as Not legible in the patient record</dd>
      <dt>Every read</dt><dd>Stays unverified until a person verifies it against the image</dd>
      <dt>Active</dt><dd><label><input type="checkbox" data-recog-on="${t.id}" ${t.on ? "checked" : ""}> ${t.on ? "Reading new documents" : "Off: new documents are filed as images, nothing is read"}</label></dd></dl></div>
    <div class="block"><h4>Reads</h4>${table([["Patient"], ["Read", "28%"], ["Value", "18%", "num"], ["Confidence", "92px", "num"]],
      rs.map((r) => `<tr class="row" data-href="${r.href}">${td(`${esc(r.who)}<br><span class="dim">${esc(r.time)}</span>`)}${td(r.line ? `<code>${esc(r.line)}</code>` : `<span class="dim">–</span>`, "nowrap")}${td(r.value ? esc(r.value) : `<span class="dim">–</span>`, "num nowrap", r.status)}${td(conf(r), "num nowrap")}</tr>`))}</div>`;
}
function recogDialog() {
  const hooks = [...CHANNELS.map((c) => ["channel", c.id, `Connection: ${c.name}`]), ...DIR.map((d) => ["institution", d.name, `Institution: ${d.name}`])];
  const facts = Object.keys(LABEL).filter((k) => C.fact_defs[k]?.unit);
  openDialog(`<form class="dlg" id="f-rec"><header><b>New text recognition profile</b><span class="pt">Text Recognition</span></header><div class="body">
      <label class="field"><span>Name <span class="req">*</span></span><input name="name" required placeholder="e.g. Holter summaries from Heuvelland Ziekenhuis"></label>
      <label class="field"><span>Attached to</span><select name="hook">${hooks.map(([k, id, l]) => `<option value="${k}|${esc(id)}">${esc(l)}</option>`).join("")}</select></label>
      <label class="field"><span>Method</span><select name="method">${Object.entries(METHODS).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label>
      <label class="field"><span>Document type</span><input name="doc" placeholder="e.g. PDF summary, screen capture"></label>
      <div class="field"><span>Values read</span><div>${facts.map((k) => `<label style="display:inline-block;margin:0 14px 4px 0"><input type="checkbox" name="facts" value="${k}"> ${esc(LABEL[k])}</label>`).join("")}</div></div>
      <label class="field"><span>Minimum confidence</span><select name="min">${[50, 60, 70, 80, 90].map((x) => `<option ${x === 60 ? "selected" : ""}>${x}</option>`).join("")}</select></label></div>
    <footer><span class="left">Reads are always filed as unverified until a person verifies them.</span><button type="button" data-act="close">Cancel</button><button class="primary">Add profile</button></footer></form>`);
  $("#f-rec").addEventListener("submit", (e) => {
    e.preventDefault();
    const d = new FormData(e.target), [kind, ...rest] = d.get("hook").split("|"), id = "T" + (RECOG.length + 1);
    RECOG.push({ id, name: d.get("name").trim(), hook: { kind, id: rest.join("|") }, method: d.get("method"), doc: d.get("doc") || "Not documented", facts: d.getAll("facts"),
      min: d.get("method") === "pdf" ? null : Number(d.get("min")), on: true, match: () => false });
    logAccess({ action: "Added text recognition profile", object: `${id} ${d.get("name").trim()}`, basis: "Data management" });
    flash(`Profile ${id} added; it reads new documents from ${hookName(RECOG[RECOG.length - 1].hook)}`);
    go(`#/admin/recog/${id}`);
  });
}
const recogLine = (kind, id) => { const ts = recogFor(kind, id);
  return `<dt>Text recognition</dt><dd>${ts.length ? ts.map((t) => `<a href="#/admin/recog/${t.id}">${t.id} ${esc(t.name)}</a>${t.on ? "" : " (off)"}`).join("<br>") : "None"}</dd>`; };

const ADMIN = {
  overview: { label: "Overview" },
  inbound: { label: "Received" },
  outbound: { label: "Sent" },
  mapping: { label: "Code and Unit Conversion" },
  recog: { label: "Text Recognition" },
  sources: { label: "Department Databases" },
  channels: { label: "Connections" },
  directory: { label: "Institutions" },
  access: { label: "Access Log" },
};

function renderAdmin(tab, key) {
  if (!ADMIN[tab]) tab = "overview";
  const t = ADMIN[tab];
  const tabs = `<nav class="tabs">${Object.entries(ADMIN).map(([k, a]) => `<a href="#/admin/${k}" class="${k === tab ? "on" : ""}" data-tab="${k}">${a.label}</a>`).join("")}</nav>`;
  CTX = { admin: tab };
  if (tab === "overview") {
    CTX.exp = { all: overviewExport() };
    $("#app").innerHTML = `<section class="work admin">${tabs}${overview()}${adminBar()}</section>`;
    return;
  }
  const href = (k) => `#/admin/${tab}/${encodeURIComponent(k)}`;
  const sel = (rows) => rows.find((r) => (r.key || r.id) === key) || rows[0];
  const pick = (S.pick[tab] ||= new Set());
  const row = (r, cur, k, cells) => `<tr class="row ${r === cur || pick.has(k) ? "sel" : ""}" data-href="${href(k)}" data-pick="${esc(k)}" data-q="${esc(line(r).join(" "))}">${cells}</tr>`;
  let list, detail, rows, cur, cols, line;

  if (tab === "sources") {
    rows = DBS; cur = sel(rows);
    const pr = new Map(rows.map((d) => [d, d.rows ? profile(d) : null]));
    cols = ["Name", "Type", "Owner", "Connection", "Schedule", "Rows", "Matched", "No patient match", "Duplicates", "Not parsed", "Differs from received value", "New structured values", "Last sync"];
    line = (d) => { const x = pr.get(d) || {}; return [d.name, d.kind, d.owner, d.conn, d.schedule, x.rows ?? "", x.matched ?? "", x.nomatch ?? "", x.dup ?? "", x.bad ?? "", x.diff ?? "", x.upd ?? "", d.synced]; };
    list = table([["Status", "112px"], ["Name"], ["Type", "24%", "", 3], ["Rows", "64px", "num", 2], ["Matched", "76px", "num", 3], ["Issues", "64px", "num"], ["Last sync", "160px", "", 2]],
      rows.map((d) => { const x = pr.get(d), iss = x ? x.nomatch + x.dup + x.bad + x.diff : 0;
        return row(d, cur, d.id, `${td(S.off[d.id] ? st("PICTURE", "Paused") : st("DATA", "Connected"))}${tdt(d.name)}${tdt(d.kind)}${td(x ? x.rows : "–", "num")}${td(x ? x.matched : "–", "num")}${td(iss ? st("PICTURE", iss) : "", "num")}${tdt(d.synced)}`); }));
    detail = cur && sourceDetail(cur, pr.get(cur));
  } else if (tab === "channels") {
    rows = CHANNELS; cur = sel(rows);
    const stat = (c) => { const ms = c.msgs ? c.msgs() : [], er = c.errors ? c.errors() : [];
      return { n: c.msgs ? ms.length + er.length : "–", q: c.intake ? ms.filter((x) => x.status === "Open").length : 0, e: er.length, last: [...ms, ...er].map((x) => x.time).sort().pop() || "" }; };
    cols = ["Status", "Name", "Type", "Direction", "Scope", "Source", "Default route", "Environment", "Certificate valid until", "Certificate issue", "Received", "Queued", "Errors", "Last message"];
    line = (c) => { const x = stat(c), k = CERTS[c.cert]; return [chanState(c), c.name, c.type, c.dir, c.scope, c.source, c.route, c.env || "", k?.until || "", certIssue(k), x.n, x.q, x.e, x.last]; };
    const certCell = (c) => { const k = CERTS[c.cert], i = certIssue(k); return !k ? td("") : i ? td(st("PICTURE", k.until), "", i) : td(k.until); };
    list = table([["Status", "116px"], ["Name"], ["Scope", "84px", "", 3], ["Certificate", "124px", "", 2], ["Received", "76px", "num", 2], ["Queued", "68px", "num", 3], ["Errors", "68px", "num"], ["Last message", "140px", "", 3]],
      rows.map((c) => { const x = stat(c), s0 = chanState(c);
        return row(c, cur, c.id, `${td(s0 === "Started" ? st("DATA", s0) : st("PICTURE", s0))}${tdt(c.name)}${td(c.scope || "")}${certCell(c)}${td(x.n, "num")}${td(x.q || "", "num")}${td(x.e ? st("LOST", x.e) : "", "num")}${td(x.last)}`); }));
    detail = cur && channelDetail(cur);
  } else if (tab === "directory") {
    rows = DIR.map((d) => ({ key: d.name, d })); cur = sel(rows);
    cols = ["Name", "Type", "Department", "AGB code", "URA number", "Preferred channel", "Status", "Verification", "Expires"];
    line = ({ d }) => [d.name, d.type, d.dept, d.agb, d.ura, d.channel, d.status, d.verified, d.expires || ""];
    list = table([["Name"], ["Type", "19%", "", 3], ["Preferred channel", "210px", "", 2], ["Status", "120px"]],
      rows.map((r) => row(r, cur, r.key, `${tdt(r.d.name)}${tdt(r.d.type)}${tdt(r.d.channel)}${td(dirStatus(r.d), "", r.d.status)}`)));
    detail = cur && dirDetail(cur.d);
  } else if (tab === "outbound") {
    rows = outboundRows(); cur = sel(rows);
    cols = ["Date and time", "Type", "Sender", "Recipient", "Patient", "Content", "Message format", "Channel", "Clinical question or message", "Legal basis", "Acknowledgement", "Status"];
    line = (l) => [l.time, KIND[l.kind], l.from, l.to, l.pid ? patient(l.pid).name : l.who, l.what.join("; "), l.format, l.channel || "", l.q || "", basisOf(l), ackOf(l), lastStatus(l)];
    list = table([["Date and time", "140px"], ["Type", "120px", "", 3], ["Recipient"], ["Patient", "200px"], ["Acknowledgement", "130px", "", 2], ["Status", "116px", "", 4]],
      rows.map((l) => row(l, cur, l.id, `${td(l.time)}${td(KIND[l.kind])}${tdt(l.to)}${tdt(l.pid ? patient(l.pid).name : l.who)}${flagCell(ackOf(l))}${td(statusCell(/^(Not sent|[^ :]+)/.exec(lastStatus(l))[1]), "", lastStatus(l))}`)));
    detail = cur && outboundDetail(cur);
  } else if (tab === "inbound") {
    rows = inboundRows(); cur = sel(rows);
    const ack = (r) => ackIn(r.item || { format: r.format }, r.from);
    cols = ["Date and time", "Sender", "Patient", "Document", "Message format", "Acknowledgement", "Status"];
    line = (r) => [r.time, r.from, r.who, r.what, r.format, ack(r), r.status];
    list = table([["Date and time", "140px"], ["Sender", "200px", "", 4], ["Patient", "180px"], ["Document"], ["Acknowledgement", "130px", "", 3], ["Status", "116px", "", 2]],
      rows.map((r) => row(r, cur, r.key, `${td(r.time)}${tdt(r.from)}${r.status === "Unmatched" ? td(st("LOST", "No patient match"), "", "Report: " + r.who) : tdt(r.who)}${tdt(r.what)}${flagCell(ack(r))}${td(r.status === "Unmatched" ? st("LOST", "Unmatched") : esc(r.status), "", r.status)}`)));
    detail = cur && (cur.u ? reconDetail(reconRows().find((x) => x.key === cur.key)) : docDetail(cur.item, true));
  } else if (tab === "recog") {
    rows = RECOG; cur = sel(rows);
    cols = ["Profile", "Name", "Attached to", "Method", "Document type", "Values read", "Minimum confidence", "Active", "Reads", "Below threshold"];
    line = (t) => [t.id, t.name, hookText(t.hook), METHODS[t.method], t.doc, t.ids ? "Patient identifiers" : t.facts.map((k) => LABEL[k]).join(", "), t.min ?? "", t.on ? "Yes" : "No", reads(t).length, lowCount(t)];
    list = table([["Active", "70px"], ["Profile"], ["Attached to", "230px", "", 2], ["Method", "110px", "", 3], ["Reads", "70px", "num"], ["Below threshold", "130px", "num"]],
      rows.map((t) => { const lo = lowCount(t);
        return row(t, cur, t.id, `${td(`<input type="checkbox" data-recog-on="${t.id}" ${t.on ? "checked" : ""}>`)}${tdt(t.name)}${tdt(hookText(t.hook))}${td(t.method === "ocr" ? "Image (OCR)" : "PDF text")}${td(reads(t).length, "num")}${td(lo ? st("FAIL", lo) : "", "num")}`); }));
    detail = cur && recogDetail(cur);
  } else if (tab === "access") {
    rows = [...S.access].sort((a, b) => b.time.localeCompare(a.time)); cur = sel(rows);
    const pname = (x) => (x.pid ? patient(x.pid).name : x.who || "–");
    cols = ["Date and time", "User", "Role", "Patient", "BSN", "Action", "Object", "Basis", "System", "Request ID"];
    line = (x) => [x.time, x.user, x.role, pname(x), x.pid ? patient(x.pid).bsn : "", x.action, x.object, x.basis, x.system, x.req];
    list = table([["Date and time", "140px"], ["User", "120px", "", 2], ["Role", "140px", "", 3], ["Patient", "180px"], ["Action", "200px"], ["Object", "", "", 2], ["Basis", "140px", "", 3]],
      rows.map((x) => row(x, cur, x.id, `${td(x.time)}${tdt(x.user)}${tdt(x.role)}${tdt(pname(x))}${flagCell(x.action)}${tdt(x.object)}${flagCell(x.basis)}`)));
    detail = cur && accessDetail(cur, rows);
  } else {
    rows = MAPS; cur = sel(rows);
    cols = ["Mapping", "Version", "Sender", "Message format", "Local code", "Local unit", "Test", "LOINC", "Specimen", "UCUM unit", "Conversion", "Equation", "Reference range", "Status", "Reviewed by", "Effective from", "Results"];
    line = (m) => [m.id, m.version, m.sender, m.format, m.code, m.localUnit, LABEL[m.fact], C.fact_defs[m.fact].loinc || "", SPECIMEN[m.fact], C.fact_defs[m.fact].unit, factorText(m.factor), m.equation, m.range, m.status, m.by, m.on, mapCount(m)];
    list = table([["Status", "110px"], ["Sender", "224px"], ["Local code", "96px", "", 2], ["Test"], ["LOINC", "84px", "", 3], ["Unit", "190px", "", 2], ["Results", "76px", "num", 3]],
      rows.map((m) => row(m, cur, m.id, `${td(mapStatus(m), "", m.status)}${tdt(m.sender)}${td(`<code>${esc(m.code)}</code>`)}${tdt(LABEL[m.fact])}${td(C.fact_defs[m.fact].loinc || "")}${tdt(m.localUnit === C.fact_defs[m.fact].unit ? unit(m.localUnit) : `${m.localUnit} → ${unit(C.fact_defs[m.fact].unit)}`)}${td(mapCount(m), "num")}`)));
    detail = cur && mapDetail(cur);
  }
  const keyOf = (r) => r.key || r.id;
  const chosen = pick.size ? rows.filter((r) => pick.has(keyOf(r))) : cur ? [cur] : [];
  CTX.exp = { all: [cols, ...rows.map(line)], sel: chosen.length ? [cols, ...chosen.map(line)] : null, n: chosen.length };
  $("#app").innerHTML = `<section class="work admin">${tabs}<div class="split"><div class="pane list">${phead(t.label, "", filterBox("admin-" + tab))}${list}</div>
    <div class="pane detail">${detail || `<p class="empty">None</p>`}</div></div>${adminBar()}</section>`;
}

function adminBar() {
  const e = CTX.exp;
  const add = { sources: ["new-db", "Connect database"], directory: ["new-dir", "Register institution"], channels: ["new-chan", "Add connection"], recog: ["new-recog", "New profile"], mapping: ["new-map", "New mapping"] }[CTX.admin];
  return `<div class="actions">
    ${add ? `<button data-act="${add[0]}">${add[1]} <kbd>N</kbd></button>` : ""}
    <button data-act="export-sel" ${e.sel ? "" : "disabled"}>Export selected${e.n > 1 ? ` (${e.n})` : ""} <kbd>E</kbd></button>
    <button data-act="export-all">Export all <kbd>Shift E</kbd></button>
    <span class="spacer"></span>
    <span class="status">${esc(S.flash || (CTX.admin === "overview" ? "Export all: both overview tables" : "Ctrl+click to select several rows"))}</span></div>`;
}
// CSV for Excel in a Dutch locale: semicolon separator, UTF-8 with BOM.
function exportCsv(table, scope) {
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = "\uFEFF" + table.map((r) => r.map(cell).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `demo_${CTX.admin}_${scope}_${now().replace(/[-: ]/g, "").slice(0, 12)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  logAccess({ action: "Exported data", object: `${a.download}, ${plural(table.length - 1, "row")}`, basis: "Data management" });
  flash(`Exported ${plural(table.length - 1, "row")} to ${a.download}`);
}
function overviewExport() {
  const cols = ["Group", "Name", "Results", "Structured", "Converted", "Unverified", "Not received"];
  const row = (g, name, rows) => [g, name, rows.length, ...["DATA", "CONFLICT", "PICTURE", "LOST"].map((v) => rows.filter((f) => (v === "DATA" ? ["DATA", "CONFIRMED"] : [v]).includes(verdict(f))).length)];
  return [cols, ...Object.entries(SOURCE).map(([k, s]) => row("Source", s.label, all().filter((f) => f.source === k))),
    ...Object.values(DEPTS).map((d) => row("Department", d.label, C.patients.filter((p) => p.path === d.path).flatMap((p) => p.facts)))];
}

function overview() {
  const n = (rows, v) => rows.filter((f) => verdict(f) === v).length;
  const counts = (rows) => ({ DATA: rows.filter((f) => ["DATA", "CONFIRMED"].includes(verdict(f))).length, CONFLICT: n(rows, "CONFLICT"), PICTURE: n(rows, "PICTURE"), LOST: n(rows, "LOST") });
  const refs = S.log.filter((l) => l.kind === "send"), reqs = S.log.filter((l) => l.kind === "request");
  const bar = (c, total) => `<div class="bar">${Object.entries(c).filter(([, v]) => v).map(([k, v]) => `<i class="${k}" style="flex:${v}" title="${WORD[k]}: ${v} (${pct(v, total)})"></i>`).join("")}</div>`;
  const cells = (c) => ["DATA", "CONFLICT", "PICTURE", "LOST"].map((k) => td(c[k] || `<span class="dim">0</span>`, "num")).join("");
  const srcRows = Object.entries(SOURCE).map(([k, s]) => {
    const rows = all().filter((f) => f.source === k), c = counts(rows);
    return `<tr>${tdt(s.label)}${tdt(s.sender)}${tdt(s.format)}${td(rows.length, "num")}${td(bar(c, rows.length))}${cells(c)}</tr>`;
  });
  const deptRows = Object.entries(DEPTS).map(([k, d]) => {
    const pts = C.patients.filter((p) => p.path === d.path), rows = pts.flatMap((p) => p.facts), c = counts(rows), mine = (l) => l.pid && deptOf(patient(l.pid)) === k;
    return `<tr class="row" data-href="#/clinic/${k}">${tdt(d.label)}${td(pts.length, "num")}${td(rows.length, "num")}${td(bar(c, rows.length))}${cells(c)}${td(refs.filter(mine).length, "num")}${td(reqs.filter(mine).length, "num")}</tr>`;
  });
  const legend = `<div class="legend">${["DATA", "CONFLICT", "PICTURE", "LOST"].map((k) => st(k)).join("")}</div>`;
  const statusCols = [["Structured", "8%", "num"], ["Converted", "8%", "num"], ["Unverified", "8%", "num"], ["Not received", "8%", "num"]];
  return `
    <div class="split"><div class="pane full">
      ${phead("Results by source", "", legend)}
      ${table([["Source", "15%"], ["Sender"], ["Message format", "15%"], ["Results", "7%", "num"], ["Composition", "14%"], ...statusCols], srcRows)}
      ${phead("Results by department")}
      ${table([["Department"], ["Patients", "7%", "num"], ["Results", "7%", "num"], ["Composition", "14%"], ...statusCols, ["Referrals", "8%", "num"], ["Requests", "8%", "num"]], deptRows)}
    </div></div>`;
}

function reconDetail(r) {
  const done = S.resolved[r.key], likely = r.u && C.patients.find((p) => r.who.startsWith(p.name + ","));
  const action = done ? `<div>${esc(done)}</div><div class="inline"><button data-q-act="reopen" data-key="${esc(r.key)}">Reopen</button></div>`
    : r.u ? `${likely ? `<div class="field"><span>Probable match</span><div>${esc(likely.name)} · ${fmtDate(likely.dob)} · ${likely.mrn}<br><span class="dim">Same name; the date of birth on the report differs (${esc(r.who.split("born ")[1] || "")}).</span></div></div>` : ""}
        <label class="field"><span>Match to patient</span><select id="q-link">${C.patients.filter((p) => p.path === "kidney").map((p) => `<option value="${p.pid}" ${p === likely ? "selected" : ""}>${esc(p.family)}, ${esc(p.given)} · ${fmtDate(p.dob)}</option>`).join("")}</select></label>
        <div class="inline"><button class="primary" data-q-act="link" data-key="${esc(r.key)}">Match</button>
          <button data-q-act="ask" data-key="${esc(r.key)}">Request again</button>
          <button data-q-act="reject" data-key="${esc(r.key)}">Reject message</button></div>${S.asked[r.key] ? `<p class="note dim">${esc(S.asked[r.key])}</p>` : ""}`
    : `<div class="inline" style="margin-top:0">Manual entry <input id="q-val"> ${esc(unit(C.fact_defs[r.f.fact].unit))} <button class="primary" data-q-act="enter" data-key="${esc(r.key)}">Save</button></div>`;
  return `
    <div class="block"><dl class="kv"><dt>Sender</dt><dd>${esc(SOURCE[r.src].sender)}</dd><dt>Message format</dt><dd>${esc(SOURCE[r.src].format)}</dd>
      <dt>Received</dt><dd>${r.time}</dd><dt>Subject</dt><dd>${esc(r.what)}</dd><dt>Remark</dt><dd>${esc(r.why)}</dd></dl></div>
    <div class="block"><h4>Resolution</h4>${action}</div>
    ${viewer(r.f)}
    ${r.raw ? `<div class="block"><h4>Source message</h4><pre class="raw">${esc(r.raw)}</pre></div>` : ""}`;
}

function accessDetail(x, rows) {
  const p = x.pid && patient(x.pid), same = rows.filter((y) => y !== x && (x.pid ? y.pid === x.pid : y.user === x.user)).slice(0, 30);
  return `<div class="block"><dl class="kv"><dt>Date and time</dt><dd>${x.time}</dd><dt>User</dt><dd>${esc(x.user)}</dd><dt>Role</dt><dd>${esc(x.role)}</dd>
      <dt>Patient</dt><dd>${p ? `${esc(p.name)} · BSN ${p.bsn} · ${p.mrn}` : esc(x.who || "None: no patient data")}</dd><dt>Action</dt><dd>${esc(x.action)}</dd><dt>Object</dt><dd>${esc(x.object)}</dd>
      <dt>Basis</dt><dd>${esc(x.basis)}${BASIS_WHY[x.basis] ? `<br><span class="dim">${esc(BASIS_WHY[x.basis])}</span>` : ""}</dd><dt>System</dt><dd>${esc(x.system)}</dd><dt>Request ID</dt><dd><code>${x.req}</code></dd></dl></div>
    <div class="block"><h4>${x.pid ? "Other entries for this patient" : "Other entries by this user"}</h4>${table([["Date and time", "140px"], ["User", "26%"], ["Action"]],
      same.map((y) => `<tr class="row" data-href="#/admin/access/${y.id}">${td(y.time)}${tdt(y.user)}${tdt(y.action)}</tr>`))}
      <p class="dim" style="margin:8px 0 0">A patient may ask who viewed their data: select their entries and export (E). Viewing and exporting this log is logged as well.</p></div>`;
}

function outboundDetail(l) {
  const p = l.pid && patient(l.pid);
  return `
    <div class="block"><dl class="kv"><dt>Patient</dt><dd>${esc(p ? `${p.name} · ${fmtDate(p.dob)} · ${p.mrn}` : l.who)}</dd><dt>Sender</dt><dd>${esc(l.from)}</dd><dt>Recipient</dt><dd>${esc(l.to)}</dd>
      <dt>Message format</dt><dd>${esc(l.format)}</dd>${l.channel ? `<dt>Channel</dt><dd>${esc(l.channel)}</dd>` : ""}
      <dt>${l.kind === "send" ? "Clinical question" : "Message"}</dt><dd>${esc(l.q || "")}</dd>
      <dt>Legal basis</dt><dd>${esc(basisOf(l))}<br><span class="dim">${esc(BASIS_WHY[basisOf(l)])}</span></dd>
      <dt>Acknowledgement</dt><dd>${esc(ackOf(l))}</dd></dl></div>
    ${linkBlock(l)}
    <div class="block"><h4>${{ send: "Enclosures", request: "Requested", share: "Made available" }[l.kind]}</h4>${table([["Document"]], l.what.map((w) => `<tr>${tdt(w)}</tr>`))}</div>
    <div class="block"><h4>Status history</h4>${table([["Date and time", "152px"], ["Status"]], l.history.map(([t, s]) => `<tr>${td(t)}${td(statusCell(s), "", s)}</tr>`))}</div>`;
}

// ------------------------------------------------------------ events

document.addEventListener("mousedown", (e) => { if (e.detail > 1 && e.target.closest(".grid, .phead, .tabs, .side")) e.preventDefault(); });
document.addEventListener("click", (e) => {
  if (!e.target.closest("pre, dd, input, textarea")) window.getSelection()?.removeAllRanges();
  const t = e.target.closest("[data-act],[data-href],[data-fact],[data-q-act]");
  if (!t || e.target.closest("input, select")) return;
  if (t.dataset.act) { e.preventDefault(); return act(t.dataset.act, t.dataset.arg); }
  if (t.dataset.fact) { S.sel.fact = t.dataset.fact; return route(); }
  if (t.dataset.pick && (e.ctrlKey || e.metaKey) && CTX?.admin) {
    const p = S.pick[CTX.admin], k = t.dataset.pick;
    if (!p.size) { const cur = document.querySelector(".pane.list tr.sel[data-pick]"); if (cur) p.add(cur.dataset.pick); }
    p.has(k) ? p.delete(k) : p.add(k);
    return route();
  }
  if (t.dataset.pick && CTX?.admin) S.pick[CTX.admin].clear();
  if (t.dataset.href) { S.sel.fact = null; return go(t.dataset.href); }
  if (t.dataset.qAct) return reconAct(t.dataset.qAct, t.dataset.key);
});
document.addEventListener("change", (e) => {
  const t = RECOG.find((x) => [e.target.dataset?.recogOn, e.target.dataset?.recogMin, e.target.dataset?.recogHook].includes(x.id));
  if (!t) return;
  if (e.target.dataset.recogOn) { t.on = e.target.checked; return flash(`${t.name}: ${t.on ? "on" : "off"}`); }
  if (e.target.dataset.recogMin) { t.min = Number(e.target.value); return flash(`${t.name}: minimum confidence ${t.min}%, ${plural(lowCount(t), "read")} below it`); }
  const [kind, ...rest] = e.target.value.split("|");
  t.hook = { kind, id: rest.join("|") };
  logAccess({ action: "Attached text recognition profile", object: `${t.name} to ${hookText(t.hook)}`, basis: "Data management" });
  flash(`${t.name} attached to ${hookText(t.hook)}`);
});
$("#dialog").addEventListener("click", (e) => { if (e.target.id === "dialog") closeDialog(); });

function act(a, arg) {
  if (a === "close") return closeDialog();
  const l = arg && S.log.find((x) => x.id === arg);
  if (a === "portal") return openPortal(arg);
  if (a === "recv") return recipientView(l);
  if (a === "revoke") { l.portal.state = "revoked"; l.history.push([now(), "Revoked: upload link withdrawn"]); return flash("Upload link revoked"); }
  if (a === "relink") { l.portal = newLink(now()); l.history.push([now(), "New upload link sent; sign-in with UZI pass"]); publishLink(l); return flash(`New upload link sent to ${l.to}`); }
  if (a === "new-db") { W = null; return dbDialog(); }
  if (a === "new-dir") return contactDialog();
  if (a === "new-chan") return channelDialog();
  if (a === "new-recog") return recogDialog();
  if (a === "new-map") return mapDialog();
  if (a === "export-sel" && CTX?.exp?.sel) return exportCsv(CTX.exp.sel, "selected");
  if (a === "export-all" && CTX?.exp) return exportCsv(CTX.exp.all, "all");
  if (!CTX?.p) return;
  if (a === "send") sendDialog();
  if (a === "add") addDialog();
  if (a === "request" && requestable(CTX.p).length) requestDialog();
  if (a === "confirm") confirmValue();
}
function reconAct(a, key) {
  const i = S.intake.find((x) => x.key === key), db = DBS.find((x) => x.id === key), c = CHANNELS.find((x) => x.id === key), d = dirOf(key);
  if (a.startsWith("cert-") && !CERTS[key]) return;
  if (a === "i-file") {
    const pid = $("#i-pid").value; if (!pid) return $("#i-pid").focus();
    fileResult(pid, { fact: i.fact, value: $("#i-val")?.value, via: chanName(i.channel), by: "User, To file", origin: i.from, title: i.title, upload: scanFile(i) || undefined });
    Object.assign(i, { pid, status: "Filed" });
    logAccess({ pid, action: "Filed document", object: i.subject, basis: "Treatment relationship", system: chanName(i.channel) });
    return flash(`Filed to ${patient(pid).name}; routed to the ${DEPTS[deptOf(patient(pid))].label} worklist`);
  }
  if (a === "i-reject") { i.status = "Rejected"; return route(); }
  if (a === "ask") return askAgain(key);
  if (a === "i-dir") return contactDialog({ name: i.from, email: i.email, type: "GP practice" });
  if (a === "db-test") return flash(`Connection to ${db.name} succeeded. Account has read rights only.`);
  if (a === "db-sync") { if (db.rows) db.synced = "Today " + now().slice(11); return flash(db.rows ? `${db.name} synchronised: ${plural(db.rows().length, "row")} read` : "First sync scheduled"); }
  if (a === "db-apply") return applyDb(db);
  if (a === "ch-toggle") { S.off[key] = !S.off[key]; return flash(`${c.name} ${S.off[key] ? "paused; messages queue at the sender" : "started"}`); }
  if (a === "ch-test") return flash(`${c.name}: connection test passed`);
  if (a === "ch-step") {
    const i = c.onboard.findIndex((x) => x.state !== "Done");
    Object.assign(c.onboard[i], { state: "Done", date: now().slice(0, 10) });
    if (c.onboard[i + 1]) c.onboard[i + 1].state = "In progress";
    return flash(`${c.name}: ${c.onboard[i].step.toLowerCase()}${onboarding(c) ? "" : "; connection started"}`);
  }
  if (a === "map-discard") {
    const m = MAPS.find((x) => x.id === key);
    MAPS.splice(MAPS.indexOf(m), 1);
    logAccess({ action: "Discarded draft code mapping", object: `${m.sender} ${m.code}`, basis: "Data management" });
    flash(`Draft ${m.id} discarded`);
    return go("#/admin/mapping");
  }
  if (a === "cert-g4") { CERTS[key].g4 = true; return flash(`G4 CA certificates loaded for ${CERTS[key].subject}`); }
  if (a === "cert-renew") { Object.assign(CERTS[key], { renew: true, note: `Renewal requested ${now().slice(0, 10)}, User` }); return flash(`Renewal requested for ${CERTS[key].subject}`); }
  if (a === "map-approve") {
    const m = MAPS.find((x) => x.id === key), eq = $("#m-eq")?.value ?? m.equation;
    Object.assign(m, { status: "Approved", equation: eq, by: "User", on: now().slice(0, 10), version: m.status === "Draft" ? m.version : m.version + 1,
      note: eq.startsWith("Not stated") ? "Approved without an equation: values from this sender stay on a separate trend line." : "" });
    logAccess({ action: "Approved code mapping", object: `${m.sender} ${m.code}, version ${m.version}`, basis: "Data management" });
    return flash(`Mapping ${m.id} approved, version ${m.version}`);
  }
  if (a === "dir-verify") { Object.assign(d, { status: d.status === "Temporary" ? "Temporary" : "Verified", verified: `Confirmed by telephone call-back, ${now()}, User` }); return flash(`${d.name} verified`); }
  if (a === "dir-perm") { Object.assign(d, { status: /Not verified/.test(d.verified) ? "Unverified" : "Verified", expires: "", remark: "" }); return flash(`${d.name} is now a permanent contact`); }
  if (a === "reopen") delete S.resolved[key];
  else if (a === "link") {
    const pid = $("#q-link").value, file = key.replace(/^U\|/, "");
    S.resolved[key] = "Matched to " + patient(pid).name;
    for (const f of patient(pid).facts) if (f.file === file && f.status === "LOST" && f.truth_value != null) Object.assign(f, { status: "CONFLICT", got: f.truth_value });
    logAccess({ pid, action: "Matched report to patient", object: docRef(file) });
  }
  else if (a === "reject") S.resolved[key] = "Message rejected";
  else if (a === "enter") {
    const v = $("#q-val").value.trim(); if (!v) return $("#q-val").focus();
    const r = reconRows().find((x) => x.key === key);
    S.resolved[key] = `Manual entry: ${v} ${unit(C.fact_defs[r.f.fact].unit)}`;
  }
  route();
}

document.addEventListener("keydown", (e) => {
  const lb = $("#lightbox");
  if (lb) {
    if (e.key === "Escape" || e.key.toLowerCase() === "f") lb.remove();
    if (e.key.toLowerCase() === "m" && $("[data-marking]", lb)) { const c = $("[data-marking]", lb); c.checked = !c.checked; lb.classList.toggle("nomark", !c.checked); }
    return;
  }
  if (!$("#dialog").hidden) { if (e.key === "Escape") closeDialog(); return; }
  if (e.target.matches?.("input, textarea, select")) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === "d" && !CTX?.portal) { e.preventDefault(); return demoPanel(); }
  if (k === "f" && $("#app .viewer [data-expand]")) { e.preventDefault(); return expandViewer($("#app .viewer")); }
  if (k === "n" && CTX?.admin) { const a = { sources: "new-db", directory: "new-dir", channels: "new-chan", recog: "new-recog", mapping: "new-map" }[CTX.admin]; if (a) { e.preventDefault(); return act(a); } }
  if (k === "e" && CTX?.admin) { e.preventDefault(); return act(e.shiftKey ? "export-all" : "export-sel"); }
  if (["s", "a", "r", "v"].includes(k) && CTX?.p) { e.preventDefault(); return act({ s: "send", a: "add", r: "request", v: "confirm" }[k]); }
  if ((k === "[" || k === "]") && CTX?.pts) {
    const i = CTX.pts.indexOf(CTX.p), n = CTX.pts[(i + (k === "]" ? 1 : -1) + CTX.pts.length) % CTX.pts.length];
    return go(`#/clinic/${CTX.dept}/${n.pid}`);
  }
  if (k === "arrowdown" || k === "arrowup") {
    e.preventDefault();
    const rows = [...document.querySelectorAll(".pane.list tr.row, .pane.full tr.row")];
    const i = rows.findIndex((r) => r.classList.contains("sel"));
    const next = rows[Math.max(0, Math.min(rows.length - 1, i + (k === "arrowdown" ? 1 : -1)))];
    if (!next) return;
    if (CTX?.p || CTX?.queue || (CTX?.admin && CTX.admin !== "overview")) { S.sel.fact = null; go(next.dataset.href); }
    else rows.forEach((r) => r.classList.toggle("sel", r === next));
  }
  if (k === "enter") { const r = document.querySelector(".pane.full tr.sel[data-href]"); if (r) go(r.dataset.href); }
});
// ------------------------------------------------------------ demo panel (key D): applied by reloading with the settings in the URL, so a scene is one URL

function demoPanel() {
  const p = CTX?.p, f = CTX?.it && (CTX.it.facts.find((x) => factKey(x) === S.sel.fact) || CTX.it.facts[0]), cur = Q.get("s") || "";
  const same = f ? patient(f.pid).facts.filter((x) => x.fact === f.fact && x.source === f.source) : [];
  const key = f && `${f.pid}.${f.fact}.${f.source}${same.length > 1 ? "." + (same.indexOf(f) + 1) : ""}`, num = f && typeof (f.truth_value ?? 0) === "number";
  openDialog(`<form class="dlg demo" id="f-demo"><header><b>Demo scenario</b><span class="pt">${esc(cur || "Live data")}</span></header><div class="body">
      <label class="field"><span>Scenario</span><select name="s">${[...Object.keys(window.SCENARIOS || {}), "custom"].map((x) => opt(x, cur || "default")).join("")}</select></label>
      <label class="field"><span>Opening patient</span><select name="p">${C.patients.map((x) => opt(x.pid, (p || LEAD).pid, `${x.family}, ${x.given}`)).join("")}</select></label>
      ${p ? `<label class="field"><span>Patient name</span><input name="name" value="${esc(`${p.given} ${p.family}`)}"></label>` : ""}
      ${num ? `<div class="field"><span>${esc(label(f))}</span><div class="inline" style="margin:0"><input name="v" value="${f.truth_value ?? ""}" inputmode="decimal" size="8">
        <span class="dim">${esc(unit(C.fact_defs[f.fact]?.unit))}</span><select name="st">${["DATA", "CONFLICT", "PICTURE", "LOST"].map((x) => opt(x, f.status, WORD[x])).join("")}</select></div></div>` : ""}
      <label class="field"><span>Clock</span><input name="t" value="${esc(CLOCK)}" placeholder="Wall clock"></label></div>
    <footer><span class="left">Reloads with the scene in the URL.</span><button type="button" data-act="close">Cancel</button><button class="primary">Apply</button></footer></form>`);
  $("#f-demo").addEventListener("submit", (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target)), u = new URLSearchParams({ s: d.s }), keep = d.s === cur; // another scenario drops the earlier edits
    const had = (k, pre) => keep && Q.getAll(k).some((x) => x.startsWith(pre));
    if (keep) for (const k of ["set", "name"]) for (const x of Q.getAll(k)) if (!x.startsWith((k === "set" ? key + "=" : p?.pid + ".") || "\0")) u.append(k, x);
    if (num && (had("set", key + "=") || d.v !== String(f.truth_value ?? "") || d.st !== f.status)) u.append("set", `${key}=${d.v}:${d.st}`);
    if (p && (had("name", p.pid + ".") || d.name.trim() !== `${p.given} ${p.family}`)) u.append("name", `${p.pid}.${d.name.trim()}`);
    if (d.p !== (patient(SC.patient) || C.patients[0]).pid) u.set("p", d.p);
    if (d.t.trim() && (Q.has("t") || d.t.trim() !== CLOCK)) u.set("t", d.t.trim());
    const np = patient(d.p);
    location.href = `${location.pathname}?${u}${np !== (p || LEAD) ? `#/clinic/${deptOf(np)}/${np.pid}` : location.hash}`;
  });
}

// keep the selected row in view after every render
new MutationObserver(() => { applyFilters(); document.querySelector(".pane.list tr.sel")?.scrollIntoView({ block: "nearest" }); }).observe($("#app"), { childList: true });

const LEAD = patient(Q.get("p") || SC.patient) || C.patients[0];
if (!location.hash && LEAD) location.hash = `#/clinic/${deptOf(LEAD)}/${LEAD.pid}`;
paintMedia().then(route);
