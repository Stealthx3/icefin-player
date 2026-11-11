# Clone reference specs (PLAN 9.1)

One JSON file per clone theme holds its benchmark target's measurements at 1920x1080. `tests/icefin/web/clone_layout.py`
drives the theme to each state the spec names and compares element boxes (scaled from the window to 1920x1080) and CSS
timings with these numbers: boxes within the spec's pixel tolerance, durations within 10% (SPEC: clone acceptance).

```
python3 tests/icefin/web/clone_layout.py --app ~/build/src/icefin-player --server jf12 --theme harbor --out ~/r91/harbor
```

## Where the numbers come from

- **Harbor (Kodi Estuary):** real Kodi 21.2 in a lab guest at 1920x1080 (Xvfb, ffmpeg x11grab stills and 30 fps
  sequences of key presses) and Estuary's own skin XML (GPL-2.0) for timings.
- **Arcade (Steam Big Picture):** Big Picture on the workstation, measured in Steam Deck layout units (1280x800) and
  scaled by height to 1080 lines; motion from demo videos.
- **The proprietary targets:** published design guidelines and demo or walkthrough videos, watched in a browser,
  paused and frame-stepped. Videos are never downloaded.

Each spec lists its sources with the version of the UI they show. Only measurements and links are kept: no
screenshots, recordings, logos, icons, artwork or sounds from a target go into the repository (CLAUDE.md, clone
rules).

## Format

See the docstring of `clone_layout.py`. In short, a spec has:

- `ready`: a JS expression that is true once the theme's screen is up;
- `states`: each with `actions` (engine actions, `{"repeat", "until", "max"}` to walk to a condition, or `{"eval"}`
  to set up a fixture such as a long grid), `boxes`
  (element boxes) and `text` (the text's own box, so font padding doesn't count), and optionally `log`, expressions
  printed for debugging a spec;
- `timings`: transitions and animations with duration, easing and delay.

Keys a measurement can use: `x`, `y`, `w`, `h`, `right`, `bottom`, `cx`, `cy`, all in reference pixels.
