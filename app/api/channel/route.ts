import { NextRequest, NextResponse } from 'next/server';
import { ChannelError, fetchChannelVideos, normalizeChannelUrl } from '@/lib/youtube';

export const runtime = 'nodejs';
export const maxDuration = 180;

async function handle(urlInput: string | null) {
  const normalized = normalizeChannelUrl(urlInput);
  if (!normalized) {
    return NextResponse.json(
      {
        ok: false,
        code: 'INVALID_URL',
        message:
          'Sahi YouTube channel link daalein — jaise https://www.youtube.com/@Primateeconomics/videos, /channel/UCxxxx, /c/Name, /user/Name, ya plain @Handle.',
      },
      { status: 400 }
    );
  }
  try {
    const { channelTitle, total, videos } = await fetchChannelVideos(normalized, 200);
    if (!videos.length) {
      return NextResponse.json(
        { ok: false, code: 'NOT_FOUND', message: 'Is channel me koi public video nahi mili.' },
        { status: 404 }
      );
    }
    return NextResponse.json({
      ok: true,
      channel: { title: channelTitle, url: normalized },
      total,
      returned: videos.length,
      limit: 200,
      videos,
    });
  } catch (e) {
    if (e instanceof ChannelError) {
      return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status: e.status });
    }
    console.error('[channel] unexpected:', e);
    return NextResponse.json(
      { ok: false, code: 'FETCH_FAILED', message: 'Channel ki list nahi nikli. Dobara try karein.' },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handle(req.nextUrl.searchParams.get('url'));
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const url = (body as Record<string, unknown>).url;
  return handle(typeof url === 'string' ? url : null);
}
