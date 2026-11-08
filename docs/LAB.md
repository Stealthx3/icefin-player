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
| hw (PLAN 1.9) | vm | 2 | Q1, Q3, Q8 | needs GPU/USB/audio passthrough: **not set up; requires the user's explicit OK** (§8) |

## Guests (watch in virt-manager → QEMU/KVM)
| Guest | Kind | Base | vCPU/RAM | Purpose | Snapshots |
|---|---|---|---|---|---|
| lab-icefin-main | vm | lab-base-debian13 | 8 / 16 GB, 80 GB disk | native + Flatpak builds, unit tests, Jellyfin servers | clean, provisioned, servers |

Sized above the 2/4 default: Qt WebEngine/QML builds and flatpak-builder with the KDE SDK need it.

## Jellyfin servers (PLAN 1.7, inside lab-icefin-main)
- `tests/icefin/servers/servers.sh up|down|status|reset`: rootless podman, config in `tests/icefin/servers/servers.json`.
  - `jf1011` = jellyfin/jellyfin:10.11.11 on :8096, `jf12` = jellyfin/jellyfin:12.4 on :8097.
  - Synthetic media from `make-media.sh` in `~/jf/media` (SDR H.264, HDR10 and HLG HEVC, AC-3, E-AC-3, TrueHD, DTS, AV1, a two-episode show, music with lyrics, subtitles).
  - `setup.py` runs the wizard with a throwaway admin `icefin` (random password in the guest's `~/jf/creds.json`, never printed), creates libraries, installs the regression plugins and writes `~/jf/status.json`.
  - Plugins: Playback Reporting, Trakt, LDAP, Intro Skipper, File Transformation, Home Screen Sections, Plugin Pages, JavaScript Injector, SSO. jf1011 9/9 active; jf12 8/9 (SSO has no 12.x build yet).
- Client harness: `tests/icefin/web/session_play.py` drives a build over DevTools (Xvfb), plays by remote command and records what the server saw; `compare_runs.py` diffs two runs.

## Provisioning
- scripts/provision.sh: native build deps (Qt 6 + WebEngine dev, libmpv-dev, SDL2, CEC), flatpak + flatpak-builder + Flathub remote, podman.

## Commands
- Build: `scripts/lab.sh run 'cmake -S . -B ~/build -G Ninja -DUSE_STATIC_MPVQT=ON && ninja -C ~/build 2>&1 | tail -n 50'` (build dir stays outside the synced tree)
- Test:  `scripts/lab.sh run '<cmd> 2>&1 | tail -n 50'`
- Flatpak: `scripts/lab.sh run 'flatpak-builder --user --install-deps-from=flathub --force-clean --state-dir=$HOME/fp-state --repo=$HOME/fp-repo $HOME/fp-build flatpak/io.github.stealthx3.IcefinPlayer.yml'` (state outside the synced tree)
- Watch: `scripts/lab.sh view`

## Host exceptions
- none

## Log
- 2026-11-07: lab designed; main guest created from lab-base-debian13.
- 2026-11-07: Jellyfin servers added (snapshot `servers`); provisioning gains ffmpeg, x11-utils, python3-websocket, passt (podman 5 rootless networking) and user lingering.
- 2026-11-07: Flatpak runs need `dbus-run-session` (Chromium's sandbox spawns via the Flatpak portal); `--config-dir` does not reset WebEngine storage, so wipe `~/.var/app/<id>` for clean-slate runs.
- 2026-11-07: provision.sh gains elfutils (eu-strip) and librsvg2-common (flatpak-builder runs appstreamcli compose on the build host and must load the SVG icon).
