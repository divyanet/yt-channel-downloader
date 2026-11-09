'use client';

import { useMemo, useRef, useState } from 'react';

type Quality = '1080' | '720' | '480' | 'audio';
type Video = {
  id: string;
  title: string;
  duration: number | null;
  views: number | null;
  uploadDate: string | null;
  thumbnail: string;
  url: string;
};

const EXAMPLE = 'https://www.youtube.com/@Primateeconomics/videos';

function fmtDuration(sec: number | null): string {
  if (sec == null) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtViews(n: number | null): string {
  if (n == null) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K views`;
  return `${n} views`;
}

function fmtDate(d: string | null): string {
  if (!d || d.length !== 8) return '';
  return `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [channelTitle, setChannelTitle] = useState('');
  const [channelUrl, setChannelUrl] = useState('');
  const [videos, setVideos] = useState<Video[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [qualities, setQualities] = useState<Record<string, Quality>>({});
  const [filter, setFilter] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [bulkStatus, setBulkStatus] = useState('');
  const [copied, setCopied] = useState(false);
  const bulkStop = useRef(false);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return videos;
    return videos.filter((v) => v.title.toLowerCase().includes(q));
  }, [videos, filter]);

  const selectedList = useMemo(
    () => videos.filter((v) => selected.has(v.id)),
    [videos, selected]
  );

  async function fetchChannel(e?: React.FormEvent) {
    e?.preventDefault();
    const input = url.trim();
    if (!input) {
      setError('Pehle kisi channel ka link daalein.');
      return;
    }
    setLoading(true);
    setError('');
    setVideos([]);
    setSelected(new Set());
    setBulkStatus('');
    try {
      const res = await fetch(`/api/channel?url=${encodeURIComponent(input)}`);
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.message || 'Channel ki list nahi nikli.');
      setChannelTitle(data.channel.title);
      setChannelUrl(data.channel.url);
      setVideos(data.videos);
      setTotal(data.total);
      if (data.total > data.returned) {
        setBulkStatus(`Note: channel me ${data.total} videos hain, v1 me pehli ${data.returned} dikhai ja rahi hain.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Channel ki list nahi nikli.');
    } finally {
      setLoading(false);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllFiltered() {
    setSelected((prev) => new Set([...prev, ...filtered.map((v) => v.id)]));
  }

  function downloadUrl(v: Video): string {
    const q = qualities[v.id] || '720';
    return `/api/download?videoId=${v.id}&quality=${q}`;
  }

  function triggerDownload(href: string) {
    const a = document.createElement('a');
    a.href = href;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function downloadOne(v: Video) {
    setDownloading(v.id);
    triggerDownload(downloadUrl(v));
    // Server streams the file; clear the "downloading" label after a while.
    setTimeout(() => setDownloading((cur) => (cur === v.id ? null : cur)), 8000);
  }

  async function downloadSelected() {
    if (!selectedList.length) return;
    bulkStop.current = false;
    setBulkStatus('');
    for (let i = 0; i < selectedList.length; i++) {
      if (bulkStop.current) {
        setBulkStatus(`Bulk download roka gaya — ${i} / ${selectedList.length} trigger ho chuke.`);
        return;
      }
      const v = selectedList[i];
      setBulkStatus(`Download ${i + 1} / ${selectedList.length}: ${v.title.slice(0, 60)}…`);
      setDownloading(v.id);
      triggerDownload(downloadUrl(v));
      await sleep(1500);
    }
    setDownloading(null);
    setBulkStatus(`${selectedList.length} videos ke download trigger ho gaye (one-by-one). Browser me Downloads folder check karein.`);
  }

  async function copyList() {
    if (!selectedList.length) return;
    const text = selectedList.map((v) => v.url).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback: select-and-copy via a temp textarea.
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  return (
    <>
      <header className="site">
        <div className="wrap nav">
          <span className="logo">
            <span className="logo-mark">▶</span> YT Channel Downloader
          </span>
        </div>
      </header>

      <main className="wrap">
        <section className="hero">
          <h1>
            Kisi bhi YouTube channel ki <span>saari videos</span> list karein, download karein
          </h1>
          <p>
            Channel ka link daalein — saari videos ki list aa jayegi. Har video ke saamne Download button
            hai, ya select karke bulk me download karein.
          </p>
        </section>

        <form className="card input-card" onSubmit={fetchChannel}>
          <div className="input-row">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/@Primateeconomics/videos"
              aria-label="YouTube channel link"
            />
            <button className="btn" type="submit" disabled={loading}>
              {loading ? 'List nikal rahe hain…' : 'Videos Dekho'}
            </button>
          </div>
          <p className="example">
            Example:{' '}
            <button type="button" onClick={() => setUrl(EXAMPLE)}>
              {EXAMPLE}
            </button>{' '}
            — @Handle, /channel/UCxxxx, /c/Name aur /user/Name links bhi chalte hain.
          </p>
        </form>

        <div className="steps">
          <div className="card step">
            <b>1. Link daalein</b>
            <p>Kisi bhi public YouTube channel ka link paste karein.</p>
          </div>
          <div className="card step">
            <b>2. Videos chunein</b>
            <p>List me se videos tick karein, ya Select All se sab chunein.</p>
          </div>
          <div className="card step">
            <b>3. Download karein</b>
            <p>Har video alag se, ya selected sab ek saath — HD quality me.</p>
          </div>
        </div>

        {error && <div className="error">{error}</div>}
        {loading && <div className="loading">Channel ki videos nikal rahe hain… isme 10–30 second lag sakte hain.</div>}

        {videos.length > 0 && (
          <>
            <div className="card toolbar">
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Videos me search karein…"
                aria-label="Search videos"
              />
              <span className="count">
                {channelTitle} — {videos.length} videos
                {total > videos.length ? ` (total ${total})` : ''}
              </span>
              <button className="btn-ghost" type="button" onClick={selectAllFiltered}>
                Select All
              </button>
              <button className="btn-ghost" type="button" onClick={() => setSelected(new Set())}>
                Clear
              </button>
              <button className="btn-ghost" type="button" onClick={copyList} disabled={!selectedList.length}>
                {copied ? 'Copied ✓' : 'Copy yt-dlp list'}
              </button>
              <button className="btn btn-sm" type="button" onClick={downloadSelected} disabled={!selectedList.length || !!downloading && bulkStatus.startsWith('Download')}>
                Selected Download Karo ({selectedList.length})
              </button>
              {bulkStatus.startsWith('Download ') && (
                <button className="btn-ghost" type="button" onClick={() => { bulkStop.current = true; }}>
                  Roko
                </button>
              )}
            </div>

            {bulkStatus && <p style={{ marginTop: 10, color: '#5b6478', fontSize: '0.92rem' }}>{bulkStatus}</p>}

            <div className="list">
              {filtered.length === 0 && <div className="card empty">Is search se koi video nahi mili.</div>}
              {filtered.map((v) => {
                const q = qualities[v.id] || '720';
                const isSel = selected.has(v.id);
                return (
                  <article key={v.id} className={`card video-row${isSel ? ' selected' : ''}`}>
                    <input type="checkbox" checked={isSel} onChange={() => toggle(v.id)} aria-label={`Select ${v.title}`} />
                    <div className="thumb">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={v.thumbnail} alt="" loading="lazy" />
                      {v.duration != null && <span className="dur">{fmtDuration(v.duration)}</span>}
                    </div>
                    <div className="vinfo">
                      <h3>
                        <a href={v.url} target="_blank" rel="noopener noreferrer">
                          {v.title}
                        </a>
                      </h3>
                      <p className="meta">
                        {[fmtViews(v.views), fmtDate(v.uploadDate)].filter(Boolean).join(' • ')}
                      </p>
                      <div className="vactions">
                        <select
                          value={q}
                          onChange={(e) => setQualities((prev) => ({ ...prev, [v.id]: e.target.value as Quality }))}
                          aria-label="Quality"
                        >
                          <option value="720">720p HD</option>
                          <option value="1080">1080p HD</option>
                          <option value="480">480p</option>
                          <option value="audio">Audio MP3</option>
                        </select>
                        <button className="btn btn-sm" type="button" onClick={() => downloadOne(v)} disabled={downloading === v.id}>
                          {downloading === v.id ? 'Downloading…' : 'Download'}
                        </button>
                        {downloading === v.id && <span className="downloading">Browser download shuru ho gaya hoga — Downloads folder dekhein.</span>}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            <p style={{ color: '#8a93a8', fontSize: '0.85rem', marginBottom: 30 }}>
              Source: <a href={channelUrl} target="_blank" rel="noopener noreferrer">{channelUrl}</a>
            </p>
          </>
        )}
      </main>

      <footer className="site">
        <div className="wrap">
          <p>
            Sirf personal study / offline dekhne ke liye use karein. Dusre creator ke videos ko re-upload
            na karein.
          </p>
        </div>
      </footer>
    </>
  );
}
