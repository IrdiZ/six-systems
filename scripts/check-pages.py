"""Check the three public pages before a release.

Run `python scripts/check-pages.py` to check the local `docs/` directory.
Run `python scripts/check-pages.py --base-url https://irdiz.github.io/six-systems/` to check the live site.
Exit code 0: no check failed. Exit code 1: one check or more failed.

Result words:
  PASS         the thing was checked and is correct.
  FAIL         the thing was checked and is wrong.
  NOT PRESENT  the thing does not exist, so it was NOT checked. This is not a pass.
  KNOWN ISSUE  the thing is wrong on `main` and is listed in this file. It does not fail the run.
  SKIPPED      a flag turned the check off.
  INFO         a measured value with no pass or fail rule.
"""

import argparse
import functools
import http.server
import re
import sys
import threading
import time
from pathlib import Path
from urllib.parse import urljoin, urlsplit

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import sync_playwright

REPO = Path(__file__).resolve().parent.parent
OUT_DIR = Path(__file__).resolve().parent / "out"

VIEWPORTS = [(1440, 900), (390, 844)]

# `rendered` is a selector that must hold text after the page scripts ran.
# `data_n` says that the page must have `[data-n]` elements.
# `demos` says that the page has the feature demos, so it also gets a reduced-motion pass.
# `requests` is the full list of same-site paths that the page may load.
PAGES = [
    {
        "path": "explained.html",
        "slug": "explained",
        "rendered": "h1",
        "data_n": True,
        "demos": True,
        "requests": re.compile(r"^(explained\.html|style\.css|data/cases\.js|media/.+|explain-demos\.(js|css))$"),
    },
    {"path": "index.html", "slug": "index", "rendered": "#stats", "data_n": False, "demos": False, "requests": None},
    {"path": "handover/", "slug": "handover", "rendered": "#app", "data_n": False, "demos": False, "requests": None},
]

# Checks that fail on `main` at bd352f5, as (page, width, check): reason. They are reported and do not fail the run.
# The clinical tool is a desktop layout: at 390 px `body` clips about 500 px of content. Remove the entry when that is fixed.
KNOWN_ISSUES = {
    ("handover/", 390, "horizontal overflow"): "the clinical tool has no phone layout",
}

FONT_HOSTS = {"fonts.googleapis.com", "fonts.gstatic.com"}
DEMO_FILES = ("explain-demos.js", "explain-demos.css")

# Page-weight budgets from the execution plan, section 2. One KB is 1024 bytes.
# Sizes are counted with LF line ends, because a Windows checkout has CRLF and the live site has LF.
KB = 1024
EXPLAINED_BASELINE = 25138  # `docs/explained.html` at commit bd352f5, LF line ends.
BUDGETS = {
    "explained.html": EXPLAINED_BASELINE + 6 * KB,
    "explain-demos.js": 14 * KB,
    "explain-demos.css": 6 * KB,
}

PASS, FAIL, ABSENT, KNOWN, SKIPPED, INFO = "PASS", "FAIL", "NOT PRESENT", "KNOWN ISSUE", "SKIPPED", "INFO"

SCROLL_THROUGH = """async () => {
  const step = window.innerHeight;
  for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 50));
  }
  // End on a demo, not at the top: a demo that is out of view has no animation, so a check there cannot fail.
  const demo = document.querySelector(".demo-frame");
  if (demo) {
    demo.scrollIntoView({ block: "center" });
    await new Promise((r) => setTimeout(r, 350));
  } else {
    window.scrollTo(0, 0);
  }
}"""

