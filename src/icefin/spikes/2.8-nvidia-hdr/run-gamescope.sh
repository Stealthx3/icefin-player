#!/bin/sh
# Spike 2.8 (Gamescope part): runs inside Icefin's sandbox inside a Gamescope session, as an XWayland client the way
# game mode runs it. Start from the desktop with a nested Gamescope:
#   gamescope --hdr-enabled -- flatpak run --user --socket=x11 --nosocket=wayland --env=ENABLE_GAMESCOPE_WSI=1 \
#     --command=<dir>/run-gamescope.sh io.github.stealthx3.IcefinPlayer
# (a nested Gamescope inside Plasma needs --socket=x11 --nosocket=wayland: Flatpak's fallback-x11 sees the desktop's
# wayland-0 and would withhold X11; game mode has no desktop compositor socket.)
d="$(dirname "$0")"
echo "== env: DISPLAY=$DISPLAY WAYLAND_DISPLAY=$WAYLAND_DISPLAY ENABLE_GAMESCOPE_WSI=$ENABLE_GAMESCOPE_WSI gamescope-0=$(ls "$XDG_RUNTIME_DIR"/gamescope-0 2>/dev/null)"
echo "== vkcs_xcb"; "$d/vkcs_xcb"
echo "== qtswapchain (xcb)"; QT_QPA_PLATFORM=xcb "$d/qtswapchain" 2>/dev/null
