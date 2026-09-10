#!/usr/bin/env bash
# Rebuild the short cuts from the local recording masters. Run from the repo root.
set -euo pipefail
ffmpeg -v error -y -i Demo/recordings/app-showcase-source.mov \
  -filter_complex '[0:v]fps=24,split=3[v0][v1][v2];[v0]trim=start=3:end=7,setpts=PTS-STARTPTS[a];[v1]trim=start=8:end=9.5,setpts=PTS-STARTPTS[b];[v2]trim=start=20:end=26,setpts=PTS-STARTPTS[c];[a][b][c]concat=n=3:v=1:a=0,setpts=0.6*PTS,fps=12,scale=468:-2:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=192[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3' \
  -loop 0 demo.gif
ffmpeg -v error -y -i Demo/recordings/hub-showcase-source.mp4 \
  -filter_complex '[0:v]trim=start=2:end=3,setpts=PTS-STARTPTS[a];[0:v]trim=start=10:end=13,setpts=PTS-STARTPTS[b];[0:v]trim=start=16.5:end=20.5,setpts=PTS-STARTPTS[c];[0:v]trim=start=23:end=25,setpts=PTS-STARTPTS[d];[a][b][c][d]concat=n=4:v=1:a=0,setpts=0.8*PTS,fps=10,scale=1120:-2:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=160[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3' \
  -loop 0 docs/media/hub.gif
