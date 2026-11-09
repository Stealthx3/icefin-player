#!/usr/bin/env bash
# htpc.sh — the HTPC test tier (docs/LAB.md "HTPC tier", DECISIONS D16).
# The lab VM builds; the user's Bazzite HTPC runs every test that needs real hardware. Everything on the
# HTPC is per-user (Flatpak --user, files under ~/.local/share/icefin-lab): no rpm-ostree, no sudo, ever.
#
# Usage: scripts/icefin/htpc.sh <command> [args]
#   doctor               check SSH, the HTPC session, GPU/audio access, ports, the lab VM's repo
#   tunnel up|down|status  reverse tunnels: HTPC 127.0.0.1:<port+shift> -> lab VM (Jellyfin servers, Flatpak repo)
#   build                build the Flatpak into the lab VM's repo (same command as docs/LAB.md)
#   deploy               install or update Icefin on the HTPC from the lab repo (Flatpak --user)
#   play [harness args]  run tests/icefin/web/session_play.py in the on-screen session; results to build-htpc/results
#   probe [section...]   what the HTPC sends to the TV/receiver right now (host gpu drm audio); saved to results
#   session [status|plasma|gamescope]  show or switch the on-screen session (switching logs the TV session out)
#   exec CMD             run CMD on the HTPC in the on-screen session's environment
#   push                 copy the test tools to the HTPC
#   pull PATH [DIR]      copy PATH (relative to the HTPC's lab dir) back, keeping its path (default DIR: build-htpc)
#   clean                stop Icefin and delete its data on the HTPC (fresh profile)
#   uninstall            remove Icefin, the icefin-lab remote and the lab dir from the HTPC
#   watch                open Moonlight on this machine to watch the HTPC (Sunshine on the HTPC)
#   ssh                  interactive shell on the HTPC
# Config: tests/icefin/htpc/htpc.env (from htpc.env.example; git-ignored). HTPC_ENV=<file> picks another.
# House rules: play/probe/session/deploy refuse during HTPC_QUIET_HOURS or while HTPC_BUSY_PROCS run;
# HTPC_FORCE=1 overrides (only when the user said so).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENVF="${HTPC_ENV:-$ROOT/tests/icefin/htpc/htpc.env}"; [[ "$ENVF" == /* ]] || ENVF="$ROOT/$ENVF"
[ -f "$ENVF" ] || { echo "htpc: missing $ENVF (copy tests/icefin/htpc/htpc.env.example)" >&2; exit 2; }
# shellcheck disable=SC1090
source "$ENVF"

: "${HTPC_HOST:?set HTPC_HOST in $ENVF}" "${HTPC_USER:?set HTPC_USER in $ENVF}"
: "${HTPC_SSH_PORT:=22}" "${HTPC_SSH_KEY:=$HOME/.ssh/id_ed25519}" "${HTPC_HOSTKEY:=accept-new}"
: "${HTPC_DEST:=.local/share/icefin-lab}" "${HTPC_APP_ID:=io.github.stealthx3.IcefinPlayer}"
: "${HTPC_PORT_SHIFT:=30000}" "${HTPC_REPO_PORT:=8099}" "${HTPC_QUIET_HOURS:=}" "${HTPC_BUSY_PROCS:=reaper}"
: "${HTPC_ALLOW_SESSION_SWITCH:=0}" "${HTPC_LAB_ENV:=lab.env}" "${HTPC_FORCE:=0}"

