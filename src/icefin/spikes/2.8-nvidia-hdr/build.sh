#!/usr/bin/env bash
# Spike 2.8: build the probes against the Flatpak's own SDK (org.kde.Sdk//6.11) in a lab guest, so they run inside
# Icefin's sandbox on the target machine (its Qt, Vulkan loader and GL extension):
#   vkcolorspaces  Vulkan swapchain colour spaces offered for a Wayland surface (spike 2.3's probe)
#   cmprobe        wp_color_manager_v1 features, output description (spike 2.3's probe)
#   qtswapchain    the swapchain format Qt Quick gets with QSG_RHI_HDR=hdr10 on Vulkan
# Usage (guest): build.sh [OUT]   then copy OUT to the target's ~/.var/app/io.github.stealthx3.IcefinPlayer/data/
# and run: flatpak run --user --command=OUT/run.sh io.github.stealthx3.IcefinPlayer
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="${1:-$HOME/sp28}"
mkdir -p "$out"
flatpak run --filesystem=home --command=sh org.kde.Sdk//6.11 -c "
set -e
cd '$out'
X=/usr/share/wayland-protocols/staging/color-management/color-management-v1.xml
wayland-scanner client-header \$X color-management-v1-client-protocol.h
wayland-scanner private-code \$X color-management-v1-protocol.c
cc -O2 -I. '$here/../2.3-hdr-surface/cmprobe.c' color-management-v1-protocol.c -lwayland-client -o cmprobe
cc -O2 '$here/../2.3-hdr-surface/vkcolorspaces.c' -lvulkan -lwayland-client -o vkcolorspaces
cmake -S '$here' -B build -DCMAKE_BUILD_TYPE=Release >/dev/null
cmake --build build >/dev/null
cp build/qtswapchain .
"
cp "$here/run.sh" "$out/run.sh"
chmod +x "$out/run.sh"
echo "built $out: cmprobe vkcolorspaces qtswapchain run.sh"
