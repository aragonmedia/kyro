/**
 * Every video creators have sent, as a library.
 *
 * Portrait tiles because the footage is portrait. Filterable by campaign and
 * by where the brand stands on each video, with the ones still needing a
 * decision one click away.
 *
 * Videos live in a private bucket. Previews and downloads use short-lived
 * signed links rather than public URLs, so a video a creator sent one brand
 * cannot be shared onward by guessing its address.
 *
 * Demo submissions carry a placeholder path with no file behind it. The
 * library says so plainly instead of offering a download that fails.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, Download, FileVideo, RefreshCw, X } from 'lucide-react';
import { listSubmissionsForBrand, type CampaignSubmission } from '../lib/db';
import { signedVideoUrl } from '../lib/storage';
import { CoverImage, VideoTile } from './MediaTile';

type UsageFilter = 'all' | 'awaiting' | 'in_use' | 'not_used';

const USAGE: Record<string, { label: string; cls: string }> = {
  in_use: { label: 'In use', cls: 'border-emerald-400/30 bg-emerald-400/15 text-emerald-300' },
  not_used: { label: 'Not used', cls: 'border-amber-400/30 bg-amber-400/15 text-amber-300' },
  awaiting: { label: 'Needs a decision', cls: 'border-purple-400/40 bg-purple-500/20 text-purple-200' },
};

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** Seeded submissions point at a path with nothing stored behind it. */
const isPlaceholder = (path: string | null) => !path || path.startsWith('demo/');

/* ─────────────────────────────────────────────────────────────
   One video
   ───────────────────────────────────────────────────────────── */

/**
 * The link the brand puts behind this video's ad.
 *
 * The code in utm_content is what credits the order back to this creator.
 * Without it on screen, a brand running ads by hand has no way to attribute
 * anything, which is most brands until the Meta connection exists.
 */
function TrackingLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const params = `utm_source=kyro&utm_content=${token}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(params);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* Clipboard blocked: the code is on screen to copy by hand. */
    }
  };

  return (
    <div className="p-3 rounded-lg border border-line bg-surface-2 space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-muted">Ad link for this video</p>
        <button
          type="button"
          onClick={() => void copy()}
          className="text-xs font-semibold text-purple-300 hover:text-purple-200 inline-flex items-center gap-1"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="text-xs font-mono text-body break-all">{params}</p>
      <p className="text-[11px] text-faint leading-relaxed">
        Add these to the product URL your ad points at. Orders from that link are credited to this
        creator, for example your-store.com/products/x?{params}
      </p>
    </div>
  );
}

function VideoSheet({
  sub,
  onClose,
  review,
}: {
  sub: CampaignSubmission;
  onClose: () => void;
  review: React.ReactNode;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isPlaceholder(sub.videoUrl));

  useEffect(() => {
    if (isPlaceholder(sub.videoUrl)) return;
    let alive = true;
    void (async () => {
      const url = await signedVideoUrl(sub.videoUrl as string);
      if (!alive) return;
      setSrc(url);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [sub.videoUrl]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const poster = sub.thumbnailUrl ?? sub.coverUrl;
  const tone = USAGE[sub.usage] ?? USAGE.awaiting;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-app/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-line w-full sm:max-w-3xl rounded-t-2xl sm:rounded-2xl max-h-[94vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grid sm:grid-cols-[minmax(0,260px)_1fr]">
          {/* Preview */}
          <div className="bg-black sm:rounded-l-2xl overflow-hidden">
            <div className="relative aspect-[9/16] max-h-[60vh] sm:max-h-none mx-auto">
              {src ? (
                <video src={src} poster={poster ?? undefined} controls playsInline className="w-full h-full object-contain bg-black" />
              ) : (
                <>
                  <CoverImage src={poster} name={sub.creatorHandle} />
                  {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <RefreshCw size={18} className="animate-spin text-white/80" />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Details */}
          <div className="flex flex-col min-w-0">
            <div className="p-5 border-b border-line flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-heading truncate">@{sub.creatorHandle.replace(/^@+/, '')}</p>
                <p className="text-sm text-muted truncate">{sub.campaignName}</p>
                <p className="text-xs text-faint mt-0.5">Uploaded {day(sub.submittedAt)}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${tone.cls}`}>{tone.label}</span>
                <button type="button" onClick={onClose} className="text-muted hover:text-heading" aria-label="Close">
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {isPlaceholder(sub.videoUrl) ? (
                <p className="text-xs text-faint leading-relaxed">
                  Demo video: there is no file stored for this one, so it can't be played or
                  downloaded. Real uploads play here.
                </p>
              ) : !loading && !src ? (
                <p className="text-xs text-pink-300 leading-relaxed">
                  Couldn't load this video. It may still be processing.
                </p>
              ) : (
                src && (
                  <a
                    href={src}
                    download
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-line bg-surface-2 text-sm font-semibold text-body hover:text-heading"
                  >
                    <Download size={14} /> Download video
                  </a>
                )
              )}
            </div>

            {sub.trackingToken && (
              <div className="px-5 pb-5">
                <TrackingLink token={sub.trackingToken} />
              </div>
            )}

            {/* The same decision controls as everywhere else, so there is one
                place that decides what "not used" requires. */}
            <div className="border-t border-line mt-auto">{review}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   The library
   ───────────────────────────────────────────────────────────── */

