# Videos

Renders the clinical tool (`docs/handover/`) to MP4, 1920x1080, 30 fps, from a timeline file. Two timelines:

| Timeline | Output | Length | Style |
|---|---|---|---|
| `timeline.json` | `demo.mp4` | about 2 min | Calm walkthrough of every feature, with captions |
| `timeline-pitch.json` | `pitch.mp4` | about 56 s | Fast cut: title cards with counters, quick zooms, short captions; made for a voiceover |

Needs Python with `playwright` (+ `playwright install chromium-headless-shell`) and `ffmpeg` on PATH.

    python video/render.py              # render changed scenes, join into demo.mp4
    python video/render.py --only refer # render one scene; joins if the others are cached
    python video/render.py --force      # ignore the cache
    python video/render.py --preview    # half resolution, writes demo-preview.mp4
    python video/render.py --timeline timeline-pitch.json   # the fast cut, writes pitch.mp4 and pitch-timecodes.json

`--out <name>` sets the output name. Each timeline has its own cache, so rendering one never deletes the other's segments.

## Editing
Only `timeline.json`. Globals: `size`, `viewport` (page size; 1440x810 scaled to 1920x1080), `fps`, `clock`
(fixed time, also passed as `?t=`), `app`, `scenario` (`?s=`), `cursor` (start position).
Each scene: `id`, `setup` (off camera: a route string, then steps) and `steps`. `from: "<scene id>"` starts the scene
where that one ends (its setup and steps are replayed off camera, timers included), so joins are seamless: move between
screens with visible clicks, not new routes. A step may combine, in this order:
`route`, `caption` (`{"title", "sub", "side", "dur"}`, plain text, or null), `ring` (selector or null), `zoom` (selector,
`[x, y, w, h]` or null; `scale`, `dur`, `ease`), `scroll` (selector, `by`, `dur`), `click` (selector, `move` seconds),
`select` (`[selector, option label]`), `point` (cursor glides to an element, no click), `menu` (opens a select's option
list as the page would draw it and runs down it; with `pick` it moves to that option and chooses it), `rest` (cursor back
to its start), `key`, `type` (text, `cps`), `hold` (seconds),
`card` (a full-screen title card: `{"kicker", "title", "sub", "stats": [{"to", "from", "suffix", "label", "color"}], "light"}`,
or null to wipe it away; `<em>` in a title takes the accent colour; numbers count up), `mark` (a label: its time goes into
`<name>-timecodes.json`, for timing a voiceover). Selectors are Playwright selectors;
a list means "first that matches".

The cursor clicks every action (no keyboard shortcuts) and carries over from one scene to the next. `n` in a caption puts
a step number on the callout and on its ring. The ring is a spotlight; use it only together with a caption.
The callout sits next to the ring, on the spot that fits and covers the least text (`side` pins one) and glides
when the ring moves; without a ring it sits lower left. Captions: a title of a few words naming the feature, one sub-line
of fact; no lab values, no words from the never-list in `.context/research/ocr.md`. Callout font Geist (cached like the app's).

## Caching
Each scene is one segment, `.cache/seg-<hash>.mp4`. The hash covers the scene JSON, the globals, the page and
the files it loads, `docs/media`, `overlay.js`, `cursor.svg`, the font, the encoder arguments and `RENDER_VERSION`.
Changing a caption re-renders that scene only; changing the app re-renders all. Stale segments are deleted.
Segments share encoder settings and start on a keyframe, so they are joined without re-encoding.
Bump `RENDER_VERSION` in `render.py` after changing its capture logic. The Google font is downloaded once into
`.cache/fonts` and served from there; the page gets no other network access.
