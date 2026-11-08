#!/usr/bin/env bash
# sim-provision.sh — make a Debian lab guest look enough like the HTPC for scripts/icefin/htpc.sh:
# Flatpak with Flathub, a stock-ish Python (no python3-websocket), ALSA tools, and a "TV session":
# headless Weston as a systemd user service whose WAYLAND_DISPLAY is in the user manager's environment,
# the way Plasma and Gamescope sessions export theirs. Run inside the guest:
#   LAB_ENV=lab.htpcsim.env scripts/lab.sh run 'bash tests/icefin/htpc/sim-provision.sh'
set -euo pipefail
sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq flatpak weston python3 dbus-user-session alsa-utils libdrm2 \
  pciutils iproute2 mesa-vulkan-drivers vulkan-tools xwayland >/dev/null
sudo loginctl enable-linger "$USER"
sudo usermod -aG video,render,audio "$USER"   # stands in for the seat ACLs (uaccess) the TV session user gets
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/sim-tv-session.service <<'UNIT'
[Unit]
Description=Stand-in TV session (headless Weston)
[Service]
ExecStart=/usr/bin/weston --backend=headless --renderer=gl --socket=wayland-0 --width=3840 --height=2160 --xwayland
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
