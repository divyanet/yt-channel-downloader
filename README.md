# YT Channel Downloader

Paste any YouTube channel link → see a list of all its videos → download
each video, or select videos and download them one-by-one in bulk.

- Homepage: channel URL input. Accepts `@Handle`, `/@Handle/videos`,
  `/channel/UCxxxx`, `/channel/UCxxxx/videos`, `/c/Name`, `/user/Name`.
- `GET /api/channel?url=…` (also `POST` with `{"url": …}`) — lists videos
  via yt-dlp `--flat-playlist -J`. First 200 videos in v1.
- `GET /api/download?videoId=…&quality=720|1080|480|audio` — downloads
  that video with yt-dlp + ffmpeg merge and streams it back as
  `.mp4` / `.mp3`. Temp files in `/tmp/yt-dl-*/` are deleted after streaming.
- Bulk = frontend triggers the same `/api/download` URL for each selected
  video, one every ~1.5s. No ZIP in v1. "Copy yt-dlp list" copies the
  selected video URLs as a `.txt`-style fallback.

## Run locally

```bash
cd yt-channel-downloader
# yt-dlp binary (needed by both API routes):
curl -sSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o yt-dlp-bin && chmod +x yt-dlp-bin
npm install
npm run dev
# open http://localhost:3000
```

Production build / start:

```bash
npm run build
npm start
```

ffmpeg must be installed on the machine (`ffmpeg` on PATH, or
`/usr/bin/ffmpeg`). Without it, 1080p/720p video+audio merging fails.

## Deploy on Render (Web Service, Node)

Build command (script downloads yt-dlp, installs ffmpeg via apt with a
static-build fallback, then builds):

```bash
bash scripts/render-build.sh
```

Start command:

```bash
npm start
```

The app looks for ffmpeg at `./ffmpeg-bin` first (see `getFfmpegLocation`
in `lib/youtube.ts`), so HD video+audio merging works on Render even
though Render's free tier has no system ffmpeg. `render.yaml` in this repo
holds the same commands for Render Blueprints. YouTube may rate-limit /
bot-check datacentre IPs; the app now passes `--js-runtimes node` to
yt-dlp, which solves YouTube's JS challenges and unblocks downloads on
blocked IPs (verified 2026-11-10: real merged 720p on a blocked IP — see
TEST-REPORT.md). If YouTube tightens again, an optional second layer
exists: a logged-in YouTube session's cookies. Set it ONLY in the Render
dashboard (Environment → add `YT_COOKIES_B64` = base64 of a Netscape
cookies.txt exported from your own browser while logged into YouTube) —
never paste cookies in chat or commit them. Locally, a `./cookies.txt`
file in the project root works the same way (it is git-ignored).
`/api/download` retries once with the Android player client on a bot-check
(that client still serves a stream, but YouTube caps it at 360p — see
TEST-REPORT.md). On a residential IP, HD normally works first try.

## Limits (v1)

- First 200 videos of a channel only.
- Bulk download = sequential browser downloads, no ZIP.
- One video at a time per download request; long videos take a while
  (route timeout 300s).

## Fair use note

Sirf personal study / offline dekhne ke liye use karein. Dusre creator ke
videos ko re-upload na karein.
