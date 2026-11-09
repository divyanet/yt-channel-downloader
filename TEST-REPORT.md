# TEST-REPORT — yt-channel-downloader v1

Tested: 2026-11-10 (IST), on this VM. yt-dlp 2026.10.26 (`./yt-dlp-bin`), ffmpeg 8.1.2 (`/usr/bin/ffmpeg`).

## Build

- `npm install` — PASS (30 packages).
- `npm run build` — PASS. Routes: `/`, `/api/channel`, `/api/download`, `/api/health`.
  (One non-fatal Turbopack warning about filesystem tracing in `lib/youtube.ts` — same pattern as InstaSave, build still succeeds.)

## /api/channel — https://www.youtube.com/@Primateeconomics/videos

- PASS — HTTP 200, channel "Primate Economics", **total 17, returned 17**.
- First 3 titles:
  1. "401k Explained with Bananas" (Fd2jzWdcOHY, 605s, 119K views)
  2. "Options Trading Explained with Bananas (No AI)" (HjlVexL2Lxk, 615s, 140K views)
  3. "The Biggest Ponzi Scheme Explained with Bananas" (dB10EUmjHyc, 663s, 136K views)
- Plain `@Primateeconomics` (no /videos) — PASS, normalised to `/videos`, same 17 videos.
- Invalid URL (a /watch link) — PASS, HTTP 400 `INVALID_URL` with Hinglish message.
- Note: `uploadDate` came back `null` for these entries — yt-dlp `--flat-playlist`
  does not always include it for this channel. UI handles null (date hidden).

## /api/download — 720p

- Video: "Inflation Explained with Bananas" (MAvHgmewRDM, 151s).
- PASS — HTTP 200, **5,968,337 bytes (~5.7 MB)**, 13.2s, filename
  `Inflation Explained with Bananas.mp4`.
- ffprobe: video **av1 1280x720** + audio **opus**, duration 150.2s — real merged 720p HD.
- Temp dir `/tmp/yt-dl-*/` deleted after streaming — PASS (none left).

## /api/download — Audio MP3

- Same video, `quality=audio` — PASS, HTTP 200, **1,779,525 bytes (~1.7 MB)**,
  `Inflation Explained with Bananas.mp3`, ffprobe: mp3 audio only, 150.2s.

## Homepage

- `GET /` — HTTP 200, renders input + example link + "Videos Dekho" button.
  (List toolbar buttons render after a channel loads — client-side, as designed.)

## YouTube bot-check — important, intermittent on this VM

- The FIRST download attempt (default web client) FAILED with yt-dlp error:
  `ERROR: [youtube] MAvHgmewRDM: Sign in to confirm you're not a bot.`
  That is YouTube blocking this datacentre IP, not an app bug.
- Probed clients on this IP: `android` works but caps at 360p (format 18);
  `ios`/`web`/`mweb`/`web_safari` return storyboards only; `tv`/`android_music`/
  `tv_embedded`/`mediaconnect` are bot-checked.
- Fix shipped: `/api/download` retries once with `--extractor-args
  youtube:player_client=android` on bot-check (file may then be 360p).
- A few minutes later the web client worked again and the 720p test above
  passed at full quality — so the block is intermittent here. On HRK's own
  laptop / a residential IP, HD should normally work first try. On Render
  (datacentre IP) the same intermittency may appear; the android fallback
  keeps downloads working, at 360p worst case.

## FIX 2026-11-10 — YouTube bot-check on Render (live download failed)

- Live (Render, Singapore datacentre IP): `/api/download` 720p failed 3x with
  `DOWNLOAD_FAILED` bot-check — web client AND Android fallback both blocked.
- Probing: Piped instances all down (526/502/000), Invidious instances all
  down/blocked (403/502/000) — no mirror fallback is reliable right now.
- Fix that WORKED: `--js-runtimes node` — yt-dlp solves YouTube's JS
  challenges with the Node runtime (`[youtube] [jsc:node] Solving JS
  challenges using node`). Implemented in `lib/youtube.ts`
  (`getJsRuntimeArgs()` — auto-detected, skipped if node is missing;
  applied to both channel listing and downloads) + optional cookies
  support (`getCookiesArgs()`: `YT_COOKIES_B64` env / `YT_COOKIES_FILE` /
  `./cookies.txt`, git-ignored) as a second layer.
- Local app test AFTER fix (through the real server, port 3100):
  `/api/download?videoId=MAvHgmewRDM&quality=720` — HTTP 200,
  **5,968,337 bytes**, ffprobe **av1 1280x720 + opus** — real merged 720p,
  byte-identical to the earlier clean-IP test. Channel list still 17/17.
  Log: `[yt-dl] JS runtime: node (bot-check solver on)`.
- Node is on PATH on Render (Node runtime), so the fix should work live too
  — live re-verification pending after redeploy.

## Not tested in v1

- 1080p and 480p downloads (same code path as 720p, only format string differs).
- Bulk button in a real browser (logic is plain sequential anchor clicks, 1.5s apart).
- Very long videos (route timeout 300s).
