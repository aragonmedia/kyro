/**
 * One video's performance.
 *
 * Opened by clicking a submission card. Answers the question a creator
 * actually has about a video they posted: did it sell anything, and what did
 * that earn me.
 *
 * Figures come from `earnings` rather than the denormalised counters on
 * `submissions`. Those counters are only as current as whatever last wrote
 * them; earnings rows are what the creator is paid on.
 */

import { useEffect, useState } from 'react';
import { MessagesSquare, X, RefreshCw } from 'lucide-react';
import { getSubmissionDetail, type MySubmission, type SubmissionDetail } from '../lib/db';
import { VideoPerformance } from './VideoPerformance';
import { VideoTile } from './MediaTile';
import { signedVideoUrl } from '../lib/storage';

const money = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** Seeded submissions point at a path with nothing stored behind it. */
const isPlaceholder = (path: string | null) => !path || path.startsWith('demo/');

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="p-4 rounded-xl border border-line bg-surface-2 space-y-0.5">
      <p className="text-xs text-faint">{label}</p>
      <p className="text-xl font-bold text-heading">{value}</p>
      {hint && <p className="text-xs text-faint">{hint}</p>}
    </div>
  );
}

export function SubmissionDetailModal({
  sub,
  onClose,
  onMessage,
}: {
  sub: MySubmission;
  onClose: () => void;
  onMessage: () => void;
}) {
  const [data, setData] = useState<SubmissionDetail | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(!isPlaceholder(sub.videoUrl));

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getSubmissionDetail(sub.id);
      if (alive) setData(res.data);
    })();
    return () => {
      alive = false;
    };
  }, [sub.id]);

  /* A creator could see a frame of their own video but not play it, which is
     an odd thing for the place they came to check their own work. The bucket
     is private, so playback is a short-lived signed link rather than a public
     URL: the same path the brand's library uses, and the storage policy only
     mints one for the creator who made it. */
  useEffect(() => {
    if (isPlaceholder(sub.videoUrl)) { setSrc(null); setLoadingVideo(false); return; }
    let alive = true;
    setLoadingVideo(true);
    void (async () => {
      const url = await signedVideoUrl(sub.videoUrl as string);
      if (!alive) return;
      setSrc(url);
      setLoadingVideo(false);
    })();
    return () => { alive = false; };
  }, [sub.videoUrl]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const tone =
    sub.usage === 'in_use'
      ? { border: 'border-emerald-400/30', bg: 'bg-emerald-400/10', text: 'text-emerald-300', label: 'In use' }
      : sub.usage === 'not_used'
        ? { border: 'border-amber-400/30', bg: 'bg-amber-400/10', text: 'text-amber-300', label: 'Not used' }
        : { border: 'border-line', bg: 'bg-surface-2', text: 'text-muted', label: 'With the brand' };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-app/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-line rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* The footage is 9:16, so the frame is. A landscape box around
            vertical video either crops it or pads it with black, and both
            read as the video being the wrong shape. Capped by height rather
            than width so a tall frame cannot push the numbers off screen. */}
        <div className="relative bg-black">
          <div className="relative mx-auto h-[52vh] max-h-[560px] aspect-[9/16]">
            {src ? (
              <video
                src={src}
                poster={sub.thumbnailUrl ?? sub.coverUrl ?? undefined}
                controls
                playsInline
                className="w-full h-full object-contain bg-black"
              />
            ) : (
              <>
                <VideoTile
                  name={sub.campaignName}
                  label={sub.brandName}
                  src={sub.thumbnailUrl ?? sub.coverUrl}
                  showPlay={!loadingVideo && !sub.thumbnailUrl}
                />
                {loadingVideo && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <RefreshCw size={18} className="animate-spin text-white/80" />
                  </div>
                )}
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white/90 hover:text-white"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-heading truncate">{sub.campaignName}</h2>
              <p className="text-sm text-muted truncate">{sub.brandName}</p>
              <p className="text-xs text-faint mt-1">
                Uploaded {day(sub.submittedAt)}
                {sub.decidedAt && ` · answered ${day(sub.decidedAt)}`}
              </p>
            </div>
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${tone.border} ${tone.bg} ${tone.text}`}
            >
              {tone.label}
            </span>
          </div>

          {sub.usage === 'not_used' && (
            <div className="p-4 rounded-xl border border-amber-400/25 bg-amber-400/5 space-y-2">
              <p className="text-xs font-semibold text-amber-300">
                Why it wasn't used, and what they want next
              </p>
              <p className="text-sm text-body leading-relaxed">
                {sub.brandNote || 'The brand did not leave a note.'}
              </p>
            </div>
          )}

          {!loadingVideo && !src && (
            <p className="text-xs text-faint leading-relaxed">
              {isPlaceholder(sub.videoUrl)
                ? 'Demo video: there is no file stored for this one, so it cannot be played. Real uploads play here.'
                : 'Could not load this video. It may still be processing.'}
            </p>
          )}

          {/* A note you cannot answer is a verdict, not feedback. */}
          <button
            type="button"
            onClick={onMessage}
            className="w-full px-4 py-2.5 rounded-lg border border-line bg-surface-2 text-sm font-semibold text-body hover:text-heading inline-flex items-center justify-center gap-2"
          >
            <MessagesSquare size={14} />
            {sub.usage === 'not_used' ? 'Reply to the brand' : 'Message the brand'}
          </button>

          {data === null ? (
            <div className="flex items-center justify-center py-8 text-muted">
              <RefreshCw size={16} className="animate-spin" />
            </div>
          ) : (
            <>
              {/* Money only. Impressions used to sit here saying "needs Meta
                  access", which was a placeholder for a thing that now
                  exists: the performance panel below carries impressions
                  alongside the retention and clicks that give them meaning.
                  One number in two places is one number that can disagree
                  with itself. */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Stat label="Orders" value={data.orders.toLocaleString()} />
                <Stat label="Revenue driven" value={money(data.revenueCents)} hint="Order value" />
                <Stat label="You earned" value={money(data.commissionCents)} hint="Commission" />
              </div>

              {data.orders > 0 && data.firstOrderAt && data.lastOrderAt && (
                <p className="text-xs text-faint">
                  First order {day(data.firstOrderAt)} · most recent {day(data.lastOrderAt)}
                </p>
              )}

              {data.orders === 0 && sub.usage === 'in_use' && (
                <p className="text-sm text-muted leading-relaxed">
                  Running, but no attributed orders yet. Orders appear here once someone buys after
                  seeing this video.
                </p>
              )}
            </>
          )}

          {/* The same panel the brand sees for this video, with the same
              numbers in it. */}
          <div className="pt-4 border-t border-line">
            <VideoPerformance submissionId={sub.id} />
          </div>

          {sub.trackingToken && (
            <div className="pt-4 border-t border-line">
              <p className="text-xs text-faint">Tracking id</p>
              <p className="text-sm font-mono text-body break-all">{sub.trackingToken}</p>
              <p className="text-xs text-faint mt-1">
                This is what ties an order back to this specific video.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
