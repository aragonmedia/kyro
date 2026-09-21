/**
 * What's behind each headline figure.
 *
 * A number a brand can't open is a number they have to take on trust. Each
 * KPI on the dashboard is a button, and this is what it opens: the rows the
 * figure was computed from, filterable by campaign.
 *
 * Also holds the creator profile a brand reaches from the leaderboard — same
 * shape of question ("who is this, really"), same shape of answer.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, FileVideo, Instagram, Layers, MapPin, Receipt, RefreshCw, X } from 'lucide-react';
import {
  getCreatorSummary,
  listBrandOrders,
  listSubmissionsForBrand,
  type BrandOrderRow,
  type CampaignSubmission,
  type CreatorSummary,
} from '../lib/db';
import { CoverImage } from './MediaTile';

export type DrilldownKind = 'campaigns' | 'videos' | 'orders' | 'impressions';

const money = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const followers = (n: number | null) =>
  n == null ? null : n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n);

const STATE_TONE: Record<string, string> = {
  pending: 'border-line bg-surface-2 text-muted',
  clearing: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  available: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  paid: 'border-line bg-surface-2 text-muted',
  reversed: 'border-pink-400/30 bg-pink-400/10 text-pink-300',
};

/** One shell, so every drilldown opens and closes the same way. */
function Sheet({
  title,
  sub,
  onClose,
  children,
}: {
  title: string;
  sub?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-app/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-line w-full sm:max-w-3xl rounded-t-2xl sm:rounded-2xl max-h-[92vh] sm:max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-line flex items-start justify-between gap-3 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-heading truncate">{title}</h2>
            {sub && <p className="text-sm text-muted mt-0.5">{sub}</p>}
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-heading flex-shrink-0" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

function CampaignPicker({
  campaigns,
  value,
  onChange,
}: {
  campaigns: Array<{ id: string; name: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  if (campaigns.length === 0) return null;
  return (
    <div className="p-4 border-b border-line">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Filter by campaign"
        className="w-full sm:w-auto px-3 py-2 bg-surface-2 border border-line rounded-lg text-sm font-semibold text-body focus:outline-none focus:border-purple-500"
      >
        <option value="">All campaigns</option>
        {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </div>
  );
}

function Empty({ icon: Icon, line, hint }: { icon: typeof Eye; line: string; hint?: string }) {
  return (
    <div className="p-12 text-center">
      <Icon size={28} className="mx-auto text-faint mb-3" />
      <p className="text-sm text-muted">{line}</p>
      {hint && <p className="text-xs text-faint mt-1 max-w-sm mx-auto leading-relaxed">{hint}</p>}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   The drilldowns
   ───────────────────────────────────────────────────────────── */

export function BrandDrilldown({
  kind,
  brandId,
  campaigns,
  onClose,
  onOpenCampaigns,
}: {
  kind: DrilldownKind;
  brandId: string;
  campaigns: Array<{ id: string; name: string; status: string; cover: string | null; orders: number; creators: number; submissions: number; spentDollars: number }>;
  onClose: () => void;
  onOpenCampaigns: () => void;
}) {
  const [campaignId, setCampaignId] = useState('');
  const [orders, setOrders] = useState<BrandOrderRow[] | null>(null);
  const [videos, setVideos] = useState<CampaignSubmission[] | null>(null);

  const picker = campaigns.map((c) => ({ id: c.id, name: c.name }));

  const load = useCallback(async () => {
    if (kind === 'orders') {
      const res = await listBrandOrders(brandId, campaignId || null);
      setOrders(res.data);
    }
    if (kind === 'videos') {
      const res = await listSubmissionsForBrand(brandId);
      setVideos(res.data);
    }
  }, [kind, brandId, campaignId]);

  useEffect(() => { void load(); }, [load]);

  const shownVideos = useMemo(() => {
    if (!videos) return null;
    if (!campaignId) return videos;
    const name = campaigns.find((c) => c.id === campaignId)?.name;
    return videos.filter((v) => v.campaignName === name);
  }, [videos, campaignId, campaigns]);

  /* ── Campaigns ── */
  if (kind === 'campaigns') {
    return (
      <Sheet title="Campaigns" sub="Every campaign and what it has driven." onClose={onClose}>
        {campaigns.length === 0 ? (
          <Empty icon={Layers} line="No campaigns yet." hint="A campaign is where you set the commission and what you want creators to make." />
        ) : (
          <div className="divide-y divide-line">
            {campaigns.map((c) => (
              <div key={c.id} className="p-4 flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl overflow-hidden border border-line flex-shrink-0">
                  <CoverImage src={c.cover} name={c.name} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-heading truncate">{c.name}</p>
                  <p className="text-xs text-muted capitalize">{c.status.replace('_', ' ')}</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6 text-right flex-shrink-0">
                  <div><p className="text-xs text-faint">Creators</p><p className="text-sm font-bold text-purple-400 tabular-nums">{c.creators}</p></div>
                  <div><p className="text-xs text-faint">Orders</p><p className="text-sm font-bold text-emerald-400 tabular-nums">{c.orders}</p></div>
                  <div className="hidden sm:block"><p className="text-xs text-faint">Commission</p><p className="text-sm font-bold text-heading tabular-nums">{money(c.spentDollars * 100)}</p></div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="p-4 border-t border-line">
          <button
            type="button"
            onClick={() => { onClose(); onOpenCampaigns(); }}
            className="text-sm font-semibold text-purple-400 hover:text-purple-300"
          >
            Manage campaigns →
          </button>
        </div>
      </Sheet>
    );
  }

  /* ── Videos ── */
  if (kind === 'videos') {
    return (
      <Sheet title="Videos submitted" sub="Everything creators have sent you." onClose={onClose}>
        <CampaignPicker campaigns={picker} value={campaignId} onChange={setCampaignId} />
        {shownVideos === null && <p className="p-10 text-center text-sm text-muted">Loading…</p>}
        {shownVideos !== null && shownVideos.length === 0 && (
          <Empty icon={FileVideo} line="No videos here yet." hint="Creators on your campaigns can upload whenever they like, with no approval first." />
        )}
        {shownVideos !== null && shownVideos.length > 0 && (
          <div className="divide-y divide-line">
            {shownVideos.map((v) => (
              <div key={v.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-heading truncate">@{v.creatorHandle.replace(/^@+/, '')}</p>
                  <p className="text-xs text-muted truncate">{v.campaignName}</p>
                  <p className="text-xs text-faint mt-0.5">Uploaded {day(v.submittedAt)}</p>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${
                    v.usage === 'in_use'
                      ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                      : v.usage === 'not_used'
                        ? 'border-amber-400/30 bg-amber-400/10 text-amber-300'
                        : 'border-line bg-surface-2 text-muted'
                  }`}
                >
                  {v.usage === 'in_use' ? 'In use' : v.usage === 'not_used' ? 'Not used' : 'Needs a decision'}
                </span>
              </div>
            ))}
          </div>
        )}
      </Sheet>
    );
  }

  /* ── Orders ── */
  if (kind === 'orders') {
    const total = (orders ?? []).reduce((s, o) => s + o.orderValueCents, 0);
    const owed = (orders ?? []).reduce((s, o) => s + o.commissionCents, 0);
    return (
      <Sheet
        title="Attributed orders"
        sub="Customers who bought from creator content."
        onClose={onClose}
      >
        <CampaignPicker campaigns={picker} value={campaignId} onChange={setCampaignId} />

        {orders !== null && orders.length > 0 && (
          <div className="grid grid-cols-3 gap-3 p-4 border-b border-line">
            <div><p className="text-xs text-faint">Orders</p><p className="text-lg font-bold text-heading tabular-nums">{orders.length}</p></div>
            <div><p className="text-xs text-faint">Order value</p><p className="text-lg font-bold text-heading tabular-nums">{money(total)}</p></div>
            <div><p className="text-xs text-faint">You owe</p><p className="text-lg font-bold text-blue-400 tabular-nums">{money(owed)}</p></div>
          </div>
        )}

        {orders === null && <p className="p-10 text-center text-sm text-muted">Loading…</p>}
        {orders !== null && orders.length === 0 && (
          <Empty
            icon={Receipt}
            line="No attributed orders yet."
            hint="An order lands here when Shopify tells KYRO it was placed after someone saw one of your creators' videos."
          />
        )}

        {orders !== null && orders.length > 0 && (
          <div className="divide-y divide-line">
            {orders.map((o) => (
              <div key={o.earningId} className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-heading">{o.orderNumber ?? '—'}</p>
                  <p className="text-xs text-muted truncate">
                    @{o.creatorHandle.replace(/^@+/, '')} · {o.campaignName}
                  </p>
                  <p className="text-xs text-faint mt-0.5">{day(o.placedAt)}</p>
                </div>
                <div className="flex items-center gap-4 sm:gap-6 text-right">
                  <div><p className="text-xs text-faint">Value</p><p className="text-sm text-body tabular-nums">{money(o.orderValueCents)}</p></div>
                  <div><p className="text-xs text-faint">Commission</p><p className="text-sm font-semibold text-blue-400 tabular-nums">{money(o.commissionCents)}</p></div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap ${STATE_TONE[o.state] ?? STATE_TONE.pending}`}>
                    {o.state === 'available' ? 'ready' : o.state}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Sheet>
    );
  }

  /* ── Impressions ── */
  return (
    <Sheet title="Impressions" sub="How many times your creators' ads were seen." onClose={onClose}>
      <Empty
        icon={Eye}
        line="KYRO can't see impressions yet."
        hint="Impressions come from your Meta ad account. Connect it from Settings and this fills in for every video running as a partnership ad. Orders and commission do not depend on it — those come from Shopify."
      />
    </Sheet>
  );
}

/* ─────────────────────────────────────────────────────────────
   Creator profile
   ───────────────────────────────────────────────────────────── */

export function CreatorProfileSheet({
  creatorId,
  stats,
  onClose,
  onPay,
}: {
  creatorId: string;
  /** What this brand has seen from them, passed in rather than refetched. */
  stats: { submissions: number; inUse: number; orders: number; revenueCents: number; commissionCents: number };
  onClose: () => void;
  onPay: () => void;
}) {
  const [data, setData] = useState<CreatorSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getCreatorSummary(creatorId);
      if (!alive) return;
      setData(res.data);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [creatorId]);

  const ig = followers(data?.instagramFollowers ?? null);
  const tt = followers(data?.tiktokFollowers ?? null);

  return (
    <Sheet
      title={loading ? 'Creator' : `@${(data?.handle ?? 'creator').replace(/^@+/, '')}`}
      sub={data?.location ?? undefined}
      onClose={onClose}
    >
      {loading ? (
        <div className="p-10 flex justify-center"><RefreshCw size={16} className="animate-spin text-muted" /></div>
      ) : (
        <div className="p-5 space-y-5">
          {data?.bio && <p className="text-sm text-body leading-relaxed">{data.bio}</p>}

          {data && data.niche.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {data.niche.map((n) => (
                <span key={n} className="px-2.5 py-1 rounded-full border border-line bg-surface-2 text-xs font-semibold text-muted">
                  {n}
                </span>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-xl border border-line bg-surface-2">
              <div className="flex items-center gap-2 text-muted">
                <Instagram size={14} />
                <span className="text-xs font-semibold">Instagram</span>
              </div>
              <p className="text-sm text-heading mt-1 truncate">
                {data?.instagramHandle ? data.instagramHandle : 'Not linked'}
              </p>
              {ig && <p className="text-xs text-faint">{ig} followers</p>}
            </div>
            <div className="p-4 rounded-xl border border-line bg-surface-2">
              <div className="flex items-center gap-2 text-muted">
                <MapPin size={14} />
                <span className="text-xs font-semibold">TikTok</span>
              </div>
              <p className="text-sm text-heading mt-1 truncate">
                {data?.tiktokHandle ? data.tiktokHandle : 'Not linked'}
              </p>
              {tt && <p className="text-xs text-faint">{tt} followers</p>}
            </div>
          </div>

          <div className="pt-4 border-t border-line space-y-3">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">With you</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div><p className="text-xs text-faint">Videos</p><p className="text-lg font-bold text-heading tabular-nums">{stats.submissions}</p></div>
              <div><p className="text-xs text-faint">In use</p><p className="text-lg font-bold text-emerald-400 tabular-nums">{stats.inUse}</p></div>
              <div><p className="text-xs text-faint">Orders</p><p className="text-lg font-bold text-heading tabular-nums">{stats.orders}</p></div>
              <div><p className="text-xs text-faint">You owe</p><p className="text-lg font-bold text-blue-400 tabular-nums">{money(stats.commissionCents)}</p></div>
            </div>
            <p className="text-xs text-faint leading-relaxed">
              Revenue driven: {money(stats.revenueCents)}. Figures cover the last 30 days.
            </p>

            {stats.commissionCents > 0 && (
              <button
                type="button"
                onClick={onPay}
                className="w-full px-4 py-2.5 rounded-lg bg-gradient-kyro text-white text-sm font-semibold"
              >
                Pay here
              </button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
