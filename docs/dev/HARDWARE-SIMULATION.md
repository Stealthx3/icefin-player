# Simulating the target hardware (D28)

With the HTPC out of the plan, the lab stands in for as much hardware as it can. Each option below says what it
proves, what it can't, and what it would take. Options marked **built** run today; the others are proposals. Real
hardware is left to beta testers (`docs/BETA-CHECKLIST.md`).

## Built

| Option | Stands in for | Proves | Can't show |
| --- | --- | --- | --- |
| Virtual AV tier, audio (`hda-hdmi-sink`, D18) | AV receiver, soundbar, TV over HDMI | The ELD Icefin reads, the per-track passthrough decision, bit-exact bitstreams, HBR, hotplug | The receiver's display, lip sync, CEC |
| Virtual HDR display (Weston 16, 5.10) | An HDR10 or SDR display on Wayland | The swapchain, surface tag, mastering metadata and MaxCLL/MaxFALL Icefin sends per routing row | Whether a TV switches to HDR; how it looks |
| VA-API through nvidia-vaapi-driver (option V1) | An AMD or Intel VA-API decoder | `vaapi` decode and zero-copy DMA-BUF import on the shared Vulkan device, 8-bit | 10-bit p010 import (NVIDIA lacks r16 modifiers); real AMD or Intel drivers |

## Proposed

### C. Virtual controllers (recommended first; PLAN 7.4, 7.6)
- **How:** in the lab guest, `uinput` devices with the real vendor and product ids and button layouts of an Xbox
  Series pad, Switch Pro and 8BitDo pad, and `uhid` for the DualSense so the kernel's `hid-playstation` driver
  binds as it would to the real pad. A Steam Virtual Gamepad (`28de:11ff`) plus a fake `SteamVirtualGamepadInfo`
  file tests Icefin's Steam detection, glyph family and duplicate-input guard.
- **Proves:** SDL sees each pad as the real one; glyphs; every screen of every theme reachable by a scripted walk
  (the 7.6 controller run, automated); the Steam guard logic.
- **Can't show:** Steam Input's own remapping; Bluetooth quirks; real latency.
- **Cost:** a day or two; no host changes.

### M. Synthetic HDR10+ and Dolby Vision media (PLAN 6.6, 5.8's media rows)
- **How:** in the lab, x265 writes HDR10+ dynamic metadata from a JSON file; `dovi_tool` (open source) generates
  and injects RPUs for Dolby Vision profiles 5, 8.1 and a profile 7 dual layer. `make-media.sh` gains these
  clips next to its SDR, HDR10 and HLG films.
- **Proves:** detection, routing (the capability prompt for DV 5 on OpenGL), the metadata Icefin passes on, and
  playback reports against upstream, row by row.
- **Can't show:** what a TV makes of it; the look of a real DV grade.
- **Cost:** a day; no host changes.

### A. More receivers from public EDID data (PLAN 3.9)
- **How:** the public Linux hardware EDID collection (linux-hardware.org) holds EDIDs of many TVs, receivers and
  soundbars. Their CEA audio blocks give the ELD a driver would build. A converter turns a chosen set into Virtual
  AV tier profiles with `expect` maps.
- **Proves:** the passthrough decision against dozens of real sink capability sets, not five fixtures.
- **Can't show:** firmware bugs that make a sink lie about its capabilities.
- **Cost:** a day.

### D. More HDR compositors, headless (PLAN 5.8's compositor rows)
- **How:** Gamescope's headless backend with HDR forced on (`--backend headless --hdr-enabled
  --hdr-debug-force-support`), and Mutter's headless mode with a virtual monitor, each running Icefin in the lab
  with a protocol or Vulkan validation log, as the Weston test does.
- **Proves:** what Icefin sends under Gamescope (HDR10 swapchain, `VK_EXT_hdr_metadata`) and Mutter (colour
  management) per routing row.
- **Can't show:** the TV's response. Needs checking first: Mutter's headless HDR support, and that Gamescope's
  headless backend runs under the lab's software Vulkan.
- **Cost:** two or three days, most of it finding out what each compositor supports headless.
- **Checked 2026-11-12:** Mutter 48.7 (Debian 13) headless with `--virtual-monitor` offers that monitor only the
  default colour mode (`supported-color-modes` [0], no BT.2100), so a Mutter HDR display can't be simulated with
  it; Mutter's protocol support was probed in spike 2.3. Gamescope isn't packaged in Debian 13: it needs a build
  from Valve's source in the lab, which waits on the user's OK.

### V. A VA-API device for the DMA-BUF import path (PLAN 5.3)
The lab's virtual GPU has no video decoder, so Icefin's VA-API zero-copy path (AMD and Intel) can't run there.
Three ways to reach it, best fidelity last:
1. **On the workstation's RTX 4090 with `nvidia-vaapi-driver`: built (approved 2026-11-11).** Flathub's
   `org.freedesktop.Platform.VAAPI.nvidia` extension carries it into the sandbox; it implements VA-API on NVDEC and
   exports DMA-BUFs, so mpv's `vaapi` hwdec and Icefin's DMA-BUF import run the same code as on AMD and Intel.
   `tests/icefin/web/vaapi_import.py` runs the built Flatpak there (nothing is built on the host) against the lab's
   servers: H.264 and AV1 map zero-copy. **Limit:** NVIDIA's Vulkan driver has no DRM modifiers for 16-bit formats,
   so 10-bit (p010) surfaces can't be imported; 10-bit VA-API stays with beta testers on AMD and Intel.
2. **virtio-gpu video in a lab guest.** QEMU with virglrenderer's video decode passes VA-API through to the host's
   decoder. Experimental, and it would still need option 1's driver on the host. Not recommended.
3. **A low-cost Intel Arc or AMD card passed through to a lab guest.** Real VA-API, real HDMI out (to a capture
   device or the Virtual AV tier). Highest fidelity; **needs hardware** and a free PCIe slot.

### P. A low-spec performance budget (PLAN 5.8's and 8.6's 60 fps rows)
- **How:** a lab guest held to two vCPUs with a CPU quota, rendering with lavapipe, records Icefin's frame times
  per theme and over video. The numbers set a regression budget: a change that makes the constrained guest slower
  fails, even though it can't say what a real low-end GPU will do.
- **Proves:** regressions in UI and backdrop cost, early.
- **Can't show:** real GPU performance; that stays with beta testers (`docs/BETA-CHECKLIST.md` V4).
- **Cost:** a day.

### R. Five-way remotes
- **How:** a `uinput` keyboard sending the keys an IR or Bluetooth remote sends (arrows, Enter, Back, media keys).
- **Proves:** every theme works with five keys and Back.
- **Cost:** an hour on top of C.

## Order

C, M, A and R run fully in the lab with no host changes; D needs a short feasibility check; V1 needs your OK
for a driver on the workstation; V3 and real displays need hardware. Suggested: C and R, M, A, D, then V1 if you
approve it.
