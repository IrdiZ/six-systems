# Demo video

Renders the handover demo (`docs/handover/`) to `video/demo.mp4`, 1920x1080, 30 fps, from `timeline.json`.

Needs Python with `playwright` (+ `playwright install chromium-headless-shell`) and `ffmpeg` on PATH.

    python video/render.py              # render changed scenes, join into demo.mp4
    python video/render.py --only refer # render one scene; joins if the others are cached
    python video/render.py --force      # ignore the cache
    python video/render.py --preview    # half resolution, writes demo-preview.mp4

## Editing
Only `timeline.json`. Globals: `size`, `viewport` (page size; 1440x810 scaled to 1920x1080), `fps`, `clock`
(fixed time, also passed as `?t=`), `app`, `scenario` (`?s=`), `cursor` (start position).
Each scene: `id`, `setup` (off camera: a route string, then steps) and `steps`. A step may combine, in this order:
`route`, `caption` (`{"title", "sub", "side", "dur"}`, plain text, or null), `ring` (selector or null), `zoom` (selector,
`[x, y, w, h]` or null; `scale`, `dur`, `ease`), `scroll` (selector, `by`, `dur`), `click` (selector, `move` seconds),
`select` (`[selector, option label]`), `key`, `type` (text, `cps`), `hold` (seconds). Selectors are Playwright selectors;
a list means "first that matches".

The callout sits next to the ring (below, above, right, left: the first side that fits; `side` pins one) and glides
when the ring moves; without a ring it sits lower left. Captions: a title of a few words naming the feature, one sub-line
of fact; no lab values, no words from the never-list in `.context/research/ocr.md`. Callout font Geist (cached like the app's).

## Caching
Each scene is one segment, `.cache/seg-<hash>.mp4`. The hash covers the scene JSON, the globals, the page and
the files it loads, `docs/media`, `overlay.js`, `cursor.svg`, the font, the encoder arguments and `RENDER_VERSION`.
Changing a caption re-renders that scene only; changing the app re-renders all. Stale segments are deleted.
Segments share encoder settings and start on a keyframe, so they are joined without re-encoding.
Bump `RENDER_VERSION` in `render.py` after changing its capture logic. The Google font is downloaded once into
`.cache/fonts` and served from there; the page gets no other network access.
