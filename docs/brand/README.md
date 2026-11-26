# Brand assets in this repository

These files are copies from the IceFin Player art kit in the IceSuite brand folder (`IceSuite/IceFin-Player/brand/`), which holds the master SVGs and the generator (`brand/tools/generate.py`). Every file here is exported from that kit: don't edit them by hand. Change the kit, rebuild it, and copy the result over.

The mark is the **Progress ring** (art-kit decision FIN-P1, 2026-11-14): IceFin's fin and wave inside a playback ring.

| File | Used for |
| --- | --- |
| `readme-banner-dark.png`, `readme-banner-light.png` (+ SVG masters) | Top of the README, chosen by the reader's GitHub theme |
| `feature-icons/*.svg` | Feature headings in the README (dark-ground and `-on-light` versions) |
| `social-card-1280x640.png` (+ SVG) | GitHub social preview: upload it in the repo's *Settings → General → Social preview* (GitHub has no API for this) |
| `release-card-template.svg` (+ PNG) | Release announcement image: copy per release and replace the bracketed text in an SVG editor (live text in Space Grotesk). List only changes that are in the release |

Elsewhere in the repo:

| Path | Used for |
| --- | --- |
| `src/icefin/resources/icon.svg` | Scalable app icon (flat cut): installed as `io.github.stealthx3.IcefinPlayer.svg` and used as the window icon |
| `src/icefin/icons/hicolor/` | 16–512 px PNG icons and the symbolic icon, installed by `src/icefin/IcefinInstallLinux.cmake` |
| `packaging/steam/*.png` | The five Steam images from the kit's `deployment/steam/` (names unchanged), installed in the Flatpak for Add to Steam (D43, `docs/standards/STEAM-SHORTCUT-STANDARD.md`); they moved here from `docs/brand/steam/` |

The project's name, summary, description and other metadata for marketing are kept in sync in the art kit's `brand/PROJECT-METADATA.md`. The sources of truth are `src/icefin/meta/` (AppStream metainfo and desktop entry) and this README.
