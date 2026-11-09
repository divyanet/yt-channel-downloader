/**
 * YouTube channel listing + download helpers (fresh logic, yt-dlp based).
 * No Instagram code is reused here — only the yt-dlp-bin resolution
 * pattern (local ./yt-dlp-bin -> PATH yt-dlp -> python3 -m yt_dlp).
 */
import { execFile, execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export type ChannelVideo = {
  id: string;
  title: string;
  duration: number | null;
  views: number | null;
  uploadDate: string | null; // YYYYMMDD from yt-dlp, or null
  thumbnail: string;
  url: string;
};

export type Quality = '1080' | '720' | '480' | 'audio';

export const QUALITY_FORMATS: Record<Quality, string> = {
  '1080': 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best',
  '720': 'bestvideo[height<=720]+bestaudio/best[height<=720]/best',
  '480': 'bestvideo[height<=480]+bestaudio/best[height<=480]/best',
  audio: 'bestaudio/best',
};

/* ---------------- channel URL normalisation ---------------- */

/**
 * Accepts:
 *  https://www.youtube.com/@Handle , /@Handle/videos
 *  https://www.youtube.com/channel/UCxxxx , /channel/UCxxxx/videos
 *  https://www.youtube.com/c/Name , /c/Name/videos
 *  https://www.youtube.com/user/Name , /user/Name/videos
 *  plain @Handle
 * Normalises to <channel>/videos for listing.
 * Returns null for anything else (watch links, search, shorts, playlists…).
 */
export function normalizeChannelUrl(input: unknown): string | null {
  if (!input || typeof input !== 'string') return null;
  let raw = input.trim();
  if (!raw) return null;

  // Plain @Handle (no URL at all)
  if (/^@[A-Za-z0-9._-]{1,64}$/.test(raw)) {
    return `https://www.youtube.com/${raw}/videos`;
  }

  if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
  if (host !== 'youtube.com' && host !== 'youtu.be') return null;
  if (host === 'youtu.be') return null;

  const segs = u.pathname.split('/').filter(Boolean);
  if (segs.length === 0) return null;

  // /@Handle[/videos]
  if (segs[0].startsWith('@')) {
    if (!/^@[A-Za-z0-9._-]{1,64}$/.test(segs[0])) return null;
    if (segs.length > 1 && segs[1] !== 'videos') return null;
    return `https://www.youtube.com/${segs[0]}/videos`;
  }
  // /channel/UCxxxx[/videos]
  if (segs[0] === 'channel' && segs[1]) {
    if (!/^UC[A-Za-z0-9_-]{10,}$/.test(segs[1])) return null;
    if (segs.length > 2 && segs[2] !== 'videos') return null;
    return `https://www.youtube.com/channel/${segs[1]}/videos`;
  }
  // /c/Name[/videos] and /user/Name[/videos]
  if ((segs[0] === 'c' || segs[0] === 'user') && segs[1]) {
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(segs[1])) return null;
    if (segs.length > 2 && segs[2] !== 'videos') return null;
    return `https://www.youtube.com/${segs[0]}/${segs[1]}/videos`;
  }
  return null;
}

export function isValidVideoId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id);
}

export function sanitizeFilename(name: string): string {
  const clean = (name || 'video')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return clean || 'video';
}

/* ---------------- yt-dlp resolution ---------------- */

export type YtDlp = { cmd: string; args: string[] } | null;
let YTDLP: YtDlp = null;
let ytdlpResolved = false;

export function getYtDlp(): YtDlp {
  if (ytdlpResolved) return YTDLP;
  ytdlpResolved = true;
  const local = path.join(process.cwd(), 'yt-dlp-bin');
  try {
    fs.accessSync(local, fs.constants.X_OK);
    console.log('[yt-dl] yt-dlp: using ./yt-dlp-bin');
    YTDLP = { cmd: local, args: [] };
    return YTDLP;
  } catch {
    /* not present */
  }
  try {
    execFileSync('yt-dlp', ['--version'], { timeout: 15000, stdio: 'pipe' });
    console.log('[yt-dl] yt-dlp: using PATH binary');
    YTDLP = { cmd: 'yt-dlp', args: [] };
    return YTDLP;
  } catch {
    /* not on PATH */
  }
  try {
    execFileSync('python3', ['-m', 'yt_dlp', '--version'], { timeout: 15000, stdio: 'pipe' });
    console.log('[yt-dl] yt-dlp: using python3 -m yt_dlp');
    YTDLP = { cmd: 'python3', args: ['-m', 'yt_dlp'] };
    return YTDLP;
  } catch {
    /* unavailable */
  }
  console.warn('[yt-dl] yt-dlp not found');
  return null;
}

