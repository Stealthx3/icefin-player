#!/usr/bin/env bash
# Build the spike 2.3 probe in a lab guest: needs libwayland-dev, wayland-protocols >= 1.41.
set -euo pipefail
cd "$(dirname "$0")"; O="${1:-$HOME/sp23}"; mkdir -p "$O"
X=/usr/share/wayland-protocols/staging/color-management/color-management-v1.xml
wayland-scanner client-header "$X" "$O/color-management-v1-client-protocol.h"
wayland-scanner private-code "$X" "$O/color-management-v1-protocol.c"
cc -O2 -Wall -I"$O" cmprobe.c "$O/color-management-v1-protocol.c" -lwayland-client -o "$O/cmprobe"
echo "built $O/cmprobe"
