/* Feature demos for explained.html: one small animation per feature card, built from window.CASES.
   Each demo is static markup in its end state. Elements with class dm-a carry a keyframe name in --a;
   explain-demos.css runs it while the frame has class "play". Times are percentages of one loop. */
(() => {
  const C = window.CASES;
  if (!C) return;
  const S = C.summary, DEF = C.fact_defs, SRC = C.sources;
  const LABEL = { DATA: "Structured", CONFLICT: "Converted", PICTURE: "Unverified", LOST: "Not received" };
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const num = (v) => (typeof v === "number" ? +v.toFixed(v < 10 ? 2 : 1) : v);
  const when = (t) => new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const short = (fact) => DEF[fact].label.split(" (")[0];

  // The journey patient: the page puts the id in the first card link. Fall back to a patient with a faxed troponin.
  const pid = (document.getElementById("l-missing")?.getAttribute("href").match(/\/(P\d+)/) || [])[1];
  const p = C.patients.find((x) => x.pid === pid) || C.patients.find((x) => x.facts.some((f) => f.fact === "troponin_poc"));
  if (!p) return;
  const fact = (name, src) => p.facts.find((f) => f.fact === name && (!src || f.source === src));

  // Keyframes: i fade up, s slide in, w wipe from the left, h open, o fade out, p press. [kind, start %, length %].
  const KF = {};
  const FROM = { i: "opacity:0;transform:translateY(.4em)", s: "opacity:0;transform:translate(var(--x,-2.5em),var(--y,0))", w: "opacity:1;clip-path:inset(-9px 100% -9px 0)", h: "max-height:0;opacity:0" };
  const TO = { i: "opacity:1;transform:none", s: "opacity:1;transform:none", w: "opacity:1;clip-path:inset(-9px)", h: "max-height:9em;opacity:1" };
  function kf(k, t, l = 5) {
    const n = `dm-${k}${t}-${l}`;
    KF[n] = k === "o" ? `0%{opacity:0}2%,${t}%{opacity:1}${t + l}%,to{opacity:0}`
      : k === "p" ? `0%,${t}%,${t + 3 * l}%,to{transform:none}${t + l}%{transform:scale(var(--ps,.9))}`
      : `0%,${t}%{${FROM[k]}}${t + l}%,96%{${TO[k]}}to{${TO[k]};opacity:0}`;
    return n;
  }
  const el = (cls, html, a, style = "", tag = "div") =>
    `<${tag} class="${cls}${a ? " dm-a" + (a[0] === "o" ? " dm-o" : "") : ""}" style="${a ? `--a:${kf(...a)};` : ""}${style}">${html}</${tag}>`;
  const sp = (cls, html, a, style) => el(cls, html, a, style, "span");
  const chip = (k, text, a) => sp("dm-s", esc(text || LABEL[k]), a, `--c:var(--${k})`);
  const val = (v, unit) => `${esc(num(v))}${unit ? ` <small>${esc(unit)}</small>` : ""}`;
  const FILE = `<svg class="dm-fi" viewBox="0 0 13 16"><path d="M1.5 1.5h6l4 4v9h-10zM7.5 1.5v4h4"/></svg>`;

  const BUILD = {
    "missing-result-alert"() {
      const lost = fact("troponin_poc");
      if (!lost || lost.status !== "LOST") return "";
      const rest = p.facts.filter((f) => f.status !== "LOST" && typeof f.got === "number").slice(0, 4);
      const row = (f, i) => el("dm-r" + (f === lost ? " dm-x" : ""),
        sp("dm-el", f === lost ? sp("", esc(DEF[f.fact].label), ["p", 46, 4], "--ps:1.07") : esc(DEF[f.fact].label)) +
        (f === lost ? sp("dm-no", LABEL.LOST) : sp("dm-b", val(f.got, f.unit))), ["i", 2 + i * 4], `--c:var(--${f.status})`);
      return el("dm-al", chip("LOST", `${LABEL.LOST}: ${short(lost.fact)}${/fax/.test(lost.loss || "") ? " (fax)" : ""}`), ["i", 30, 6]) +
        el("dm-c dm-rows", [lost, ...rest].map(row).join(""));
    },

    provenance() {
      const doc = p.documents.find((x) => x.kind === "edi"), src = doc && SRC[doc.source];
      if (!src) return "";
      const steps = p.facts.filter((f) => f.file === doc.file).flatMap((f) => f.steps || []);
      const codes = steps.filter((x) => /^local code/.test(x)).length, units = steps.filter((x) => /\([×÷]/.test(x)).length;
      const ends = (doc.raw || "").match(/UNB\+[^+]*\+([^+]+)\+([^+]+)/);
      const kv = [["Sender", esc(src.label)], ["Connection", ends ? `<span class="dm-m">${esc(ends[1])} → ${esc(ends[2])}</span>` : ""], ["Format", esc(src.format)],
        ["Repairs", [codes && `${codes} codes mapped`, units && `${units} units converted`].filter(Boolean).join(", ") || "None"]].filter((x) => x[1]);
      const head = (x) => el("dm-r", sp("dm-b dm-el", esc(x.title)) + sp("dm-k", when(x.time)));
      const next = p.documents.find((x) => x.source !== doc.source);
      return el("dm-c", head(doc) + el("dm-kv", kv.map(([k, v], i) => sp("dm-k", k) + sp("", sp("", v, ["w", 26 + i * 10, 7]))).join(""), ["h", 14, 8])) +
        (next ? el("dm-c dm-dim", head(next)) : "") + sp("", sp("dm-pt", "", ["s", 3, 8], "--x:2.5em;--y:3.5em"), ["o", 16, 4]);
    },

    "code-unit-conversion"() {
      const f = fact("troponin", "ext_lab"), m = C.code_maps?.ext_lab?.troponin, d = DEF.troponin;
      if (!f || !m || !m.factor || typeof f.got !== "number") return "";
      return el("dm-cv",
        el("dm-c", el("dm-k", esc(SRC.ext_lab.label)) + el("dm-m", esc(m.code)) + el("dm-v", val((f.got / m.factor).toFixed(m.decimals), m.unit)) + el("dm-el", esc(m.name))) +
        el("dm-ar", sp("dm-k", `×${esc(m.factor)}`, ["i", 22]) + el("", `<svg viewBox="0 0 40 8"><path d="M0 4h38M34 1l4 3-4 3"/></svg>`, ["w", 12, 8])) +
        el("dm-c", el("dm-k", "Hospital") + el("dm-m", sp("", `LOINC ${esc(d.loinc)}`, ["w", 32, 7])) + el("dm-v", val(f.got, f.unit), ["i", 44]) + el("dm-el", esc(d.label), ["i", 50]))) +
        el("dm-end", chip("CONFLICT", "", ["i", 60]));
    },

    "patient-matching"() {
      if (!p.bsn || !p.mrn || !p.dob) return "";
      const keys = [["BSN", p.bsn], ["Hospital number", p.mrn], ["Name, birth date", `${p.family}, ${p.dob}`]];
      const lane = (text, i) => el("dm-ln", sp("dm-fl", FILE + esc(text), ["s", 4 + i * 14, 6]) + el("dm-wr", "", ["w", 10 + i * 14, 5], "", "i"), 0, `grid-row:${i < 3 ? i + 2 : 6}`);
      return sp("dm-k", "Incoming file has") + keys.map((k, i) => lane(k[0], i)).join("") + lane("None of these", 3) +
        el("dm-c dm-pat", el("dm-b dm-el", esc(p.name)) + keys.map((k, i) => el(i < 2 ? "dm-m" : "dm-el", esc(k[1]))).join("")) +
        el("dm-tray", `<b>To file</b>` + sp("dm-k", `${C.unlinked.length} waiting`, ["i", 60]));
    },

    "image-pdf-reading"() {
      const f = fact("lvef", "echo"), b = f?.media?.box;
      if (!b || f.got == null) return "";
      return el("dm-crop", el("dm-im", `<img src="media/${esc(f.media.png)}" alt="">` +
          el("dm-bx", "", ["w", 8, 8], `left:${b[0]}%;top:${b[1]}%;width:${b[2]}%;height:${b[3]}%`, "i"), 0, `--cy:${b[1] + b[3] / 2}%`)) +
        el("dm-c dm-r", sp("dm-el", esc(DEF.lvef.label)) + sp("dm-v", val(f.got, f.unit), ["i", 24]) +
          sp("dm-sw", sp("", chip("PICTURE", "", ["i", 32]), ["o", 54, 4]) + sp("dm-s dm-ok", "Verified", ["i", 56], "--c:var(--DATA)")));
    },

    "request-missing-result"() {
      const lost = fact("troponin_poc"), to = lost && ((lost.loss || "").match(/ at (.+?),/) || [])[1];
      if (!to) return "";
      const field = (k, v, i) => sp("dm-k", k) + sp("dm-in", sp("", esc(v), ["w", 6 + i * 13, 8]));
      return el("dm-c dm-f", field("To", to, 0) + field("Channel", "Sender's connection", 1) +
          field("Message", `Please send the ${short(lost.fact).toLowerCase()} result.`, 2) + sp("dm-bt", "Send", ["p", 46, 3])) +
        el("dm-c dm-r", `<span><b>Sent</b> ${sp("dm-k", "· waiting for reply")}</span>` + sp("dm-k dm-el", esc(to)), ["i", 56, 6]);
    },

    "management-overview"() {
      const keys = ["epic_lab", "ext_lab", "gp", "echo"].filter((k) => S.by_source[k] && SRC[k]);
      if (!keys.length) return "";
      const rows = keys.map((k, i) => {
        const n = S.by_source[k], t = 3 + i * 9, total = Object.values(n).reduce((a, b) => a + b, 0);
        return sp("dm-el", esc(SRC[k].label), ["i", t]) +
          sp("dm-bar", Object.keys(LABEL).map((s) => n[s] ? `<i style="flex:${n[s]} 0 2px;--c:var(--${s})"></i>` : "").join(""), ["w", t + 3, 12]) +
          sp("dm-b", total.toLocaleString("en-GB"), ["i", t + 12]);
      }).join("");
      return el("dm-c dm-ov", rows) + el("dm-lg", Object.keys(LABEL).map((s) => chip(s)).join(""), ["i", 54, 6]);
    },

    "research-export"() {
      const f = fact("troponin", "ext_lab") || p.facts.find((x) => x.time);
      if (!p.bsn || !f) return "";
      // A stand-in for the export's HMAC: it shows the form of the pseudonym and of the date shift, not a real key.
      let h = 0;
      for (const ch of p.bsn) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      const hex = (h.toString(16) + ((h * 7) >>> 0).toString(16)).padEnd(10, "0").slice(0, 10).toUpperCase();
      const shift = (h % 61) - 30 || 7, day = f.time.slice(0, 10), t = new Date(day + "T12:00Z");
      t.setUTCDate(t.getUTCDate() + shift);
      return el("dm-c dm-ex", `<span></span>${sp("dm-k", "Patient")}${sp("dm-k", "Date")}` +
          sp("dm-k", "Record") + sp("dm-m", `BSN ${esc(p.bsn)}`) + sp("dm-m", day) +
          `<span></span>` + sp("dm-k", "↓ pseudonym", ["i", 10]) + sp("dm-k", `↓ ${shift > 0 ? "+" : "−"}${Math.abs(shift)} days`, ["i", 34]) +
          sp("dm-k", "Export") + sp("dm-m dm-b", sp("", `SUBJ-${hex}`, ["w", 16, 9])) + sp("dm-m dm-b", sp("", t.toISOString().slice(0, 10), ["w", 40, 7]))) +
        el("dm-lk", "Leak check: 0 identifiers in output", ["i", 58, 6]);
    },
  };

  const frames = [];
  Object.keys(BUILD).forEach((slug, i) => document.querySelectorAll(`.demo[data-demo="${slug}"]`).forEach((mount) => {
    try {
      const html = BUILD[slug]();
      if (!html) return;
      const card = mount.closest("[data-feature]");
      const alt = mount.dataset.previewAlt || card?.dataset.previewAlt || card?.querySelector("h3")?.textContent || slug;
      mount.innerHTML = `<div class="demo-frame" role="img" aria-label="${esc(alt.trim())}"><div class="dm dm-${i + 1}" aria-hidden="true">${html}</div></div>`;
      frames.push(mount.firstChild);
    } catch (e) {
      console.warn("explain-demos:", slug, e.message);
    }
  }));
  if (!frames.length) return;

  const style = document.createElement("style");
  style.textContent = Object.entries(KF).map(([n, body]) => `@keyframes ${n}{${body}}`).join("");
  document.head.append(style);

  // One observer: a demo plays while at least half of it is in view. With reduced motion it stays in its end state.
  if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const io = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle("play", e.intersectionRatio >= 0.5)), { threshold: 0.5 });
  frames.forEach((f) => io.observe(f));
})();