die() { echo "htpc: $*" >&2; exit 1; }
[[ "$HTPC_APP_ID" =~ ^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)+$ ]] || die "bad HTPC_APP_ID"
[[ "$HTPC_DEST" =~ ^[A-Za-z0-9._/-]+$ && "$HTPC_DEST" != /* && "$HTPC_DEST" != *..* ]] || die "HTPC_DEST must be a plain path under the HTPC home"

LAB() { LAB_ENV="$HTPC_LAB_ENV" "$ROOT/scripts/lab.sh" "$@"; }
# HTPC_HOST=lab:<role> targets a lab guest that stands in for the HTPC (tests/icefin/htpc/htpc.sim.env).
if [[ "$HTPC_HOST" == lab:* ]]; then
  HOST="$(LAB_ENV="${HTPC_SIM_LAB_ENV:-lab.htpcsim.env}" "$ROOT/scripts/lab.sh" ip "${HTPC_HOST#lab:}")" || die "sim guest not running"
else HOST="$HTPC_HOST"; fi
TARGET="$HTPC_USER@$HOST"
RUN="${XDG_RUNTIME_DIR:-/tmp}/icefin-htpc"; mkdir -p "$RUN"; chmod 700 "$RUN"
TUN="$RUN/tunnel-$HTPC_USER-$HOST"
SSH=(-i "$HTPC_SSH_KEY" -p "$HTPC_SSH_PORT" -o BatchMode=yes -o ConnectTimeout=8 -o "StrictHostKeyChecking=$HTPC_HOSTKEY"
     -o ControlMaster=auto -o "ControlPath=$RUN/c-%C" -o ControlPersist=120 -o LogLevel=ERROR)
[ "$HTPC_HOSTKEY" = no ] && SSH+=(-o UserKnownHostsFile=/dev/null)
OUTDIR="$ROOT/build-htpc"; RESULTS="$OUTDIR/results"

# Server ports come from servers.json; on the HTPC each is shifted so a real Jellyfin there is never shadowed.
server_ports() { python3 -c 'import json,sys; print(" ".join(str(s["port"]) for s in json.load(open(sys.argv[1]))["servers"]))' \
  "$ROOT/tests/icefin/servers/servers.json"; }
REPO_R=$((HTPC_REPO_PORT + HTPC_PORT_SHIFT))

prelude() { # bash run first on the HTPC for every remote command
  printf 'set -euo pipefail\nD="$HOME/%s"; APP=%q; REPO_R=%q; SHIFT=%q\n' "$HTPC_DEST" "$HTPC_APP_ID" "$REPO_R" "$HTPC_PORT_SHIFT"
  cat <<'EOF'
sess_env() { # take on the environment of the session on screen (Plasma, GNOME or Gamescope)
  export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
  export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}"
  local k v
  while IFS='=' read -r k v; do
    case "$k" in WAYLAND_DISPLAY|DISPLAY|XAUTHORITY|XDG_CURRENT_DESKTOP|XDG_SESSION_TYPE|XDG_SESSION_DESKTOP|DESKTOP_SESSION)
      export "$k=$v" ;; esac
  done < <(systemctl --user show-environment 2>/dev/null)
  # Game mode: gamescope-session doesn't export its displays to systemd. Take them from the Steam client,
  # whose Xwayland (DISPLAY) is the one Gamescope shows.
  if [ -z "${WAYLAND_DISPLAY:-}${DISPLAY:-}" ] && pgrep -u "$(id -u)" -x "gamescope|gamescope-wl" >/dev/null 2>&1; then
    local pid; pid="$(pgrep -u "$(id -u)" -x steam | head -n1 || true)"
    if [ -n "$pid" ] && [ -r "/proc/$pid/environ" ]; then
      while IFS='=' read -r k v; do
        case "$k" in DISPLAY|XAUTHORITY|GAMESCOPE_WAYLAND_DISPLAY|XDG_SESSION_TYPE|XDG_SESSION_DESKTOP) export "$k=$v" ;; esac
      done < <(tr '\0' '\n' < "/proc/$pid/environ")
      export XDG_CURRENT_DESKTOP=gamescope
    fi
  fi
}
EOF
}
rexec() { # script goes in as an argument, not on stdin, so remote commands can't swallow it
  local script; script="$(prelude)
$1"
  ssh "${SSH[@]}" "$TARGET" "bash -c $(printf %q "$script")" </dev/null; }
q() { local out="" a; for a in "$@"; do out+=" $(printf %q "$a")"; done; printf '%s' "$out"; }

house() { # refuse during quiet hours or while something else is using the TV
  [ "$HTPC_FORCE" = 1 ] && { echo "htpc: house rules overridden (HTPC_FORCE=1)"; return 0; }
  local out h busy
  out="$(rexec "date +%H; for p in $HTPC_BUSY_PROCS; do pgrep -x \"\$p\" >/dev/null && echo \"busy \$p\"; done; true")"
  h=$((10#$(head -n1 <<<"$out")))
  busy="$(grep '^busy ' <<<"$out" | cut -d' ' -f2 | paste -sd, - || true)"
  [ -z "$busy" ] || die "HTPC is in use ($busy running); try later or HTPC_FORCE=1 with the user's OK"
  if [[ "$HTPC_QUIET_HOURS" =~ ^([0-9]{1,2})-([0-9]{1,2})$ ]]; then
    local a=$((10#${BASH_REMATCH[1]})) b=$((10#${BASH_REMATCH[2]})) quiet=0
    if (( a > b )); then (( h >= a || h < b )) && quiet=1; else (( h >= a && h < b )) && quiet=1; fi
    (( quiet )) && die "quiet hours ($HTPC_QUIET_HOURS, HTPC time ${h}h); try later or HTPC_FORCE=1 with the user's OK"
  fi
  return 0
}

vm_ip() { LAB ip main 2>/dev/null || die "lab VM not running (scripts/lab.sh up)"; }
VMSSH() { local ip; ip="$(vm_ip)"; local key; key="$(LAB_ENV="$HTPC_LAB_ENV" bash -c 'source "$1"; echo "${LAB_SSH_KEY%.pub}"' _ "$ROOT/$HTPC_LAB_ENV")"
  ssh -i "$key" -o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR lab@"$ip" "$@"; }

serve_repo() { # the VM serves its Flatpak repo over HTTP on the libvirt NAT network (host-only reach)
  VMSSH "systemctl --user is-active -q icefin-fp-repo 2>/dev/null || systemd-run --user --unit=icefin-fp-repo \
    python3 -m http.server $HTPC_REPO_PORT --bind 0.0.0.0 --directory \$HOME/fp-repo >/dev/null; test -f \$HOME/fp-repo/summary" \
    || die "lab VM has no Flatpak repo yet (scripts/icefin/htpc.sh build)"
}

cmd_tunnel() {
  case "${1:-up}" in
    status) ssh "${SSH[@]}" -S "$TUN" -O check "$TARGET" 2>/dev/null && echo "tunnel: up" || { echo "tunnel: down"; return 1; } ;;
    down) ssh "${SSH[@]}" -S "$TUN" -O exit "$TARGET" 2>/dev/null && echo "tunnel: closed" || echo "tunnel: was not up" ;;
    up)
      ssh "${SSH[@]}" -S "$TUN" -O check "$TARGET" 2>/dev/null && { echo "tunnel: up"; return 0; }
      serve_repo
      local ip fw=() p; ip="$(vm_ip)"
      for p in $(server_ports) "$HTPC_REPO_PORT"; do fw+=(-R "127.0.0.1:$((p + HTPC_PORT_SHIFT)):$ip:$p"); done
      ssh "${SSH[@]}" -o ControlMaster=yes -S "$TUN" -o ControlPersist=no -o ExitOnForwardFailure=yes \
        -o ServerAliveInterval=15 -o ServerAliveCountMax=4 -f -N "${fw[@]}" "$TARGET" \
        || die "tunnel failed (ports $(server_ports) $HTPC_REPO_PORT +$HTPC_PORT_SHIFT busy on the HTPC?)"
      echo "tunnel: up (HTPC 127.0.0.1: $(for p in $(server_ports) "$HTPC_REPO_PORT"; do printf '%s ' $((p + HTPC_PORT_SHIFT)); done)-> $ip)" ;;
    *) die "tunnel up|down|status" ;;
  esac
}

cmd_build() {
  LAB run 'flatpak-builder --user --install-deps-from=flathub --force-clean --state-dir=$HOME/fp-state --repo=$HOME/fp-repo $HOME/fp-build flatpak/io.github.stealthx3.IcefinPlayer.yml 2>&1 | tail -n 15'
}

cmd_deploy() {
  cmd_tunnel up
  rexec "
    flatpak --user remote-add --if-not-exists --no-gpg-verify icefin-lab http://127.0.0.1:\$REPO_R/
    flatpak --user remote-modify --url=http://127.0.0.1:\$REPO_R/ icefin-lab
    flatpak --user remote-add --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
    flatpak --user install -y --noninteractive --or-update icefin-lab \"\$APP\" 2>&1 | tail -n 5
    flatpak --user info \"\$APP\" | grep -E '^ *(Version|Commit|Runtime):'"
}

cmd_push() {
  rexec 'mkdir -p "$D/src" "$D/results"'
  tar -C "$ROOT" -czf - tests/icefin/web tests/icefin/servers/servers.json tests/icefin/servers/setup.py tests/icefin/htpc/probe.py \
    | ssh "${SSH[@]}" "$TARGET" "tar -xzf - -C \"\$HOME/$HTPC_DEST/src\""
}

cmd_pull() {
  local src="${1:?path under the HTPC lab dir}" dst="${2:-$OUTDIR}"
  [[ "$src" != /* && "$src" != *..* ]] || die "pull: path must be relative to the lab dir"
  mkdir -p "$dst"
  ssh "${SSH[@]}" "$TARGET" "cd \"\$HOME/$HTPC_DEST\" && tar -czf - $(printf %q "$src")" | tar -xzf - -C "$dst"
}

creds() { # throwaway lab-server credentials, VM -> HTPC, never through a terminal or a log
  VMSSH 'cat ~/jf/creds.json' | ssh "${SSH[@]}" "$TARGET" "umask 077; mkdir -p \"\$HOME/$HTPC_DEST/jf\"; cat > \"\$HOME/$HTPC_DEST/jf/creds.json\""
}

cmd_play() {
  house; cmd_tunnel up; cmd_push; creds
  local name="play-$(date +%Y%m%d-%H%M%S)" envs="" p n
  for n in $(python3 -c 'import json,sys; print(" ".join(s["name"] + ":" + str(s["port"]) for s in json.load(open(sys.argv[1]))["servers"]))' \
             "$ROOT/tests/icefin/servers/servers.json"); do
    p="${n#*:}"; envs+=" ICEFIN_PORT_$(tr '[:lower:]' '[:upper:]' <<<"${n%%:*}")=$((p + HTPC_PORT_SHIFT))"
  done
  local rc=0
  rexec "sess_env; cd \"\$D/src\"; mkdir -p \"\$D/results\"
    env ICEFIN_JF_DIR=\"\$D/jf\"$envs python3 tests/icefin/web/session_play.py --app flatpak:\$APP --qpa session \
      --out \"\$D/results/$name.json\"$(q "$@")" || rc=$?
  cmd_pull "results/$name.json" || true
  cmd_pull "results/$name.app.log" || true
  echo "htpc: results in build-htpc/results/$name.json"
  return $rc
}

cmd_probe() {
  house; cmd_push
  mkdir -p "$RESULTS"
  local out="$RESULTS/probe-$(date +%Y%m%d-%H%M%S).json"
  rexec "sess_env; python3 \"\$D/src/tests/icefin/htpc/probe.py\"$(q "$@")" | tee "$out"
  echo "htpc: saved $out" >&2
}

cmd_session() {
  case "${1:-status}" in
    status) cmd_push >/dev/null; rexec "sess_env; python3 \"\$D/src/tests/icefin/htpc/probe.py\" host" ;;
    plasma|gamescope)
      [ "$HTPC_ALLOW_SESSION_SWITCH" = 1 ] || die "session switching is off (HTPC_ALLOW_SESSION_SWITCH=1 in htpc.env)"
      # Leaving the user's default (game mode) obeys the house rules; going back to it never waits on quiet hours.
      [ "$1" = gamescope ] || house
      rexec "command -v steamos-session-select >/dev/null || { echo 'no steamos-session-select on this image' >&2; exit 1; }
             steamos-session-select $(printf %q "$1")"
      echo "htpc: switching to $1; the TV session restarts" ;;
    *) die "session status|plasma|gamescope" ;;
  esac
}

cmd_exec() { [ $# -gt 0 ] || die "exec CMD"; rexec "sess_env; cd \"\$D/src\" 2>/dev/null || cd; $*"; }

cmd_clean() {
  rexec 'flatpak kill "$APP" 2>/dev/null || true; sleep 1
         rm -rf "$HOME/.var/app/$APP" "$D/results"/*.app.log
         echo "clean: $APP stopped, ~/.var/app/$APP removed"'
}

cmd_uninstall() {
  cmd_tunnel down || true
  rexec 'flatpak kill "$APP" 2>/dev/null || true
         flatpak --user uninstall -y --noninteractive "$APP" 2>/dev/null || true
         flatpak --user remote-delete --force icefin-lab 2>/dev/null || true
         rm -rf "$HOME/.var/app/$APP" "$D"
         echo "uninstall: done (runtimes kept; flatpak --user uninstall --unused removes them)"'
}

cmd_watch() {
  if command -v moonlight >/dev/null; then nohup moonlight stream "$HOST" Desktop >/dev/null 2>&1 &
  elif flatpak info com.moonlight_stream.Moonlight >/dev/null 2>&1; then nohup flatpak run com.moonlight_stream.Moonlight stream "$HOST" Desktop >/dev/null 2>&1 &
  else echo "watch: install Moonlight here and Sunshine on the HTPC (ujust setup-sunshine), pair once, then rerun"; return 0; fi
  echo "watch: Moonlight streaming $HOST"
}

cmd_ssh() { exec ssh "${SSH[@]}" -t "$TARGET"; }

cmd_doctor() {
  local bad=0
  echo "htpc doctor ($TARGET, config $(basename "$ENVF"))"
  [ -f "$HTPC_SSH_KEY" ] && echo "  ok   ssh key $HTPC_SSH_KEY" || { echo "  FAIL ssh key $HTPC_SSH_KEY missing"; bad=1; }
  if ! ssh "${SSH[@]}" "$TARGET" true 2>/dev/null; then
    echo "  FAIL ssh $TARGET (sshd on? key in ~/.ssh/authorized_keys? host key: HTPC_HOSTKEY)"; echo "doctor: FAILED"; exit 1
  fi
  echo "  ok   ssh $TARGET"
  local ports="" tun=0; ssh "${SSH[@]}" -S "$TUN" -O check "$TARGET" 2>/dev/null && tun=1
  for p in $(server_ports) "$HTPC_REPO_PORT"; do ports+=" $((p + HTPC_PORT_SHIFT))"; done
  rexec "sess_env
    ok() { printf '  ok   %s\n' \"\$*\"; }; wa() { printf '  warn %s\n' \"\$*\"; }; no() { printf '  FAIL %s\n' \"\$*\"; bad=1; }; bad=0
    . /etc/os-release; [ \"\$ID\" = bazzite ] && ok \"Bazzite \$VERSION_ID (\${VARIANT_ID:-?})\" || wa \"OS is \$ID, not bazzite\"
    for b in flatpak python3 tar systemctl; do command -v \$b >/dev/null && ok \$b || no \"\$b missing\"; done
    for b in amixer vulkaninfo steamos-session-select; do command -v \$b >/dev/null && ok \$b || wa \"\$b not found (optional)\"; done
    [ -n \"\${WAYLAND_DISPLAY:-}\${DISPLAY:-}\" ] && ok \"session on screen: \${XDG_CURRENT_DESKTOP:-?} WAYLAND_DISPLAY=\${WAYLAND_DISPLAY:-} DISPLAY=\${DISPLAY:-}\" \
      || no 'no graphical session for this user (auto-login to the TV session as this user?)'
    for c in /dev/dri/card*; do [ -r \"\$c\" ] && [ -w \"\$c\" ] && ok \"\$c accessible\" || wa \"\$c not accessible (probe drm needs it)\"; done
    ls /proc/asound/card*/eld#* >/dev/null 2>&1 && ok \"HDMI ELD files present\" || wa 'no HDMI ELD files (no HDMI audio device?)'
    for p in$ports; do if (ss -ltnH 2>/dev/null || true) | awk '{print \$4}' | grep -q \":\$p\$\"; then
      [ $tun = 1 ] && ok \"port \$p in use (tunnel?)\" || wa \"port \$p already in use on the HTPC (change HTPC_PORT_SHIFT)\"; else ok \"port \$p free\"; fi; done
    flatpak --user info \"\$APP\" >/dev/null 2>&1 && ok \"\$APP installed (--user)\" || wa \"\$APP not installed yet (deploy)\"
    df -h --output=avail \"\$HOME\" | tail -n1 | xargs -I{} echo '  info free space in home: {}'
    exit \$bad" || bad=1
  if vm_ip >/dev/null 2>&1; then echo "  ok   lab VM up ($(vm_ip))"; else echo "  warn lab VM not running (scripts/lab.sh up)"; fi
  if [ -n "$HTPC_QUIET_HOURS" ]; then echo "  info quiet hours $HTPC_QUIET_HOURS; busy processes: $HTPC_BUSY_PROCS"
  else echo "  warn no quiet hours set (HTPC_QUIET_HOURS)"; fi
  [ $bad -eq 0 ] && echo "doctor: OK" || { echo "doctor: FAILED"; exit 1; }
}

c="${1:-}"; shift || true
case "$c" in
  doctor|tunnel|build|deploy|play|probe|session|exec|push|pull|clean|uninstall|watch|ssh) "cmd_$c" "$@" ;;
  *) sed -n '2,23p' "$0"; exit 2 ;;
esac
