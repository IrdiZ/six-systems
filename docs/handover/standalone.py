"""Build the handover UI as one HTML file that opens from disk: styles, scripts, cases and images inlined.

    python docs/handover/standalone.py [out.html]      (default: docs/handover/handover-standalone.html)
Fonts still come from Google Fonts, so the file needs internet for the typeface only.
"""
import base64, json, mimetypes, pathlib, sys

here = pathlib.Path(__file__).parent
docs = here.parent
out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else here / "handover-standalone.html"

read = lambda p: (here / p).read_text(encoding="utf-8")
media = {f.name: f"data:{mimetypes.guess_type(f.name)[0]};base64,{base64.b64encode(f.read_bytes()).decode()}"
         for f in sorted((docs / "media").iterdir()) if f.is_file()}
html = read("index.html")
for tag, body in [('<link rel="stylesheet" href="style.css">', f"<style>\n{read('style.css')}</style>"),
                  ('<script src="../data/cases.js"></script>', f"<script>{(docs / 'data' / 'cases.js').read_text(encoding='utf-8')}</script>\n"
                                                               f"<script>window.MEDIA_DATA = {json.dumps(media)};</script>"),
                  ('<script src="scenarios.js"></script>', f"<script>\n{read('scenarios.js')}</script>"),
                  ('<script src="app.js"></script>', f"<script>\n{read('app.js')}</script>")]:
    assert html.count(tag) == 1, tag
    html = html.replace(tag, body)
out.write_text(html, encoding="utf-8")
print(f"{out} {out.stat().st_size / 1e6:.1f} MB, {len(media)} images")
