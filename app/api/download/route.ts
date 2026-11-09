import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'stream';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { downloadVideo, isValidVideoId, sanitizeFilename, type Quality } from '@/lib/youtube';

export const runtime = 'nodejs';
export const maxDuration = 300;

const QUALITIES: Quality[] = ['1080', '720', '480', 'audio'];

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get('videoId') || '';
  const q = req.nextUrl.searchParams.get('quality') || '720';
  const quality: Quality = (QUALITIES as string[]).includes(q) ? (q as Quality) : '720';

  if (!isValidVideoId(videoId)) {
    return NextResponse.json(
      { ok: false, code: 'INVALID_ID', message: 'Sahi video id nahi mili.' },
      { status: 400 }
    );
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-dl-'));
  const cleanup = () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };

  let result: { file: string; title: string };
  try {
    result = await downloadVideo(videoId, quality, dir);
  } catch (e) {
    cleanup();
    const message = e instanceof Error ? e.message : 'Download fail ho gaya.';
    return NextResponse.json({ ok: false, code: 'DOWNLOAD_FAILED', message }, { status: 502 });
  }

  const ext = quality === 'audio' ? 'mp3' : 'mp4';
  const filename = `${sanitizeFilename(result.title)}.${ext}`;
  const stat = fs.statSync(result.file);

  // Stream the file out, then delete the temp dir once the stream closes.
  const nodeStream = fs.createReadStream(result.file);
  nodeStream.on('close', cleanup);
  nodeStream.on('error', cleanup);
  const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      'Content-Type': quality === 'audio' ? 'audio/mpeg' : 'video/mp4',
      'Content-Length': String(stat.size),
      'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store',
    },
  });
}
