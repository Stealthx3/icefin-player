#!/bin/sh
# Builds Gamescope for the lab (PLAN 11.5 option D): Valve's compositor with its headless backend and its WSI Vulkan
# layer, into ~/gamescope-lab (or $1). Debian 13 doesn't package Gamescope. 3.16.30.2's pinned wlroots needs newer
# Wayland, libdrm, xkbcommon, wayland-protocols and pixman than Debian 13 has: each is built from its tag into the same
# private prefix, so nothing on the system changes apart from the build dependencies installed with apt. (3.16.23.6,
# on wlroots 0.18, can't be built: its pinned wlroots commit is gone from every remote.)
# Used by tests/icefin/web/gamescope_hdr.py (GAMESCOPE=<prefix>).
set -eu
PREFIX="${1:-$HOME/gamescope-lab}"
SRC="$HOME/ext"
GAMESCOPE_TAG=3.16.30.2
sudo -n apt-get install -y -q meson ninja-build cmake glslang-tools libvulkan-dev libx11-dev libxdamage-dev \
  libxcomposite-dev libxcursor-dev libxrender-dev libxext-dev libxfixes-dev libxxf86vm-dev libxtst-dev libxres-dev \
  libxmu-dev libxi-dev libxkbcommon-dev libxcb-xkb-dev libxcb-composite0-dev libxcb-icccm4-dev libxcb-res0-dev \
  libxcb-ewmh-dev libxcb-errors-dev libinput-dev libseat-dev libsystemd-dev libudev-dev libdisplay-info-dev \
  libliftoff-dev libluajit-5.1-dev libbenchmark-dev libsdl2-dev libeis-dev hwdata libcap-dev \
  libdecor-0-dev xwayland >/dev/null
export PKG_CONFIG_PATH="$PREFIX/lib/x86_64-linux-gnu/pkgconfig:$PREFIX/share/pkgconfig"
export PATH="$PREFIX/bin:$PATH"
mkdir -p "$SRC"

dep() { # dep NAME URL TAG [meson options...]
  name=$1 url=$2 tag=$3; shift 3
  [ -d "$SRC/$name" ] || git clone -q "$url" "$SRC/$name"
  git -C "$SRC/$name" fetch -q --tags
  git -C "$SRC/$name" -c advice.detachedHead=false checkout -q "$tag"
  rm -rf "$SRC/$name/build"
  (cd "$SRC/$name" && meson setup build --prefix="$PREFIX" "$@" >/dev/null && ninja -C build install >/dev/null)
  echo "build-gamescope: $name $tag"
}
dep wayland https://gitlab.freedesktop.org/wayland/wayland.git 1.24.0 -Ddocumentation=false -Dtests=false -Ddtd_validation=false
dep wayland-protocols https://gitlab.freedesktop.org/wayland/wayland-protocols.git 1.47 -Dtests=false
dep drm https://gitlab.freedesktop.org/mesa/drm.git libdrm-2.4.129 -Dtests=false -Dman-pages=disabled -Dvalgrind=disabled -Dcairo-tests=disabled
dep libxkbcommon https://github.com/xkbcommon/libxkbcommon.git xkbcommon-1.8.1 -Denable-docs=false -Denable-tools=false \
  -Denable-x11=true -Denable-wayland=false -Dxkb-config-root=/usr/share/X11/xkb -Dx-locale-root=/usr/share/X11/locale
dep pixman https://gitlab.freedesktop.org/pixman/pixman.git pixman-0.46.4 -Dtests=disabled -Ddemos=disabled -Dgtk=disabled -Dlibpng=disabled

G="$SRC/gamescope"
[ -d "$G" ] || git clone -q https://github.com/ValveSoftware/gamescope.git "$G"
git -C "$G" fetch -q --tags
git -C "$G" -c advice.detachedHead=false checkout -q "$GAMESCOPE_TAG"
git -C "$G" submodule update --init -q --recursive
rm -rf "$G/build"
(cd "$G" && meson setup build --prefix="$PREFIX" -Dpipewire=disabled -Denable_openvr_support=false -Denable_tests=false \
  -Davif_screenshots=disabled >/dev/null && ninja -C build install >/dev/null)
LD_LIBRARY_PATH="$PREFIX/lib/x86_64-linux-gnu" "$PREFIX/bin/gamescope" --version 2>&1 | head -1
