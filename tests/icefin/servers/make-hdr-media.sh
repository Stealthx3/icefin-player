#!/usr/bin/env bash
# make-hdr-media.sh — synthetic HDR10+ and Dolby Vision clips for the lab servers (PLAN 6.6, docs/dev/HARDWARE-SIMULATION.md
# option M). Run in a lab guest after make-media.sh. Idempotent: existing files are kept.
# Usage: tests/icefin/servers/make-hdr-media.sh [DEST]   (default ~/jf/media)
#
# Needs ffmpeg (libx265), mkvmerge (mkvtoolnix) and quietvoid's open-source hdr10plus_tool and dovi_tool
# (`cargo install --locked hdr10plus_tool dovi_tool`; Debian's x265 drops dhdr10-info, so HDR10+ is injected after
# encoding). Everything is generated: test patterns and tones, metadata written here. No third-party media.
# The pictures are not graded: they exist so Jellyfin classifies them (VideoRangeType) and Icefin routes them; a real
# Dolby Vision grade's look is a beta row (docs/BETA-CHECKLIST.md).
set -euo pipefail
D="${1:-$HOME/jf/media}"
PATH="$HOME/.cargo/bin:$PATH"; export LC_ALL=C.UTF-8  # mkvmerge needs a UTF-8 locale
for t in ffmpeg mkvmerge hdr10plus_tool dovi_tool; do command -v "$t" >/dev/null || { echo "make-hdr-media: $t missing" >&2; exit 1; }; done
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
SECS=12; FPS=24000/1001; FRAMES=288   # 12 s at 23.976
SRC_4K="testsrc2=size=3840x2160:rate=$FPS:duration=$SECS"
X265_HDR10="hdr10=1:repeat-headers=1:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:master-display=G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,1):max-cll=1000,400:log-level=error"
mv_dir() { mkdir -p "$D/movies/$1"; echo "$D/movies/$1/$1"; }

# One 10-bit HEVC elementary stream (HDR10-signalled) and one AC-3 5.1 track, shared by every clip.
ffmpeg -nostdin -loglevel error -y -f lavfi -i "$SRC_4K" -c:v libx265 -preset ultrafast -pix_fmt yuv420p10le \
  -color_primaries bt2020 -color_trc smpte2084 -colorspace bt2020nc -x265-params "$X265_HDR10" -f hevc "$W/bl.hevc"
ffmpeg -nostdin -loglevel error -y -f lavfi -i "sine=frequency=360:duration=$SECS" \
  -af "pan=5.1|c0=c0|c1=c0|c2=c0|c3=c0|c4=c0|c5=c0" -c:a ac3 -b:a 448k "$W/a.ac3"
# The colour block written out (PQ, BT.2020): a raw HEVC stream gives mkvmerge none, and ffprobe 8 (Jellyfin 12) trusts
# the container over the stream (make-media.sh has the same note).
mux() { [ -s "$1.mkv" ] || mkvmerge -q -o "$1.mkv" --default-duration "0:${FPS}p" --colour-matrix-coefficients 0:9 \
  --colour-transfer-characteristics 0:16 --colour-primaries 0:9 --colour-range 0:1 "$2" "$W/a.ac3"; }

# HDR10+: one scene of SMPTE 2094-40 dynamic metadata over every frame.
m=$(mv_dir "HDR10Plus HEVC AC3 (2026)")
if [ ! -s "$m.mkv" ]; then
  python3 - "$W/hdr10plus.json" "$FRAMES" <<'PY'
import json, sys
n = int(sys.argv[2])
scene = {"BezierCurveData": {"Anchors": [256, 512, 768, 1023, 1023, 1023, 1023, 1023, 1023], "KneePointX": 0, "KneePointY": 0},
         "LuminanceParameters": {"AverageRGB": 1000, "LuminanceDistributions": {"DistributionIndex": [1, 5, 10, 25, 50, 75, 90, 95, 99],
                                 "DistributionValues": [0, 100, 200, 300, 400, 500, 600, 700, 800]}, "MaxScl": [4000, 4000, 4000]},
         "NumberOfWindows": 1, "TargetedSystemDisplayMaximumLuminance": 400, "SceneFrameIndex": 0, "SceneId": 0, "SequenceFrameIndex": 0}
frames = [dict(scene, SceneFrameIndex=i, SequenceFrameIndex=i) for i in range(n)]
json.dump({"JSONInfo": {"HDR10plusProfile": "B", "Version": "1.0"}, "SceneInfo": frames,
           "SceneInfoSummary": {"SceneFirstFrameIndex": [0], "SceneFrameNumbers": [n]}, "ToolInfo": {"Tool": "icefin-lab", "Version": "1"}},
          open(sys.argv[1], "w"))
PY
  hdr10plus_tool inject -i "$W/bl.hevc" -j "$W/hdr10plus.json" -o "$W/hdr10plus.hevc" >/dev/null
  mux "$m" "$W/hdr10plus.hevc"
fi

# Dolby Vision: generated RPUs (static metadata from the same mastering values) injected into the base layer.
dv() {  # dv NAME PROFILE
  local m; m=$(mv_dir "$1")
  [ -s "$m.mkv" ] && return 0
  cat > "$W/dv-$2.json" <<EOF
{"cm_version": "V40", "profile": "$2", "length": $FRAMES,
 "level6": {"max_display_mastering_luminance": 1000, "min_display_mastering_luminance": 1,
            "max_content_light_level": 1000, "max_frame_average_light_level": 400}}
EOF
  dovi_tool generate -j "$W/dv-$2.json" -o "$W/rpu-$2.bin" >/dev/null
  dovi_tool inject-rpu -i "$W/bl.hevc" --rpu-in "$W/rpu-$2.bin" -o "$W/dv-$2.hevc" >/dev/null
  mux "$m" "$W/dv-$2.hevc"
}
dv "DV P5 HEVC AC3 (2026)" 5          # Jellyfin: DOVI
dv "DV P8.1 HEVC AC3 (2026)" 8.1      # Jellyfin: DOVIWithHDR10
echo "make-hdr-media: done in $D/movies"
