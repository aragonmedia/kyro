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
import { VideoTile } from './MediaTile';

const money = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

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
        <div className="relative aspect-video">
          <VideoTile
          name={sub.campaignName}
          label={sub.brandName}
          src={sub.thumbnailUrl ?? sub.coverUrl}
          showPlay={!sub.thumbnailUrl}
        />
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Orders" value={data.orders.toLocaleString()} />
                <Stat label="Revenue driven" value={money(data.revenueCents)} hint="Order value" />
                <Stat label="You earned" value={money(data.commissionCents)} hint="Commission" />
                <Stat
                  label="Impressions"
                  value={data.impressions ? data.impressions.toLocaleString() : '—'}
                  hint={data.impressions ? 'From Meta' : 'Needs Meta access'}
                />
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
