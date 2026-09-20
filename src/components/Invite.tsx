/**
 * Campaign invites.
 *
 * Two components for the two ends of the same link: the brand copying it, and
 * whoever opens it.
 *
 * The landing page renders for someone who is not signed in, which is the
 * whole point of an off-platform invite — the brand sends it to a creator who
 * has never heard of KYRO. So the pitch comes first and the account comes
 * second, rather than a sign-in wall in front of a campaign they cannot see.
 */

import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Link2, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  acceptCampaignInvite,
  getCampaignByInvite,
  getCampaignInviteToken,
  type CampaignInvite,
  type OpenCampaign,
} from '../lib/db';
import { CoverImage } from './MediaTile';
import { BrandMark } from './CampaignDetail';

const inviteUrl = (token: string) =>
  `${typeof window !== 'undefined' ? window.location.origin : 'https://itskyro.com'}/join/${token}`;

const rate = (bps: number | null) =>
  bps == null ? null : `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;

/* ─────────────────────────────────────────────────────────────
   Brand side
   ───────────────────────────────────────────────────────────── */

export function CreatorInviteCard({ campaigns }: { campaigns: OpenCampaign[] }) {
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? '');
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (id: string, rotate = false) => {
    if (!id) { setToken(null); return; }
    setBusy(true);
    setError(null);
    const res = await getCampaignInviteToken(id, rotate);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    setToken(res.data);
  }, []);

  useEffect(() => { void load(campaignId); }, [campaignId, load]);

  const copy = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(inviteUrl(token));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Your browser blocked the copy. Select the link and copy it by hand.');
    }
  };

  if (campaigns.length === 0) return null;

  return (
    <div className="bg-surface border border-line rounded-2xl overflow-hidden">
      <div className="p-5 border-b border-line">
        <div className="flex items-center gap-2">
          <Link2 size={16} className="text-body" />
          <h2 className="text-lg font-bold text-heading">Invite a creator</h2>
        </div>
        <p className="text-sm text-muted mt-0.5">
          For creators you already know. This link skips the application queue — whoever opens it
          and signs up is on the campaign.
        </p>
      </div>

      <div className="p-5 space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="invite-campaign" className="text-xs font-semibold text-muted">
            Campaign
          </label>
          <select
            id="invite-campaign"
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            className="w-full px-4 py-2.5 bg-surface-2 border border-line rounded-lg text-heading focus:outline-none focus:border-purple-500"
          >
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            readOnly
            value={busy ? 'Creating…' : token ? inviteUrl(token) : ''}
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 min-w-[12rem] px-3 py-2.5 bg-surface-2 border border-line rounded-lg text-sm text-body font-mono focus:outline-none focus:border-purple-500"
          />
          <button
            type="button"
            onClick={() => void copy()}
            disabled={!token || busy}
            className="px-4 py-2.5 rounded-lg bg-gradient-kyro text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50 whitespace-nowrap"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>

        {error && <p className="text-xs text-pink-300">{error}</p>}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <p className="text-xs text-faint">
            Anyone with the link can join this campaign. Rotate it to kill every link you've sent.
          </p>
          <button
            type="button"
            onClick={() => void load(campaignId, true)}
            disabled={busy}
            className="text-xs font-semibold text-muted hover:text-heading disabled:opacity-50 whitespace-nowrap"
          >
            Rotate link
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Whoever opens it
   ───────────────────────────────────────────────────────────── */

export function InviteLanding({
  token,
  signedInCreator,
  onSignUp,
  onJoined,
}: {
  token: string;
  /** Null when signed out, or signed in as something other than a creator. */
  signedInCreator: boolean;
  onSignUp: () => void;
  onJoined: () => void;
}) {
  const [data, setData] = useState<CampaignInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getCampaignByInvite(token);
      if (!alive) return;
      setData(res.data);
      setError(res.error);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [token]);

  const join = async () => {
    setError(null);
    setJoining(true);
    const res = await acceptCampaignInvite(token);
    setJoining(false);
    if (res.error) { setError(res.error); return; }
    onJoined();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-app flex items-center justify-center">
        <RefreshCw size={18} className="animate-spin text-muted" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-app flex items-center justify-center p-6">
        <div className="max-w-sm text-center space-y-2">
          <h1 className="text-xl font-bold text-heading">This invite isn't valid</h1>
          <p className="text-sm text-muted leading-relaxed">
            The link may have been rotated by the brand, or the campaign may have closed. Ask them
            for a fresh one.
          </p>
        </div>
      </div>
    );
  }

  const r = rate(data.commissionBps);

  return (
    <div className="min-h-screen bg-app">
      <div className="max-w-lg mx-auto px-4 py-10 space-y-5">
        <div className="bg-surface border border-line rounded-2xl overflow-hidden">
          <div className="aspect-[21/9]">
            <CoverImage src={data.coverUrl} name={data.brandName} />
          </div>

          <div className="p-6 space-y-5">
            <div className="flex items-start gap-3">
              <BrandMark name={data.brandName} logoUrl={data.brandLogoUrl} size={44} />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-purple-300 uppercase tracking-wide">
                  You've been invited
                </p>
                <h1 className="text-xl font-bold text-heading leading-tight mt-0.5">
                  {data.campaignName}
                </h1>
                <p className="text-sm text-muted">{data.brandName}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-xl border border-line bg-surface-2">
                <p className="text-xs text-faint">You earn</p>
                <p className="text-base font-bold text-emerald-400 mt-0.5">
                  {r ? `${r} of each order` : 'Set by the brand'}
                </p>
              </div>
              <div className="p-4 rounded-xl border border-line bg-surface-2">
                <p className="text-xs text-faint">Money clears after</p>
                <p className="text-base font-bold text-heading mt-0.5">{data.clearingDays ?? 30} days</p>
              </div>
            </div>

            {data.brief && <p className="text-sm text-body leading-relaxed">{data.brief}</p>}

            {data.contentStyle && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted uppercase tracking-wider">
                  The style they want
                </p>
                <p className="text-sm text-body leading-relaxed">{data.contentStyle}</p>
              </div>
            )}

            {data.deliverableSpec && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted uppercase tracking-wider">Deliverable</p>
                <p className="text-sm text-body leading-relaxed">{data.deliverableSpec}</p>
              </div>
            )}

            <div className="flex items-start gap-2 p-3 rounded-lg border border-line bg-surface-2">
              <ShieldCheck size={14} className="text-emerald-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-muted leading-relaxed">
                Because {data.brandName} invited you directly, you're on the campaign as soon as you
                join. No application to wait on, and no approval before you upload.
              </p>
            </div>

            {error && <p className="text-sm text-pink-300">{error}</p>}

            {signedInCreator ? (
              <button
                type="button"
                onClick={() => void join()}
                disabled={joining}
                className="w-full px-5 py-3 rounded-lg bg-gradient-kyro text-white font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {joining && <RefreshCw size={16} className="animate-spin" />}
                Join this campaign
              </button>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={onSignUp}
                  className="w-full px-5 py-3 rounded-lg bg-gradient-kyro text-white font-semibold"
                >
                  Create a creator account to join
                </button>
                <p className="text-xs text-faint text-center">
                  Already on KYRO? Sign in and open this link again.
                </p>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-faint">
          KYRO pays creators commission on the orders their videos drive.
        </p>
      </div>
    </div>
  );
}
