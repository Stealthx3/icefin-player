#!/bin/sh
# Builds the virtual HDR display for the lab (PLAN 5.10): Weston with color management and the headless backend,
# into ~/weston-16 (or $1). Debian 13 ships Weston 14, which predates the color-management protocol Icefin uses.
# Weston 16 needs wayland-protocols >= 1.46 (Debian 13 has 1.44): it is built as a Meson subproject, so nothing on
# the system changes apart from the build dependencies installed with apt.
# Used by tests/icefin/web/hdr_protocol.py (WESTON=<prefix>/bin/weston). Also in CI (5.10, Ubuntu 24.04): there
# libdisplay-info is older than Weston 16 wants, and Meson builds it as a subproject. With a cached prefix already in
# place only the packages are installed (Weston needs their libraries at run time).
set -eu
PREFIX="${1:-$HOME/weston-16}"
WESTON_TAG=16.0.2
WP_TAG=1.47
SRC="$HOME/weston/weston-$WESTON_TAG"
sudo -n apt-get install -y -q meson ninja-build libcairo2-dev liblcms2-dev libdisplay-info-dev libdrm-dev libpixman-1-dev \
  libxkbcommon-dev libinput-dev libegl-dev libgles-dev libseat-dev libwayland-dev wayland-protocols hwdata \
  libegl-mesa0 libgl1-mesa-dri libexpat1-dev libffi-dev libxml2-dev >/dev/null
if [ -x "$PREFIX/bin/weston" ]; then
  echo "build-weston: $PREFIX/bin/weston already built"
  exit 0
fi
mkdir -p "$HOME/weston"
# wayland-protocols 1.47 needs wayland-scanner 1.23+; Ubuntu 24.04 (CI) has 1.22: Wayland 1.24 into the same prefix.
if ! pkg-config --atleast-version=1.23 wayland-scanner; then
  W="$HOME/weston/wayland-1.24.0"
  [ -d "$W" ] || git -c advice.detachedHead=false clone -q --depth 1 --branch 1.24.0 https://gitlab.freedesktop.org/wayland/wayland.git "$W"
  (cd "$W" && rm -rf build && meson setup build --prefix="$PREFIX" -Ddocumentation=false -Dtests=false -Ddtd_validation=false \
    > meson-setup.log 2>&1 && ninja -C build install > ninja.log 2>&1) || { tail -30 "$W/meson-setup.log" "$W/ninja.log" 2>/dev/null; exit 1; }
  export PKG_CONFIG_PATH="$(ls -d "$PREFIX"/lib/*-linux-gnu)/pkgconfig${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
  export PATH="$PREFIX/bin:$PATH"
fi
[ -d "$SRC" ] || git -c advice.detachedHead=false clone -q --depth 1 --branch "$WESTON_TAG" https://gitlab.freedesktop.org/wayland/weston.git "$SRC"
[ -d "$SRC/subprojects/wayland-protocols" ] || git -c advice.detachedHead=false clone -q --depth 1 --branch "$WP_TAG" \
  https://gitlab.freedesktop.org/wayland/wayland-protocols.git "$SRC/subprojects/wayland-protocols"
cd "$SRC"
rm -rf build
meson setup build --prefix="$PREFIX" -Dbackend-default=headless -Dbackend-headless=true -Dbackend-drm=false \
  -Dbackend-wayland=false -Dbackend-x11=false -Dbackend-rdp=false -Dbackend-vnc=false -Dbackend-pipewire=false \
  -Drenderer-gl=true -Drenderer-vulkan=false -Dimage-jpeg=false -Dimage-webp=false -Dxwayland=false -Dshell-ivi=false -Dshell-lua=false -Dsystemd=false -Ddemo-clients=false \
  -Dsimple-clients=[] -Dtests=false -Dcolor-management-lcms=true > meson-setup.log 2>&1 \
  || { tail -40 meson-setup.log; exit 1; }
ninja -C build install > ninja.log 2>&1 || { tail -40 ninja.log; exit 1; }
LD_LIBRARY_PATH="$(ls -d "$PREFIX"/lib/*-linux-gnu)" "$PREFIX/bin/weston" --version