MEASURE = """(renderedSelector) => {
  const root = document.documentElement;
  const name = (el) => el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") +
    (typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\\s+/).join(".") : "");

  // Elements that reach past the right edge and are not inside a box that scrolls or clips.
  const clipped = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (getComputedStyle(p).overflowX !== "visible") return true;
    }
    return false;
  };
  // `body` can clip its own content (the clinical tool sets `overflow: hidden`), so measure it too.
  const scrollWidth = Math.max(root.scrollWidth, document.body.scrollWidth);
  const wide = [];
  if (scrollWidth > root.clientWidth) {
    for (const el of document.body.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > root.clientWidth + 1 && getComputedStyle(el).position !== "fixed" && !clipped(el)) wide.push([Math.round(r.right), name(el)]);
    }
    wide.sort((a, b) => b[0] - a[0]);
  }

  const dataN = [...document.querySelectorAll("[data-n]")];
  const bad = dataN.filter((el) => /^(|undefined|null|NaN)$/.test(el.textContent.trim()));

  const label = (el) => (el && el.getAttribute("aria-label") || "").trim();
  const mounts = [...document.querySelectorAll(".demo[data-demo]")];
  const built = mounts.filter((el) => el.childElementCount > 0);
  const unlabelled = built.filter((el) => !label(el) && !label(el.querySelector(".demo-frame"))).map((el) => el.dataset.demo);
  const strayFrames = [...document.querySelectorAll(".demo-frame")].filter((el) => !el.closest(".demo[data-demo]"));
  const strayUnlabelled = strayFrames.filter((el) => !label(el));

  // Parts of a demo that still have a CSS animation.
  const animated = [];
  for (const top of [...built, ...strayFrames]) {
    for (const el of [top, ...top.querySelectorAll("*")]) {
      for (const pseudo of [null, "::before", "::after"]) {
        const a = getComputedStyle(el, pseudo).animationName;
        if (a && a !== "none") animated.push(name(el) + (pseudo || "") + " (" + a + ")");
      }
    }
  }

  const rendered = document.querySelector(renderedSelector);
  return {
    scrollWidth,
    clientWidth: root.clientWidth,
    wide: wide.slice(0, 3).map((w) => w[1] + " ends at " + w[0] + " px"),
    dataN: dataN.length,
    dataNBad: bad.map((el) => el.dataset.n + '="' + el.textContent.trim() + '"'),
    mounts: mounts.length,
    built: built.length,
    unlabelled,
    strayFrames: strayFrames.length,
    strayUnlabelled: strayUnlabelled.length,
    animated,
    renderedChars: rendered ? rendered.innerText.trim().length : -1,
  };
}"""


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def start_server(docs_dir):
    handler = functools.partial(QuietHandler, directory=str(docs_dir))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def short(items, limit=5):
    items = list(items)
    text = "; ".join(items[:limit])
    return text + (f"; and {len(items) - limit} more" if len(items) > limit else "")


def relative_path(url, base_url):
    """The path of a same-site URL below the base URL, or None for another site."""
    u, b = urlsplit(url), urlsplit(base_url)
    if (u.scheme, u.netloc) != (b.scheme, b.netloc) or not u.path.startswith(b.path):
        return None
    return u.path[len(b.path):]


