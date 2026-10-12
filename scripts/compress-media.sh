#!/usr/bin/env bash
# Turn raw media into web-ready files for this site.
#
#   Videos  -> assets/video/<project>/<name>.mp4   (H.264 + AAC, faststart, max 1280px wide)
#              assets/posters/<project>/<name>.jpg (poster frame)
#   GIFs    -> same as videos, without audio (a GIF becomes a much smaller MP4)
#   Images  -> assets/img/<project>/<name>.jpg     (max 1600px wide)
#
# Usage:
#   scripts/compress-media.sh [options] <input-file> <project-folder> [output-name]
#
# Options:
#   --loop            Short muted loop for cards/galleries: 640px wide, no audio, max 8 s.
#   --start <sec>     Start time in the source (default 0).
#   --duration <sec>  Length to keep (default: whole clip, or 8 s with --loop).
#   --poster <sec>    Time of the poster frame, relative to the output (default 1).
#   --crf <n>         Quality, lower is better and bigger (default 23, or 28 with --loop).
#   --webm            Also write a VP9 WebM next to the MP4.
#   --mute            Drop the audio track.
#
# Examples:
#   scripts/compress-media.sh raw/robot.mov adversarial-patches robot-demo
#   scripts/compress-media.sh --loop --start 6 --duration 8 raw/robot.mov adversarial-patches card-loop
#   scripts/compress-media.sh raw/demo.gif person-hiding-patches defences
#   scripts/compress-media.sh raw/IMG_1234.jpeg person-hiding-patches stand-photo
#
# Requires ffmpeg (macOS: brew install ffmpeg).

set -euo pipefail

LOOP=0; START=0; DURATION=""; POSTER_AT=1; CRF=""; WEBM=0; MUTE=0
ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --loop) LOOP=1; shift ;;
    --start) START="$2"; shift 2 ;;
    --duration) DURATION="$2"; shift 2 ;;
    --poster) POSTER_AT="$2"; shift 2 ;;
    --crf) CRF="$2"; shift 2 ;;
    --webm) WEBM=1; shift ;;
    --mute) MUTE=1; shift ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) ARGS+=("$1"); shift ;;
  esac
done

if [[ ${#ARGS[@]} -lt 2 ]]; then
  echo "Usage: $0 [options] <input-file> <project-folder> [output-name]   (see --help)" >&2
  exit 1
fi

IN="${ARGS[0]}"
PROJECT="${ARGS[1]}"
BASENAME="$(basename "$IN")"
NAME="${ARGS[2]:-${BASENAME%.*}}"
# Lowercase, spaces to dashes, so file names are URL-safe.
NAME="$(echo "$NAME" | tr '[:upper:]' '[:lower:]' | tr ' _' '--')"
EXT="$(echo "${BASENAME##*.}" | tr '[:upper:]' '[:lower:]')"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VID_DIR="$ROOT/assets/video/$PROJECT"
POS_DIR="$ROOT/assets/posters/$PROJECT"
IMG_DIR="$ROOT/assets/img/$PROJECT"

[[ -f "$IN" ]] || { echo "Input not found: $IN" >&2; exit 1; }
command -v ffmpeg >/dev/null || { echo "ffmpeg not found. Install it with: brew install ffmpeg" >&2; exit 1; }

size_mb() { echo "scale=1; $(wc -c < "$1") / 1048576" | bc; }

warn_size() {
  local f="$1" bytes
  bytes=$(wc -c < "$f")
  echo "  $(basename "$f"): $(size_mb "$f") MB"
  if (( bytes > 10 * 1024 * 1024 )); then
    echo "  WARNING: over 10 MB. Trim it (--start/--duration), raise --crf, or put it on YouTube as unlisted." >&2
  fi
  if (( bytes > 95 * 1024 * 1024 )); then
    echo "  ERROR: GitHub rejects files over 100 MB. Do not commit this file." >&2
  fi
}

# ---------- Images ----------
case "$EXT" in
  jpg|jpeg|png|webp|heic|tif|tiff)
    mkdir -p "$IMG_DIR"
    OUT="$IMG_DIR/$NAME.jpg"
    if [[ "$EXT" == "heic" ]] && command -v sips >/dev/null; then
      sips -s format jpeg -Z 1600 "$IN" --out "$OUT" >/dev/null
    else
      ffmpeg -hide_banner -loglevel error -y -i "$IN" \
        -vf "scale='min(1600,iw)':-2" -q:v 3 "$OUT"
    fi
    echo "Image written:"; warn_size "$OUT"
    exit 0
    ;;
esac

# ---------- Videos and GIFs ----------
mkdir -p "$VID_DIR" "$POS_DIR"
OUT="$VID_DIR/$NAME.mp4"
POSTER="$POS_DIR/$NAME.jpg"

WIDTH=1280
[[ -z "$CRF" ]] && CRF=23
AUDIO=(-c:a aac -b:a 128k -ac 2)

if [[ $LOOP -eq 1 ]]; then
  WIDTH=640
  [[ "$CRF" == "23" ]] && CRF=28
  [[ -z "$DURATION" ]] && DURATION=8
  MUTE=1
fi
[[ "$EXT" == "gif" ]] && MUTE=1
[[ $MUTE -eq 1 ]] && AUDIO=(-an)

TRIM=(-ss "$START")
[[ -n "$DURATION" ]] && TRIM+=(-t "$DURATION")

# Only downscale, keep the height even, and use yuv420p so every browser can play it.
VF="scale='min($WIDTH,iw)':-2:flags=lanczos,format=yuv420p"
[[ "$EXT" == "gif" ]] && VF="fps=25,$VF"

echo "Encoding $IN -> $OUT"
ffmpeg -hide_banner -loglevel error -stats -y "${TRIM[@]}" -i "$IN" \
  -vf "$VF" \
  -c:v libx264 -preset slow -crf "$CRF" -profile:v high -level 4.0 \
  -movflags +faststart \
  "${AUDIO[@]}" \
  "$OUT"

if [[ $WEBM -eq 1 ]]; then
  WOUT="$VID_DIR/$NAME.webm"
  echo "Encoding WebM -> $WOUT"
  WAUDIO=(-c:a libopus -b:a 96k)
  [[ $MUTE -eq 1 ]] && WAUDIO=(-an)
  ffmpeg -hide_banner -loglevel error -stats -y "${TRIM[@]}" -i "$IN" \
    -vf "$VF" -c:v libvpx-vp9 -b:v 0 -crf $((CRF + 10)) -row-mt 1 \
    "${WAUDIO[@]}" "$WOUT"
fi

# Poster frame from the encoded clip, same size as the video.
ffmpeg -hide_banner -loglevel error -y -ss "$POSTER_AT" -i "$OUT" -frames:v 1 -q:v 3 "$POSTER" \
  || ffmpeg -hide_banner -loglevel error -y -i "$OUT" -frames:v 1 -q:v 3 "$POSTER"

DIMS=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=/ "$OUT" 2>/dev/null || echo "?")

echo "Done:"
warn_size "$OUT"
[[ $WEBM -eq 1 ]] && warn_size "$VID_DIR/$NAME.webm"
echo "  poster: ${POSTER#$ROOT/}"
echo "  size:   $DIMS  (use style=\"--ar: $DIMS\" on the block)"
