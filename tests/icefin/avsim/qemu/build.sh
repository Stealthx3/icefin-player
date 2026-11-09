#!/usr/bin/env bash
# build.sh — build QEMU with the hda-hdmi-sink device (virtual TV / AV receiver) for the Virtual AV tier.
# Runs inside lab-icefin-main (never on the host). Source and build stay outside the synced tree:
#   ~/avsim/src/qemu-$QEMU_VER   pristine tarball + the device
#   ~/avsim/qemu                 install prefix (bin/qemu-system-x86_64)
# Usage: scripts/lab.sh run 'bash tests/icefin/avsim/qemu/build.sh'
set -euo pipefail
QEMU_VER=10.0.6
QEMU_SHA256=c7c40c4b166871e775804e97fce4da65665d1cc93a5c6c9e2ede9d9ee992e7a0   # pinned 2026-11-09 (download.qemu.org over HTTPS)
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AV="$HOME/avsim"; SRC="$AV/src/qemu-$QEMU_VER"; PREFIX="$AV/qemu"
mkdir -p "$AV/src"

if [ ! -d "$SRC" ]; then
  tarball="$AV/src/qemu-$QEMU_VER.tar.xz"
  [ -f "$tarball" ] || curl -fsSL "https://download.qemu.org/qemu-$QEMU_VER.tar.xz" -o "$tarball"
  echo "$QEMU_SHA256  $tarball" | sha256sum -c --quiet - || { echo "build: checksum mismatch for $tarball" >&2; exit 1; }
  tar -C "$AV/src" -xf "$tarball"
fi

cp "$HERE/hda-hdmi-sink.c" "$SRC/hw/audio/hda-hdmi-sink.c"
grep -q hda-hdmi-sink.c "$SRC/hw/audio/meson.build" || \
  echo "system_ss.add(when: 'CONFIG_HDA', if_true: files('hda-hdmi-sink.c'))" >> "$SRC/hw/audio/meson.build"

if [ ! -f "$SRC/build/build.ninja" ]; then
  (cd "$SRC" && ./configure --prefix="$PREFIX" --target-list=x86_64-softmmu --enable-kvm --enable-slirp \
     --disable-docs --disable-werror --disable-gtk --disable-sdl --disable-opengl --disable-spice \
     --disable-vnc-jpeg --disable-xen --disable-capstone --audio-drv-list= >/dev/null)
fi
ninja -C "$SRC/build" >/dev/null
ninja -C "$SRC/build" install >/dev/null
"$PREFIX/bin/qemu-system-x86_64" -device help 2>&1 | grep -q '"hda-hdmi-sink"' && echo "build: ok, $PREFIX/bin/qemu-system-x86_64 has hda-hdmi-sink"
