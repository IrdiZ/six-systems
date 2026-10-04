"""Render the demo video from timeline.json: one cached segment per scene, joined into demo.mp4. See README.md.

python video/render.py [--only <scene>] [--force] [--preview]
"""
import argparse, base64, concurrent.futures as cf, functools, hashlib, html, http.server, json, os, re, subprocess, threading, time, urllib.parse, urllib.request
from pathlib import Path

RENDER_VERSION = "2"  # bump when capture or overlay logic changes in a way the hash cannot see
HERE = Path(__file__).resolve().parent
REPO = HERE.parent  # served over http, so the app's ../data and ../media resolve
CACHE = HERE / ".cache"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
# mulberry32: the app's Math.random() (request IDs, new upload links) repeats on every render
SEED = "(()=>{let s=20260527;Math.random=()=>{s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}})();"


def encode_args(fps):  # identical for every segment, each starts on a keyframe: concat with -c copy is safe
    return f"-c:v libx264 -preset medium -crf 23 -tune animation -pix_fmt yuv420p -r {fps} -g {fps * 10} -keyint_min {fps} -sc_threshold 0 -bf 0 -video_track_timescale 15360 -an".split()


def fonts(index):
    """Cache the Google Fonts CSS and font files once; pages get them by route interception (offline, deterministic)."""
    m = re.search(r'href="(https://fonts\.googleapis\.com/css2[^"]+)"', index.read_text(encoding="utf-8"))
    if not m:
        return None
    url = html.unescape(m.group(1))
    d = CACHE / "fonts" / hashlib.sha256(url.encode()).hexdigest()[:12]
    if not (d / "font.css").exists():
        get = lambda u: urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=30).read()
        try:
            css = get(url).decode()
            d.mkdir(parents=True, exist_ok=True)
            for u in re.findall(r"url\((https://fonts\.gstatic\.com/[^)]+)\)", css):
                (d / u.rsplit("/", 1)[1]).write_bytes(get(u))
            (d / "font.css").write_text(css, encoding="utf-8")
        except OSError as e:
            print(f"font download failed ({e}); rendering with the fallback font")
            return None
    return d


def digest(paths):
    h = hashlib.sha256()
    for p in paths:
        for f in sorted(p.rglob("*")) if p.is_dir() else [p]:
            if f.is_file():
                h.update(f.relative_to(REPO).as_posix().encode() + b"\0" + f.read_bytes())
    return h.hexdigest()


