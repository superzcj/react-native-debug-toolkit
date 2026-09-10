#!/usr/bin/env bash
# Rebuild from local recording masters. Run from the repository root.
set -euo pipefail
# App: request + state + custom tab, followed by analytics, environments, text and sync.
ffmpeg -v error -y -i Demo/recordings/app-showcase-source.mov -i Demo/recordings/app-features-extension.mp4 \
  -filter_complex '[0:v]fps=24,split=5[v0][v1][v2][v3][v4];[v0]trim=start=3:end=7,setpts=0.5*(PTS-STARTPTS)[a];[v1]trim=start=8:end=9.5,setpts=0.4*(PTS-STARTPTS)[b];[v2]trim=start=20:end=26,setpts=0.4*(PTS-STARTPTS)[c];[v3]trim=start=34:end=38,setpts=0.625*(PTS-STARTPTS)[d];[v4]trim=start=39.4,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=1.8[e];[a][b][c][d][e]concat=n=5:v=1:a=0,fps=12,scale=468:1018,setsar=1[core];[1:v]fps=12,setsar=1[extra];[core][extra]concat=n=2:v=1:a=0,split[s0][s1];[s0]palettegen=max_colors=192[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3' \
  -loop 0 demo.gif
# Web: fresh capture of log categories, live Staging request, analytics, state and phone text.
# Remove the unused screenshot canvas around the browser's rendered viewport.
ffmpeg -v error -y -i Demo/recordings/hub-expanded-source.mp4 \
  -vf 'crop=1066:600:0:0,fps=10,scale=1120:630:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=160[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3' \
  -loop 0 docs/media/hub.gif
