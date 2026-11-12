# Lab — icefin
_Standard: VM-LAB-STANDARD v1.2 · Created 2026-11-07_

## Host (from lab.sh doctor)
- virt-install 5.1.0, virt-manager: yes, KVM: yes, LXC driver: yes
- Network: default (NAT) · Pool: default (/var/lib/libvirt/images) · Base: lab-base-debian13.qcow2 (shared)
- Host: 16 CPUs, 125 GB RAM

## Guest decision (§2)
| Role | Kind | Rule | "Yes" answers | Note |
|---|---|---|---|---|
| main | vm | 2 | Q3, Q7, Q8 | flatpak-builder (bubblewrap sandbox) and podman Jellyfin servers; build/test snapshots; live console |
| htpcsim | vm | 2 | Q3, Q8 | stand-in for the HTPC: tests `scripts/icefin/htpc.sh` without the real machine |
| hw | — | — | — | **replaced by the HTPC tier** (D16): no passthrough guest |

## Guests (watch in virt-manager → QEMU/KVM)
| Guest | Kind | Base | vCPU/RAM | Purpose | Snapshots |
|---|---|---|---|---|---|
| lab-icefin-main | vm | lab-base-debian13 | 8 / 16 GB, 80 GB disk | native + Flatpak builds, unit tests, Jellyfin servers | clean, provisioned, servers |
| lab-icefin-htpcsim | vm | lab-base-debian13 | 4 / 6 GB, 40 GB disk | stand-in HTPC (`lab.htpcsim.env`, `tests/icefin/htpc/sim-provision.sh`) | clean, provisioned |

Sized above the 2/4 default: Qt WebEngine/QML builds and flatpak-builder with the KDE SDK need it.

