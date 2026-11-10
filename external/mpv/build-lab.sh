#!/usr/bin/env bash
# Build the pinned libplacebo and the patched libmpv (external/mpv/README.md) into a prefix, in a lab guest.
# Usage: external/mpv/build-lab.sh [PREFIX]   (default ~/mpv-icefin). Needs meson, ninja and mpv's build deps
# (Debian: apt build-dep mpv). Idempotent: rebuilds into a fresh work directory each run.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
prefix="${1:-$HOME/mpv-icefin}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
MPV_URL=https://github.com/mpv-player/mpv/archive/refs/tags/v0.42.0.tar.gz
MPV_SHA=bcfebbfa2b65a6d88dc97ea18117831072373e38b5785a2afb874ed4df5070dd
PLACEBO_TAG=v7.387.0
PLACEBO_COMMIT=275f7dea27924cdd34ab2e6c20e448b6bc4fab65

cd "$work"
git clone -q -c advice.detachedHead=false --depth 1 --branch "$PLACEBO_TAG" --recurse-submodules --shallow-submodules https://github.com/haasn/libplacebo.git libplacebo
[ "$(git -C libplacebo rev-parse HEAD)" = "$PLACEBO_COMMIT" ] || { echo "libplacebo $PLACEBO_TAG isn't $PLACEBO_COMMIT"; exit 1; }
meson setup libplacebo/build libplacebo --prefix="$prefix" -Ddemos=false -Dtests=false >/dev/null
ninja -C libplacebo/build install >/dev/null
echo "libplacebo $PLACEBO_TAG -> $prefix"

curl -sSL -o mpv.tar.gz "$MPV_URL"
echo "$MPV_SHA  mpv.tar.gz" | sha256sum -c --quiet
tar xzf mpv.tar.gz
cd mpv-0.42.0
for p in "$here"/patches/*.patch; do patch -s -p1 < "$p"; done
export PKG_CONFIG_PATH="$prefix/lib/x86_64-linux-gnu/pkgconfig:$prefix/lib/pkgconfig${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
meson setup build --prefix="$prefix" -Dlibmpv=true -Dcplayer=false -Dalsa=enabled -Dlua=disabled \
  -Dmanpage-build=disabled -Dbuild-date=false >/dev/null
ninja -C build install >/dev/null
test -f "$prefix/include/mpv/render_vk.h"
echo "libmpv 0.42.0 + $(ls "$here"/patches/*.patch | wc -l) patches -> $prefix (render_vk.h installed)"
