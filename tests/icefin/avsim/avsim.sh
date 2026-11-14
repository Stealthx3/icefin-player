#!/usr/bin/env bash
# avsim.sh — Virtual AV tier (docs/LAB.md): a nested guest ("the client") inside lab-icefin-main whose only
# audio output is the hda-hdmi-sink device, a virtual TV / AV receiver that reports a chosen ELD and records
# every stream it receives. Runs inside lab-icefin-main, never on the host:
#   scripts/lab.sh run 'bash tests/icefin/avsim/avsim.sh <command>'
#
# Commands:
#   build                 build QEMU with the device (qemu/build.sh)
#   image                 download + verify the Debian 13 image, provision the client once (base disk)
#   icefin-image APP      a second base disk (avsim-icefin) with what the native Icefin build APP needs to run
#                         (its libraries, Qt's QML modules, plugins and WebEngine, Xvfb, D-Bus); PLAN 3.9
#   up [PROFILE]          start the client from a fresh overlay with the sink on PROFILE (default avr-full);
#                         AVSIM_BASE=avsim-icefin starts it from the Icefin disk
#   profile PROFILE       switch the sink to another profile at run time (hotplug event, like a new receiver)
#   plug | unplug         monitor presence on/off
#   ssh CMD...            run a command in the client
#   status | down | console
#   matrix [ARGS]         run matrix.py (ELD rows, hotplug, bitstream transport)
#
# Paths (outside the synced tree): ~/avsim/{qemu,img,run,capture,eld}. Client SSH: 127.0.0.1:2222, key ~/.ssh/avsim.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AV="$HOME/avsim"; QEMU="$AV/qemu/bin/qemu-system-x86_64"
IMG_URL=https://cloud.debian.org/images/cloud/trixie/latest
IMG=debian-13-generic-amd64.qcow2      # "generic", not "genericcloud": the cloud kernel has no sound drivers
RUN="$AV/run"; CAP="$AV/capture"; ELD="$AV/eld"; KEY="$HOME/.ssh/avsim"
PORT=2222; MEM_MB=${AVSIM_MEM_MB:-3072}; CPUS=${AVSIM_CPUS:-2}
SSH=(ssh -i "$KEY" -p "$PORT" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -o ConnectTimeout=5 lab@127.0.0.1)

die() { echo "avsim: $*" >&2; exit 1; }
need_qemu() { [ -x "$QEMU" ] || die "no patched QEMU; run: avsim.sh build"; }
running() { [ -f "$RUN/qemu.pid" ] && kill -0 "$(cat "$RUN/qemu.pid")" 2>/dev/null; }

qmp() { # qmp COMMAND-JSON — one QMP command over the client's control socket
  python3 - "$RUN/qmp.sock" "$1" <<'PY'
import json, socket, sys
s = socket.socket(socket.AF_UNIX); s.connect(sys.argv[1]); f = s.makefile("rw")
json.loads(f.readline())
f.write('{"execute":"qmp_capabilities"}\n'); f.flush(); json.loads(f.readline())
f.write(sys.argv[2] + "\n"); f.flush()
while True:
    r = json.loads(f.readline())
    if "event" in r: continue
    if "error" in r: sys.exit("avsim: qmp: " + r["error"]["desc"])
    print(json.dumps(r.get("return"))); break
PY
}

eld_for() { # eld_for PROFILE -> path of the binary ELD ("" for a sink without one)
  mkdir -p "$(dirname "$ELD/$1")"  # public/<name> profiles (edid_profiles.py) sit one level down
  python3 "$HERE/eld.py" build "$1" "$ELD/$1.eld" >/dev/null
  [ -s "$ELD/$1.eld" ] && echo "$ELD/$1.eld" || echo ""
}

wait_ssh() {
  for _ in $(seq 1 90); do "${SSH[@]}" true 2>/dev/null && return 0; sleep 2; done
  die "client SSH not ready after 180s (see $RUN/serial.log)"
}

