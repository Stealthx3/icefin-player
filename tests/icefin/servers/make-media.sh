#!/usr/bin/env bash
# make-media.sh — generate small synthetic test media for the lab Jellyfin servers (PLAN 1.7). Run in a lab guest.
# Usage: tests/icefin/servers/make-media.sh [DEST]   (default ~/jf/media). Idempotent: existing files are kept.
# Everything is generated (test patterns, tones), so no third-party media is stored or downloaded.
set -euo pipefail
D="${1:-$HOME/jf/media}"
mkdir -p "$D/movies" "$D/shows/Icefin Test Show (2026)/Season 01" "$D/music/Icefin Lab/Test Tones (2026)"
ff() { local out="$1"; shift; [ -s "$out" ] || ffmpeg -nostdin -loglevel error -y "$@" "$out"; }
SRC_V="testsrc2=size=1920x1080:rate=24000/1001:duration=20"
SRC_4K="testsrc2=size=3840x2160:rate=24000/1001:duration=12"
TONE="sine=frequency=440:duration=20"
mv_dir() { mkdir -p "$D/movies/$1"; echo "$D/movies/$1/$1"; }

# SDR H.264 + AAC stereo, with an SRT subtitle
m=$(mv_dir "SDR H264 AAC (2026)")
ff "$m.mkv" -f lavfi -i "$SRC_V" -f lavfi -i "$TONE" -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -b:a 128k -shortest
[ -s "$m.en.srt" ] || printf '1\n00:00:01,000 --> 00:00:05,000\nIcefin subtitle line one\n\n2\n00:00:06,000 --> 00:00:10,000\nIcefin subtitle line two\n' > "$m.en.srt"
# HDR10: HEVC Main10, BT.2020 PQ with mastering display and content light metadata; AC-3 5.1
m=$(mv_dir "HDR10 HEVC AC3 (2026)")
ff "$m.mkv" -f lavfi -i "$SRC_4K" -f lavfi -i "sine=frequency=330:duration=12" -filter_complex "[1:a]pan=5.1|c0=c0|c1=c0|c2=c0|c3=c0|c4=c0|c5=c0[a]" -map 0:v -map "[a]" \
  -c:v libx265 -preset ultrafast -pix_fmt yuv420p10le -color_primaries bt2020 -color_trc smpte2084 -colorspace bt2020nc \
  -x265-params "hdr10=1:repeat-headers=1:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:master-display=G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,1):max-cll=1000,400:log-level=error" \
  -c:a ac3 -b:a 448k
# HLG: HEVC Main10, BT.2020 ARIB STD-B67; E-AC-3 5.1
m=$(mv_dir "HLG HEVC EAC3 (2026)")
ff "$m.mkv" -f lavfi -i "$SRC_4K" -f lavfi -i "sine=frequency=550:duration=12" -filter_complex "[1:a]pan=5.1|c0=c0|c1=c0|c2=c0|c3=c0|c4=c0|c5=c0[a]" -map 0:v -map "[a]" \
  -c:v libx265 -preset ultrafast -pix_fmt yuv420p10le -color_primaries bt2020 -color_trc arib-std-b67 -colorspace bt2020nc \
  -x265-params "colorprim=bt2020:transfer=arib-std-b67:colormatrix=bt2020nc:log-level=error" -c:a eac3 -b:a 640k
# Lossless/HD audio passthrough candidates: TrueHD and DTS (both experimental encoders in ffmpeg)
m=$(mv_dir "SDR H264 TrueHD DTS (2026)")
ff "$m.mkv" -f lavfi -i "$SRC_V" -f lavfi -i "$TONE" -map 0:v -map 1:a -map 1:a -c:v libx264 -preset veryfast -pix_fmt yuv420p \
  -c:a:0 truehd -strict -2 -c:a:1 dca -strict -2 -ar 48000 -shortest
# AV1 + Opus (decoder self-test coverage)
m=$(mv_dir "SDR AV1 Opus (2026)")
ff "$m.mkv" -f lavfi -i "testsrc2=size=1280x720:rate=30:duration=10" -f lavfi -i "sine=frequency=660:duration=10" -c:v libsvtav1 -preset 12 -pix_fmt yuv420p -c:a libopus -b:a 96k -shortest
# TV show: two episodes (MediaSegments / intro-skip need a repeated intro: same 8 s intro in both)
S="$D/shows/Icefin Test Show (2026)/Season 01"
for e in 1 2; do
  ff "$S/Icefin Test Show S01E0$e.mkv" -f lavfi -i "testsrc2=size=1280x720:rate=25:duration=8" -f lavfi -i "smptehdbars=size=1280x720:rate=25:duration=$((20+e*5))" \
    -f lavfi -i "sine=frequency=440:duration=8" -f lavfi -i "sine=frequency=$((500+e*50)):duration=$((20+e*5))" \
    -filter_complex "[0:v][2:a][1:v][3:a]concat=n=2:v=1:a=1[v][a]" -map "[v]" -map "[a]" -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac
done
# Music: FLAC and MP3 tracks with synced lyrics
A="$D/music/Icefin Lab/Test Tones (2026)"
ff "$A/01 - A440.flac" -f lavfi -i "sine=frequency=440:duration=15" -metadata title="A440" -metadata artist="Icefin Lab" -metadata album="Test Tones" -metadata track=1
ff "$A/02 - E660.mp3" -f lavfi -i "sine=frequency=660:duration=15" -c:a libmp3lame -b:a 192k -metadata title="E660" -metadata artist="Icefin Lab" -metadata album="Test Tones" -metadata track=2
[ -s "$A/01 - A440.lrc" ] || printf '[00:01.00]Icefin lyric line one\n[00:05.00]Icefin lyric line two\n[00:10.00]Icefin lyric line three\n' > "$A/01 - A440.lrc"
echo "make-media: $(find "$D" -type f | wc -l) files, $(du -sh "$D" | cut -f1) in $D"