def check_page(browser, page_def, width, height, reduced, base_url, skip_demos):
    """Open one page at one width. Return the (result, check, detail) rows and a retry flag.

    The retry flag is true when a request to another site (the fonts) had a network error.
    """
    url = urljoin(base_url, page_def["path"])
    context = browser.new_context(
        viewport={"width": width, "height": height},
        reduced_motion="reduce" if reduced else "no-preference",
    )
    page = context.new_page()
    console_errors, console_warnings, requested = [], [], []
    failed = {}  # URL -> reason. An HTTP status replaces a network error for the same URL.

    def on_console(msg):
        if msg.type == "error":
            console_errors.append((msg.text, msg.location.get("url", "")))
        elif msg.type == "warning":
            console_warnings.append(msg.text)

    page.on("console", on_console)
    page.on("pageerror", lambda err: console_errors.append((f"uncaught: {err}", "")))
    page.on("request", lambda req: requested.append(req.url))
    page.on("response", lambda res: res.status >= 400 and failed.update({res.url: f"HTTP {res.status}"}))
    page.on("requestfailed", lambda req: failed.setdefault(req.url, req.failure or "request failed"))

    rows = []
    name = page_def["slug"] + f"-{width}" + ("-reduced" if reduced else "")
    try:
        page.goto(url, wait_until="load", timeout=30000)
        try:
            page.wait_for_load_state("networkidle", timeout=10000)
        except PlaywrightError:
            rows.append((INFO, "network idle", "the network was not idle after 10 s"))
        # Scroll through the page, so that code that starts when a part comes into view also runs.
        page.evaluate(SCROLL_THROUGH)
        page.wait_for_timeout(300)
        m = page.evaluate(MEASURE, page_def["rendered"])
        OUT_DIR.mkdir(exist_ok=True)
        page.screenshot(path=str(OUT_DIR / f"{name}.png"), full_page=True)
    except PlaywrightError as err:
        rows.append((FAIL, "page load", str(err).splitlines()[0]))
        context.close()
        return rows, False
    context.close()

    requested = [u for u in requested if not u.startswith("data:")]
    selector = page_def["rendered"]
    if m["renderedChars"] > 0:
        rows.append((PASS, "page rendered", f"`{selector}` has {m['renderedChars']} characters of text"))
    else:
        rows.append((FAIL, "page rendered", f"`{selector}` is missing or has no text"))

    # A request that failed also writes a console error. Report it one time, as a failed request.
    errors = [text for text, loc in console_errors if loc not in failed]
    rows.append((FAIL if errors else PASS, "console errors", short(errors) if errors else "0"))
    rows.append((INFO, "console warnings", f"{len(console_warnings)}: {short(console_warnings)}" if console_warnings else "0"))

    tolerated = [f for f in failed.items() if skip_demos and relative_path(f[0], base_url) in DEMO_FILES]
    real = [f for f in failed.items() if f not in tolerated]
    detail = short(f"{why} {u}" for u, why in real) if real else f"0 of {len(requested)} requests"
    rows.append((FAIL if real else PASS, "failed requests", detail))
    if tolerated:
        rows.append((SKIPPED, "demo file requests", short(f"{why} {u}" for u, why in tolerated) + " (--skip-demos)"))

    unexpected = []
    for u in dict.fromkeys(requested):
        rel = relative_path(u, base_url)
        if rel is None:
            if urlsplit(u).netloc not in FONT_HOSTS:
                unexpected.append(u)
        elif page_def["requests"] and not page_def["requests"].match(rel):
            unexpected.append(u)
    rule = "the fixed list for this page" if page_def["requests"] else "this site and Google Fonts"
    rows.append((FAIL, "unexpected requests", short(unexpected)) if unexpected
                else (PASS, "unexpected requests", f"0, all requests are in {rule}"))

    if m["scrollWidth"] > m["clientWidth"]:
        rows.append((FAIL, "horizontal overflow",
                     f"scrollWidth {m['scrollWidth']} > clientWidth {m['clientWidth']}. Widest: {short(m['wide']) or 'not found'}"))
    else:
        rows.append((PASS, "horizontal overflow", f"none, scrollWidth {m['scrollWidth']} = clientWidth {m['clientWidth']}"))

    if m["dataNBad"]:
        rows.append((FAIL, "empty [data-n]", f"{len(m['dataNBad'])} of {m['dataN']}: {short(m['dataNBad'])}"))
    elif m["dataN"]:
        rows.append((PASS, "empty [data-n]", f"0 of {m['dataN']}"))
    elif page_def["data_n"]:
        rows.append((FAIL, "empty [data-n]", "this page must have [data-n] elements and has 0"))
    else:
        rows.append((ABSENT, "empty [data-n]", "this page has no [data-n] elements"))

    rows += demo_rows(m, reduced, skip_demos) if page_def["demos"] else []
    for i, (result, check, detail) in enumerate(rows):
        reason = KNOWN_ISSUES.get((page_def["path"], width, check))
        if result == FAIL and reason:
            rows[i] = (KNOWN, check, f"{detail}. Known: {reason}")
    retry = any(relative_path(u, base_url) is None and not why.startswith("HTTP") for u, why in real)
    return rows, retry


def demo_rows(m, reduced, skip_demos):
    rows = []
    if skip_demos:
        rows.append((SKIPPED, "demo labels", "--skip-demos"))
        return rows
    demos = m["built"] + m["strayFrames"]
    if not demos:
        why = f"{m['mounts']} mount points, 0 demos built" if m["mounts"] else "no `.demo[data-demo]` on this page"
        rows.append((ABSENT, "demo labels", why))
        if reduced:
            rows.append((ABSENT, "demo motion off", why))
        return rows
    count = f"{m['built']} of {m['mounts']} mount points have a demo"
    missing = [f"demo `{slug}`" for slug in m["unlabelled"]]
    if m["strayUnlabelled"]:
        missing.append(f"{m['strayUnlabelled']} `.demo-frame` outside a mount point")
    if m["built"] < m["mounts"]:
        rows.append((FAIL, "demos built", f"{count}. A demo that does not build leaves an empty card"))
    rows.append((FAIL, "demo labels", f"{count}. No aria-label: {short(missing, 8)}") if missing
                else (PASS, "demo labels", f"{count}. Each has an aria-label"))
    if reduced:
        rows.append((FAIL, "demo motion off", f"{len(m['animated'])} parts still animate: {short(m['animated'])}") if m["animated"]
                    else (PASS, "demo motion off", "no demo part has a CSS animation"))
    return rows


