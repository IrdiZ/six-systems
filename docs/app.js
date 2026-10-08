/* One Patient, Six Systems: viewer. Vanilla JS, reads window.CASES (docs/data/cases.js). */
(() => {
  const C = window.CASES;
  const REPO = "https://github.com/IrdiZ/six-systems";
  const STATUSES = ["DATA", "CONFLICT", "PICTURE", "LOST"];
  const STATUS_TXT = {
    DATA: "Structured",
    CONFLICT: "Converted",
    PICTURE: "Unverified",
    LOST: "Not received",
  };
  const STATUS_LONG = {
    DATA: "Usable on arrival: coded, right unit, right patient",
    CONFLICT: "Usable after code, unit or identity repair",
    PICTURE: "Only recoverable by reading an image or a PDF; needs checking",
    LOST: "Never archived, not linkable to a patient, or unreadable",
  };
  // Timeline lanes follow a patient's care, so the set depends on the record; this fixes their order.
  const LANE_ORDER = ["gp", "nb_lab", "ext_lab", "epic_lab", "ecg", "echo", "cathlab", "radiology", "pft", "pathology", "mdo"];
  const PATHS = { chest_pain: "Chest pain", lung_nodule: "Lung nodule", kidney: "Kidney follow-up" };
  const FACT_ORDER = ["troponin_poc", "troponin", "creatinine", "hb", "egfr", "glucose", "lvef", "ivs_thickness",
    "lv_diameter", "ct_exam", "ct_raw_data", "calcium_score", "nodule_size", "path_diagnosis", "tumour_size",
    "wsi_slide", "kidney_length"];
  const ICONS = {
    epic_lab: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6A2 2 0 0 0 19 18l-5-9V3"/><path d="M7.5 14h9"/>',
    ext_lab: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    radiology: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/>',
    echo: '<path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z"/><path d="M5 12h3l2-3 2 5 2-2h5"/>',
    pathology: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 4v2M12 18v2M4 12h2M18 12h2"/>',
    offline: '<path d="M4 4l16 16"/><path d="M8.5 8.5A5 5 0 0 0 12 17a5 5 0 0 0 3.5-1.5M12 7a5 5 0 0 1 5 5"/>',
  };
  // Sources without their own glyph reuse the closest one.
  Object.assign(ICONS, { gp: ICONS.ext_lab, nb_lab: ICONS.epic_lab, ecg: ICONS.echo, cathlab: ICONS.echo, pft: ICONS.radiology, mdo: ICONS.pathology });

  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const cv = (s) => `var(--${s})`;
  const n = (v) => Number(v).toLocaleString("en-GB");
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
  const unit = (u) => (u || "").replace("umol/L", "µmol/L").replace("mL/min/1.73m2", "mL/min/1.73m²");
  const fmtNum = (v) => (typeof v === "number" ? (Number.isInteger(v) ? v : +v.toFixed(v < 10 ? 2 : 1)) : v);
  const fmtDate = (t, withYear) => {
    if (!t) return "n/a";
    const d = new Date(t);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
  };
  const fmtTime = (t) => (t ? new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "");
  const src = (k) => C.sources[k] || { label: k };
  const fdef = (k) => C.fact_defs[k];

  const ALL = [];
  C.patients.forEach((p) => p.facts.forEach((f) => ALL.push({ f, p })));
  const byPid = Object.fromEntries(C.patients.map((p) => [p.pid, p]));
  const count = (list) => Object.fromEntries(STATUSES.map((s) => [s, list.filter((x) => x.status === s).length]));
  const barHTML = (counts) => {
    const n = STATUSES.reduce((a, s) => a + counts[s], 0) || 1;
    return `<div class="bar">${STATUSES.map((s) => `<span style="--c:${cv(s)};width:${(100 * counts[s]) / n}%"></span>`).join("")}</div>`;
  };
  const chip = (s) => `<span class="st" style="--c:${cv(s)}">${STATUS_TXT[s]}</span>`;

  // ------------------------------------------------------------ tooltip
  const tip = $("#tip");
  const showTip = (e, html) => {
    tip.innerHTML = html;
    tip.classList.add("on");
    const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 10);
    const y = Math.min(e.clientY + 14, innerHeight - tip.offsetHeight - 10);
    tip.style.left = x + "px";
    tip.style.top = y + "px";
  };
  const hideTip = () => tip.classList.remove("on");

  // ------------------------------------------------------------ hero
  function renderStats() {
    const s = C.summary;
    $("#lede-pct").textContent = Math.round(s.usable_pct);
    const cards = [
      { v: s.archive_pct, c: "text", cap: "of facts have a file in the archive", sub: "Counted from file presence alone." },
      { v: s.usable_pct, c: "DATA", cap: "are usable as data on arrival", sub: "Coded, right unit, right patient." },
      { v: s.recovered_pct, c: "CONFLICT", cap: "recovered by the assembler", sub: `After code maps, unit conversion, patient matching, OCR and PDF reading. ${s.wrong} wrong values against the answer key. ${n(s.by_status.PICTURE)} of the recovered values come from images or PDFs and still need a human check.` },
    ];
    $("#stats").innerHTML = cards.map((k) => `
      <div class="stat" style="--c:${cv(k.c)}">
        <div class="big" data-to="${k.v}">0<small>%</small></div>
        <div class="cap">${k.cap}</div>
        <div class="sub">${k.sub}</div>
      </div>`).join("");
    document.querySelectorAll(".stat .big").forEach((el) => {
      const to = +el.dataset.to, t0 = performance.now();
      const step = (t) => {
        const k = Math.min(1, (t - t0) / 1300), e = 1 - Math.pow(1 - k, 3);
        el.innerHTML = `${Math.round(to * e)}<small>%</small>`;
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  let waffleFilter = null;
  function renderWaffle() {
    const s = C.summary;
    $("#waffle-sub").textContent = `${n(s.facts)} facts across ${C.patients.length} patients. One square each. Hover to inspect, click to open. Click a status to filter.`;
    $("#legend").innerHTML = STATUSES.map((st) => `
      <button class="lg" data-s="${st}" aria-pressed="false" style="--c:${cv(st)}">
        <span class="sw"></span>${STATUS_TXT[st]} <b>${n(s.by_status[st])}</b></button>`).join("");
    const sorted = [...ALL].sort((a, b) => STATUSES.indexOf(a.f.status) - STATUSES.indexOf(b.f.status) || a.p.pid.localeCompare(b.p.pid));
    const w = $("#waffle");
    w.innerHTML = sorted.map(({ f, p }, i) => `<div class="cell" data-i="${ALL.indexOf(sorted[i])}" style="--c:${cv(f.status)}"></div>`).join("");
    const cells = [...w.children];
    cells.forEach((c, i) => setTimeout(() => c.classList.add("in"), 250 + i * 4));
    w.addEventListener("mousemove", (e) => {
      const c = e.target.closest(".cell");
      if (!c) return hideTip();
      const { f, p } = ALL[+c.dataset.i];
      showTip(e, `<b>${esc(fdef(f.fact).label)}</b>${esc(p.name)} · ${esc(src(f.source).label)}<br>${chip(f.status)} <span class="muted">${esc(STATUS_LONG[f.status])}</span>`);
    });
    w.addEventListener("mouseleave", hideTip);
    w.addEventListener("click", (e) => {
      const c = e.target.closest(".cell");
      if (!c) return;
      const { f, p } = ALL[+c.dataset.i];
      selectPatient(p.pid, true);
      openFact(f, p);
    });
    $("#legend").addEventListener("click", (e) => {
      const b = e.target.closest("[data-s]");
      if (!b) return;
      waffleFilter = waffleFilter === b.dataset.s ? null : b.dataset.s;
      cells.forEach((c) => c.classList.toggle("dim", !!waffleFilter && ALL[+c.dataset.i].f.status !== waffleFilter));
      document.querySelectorAll("#legend .lg").forEach((l) => {
        const on = l.dataset.s === waffleFilter;
        l.classList.toggle("on", on);
        l.setAttribute("aria-pressed", on);
      });
    });
  }

  // ------------------------------------------------------------ systems
  function renderSystems() {
    $("#systems").innerHTML = [...LANE_ORDER, "offline"].map((k) => {
      const facts = ALL.filter((x) => x.f.source === k).map((x) => x.f);
      const cnt = count(facts);
      const files = new Set(facts.map((f) => f.file).filter(Boolean)).size;
      const fileTxt = k === "offline" ? "" : ` · ${files} ${files === 1 ? "file" : "files"}`;
      return `<div class="sys ${k === "offline" ? "offline" : ""}">
        <div class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[k] || ""}</svg></div>
        <div class="who"><h4>${esc(src(k).label)}</h4><div class="fmt">${esc(src(k).format)}</div></div>
        <div class="sysname">${esc(src(k).system)}</div>
        <div class="count"><b>${n(facts.length)}</b>${facts.length === 1 ? "fact" : "facts"}${fileTxt}</div>
        ${barHTML(cnt)}
        <div class="verdict">${pct(cnt.DATA, facts.length)}% usable on arrival</div>
      </div>`;
    }).join("");
  }

  // ------------------------------------------------------------ explorer
  const state = { pid: null, view: "archive" };
  let hashOK = false; // write the URL hash only after the user picks a patient, or when it already named one
  const syncHash = () => hashOK && history.replaceState(null, "", "#" + state.pid + (state.view === "computable" ? ":computable" : ""));

  function renderList() {
    const groups = Object.keys(PATHS);
    $("#plist").innerHTML = groups.map((g) => `
      <div class="pgroup">${PATHS[g]}</div>
      ${C.patients.filter((p) => p.path === g).map((p) => `
        <button class="pitem" data-pid="${p.pid}">
          <div class="nm">${esc(p.name)}<span>${p.pid}</span></div>
          ${barHTML(count(p.facts))}
        </button>`).join("")}`).join("");
    $("#plist").addEventListener("click", (e) => {
      const b = e.target.closest(".pitem");
      if (b) selectPatient(b.dataset.pid);
    });
  }

  function selectPatient(pid, scroll, auto) {
    state.pid = pid;
    if (!auto) hashOK = true;
    document.querySelectorAll(".pitem").forEach((b) => b.classList.toggle("on", b.dataset.pid === pid));
    renderPatient();
    syncHash();
    if (scroll) $("#explorer-section").scrollIntoView({ behavior: "smooth" });
  }

  function ring(counts, size = 86) {
    const n = STATUSES.reduce((a, s) => a + counts[s], 0) || 1;
    const r = size / 2 - 8, L = 2 * Math.PI * r;
    let off = 0;
    const arcs = STATUSES.map((s) => {
      const len = (L * counts[s]) / n;
      const a = `<circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="${cv(s)}" stroke-width="10"
        stroke-dasharray="${Math.max(0, len - 2)} ${L}" stroke-dashoffset="${-off}" transform="rotate(-90 ${size / 2} ${size / 2})"/>`;
      off += len;
      return a;
    }).join("");
    return `<svg width="${size}" height="${size}"><circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="var(--hair)" stroke-width="10"/>${arcs}
      <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" fill="var(--text)" font-weight="600" font-size="18">${pct(counts.DATA, n)}%</text></svg>`;
  }

  function renderPatient() {
    const p = byPid[state.pid];
    const cnt = count(p.facts);
    $("#pmain").innerHTML = `
      <div class="phead">
        <div>
          <h3>${esc(p.name)}</h3>
          <div class="chips">
            <span class="chip path">${PATHS[p.path]}</span>
            <span class="chip mono">${p.pid}</span>
            <span class="chip mono">BSN ${p.bsn}</span>
            <span class="chip mono">born ${fmtDate(p.dob, true)}</span>
          </div>
        </div>
        <div class="ring-box">${ring(cnt)}<div class="lbl"><b>${cnt.DATA} of ${p.facts.length} facts</b>usable as data on arrival</div></div>
      </div>
      <div class="toggle ${state.view === "computable" ? "comp" : ""}" id="toggle">
        <div class="knob"></div>
        <button data-v="archive">Archive view</button>
        <button data-v="computable">Computable view</button>
      </div>
      <div class="view-note" id="view-note"></div>
      <div class="timeline" id="timeline"></div>
      <p class="muted tl-hint">Scroll sideways to see the full timeline</p>
      <div id="below"></div>`;
    $("#toggle").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) { hashOK = true; setView(b.dataset.v); }
    });
    drawTimeline(p);
    setView(state.view, true);
  }

  function setView(v, instant) {
    state.view = v;
    syncHash();
    const p = byPid[state.pid];
    const t = $("#toggle");
    t.classList.toggle("comp", v === "computable");
    const btns = [...t.querySelectorAll("button")];
    btns.forEach((b) => b.classList.toggle("on", b.dataset.v === v));
    const on = btns.find((b) => b.dataset.v === v), knob = $(".knob", t);
    knob.style.transition = instant ? "none" : "";
    knob.style.left = on.offsetLeft + "px";
    knob.style.width = on.offsetWidth + "px";
    $("#layer-archive").classList.toggle("off", v !== "archive");
    $("#layer-comp").classList.toggle("off", v !== "computable");
    const cnt = count(p.facts);
    $("#view-note").innerHTML = v === "archive"
      ? `<b>${p.documents.length} documents, all in the archive and openable.</b>`
      : `<b>${cnt.DATA} of ${p.facts.length} facts arrived as structured data.</b> ${cnt.CONFLICT} were converted, ${cnt.PICTURE} are unverified readings of images or PDFs, ${cnt.LOST} were not received.`;
    $("#below").innerHTML = v === "archive" ? docsHTML(p) : factsHTML(p);
    bindBelow(p);
  }

  function drawTimeline(p) {
    const box = $("#timeline");
    const narrow = box.clientWidth < 700;
    const W = Math.max(narrow ? 560 : 860, box.clientWidth), left = narrow ? 120 : 200, right = 30, laneH = 56, top = 34;
    const used = new Set([...p.facts.map((f) => f.source), ...p.documents.map((d) => d.source)]);
    const lanes = [...LANE_ORDER.filter((k) => used.has(k)), ...[...used].filter((k) => k !== "offline" && !LANE_ORDER.includes(k)), "offline"];
    $(".tl-hint").style.display = W > box.clientWidth ? "block" : "none";
    const H = top + laneH * lanes.length + 14;
    const times = [...p.facts.map((f) => f.time), ...p.documents.map((d) => d.time)].filter(Boolean).map((t) => +new Date(t));
    let t0 = Math.min(...times), t1 = Math.max(...times);
    const pad = Math.max((t1 - t0) * 0.06, 3600e3 * 2);
    t0 -= pad; t1 += pad;
    const x = (t) => left + ((+new Date(t) - t0) / (t1 - t0)) * (W - left - right);
    const laneY = (k) => top + laneH * lanes.indexOf(k) + laneH / 2;
    const short = t1 - t0 < 6 * 864e5;

    let g = "";
    lanes.forEach((k, i) => {
      const y = top + laneH * i;
      g += `<rect x="0" y="${y}" width="${W}" height="${laneH}" fill="${i % 2 ? "var(--bg2)" : "transparent"}"/>`;
      if (narrow) {
        // Narrow plot: wrap the label over two lines and leave out the format line.
        const words = src(k).label.split(" "), lines = [""];
        words.forEach((w) => { const l = lines[lines.length - 1]; if (l && (l + " " + w).length > 14) lines.push(w); else lines[lines.length - 1] = l ? l + " " + w : w; });
        g += lines.map((t, j) => `<text class="lane-label" x="10" y="${y + laneH / 2 + 4 + (j - (lines.length - 1) / 2) * 14}">${esc(t)}</text>`).join("");
      } else {
        g += `<text class="lane-label" x="16" y="${y + laneH / 2 - 3}">${esc(src(k).label)}</text>`;
        g += `<text class="lane-sub" x="16" y="${y + laneH / 2 + 12}">${esc(src(k).format)}</text>`;
      }
    });
    g += `<line x1="${left - 10}" x2="${left - 10}" y1="${top}" y2="${H - 14}" stroke="var(--line)"/>`;
    for (let i = 0; i <= 6; i++) {
      const t = t0 + ((t1 - t0) * i) / 6, xx = x(t);
      g += `<line x1="${xx}" x2="${xx}" y1="${top}" y2="${H - 14}" stroke="var(--hair)" stroke-dasharray="2 4"/>`;
      g += `<text class="axis-tick" x="${xx}" y="20" text-anchor="middle">${fmtDate(t)}${short ? " " + fmtTime(t) : ""}</text>`;
    }

    // archive layer: documents
    const placed = {};
    let a = "";
    p.documents.forEach((d, i) => {
      const lane = d.source, xx = x(d.time);
      placed[lane] = placed[lane] || [];
      const near = placed[lane].filter((v) => Math.abs(v - xx) < 26).length;
      placed[lane].push(xx);
      // Documents at the same moment fill a 3-row grid (middle, top, bottom), then a new column.
      const yy = laneY(lane) + [0, -14, 14][near % 3], dx = Math.floor(near / 3) * 26;
      // Position on the outer group: the hover scale is a CSS transform and would replace an SVG transform on the same node.
      a += `<g transform="translate(${xx - 11 + dx},${yy - 11})"><g class="mk" data-doc="${i}">
        <rect width="22" height="22" rx="3" fill="var(--surface)" stroke="var(--accent)" stroke-width="1.5"/>
        <path d="M6 11.5l3.2 3.2L16 8" fill="none" stroke="var(--DATA)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></g></g>`;
    });
    a += `<text x="${left + 10}" y="${laneY("offline") + 4}" fill="var(--dim)" font-size="12" font-style="italic">No documents. Files that were never archived leave no trace here.</text>`;

    // computable layer: facts
    const groups = {};
    p.facts.forEach((f, i) => {
      const k = f.source + "|" + (f.time || "").slice(0, 13);
      (groups[k] = groups[k] || []).push(i);
    });
    let c = "";
    Object.values(groups).forEach((idxs) => {
      // Same-time results stack in columns of up to 3, so a full lab panel stays a compact block.
      const cols = Math.ceil(idxs.length / 3), rows = Math.min(3, idxs.length);
      idxs.forEach((i, j) => {
        const col = Math.floor(j / 3), row = j % 3;
        const f = p.facts[i], xx = x(f.time) + (col - (cols - 1) / 2) * 15, yy = laneY(f.source) + (row - (rows - 1) / 2) * 15;
        const lost = f.status === "LOST";
        c += `<circle class="mk" data-fact="${i}" cx="${xx}" cy="${yy}" r="${lost ? 5.5 : 6.5}"
          fill="${lost ? "var(--surface)" : cv(f.status)}" stroke="${cv(f.status)}" stroke-width="${lost ? 2 : 0}"
          ${lost ? 'stroke-dasharray="3 2.5"' : ""}/>`;
      });
    });

    box.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}
      <g class="layer" id="layer-archive">${a}</g><g class="layer off" id="layer-comp">${c}</g></svg>`;
    const svg = $("svg", box);
    svg.addEventListener("mousemove", (e) => {
      const m = e.target.closest("[data-doc],[data-fact]");
      if (!m) return hideTip();
      if (m.dataset.doc) {
        const d = p.documents[+m.dataset.doc];
        showTip(e, `<b>${esc(d.title)}</b>${fmtDate(d.time, true)} ${fmtTime(d.time)}<br><span class="muted">In the archive</span>`);
      } else {
        const f = p.facts[+m.dataset.fact];
        showTip(e, `<b>${esc(fdef(f.fact).label)}</b>${valTxt(f)}<br>${chip(f.status)}`);
      }
    });
    svg.addEventListener("mouseleave", hideTip);
    svg.addEventListener("click", (e) => {
      const m = e.target.closest("[data-doc],[data-fact]");
      if (!m) return;
      if (m.dataset.doc) openDoc(p.documents[+m.dataset.doc], p);
      else openFact(p.facts[+m.dataset.fact], p);
    });
  }

  const valTxt = (f) => (f.status === "LOST" || f.got === null || f.got === undefined
    ? '<span class="muted">no value recovered</span>'
    : `${esc(fmtNum(f.got))} ${esc(unit(f.unit))}`);

  function thumbHTML(d) {
    if (d.kind === "hl7" || d.kind === "edi") return `<div class="thumb"><pre>${esc((d.raw || "").split("\n").slice(0, 12).join("\n"))}</pre><span class="ok">In the archive</span></div>`;
    if (d.kind === "wsi") return `<div class="thumb"><div class="wsi">.isyntax<br>proprietary slide<br>4 KB opaque</div><span class="ok">In the archive</span></div>`;
    return `<div class="thumb ${d.kind === "pdf" ? "pdf" : ""}"><img loading="lazy" src="media/${esc(d.media)}" alt=""><span class="ok">In the archive</span></div>`;
  }

  function docsHTML(p) {
    return `<div class="panel-title">What the archive shows</div>
      <div class="docs">${p.documents.map((d, i) => `
        <button class="doc" data-doc="${i}">${thumbHTML(d)}
          <div class="meta"><div class="t">${esc(d.title)}</div><div class="d">${esc(src(d.source).label)} · ${fmtDate(d.time, true)}</div></div>
        </button>`).join("")}</div>`;
  }

  function factsHTML(p) {
    return STATUSES.map((s) => {
      const list = p.facts.map((f, i) => ({ f, i })).filter((x) => x.f.status === s);
      if (!list.length) return "";
      return `<div class="panel-title sq" style="--c:${cv(s)}">${STATUS_TXT[s]} · ${n(list.length)}</div>
        <div class="facts">${list.map(({ f, i }) => `
          <button class="fact" data-fact="${i}" style="--c:${cv(s)}">
            <div class="top"><span class="lab">${esc(fdef(f.fact).label)}</span>${chip(s)}</div>
            <div class="val ${f.status === "LOST" ? "none" : ""}">${f.status === "LOST" ? "n/a" : `${esc(fmtNum(f.got))}<small>${esc(unit(f.unit))}</small>`}</div>
            <div class="why">${esc(src(f.source).label)} · ${fmtDate(f.time)} · ${esc(shortReason(f))}</div>
          </button>`).join("")}</div>`;
    }).join("");
  }

  function shortReason(f) {
    if (f.status === "LOST") return f.reason.split(":")[0].split(";")[0];
    if (f.status === "CONFLICT") return f.steps.filter((s) => /→|BSN|comma/.test(s)).map((s) => s.split("(")[0].trim()).slice(0, 2).join(" · ");
    if (f.status === "PICTURE") return f.steps[0].replace("text pulled out of a PDF with a pattern match", "pulled out of PDF text");
    return "coded on arrival";
  }

  function bindBelow(p) {
    $("#below").onclick = (e) => {
      const d = e.target.closest("[data-doc]"), f = e.target.closest("[data-fact]");
      if (d) openDoc(p.documents[+d.dataset.doc], p);
      if (f) openFact(p.facts[+f.dataset.fact], p);
    };
  }

  // ------------------------------------------------------------ drawer
  const drawer = $("#drawer"), scrim = $("#scrim");
  const openDrawer = (html) => {
    drawer.innerHTML = `<button class="x" aria-label="Close">×</button>${html}`;
    drawer.classList.add("on");
    drawer.setAttribute("aria-hidden", "false");
    scrim.classList.add("on");
    drawer.scrollTop = 0;
    $(".x", drawer).onclick = closeDrawer;
  };
  const closeDrawer = () => {
    drawer.classList.remove("on");
    drawer.setAttribute("aria-hidden", "true");
    scrim.classList.remove("on");
  };
  scrim.onclick = closeDrawer;
  addEventListener("keydown", (e) => e.key === "Escape" && closeDrawer());

  function mediaHTML(m, s, isPdf) {
    if (!m || !m.png) return "";
    const b = m.box;
    return `<div class="media ${isPdf ? "pdf" : ""}" style="--c:${cv(s)}"><img src="media/${esc(m.png)}" alt="">
      ${b ? `<div class="box" style="left:${b[0]}%;top:${b[1]}%;width:${b[2]}%;height:${b[3]}%"></div>` : ""}</div>`;
  }

  function openFact(f, p) {
    const d = fdef(f.fact);
    const truth = typeof f.truth_value === "number" ? fmtNum(f.truth_value) : f.truth_value;
    const got = f.status === "LOST" || f.got == null ? "none" : fmtNum(f.got);
    const isPdf = (f.file || "").endsWith(".pdf");
    openDrawer(`
      <div class="chips">${chip(f.status)}<span class="chip">${esc(src(f.source).label)}</span><span class="chip mono">${p.pid}</span></div>
      <h3>${esc(d.label)}</h3>
      <div class="sub">${esc(p.name)} · ${fmtDate(f.time, true)} ${fmtTime(f.time)}</div>
      <div class="cmp">
        <div><div class="k">True value</div><div class="v">${esc(truth)} <small>${esc(unit(f.unit))}</small></div></div>
        <div class="arrow">→</div>
        <div style="border-color:${cv(f.status)}"><div class="k">What the assembler got</div><div class="v" style="color:${cv(f.status)}">${esc(got)} <small>${got === "none" ? "" : esc(unit(f.unit))}</small></div></div>
      </div>
      <div class="reason" style="--c:${cv(f.status)}"><b>${STATUS_TXT[f.status]}.</b> ${esc(f.reason)}</div>
      ${f.steps && f.steps.length ? `<div class="dt">What it took</div><ul class="steps" style="--c:${cv(f.status)}">${f.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : ""}
      ${f.media ? `<div class="dt">Where it came from</div>${mediaHTML(f.media, f.status, isPdf)}` : ""}
      ${f.excerpt ? `<div class="dt">Raw</div><pre class="raw">${esc(f.excerpt)}</pre>` : ""}
      <div class="file">${f.file ? esc(f.file) : "no file: " + esc(src(f.source).system)}</div>`);
  }

  function openDoc(d, p) {
    const facts = p.facts.map((f, i) => ({ f, i })).filter((x) => x.f.file === d.file);
    const body = d.raw
      ? `<pre class="raw">${esc(d.raw)}</pre>`
      : d.media ? `<div class="media ${d.kind === "pdf" ? "pdf" : ""}"><img src="media/${esc(d.media)}" alt=""></div>`
        : `<pre class="raw">Proprietary vendor format. No open reader, no DICOM conversion.</pre>`;
    openDrawer(`
      <div class="chips"><span class="chip">${esc(src(d.source).label)}</span><span class="chip mono">${esc(d.kind.toUpperCase())}</span><span class="st" style="--c:var(--DATA)">In the archive</span></div>
      <h3>${esc(d.title)}</h3>
      <div class="sub">${esc(p.name)} · ${fmtDate(d.time, true)} ${fmtTime(d.time)}</div>
      <div class="dt">Linked to the patient by</div><div>${esc(d.link || "n/a")}</div>
      <div class="dt">The file</div>${body}
      <div class="file">${esc(d.file)}</div>
      <div class="dt">Facts this file yields as data</div>
      <div class="facts" id="doc-facts">${facts.map(({ f, i }) => `
        <button class="fact" data-fact="${i}" style="--c:${cv(f.status)}">
          <div class="top"><span class="lab">${esc(fdef(f.fact).label)}</span>${chip(f.status)}</div>
          <div class="val ${f.status === "LOST" ? "none" : ""}">${f.status === "LOST" ? "n/a" : `${esc(fmtNum(f.got))}<small>${esc(unit(f.unit))}</small>`}</div>
        </button>`).join("") || '<span class="muted">none</span>'}</div>`);
    $("#doc-facts").onclick = (e) => {
      const b = e.target.closest("[data-fact]");
      if (b) openFact(p.facts[+b.dataset.fact], p);
    };
  }

  // ------------------------------------------------------------ heatmap
  function renderHeat() {
    const cols = FACT_ORDER;
    const types = new Set(ALL.map((x) => x.f.fact)).size, inCols = ALL.filter((x) => cols.includes(x.f.fact)).length;
    $("#map-sub").textContent = `Rows are patients. Columns are ${cols.length} of the ${types} fact types, chosen because they show the gap best (${n(inCols)} of ${n(C.summary.facts)} facts). Empty means that care path does not produce it.`;
    $("#map-legend").innerHTML = `Each square is one fact. ${STATUSES.map(chip).join(" ")}`;
    let h = `<div></div>` + cols.map((k) => `<div class="hc">${esc(fdef(k).label)}</div>`).join("");
    const seen = new Set();
    Object.keys(PATHS).flatMap((g) => C.patients.filter((p) => p.path === g)).forEach((p) => {
      const first = !seen.has(p.path);
      seen.add(p.path);
      h += `<div class="hr" data-pid="${p.pid}">${esc(p.name)} ${first ? `<i>${PATHS[p.path]}</i>` : ""}</div>`;
      cols.forEach((k) => {
        const fs = p.facts.filter((f) => f.fact === k);
        if (!fs.length) { h += `<div class="hx empty"></div>`; return; }
        const sorted = [...fs].sort((a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status));
        h += `<div class="hx" data-pid="${p.pid}" data-k="${k}">${sorted.map((f) => `<span style="--c:${cv(f.status)}"></span>`).join("")}</div>`;
      });
    });
    const el = $("#heat");
    el.style.gridTemplateColumns = `210px repeat(${cols.length}, minmax(34px, 1fr))`;
    el.innerHTML = h;
    el.addEventListener("mousemove", (e) => {
      const c = e.target.closest(".hx[data-k]");
      if (!c) return hideTip();
      const fs = byPid[c.dataset.pid].facts.filter((f) => f.fact === c.dataset.k);
      const cnt = count(fs);
      showTip(e, `<b>${esc(fdef(c.dataset.k).label)}</b>${esc(byPid[c.dataset.pid].name)} · ${fs.length > 1 ? `${fs.length} values, click opens the first` : "1 value"}<br>${STATUSES.filter((s) => cnt[s]).map((s) => `${chip(s)} ${cnt[s]}`).join(" ")}`);
    });
    el.addEventListener("mouseleave", hideTip);
    el.addEventListener("click", (e) => {
      const c = e.target.closest("[data-pid]");
      if (!c) return;
      selectPatient(c.dataset.pid, true);
      if (c.dataset.k) {
        const p = byPid[c.dataset.pid];
        openFact(p.facts.find((f) => f.fact === c.dataset.k), p);
      }
    });
  }

  // ------------------------------------------------------------ halves
  function renderHalves() {
    const F = ALL.map((x) => x.f);
    const extRepair = F.filter((f) => f.source === "ext_lab" && f.status === "CONFLICT").length;
    const noBsnFiles = new Set(F.filter((f) => (f.steps || []).some((s) => s.startsWith("no BSN"))).map((f) => f.file)).size + C.unlinked.length;
    const faxed = F.filter((f) => f.fact === "troponin_poc").length;
    const stranded = F.filter((f) => f.reason && f.reason.startsWith("Arrived, but could not be linked")).length;
    const pictures = F.filter((f) => f.status === "PICTURE").length;
    const raw = F.filter((f) => f.fact === "ct_raw_data").length;
    const slides = F.filter((f) => f.fact === "wsi_slide").length;
    const ocrFail = F.filter((f) => f.status === "LOST" && /OCR/.test(f.reason)).length;
    $("#halves").innerHTML = `
      <div class="half" style="--c:var(--CONFLICT)">
        <h3>Exchange between organisations</h3>
        <div class="q">Using data in care across organisations: neighbouring hospitals, regional labs, GPs.</div>
        <div class="rows">
          <div class="row"><b>${n(extRepair)}</b><span>regional-lab values that needed a code map and unit conversion before they matched the hospital's own</span></div>
          <div class="row"><b>${n(noBsnFiles)}</b><span>files that arrived without a BSN; ${C.unlinked.length} could not be linked to any patient, which stranded ${n(stranded)} values</span></div>
          <div class="row"><b>${n(faxed)}</b><span>emergency results that existed only on a fax</span></div>
        </div>
        <div class="owner">Likely owner: <b>clinical care, EHR integration team</b>. Driver: EHDS dates for priority data (2029 for patient summaries and ePrescriptions, 2031 for medical images, lab results and discharge reports).</div>
      </div>
      <div class="half" style="--c:var(--PICTURE)">
        <h3>Getting data out for research</h3>
        <div class="q">Using the archive as data for studies, registries and AI, in bulk.</div>
        <div class="rows">
          <div class="row"><b>${n(pictures)}</b><span>measurements and findings that exist only as pixels or PDF text</span></div>
          <div class="row"><b>${n(ocrFail)}</b><span>values where OCR could not read the screen capture</span></div>
          <div class="row"><b>${n(raw + slides)}</b><span>datasets never kept or locked in a vendor format: ${raw} CT raw acquisitions, ${slides} slides</span></div>
        </div>
        <div class="owner">Likely owner: <b>research and AI, imaging research data platform</b>. Driver: EHDS rules for secondary use.</div>
      </div>
      <p class="open-q">Open question: which of the two problems costs more in practice. The prototype is built to compare them.</p>`;
  }

  // ------------------------------------------------------------ export
  async function hmac(keyBytes, text) {
    if (crypto.subtle) {
      const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
      return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    let h = 2166136261; // insecure-context fallback (file://): FNV-1a over salt + text
    for (const ch of [...keyBytes].join(",") + text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    return h.toString(16).padStart(8, "0").repeat(8);
  }

  function renderExport() {
    const usable = ALL.filter(({ f }) => f.status !== "LOST" && f.correct);
    $("#export").innerHTML = `
      <div class="xrow">
        <button class="btn" id="run-export">Run research export</button>
        <span class="muted">${n(usable.length)} recovered facts from ${C.patients.length} patients → CSV + FHIR bundle</span>
      </div>
      <div class="pipeline">
        <div class="pstep" data-k="0"><b>Select</b><span>only facts recovered correctly</span></div>
        <div class="pstep" data-k="1"><b>Pseudonymise</b><span>BSN → HMAC-SHA256, random salt, never stored (in this demo)</span></div>
        <div class="pstep" data-k="2"><b>Shift dates</b><span>±30 days per patient, intervals kept</span></div>
        <div class="pstep" data-k="3"><b>Leak check</b><span>scan output for every BSN, name, birth date, hospital number</span></div>
      </div>
      <div id="export-out"></div>`;
    $("#run-export").onclick = () => runExport(usable);
  }

  async function runExport(usable) {
    const steps = [...document.querySelectorAll(".pstep")];
    steps.forEach((s) => s.classList.remove("done"));
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const salt = crypto.getRandomValues(new Uint8Array(32));
    steps[0].classList.add("done"); await wait(350);
    const subj = {}, shift = {};
    for (const p of C.patients) {
      const h = await hmac(salt, p.bsn), s = await hmac(salt, "shift" + p.bsn);
      subj[p.pid] = "SUBJ-" + h.slice(0, 10).toUpperCase();
      shift[p.pid] = (parseInt(s.slice(0, 8), 16) % 61) - 30;
    }
    steps[1].classList.add("done"); await wait(350);
    const rows = usable.map(({ f, p }) => {
      const t = new Date(f.time); t.setDate(t.getDate() + shift[p.pid]);
      const iso = new Date(t.getTime() - t.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
      return { subject: subj[p.pid], care_path: p.path, fact: f.fact, value: f.got, unit: f.unit || "", time_shifted: iso, source: f.source, status: f.status };
    });
    steps[2].classList.add("done"); await wait(350);
    const cols = Object.keys(rows[0]);
    const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => /[",]/.test(String(r[c])) ? `"${String(r[c]).replace(/"/g, '""')}"` : r[c]).join(","))].join("\n");
    const fhir = JSON.stringify({
      resourceType: "Bundle", type: "collection",
      entry: rows.map((r) => {
        const d = fdef(r.fact), o = { resourceType: "Observation", status: "final", subject: { reference: `Patient/${r.subject}` }, code: { text: d.label }, effectiveDateTime: r.time_shifted };
        if (d.loinc) o.code.coding = [{ system: "http://loinc.org", code: d.loinc }];
        if (typeof r.value === "number") o.valueQuantity = { value: r.value, unit: r.unit, system: "http://unitsofmeasure.org" };
        else o.valueString = String(r.value);
        return { resource: o };
      }),
    }, null, 1);
    const needles = C.patients.flatMap((p) => [p.bsn, p.mrn, p.dob, p.dob.replace(/-/g, ""), p.family, p.given]).filter((n) => n.length >= 4);
    const blob = csv + fhir;
    const leaks = needles.filter((n) => blob.includes(n));
    steps[3].classList.add("done");
    const url = (s, type) => URL.createObjectURL(new Blob([s], { type }));
    $("#export-out").innerHTML = `
      <div class="xrow" style="justify-content:space-between;margin-bottom:6px">
        <span class="leak" style="color:${leaks.length ? "var(--LOST)" : "var(--DATA)"}">${leaks.length ? `Leak check failed. ${leaks.length} identifiers appear in the output.` : `Leak check passed. None of the ${needles.length} identifiers appear in the output.`}</span>
        <span class="xrow">
          <a class="btn ghost" download="six-systems-research.csv" href="${url(csv, "text/csv")}">Download CSV</a>
          <a class="btn ghost" download="six-systems-observations.fhir.json" href="${url(fhir, "application/json")}">Download FHIR bundle</a>
        </span>
      </div>
      <table class="xtable"><thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
      <tbody>${rows.slice(0, 8).map((r) => `<tr>${cols.map((c) => `<td>${esc(fmtNum(r[c]))}</td>`).join("")}</tr>`).join("")}</tbody></table>
      <p class="muted" style="font-size:13px;margin:12px 0 0">Showing 8 of ${n(rows.length)} rows. The Python build also de-identifies DICOM files (tags blanked, dates shifted, burned-in name banner masked) and runs the same leak check.</p>`;
  }

  // ------------------------------------------------------------ unlinked + footer
  function renderUnlinked() {
    $("#unlinked").innerHTML = C.unlinked.map((u) => `
      <div class="unl">
        <div>
          <span class="st" style="--c:var(--LOST)">Unlinked</span>
          <h4 style="margin-top:10px">${esc(u.title)}</h4>
          <p class="muted" style="font-size:14px">Addressed to <b style="color:var(--text)">${esc(u.who)}</b>, received ${fmtDate(u.time, true)}.</p>
          <p style="font-size:14px">${esc(u.reason)}. The file cannot be matched, so the results wait in an inbox until a person notices.</p>
        </div>
        <pre>${esc(u.raw || u.excerpt)}</pre>
      </div>`).join("") || '<p class="muted">None this run.</p>';
    $("#foot-meta").innerHTML = `Generated ${esc(C.generated.replace("T", " "))}<br>${C.patients.length} synthetic patients · ${n(C.summary.facts)} facts<br><a href="${REPO}">Source on GitHub →</a>`;
  }

  // ------------------------------------------------------------ boot
  renderStats();
  renderWaffle();
  renderSystems();
  renderList();
  renderHeat();
  renderHalves();
  renderExport();
  renderUnlinked();
  // deep link: #P004 or #P004:computable
  const [hp, hv] = location.hash.slice(1).split(":");
  if (hv === "computable") state.view = "computable";
  hashOK = !!byPid[hp];
  selectPatient(byPid[hp] ? hp : C.patients[0].pid, !!byPid[hp], true);
  addEventListener("hashchange", () => {
    const [pid, view] = location.hash.slice(1).split(":");
    if (!byPid[pid]) return;
    state.view = view === "computable" ? "computable" : "archive";
    selectPatient(pid);
  });
  let rt;
  let lastW = innerWidth;
  addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (innerWidth !== lastW) { lastW = innerWidth; if (state.pid) renderPatient(); } }, 200);
  });
})();
