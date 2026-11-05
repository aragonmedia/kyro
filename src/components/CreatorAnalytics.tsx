/**
 * What a creator's work is actually doing.
 *
 * The earnings figure answers "how much". This answers "why", which is the
 * question a creator needs answered to make the next video better: how many
 * of my videos did brands run, which campaigns are converting, and where is
 * the money coming from.
 *
 * Two deliberate choices on the part-to-whole.
 *
 * It is a segmented bar rather than a ring. Four categories with labels read
 * better along a line than around a circle, the labels can sit beside their
 * own segments instead of in a legend, and nobody has to compare arc lengths.
 *
 * And the headline rate is the **use rate**, not an approval rate. KYRO has no
 * approval gate: a creator uploads freely and the brand decides what to run.
 * So the number that matters is the share of videos a brand chose to put
 * money behind, which is a far more useful signal than whether an upload was
 * allowed through.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowLeft, ChevronRight, RefreshCw, Video } from 'lucide-react';
import {
  listCreatorOrders,
  listVideoPerformance,
  type CreatorOrderRow,
  type MySubmission,
  type VideoDayFor,
} from '../lib/db';
import { VideoPerformance } from './VideoPerformance';
import { CoverImage } from './MediaTile';

const WINDOWS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
] as const;

const money = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const ALL = '__all__';

/** The three states a submission can be in, from the creator's point of view. */
const USAGE = [
  { key: 'in_use', label: 'In use', fill: 'bg-good', text: 'text-good' },
  { key: 'awaiting', label: 'Awaiting', fill: 'bg-warn', text: 'text-warn' },
  { key: 'not_used', label: 'Not used', fill: 'bg-faint', text: 'text-muted' },
] as const;

const count = (n: number) => n.toLocaleString('en-US');
const pct = (n: number | null) => (n === null ? 'No data' : `${(n * 100).toFixed(1)}%`);

interface DayTotals {
  days: number;
  impressions: number;
  reach: number;
  spendCents: number;
  linkClicks: number;
  plays: number;
  hookRate: number | null;
  linkCtr: number | null;
  avgWatch: number | null;
}

/** Total a set of performance days. Rates are derived, never stored. */
function sumDays(rows: Array<{
  impressions: number; reach: number; spendCents: number; linkClicks: number;
  plays: number; avgWatchSeconds: number | null;
}>): DayTotals {
  const sum = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((t, r) => t + pick(r), 0);
  const impressions = sum((r) => r.impressions);
  const plays = sum((r) => r.plays);
  const linkClicks = sum((r) => r.linkClicks);

  /* Weighted by plays: a day with six plays should not move the average as
     hard as a day with six thousand. */
  const watchWeighted = rows.reduce((t, r) => (r.avgWatchSeconds === null ? t : t + r.avgWatchSeconds * r.plays), 0);
  const watchBase = rows.reduce((t, r) => (r.avgWatchSeconds === null ? t : t + r.plays), 0);

  return {
    days: rows.length,
    impressions,
    reach: sum((r) => r.reach),
    spendCents: sum((r) => r.spendCents),
    linkClicks,
    plays,
    hookRate: impressions > 0 ? plays / impressions : null,
    linkCtr: impressions > 0 ? linkClicks / impressions : null,
    avgWatch: watchBase > 0 ? watchWeighted / watchBase : null,
  };
}

function Spark({ rows }: { rows: Array<{ day: string; spendCents: number }> }) {
  if (rows.length < 2) return null;
  const top = Math.max(...rows.map((r) => r.spendCents), 1);
  const pts = rows.map((r, i) => {
    const x = (i / (rows.length - 1)) * 100;
    const y = 28 - (r.spendCents / top) * 26;
    return `${x},${y}`;
  });
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-full h-8" aria-hidden="true">
      <defs>
        <linearGradient id="kyro-spark" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#5b9bff" />
          <stop offset="100%" stopColor="#ff33cc" />
        </linearGradient>
      </defs>
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke="url(#kyro-spark)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PerfTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="p-4 rounded-xl border border-line bg-surface-2">
      <p className="text-xs text-muted truncate">{label}</p>
      <p className="text-xl font-bold text-heading tabular-nums mt-1">{value}</p>
      {note && <p className="text-xs text-faint mt-0.5">{note}</p>}
    </div>
  );
}

interface CampaignStat {
  id: string;
  name: string;
  brandName: string;
  videos: number;
  inUse: number;
  orders: number;
  earnedCents: number;
}

