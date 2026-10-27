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
import { RefreshCw, Video } from 'lucide-react';
import { listCreatorOrders, type CreatorOrderRow, type MySubmission } from '../lib/db';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listCreatorOrders(creatorId);
    setOrders(res.data);
    setError(res.error);
    setLoading(false);
  }, [creatorId]);

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

      {/* Per campaign. The table is the point: a creator wants to know which
          brand is worth making the next video for. */}
      <div className="bg-surface border border-line rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-line flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-heading">By campaign</h2>
            <p className="text-sm text-muted mt-0.5">Where your videos are earning.</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-heading tabular-nums">{money(windowEarned)}</p>
            <p className="text-xs text-faint">{windowOrders} orders in this period</p>
          </div>
        </div>

        {loading && orders === null && <p className="p-10 text-center text-sm text-muted">Loading…</p>}

        {orders !== null && byCampaign.length === 0 && (
          <div className="p-10 text-center">
            <Video size={26} className="mx-auto text-faint mb-3" />
            <p className="text-sm text-muted">Nothing in this period.</p>
            <p className="text-xs text-faint mt-1">Try a longer window, or submit to a campaign you are on.</p>
          </div>
        )}

        {byCampaign.length > 0 && (
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
                  <tr key={c.id} className="hover:bg-surface-2">
                    <td className="p-4">
                      <p className="font-semibold text-heading">{c.name}</p>
                      <p className="text-xs text-faint">{c.brandName}</p>
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
      </div>
    </div>
  );
}
