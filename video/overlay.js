// Demo overlay, injected by render.py: cursor, click ripple, highlight ring, caption, key chip, zoom, scroll.
// Nothing here reads the clock: render.py starts tweens at a time t, then calls __ov.frame(t) once per video frame.
// frame(t) returns true when the picture may have changed (a tween is running or the app's DOM mutated).
(() => {
  const E = { linear: (p) => p, out: (p) => 1 - (1 - p) ** 3, inOut: (p) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2) };
  const lerp = (a, b, p) => a + (b - a) * p;
  const prog = (t, t0, d, e = "inOut") => (d > 0 ? (E[e] || E.inOut)(Math.max(0, Math.min(1, (t - t0) / d))) : 1);
  const S = { cur: { a: [0, 0], b: [0, 0], t0: 0, d: 0 }, zoom: { a: [1, 0, 0], b: [1, 0, 0], t0: 0, d: 0 }, rip: null, ring: null, cap: null, old: null, key: null, scroll: null, until: 0, dirty: true };
  const busy = (t1) => (S.until = Math.max(S.until, t1));
  let el = {};

  const CSS = `
    #__ov, #__ov * { box-sizing: border-box; pointer-events: none; }
    #__ov { position: fixed; inset: 0; z-index: 2147483647; font-family: var(--font, "Segoe UI", sans-serif); }
    #__ov .cur { position: absolute; left: 0; top: 0; width: 24px; height: 24px; margin: -2px 0 0 -3px; filter: drop-shadow(0 1px 2px rgba(0,0,0,.35)); }
    #__ov .rip { position: absolute; border: 2px solid #1d6fa5; border-radius: 50%; }
    #__ov .ring { position: absolute; border: 2px solid #1d6fa5; border-radius: 6px; box-shadow: 0 0 0 4px rgba(29,111,165,.16); }
    #__ov .cap { position: absolute; left: 50%; bottom: 64px; width: max-content; max-width: 78%; padding: 12px 24px; border-radius: 6px;
      background: rgba(22,26,30,.9); backdrop-filter: blur(6px); color: #f3f5f7; font-size: 20px; line-height: 1.4; text-align: center; text-wrap: balance;
      box-shadow: 0 6px 24px rgba(22,26,30,.22); }
    #__ov .key { position: absolute; right: 24px; bottom: 64px; min-width: 44px; padding: 8px 14px; border-radius: 6px; text-align: center;
      background: rgba(22,26,30,.86); color: #f3f5f7; font-size: 19px; font-weight: 600; border-bottom: 3px solid #4a5560; }`;

  function mount() {
    const root = document.createElement("div");
    root.id = "__ov";
    root.innerHTML = `<style>${CSS}</style><div class="ring"></div><div class="rip"></div><div class="cap"></div><div class="key"></div><img class="cur" src="${window.__CURSOR || ""}">`;
    document.documentElement.append(root); // outside <body>, so the zoom on <body> leaves the overlay alone
    for (const k of ["ring", "rip", "cap", "key", "cur"]) el[k] = root.querySelector("." + k);
    new MutationObserver(() => (S.dirty = true)).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", mount) : mount();

  const curAt = (t) => { const c = S.cur, p = prog(t, c.t0, c.d, c.e); return [lerp(c.a[0], c.b[0], p), lerp(c.a[1], c.b[1], p)]; };
  const zoomAt = (t) => { const z = S.zoom, p = prog(t, z.t0, z.d, z.e); return z.a.map((v, i) => lerp(v, z.b[i], p)); };
  const show = (n, on) => (n.style.display = on ? "" : "none");

  window.__ov = {
    cursor(x, y) { S.cur = { a: [x, y], b: [x, y], t0: 0, d: 0 }; },
    move(x, y, t0, d, e) { S.cur = { a: curAt(t0), b: [x, y], t0, d, e }; busy(t0 + d); },
    ripple(x, y, t0) { S.rip = { x, y, t0 }; busy(t0 + 0.5); },
    ring(node, t0) { S.ring = node ? { node, t0 } : null; busy(t0 + 0.3); },
    key(label, t0) { S.key = { label, t0 }; busy(t0 + 1.2); },
    caption(text, t0, d) {
      const prev = S.cap && (!S.cap.t1 || S.cap.t1 > t0) ? S.cap : null;
      S.old = prev ? { text: prev.text, t0, t1: t0 + 0.25 } : null;
      S.cap = text ? { text, t0: t0 + (prev ? 0.25 : 0), t1: d ? t0 + d : 0 } : null;
      busy(t0 + 0.6);
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

      const g = S.ring, n = g?.node;
      show(el.ring, n?.isConnected);
      if (n?.isConnected) {
        const b = n.getBoundingClientRect(), x0 = Math.max(3, b.left - 4), y0 = Math.max(3, b.top - 4); // kept inside the screen
        const x1 = Math.min(innerWidth - 3, b.right + 4), y1 = Math.min(innerHeight - 3, b.bottom + 4);
        Object.assign(el.ring.style, { left: x0 + "px", top: y0 + "px", width: x1 - x0 + "px", height: y1 - y0 + "px", opacity: prog(t, g.t0, 0.3, "out") });
      }

      // caption: the old one fades out, then the new one fades in and rises 6px; a timed one fades out at its end
      const o = S.old && t < S.old.t1 ? S.old : null, c = S.cap;
      const op = o ? 1 - prog(t, o.t0, 0.25, "linear") : c && t >= c.t0 ? prog(t, c.t0, 0.35, "out") * (c.t1 ? 1 - prog(t, c.t1 - 0.3, 0.3, "linear") : 1) : 0;
      show(el.cap, op > 0);
      if (op > 0) {
        const text = o ? o.text : c.text;
        if (el.cap.textContent !== text) el.cap.textContent = text;
        el.cap.style.opacity = op;
        el.cap.style.transform = `translate(-50%, ${o ? 0 : 6 * (1 - op)}px)`;
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
