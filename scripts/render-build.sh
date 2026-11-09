#!/bin/bash
# Render build for yt-channel-downloader.
# 1) yt-dlp binary  2) ffmpeg (best-effort: apt first, static build fallback)
# 3) npm install + build. ffmpeg is best-effort on purpose: if it fails,
# the site still goes live (listing + 360p single-file downloads work;
# HD merge needs ffmpeg, see lib/youtube.ts getFfmpegLocation).
set -e
cd "$(dirname "$0")/.."

echo "--- yt-dlp ---"
curl -sSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o yt-dlp-bin
chmod +x yt-dlp-bin

echo "--- ffmpeg (best-effort) ---"
if apt-get update -qq && apt-get install -y -qq ffmpeg; then
  echo "ffmpeg installed via apt: $(command -v ffmpeg)"
elif curl -sSL --retry 3 https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -o ffmpeg.tar.xz \
  && tar -xf ffmpeg.tar.xz \
  && cp ffmpeg-*-static/ffmpeg ./ffmpeg-bin \
  && chmod +x ./ffmpeg-bin; then
  rm -rf ffmpeg.tar.xz ffmpeg-*-static
  echo "ffmpeg installed as ./ffmpeg-bin"
else
  echo "WARNING: ffmpeg install failed, continuing without it (HD merge will fail, listing still works)"
fi

echo "--- npm install + build ---"
npm install
npm run build
