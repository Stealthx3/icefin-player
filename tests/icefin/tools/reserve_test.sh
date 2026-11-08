#!/usr/bin/env bash
# Lab test for 3.5: PipeWire+WirePlumber hold card 0 while a tone plays; icefin-reserve-tool claims Audio0;
# the raw ALSA device must become openable, and PipeWire must take the card back afterwards.
# Run inside: dbus-run-session -- tests/icefin/tools/reserve_test.sh ~/build
set -u
B="${1:-$HOME/build}"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
pipewire >/tmp/pw.log 2>&1 & wireplumber >/tmp/wp.log 2>&1 & sleep 4
owner() { busctl --user status org.freedesktop.ReserveDevice1.Audio0 2>/dev/null | awk -F= '/^Comm=/{print $2}'; }
rawopen() { timeout 3 aplay -q -D hw:0,0 -f S16_LE -r 48000 -c 2 -d 1 /dev/zero >/dev/null 2>&1 && echo yes || echo no; }

speaker-test -D pipewire -c 2 -t sine -l 0 >/dev/null 2>&1 & ST=$!
sleep 3
echo "before: owner=$(owner) raw_open=$(rawopen)"
"$B/tests/icefin/icefin-reserve-tool" 0 8 & T=$!
sleep 4
echo "during: owner=$(owner) raw_open=$(rawopen)"
wait $T
sleep 4
echo "after:  owner=$(owner) raw_open=$(rawopen)"
kill $ST 2>/dev/null; pkill -x wireplumber; pkill -x pipewire
