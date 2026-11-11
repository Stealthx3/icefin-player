# Beta checklist: what only real hardware can show (D28)

Icefin is built and checked in the virtual lab. These rows need a real GPU, TV, receiver, controller or Steam,
and a person to look or listen. Beta testers run whichever rows their hardware allows and report the result with
the diagnostics report (Client Settings → Hardware → *Copy report*, PLAN 11.4), the hardware they used and, where it helps, a
phone photo of the TV or receiver display.

Each row says where it came from in the plan, so fixes can point back to it. A row passes when the expected
result is seen; anything else is a bug report (P1 if playback is silent, black or wrong-coloured without a prompt).

## Video: GPUs and decode

| Row | Hardware | Do | Expect | From |
| --- | --- | --- | --- | --- |
| V1 | Intel Xe or Arc | Play the 4K HDR10 HEVC and AV1 samples for 10 minutes | Hardware decode (overlay: `vaapi`), zero-copy on the Vulkan renderer, no dropped frames; the 10-bit HDR10 clip especially (the lab's NVIDIA stand-in can't import 10-bit) | 4.5, 5.3 |
| V2 | AMD RDNA 2+ | Same, Vulkan renderer | `vaapi` zero-copy (DMA-BUF import) for 8-bit and 10-bit, no dropped frames | 5.3 |
| V3 | NVIDIA | Same, Vulkan renderer and OpenGL renderer | Vulkan: zero-copy NVDEC; OpenGL: copy mode, picture not black | 4.5 |
| V4 | The slowest machine available | Browse every built-in theme for a minute each, then play a film | UI at 60 fps (overlay frame timing), the backdrop (Media Center, Tide) drops no frames | 5.8, 8.6, 9.2 |
| V5 | Any | Play 23.976 fps content on a 60 Hz display | Even motion (no refresh switching in 1.0; note judder if seen) | SPEC risks |

## HDR on screen

| Row | Hardware | Do | Expect | From |
| --- | --- | --- | --- | --- |
| H1 | HDR10 TV or monitor, KDE Plasma | Play the HDR10 sample, HDR Output on | The display shows its HDR badge; colours look right next to the TV's own app | 1.10, 5.8 |
| H2 | Same | Play the HLG sample | HLG (or HDR) badge; no washed-out picture | 5.8 |
| H3 | HDR display, GNOME (Mutter 48+) | HDR10 sample | HDR badge; same look as on Plasma | 5.8 |
| H4 | HDR display, Steam game mode or Bazzite | HDR10 sample | HDR badge in game mode | 5.8 |
| H5 | HDR display | Pause over a bright HDR scene, open the player controls and menus | Controls readable, not dim grey or glowing (reference white) | 2.5, 5.8, 8.6 |
| H6 | HDR display | HDR10+ and Dolby Vision 5 / 8 / 7 samples | DV 5: the capability prompt on OpenGL, the right colours on Vulkan; DV 8 and 7 play their HDR10 base; HDR10+ plays as HDR10 | 5.8 |

## Audio: receivers, soundbars and TVs

| Row | Hardware | Do | Expect | From |
| --- | --- | --- | --- | --- |
| A1 | AV receiver over HDMI | Audio test page: each format the receiver lists | The receiver's display shows each format (Dolby TrueHD / Atmos, DTS-HD MA, E-AC-3, AC-3, multichannel PCM) | 1.10, 3.8 |
| A2 | Soundbar or TV over eARC / ARC | Same | Formats the bar supports show on it; the rest arrive as PCM, never silence | 3.8 |
| A3 | Any HDMI sink | Unplug and replug the cable, turn the receiver off and on during playback | Sound returns (or a notice), never silent without a message | 3.8, 3.9 |
| A4 | Any | Watch speech for a few minutes with passthrough on | Lip sync looks right | 3.8 |

## Controllers and Steam

| Row | Hardware | Do | Expect | From |
| --- | --- | --- | --- | --- |
| C1 | Xbox pad (USB and Bluetooth), DualSense, Switch Pro, an 8BitDo pad | Walk every screen of the default theme and two clone themes | Every screen reachable; on-screen glyphs match the pad | 7.6 |
| C2 | Steam Deck or Steam Controller, Steam game mode | Same | One input per press (no duplicates); glyphs match the pad (not "generic") | 7.4, 7.6 |
| C3 | Any pad, Steam desktop mode | Start Icefin from Steam with the recommended layout | The duplicate-input guard holds; the layout is offered | 7.4 |
| C4 | Bluetooth or IR five-way remote | Walk the default theme and Plum | Every screen reachable with five keys and Back | SPEC |

## Reporting

- Open an issue at https://github.com/Stealthx3/icefin-player/issues with the row id (V1, H3, ...), the result,
  the diagnostics export and the hardware.
- Results fill the compatibility table in `docs/INSTALL.md`.
