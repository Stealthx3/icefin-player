# Themes held back for a later update

Spark, Marquee and Plum are finished theme packages that are not in the app for now (D36, 2026-11-16). The build
bundles `themes/` only, so these don't ship, and the theme pipeline skips them (`scripts/icefin/theme-pipeline.json`,
'later').

Their tests are in `tests/icefin/web/later/` and their reference specs in `docs/themes/references/later/`, where the
lab matrix doesn't pick them up. `scripts/icefin/theme-sounds.py` still writes their sounds here.

To bring one back: `git mv themes-later/<id> themes/`, move its `theme_<id>.py` and `<id>.json` back up a level, add
it to the lists in `theme_details.py`, `theme_settings.py` and `theme_osd.py`, and queue its pipeline pass.
