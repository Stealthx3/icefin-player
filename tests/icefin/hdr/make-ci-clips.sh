#!/bin/sh
# make-ci-clips.sh — the HDR10 and HLG clips hdr_protocol.py --media needs where there are no lab servers (PLAN 5.10,
# CI). The same colour signalling, mastering display and light levels as make-media.sh's films (hdr_protocol checks
# those exact values), at 1280x720 and 15 s so a CI runner encodes them in seconds. Generated, nothing downloaded.
# Usage: tests/icefin/hdr/make-ci-clips.sh DEST      (needs ffmpeg with libx265)
set -eu
D="$1"
mkdir -p "$D"
SRC="testsrc2=size=1280x720:rate=24000/1001:duration=15"
pan="pan=5.1|c0=c0|c1=c0|c2=c0|c3=c0|c4=c0|c5=c0"
[ -s "$D/HDR10 HEVC AC3 (2026).mkv" ] || ffmpeg -nostdin -loglevel error -y -f lavfi -i "$SRC" -f lavfi -i "sine=frequency=330:duration=15" \
  -filter_complex "[0:v]setparams=color_primaries=bt2020:color_trc=smpte2084:colorspace=bt2020nc[v];[1:a]$pan[a]" -map "[v]" -map "[a]" \
  -c:v libx265 -preset ultrafast -pix_fmt yuv420p10le -color_primaries bt2020 -color_trc smpte2084 -colorspace bt2020nc \
  -x265-params "hdr10=1:repeat-headers=1:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:master-display=G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,1):max-cll=1000,400:log-level=error" \
  -c:a ac3 -b:a 448k "$D/HDR10 HEVC AC3 (2026).mkv"
[ -s "$D/HLG HEVC EAC3 (2026).mkv" ] || ffmpeg -nostdin -loglevel error -y -f lavfi -i "$SRC" -f lavfi -i "sine=frequency=550:duration=15" \
  -filter_complex "[0:v]setparams=color_primaries=bt2020:color_trc=arib-std-b67:colorspace=bt2020nc[v];[1:a]$pan[a]" -map "[v]" -map "[a]" \
  -c:v libx265 -preset ultrafast -pix_fmt yuv420p10le -color_primaries bt2020 -color_trc arib-std-b67 -colorspace bt2020nc \
  -x265-params "colorprim=bt2020:transfer=arib-std-b67:colormatrix=bt2020nc:log-level=error" -c:a eac3 -b:a 640k "$D/HLG HEVC EAC3 (2026).mkv"
ls "$D"