cmd_image() {
  need_qemu
  mkdir -p "$AV/img" "$RUN"; cd "$AV/img"
  [ -f "$KEY" ] || ssh-keygen -q -t ed25519 -N "" -C avsim -f "$KEY"
  if [ ! -f "$IMG" ]; then
    curl -fsSL -o SHA512SUMS "$IMG_URL/SHA512SUMS"
    curl -fsSL -o "$IMG.part" "$IMG_URL/$IMG"
    mv "$IMG.part" "$IMG"
  fi
  grep " $IMG\$" SHA512SUMS | sha512sum -c --quiet - || die "checksum mismatch for $IMG"
  [ -f avsim-base.qcow2 ] && { echo "avsim: base disk exists ($AV/img/avsim-base.qcow2); delete it to re-provision"; return 0; }
  cat > user-data <<EOF
#cloud-config
hostname: avsim-client
users:
  - name: lab
    sudo: ALL=(ALL) NOPASSWD:ALL
    groups: [audio, video]
    shell: /bin/bash
    ssh_authorized_keys: ["$(cat "$KEY.pub")"]
package_update: true
packages: [alsa-utils, mpv, ffmpeg, python3]
runcmd:
  - [sh, -c, "echo 'options snd-hda-intel power_save=0' > /etc/modprobe.d/avsim.conf"]
power_state: {mode: poweroff, timeout: 30, condition: true}
EOF
  printf 'instance-id: avsim-base\nlocal-hostname: avsim-client\n' > meta-data
  genisoimage -quiet -output seed.iso -volid cidata -joliet -rock user-data meta-data
  "$AV/qemu/bin/qemu-img" create -q -f qcow2 -F qcow2 -b "$AV/img/$IMG" avsim-base.qcow2 12G
  echo "avsim: provisioning the client (first boot, cloud-init, then power-off)..."
  "$QEMU" -enable-kvm -cpu host -m "$MEM_MB" -smp "$CPUS" -display none -serial "file:$RUN/provision.log" \
    -drive file=avsim-base.qcow2,if=virtio -drive file=seed.iso,media=cdrom -nic user,model=virtio-net-pci
  grep -q "Cloud-init.*finished" "$RUN/provision.log" || die "provisioning did not finish (see $RUN/provision.log)"
  echo "avsim: base disk ready"
}

# The Debian packages a native Icefin build needs at run time: the owners of the libraries it links, and the QML
# modules, Qt plugins and WebEngine packages the lab has (loaded at run time, so ldd can't see them).
icefin_packages() {
  local app="$1" f r
  for f in $(ldd "$app" | awk '/=> \//{print $3}'); do
    r="$(realpath "$f")"
    dpkg -S "$r" 2>/dev/null || dpkg -S "${r#/usr}" 2>/dev/null || dpkg -S "/usr$r" 2>/dev/null || true
  done | cut -d: -f1
  dpkg-query -W -f '${Package}\n' 'qml6-module-*' 'libqt6webengine*' 'qt6-*plugin*' 'qt6-webengine*' 2>/dev/null
  printf '%s\n' xvfb xauth dbus dbus-x11 fonts-dejavu-core
}

cmd_icefin_image() {
  need_qemu
  local app="${1:?usage: avsim.sh icefin-image APP (a native build, e.g. ~/build/src/icefin-player)}"
  [ -f "$AV/img/avsim-base.qcow2" ] || die "no base disk; run: avsim.sh image"
  running && die "client running (avsim.sh down first)"
  local disk="$AV/img/avsim-icefin.qcow2" pkgs
  pkgs="$(icefin_packages "$app" | sort -u | tr '\n' ' ')"
  rm -f "$disk"
  "$AV/qemu/bin/qemu-img" create -q -f qcow2 -F qcow2 -b "$AV/img/avsim-base.qcow2" "$disk"
  mkdir -p "$RUN"
  "$QEMU" -name avsim-provision -enable-kvm -cpu host -m "$MEM_MB" -smp "$CPUS" \
    -display none -serial "file:$RUN/provision-icefin.log" -daemonize -pidfile "$RUN/qemu.pid" \
    -drive file="$disk",if=virtio -nic "user,model=virtio-net-pci,hostfwd=tcp:127.0.0.1:$PORT-:22" 2> "$RUN/qemu.log" \
    || { cat "$RUN/qemu.log" >&2; die "QEMU failed to start"; }
  wait_ssh
  echo "avsim: installing $(echo "$pkgs" | wc -w) packages for Icefin..."
  # Packages the lab VM keeps but the archive no longer offers (no candidate) are skipped and listed.
  "${SSH[@]}" "sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq || exit 1
    have=''; for p in $pkgs; do if apt-cache policy \"\$p\" | grep -q 'Candidate: [^(]'; then have=\"\$have \$p\"; else echo \"avsim: skipped \$p (no candidate)\"; fi; done
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends \$have >/tmp/apt.log 2>&1 || { tail -20 /tmp/apt.log; exit 1; }" \
    || { "${SSH[@]}" "sudo poweroff" >/dev/null 2>&1 || true; die "package install failed"; }
  "${SSH[@]}" "sudo apt-get clean; sync; sudo poweroff" >/dev/null 2>&1 || true
  for _ in $(seq 1 60); do running || break; sleep 1; done
  rm -f "$RUN/qemu.pid"
  echo "avsim: Icefin disk ready ($disk); start with AVSIM_BASE=avsim-icefin avsim.sh up"
}

