# Simulating the target hardware (D28)

With the HTPC out of the plan, the lab stands in for as much hardware as it can. Each option below says what it
proves, what it can't, and what it would take. Options marked **built** run today; the others are proposals. Real
hardware is left to beta testers (`docs/BETA-CHECKLIST.md`).

## Built

| Option | Stands in for | Proves | Can't show |
| --- | --- | --- | --- |
| Virtual AV tier, audio (`hda-hdmi-sink`, D18) | AV receiver, soundbar, TV over HDMI | The ELD Icefin reads, the per-track passthrough decision, bit-exact bitstreams, HBR, hotplug | The receiver's display, lip sync, CEC |
| Virtual HDR display (Weston 16, 5.10) | An HDR10 or SDR display on Wayland | The swapchain, surface tag, mastering metadata and MaxCLL/MaxFALL Icefin sends per routing row | Whether a TV switches to HDR; how it looks |
| Virtual controllers (option C, 7.6) | Xbox Series, 8BitDo (X-input), DualSense, Switch Pro, Steam Virtual Gamepad | The kernel's own `hid-playstation` and `hid-nintendo` bind (uhid); SDL3 names each as the real pad; Icefin's family and prompts; every control of the action map once; the Nintendo layout; Steam's game environment; the walk over every screen | Bluetooth, Steam Input's own remapping, real latency, rumble felt |
| VA-API through nvidia-vaapi-driver (option V1) | An AMD or Intel VA-API decoder | `vaapi` decode and zero-copy DMA-BUF import on the shared Vulkan device, 8-bit | 10-bit p010 import (NVIDIA lacks r16 modifiers); real AMD or Intel drivers |

## Proposed

### C. Virtual controllers: built (PLAN 7.6)
- **What:** `tests/icefin/web/vpads.py`. Xbox Series (`045e:0b12`), 8BitDo Pro 2 in X-input mode (`2dc8:3106`) and the
  Steam Virtual Gamepad (`28de:11ff`) are `uinput` devices shaped like the drivers' own. The DualSense (`054c:0ce6`)
  and Switch Pro (`057e:2009`) are `uhid` devices that answer the kernel drivers' probing (the DualSense's pairing,
  calibration and firmware feature reports; the Switch Pro's USB handshake, device info, SPI calibration reads and
  subcommands), so `hid-playstation` and `hid-nintendo` bind, and SDL3's HIDAPI drivers open their hidraw nodes.
  Access: `scripts/lab/70-icefin-lab-pads.rules` (uhid for the lab user, seat access to the pads' hidraw, as the
  `steam-devices` rules give real hosts).
- **Runs:** `tests/icefin/web/controller_run.py`. Every lab matrix run: each pad outside Steam and each behind
  Steam's virtual pad. On request (`lab-matrix.py --groups walk`): the walk over every screen, stock and each theme.
- **Can't show:** Steam Input's own remapping; Bluetooth; real latency; rumble felt.

### M. Synthetic HDR10+ and Dolby Vision media (PLAN 6.6, 5.8's media rows)
- **Built (6.6):** `make-hdr-media.sh` injects HDR10+ dynamic metadata with `hdr10plus_tool` (Debian's x265 drops
  it at encode time) and generated Dolby Vision 5 and 8.1 RPUs with `dovi_tool`, next to `make-media.sh`'s SDR,
  HDR10 and HLG films. No profile 7: `dovi_tool` generates single-layer RPUs only, so that row stays with H6.
  `routing_rows.py` runs the SDR-display rows, `hdr_protocol.py` the HDR-display ones.
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
- **Built 2026-11-12:** `tests/icefin/avsim/edid_profiles.py`, 40 public sinks in `profiles/public/` from 30,974
  real sinks (399 distinct audio capability sets); Icefin's decisions 161/161 and the ELD rows 40/40 (docs/LAB.md).

### D. More HDR compositors, headless (PLAN 5.8's compositor rows)
- **How:** Gamescope's headless backend with HDR forced on (`--backend headless --hdr-enabled
  --hdr-debug-force-support`), and Mutter's headless mode with a virtual monitor, each running Icefin in the lab
  with a protocol or Vulkan validation log, as the Weston test does.
- **Proves:** what Icefin sends under Gamescope (HDR10 swapchain, `VK_EXT_hdr_metadata`) and Mutter (colour
  management) per routing row.
- **Can't show:** the TV's response. Needs checking first: Mutter's headless HDR support, and that Gamescope's
  headless backend runs under the lab's software Vulkan.
- **Cost:** two or three days, most of it finding out what each compositor supports headless.
- **Built 2026-11-12 (Gamescope):** 3.16.30.2 from Valve's source (the user's OK), `tests/icefin/hdr/build-gamescope.sh`;
  its headless backend with HDR forced runs on lavapipe and the WSI layer offers HDR10 to X11 clients.
  `gamescope_hdr.py`: HDR idle, HDR10, HLG, Dolby Vision 8.1, an SDR Gamescope and HDR Output off (docs/LAB.md).
  It found that with HDR Output off the Hardware page blamed the display; fixed.
- **Mutter, checked 2026-11-12:** 48.7 (Debian 13) headless with `--virtual-monitor` offers that monitor only the
  default colour mode (`supported-color-modes` [0], no BT.2100), so a Mutter HDR display can't be simulated with
  it; Mutter's protocol support was probed in spike 2.3.

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
- **Built 2026-11-13:** in `lab-icefin-htpcsim` (its Weston TV session, the Flatpak on two CPUs), measuring Qt
  Quick's own frames and mpv's drops; `tests/icefin/perf/perf_budget.py` and `budget.json` (docs/LAB.md). On the
  way: the guest's cloud kernel had no GPU driver and its Weston locked after five idle minutes, so Qt never drew;
  mpv's drop counter is `frame-drop-count` (the name upstream's debug text uses reads null).

### R. Five-way remotes
- **How:** a `uinput` keyboard sending the keys an IR or Bluetooth remote sends (arrows, Enter, Back, media keys).
- **Proves:** every theme works with five keys and Back.
- **Cost:** an hour on top of C.
- **Built 2026-11-12 (IR through LIRC):** a `uinput` keyboard never reaches an app on Xvfb, and Bluetooth remotes are
  keyboards to the app, which the keyboard rows cover. IR remotes reach Icefin through lircd's socket instead:
  `tests/icefin/web/lirc_remote.py` runs a fake lircd in a private `/run/lirc` (bubblewrap) and checks the five-way
  keys, OK, Back, IR repeat bursts and a lircd that sends releases. It found that every IR press kept repeating
  until the next button (lircd sends no release; upstream sent key-downs, and the auto-repeat waits for a key-up);
  fixed with one-shot presses (`src/icefin/input/Lirc`), and offered for 10.2.

## Order

C (built), M, A and R run fully in the lab with no host changes; D needs a short feasibility check; V1 needs your OK
for a driver on the workstation; V3 and real displays need hardware. Suggested: C and R, M, A, D, then V1 if you
approve it.