class Rec:
    """Drives one page and writes one video frame per tick; reuses the last JPEG when nothing changed."""

    def __init__(self, page, fps, enc, clip):
        self.page, self.fps, self.enc, self.clip = page, fps, enc, clip
        self.cdp = page.context.new_cdp_session(page)
        self.f = self.shots = self.force = 0
        self.debt, self.jpg = 0.0, None

    t = property(lambda self: self.f / self.fps)

    def frames(self, sec):
        self.debt += sec * self.fps
        n, self.debt = int(self.debt), self.debt - int(self.debt)
        for _ in range(n):
            if self.page.evaluate("t => __ov.frame(t)", self.t) or self.force > 0 or self.jpg is None:
                shot = self.cdp.send("Page.captureScreenshot", {"format": "jpeg", "quality": 92, "optimizeForSpeed": True, "clip": self.clip})
                self.jpg, self.shots = base64.b64decode(shot["data"]), self.shots + 1
            self.force -= 1
            self.enc.stdin.write(self.jpg)
            ms = lambda f: round(f * 1000 / self.fps)
            self.page.clock.run_for(ms(self.f + 1) - ms(self.f))
            self.f += 1

    def loc(self, sel):  # a selector, or a list of selectors: the first one with a visible match wins
        for _ in range(30):
            for s in [sel] if isinstance(sel, str) else sel:
                l = self.page.locator(s).filter(visible=True)
                if l.count():
                    return l.first
            time.sleep(0.1)
        raise RuntimeError(f"no visible element for {sel!r}")

    def settle(self):  # after an action: let images decode and capture every frame for a moment
        for _ in range(100):
            if self.page.evaluate("[...document.images].every(i => i.complete)"):
                break
            time.sleep(0.02)
        self.force = round(0.2 * self.fps)

    def step(self, st, live=True):
        if isinstance(st, str):
            st = {"route": st}
        pg = self.page
        ov = lambda fn, *a: live and pg.evaluate(f"a => __ov.{fn}(...a)", list(a))
        dur, ease = st.get("dur", 0.8), st.get("ease", "inOut")
        if "route" in st:
            pg.evaluate("h => (location.hash = h)", st["route"])
            self.settle()
        if "caption" in st:
            c = st["caption"] if isinstance(st["caption"], dict) or st["caption"] is None else {"text": st["caption"]}
            ov("caption", c and c["text"], self.t, c and c.get("dur"))
        if "ring" in st:
            ov("ring", st["ring"] and self.loc(st["ring"]).element_handle(), self.t)
        if "zoom" in st and live:
            z = st["zoom"]
            rect = isinstance(z, list) and all(isinstance(v, (int, float)) for v in z)
            ov("zoom", z if rect or z is None else self.loc(z).element_handle(), st.get("scale"), self.t, dur, ease)
            self.frames(dur)
        if "scroll" in st:
            node = self.loc(st["scroll"]).element_handle()
            if live:
                ov("scroll", node, st.get("by", 300), self.t, dur, ease)
                self.frames(dur)
            else:
                node.evaluate("(n, dy) => n.scrollBy(0, dy)", st.get("by", 300))
        if "click" in st:
            l = self.loc(st["click"])
            l.scroll_into_view_if_needed()
            b = l.bounding_box()
            x, y = b["x"] + b["width"] / 2, b["y"] + b["height"] / 2
            if live:
                ov("move", x, y, self.t, st.get("move", 0.7), "inOut")
                self.frames(st.get("move", 0.7))
            pg.mouse.click(x, y)
            ov("ripple", x, y, self.t)
            self.settle()
        if "key" in st:
            pg.keyboard.press(st["key"])
            ov("key", st.get("label", st["key"].upper() if len(st["key"]) == 1 else st["key"]), self.t)
            self.settle()
        if "type" in st:
            for ch in st["type"]:
                pg.keyboard.type(ch)
                if live:
                    self.frames(1 / st.get("cps", 18))
            self.settle()
        if live and st.get("hold"):
            self.frames(st["hold"])


