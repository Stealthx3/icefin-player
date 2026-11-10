#!/bin/sh
# Spike 2.8: runs inside Icefin's sandbox (flatpak run --command=<dir>/run.sh io.github.stealthx3.IcefinPlayer) in the
# desktop session to test. Prints one section per probe; the Qt run is repeated with a Wayland protocol trace to see
# whether the driver tags the surface itself (spike 2.3 design note 1).
d="$(dirname "$0")"
echo "== vkcolorspaces"; "$d/vkcolorspaces"
echo "== cmprobe"; "$d/cmprobe"
echo "== qtswapchain (Wayland)"; QT_QPA_PLATFORM=wayland "$d/qtswapchain" 2>/dev/null
echo "== surface tagging by the driver"
WAYLAND_DEBUG=client QT_QPA_PLATFORM=wayland "$d/qtswapchain" 2>&1 >/dev/null | grep -c -E "wp_color_manager_v1#[0-9]+\.get_surface|set_image_description" | sed 's/^/requests: /'