export function CreatorAnalytics({
  creatorId,
  submissions,
}: {
  creatorId: string;
  submissions: MySubmission[];
}) {
  const [windowDays, setWindowDays] = useState<number>(30);
  const [campaignId, setCampaignId] = useState<string>(ALL);
  const [orders, setOrders] = useState<CreatorOrderRow[] | null>(null);
  const [perf, setPerf] = useState<VideoDayFor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /* Which campaign is open. Null is the table; an id is that campaign's
     videos. One level deep on purpose: a creator wants the list, not a
     hierarchy to get lost in. */
  const [openCampaign, setOpenCampaign] = useState<string | null>(null);
  const [openVideo, setOpenVideo] = useState<string | null>(null);

  const ids = useMemo(() => submissions.map((s) => s.id), [submissions]);

  const load = useCallback(async () => {
    setLoading(true);
    const [ordersRes, perfRes] = await Promise.all([
      listCreatorOrders(creatorId),
      listVideoPerformance(ids),
    ]);
    setOrders(ordersRes.data);
    setPerf(perfRes.data);
    setError(ordersRes.error);
    setLoading(false);
  }, [creatorId, ids]);

  useEffect(() => { void load(); }, [load]);

  const since = useMemo(() => {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - (windowDays - 1));
    return d.getTime();
  }, [windowDays]);

  /* Campaigns the creator has actually submitted to. Filtering by a campaign
     with no videos would only ever produce an empty screen. */
  const campaigns = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; brandName: string }>();
    for (const s of submissions) {
      if (!seen.has(s.campaignId)) {
        seen.set(s.campaignId, { id: s.campaignId, name: s.campaignName, brandName: s.brandName });
      }
    }
    return [...seen.values()];
  }, [submissions]);

  const windowSubs = useMemo(
    () => submissions.filter((s) => {
      if (campaignId !== ALL && s.campaignId !== campaignId) return false;
      return new Date(s.submittedAt).getTime() >= since;
    }),
    [submissions, campaignId, since]
  );

  const counts = useMemo(() => {
    const c = { in_use: 0, awaiting: 0, not_used: 0 };
    for (const s of windowSubs) {
      if (s.usage === 'in_use') c.in_use += 1;
      else if (s.usage === 'not_used') c.not_used += 1;
      else c.awaiting += 1;
    }
    return c;
  }, [windowSubs]);

  const total = windowSubs.length;

  /* Decided means the brand has made a call. Videos still awaiting one are
     excluded from the denominator, because counting them as "not used" would
     punish a creator for a brand being slow. */
  const decided = counts.in_use + counts.not_used;
  const useRate = decided === 0 ? null : Math.round((counts.in_use / decided) * 100);

  const byCampaign = useMemo<CampaignStat[]>(() => {
    const stats = new Map<string, CampaignStat>();
    const ensure = (id: string, name: string, brandName: string) => {
      const existing = stats.get(id);
      if (existing) return existing;
      const fresh: CampaignStat = { id, name, brandName, videos: 0, inUse: 0, orders: 0, earnedCents: 0 };
      stats.set(id, fresh);
      return fresh;
    };

    for (const s of windowSubs) {
      const row = ensure(s.campaignId, s.campaignName, s.brandName);
      row.videos += 1;
      if (s.usage === 'in_use') row.inUse += 1;
    }

    /* Orders carry a campaign name but not its id, so they are matched by
       name. Two campaigns with the same name under different brands would
       collide, which is why the brand name is part of the key. */
    const idByName = new Map(campaigns.map((c) => [`${c.brandName}::${c.name}`, c.id]));
    for (const o of orders ?? []) {
      if (new Date(o.placedAt).getTime() < since) continue;
      if (o.state === 'reversed') continue;
      const id = idByName.get(`${o.brandName}::${o.campaignName}`);
      if (!id) continue;
      if (campaignId !== ALL && id !== campaignId) continue;
      const row = ensure(id, o.campaignName, o.brandName);
      row.orders += 1;
      row.earnedCents += o.commissionCents;
    }

    return [...stats.values()].sort((a, b) => b.earnedCents - a.earnedCents);
  }, [windowSubs, orders, campaigns, campaignId, since]);

  const windowEarned = byCampaign.reduce((s, c) => s + c.earnedCents, 0);
  const windowOrders = byCampaign.reduce((s, c) => s + c.orders, 0);

  /* Performance days inside the window, for the campaign in view. Keyed by
     submission so a campaign or a single video can be totalled from the same
     rows rather than refetched. */
  const perfInWindow = useMemo(() => {
    const campaignOf = new Map(submissions.map((s) => [s.id, s.campaignId]));
    return perf.filter((d) => {
      if (new Date(`${d.day}T00:00:00Z`).getTime() < since) return false;
      if (campaignId === ALL) return true;
      return campaignOf.get(d.submissionId) === campaignId;
    });
  }, [perf, since, campaignId, submissions]);

  const totals = useMemo(() => sumDays(perfInWindow), [perfInWindow]);

  const perfBySubmission = useMemo(() => {
    const out = new Map<string, VideoDayFor[]>();
    for (const d of perfInWindow) {
      const list = out.get(d.submissionId);
      if (list) list.push(d);
      else out.set(d.submissionId, [d]);
    }
    return out;
  }, [perfInWindow]);

  const open = openCampaign ? byCampaign.find((c) => c.id === openCampaign) ?? null : null;
  const openVideos = useMemo(
    () => (openCampaign ? submissions.filter((s) => s.campaignId === openCampaign) : []),
    [submissions, openCampaign]
  );

  return (
    <div className="space-y-6">
      {/* Filters in one row above everything they filter. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 p-1 bg-surface border border-line rounded-lg">
          {WINDOWS.map((w) => (
            <button
              key={w.days}
              type="button"
              onClick={() => setWindowDays(w.days)}
              className={`text-xs font-semibold px-3 py-1.5 rounded transition ${
                w.days === windowDays ? 'bg-gradient-kyro text-white' : 'text-muted hover:text-heading'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCampaignId(ALL)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
              campaignId === ALL
                ? 'border-transparent bg-gradient-kyro text-white'
                : 'border-line bg-surface text-muted hover:text-heading'
            }`}
          >
            All campaigns
          </button>
          {campaigns.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCampaignId(c.id)}
              title={`${c.name} · ${c.brandName}`}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition max-w-[12rem] truncate ${
                campaignId === c.id
                  ? 'border-transparent bg-gradient-kyro text-white'
                  : 'border-line bg-surface text-muted hover:text-heading'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-surface border border-line rounded-lg text-xs text-body hover:text-heading disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg border border-bad/30 bg-bad-soft">
          <p className="text-xs text-bad">{error}</p>
        </div>
      )}

      {/* Reach and spend behind the videos, when Meta has reported any.
          Four numbers and a shape. Anything longer stops being read. */}
      {totals.days > 0 && (
        <div className="bg-surface border border-line rounded-2xl p-5 md:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-body" />
            <h2 className="text-lg font-bold text-heading">Performance</h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <PerfTile label="Impressions" value={count(totals.impressions)} />
            <PerfTile label="Hook rate" value={pct(totals.hookRate)} />
            <PerfTile label="Link CTR" value={pct(totals.linkCtr)} note={`${count(totals.linkClicks)} clicks`} />
            <PerfTile label="Spend behind you" value={money(totals.spendCents)} />
          </div>
          <Spark rows={perfInWindow} />
        </div>
      )}

      {/* Videos: the part-to-whole, plus the one rate worth knowing. */}
      <div className="bg-surface border border-line rounded-2xl p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-2">
              <Video size={16} className="text-body" />
              <h2 className="text-lg font-bold text-heading">Your videos</h2>
            </div>
            <p className="text-sm text-muted mt-0.5">
              {total === 0 ? 'Nothing submitted in this period.' : `${total} submitted in the last ${windowDays} days.`}
            </p>
          </div>
          {useRate !== null && (
            <div className="text-right">
              <p className="text-3xl font-bold text-heading tabular-nums">{useRate}%</p>
              <p className="text-xs text-muted">used by brands</p>
              <p className="text-[11px] text-faint mt-0.5">of {decided} decided</p>
            </div>
          )}
        </div>

        {total > 0 && (
          <>
            {/* 2px gaps between segments, so adjacent fills never touch. */}
            <div className="flex h-3 rounded-full overflow-hidden gap-[2px] mb-4">
              {USAGE.map((u) => {
                const n = counts[u.key];
                if (n === 0) return null;
                return (
                  <div
                    key={u.key}
                    className={`${u.fill} first:rounded-l-full last:rounded-r-full`}
                    style={{ width: `${(n / total) * 100}%` }}
                    title={`${u.label}: ${n}`}
                  />
                );
              })}
            </div>

            <div className="grid grid-cols-3 gap-3">
              {USAGE.map((u) => (
                <div key={u.key}>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${u.fill}`} />
                    <span className="text-xs text-muted">{u.label}</span>
                  </div>
                  <p className="text-xl font-bold text-heading tabular-nums mt-0.5">{counts[u.key]}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Per campaign, and one level into it. A creator wants to know which
          brand is worth making the next video for, then which of their
          videos did the work. */}
      <div className="bg-surface border border-line rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-line flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            {open ? (
              <>
                <button
                  type="button"
                  onClick={() => { setOpenCampaign(null); setOpenVideo(null); }}
                  className="flex items-center gap-2 text-sm text-muted hover:text-heading mb-1"
                >
                  <ArrowLeft size={15} /> All campaigns
                </button>
                <h2 className="text-lg font-bold text-heading truncate">{open.name}</h2>
                <p className="text-sm text-muted mt-0.5">{open.brandName}</p>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold text-heading">By campaign</h2>
                <p className="text-sm text-muted mt-0.5">Tap one to see its videos.</p>
              </>
            )}
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-lg font-bold text-heading tabular-nums">
              {money(open ? open.earnedCents : windowEarned)}
            </p>
            <p className="text-xs text-faint">{open ? open.orders : windowOrders} orders</p>
          </div>
        </div>

        {loading && orders === null && <p className="p-10 text-center text-sm text-muted">Loading…</p>}

        {!open && orders !== null && byCampaign.length === 0 && (
          <div className="p-10 text-center">
            <Video size={26} className="mx-auto text-faint mb-3" />
            <p className="text-sm text-muted">Nothing in this period.</p>
            <p className="text-xs text-faint mt-1">Try a longer window, or submit to a campaign you are on.</p>
          </div>
        )}

        {!open && byCampaign.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-faint border-b border-line">
                  <th className="p-4 font-semibold">Campaign</th>
                  <th className="p-4 font-semibold text-right">Videos</th>
                  <th className="p-4 font-semibold text-right">In use</th>
                  <th className="p-4 font-semibold text-right">Orders</th>
                  <th className="p-4 font-semibold text-right">Earned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {byCampaign.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setOpenCampaign(c.id)}
                    className="hover:bg-surface-2 cursor-pointer"
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-heading truncate">{c.name}</p>
                          <p className="text-xs text-faint truncate">{c.brandName}</p>
                        </div>
                        <ChevronRight size={15} className="text-faint flex-shrink-0 ml-auto sm:ml-1" />
                      </div>
                    </td>
                    <td className="p-4 text-right tabular-nums text-body">{c.videos}</td>
                    <td className="p-4 text-right tabular-nums">
                      {c.inUse > 0 ? <span className="text-good font-semibold">{c.inUse}</span> : <span className="text-faint">0</span>}
                    </td>
                    <td className="p-4 text-right tabular-nums text-body">{c.orders}</td>
                    <td className="p-4 text-right tabular-nums text-heading font-semibold">{money(c.earnedCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* One campaign's videos. Each row is the video and its numbers;
            opening one shows the full panel underneath it. */}
        {open && (
          <div className="divide-y divide-line">
            {openVideos.length === 0 && (
              <p className="p-10 text-center text-sm text-muted">No videos on this campaign yet.</p>
            )}

            {openVideos.map((v) => {
              const rows = perfBySubmission.get(v.id) ?? [];
              const t = sumDays(rows);
              const tone =
                v.usage === 'in_use' ? 'text-good' : v.usage === 'not_used' ? 'text-muted' : 'text-warn';
              const label =
                v.usage === 'in_use' ? 'In use' : v.usage === 'not_used' ? 'Not used' : 'Awaiting';
              const isOpen = openVideo === v.id;

              return (
                <div key={v.id}>
                  <button
                    type="button"
                    onClick={() => setOpenVideo(isOpen ? null : v.id)}
                    className="w-full text-left p-4 flex items-center gap-3 hover:bg-surface-2 transition"
                  >
                    {/* The frame is what a creator recognises their own video
                        by. Every row here is on the same campaign, so
                        repeating its name would identify nothing. */}
                    <div className="w-9 aspect-[9/16] rounded-md overflow-hidden border border-line flex-shrink-0">
                      <CoverImage src={v.thumbnailUrl ?? v.coverUrl} name={v.campaignName} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-heading truncate">
                        {new Date(v.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                      <p className={`text-xs ${tone}`}>{label}</p>
                    </div>
                    {t.days > 0 && (
                      <div className="hidden sm:flex items-center gap-5 flex-shrink-0 text-right">
                        <div>
                          <p className="text-sm font-semibold text-heading tabular-nums">{count(t.impressions)}</p>
                          <p className="text-[11px] text-faint">impressions</p>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-heading tabular-nums">{money(t.spendCents)}</p>
                          <p className="text-[11px] text-faint">spend</p>
                        </div>
                      </div>
                    )}
                    <ChevronRight
                      size={16}
                      className={`text-faint flex-shrink-0 transition ${isOpen ? 'rotate-90' : ''}`}
                    />
                  </button>

                  {isOpen && (
                    <div className="p-4 pt-0">
                      <VideoPerformance submissionId={v.id} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