def render_scene(scene, g, port, preview, fdir, out):
    from playwright.sync_api import sync_playwright

    fps, (W, H), (vw, vh) = g["fps"], g["size"], g["viewport"]
    q = urllib.parse.urlencode({**({"s": g["scenario"]} if g.get("scenario") else {}), "t": g["clock"]})
    origin = f"http://127.0.0.1:{port}/"
    setup = list(scene.get("setup", []))
    first = setup.pop(0) if setup and isinstance(setup[0], str) else ""
    fdir = fdir and Path(fdir)

    def net(route):  # the app from the local server, fonts from the cache, nothing else
        u = route.request.url
        if u.startswith(origin):
            return route.continue_()
        name = u.split("?")[0].rsplit("/", 1)[1]
        if fdir and u.startswith("https://fonts.googleapis.com/"):
            return route.fulfill(path=fdir / "font.css", content_type="text/css; charset=utf-8")
        if fdir and u.startswith("https://fonts.gstatic.com/") and (fdir / name).exists():
            return route.fulfill(path=fdir / name, headers={"Content-Type": "font/woff2", "Access-Control-Allow-Origin": "*"})
        route.abort()

    t0 = time.time()
    tmp = out + ".tmp.mp4"
    enc = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", str(fps), "-i", "-", *encode_args(fps), tmp],
                           stdin=subprocess.PIPE)
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        dsf = W / vw * (0.5 if preview else 1)  # render the page at output resolution: text is rasterised at full size
        page = b.new_page(viewport={"width": vw, "height": vh}, device_scale_factor=dsf)
        page.route("**/*", net)
        page.clock.install(time=g["clock"])
        page.clock.pause_at(g["clock"])
        cursor = "data:image/svg+xml;base64," + base64.b64encode((HERE / "cursor.svg").read_bytes()).decode()
        page.add_init_script(SEED + f"window.__CURSOR={json.dumps(cursor)};" + (HERE / "overlay.js").read_text(encoding="utf-8"))
        page.goto(f"{origin}{g['app']}?{q}{first}")
        page.evaluate("document.fonts.ready.then(() => 1)")
        r = Rec(page, fps, enc, {"x": 0, "y": 0, "width": vw, "height": vh, "scale": dsf})  # CDP captures CSS pixels unless scaled
        for st in setup:
            r.step(st, live=False)
        r.settle()
        page.evaluate("([x, y]) => __ov.cursor(x, y)", scene.get("cursor", g["cursor"]))
        for st in scene["steps"]:
            r.step(st)
        b.close()
    enc.stdin.close()
    if enc.wait():
        raise RuntimeError(f"ffmpeg failed for {scene['id']}")
    os.replace(tmp, out)
    return r.f, r.shots, time.time() - t0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", help="render only this scene id (others are taken from the cache)")
    ap.add_argument("--force", action="store_true", help="re-render even when the segment is cached")
    ap.add_argument("--preview", action="store_true", help="half resolution, separate cache and output (demo-preview.mp4)")
    a = ap.parse_args()

    tl = json.loads((HERE / "timeline.json").read_text(encoding="utf-8"))
    g = {k: v for k, v in tl.items() if k != "scenes"}
    scenes = tl["scenes"]
    if a.only and a.only not in [s["id"] for s in scenes]:
        raise SystemExit(f"no scene {a.only!r}; scenes: {', '.join(s['id'] for s in scenes)}")
    CACHE.mkdir(exist_ok=True)
    fdir = fonts(REPO / g["app"].split("?")[0])
    index = REPO / g["app"].split("?")[0]  # the page, the local files it loads, the media folder; not build outputs beside it
    loads = [index.parent / u for u in re.findall(r'(?:src|href)="(?!https?:|#)([^"?#]+)', index.read_text(encoding="utf-8"))]
    deps = digest([index, *loads, REPO / "docs/media", HERE / "overlay.js", HERE / "cursor.svg"] + ([fdir] if fdir else []))
    prefix = "pre-" if a.preview else "seg-"

    def seg(s):
        key = "\n".join([json.dumps(s, sort_keys=True, separators=(",", ":")), json.dumps(g, sort_keys=True), deps, " ".join(encode_args(g["fps"])), RENDER_VERSION, prefix])
        return CACHE / f"{prefix}{hashlib.sha256(key.encode()).hexdigest()[:16]}.mp4"

    segs = {s["id"]: seg(s) for s in scenes}
    todo = [s for s in scenes if (not a.only or s["id"] == a.only) and (a.force or not segs[s["id"]].exists())]
    for s in scenes:
        if s not in todo:
            print(f"{s['id']:<14} {'cached' if segs[s['id']].exists() else 'missing'}")

    if todo:
        h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(REPO))
        h.func.log_message = lambda *x: None
        srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), h)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        t0 = time.time()
        with cf.ProcessPoolExecutor(min(4, len(todo))) as ex:
            jobs = {ex.submit(render_scene, s, g, srv.server_port, a.preview, fdir and str(fdir), str(segs[s["id"]])): s["id"] for s in todo}
            for j in cf.as_completed(jobs):
                try:
                    n, shots, sec = j.result()
                    print(f"{jobs[j]:<14} rendered  {sec:5.1f} s  ({n / g['fps']:.1f} s of video, {shots}/{n} frames captured)")
                except Exception as e:
                    print(f"{jobs[j]:<14} FAILED    {str(e).strip().splitlines()[0]}")
        srv.shutdown()
        print(f"rendering took {time.time() - t0:.1f} s")

    keep = set(segs.values())
    for f in CACHE.glob(prefix + "*.mp4"):
        if f not in keep:
            f.unlink()
    missing = [i for i, p in segs.items() if not p.exists()]
    if missing:
        return print(f"not joined: {', '.join(missing)} not rendered yet")
    (CACHE / "list.txt").write_text("".join(f"file '{segs[s['id']].name}'\n" for s in scenes), encoding="utf-8")
    out = HERE / ("demo-preview.mp4" if a.preview else "demo.mp4")
    tmp = out.with_suffix(".tmp.mp4")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(CACHE / "list.txt"), "-c", "copy", "-movflags", "+faststart", str(tmp)], check=True)
    try:
        os.replace(tmp, out)
    except PermissionError:
        return print(f"{out.name} is open in another program; the new video is at {tmp}")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
