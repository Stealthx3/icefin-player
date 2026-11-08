#!/usr/bin/env bash
# htpc-kit.sh — package the HTPC setup kit (tests/icefin/htpc/kit) into build-htpc/icefin-htpc-kit.zip.
# Adds this workstation's public SSH key (comment replaced, so no account name or email travels with it)
# and fills the README's workstation details. Usage: scripts/icefin/htpc-kit.sh [public-key-file]
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PUB="${1:-$HOME/.ssh/id_ed25519.pub}"
[ -s "$PUB" ] || { echo "htpc-kit: no public key at $PUB" >&2; exit 1; }
[[ "$PUB" == *.pub ]] || { echo "htpc-kit: $PUB is not a .pub file; refusing (never ship a private key)" >&2; exit 1; }
OUT="$ROOT/build-htpc"; STAGE="$OUT/icefin-htpc-kit"
rm -rf "$STAGE"; mkdir -p "$STAGE"
cp "$ROOT/tests/icefin/htpc/kit/icefin-htpc-setup.sh" "$ROOT/tests/icefin/htpc/probe.py" "$STAGE/"
chmod 755 "$STAGE/icefin-htpc-setup.sh" "$STAGE/probe.py"
awk '{print $1, $2, "icefin-lab-workstation"}' "$PUB" > "$STAGE/workstation.pub"
FP="$(ssh-keygen -lf "$STAGE/workstation.pub" | awk '{print $2}')"
WIP="$(ip -4 -o route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p')"
sed -e "s|@WORKSTATION@|$(hostname)|g" -e "s|@WORKSTATION_IP@|${WIP:-unknown address}|g" -e "s|@FINGERPRINT@|$FP|g" \
    -e "s|@DATE@|$(date +%F)|g" -e "s|@COMMIT@|$(git -C "$ROOT" rev-parse --short HEAD)|g" \
    "$ROOT/tests/icefin/htpc/kit/README.md" > "$STAGE/README.md"
grep -q '@[A-Z_]*@' "$STAGE/README.md" && { echo "htpc-kit: unfilled placeholder in README" >&2; exit 1; }
rm -f "$OUT/icefin-htpc-kit.zip"
(cd "$OUT" && zip -qr icefin-htpc-kit.zip icefin-htpc-kit)
unzip -l "$OUT/icefin-htpc-kit.zip"
echo "htpc-kit: $OUT/icefin-htpc-kit.zip (key $FP)"
