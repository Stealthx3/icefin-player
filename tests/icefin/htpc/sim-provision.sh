#!/usr/bin/env bash
# sim-provision.sh — make a Debian lab guest look enough like the HTPC for scripts/icefin/htpc.sh:
# Flatpak with Flathub, a stock-ish Python (no python3-websocket), ALSA tools, and a "TV session":
# headless Weston as a systemd user service whose WAYLAND_DISPLAY is in the user manager's environment (idle lock
# off, or the session locks after five minutes and no window is exposed),
# the way Plasma and Gamescope sessions export theirs. Run inside the guest:
#   LAB_ENV=lab.htpcsim.env scripts/lab.sh run 'bash tests/icefin/htpc/sim-provision.sh'
set -euo pipefail
sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq flatpak weston python3 dbus-user-session alsa-utils libdrm2 \
  pciutils iproute2 mesa-vulkan-drivers vulkan-tools xwayland >/dev/null
# Debian's cloud kernel has no GPU drivers: no /dev/dri, so Qt never draws in the TV session (found 2026-11-12, PLAN
# 11.5 P). The standard kernel's virtio_gpu gives a render node (Mesa still renders in software). Takes a reboot.
if uname -r | grep -q cloud; then
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq linux-image-amd64 >/dev/null
  sudo DEBIAN_FRONTEND=noninteractive apt-get remove -y -qq linux-image-cloud-amd64 >/dev/null || true
  sudo update-grub >/dev/null 2>&1
  echo "sim-provision: standard kernel installed; reboot the guest before tests (lab.sh down htpcsim; lab.sh up htpcsim)"
fi
sudo loginctl enable-linger "$USER"
sudo usermod -aG video,render,audio "$USER"   # stands in for the seat ACLs (uaccess) the TV session user gets
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/sim-tv-session.service <<'UNIT'
[Unit]
Description=Stand-in TV session (headless Weston)
[Service]
ExecStart=/usr/bin/weston --backend=headless --renderer=gl --socket=wayland-0 --width=3840 --height=2160 --xwayland --idle-time=0
ExecStartPost=/bin/sh -c 'sleep 2; systemctl --user set-environment WAYLAND_DISPLAY=wayland-0 XDG_SESSION_TYPE=wayland XDG_CURRENT_DESKTOP=sim'
Restart=on-failure
[Install]
WantedBy=default.target
UNIT
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
systemctl --user daemon-reload
systemctl --user start dbus.socket   # dbus-user-session was installed after the user manager started
systemctl --user enable --now sim-tv-session.service
sleep 3
systemctl --user show-environment | grep WAYLAND_DISPLAY
echo "sim-provision: done"
