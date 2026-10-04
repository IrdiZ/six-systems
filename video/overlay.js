// Demo overlay, injected by render.py: cursor, click ripple, highlight ring, callout, key chip, zoom, scroll.
// Nothing here reads the clock: render.py starts tweens at a time t, then calls __ov.frame(t) once per video frame.
// frame(t) returns true when the picture may have changed (a tween is running or the app's DOM mutated).
// The callout sits next to the ring (below, above, right, left: the first side that fits), so the eye stays put.
(() => {
  const E = { linear: (p) => p, out: (p) => 1 - (1 - p) ** 3, inOut: (p) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2) };
  const lerp = (a, b, p) => a + (b - a) * p;
  const prog = (t, t0, d, e = "inOut") => (d > 0 ? (E[e] || E.inOut)(Math.max(0, Math.min(1, (t - t0) / d))) : 1);
  const S = { cur: { a: [0, 0], b: [0, 0], t0: 0, d: 0 }, zoom: { a: [1, 0, 0], b: [1, 0, 0], t0: 0, d: 0 }, rip: null, ring: null, cap: null, old: null, key: null, scroll: null, until: 0, dirty: true };
  const busy = (t1) => (S.until = Math.max(S.until, t1));
  const FONT = "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap";
  const PAD = 6, GAP = 14, SAFE = 20, MOVE = 0.5; // ring padding, ring-to-callout gap, screen margin (CSS px); glide time (s)
  let el = {};

  const CSS = `
    #__ov, #__ov * { box-sizing: border-box; pointer-events: none; }
    #__ov { position: fixed; inset: 0; z-index: 2147483647; font-family: Geist, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; }
    #__ov .cur { position: absolute; left: 0; top: 0; width: 24px; height: 24px; margin: -2px 0 0 -3px; filter: drop-shadow(0 1px 2px rgba(0,0,0,.35)); }
    #__ov .rip { position: absolute; border: 2px solid #1d6fa5; border-radius: 50%; }
    #__ov .ring { position: absolute; border: 2px solid #1d6fa5; border-radius: 7px; box-shadow: 0 0 0 5px rgba(29,111,165,.13); }
    #__ov .cap { position: absolute; left: 0; top: 0; width: max-content; max-width: 400px; padding: 13px 18px 14px; border-radius: 8px;
      background: #15191e; color: #fff; box-shadow: 0 12px 32px rgba(15,20,25,.22), 0 2px 6px rgba(15,20,25,.14); }
    #__ov .cap .t { font-size: 20px; line-height: 1.25; font-weight: 600; letter-spacing: -.012em; text-wrap: balance; }
    #__ov .cap .s { margin-top: 4px; font-size: 15px; line-height: 1.4; font-weight: 400; color: rgba(255,255,255,.7); text-wrap: pretty; }
    #__ov .cap .s:empty { display: none; }
    #__ov .key { position: absolute; right: 24px; bottom: 24px; min-width: 40px; padding: 7px 13px 8px; border-radius: 7px; text-align: center;
      background: #15191e; color: #fff; font-size: 16px; font-weight: 600; box-shadow: 0 6px 18px rgba(15,20,25,.2), inset 0 -2px 0 rgba(255,255,255,.14); }`;

  function mount() {
    const root = document.createElement("div");
    root.id = "__ov";
    root.innerHTML = `<link rel="stylesheet" href="${FONT}"><style>${CSS}</style><div class="ring"></div><div class="rip"></div><div class="cap"><div class="t"></div><div class="s"></div></div><div class="key"></div><img class="cur" src="${window.__CURSOR || ""}">`;
    document.documentElement.append(root); // outside <body>, so the zoom on <body> leaves the overlay alone
    for (const k of ["ring", "rip", "cap", "key", "cur"]) el[k] = root.querySelector("." + k);
    el.t = el.cap.querySelector(".t"), el.s = el.cap.querySelector(".s");
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

  function place(r, w, h, prefer) { // the callout's [x, y, side] next to rect r; null r = lower left
    const W = innerWidth, H = innerHeight;
    if (!r) return [SAFE + 4, H - SAFE - 4 - h, "none"];
    const [x, y, rw, rh] = r, fx = clamp(x, SAFE, W - SAFE - w), fy = clamp(y, SAFE, H - SAFE - h);
    const sides = {
      below: y + rh + GAP + h <= H - SAFE && [fx, y + rh + GAP],
      above: y - GAP - h >= SAFE && [fx, y - GAP - h],
      right: x + rw + GAP + w <= W - SAFE && [x + rw + GAP, fy],
      left: x - GAP - w >= SAFE && [x - GAP - w, fy],
    };
    for (const s of [prefer, "below", "above", "right", "left"]) if (s && sides[s]) return [...sides[s], s];
    return [clamp(x + 12, SAFE, W - SAFE - w), clamp(y + rh - h - 12, SAFE, H - SAFE - h), "inside"]; // target fills the screen
  }

  window.__ov = {
    ready: () => Promise.all(["400", "600"].map((w) => document.fonts.load(`${w} 16px Geist`))).then(() => document.fonts.ready),
    cursor(x, y) { S.cur = { a: [x, y], b: [x, y], t0: 0, d: 0 }; },
    move(x, y, t0, d, e) { S.cur = { a: curAt(t0), b: [x, y], t0, d, e }; busy(t0 + d); },
    ripple(x, y, t0) { S.rip = { x, y, t0 }; busy(t0 + 0.5); },
    ring(node, t0) { S.ring = node ? { node, t0, fresh: !S.ring } : null; busy(t0 + MOVE); },
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
    scroll(node, dy, t0, d, e) { S.scroll = { node, from: node.scrollTop, dy, t0, d, e }; busy(t0 + d); },

    frame(t) {
      const [s, x, y] = zoomAt(t), body = document.body.style, tf = s === 1 && !x && !y ? "" : `translate(${x}px, ${y}px) scale(${s})`;
      if (S.tf !== tf) { S.tf = tf; body.transformOrigin = "0 0"; body.transform = tf; } // write only on change: the write itself counts as a mutation
      if (S.scroll) { const c = S.scroll; c.node.scrollTop = c.from + c.dy * prog(t, c.t0, c.d, c.e); }

      const [cx, cy] = curAt(t);
      el.cur.style.transform = `translate(${cx}px, ${cy}px)`;

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
      } else ringG.node = ringG.last = null;
      show(el.ring, !!n);

      // callout: the old one fades out in place, the new one fades in beside the ring and glides when the ring moves
      const o = S.old && t < S.old.t1 ? S.old : null, c = o ? null : S.cap;
      const op = o ? 1 - prog(t, o.t0, 0.2, "linear") : c && t >= c.t0 ? prog(t, c.t0, 0.3, "out") * (c.t1 ? 1 - prog(t, c.t1 - 0.25, 0.25, "linear") : 1) : 0;
      show(el.cap, op > 0);
      if (op > 0) {
        const k = o || c;
        if (el.t.textContent !== (k.title || "")) { el.t.textContent = k.title || ""; el.s.textContent = k.sub || ""; }
        if (!o) {
          const [px, py, side] = place(rr, el.cap.offsetWidth, el.cap.offsetHeight, c.side || capG.side);
          if (capG.key !== c || capG.side !== side) Object.assign(capG, { t0: t, from: capG.key === c && capG.last ? capG.last : null, key: c, side }), busy(t + MOVE);
          capG.last = glide(capG, [px, py], t);
        }
        const [px, py] = capG.last, side = capG.side, d = o ? 0 : 6 * (1 - op);
        const [dx, dy] = { below: [0, -d], above: [0, d], right: [-d, 0], left: [d, 0] }[side] || [0, d];
        el.cap.style.opacity = op;
        el.cap.style.transform = `translate(${px + dx}px, ${py + dy}px)`;
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
