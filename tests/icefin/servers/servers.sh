#!/usr/bin/env bash
# servers.sh — run the lab Jellyfin servers in rootless podman (PLAN 1.7). Run inside a lab guest.
# Usage: tests/icefin/servers/servers.sh up|down|status|reset
#   up: generate media, start every server in servers.json, then run setup.py (wizard, libraries, plugins).
#   reset: remove containers and their config/cache (media is kept).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; J="$HOME/jf"
mapfile -t S < <(python3 -c 'import json,sys;[print(s["name"],s["image"],s["port"]) for s in json.load(open(sys.argv[1]))["servers"]]' "$here/servers.json")
case "${1:-status}" in
  up)
    "$here/make-media.sh" "$J/media"
    for row in "${S[@]}"; do read -r n img port <<<"$row"
      mkdir -p "$J/$n/config" "$J/$n/cache"
      if ! podman container exists "$n"; then
        podman run -d --name "$n" -p "$port:8096" -v "$J/$n/config:/config:Z" -v "$J/$n/cache:/cache:Z" \
          -v "$J/media:/media:ro,Z" --restart=unless-stopped "$img" >/dev/null
      fi
      podman start "$n" >/dev/null; echo "servers: $n ($img) on :$port"
    done
    python3 "$here/setup.py" "$here/servers.json" ;;
  down) for row in "${S[@]}"; do read -r n _ <<<"$row"; podman stop -t 10 "$n" >/dev/null 2>&1 || true; done; echo "servers: stopped" ;;
  reset) for row in "${S[@]}"; do read -r n _ <<<"$row"; podman rm -f "$n" >/dev/null 2>&1 || true; podman unshare rm -rf "$J/$n"; done; echo "servers: reset" ;;
  status) podman ps -a --filter name=jf --format '{{.Names}} {{.Image}} {{.Status}}'; [ -f "$J/status.json" ] && cat "$J/status.json" ;;
  *) sed -n '2,5p' "$0"; exit 2 ;;
esac
