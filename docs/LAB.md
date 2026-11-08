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
| hw (later, 1.7/11.1) | vm | 2 | Q1, Q3, Q8 | needs GPU/USB/audio passthrough: **not set up; requires the user's explicit OK** (§8) |

## Guests (watch in virt-manager → QEMU/KVM)
| Guest | Kind | Base | vCPU/RAM | Purpose | Snapshots |
|---|---|---|---|---|---|
| lab-icefin-main | vm | lab-base-debian13 | 8 / 16 GB, 80 GB disk | native + Flatpak builds, unit tests, Jellyfin servers | clean, provisioned |

Sized above the 2/4 default: Qt WebEngine/QML builds and flatpak-builder with the KDE SDK need it.

## Provisioning
- scripts/provision.sh: native build deps (Qt 6 + WebEngine dev, libmpv-dev, SDL2, CEC), flatpak + flatpak-builder + Flathub remote, podman.

## Commands
- Build: `scripts/lab.sh run 'cmake -S . -B build -G Ninja && ninja -C build 2>&1 | tail -n 50'`
- Test:  `scripts/lab.sh run '<cmd> 2>&1 | tail -n 50'`
- Watch: `scripts/lab.sh view`

## Host exceptions
- none

## Log
- 2026-11-07: lab designed; main guest created from lab-base-debian13.
