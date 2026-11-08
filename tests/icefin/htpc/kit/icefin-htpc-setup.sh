#!/usr/bin/env bash
# icefin-htpc-setup.sh — prepare a Bazzite HTPC as the Icefin Player test lab (see README.md next to this file).
#
#   bash icefin-htpc-setup.sh            set up: authorize the lab workstation's SSH key, offer to enable sshd,
#                                         check the TV session, GPU and HDMI audio, write ~/icefin-htpc-info.txt
#   bash icefin-htpc-setup.sh --check    only check and report; change nothing
#   bash icefin-htpc-setup.sh --remove   undo: remove the key, Icefin's lab install and its files
#
# Run it as the user that is logged in on the TV, not as root. It never changes the Bazzite system image
# (no rpm-ostree). The one system-level step, enabling the SSH server, asks first and uses sudo.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP=io.github.stealthx3.IcefinPlayer
LABDIR="$HOME/.local/share/icefin-lab"
KEYTAG="icefin-lab-workstation"
INFO="$HOME/icefin-htpc-info.txt"
MODE="${1:-setup}"

b() { printf '\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  \033[32mok\033[0m    %s\n' "$*"; }
wa() { printf '  \033[33mnote\033[0m  %s\n' "$*"; }
no() { printf '  \033[31mFAIL\033[0m  %s\n' "$*"; }
ask() { local r=; [ -t 0 ] || [ -r /dev/tty ] && { read -r -p "$1 [y/N] " r </dev/tty; } 2>/dev/null || r=; [[ "$r" =~ ^[Yy] ]]; }

[ "$(id -u)" -ne 0 ] || { echo "Run this as the user logged in on the TV, not as root (no sudo in front)."; exit 1; }
case "$MODE" in setup|--check|--remove) ;; *) sed -n '2,10p' "$0"; exit 2 ;; esac

if [ "$MODE" = --remove ]; then
  b "Removing the Icefin test lab from this HTPC"
  if [ -f "$HOME/.ssh/authorized_keys" ] && grep -q " $KEYTAG\$" "$HOME/.ssh/authorized_keys"; then
    grep -v " $KEYTAG\$" "$HOME/.ssh/authorized_keys" > "$HOME/.ssh/authorized_keys.tmp" || true
    mv "$HOME/.ssh/authorized_keys.tmp" "$HOME/.ssh/authorized_keys"; chmod 600 "$HOME/.ssh/authorized_keys"
    ok "workstation key removed from ~/.ssh/authorized_keys"
  else ok "workstation key was not authorized"; fi
  flatpak kill "$APP" 2>/dev/null || true
  flatpak --user uninstall -y --noninteractive "$APP" >/dev/null 2>&1 && ok "Icefin Player (lab build) uninstalled" || ok "Icefin Player lab build was not installed"
  flatpak --user remote-delete --force icefin-lab >/dev/null 2>&1 && ok "icefin-lab Flatpak remote removed" || true
  rm -rf "$HOME/.var/app/$APP" "$LABDIR" "$INFO"; ok "lab files removed ($LABDIR, ~/.var/app/$APP)"
  wa "shared Flatpak runtimes kept; 'flatpak --user uninstall --unused' removes any nothing else uses"
  if systemctl is-enabled -q sshd 2>/dev/null && ask "Also turn the SSH server off? (only if nothing else of yours uses it)"; then
    sudo systemctl disable --now sshd && ok "SSH server disabled"
  fi
  b "Done."; exit 0
fi

# ------------------------------------------------------------------ report
. /etc/os-release
IMG="$(python3 -c 'import json; d=json.load(open("/usr/share/ublue-os/image-info.json")); print(d.get("image-name","?"), d.get("image-tag",""))' 2>/dev/null || echo "?")"
declare -A ENVV=()
while IFS='=' read -r k v; do ENVV[$k]="$v"; done < <(systemctl --user show-environment 2>/dev/null || true)
SESS=()
pgrep -x gamescope >/dev/null 2>&1 || pgrep -x gamescope-wl >/dev/null 2>&1 && SESS+=(Gamescope)
pgrep -x kwin_wayland >/dev/null 2>&1 && SESS+=(Plasma)
pgrep -x gnome-shell >/dev/null 2>&1 && SESS+=(GNOME)

{
  echo "Icefin HTPC lab info — $(date -Is)"
  echo "hostname:   $(hostname)"
  echo "user:       $(id -un)"
  echo "addresses:  $(ip -4 -o addr show scope global 2>/dev/null | awk '{print $2"="$4}' | paste -sd' ' -)"
  echo "os:         ${PRETTY_NAME:-$ID} (${VARIANT_ID:-?})"
  echo "image:      $IMG"
  echo "kernel:     $(uname -r)"
  echo "session:    ${SESS[*]:-none found} | WAYLAND_DISPLAY=${ENVV[WAYLAND_DISPLAY]:-} DISPLAY=${ENVV[DISPLAY]:-} desktop=${ENVV[XDG_CURRENT_DESKTOP]:-}"
  echo "gpu:"
  if command -v lspci >/dev/null; then lspci -nn | grep -Ei 'vga|3d|display' | sed 's/^/  /'
  else for d in /sys/class/drm/card[0-9]/device; do echo "  $(cat "$d/vendor" 2>/dev/null) $(cat "$d/device" 2>/dev/null)"; done; fi
  echo "displays:"
  for c in /sys/class/drm/card*-*; do [ "$(cat "$c/status" 2>/dev/null)" = connected ] && echo "  ${c##*/} connected"; done
  echo "hdmi audio (ELD):"
  found=0
  for e in /proc/asound/card*/eld#*; do
    [ -r "$e" ] || continue
    grep -q '^monitor_present.*1' "$e" || continue
    found=1
    echo "  ${e#/proc/asound/}: $(awk '/^monitor_name/ {$1=""; print substr($0,2)}' "$e") — $(awk '/coding_type/ {sub(/.*\] /,""); printf "%s; ", $0}' "$e")"
  done
  [ $found = 1 ] || echo "  none (TV/receiver off, or no HDMI audio device)"
  echo "sshd:       $(systemctl is-active sshd 2>/dev/null || true) / $(systemctl is-enabled sshd 2>/dev/null || true)"
  echo "sunshine:   $(command -v sunshine >/dev/null && echo installed || echo 'not found') $(systemctl --user is-active sunshine 2>/dev/null || true)"
  echo "free space: $(df -h --output=avail "$HOME" | tail -n1 | tr -d ' ') in home"
} > "$INFO.new"

