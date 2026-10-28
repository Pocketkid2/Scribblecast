#!/usr/bin/env bash
# lineart-alpha.sh: turn a video into black outlines on a transparent background (VP9 WebM with alpha).
#
# Usage:
#   ./lineart-alpha.sh input.mp4 output.webm [options]
#
# Options (all optional, defaults below):
#   --low N         Edge sensitivity, lower = more edges (0-1)
#   --high N        Strong-edge cutoff (default: 3 x low)
#   --blur N        Pre-blur sigma, higher = smoother/simpler lines, 0 = off
#   --thickness N   Line thickness: number of dilation passes, 0 = thinnest
#   --width N       Scale to this width before processing, 0 = keep original size
#   --crf N         VP9 quality, lower = better/larger (typical 20-40)
#   --no-audio      Drop the audio track
#   -h, --help      Show this help

set -euo pipefail

# ---------------- Defaults: edit these ----------------
LOW=0.04
HIGH=""          # empty = 3 x LOW
BLUR=1.0
THICKNESS=2
WIDTH=1280
CRF=30
AUDIO=1
# -------------------------------------------------------

usage() {
  sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'
}

IN=""
OUT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --low)       LOW="$2"; shift 2 ;;
    --high)      HIGH="$2"; shift 2 ;;
    --blur)      BLUR="$2"; shift 2 ;;
    --thickness) THICKNESS="$2"; shift 2 ;;
    --width)     WIDTH="$2"; shift 2 ;;
    --crf)       CRF="$2"; shift 2 ;;
    --no-audio)  AUDIO=0; shift ;;
    -h|--help)   usage; exit 0 ;;
    -*)          echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
    *)
      if   [[ -z "$IN"  ]]; then IN="$1"
      elif [[ -z "$OUT" ]]; then OUT="$1"
      else echo "Too many arguments: $1" >&2; exit 1
      fi
      shift ;;
  esac
done

if [[ -z "$IN" || -z "$OUT" ]]; then
  usage >&2
  exit 1
fi

if [[ ! -f "$IN" ]]; then
  echo "Input file not found: $IN" >&2
  exit 1
fi

if [[ "$OUT" != *.webm ]]; then
  echo "Warning: output should end in .webm (VP9 alpha is stored in WebM)." >&2
fi

if ! [[ "$THICKNESS" =~ ^[0-9]+$ ]]; then
  echo "--thickness must be a whole number (0, 1, 2, ...)" >&2
  exit 1
fi

if ! [[ "$WIDTH" =~ ^[0-9]+$ ]]; then
  echo "--width must be a whole number (0 = keep original)" >&2
  exit 1
fi

if [[ -z "$HIGH" ]]; then
  HIGH=$(awk -v l="$LOW" 'BEGIN { printf "%.3f", 3 * l }')
fi

# Build the edge-detection chain.
chain=""
if (( WIDTH > 0 )); then
  chain+="scale=${WIDTH}:-2,"
fi
chain+="format=gray,"
if awk -v b="$BLUR" 'BEGIN { exit !(b > 0) }'; then
  chain+="gblur=sigma=${BLUR},"
fi
chain+="edgedetect=low=${LOW}:high=${HIGH}:mode=wires"
for (( i = 0; i < THICKNESS; i++ )); do
  chain+=",dilation"
done

# White edge map becomes the alpha channel over a solid black frame:
# lines are opaque black, everything else is transparent.
filter="[0:v]${chain},split[e1][e2];[e1]lut=y=0,format=yuv420p[blk];[blk][e2]alphamerge,format=yuva420p[out]"

audio_args=(-an)
if (( AUDIO )); then
  audio_args=(-map "0:a?" -c:a libopus)
fi

echo "low=${LOW} high=${HIGH} blur=${BLUR} thickness=${THICKNESS} width=${WIDTH} crf=${CRF} audio=${AUDIO}"

ffmpeg -hide_banner -loglevel error -stats \
  -i "$IN" \
  -filter_complex "$filter" \
  -map "[out]" "${audio_args[@]}" \
  -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf "$CRF" \
  "$OUT"

echo "Done: $OUT"