## Jellyfin servers (PLAN 1.7, inside lab-icefin-main)
- `tests/icefin/servers/servers.sh up|down|status|reset`: rootless podman, config in `tests/icefin/servers/servers.json`.
  - `jf1011` = jellyfin/jellyfin:10.11.11 on :8096, `jf12` = jellyfin/jellyfin:12.4 on :8097.
  - Synthetic media from `make-media.sh` in `~/jf/media` (SDR H.264, HDR10 and HLG HEVC, AC-3, E-AC-3, TrueHD, DTS, AV1, a two-episode show, music with lyrics, subtitles).
  - HDR10+ and Dolby Vision 5 and 8.1 from `make-hdr-media.sh` (PLAN 6.6): the same HDR10 base with generated dynamic metadata, injected by quietvoid's open-source `hdr10plus_tool` 1.7.2 and `dovi_tool` 2.3.1, built from their tags with `cargo install --locked --path .` into `~/.cargo/bin` (the newest releases need a newer Rust than Debian 13's 1.85); `mkvtoolnix` from Debian. No Dolby Vision 7 clip: the generator writes single-layer RPUs only.
  - Every HDR film carries its transfer and primaries in the Matroska colour block, not only in the HEVC stream: Jellyfin 12's ffprobe 8 trusts the container and reads a film without them as SDR (10.11's ffprobe 7 falls back to the stream). Films made before 2026-11-12 lack them: delete those two and run `make-media.sh` again.
  - `setup.py` runs the wizard with a throwaway admin `icefin` (random password in the guest's `~/jf/creds.json`, never printed), creates libraries, installs the regression plugins and writes `~/jf/status.json`.
  - Plugins: Playback Reporting, Trakt, LDAP, Intro Skipper, File Transformation, Home Screen Sections, Plugin Pages, JavaScript Injector, SSO. jf1011 9/9 active; jf12 8/9 (SSO has no 12.x build yet).
- Live TV (9.15): `python3 tests/icefin/servers/livetv.py tests/icefin/servers/servers.json` gives both servers 24 M3U channels (the lab clips over HTTP, a lab API key) and an XMLTV guide from 6 h ago to 2 days ahead. Run it again before guide tests: it moves the guide to now.
- Client harness: `tests/icefin/web/session_play.py` drives a build over DevTools (Xvfb), plays by remote command and records what the server saw; `compare_runs.py` diffs two runs.
- Routing rows (6.6): `LD_LIBRARY_PATH=~/mpv-icefin/lib/x86_64-linux-gnu python3 tests/icefin/web/routing_rows.py --app ~/build-vk/src/icefin-player --upstream ~/build-upstream/src/jellyfin-desktop` (a build against the patched libmpv, below, or the Vulkan pass has no video path) plays every film through the server on OpenGL and on Vulkan (lavapipe, SDR X11 display): the server's VideoRangeType, the router's line, the capability prompt exactly where the routing table puts it, a direct play, and upstream's play method per film. The HDR-display rows are `hdr_protocol.py`'s (below).

## HTPC tier (D16): retired by D28
> **Retired (D28, 2026-11-11):** no automated tests run on the HTPC any more; real hardware is covered by beta testers
> with `docs/BETA-CHECKLIST.md`. The section below is kept as history.

The VM builds; the HTPC runs everything that needs a real GPU, HDR TV, receiver or controllers.
`scripts/icefin/htpc.sh` (config `tests/icefin/htpc/htpc.env`, from `htpc.env.example`, git-ignored):

```
workstation ──ssh──> HTPC (Bazzite, the TV session's user)
   │                    127.0.0.1:38096/38097  ─┐ reverse tunnels
   │                    127.0.0.1:38099        ─┤ (ssh -R, opened by the workstation)
   └── libvirt NAT ──> lab-icefin-main: Jellyfin :8096/:8097, Flatpak repo ~/fp-repo served on :8099
```

- **First-time setup on the HTPC:** `scripts/icefin/htpc-kit.sh` builds `build-htpc/icefin-htpc-kit.zip` (setup script,
  README, probe, this workstation's public key). The user runs `bash icefin-htpc-setup.sh` on the HTPC as the TV
  user: it authorizes the key as `restrict,port-forwarding,pty` (tag `icefin-lab-workstation`), offers to enable sshd,
  and writes `~/icefin-htpc-info.txt`; `--check` changes nothing, `--remove` undoes it.
- **Web tests on the HTPC:** `htpc.sh web <script>.py [args]` runs any `tests/icefin/web` test in the on-screen session against the installed Flatpak (same tunnels, credentials and house rules as `play`); its `--out` folder comes back to `build-htpc/results/`. Used for what needs the real GPU, such as the 8.4 backdrop's GPU-busy cost (`theme_backdrop.py`).
- **Flow:** `htpc.sh build` (Flatpak into the VM's repo) → `deploy` (Flatpak `--user` from remote `icefin-lab`)
  → `play` / `probe` → results in `build-htpc/results/`. `doctor` first; `watch` opens Moonlight (Sunshine on the HTPC).
- **Runs inside the session on screen.** Remote commands take on the environment of the user's Plasma, GNOME or
  Gamescope session (`systemctl --user show-environment`), so the app gets the real GPU, HDR path and audio.
- **`probe`** reads what actually reaches the TV and receiver, without root: per connector the mode, refresh,
  `Colorspace` and `HDR_OUTPUT_METADATA` (EOTF PQ/HLG, mastering levels; through libdrm), the ELD, open ALSA
  substreams and the IEC958 non-audio bit (bitstream vs PCM). What only eyes and ears can confirm (the TV's HDR
  badge, the receiver's Atmos light) is asked of the user with a phone alert.
- **The HTPC stays the user's.** Only per-user state: Flatpak `--user` (app, remote `icefin-lab`, runtimes),
  `~/.local/share/icefin-lab`, `~/.var/app/io.github.stealthx3.IcefinPlayer`. No rpm-ostree, no sudo, no system
  config. `clean` resets the app's profile; `uninstall` removes all of it (runtimes stay until `flatpak --user uninstall --unused`).
- **House rules:** `play`, `probe`, `deploy` and `session` refuse during `HTPC_QUIET_HOURS` or while
  `HTPC_BUSY_PROCS` run (default: a Steam game). `HTPC_FORCE=1` overrides, only on the user's word.
  Switching Plasma ↔ Gamescope logs the TV session out, so it is off unless `HTPC_ALLOW_SESSION_SWITCH=1`.
  Going back to game mode (`session gamescope`) skips the quiet-hours check so it can always restore the default.
- **Lab window (user's rule, 2026-11-08):** the lab may use the TV only from 00:00 to 10:00 Pacific
  (`HTPC_QUIET_HOURS=10-00`). Plasma rows switch to desktop mode only inside that window, then back to game mode.
  - **Inside the window, unattended tests only.** Anything that needs a person is queued with
    `htpc.sh defer ROW WHAT` and the run moves on. Examples: reading the receiver's display, confirming the TV's HDR
    badge, pressing a remote button, plugging in a controller. Never wait for the user and never guess the answer.
  - Tests don't start with fewer than `HTPC_MIN_LEFT` (15) minutes left in the window.
  - **At 10:00 the hand-off runs:** `htpc.sh handoff` lists the open steps and marks them handed off. The scheduled
    task `icefin-htpc-lab-handoff` (daily, just after 10:00) runs it and pushes the list to the user's phone. A lab
    session still running at 10:00 does the same. The steps then run in the post-lab timeframe with the user present.
    The TV is off-limits to the lab then, so those runs need `HTPC_FORCE=1` on the user's word.
  - `htpc.sh window` shows where the clock is; `htpc.sh deferred` lists the queue (`build-htpc/deferred.tsv`).
- **Ports are shifted** by `HTPC_PORT_SHIFT` (30000) so a Jellyfin server on the HTPC itself is never shadowed. The shifted ports must stay in 32768–60999: Bazzite's SELinux policy lets sshd open reverse-tunnel listeners only in that range.
- **Lab-server credentials** go VM → HTPC over SSH into `~/.local/share/icefin-lab/jf/creds.json` (0600), never through a log or the console.
- **Stand-in:** `HTPC_ENV=tests/icefin/htpc/htpc.sim.env scripts/icefin/htpc.sh …` targets `lab-icefin-htpcsim`
  (headless Weston as the "TV session"; no GPU, so `play … --app-arg=--disable-gpu` there).

## Test builds for people (nightly)
Every green `icefin-flatpak` run on `main` replaces the rolling **nightly** pre-release:
https://github.com/Stealthx3/icefin-player/releases/tag/nightly. Its bundle keeps one name,
`icefin-player-x86_64.flatpak` (with a `.sha256`), and names Flathub as its runtime repo:
`flatpak install --user ./icefin-player-x86_64.flatpak`, then `flatpak run io.github.stealthx3.IcefinPlayer`.
Per-commit bundles stay on each workflow run as artifacts (90 days).

## Virtual AV tier (D18): a virtual TV and AV receiver inside the lab
Sits between the lab VM and the HTPC. It proves what Icefin **sends** (ELD read, passthrough decision,
bit-exact bitstream, HBR, non-audio bit) on every change, without the TV. Whether the real TV and receiver
**do** the right thing (HDR badge, the receiver's display, lip sync, CEC) is still the HTPC's job.

```
host ── libvirt ──> lab-icefin-main (L1, nested KVM)
                      ~/avsim/qemu: QEMU 10.0.6 + hda-hdmi-sink (tests/icefin/avsim/qemu/)
                      └── avsim client (L2, Debian 13 "generic" kernel, ALSA, mpv; SSH 127.0.0.1:2222)
                            ich9-intel-hda ── hda-hdmi-sink: ELD from a profile, captures to ~/avsim/capture
```

- **`hda-hdmi-sink`** (`tests/icefin/avsim/qemu/hda-hdmi-sink.c`): an HDA codec with one digital converter
  and one HDMI pin. It reports vendor id `0x00000101`, so Linux binds its stock *Generic HDMI* driver and reads
  the ELD through the standard verbs into `/proc/asound/card*/eld#*`, as with a real GPU. Every stream is
  written to `seg-NNNN.raw`, with `seg-NNNN.json` holding the format, the IEC958 non-audio bit, HBR pin mode,
  channel slots and the audio infoframe. `events.jsonl` logs hotplug, infoframes and stream start/stop.
  `eld` and `connected` can be changed at run time (QMP `qom-set`), which sends the hotplug event a new
  receiver would.
- **Profiles** (`tests/icefin/avsim/profiles/*.json`, built by `eld.py`): `avr-full`, `soundbar-eac3`,
  `tv-basic` and `standby` mirror the unit-test ELD fixtures; `tv-earc-htpc` is the HTPC's real chain (no TrueHD).
  Each profile's `expect` map holds the per-codec result Icefin's decision should reach (rows for PLAN 3.9).
- **`iec61937.py`** finds IEC 61937 bursts by their preamble and checks the capture against
  `ffmpeg -c:a copy -f spdif` of the same track, burst by burst.
- **`avsim.sh`** (`build`, `image`, `up [PROFILE]`, `profile P`, `plug`/`unplug`, `ssh`, `down`, `matrix`).
  Each `up` starts from a fresh overlay of the provisioned base disk, the nested equivalent of a snapshot revert.
- **`matrix.py`** rows: `eld/<profile>` (the kernel's ELD text contains the fixture line for line),
  `hotplug`, `transport/<codec>` (AC-3, E-AC-3, DTS, TrueHD bit-exact with the right non-audio/HBR/channel
  format), `pcm/ac3` (decoded control). Results in `~/avsim/results/`. DTS-HD MA has no free encoder: drop a
  sample at `~/avsim/samples/dtshd.mka` to add its row.
- **Icefin in the client (PLAN 3.9, `icefin.py`):** `matrix.py --player icefin --app APP` runs the native lab
  build inside the client (Xvfb, ALSA to the HDMI output, every passthrough format on), driven over DevTools
  through an SSH tunnel, and plays each sample through Icefin's own player and per-track decision. Rows:
  `icefin/<profile>/<codec>` for every `expect` entry (the capture bit-exact or PCM as expected, Icefin's
  decision line agreeing, the track playing to the end), `icefin/hotplug-reread` (each decision used the new
  receiver's ELD, without a restart), `icefin/standby` (invalid ELD: PCM until it wakes, D32),
  `icefin/standby-wake` and `icefin/standby-flap` (the bitstream 4 s after the wake, the wait starting over when it
  drops back to standby), `icefin/standby-pcm` and `icefin/standby-bitstream` (the two override settings) and
  `icefin/unplug` (unplugged mid-track and for a whole track: nothing stalls), `icefin/fallback-default` and
  `icefin/fallback-silent` (the HDMI device held by another program: PCM, then the default device, then silence with
  the notice; the track always plays to the end). The client needs
  Icefin's runtime packages: `avsim.sh icefin-image APP` makes a second base disk with them (once per
  dependency change), and `AVSIM_BASE=avsim-icefin` starts the client from it.
- **Public sinks (PLAN 11.5 option A):** 40 profiles in `tests/icefin/avsim/profiles/public/` made by
  `edid_profiles.py` from the linuxhw EDID collection (CC BY 4.0; `SOURCES.md` there): the audio capabilities of
  real TVs, AV receivers and soundbars. Of 30,974 sinks with an audio block (45,061 EDIDs from TV, receiver and
  soundbar makers), 399 distinct capability sets; the 40 cover every decision case among them (11 expect maps, 14
  combinations of the ELD's rate and channel limits), then receivers and soundbars, then the sets most TVs share.
  `expect` follows the SPEC's rules (the codec listed, and a carrier the ELD can open). Not in the routine matrix:
  `matrix.py --profiles public [--player icefin --app APP]` (ELD rows; Icefin's decision per sink and codec, about
  40 minutes). To regenerate: a sparse checkout of the collection (`Digital/<vendor>/` for TV, receiver and soundbar
  makers) and `edid_profiles.py write <checkout>`.
- **Run:**
  ```
  scripts/lab.sh run 'bash tests/icefin/avsim/avsim.sh build'     # once, ~10 min
  scripts/lab.sh run 'bash tests/icefin/avsim/avsim.sh image'     # once: download, verify, provision
  scripts/lab.sh run 'bash tests/icefin/avsim/avsim.sh up && bash tests/icefin/avsim/avsim.sh matrix; bash tests/icefin/avsim/avsim.sh down'
  # Icefin's own rows (3.9): the Icefin disk once, then the client from it with more memory for Qt WebEngine
  scripts/lab.sh run 'bash tests/icefin/avsim/avsim.sh icefin-image ~/build/src/icefin-player'
  scripts/lab.sh run 'export AVSIM_MEM_MB=4096 AVSIM_BASE=avsim-icefin; bash tests/icefin/avsim/avsim.sh up && bash tests/icefin/avsim/avsim.sh matrix --player icefin --app ~/build/src/icefin-player; bash tests/icefin/avsim/avsim.sh down'
  ```
- **Watching:** the client has no display. `avsim.sh console` shows its serial log, and the commands run
  through `lab-run`, so they show on `lab-icefin-main`'s console in virt-manager.
- **HDR half (PLAN 5.10): the virtual HDR display.** A headless Weston 16 with color management
  (`tests/icefin/hdr/build-weston.sh` builds it into `~/weston-16`; Debian 13's Weston 14 predates the protocol) stands in
  for the display, as an HDR output (PQ, BT.2020) or an SDR one. `tests/icefin/web/hdr_protocol.py` runs Icefin's
  Flatpak on it with the Vulkan renderer (Flatpak Mesa's lavapipe offers HDR10 on Wayland) and a Wayland protocol log,
  and checks per routing row what Icefin tells the compositor: the HDR10 swapchain and the PQ / BT.2020 surface tag,
  the HDR10 film's mastering metadata, MaxCLL and MaxFALL (the values `make-media.sh` wrote), HLG, an SDR display and
  HDR Output off. Run it on every HDR change:
  ```
  scripts/lab.sh run 'bash tests/icefin/hdr/build-weston.sh'            # once
  scripts/lab.sh run 'python3 tests/icefin/web/hdr_protocol.py'          # the installed Flatpak, server jf12
  ```
  It shows what Icefin sends; whether a TV switches to HDR stays on the HTPC (5.8).
- **Gamescope (PLAN 11.5 option D): Steam's game mode on an HDR TV, headless.** Gamescope 3.16.30.2 built from
  Valve's source into `~/gamescope-lab` (`tests/icefin/hdr/build-gamescope.sh`: Debian 13 doesn't package it, and its
  pinned wlroots needs newer Wayland, libdrm, xkbcommon, wayland-protocols and pixman, built into the same prefix).
  Its headless backend with `--hdr-enabled --hdr-debug-force-support` runs on lavapipe, and its WSI layer offers X11
  clients the HDR10 (ST 2084) colour space, as on a Deck or Bazzite in game mode. `tests/icefin/web/gamescope_hdr.py`
  runs a native Icefin build inside it (Xwayland, the WSI layer, the Vulkan renderer) and checks per routing row what
  Icefin hands Gamescope: the display read as HDR from the swapchain, the HDR10 swapchain, the router's choice, and
  `VK_EXT_hdr_metadata` with each film's exact metadata (HDR10, HLG's BT.2020 container, Dolby Vision 8.1's HDR10
  base); an SDR Gamescope and HDR Output off tone-map. Needs a build against the patched libmpv:
  ```
  scripts/lab.sh run 'sh tests/icefin/hdr/build-gamescope.sh'           # once: clones and builds, a few minutes
  scripts/lab.sh run 'LD_LIBRARY_PATH=~/mpv-icefin/lib/x86_64-linux-gnu python3 tests/icefin/web/gamescope_hdr.py --app ~/build-vk/src/icefin-player'
  ```
  The Flatpak path (Flathub's `VulkanLayer.gamescope` extension) and a real TV stay with beta row H4.
  Mutter can't stand in: 48.7's headless virtual monitor has only the default colour mode.
- **Limits:** no real decoder behind the sink, so no lip sync, no receiver display, no CEC, no HDCP, and no
  check of how a real receiver treats a borderline stream. Those rows stay on the HTPC.

## Provisioning
- scripts/provision.sh: native build deps (Qt 6 + WebEngine dev, libmpv-dev, SDL2, CEC), flatpak + flatpak-builder + Flathub remote, podman.

## Commands
- Build: `scripts/lab.sh run 'cmake -S . -B ~/build -G Ninja -DUSE_STATIC_MPVQT=ON && ninja -C ~/build 2>&1 | tail -n 50'` (build dir stays outside the synced tree)
- SDL3 controller build (as the Flatpak): add `-DENABLE_SDL2=OFF -DICEFIN_SDL3=ON` (separate build dir, e.g. `~/build-sdl3`). After adding files under `native/` or `src/icefin/resources/`, re-run cmake: upstream globs those at configure time.
- Test:  `scripts/lab.sh run '<cmd> 2>&1 | tail -n 50'`
- Patched libmpv for native builds (the Vulkan render API, PLAN 5.2; the Flatpak always has it): `scripts/lab.sh run 'external/mpv/build-lab.sh ~/mpv-icefin'` once, then configure with `PKG_CONFIG_PATH=~/mpv-icefin/lib/x86_64-linux-gnu/pkgconfig` and run with `LD_LIBRARY_PATH=~/mpv-icefin/lib/x86_64-linux-gnu` (`external/mpv/README.md`)
- Flatpak: `scripts/lab.sh run 'flatpak-builder --user --install-deps-from=flathub --force-clean --state-dir=$HOME/fp-state --repo=$HOME/fp-repo $HOME/fp-build flatpak/io.github.stealthx3.IcefinPlayer.yml'` (state outside the synced tree)
- Watch: `scripts/lab.sh view`

## Host exceptions
- **Testing the published Flatpak on this workstation** (user's request, 2026-11-09): the nightly bundle installs
  `--user` here and runs in the real Plasma Wayland session and in a nested Gamescope, for GPU decode, HDR, Wayland,
  Gamescope, the user's own server and controllers. No builds on the host: builds stay in the lab guests. HDMI
  passthrough is tested separately. A nested Gamescope inside Plasma needs `flatpak run --socket=x11 --nosocket=wayland`
  to give the app what game mode gives it (Flatpak's `fallback-x11` sees Plasma's `wayland-0` and withholds X11).
- **Remote hardware (not a libvirt guest):** the user's Bazzite HTPC runs the hardware tests over SSH, per-user only
  (see *HTPC tier*). Approved by the user on 2026-11-08 (D16).

## Log
- 2026-11-07: lab designed; main guest created from lab-base-debian13.
- 2026-11-07: Jellyfin servers added (snapshot `servers`); provisioning gains ffmpeg, x11-utils, python3-websocket, passt (podman 5 rootless networking) and user lingering.
- 2026-11-07: Flatpak runs need `dbus-run-session` (Chromium's sandbox spawns via the Flatpak portal); `--config-dir` does not reset WebEngine storage, so wipe `~/.var/app/<id>` for clean-slate runs.
- 2026-11-07: provision.sh gains elfutils (eu-strip) and librsvg2-common (flatpak-builder runs appstreamcli compose on the build host and must load the SVG icon).
- 2026-11-09: Virtual AV tier added (D18): QEMU 10.0.6 with `hda-hdmi-sink` built in `lab-icefin-main`, nested
  client from the Debian 13 generic image (the generic-cloud kernel has no sound drivers). First run: 12/12 rows.
  Findings: the hand-written ELD fixtures were wrong (speaker mask 0x7f also means FLC/FRC; the receiver listed
  no 192 kHz rate, which Linux needs for E-AC-3 and TrueHD because it limits HDMI rates to the ELD's), so the
  fixtures are now the kernel's own text from these profiles. mpv 0.40 stalls (no failover) when the sink
  refuses E-AC-3's 192 kHz stream.
- 2026-11-08: HTPC tier added (D16); stand-in guest `lab-icefin-htpcsim`. `lab.sh exec/run` need `-r <role>` for a
  non-main guest even with `LAB_ENV` set (the stand-in's setup once ran on `main` by mistake; its service was removed).
