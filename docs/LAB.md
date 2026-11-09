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
  - `setup.py` runs the wizard with a throwaway admin `icefin` (random password in the guest's `~/jf/creds.json`, never printed), creates libraries, installs the regression plugins and writes `~/jf/status.json`.
  - Plugins: Playback Reporting, Trakt, LDAP, Intro Skipper, File Transformation, Home Screen Sections, Plugin Pages, JavaScript Injector, SSO. jf1011 9/9 active; jf12 8/9 (SSO has no 12.x build yet).
- Client harness: `tests/icefin/web/session_play.py` drives a build over DevTools (Xvfb), plays by remote command and records what the server saw; `compare_runs.py` diffs two runs.

## HTPC tier (D16): the user's Bazzite HTPC runs the hardware tests
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
- **Run:**
  ```
  scripts/lab.sh run 'bash tests/icefin/avsim/avsim.sh build'     # once, ~10 min
  scripts/lab.sh run 'bash tests/icefin/avsim/avsim.sh image'     # once: download, verify, provision
  scripts/lab.sh run 'bash tests/icefin/avsim/avsim.sh up && bash tests/icefin/avsim/avsim.sh matrix; bash tests/icefin/avsim/avsim.sh down'
  ```
- **Watching:** the client has no display. `avsim.sh console` shows its serial log, and the commands run
  through `lab-run`, so they show on `lab-icefin-main`'s console in virt-manager.
- **HDR half (PLAN 5.9):** headless Weston with color management in the client or `lab-icefin-htpcsim`,
  a protocol log of the image description per routing row. Debian 13's Weston 14 is too old (SPEC: 15.0).
- **Limits:** no real decoder behind the sink, so no lip sync, no receiver display, no CEC, no HDCP, and no
  check of how a real receiver treats a borderline stream. Those rows stay on the HTPC.

## Provisioning
- scripts/provision.sh: native build deps (Qt 6 + WebEngine dev, libmpv-dev, SDL2, CEC), flatpak + flatpak-builder + Flathub remote, podman.

## Commands
- Build: `scripts/lab.sh run 'cmake -S . -B ~/build -G Ninja -DUSE_STATIC_MPVQT=ON && ninja -C ~/build 2>&1 | tail -n 50'` (build dir stays outside the synced tree)
- Test:  `scripts/lab.sh run '<cmd> 2>&1 | tail -n 50'`
- Flatpak: `scripts/lab.sh run 'flatpak-builder --user --install-deps-from=flathub --force-clean --state-dir=$HOME/fp-state --repo=$HOME/fp-repo $HOME/fp-build flatpak/io.github.stealthx3.IcefinPlayer.yml'` (state outside the synced tree)
- Watch: `scripts/lab.sh view`

## Host exceptions
- none on this workstation.
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
