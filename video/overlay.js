// Demo overlay, injected by render.py: cursor, click ripple, highlight ring, callout, key chip, zoom, scroll.
// Nothing here reads the clock: render.py starts tweens at a time t, then calls __ov.frame(t) once per video frame.
// frame(t) returns true when the picture may have changed (a tween is running or the app's DOM mutated).
// The callout sits next to the ring, on the side that fits and covers the least text, so the eye stays put.
(() => {
  const E = { linear: (p) => p, out: (p) => 1 - (1 - p) ** 3, inOut: (p) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2) };
  const lerp = (a, b, p) => a + (b - a) * p;
  const prog = (t, t0, d, e = "inOut") => (d > 0 ? (E[e] || E.inOut)(Math.max(0, Math.min(1, (t - t0) / d))) : 1);
  const S = { cur: { a: [0, 0], b: [0, 0], t0: 0, d: 0 }, zoom: { a: [1, 0, 0], b: [1, 0, 0], t0: 0, d: 0 }, rip: null, ring: null, cap: null, old: null, key: null, scroll: null, card: null, until: 0, dirty: true };
  const busy = (t1) => (S.until = Math.max(S.until, t1));
  const FONT = "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap";
  const PAD = 8, GAP = 14, SAFE = 20, MOVE = 0.5; // ring padding, ring-to-callout gap, screen margin (CSS px); glide time (s)
  let el = {};

  const CSS = `
    #__ov, #__ov * { box-sizing: border-box; pointer-events: none; }
    #__ov { position: fixed; inset: 0; z-index: 2147483647; font-family: Geist, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; }
    #__ov .cur { position: absolute; left: 0; top: 0; width: 24px; height: 24px; margin: -2px 0 0 -3px; filter: drop-shadow(0 1px 2px rgba(0,0,0,.35)); }
    #__ov .rip { position: absolute; border: 2px solid #1d6fa5; border-radius: 50%; }
    #__ov .ring { position: absolute; border: 2.5px solid #1d6fa5; border-radius: 8px;
      box-shadow: 0 0 0 4px rgba(255,255,255,.9), 0 0 0 9999px rgba(14,22,30,.3); } /* white keyline, then the dimmed screen */
    #__ov .cap { position: absolute; left: 0; top: 0; width: max-content; max-width: 290px; padding: 11px 15px 12px 14px; border-radius: 6px;
      background: #fff; color: #16202a; border: 1px solid #d3d9df; border-left: 3px solid #1d6fa5;
      box-shadow: 0 10px 28px rgba(15,23,30,.16), 0 1px 3px rgba(15,23,30,.08); }
    #__ov .cap .t { display: flex; align-items: center; gap: 8px; font-size: 17px; line-height: 1.25; font-weight: 600; letter-spacing: -.01em; }
    #__ov .cap .s { margin-top: 3px; font-size: 14px; line-height: 1.42; font-weight: 400; color: #4a5561; text-wrap: pretty; }
    #__ov .cap .s:empty, #__ov .n:empty { display: none; }
    #__ov .n { flex: none; width: 22px; height: 22px; border-radius: 50%; background: #1d6fa5; color: #fff; font-size: 12.5px; font-weight: 600;
      display: grid; place-items: center; }
    #__ov .ring .n { position: absolute; left: -13px; top: -13px; box-shadow: 0 0 0 3px #fff; }
    #__ov .menu { position: absolute; background: #fff; border: 1px solid #8a9299; border-radius: 4px; box-shadow: 0 8px 22px rgba(15,23,30,.22);
      padding: 3px 0; overflow: hidden; }
    #__ov .menu div { padding: 0 9px; white-space: nowrap; overflow: hidden; color: #16202a; }
    #__ov .menu div.on { background: #1d6fa5; color: #fff; }
    #__ov .card { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; padding: 0 9vw; background: #262d34; color: #fff; }
    #__ov .card.light { background: #f6f7f8; color: #161a1e; }
    #__ov .card > * { will-change: transform, opacity; }
    #__ov .card .k { font-size: 15px; font-weight: 500; letter-spacing: .14em; text-transform: uppercase; color: #8fb8d6; margin-bottom: 18px; }
    #__ov .card.light .k { color: #1d6fa5; }
    #__ov .card .h { font-size: 64px; line-height: 1.04; font-weight: 600; letter-spacing: -.03em; max-width: 15em; text-wrap: balance; }
    #__ov .card .h em { font-style: normal; color: #8fb8d6; }
    #__ov .card.light .h em { color: #1d6fa5; }
    #__ov .card .s { margin-top: 20px; font-size: 22px; line-height: 1.4; color: rgba(255,255,255,.66); max-width: 34em; }
    #__ov .card.light .s { color: #4f575f; }
    #__ov .card .stats { display: flex; gap: 6vw; margin-top: 8px; }
    #__ov .card .st b { display: block; font-size: 150px; line-height: 1; font-weight: 600; letter-spacing: -.05em; font-variant-numeric: tabular-nums; }
    #__ov .card .st b small { font-size: .45em; letter-spacing: 0; }
    #__ov .card .st span { display: block; margin-top: 10px; font-size: 22px; color: inherit; opacity: .7; }
    #__ov .key { position: absolute; right: 24px; bottom: 24px; min-width: 40px; padding: 7px 13px 8px; border-radius: 7px; text-align: center;
      background: #15191e; color: #fff; font-size: 16px; font-weight: 600; box-shadow: 0 6px 18px rgba(15,20,25,.2), inset 0 -2px 0 rgba(255,255,255,.14); }`;

  function mount() {
    const root = document.createElement("div");
    root.id = "__ov";
    root.innerHTML = `<link rel="stylesheet" href="${FONT}"><style>${CSS}</style><div class="ring"><span class="n"></span></div><div class="rip"></div><div class="cap"><div class="t"><span class="n"></span><span class="tt"></span></div><div class="s"></div></div><div class="menu"></div><div class="key"></div><div class="card" style="display:none"></div><img class="cur" src="${window.__CURSOR || ""}">`;
    document.documentElement.append(root); // outside <body>, so the zoom on <body> leaves the overlay alone
    for (const k of ["ring", "rip", "cap", "menu", "key", "cur", "card"]) el[k] = root.querySelector("." + k);
    el.t = el.cap.querySelector(".tt"), el.s = el.cap.querySelector(".s"), el.n = el.cap.querySelector(".n"), el.rn = el.ring.querySelector(".n");
    new MutationObserver(() => (S.dirty = true)).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", mount) : mount();

  const curAt = (t) => { const c = S.cur, p = prog(t, c.t0, c.d, c.e); return [lerp(c.a[0], c.b[0], p), lerp(c.a[1], c.b[1], p)]; };
  const zoomAt = (t) => { const z = S.zoom, p = prog(t, z.t0, z.d, z.e); return z.a.map((v, i) => lerp(v, z.b[i], p)); };
  const show = (n, on) => (n.style.display = on ? "" : "none");
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  // a glide: follows a live target, but eases in from where it was whenever the target jumps (new node, other side)
  const glide = (g, live, t) => (g.from ? live.map((v, i) => lerp(g.from[i], v, prog(t, g.t0, MOVE))) : live);
  const ringG = { node: null }, capG = { side: null };

  function ringRect(n) { // the ring's box on screen, kept inside the screen
    const b = n.getBoundingClientRect(), W = innerWidth, H = innerHeight;
    const x0 = clamp(b.left - PAD, 3, W - 3), y0 = clamp(b.top - PAD, 3, H - 3);
    return [x0, y0, clamp(b.right + PAD, 3, W - 3) - x0, clamp(b.bottom + PAD, 3, H - 3) - y0];
  }

  // how much is under a box: a 6x3 grid of probes, each counting when it lands on text, an image or a control
  const INK = /^(IMG|CANVAS|SVG|INPUT|SELECT|TEXTAREA|BUTTON|KBD)$/;
  function covered(x, y, w, h) {
    let n = 0;
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
      const e = document.elementFromPoint(x + (w * (i + 0.5)) / 6, y + (h * (j + 0.5)) / 3);
      if (e && (INK.test(e.tagName) || [...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()))) n++;
    }
    return n;
  }

  // the callout's [x, y, side] next to rect r: of the spots that fit, the one covering least (keep: stay on that spot if it fits)
  function place(r, w, h, keep) {
    const W = innerWidth, H = innerHeight;
    if (!r) return [SAFE + 4, H - SAFE - 4 - h, "none"];
    const [x, y, rw, rh] = r, cx = (v) => clamp(v, SAFE, W - SAFE - w), cy = (v) => clamp(v, SAFE, H - SAFE - h);
    const spots = [["below", cx(x), y + rh + GAP], ["below-end", cx(x + rw - w), y + rh + GAP], ["above", cx(x), y - GAP - h],
      ["above-end", cx(x + rw - w), y - GAP - h], ["right", x + rw + GAP, cy(y)], ["left", x - GAP - w, cy(y)],
      ["right-margin", W - SAFE - w, cy(y)], ["left-margin", SAFE, cy(y)]] // level with a wide target, in the screen margin
      .filter(([, px, py]) => px >= SAFE && py >= SAFE && px + w <= W - SAFE && py + h <= H - SAFE
        && (px + w + GAP <= x || px >= x + rw + GAP || py + h + GAP <= y || py >= y + rh + GAP)); // never on the target
    const kept = spots.find((s) => s[0] === keep);
    if (kept) return kept.slice(1).concat(kept[0]);
    if (!spots.length) return [cx(x + 12), cy(y + rh - h - 12), "inside"]; // the target fills the screen
    const best = spots.map((s, i) => [covered(s[1], s[2], w, h) + i * 0.01, s]).sort((a, b) => a[0] - b[0])[0][1];
    return [best[1], best[2], best[0]];
  }

  window.__ov = {
    ready: () => Promise.all(["400", "600"].map((w) => document.fonts.load(`${w} 16px Geist`))).then(() => document.fonts.ready),
    cursor(x, y) { S.cur = { a: [x, y], b: [x, y], t0: 0, d: 0 }; },
    move(x, y, t0, d, e) { S.cur = { a: curAt(t0), b: [x, y], t0, d, e }; busy(t0 + d); },
    ripple(x, y, t0) { S.rip = { x, y, t0 }; busy(t0 + 0.5); },
    ring(node, t0) {
      if (!node && S.ring && ringG.last) S.ringOut = { t0, rect: ringG.last }; // fade out where it was, not a pop
      S.ring = node ? { node, t0, fresh: !S.ring } : null;
      busy(t0 + MOVE);
    },
    // a select's option list, drawn as the page would (screenshots never show the native popup); the highlight and
    // the cursor run down the options and back to the current one, then it closes and the value is left as it was
    menu(node, t0, d, pick) { // pick: the option index chosen at the end (none: browse and keep the current one)
      const b = node.getBoundingClientRect(), cs = getComputedStyle(node), opts = [...node.options].map((o) => o.text);
      const rowH = Math.round(parseFloat(cs.fontSize) * 1.75), h = opts.length * rowH + 8, below = b.bottom + 2 + h <= innerHeight - 8;
      const m = { t0, d, opts, sel: node.selectedIndex, pick: pick ?? null, rowH, x: b.left, w: b.width, y: below ? b.bottom + 2 : b.top - 2 - h, font: `${cs.fontSize} ${cs.fontFamily}` };
      m.rowY = (i) => m.y + 4 + (i + 0.5) * rowH;
      S.menu = m;
      el.menu.innerHTML = opts.map((o) => `<div style="height:${rowH}px;line-height:${rowH}px">${o.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</div>`).join("");
      Object.assign(el.menu.style, { left: m.x + "px", top: m.y + "px", width: "max-content", minWidth: m.w + "px", font: m.font, display: "" });
      m.x = Math.min(m.x, innerWidth - 8 - el.menu.offsetWidth), el.menu.style.left = m.x + "px"; // as wide as its longest option, kept on screen
      const end = opts.length - 1;
      S.cur = { a: curAt(t0), b: [m.x + Math.min(m.w / 2, 80), m.rowY(m.pick ?? m.sel)], t0, d: d * 0.85, e: "linear" }; // ends on the option kept or picked
      busy(t0 + d);
    },
    key(label, t0) { S.key = { label, t0 }; busy(t0 + 1.2); },
    // c: "text", {title, sub, side, dur} or null. side pins the callout's side (below, above, right, left).
    caption(c, t0) {
      c = typeof c === "string" ? { title: c } : c;
      const prev = S.cap && (!S.cap.t1 || S.cap.t1 > t0) ? S.cap : null;
      S.old = prev ? { ...prev, t0, t1: t0 + 0.2 } : null;
      S.cap = c ? { ...c, t0: t0 + (prev ? 0.2 : 0), t1: c.dur ? t0 + c.dur : 0 } : null;
      busy(t0 + 0.7);
      if (S.cap?.t1) busy(S.cap.t1);
    },
    // target: an element, a rect [x, y, w, h] in page pixels, or null (back to 1x). scale: omit to fit the target.
    zoom(target, scale, t0, d, e) {
      const W = innerWidth, H = innerHeight, [s0, x0, y0] = zoomAt(t0);
      let b = [1, 0, 0];
      if (target) {
        let r = Array.isArray(target) ? { x: target[0], y: target[1], width: target[2], height: target[3] } : target.getBoundingClientRect();
        if (!Array.isArray(target)) r = { x: (r.x - x0) / s0, y: (r.y - y0) / s0, width: r.width / s0, height: r.height / s0 };
        const s = Math.max(1, scale || Math.min(1.6, (0.8 * W) / r.width, (0.75 * H) / r.height));
        const fit = (c, len) => Math.min(0, Math.max(len - s * len, len / 2 - s * c));
        b = [s, fit(r.x + r.width / 2, W), fit(r.y + r.height / 2, H)];
      }
      S.zoom = { a: [s0, x0, y0], b, t0, d, e };
      busy(t0 + d);
    },
    // A full-screen title card. c: {kicker, title (may hold <em>), sub, stats: [{to, from, suffix, label, color}], light} or null.
    // In: a wipe up, then the lines rise one after another, then the numbers count up. Out: a wipe up, uncovering the app.
    card(c, t0) {
      if (!c) { if (S.card) { S.card.t1 = t0; busy(t0 + 0.5); } return; }
      const esc = (v) => String(v ?? "").replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[m]);
      el.card.className = "card" + (c.light ? " light" : "");
      el.card.innerHTML = (c.kicker ? `<div class="k">${esc(c.kicker)}</div>` : "")
        + (c.title ? `<div class="h">${esc(c.title).replace(/&lt;(\/?)em&gt;/g, "<$1em>")}</div>` : "")
        + (c.stats ? `<div class="stats">${c.stats.map((x, i) => `<div class="st"><b style="color:${x.color || "inherit"}" data-i="${i}"></b><span>${esc(x.label)}</span></div>`).join("")}</div>` : "")
        + (c.sub ? `<div class="s">${esc(c.sub)}</div>` : "");
      S.card = { c, t0, t1: 0 };
      busy(t0 + 0.4 + el.card.children.length * 0.1 + 1.6);
    },
    scroll(node, dy, t0, d, e) { S.scroll = { node, from: node.scrollTop, dy, t0, d, e }; busy(t0 + d); },

    frame(t) {
      const [s, x, y] = zoomAt(t), body = document.body.style, tf = s === 1 && !x && !y ? "" : `translate(${x}px, ${y}px) scale(${s})`;
      if (S.tf !== tf) { S.tf = tf; body.transformOrigin = "0 0"; body.transform = tf; } // write only on change: the write itself counts as a mutation
      if (S.scroll) { const c = S.scroll; c.node.scrollTop = c.from + c.dy * prog(t, c.t0, c.d, c.e); }

      let [cx, cy] = curAt(t);
      const m = S.menu, mp = m ? (t - m.t0) / m.d : 2;
      show(el.menu, mp >= 0 && mp < 1);
      if (mp >= 0 && mp < 1) { // the highlight steps row by row; the cursor glides with it
        const end = m.opts.length - 1, f = Math.min(1, mp / 0.85); // down to the last option, then back up to the one kept
        const at = m.pick !== null ? m.sel + E.inOut(f) * (m.pick - m.sel) : f < 0.65 ? m.sel + E.inOut(f / 0.65) * (end - m.sel) : end + E.inOut((f - 0.65) / 0.35) * (m.sel - end), i = Math.round(at);
        [...el.menu.children].forEach((r, k) => r.classList.toggle("on", k === i));
        el.menu.style.opacity = Math.min(1, mp * m.d / 0.1, (1 - mp) * m.d / 0.12);
        cy = m.rowY(at);
      }
      el.cur.style.transform = `translate(${cx}px, ${cy}px)`;
      show(el.cur, !(S.card && !(S.card.t1 && t >= S.card.t1))); // no cursor on a title card

      const r = S.rip, rp = r ? (t - r.t0) / 0.45 : 1;
      show(el.rip, rp >= 0 && rp < 1);
      if (rp < 1) { const R = 6 + 18 * E.out(rp); Object.assign(el.rip.style, { left: r.x - R + "px", top: r.y - R + "px", width: 2 * R + "px", height: 2 * R + "px", opacity: 0.7 * (1 - rp) }); }

      // ring: fades in where it first appears, glides from one target to the next
      const g = S.ring, n = g?.node?.isConnected ? g.node : null;
      let rr = null;
      if (n) {
        const live = ringRect(n);
        if (ringG.node !== n) Object.assign(ringG, { node: n, t0: t, from: g.fresh || !ringG.last ? null : ringG.last }), busy(t + MOVE);
        rr = ringG.last = glide(ringG, live, t);
        const a = g.fresh ? prog(t, g.t0, 0.3, "out") : 1;
        Object.assign(el.ring.style, { left: rr[0] + "px", top: rr[1] + "px", width: rr[2] + "px", height: rr[3] + "px", opacity: a });
      } else {
        ringG.node = ringG.last = null;
        const f = S.ringOut, fp = f ? (t - f.t0) / 0.3 : 1;
        if (fp < 1) Object.assign(el.ring.style, { left: f.rect[0] + "px", top: f.rect[1] + "px", width: f.rect[2] + "px", height: f.rect[3] + "px", opacity: 1 - E.out(fp) });
      }
      if (n) S.ringOut = null;
      show(el.ring, !!n || (S.ringOut && t - S.ringOut.t0 < 0.3));
      const num = (S.cap && !(S.old && t < S.old.t1) && S.cap.n) || "";
      if (el.rn.textContent !== String(num)) el.rn.textContent = num;
      if (rr) el.rn.style.top = el.rn.style.left = rr[1] < 16 ? "6px" : ""; // inside the ring when it touches the top edge

      // callout: the old one fades out in place, the new one fades in beside the ring and glides when the ring moves
      const o = S.old && t < S.old.t1 ? S.old : null, c = o ? null : S.cap;
      const op = o ? 1 - prog(t, o.t0, 0.2, "linear") : c && t >= c.t0 ? prog(t, c.t0, 0.3, "out") * (c.t1 ? 1 - prog(t, c.t1 - 0.25, 0.25, "linear") : 1) : 0;
      show(el.cap, op > 0);
      if (op > 0) {
        const k = o || c;
        if (el.t.textContent !== (k.title || "")) { el.t.textContent = k.title || ""; el.s.textContent = k.sub || ""; el.n.textContent = k.n || ""; }
        if (!o) {
          const fresh = capG.key !== c || capG.node !== ringG.node; // a new caption or a new target: choose the spot again
          const [px, py, side] = place(rr, el.cap.offsetWidth, el.cap.offsetHeight, c.side || (fresh ? null : capG.side));
          if (fresh || capG.side !== side) Object.assign(capG, { t0: t, from: capG.key === c && capG.last ? capG.last : null, key: c, side, node: ringG.node }), busy(t + MOVE);
          capG.last = glide(capG, [px, py], t);
        }
        const [px, py] = capG.last, side = capG.side, d = o ? 0 : 6 * (1 - op);
        const [dx, dy] = { below: [0, -d], above: [0, d], right: [-d, 0], left: [d, 0] }[side.split("-")[0]] || [0, d];
        el.cap.style.opacity = op;
        el.cap.style.transform = `translate(${px + dx}px, ${py + dy}px)`;
      }

      const cd = S.card;
      if (cd && cd.t1 && t >= cd.t1 + 0.5) S.card = null;
      show(el.card, !!S.card);
      if (S.card) {
        const pin = prog(t, cd.t0, 0.55, "out"), pout = cd.t1 ? prog(t, cd.t1, 0.5, "inOut") : 0;
        el.card.style.clipPath = `inset(${(1 - pin) * 100}% 0 ${pout * 100}% 0)`;
        [...el.card.children].forEach((n, i) => {
          const q = prog(t, cd.t0 + 0.25 + i * 0.1, 0.6, "out");
          n.style.opacity = q;
          n.style.transform = `translateY(${(1 - q) * 36}px)`;
        });
        el.card.querySelectorAll("b[data-i]").forEach((b) => {
          const x = cd.c.stats[+b.dataset.i], q = prog(t, cd.t0 + 0.45, 1.4, "out");
          b.innerHTML = `${Math.round(lerp(x.from || 0, x.to, q))}<small>${x.suffix || ""}</small>`;
        });
      }

      const k = S.key, kp = k ? t - k.t0 : 9;
      show(el.key, kp >= 0 && kp < 1.2);
      if (kp < 1.2) { el.key.textContent = k.label; el.key.style.opacity = Math.min(1, kp / 0.15, (1.2 - kp) / 0.3); }

      const changed = S.dirty || t <= S.until + 0.05;
      S.dirty = false;
      return changed;
    },
  };
})();