export function ContentLibrary({
  brandId,
  campaigns,
  renderReview,
}: {
  brandId: string;
  campaigns: Array<{ id: string; name: string }>;
  /** The existing review card, rendered inside the video sheet. */
  renderReview: (sub: CampaignSubmission, onDecided: () => void) => React.ReactNode;
}) {
  const [rows, setRows] = useState<CampaignSubmission[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState('');
  const [usage, setUsage] = useState<UsageFilter>('all');
  const [open, setOpen] = useState<CampaignSubmission | null>(null);
  const [downloading, setDownloading] = useState<'in_use' | 'not_used' | 'all' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await listSubmissionsForBrand(brandId);
    setRows(res.data);
    setError(res.error);
  }, [brandId]);

  useEffect(() => { void load(); }, [load]);

  const byCampaign = useMemo(
    () => (rows ?? []).filter((r) => !campaignId || r.campaignId === campaignId),
    [rows, campaignId]
  );

  const counts = useMemo(() => ({
    all: byCampaign.length,
    awaiting: byCampaign.filter((r) => r.usage === 'awaiting').length,
    in_use: byCampaign.filter((r) => r.usage === 'in_use').length,
    not_used: byCampaign.filter((r) => r.usage === 'not_used').length,
  }), [byCampaign]);

  const shown = usage === 'all' ? byCampaign : byCampaign.filter((r) => r.usage === usage);

  /**
   * Download every video in the list that has a file.
   *
   * One short-lived signed link per video, saved in turn. Browsers ask once
   * before allowing several downloads from a page. That prompt is the browser
   * protecting the brand, not an error.
   */
  const downloadVideos = async (targets: CampaignSubmission[], which: 'in_use' | 'not_used' | 'all') => {
    setNotice(null);
    setDownloading(which);
    let saved = 0;
    let missing = 0;
    for (const r of targets) {
      if (isPlaceholder(r.videoUrl)) { missing += 1; continue; }
      const url = await signedVideoUrl(r.videoUrl as string, 300);
      if (!url) { missing += 1; continue; }
      const a = document.createElement('a');
      a.href = url;
      a.download = `${r.creatorHandle.replace(/^@+/, '')}-${r.id.slice(0, 8)}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      saved += 1;
    }
    setDownloading(null);
    setNotice(
      saved === 0 && missing > 0
        ? `No files to download: ${missing === 1 ? 'that video is' : `all ${missing} are`} demo data with nothing stored.`
        : missing > 0
          ? `Downloaded ${saved}. ${missing} had no file stored.`
          : `Downloaded ${saved} ${saved === 1 ? 'video' : 'videos'}.`
    );
  };

  const TABS: Array<{ id: UsageFilter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'awaiting', label: 'Needs a decision' },
    { id: 'in_use', label: 'In use' },
    { id: 'not_used', label: 'Not used' },
  ];

  return (
    <div className="bg-surface border border-line rounded-2xl overflow-hidden">
      <div className="p-5 border-b border-line space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-heading">Content library</h2>
            <p className="text-sm text-muted mt-0.5">
              Every video creators have sent you. Decide what runs, and say why when it doesn't.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {([
              { id: 'in_use' as const, label: 'Download in use', list: byCampaign.filter((r) => r.usage === 'in_use') },
              { id: 'not_used' as const, label: 'Download not used', list: byCampaign.filter((r) => r.usage === 'not_used') },
              { id: 'all' as const, label: 'Download all', list: byCampaign },
            ]).map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => void downloadVideos(b.list, b.id)}
                disabled={downloading !== null || b.list.length === 0}
                className="px-3 py-1.5 rounded-lg border border-line bg-surface-2 text-xs font-semibold text-muted hover:text-heading disabled:opacity-40 inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                {downloading === b.id ? <RefreshCw size={12} className="animate-spin" /> : <Download size={12} />}
                {b.label}
                <span className="text-faint">{b.list.length}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            aria-label="Filter by campaign"
            className="px-3 py-2 bg-surface-2 border border-line rounded-lg text-sm font-semibold text-body focus:outline-none focus:border-purple-500 max-w-full"
          >
            <option value="">All campaigns</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <div className="flex flex-wrap gap-1.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setUsage(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition whitespace-nowrap ${
                  usage === t.id
                    ? 'bg-gradient-kyro text-white border-transparent'
                    : 'bg-surface-2 border-line text-muted hover:text-heading'
                }`}
              >
                {t.label}
                <span className={`ml-1.5 ${usage === t.id ? 'text-white/70' : 'text-faint'}`}>{counts[t.id]}</span>
              </button>
            ))}
          </div>
        </div>

        {notice && <p className="text-xs text-muted">{notice}</p>}
      </div>

      {error && <p className="p-5 text-sm text-pink-300">{error}</p>}
      {rows === null && <p className="p-10 text-center text-sm text-muted">Loading…</p>}

      {rows !== null && shown.length === 0 && (
        <div className="p-12 text-center">
          <FileVideo size={28} className="mx-auto text-faint mb-3" />
          <p className="text-sm text-muted">
            {usage === 'awaiting' ? 'Nothing waiting on you.' : 'No videos here yet.'}
          </p>
          <p className="text-xs text-faint mt-1">Creators on your live campaigns can upload at any time.</p>
        </div>
      )}

      {shown.length > 0 && (
        <div className="p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          {shown.map((v) => {
            const tone = USAGE[v.usage] ?? USAGE.awaiting;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setOpen(v)}
                className="text-left space-y-2 group"
              >
                <div className="relative aspect-[9/16] rounded-xl overflow-hidden border border-line group-hover:border-purple-500/50 transition">
                  <VideoTile
                    name={v.creatorHandle}
                    src={v.thumbnailUrl ?? v.coverUrl}
                    showPlay={!v.thumbnailUrl}
                  />
                  <span className={`absolute top-2 left-2 px-1.5 py-0.5 rounded text-[9px] font-bold border backdrop-blur-sm ${tone.cls}`}>
                    {tone.label}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-heading truncate">@{v.creatorHandle.replace(/^@+/, '')}</p>
                  <p className="text-[11px] text-faint truncate">{v.campaignName}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {open && (
        <VideoSheet
          sub={open}
          onClose={() => setOpen(null)}
          review={renderReview(open, () => { setOpen(null); void load(); })}
        />
      )}
    </div>
  );
}
