/**
 * One campaign, at a glance.
 *
 * The same chart as the dashboard, pinned to this campaign, with the four
 * numbers underneath and the handful of most recent orders. Deliberately
 * short: the full order list lives in Finance, and repeating it here would
 * make this another long page.
 */

import { useEffect, useState } from 'react';
import { ArrowRight, FileVideo, Receipt, X } from 'lucide-react';
import { listBrandOrders, listCampaignVideos, type BrandOrderRow, type CampaignVideo } from '../lib/db';
import { BrandPerformanceCard } from './BrandPerformance';
import { CoverImage, VideoTile } from './MediaTile';

const money = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** How many orders to show before pointing at Finance. */
const PREVIEW = 4;
/** Videos shown before the library needs expanding. */
const VIDEO_PREVIEW = 6;

const USAGE_TONE: Record<string, { label: string; cls: string }> = {
  in_use: { label: 'In use', cls: 'border-emerald-400/30 bg-emerald-400/15 text-emerald-300' },
  not_used: { label: 'Not used', cls: 'border-amber-400/30 bg-amber-400/15 text-amber-300' },
  awaiting: { label: 'Needs a decision', cls: 'border-white/20 bg-black/40 text-white/85' },
};

export function CampaignSummarySheet({
  brandId,
  campaign,
  onClose,
  onOpenFinance,
}: {
  brandId: string;
  campaign: {
    id: string;
    name: string;
    status: string;
    cover: string | null;
    creators: number;
    submissions: number;
    orders: number;
    spentDollars: number;
  };
  onClose: () => void;
  onOpenFinance: () => void;
}) {
  const [orders, setOrders] = useState<BrandOrderRow[] | null>(null);
  const [videos, setVideos] = useState<CampaignVideo[] | null>(null);
  const [allVideos, setAllVideos] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [o, v] = await Promise.all([
        listBrandOrders(brandId, campaign.id, PREVIEW),
        listCampaignVideos(campaign.id),
      ]);
      if (!alive) return;
      setOrders(o.data);
      setVideos(v.data);
    })();
    return () => { alive = false; };
  }, [brandId, campaign.id]);

  const shownVideos = allVideos ? (videos ?? []) : (videos ?? []).slice(0, VIDEO_PREVIEW);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const stats = [
    { label: 'Creators', value: campaign.creators.toLocaleString() },
    { label: 'Videos', value: campaign.submissions.toLocaleString() },
    { label: 'Orders', value: campaign.orders.toLocaleString() },
    { label: 'Commission', value: money(Math.round(campaign.spentDollars * 100)) },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-app/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-line w-full sm:max-w-3xl rounded-t-2xl sm:rounded-2xl max-h-[92vh] sm:max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative aspect-[21/7] sm:aspect-[21/6]">
          <CoverImage src={campaign.cover} name={campaign.name} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white/90 hover:text-white"
            aria-label="Close"
          >
            <X size={16} />
          </button>
          <div className="absolute bottom-3 left-4 right-4">
            <h2 className="text-lg sm:text-xl font-bold text-white truncate">{campaign.name}</h2>
            <p className="text-xs text-white/75 capitalize">{campaign.status.replace('_', ' ')}</p>
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {stats.map((s) => (
              <div key={s.label} className="p-3 sm:p-4 rounded-xl border border-line bg-surface-2">
                <p className="text-xs text-faint">{s.label}</p>
                <p className="text-lg font-bold text-heading tabular-nums mt-0.5">{s.value}</p>
              </div>
            ))}
          </div>

          {/* ── Content library ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold text-heading">Content library</p>
              {videos !== null && videos.length > 0 && (
                <span className="text-xs text-faint">{videos.length} {videos.length === 1 ? 'video' : 'videos'}</span>
              )}
            </div>

            {videos === null && <p className="text-sm text-muted py-4">Loading…</p>}

            {videos !== null && videos.length === 0 && (
              <div className="p-8 rounded-2xl border border-line bg-surface-2 text-center">
                <FileVideo size={22} className="mx-auto text-faint mb-2" />
                <p className="text-sm text-muted">No videos on this campaign yet.</p>
                <p className="text-xs text-faint mt-1">Creators upload whenever they like, no approval first.</p>
              </div>
            )}

            {videos !== null && videos.length > 0 && (
              <>
                {/* Portrait, because the footage is. */}
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3">
                  {shownVideos.map((v) => {
                    const tone = USAGE_TONE[v.usage] ?? USAGE_TONE.awaiting;
                    return (
                      <div key={v.id} className="space-y-1.5">
                        <div className="relative aspect-[9/16] rounded-xl overflow-hidden border border-line">
                          <VideoTile
                            name={v.creatorHandle}
                            src={v.thumbnailUrl ?? campaign.cover}
                            showPlay={!v.thumbnailUrl}
                          />
                          <span className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold border backdrop-blur-sm ${tone.cls}`}>
                            {tone.label}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted truncate">@{v.creatorHandle.replace(/^@+/, '')}</p>
                      </div>
                    );
                  })}
                </div>
                {videos.length > VIDEO_PREVIEW && (
                  <button
                    type="button"
                    onClick={() => setAllVideos((x) => !x)}
                    className="text-xs font-semibold text-purple-400 hover:text-purple-300"
                  >
                    {allVideos ? 'Show fewer' : `Show all ${videos.length}`}
                  </button>
                )}
              </>
            )}
          </div>

          <BrandPerformanceCard
            brandId={brandId}
            campaigns={[{ id: campaign.id, name: campaign.name }]}
            lockedCampaignId={campaign.id}
          />

          <div className="bg-surface border border-line rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-line flex items-center justify-between gap-3">
              <p className="font-semibold text-heading">Recent orders</p>
              {campaign.orders > PREVIEW && (
                <span className="text-xs text-faint">Latest {PREVIEW} of {campaign.orders}</span>
              )}
            </div>

            {orders === null && <p className="p-8 text-center text-sm text-muted">Loading…</p>}

            {orders !== null && orders.length === 0 && (
              <div className="p-8 text-center">
                <Receipt size={22} className="mx-auto text-faint mb-2" />
                <p className="text-sm text-muted">No orders on this campaign yet.</p>
              </div>
            )}

            {orders !== null && orders.length > 0 && (
              <div className="divide-y divide-line">
                {orders.map((o) => (
                  <div key={o.earningId} className="p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-heading">{o.orderNumber ?? '—'}</p>
                      <p className="text-xs text-muted truncate">
                        @{o.creatorHandle.replace(/^@+/, '')} · {day(o.placedAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-body tabular-nums">{money(o.orderValueCents)}</p>
                      <p className="text-xs text-blue-400 tabular-nums">{money(o.commissionCents)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => { onClose(); onOpenFinance(); }}
              className="w-full px-4 py-3 border-t border-line flex items-center justify-center gap-2 text-sm font-semibold text-purple-400 hover:text-purple-300 hover:bg-surface-2 transition"
            >
              All orders in Finance <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
