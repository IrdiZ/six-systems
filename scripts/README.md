`python scripts/check-pages.py` checks the three pages in `docs/` at 1440 px and 390 px. It needs Python with Playwright.
Add `--base-url https://irdiz.github.io/six-systems/` to check the live site. Other flags: `--page`, `--skip-demos`, `--reduced-motion`, `--docs-dir`.
Exit code 1 means that a check failed. `NOT PRESENT` means that a thing was not checked. Screenshots go to `scripts/out/`, which Git ignores.