cmd_up() {
  need_qemu
  local profile="${1:-avr-full}" eld base="$AV/img/${AVSIM_BASE:-avsim-base}.qcow2"
  [ -f "$base" ] || die "no base disk $base; run: avsim.sh image (and icefin-image for avsim-icefin)"
  running && die "client already running (avsim.sh down first)"
  mkdir -p "$RUN" "$CAP"
  rm -f "$RUN/client.qcow2" "$RUN/qmp.sock"
  rm -rf "${CAP:?}"/*
  "$AV/qemu/bin/qemu-img" create -q -f qcow2 -F qcow2 -b "$base" "$RUN/client.qcow2"
  eld="$(eld_for "$profile")"
  "$QEMU" -name avsim-client -enable-kvm -cpu host -m "$MEM_MB" -smp "$CPUS" \
    -display none -serial "file:$RUN/serial.log" -daemonize -pidfile "$RUN/qemu.pid" \
    -qmp "unix:$RUN/qmp.sock,server=on,wait=off" \
    -drive file="$RUN/client.qcow2",if=virtio \
    -nic "user,model=virtio-net-pci,hostfwd=tcp:127.0.0.1:$PORT-:22" \
    -device ich9-intel-hda,id=hda \
    -device "hda-hdmi-sink,id=sink,bus=hda.0,connected=on,eld=$eld,capture=$CAP" \
    2> "$RUN/qemu.log" || { cat "$RUN/qemu.log" >&2; die "QEMU failed to start"; }
  echo "$profile" > "$RUN/profile"
  wait_ssh
  echo "avsim: client up, sink profile $profile (captures in $CAP)"
}

cmd_profile() {
  running || die "client not running"
  local eld; eld="$(eld_for "$1")"
  qmp "{\"execute\":\"qom-set\",\"arguments\":{\"path\":\"/machine/peripheral/sink\",\"property\":\"eld\",\"value\":\"$eld\"}}" >/dev/null
  echo "$1" > "$RUN/profile"
  echo "avsim: sink now $1"
}

cmd_presence() {
  running || die "client not running"
  qmp "{\"execute\":\"qom-set\",\"arguments\":{\"path\":\"/machine/peripheral/sink\",\"property\":\"connected\",\"value\":$1}}" >/dev/null
  echo "avsim: connected=$1"
}

cmd_down() {
  running || { echo "avsim: not running"; return 0; }
  qmp '{"execute":"quit"}' >/dev/null 2>&1 || kill "$(cat "$RUN/qemu.pid")"
  for _ in $(seq 1 20); do running || break; sleep 0.5; done
  rm -f "$RUN/qemu.pid"
  echo "avsim: down"
}

case "${1:-}" in
  build)   bash "$HERE/qemu/build.sh" ;;
  image)   cmd_image ;;
  icefin-image) shift; cmd_icefin_image "$@" ;;
  up)      shift; cmd_up "$@" ;;
  profile) [ -n "${2:-}" ] || die "usage: avsim.sh profile PROFILE"; cmd_profile "$2" ;;
  plug)    cmd_presence true ;;
  unplug)  cmd_presence false ;;
  ssh)     shift; "${SSH[@]}" "$@" ;;
  status)  if running; then echo "avsim: running, profile $(cat "$RUN/profile" 2>/dev/null)"; else echo "avsim: stopped"; fi ;;
  console) tail -n 40 "$RUN/serial.log" ;;
  down)    cmd_down ;;
  matrix)  shift; python3 "$HERE/matrix.py" "$@" ;;
  *)       sed -n '2,20p' "$0"; exit 2 ;;
esac