def check_weight(browser, base_url, skip_demos):
    rows = []
    context = browser.new_context()
    for name, budget in BUDGETS.items():
        check = f"weight {name}"
        if skip_demos and name in DEMO_FILES:
            rows.append((SKIPPED, check, "--skip-demos"))
            continue
        try:
            res = context.request.get(urljoin(base_url, name), timeout=30000)
        except PlaywrightError as err:
            rows.append((FAIL, check, str(err).splitlines()[0]))
            continue
        if res.status == 404 and name in DEMO_FILES:
            rows.append((ABSENT, check, "HTTP 404, the file is not on this site"))
            continue
        if res.status != 200:
            rows.append((FAIL, check, f"HTTP {res.status}"))
            continue
        body = res.body()
        size = len(body.replace(b"\r\n", b"\n"))
        detail = f"{size} bytes with LF line ends ({len(body)} as served), budget {budget}"
        if name == "explained.html":
            detail += f" = {EXPLAINED_BASELINE} at bd352f5 + {6 * KB}"
        rows.append((PASS if size <= budget else FAIL, check, detail))
    context.close()
    return rows


def main():
    parser = argparse.ArgumentParser(description="Check the public pages: errors, requests, overflow, numbers, demos, page weight.")
    names = [p["path"] for p in PAGES]
    parser.add_argument("--base-url", help="check this site (for example the live site) and do not start a local server")
    parser.add_argument("--docs-dir", type=Path, default=REPO / "docs", help="directory that the local server serves (default: docs/)")
    parser.add_argument("--page", action="append", choices=names, help="check only this page; repeat the flag for more pages")
    parser.add_argument("--skip-demos", action="store_true", help="skip the demo checks and accept a 404 on the two demo files")
    parser.add_argument("--reduced-motion", action="store_true", help="run every pass with prefers-reduced-motion: reduce")
    args = parser.parse_args()
    sys.stdout.reconfigure(errors="replace")

    server = None
    if args.base_url:
        base_url = args.base_url.rstrip("/") + "/"
    else:
        if not args.docs_dir.is_dir():
            print(f"FAIL: {args.docs_dir} is not a directory")
            return 1
        server = start_server(args.docs_dir)
        base_url = f"http://127.0.0.1:{server.server_address[1]}/"

    pages = [p for p in PAGES if not args.page or p["path"] in args.page]
    started = time.time()
    sections = []
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            for page_def in pages:
                for width, height in VIEWPORTS:
                    # A page with demos gets a normal pass and a reduced-motion pass.
                    if args.reduced_motion:
                        modes = [True]
                    elif page_def["demos"] and not args.skip_demos:
                        modes = [False, True]
                    else:
                        modes = [False]
                    for reduced in modes:
                        title = f"{page_def['path']} at {width}x{height}, motion {'reduced' if reduced else 'normal'}"
                        call = (browser, page_def, width, height, reduced, base_url, args.skip_demos)
                        rows, retry = check_page(*call)
                        if retry:
                            # The fonts come from another site. Do not fail a release for one network error there.
                            rows = [(INFO, "retry", "first pass had a network error on another site; this is the second pass")]
                            rows += check_page(*call)[0]
                        sections.append((title, rows))
            if any(p["demos"] for p in pages):
                sections.append(("page weight", check_weight(browser, base_url, args.skip_demos)))
            browser.close()
    finally:
        if server:
            server.shutdown()
            server.server_close()

    print(f"Site: {base_url}" + (f" (local server for {args.docs_dir})" if server else ""))
    totals = {PASS: 0, FAIL: 0, ABSENT: 0, KNOWN: 0, SKIPPED: 0, INFO: 0}
    failures = []
    for title, rows in sections:
        print(f"\n== {title} ==")
        for result, check, detail in rows:
            totals[result] += 1
            print(f"  {result:<11}  {check:<24}  {detail}")
            if result == FAIL:
                failures.append(f"{title}: {check}: {detail}")

    print(f"\nScreenshots: {OUT_DIR}")
    print(f"Time: {time.time() - started:.1f} s")
    print(f"Total: {totals[PASS]} passed, {totals[FAIL]} failed, {totals[ABSENT]} not present, "
          f"{totals[KNOWN]} known issues, {totals[SKIPPED]} skipped.")
    if totals[ABSENT]:
        print("NOT PRESENT means that the thing does not exist on this site, so the script did not check it. It is not a pass.")
    if totals[KNOWN]:
        print("KNOWN ISSUE means that the check failed and that KNOWN_ISSUES in this script lists the failure. It is not a pass.")
    if failures:
        print("\nFAILED:")
        for line in failures:
            print(f"  - {line}")
        print("\nRESULT: FAIL")
        return 1
    print("\nRESULT: OK, no check failed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
