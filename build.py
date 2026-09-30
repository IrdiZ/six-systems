"""One command: simulate → assemble → export → publish the viewer data into docs/.

    uv run python build.py
"""

import json
import shutil
from pathlib import Path

from assemble import run as assemble
from export import deid
from sim import run as sim

ROOT = Path(__file__).resolve().parent
DOCS = ROOT / "docs"


def main() -> None:
    sim.main()
    assemble.main()
    deid.main()

    cases = json.loads((ROOT / "out" / "cases.json").read_text())
    for p in cases["patients"]:
        for d in p["documents"]:
            if d["kind"] in ("hl7", "edi"):
                d["raw"] = (ROOT / d["file"]).read_bytes().decode().replace("\r", "\n").strip()
    for u in cases["unlinked"]:
        u["raw"] = (ROOT / u["file"]).read_text().strip()

    media = DOCS / "media"
    if media.exists():
        shutil.rmtree(media)
    shutil.copytree(ROOT / "out" / "media", media)
    (DOCS / "data").mkdir(exist_ok=True)
    payload = json.dumps(cases, ensure_ascii=False, separators=(",", ":"))
    (DOCS / "data" / "cases.js").write_text(f"window.CASES = {payload};\n")
    print(f"viewer: docs/data/cases.js ({len(payload) // 1024} KB), {sum(1 for _ in media.iterdir())} images")
    print("open docs/index.html")


if __name__ == "__main__":
    main()