/** Try to fetch the standalone yt-dlp binary into ./yt-dlp-bin (used as
 *  a runtime fallback when the build step did not install it). */
export async function ensureYtDlp(): Promise<YtDlp> {
  const existing = getYtDlp();
  if (existing) return existing;
  const dest = path.join(process.cwd(), 'yt-dlp-bin');
  try {
    await new Promise<void>((resolve, reject) => {
      const p = execFile(
        'curl',
        ['-sSL', 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp', '-o', dest],
        { timeout: 120000 },
        (err) => (err ? reject(err) : resolve())
      );
      p.on('error', reject);
    });
    fs.chmodSync(dest, 0o755);
    fs.accessSync(dest, fs.constants.X_OK);
    // Reset the cached resolution so the fresh binary is picked up.
    ytdlpResolved = false;
    return getYtDlp();
  } catch (e) {
    console.warn('[yt-dl] yt-dlp download failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

export function getFfmpegLocation(): string | null {
  // Render/hosted: static binary downloaded by the build command (see README).
  // Env override first, then project-local binary, then system ffmpeg.
  const candidates = [
    process.env.FFMPEG_PATH || '',
    path.join(process.cwd(), 'ffmpeg-bin'),
    path.join(process.cwd(), 'ffmpeg'),
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return p;
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * FIX 2026-11-10 — YouTube bot-check on datacentre IPs.
 * yt-dlp can solve YouTube's JS challenges itself when it has a JS runtime:
 * `--js-runtimes node` makes the web client work again on blocked IPs
 * (verified locally: real merged 720p av1 1280x720 + opus, same 5,968,337
 * bytes as the earlier clean-IP test). Node is on PATH both locally and on
 * Render (Node runtime), so this is on by default. If node is missing the
 * flag is skipped and the old behaviour (web -> android fallback) applies.
 */
let jsRuntimeArgs: string[] | null = null;
export function getJsRuntimeArgs(): string[] {
  if (jsRuntimeArgs !== null) return jsRuntimeArgs;
  jsRuntimeArgs = [];
  try {
    execFileSync('node', ['--version'], { timeout: 10000, stdio: 'pipe' });
    jsRuntimeArgs = ['--js-runtimes', 'node'];
    console.log('[yt-dl] JS runtime: node (bot-check solver on)');
  } catch {
    console.log('[yt-dl] JS runtime: node not found, skipping --js-runtimes');
  }
  return jsRuntimeArgs;
}

/**
 * Optional extra layer if YouTube tightens again: a logged-in YouTube
 * session's cookies. Sources, in order:
 *  1. YT_COOKIES_B64 env var — base64 of a Netscape cookies.txt (set in the
 *     Render dashboard only, never paste cookies in chat).
 *  2. YT_COOKIES_FILE env var — path to a cookies.txt file.
 *  3. ./cookies.txt in the project root (local runs; git-ignored).
 * Returns [] when no cookies are configured — normal case.
 */
let cookiesArgs: string[] | null = null;
export function getCookiesArgs(): string[] {
  if (cookiesArgs !== null) return cookiesArgs;
  cookiesArgs = [];
  try {
    let file = '';
    if (process.env.YT_COOKIES_B64) {
      file = path.join(os.tmpdir(), 'yt-cookies.txt');
      fs.writeFileSync(file, Buffer.from(process.env.YT_COOKIES_B64, 'base64').toString('utf-8'), { mode: 0o600 });
    } else if (process.env.YT_COOKIES_FILE) {
      file = process.env.YT_COOKIES_FILE;
    } else {
      const local = path.join(process.cwd(), 'cookies.txt');
      if (fs.existsSync(local) && fs.statSync(local).size > 0) file = local;
    }
    if (file && fs.existsSync(file) && fs.statSync(file).size > 0) {
      cookiesArgs = ['--cookies', file];
      console.log('[yt-dl] cookies: using', file);
    }
  } catch (e) {
    console.warn('[yt-dl] cookies setup failed, continuing without:', e instanceof Error ? e.message : e);
  }
  return cookiesArgs;
}

/* ---------------- channel listing ---------------- */

export class ChannelError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function describeYtDlpFailure(stderr: string, stdout: string): ChannelError {
  const hay = `${stderr}\n${stdout}`.toLowerCase();
  if (hay.includes('sign in to confirm') || hay.includes('not a bot') || hay.includes('confirm you’re not a bot')) {
    return new ChannelError(
      'YOUTUBE_BLOCKED',
      502,
      'YouTube ne is request ko block kar diya (bot check). Kuch der baad dobara try karein, ya kisi aur channel se try karein.'
    );
  }
  if (hay.includes('channel does not exist') || hay.includes('no videos') || hay.includes('this channel does not exist')) {
    return new ChannelError('NOT_FOUND', 404, 'Channel nahi mila. Link check karein — ho sakta hai handle galat ho ya channel delete ho gaya ho.');
  }
  if (hay.includes('private') || hay.includes('unavailable')) {
    return new ChannelError('NOT_FOUND', 404, 'Channel ke videos available nahi hain (private / unavailable ho sakte hain).');
  }
  if (hay.includes('timed out') || hay.includes('timeout')) {
    return new ChannelError('TIMEOUT', 504, 'YouTube se jawab aane me der ho gayi. Dobara try karein.');
  }
  return new ChannelError('FETCH_FAILED', 502, 'Channel ki list nahi nikli. Link check karke dobara try karein.');
}

export async function fetchChannelVideos(
  channelUrl: string,
  limit = 200
): Promise<{ channelTitle: string; total: number; videos: ChannelVideo[] }> {
  const ytdlp = (await ensureYtDlp()) || getYtDlp();
  if (!ytdlp) {
    throw new ChannelError(
      'YTDLP_MISSING',
      500,
      'Server par yt-dlp install nahi hai. Admin ko yt-dlp-bin download karna hoga (README dekhein).'
    );
  }
  const args = [
    ...ytdlp.args,
    ...getJsRuntimeArgs(),
    ...getCookiesArgs(),
    '--flat-playlist',
    '-J',
    '--no-warnings',
    '--no-check-certificates',
    '--socket-timeout',
    '30',
    '--retries',
    '2',
    '--',
    channelUrl,
  ];
  const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(ytdlp.cmd, args, { timeout: 120000, maxBuffer: 20 * 1024 * 1024 }, (err, out, errOut) => {
      if (err) {
        const e = err as Error & { code?: unknown };
        reject(Object.assign(new Error(String(e.message || 'yt-dlp failed')), { stdout: String(out || ''), stderr: String(errOut || '') }));
      } else {
        resolve({ stdout: String(out || ''), stderr: String(errOut || '') });
      }
    });
  }).catch((e: Error & { stdout?: string; stderr?: string }) => {
    throw describeYtDlpFailure(e.stderr || '', e.stdout || '');
  });

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(stdout);
  } catch {
    throw describeYtDlpFailure(stderr, stdout);
  }
  const rawEntries = Array.isArray(data.entries) ? data.entries : [];
  // Flatten nested playlists (e.g. /videos sometimes nests), keep video entries only.
  const flat: Record<string, unknown>[] = [];
  const walk = (items: unknown[]) => {
    for (const it of items) {
      if (!it || typeof it !== 'object') continue;
      const e = it as Record<string, unknown>;
      if (Array.isArray(e.entries)) walk(e.entries as unknown[]);
      else if (typeof e.id === 'string') flat.push(e);
    }
  };
  walk(rawEntries);

  const videos: ChannelVideo[] = flat
    .filter((e) => typeof e.id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(e.id as string))
    .slice(0, limit)
    .map((e) => {
      const id = e.id as string;
      const uploadDate = typeof e.upload_date === 'string' ? e.upload_date : null;
      return {
        id,
        title: typeof e.title === 'string' && e.title ? e.title : `YouTube video ${id}`,
        duration: typeof e.duration === 'number' ? e.duration : null,
        views: typeof e.view_count === 'number' ? e.view_count : null,
        uploadDate,
        thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        url: `https://www.youtube.com/watch?v=${id}`,
      };
    });

  const channelTitle =
    typeof data.channel === 'string' && data.channel
      ? data.channel
      : typeof data.title === 'string' && data.title
        ? data.title
        : typeof data.uploader === 'string'
          ? data.uploader
          : 'YouTube channel';

  return { channelTitle, total: flat.length, videos };
}

/* ---------------- single-video download ---------------- */

export function downloadVideo(
  videoId: string,
  quality: Quality,
  outDir: string
): Promise<{ file: string; title: string }> {
  return new Promise(async (resolve, reject) => {
    const ytdlp = (await ensureYtDlp()) || getYtDlp();
    if (!ytdlp) return reject(new Error('yt-dlp server par install nahi hai.'));
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const isAudio = quality === 'audio';
    const baseArgs: string[] = [
      ...ytdlp.args,
      ...getJsRuntimeArgs(),
      ...getCookiesArgs(),
      '--no-playlist',
      '--no-warnings',
      '--no-check-certificates',
      '--socket-timeout',
      '30',
      '--retries',
      '3',
      '-f',
      QUALITY_FORMATS[quality],
    ];
    const ffmpegLoc = getFfmpegLocation();
    if (ffmpegLoc) baseArgs.push('--ffmpeg-location', ffmpegLoc);
    if (isAudio) {
      baseArgs.push('-x', '--audio-format', 'mp3');
    } else {
      baseArgs.push('--merge-output-format', 'mp4');
    }
    baseArgs.push('-o', path.join(outDir, '%(title)s.%(ext)s'), '--', url);

    const runOnce = (extraArgs: string[]): Promise<void> =>
      new Promise<void>((res, rej) => {
        execFile(
          ytdlp.cmd,
          [...extraArgs, ...baseArgs],
          { timeout: 280000, maxBuffer: 10 * 1024 * 1024 },
          (err, _stdout, stderr) => {
            if (err) {
              const e = new Error(String(stderr || err.message || 'yt-dlp failed').slice(0, 500));
              return rej(e);
            }
            res();
          }
        );
      });

    // Attempt 1: default (web) client + `--js-runtimes node`, which solves
    // YouTube's JS challenges — this is what unblocks datacentre IPs
    // (verified 2026-11-10: real merged 720p on a blocked IP).
    // Attempt 2 (only on YouTube bot-check): Android player client. On
    // blocked IPs this is the only client that still serves a stream, but
    // YouTube caps it at 360p progressive — so the file may come back at
    // 360p even when 720p/1080p was asked for. That is a YouTube-side
    // limit, not a bug in this tool.
    try {
      await runOnce([]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (/sign in to confirm|not a bot/i.test(msg)) {
        console.log('[yt-dl] web client bot-checked, retrying with android client (max 360p on blocked IPs)');
        try {
          await runOnce(['--extractor-args', 'youtube:player_client=android']);
        } catch {
          return reject(
            new Error(
              'YouTube ne download block kar diya (bot check). Kuch der baad dobara try karein, ya apne computer par chalakar dekhein — datacentre IPs par YouTube aksar block karta hai.'
            )
          );
        }
      } else {
        return reject(new Error(`Download fail ho gaya: ${msg || 'unknown error'}`));
      }
    }
    // Download succeeded (either attempt) — locate the file.
    {
      try {
        const files = fs
          .readdirSync(outDir)
          .filter((f) => !f.startsWith('.'))
          .map((f) => ({ f, size: fs.statSync(path.join(outDir, f)).size }))
          .filter((x) => x.size > 1024)
          .sort((a, b) => b.size - a.size);
        if (!files.length) return reject(new Error('Download hua lekin file nahi mili. Dobara try karein.'));
        const file = path.join(outDir, files[0].f);
        const title = files[0].f.replace(/\.(mp4|mp3|webm|m4a)$/i, '');
        resolve({ file, title });
      } catch (e) {
        reject(e instanceof Error ? e : new Error('Download ke baad file read nahi hui.'));
      }
    }
  });
}