b "Icefin Player HTPC lab setup ($MODE)"
echo
b "1. This HTPC"
sed 's/^/  /' "$INFO.new"
echo

b "2. Checks"
[ "$ID" = bazzite ] && ok "Bazzite $VERSION_ID" || wa "this is $ID, not Bazzite; the lab may still work"
command -v flatpak >/dev/null && ok "flatpak" || no "flatpak missing"
command -v python3 >/dev/null && ok "python3" || no "python3 missing"
if [ -n "${ENVV[WAYLAND_DISPLAY]:-}${ENVV[DISPLAY]:-}" ]; then ok "graphical session for $(id -un): ${SESS[*]:-?}"
else no "no graphical session for $(id -un): run this as the user that is logged in on the TV"; fi
shopt -s nullglob; cards=(/dev/dri/card*); shopt -u nullglob
acc=1; for c in "${cards[@]}"; do [ -r "$c" ] && [ -w "$c" ] || acc=0; done
if [ ${#cards[@]} -eq 0 ]; then no "no GPU display device (/dev/dri/card*) found"
elif [ $acc = 1 ]; then ok "GPU device access (needed to read the HDR signal)"
else wa "no access to /dev/dri/card* from here; run from the TV session's user"; fi
[ $found = 1 ] && ok "TV/receiver reports its audio formats over HDMI" || wa "no HDMI audio formats reported; turn the TV and receiver on and rerun"
if [ -f "$HERE/probe.py" ] && [ -n "${ENVV[WAYLAND_DISPLAY]:-}${ENVV[DISPLAY]:-}" ]; then
  python3 "$HERE/probe.py" drm > "$INFO.drm.json" 2>/dev/null && ok "display probe ran (saved with the info file)" || wa "display probe failed"
fi
echo

if [ "$MODE" = --check ]; then mv "$INFO.new" "$INFO"; b "Checked only; nothing changed. Report: $INFO"; exit 0; fi

b "3. SSH access for the lab workstation"
PUB="$HERE/workstation.pub"
[ -s "$PUB" ] || { no "workstation.pub missing from the kit"; exit 1; }
# restrict = no agent/X11 forwarding; the lab needs port forwarding (its tunnels) and a terminal.
LINE="restrict,port-forwarding,pty $(awk '{print $1, $2}' "$PUB") $KEYTAG"
install -d -m 700 "$HOME/.ssh"; touch "$HOME/.ssh/authorized_keys"; chmod 600 "$HOME/.ssh/authorized_keys"
if grep -q " $KEYTAG\$" "$HOME/.ssh/authorized_keys"; then
  grep -v " $KEYTAG\$" "$HOME/.ssh/authorized_keys" > "$HOME/.ssh/authorized_keys.tmp" || true
  mv "$HOME/.ssh/authorized_keys.tmp" "$HOME/.ssh/authorized_keys"; chmod 600 "$HOME/.ssh/authorized_keys"
fi
echo "$LINE" >> "$HOME/.ssh/authorized_keys"
ok "workstation key authorized for $(id -un) (tagged '$KEYTAG'; --remove takes it out)"
command -v restorecon >/dev/null && restorecon -R "$HOME/.ssh" 2>/dev/null || true

if systemctl is-active -q sshd; then ok "SSH server running"
else
  wa "SSH server is off"
  if ask "Turn on the SSH server now (sudo systemctl enable --now sshd)?"; then
    sudo systemctl enable --now sshd && ok "SSH server on and enabled at boot"
  else wa "skipped; the lab can't connect until it is on"; fi
fi
if command -v firewall-cmd >/dev/null; then
  if firewall-cmd --query-service=ssh >/dev/null 2>&1; then ok "firewall allows SSH"
  else wa "the firewall may block SSH: sudo firewall-cmd --permanent --add-service=ssh && sudo firewall-cmd --reload"; fi
fi
echo

b "4. Optional: watch the HTPC from the workstation"
if command -v sunshine >/dev/null || systemctl --user is-active -q sunshine 2>/dev/null; then ok "Sunshine is installed; pair it with Moonlight on the workstation"
else wa "for live viewing run 'ujust setup-sunshine' here, then pair Moonlight on the workstation"; fi
echo

sed -i "s/^sshd:.*/sshd:       $(systemctl is-active sshd 2>/dev/null || true) \/ $(systemctl is-enabled sshd 2>/dev/null || true)/" "$INFO.new"
mv "$INFO.new" "$INFO"
b "Done. Tell Claude this HTPC's hostname (or address) and user:"
echo "  $(hostname) / $(ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -n1) / user $(id -un)"
echo "  Full report: $INFO (Claude reads it over SSH; nothing is sent anywhere by this script)"
