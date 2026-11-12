/**
 * Samples: asking for the product, and what happened after.
 *
 * Two surfaces, one table behind them.
 *
 * A creator on a campaign asks for product and gives an address. The brand
 * approves or declines, and marks it sent when it goes. KYRO buys no labels
 * and talks to no carriers; it records the asking, the answer and the date.
 *
 * The brand's side carries the number this feature exists for: how often
 * this creator posted after a sample actually went out. It is counted only
 * against samples the brand itself sent, so it is that brand's own record
 * of that creator rather than a platform-wide score, and it stays quiet
 * until there is enough to say.
 */

import { useCallback, useEffect, useState } from 'react';
import { Check, Package, RefreshCw, Send, X } from 'lucide-react';
import {
  decideSampleRequest,
  getSamplePostingRate,
  listSampleRequests,
  requestSample,
  type PostingRate,
  type SampleRequest,
  type SampleStatus,
} from '../lib/db';

const STATUS: Record<SampleStatus, { label: string; cls: string }> = {
  requested: { label: 'Asked', cls: 'border-warn/30 bg-warn-soft text-warn' },
  approved: { label: 'Approved', cls: 'border-good/30 bg-good-soft text-good' },
  declined: { label: 'Declined', cls: 'border-line bg-surface-2 text-muted' },
  sent: { label: 'Sent', cls: 'border-good/30 bg-good-soft text-good' },
};

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/* ─────────────────────────────────────────────────────────────
   Creator: ask for one
   ───────────────────────────────────────────────────────────── */

export function RequestSample({
  campaignId,
  campaignName,
  creatorId,
  existing,
  onDone,
}: {
  campaignId: string;
  campaignName: string;
  creatorId: string;
  /** Their open or closed request on this campaign, if there is one. */
  existing: SampleRequest | null;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    product: '', note: '', shipName: '', shipAddress: '', shipCountry: 'United States',
  });

  const send = async () => {
    setError(null);
    setBusy(true);
    const res = await requestSample({ campaignId, creatorId, ...form });
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    setOpen(false);
    setForm({ product: '', note: '', shipName: '', shipAddress: '', shipCountry: 'United States' });
    onDone();
  };

  if (existing && existing.status !== 'declined') {
    const tone = STATUS[existing.status];
    return (
      <div className="flex items-center gap-2">
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${tone.cls}`}>
          Sample {tone.label.toLowerCase()}
        </span>
        {existing.sentAt && <span className="text-[11px] text-faint">{day(existing.sentAt)}</span>}
      </div>
    );
  }

  const field =
    'w-full px-3 py-2 bg-surface-2 border border-line rounded-lg text-sm text-heading placeholder-faint focus:outline-none focus:border-purple-500';

  if (!open) {
    return (
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="px-3 py-1.5 rounded-lg border border-line bg-surface-2 text-xs font-semibold text-body hover:text-heading inline-flex items-center gap-1.5"
        >
          <Package size={13} /> Request a sample
        </button>
        {existing?.status === 'declined' && existing.declineReason && (
          <p className="text-[11px] text-faint max-w-xs">{existing.declineReason}</p>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl border border-line bg-surface-2 space-y-2 w-full max-w-sm">
      <p className="text-sm font-semibold text-heading">Sample for {campaignName}</p>
      <input className={field} placeholder="Which product" value={form.product}
        onChange={(e) => setForm({ ...form, product: e.target.value })} />
      <input className={field} placeholder="Size, flavour, anything else" value={form.note}
        onChange={(e) => setForm({ ...form, note: e.target.value })} />
      <input className={field} placeholder="Name on the parcel" value={form.shipName}
        onChange={(e) => setForm({ ...form, shipName: e.target.value })} />
      <textarea className={`${field} resize-y`} rows={3} placeholder="Shipping address"
        value={form.shipAddress} onChange={(e) => setForm({ ...form, shipAddress: e.target.value })} />
      <input className={field} placeholder="Country" value={form.shipCountry}
        onChange={(e) => setForm({ ...form, shipCountry: e.target.value })} />

      {error && <p className="text-xs text-bad">{error}</p>}
      <p className="text-[11px] text-faint">Only this brand sees your address.</p>

      <div className="flex gap-2">
        <button type="button" onClick={() => void send()} disabled={busy}
          className="flex-1 px-3 py-2 rounded-lg bg-gradient-kyro text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
          {busy ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />} Ask
        </button>
        <button type="button" onClick={() => { setOpen(false); setError(null); }}
          className="px-3 py-2 rounded-lg border border-line text-sm font-semibold text-muted hover:text-heading">
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Brand: the queue, and whether sending is worth it
   ───────────────────────────────────────────────────────────── */

function Rate({ creatorId }: { creatorId: string }) {
  const [rate, setRate] = useState<PostingRate | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getSamplePostingRate(creatorId);
      if (alive) setRate(res.data);
    })();
    return () => { alive = false; };
  }, [creatorId]);

  /* Silent below two. One sample tells you nothing, and a creator shown as
     "0%" after a single parcel that is still in transit is being judged on
     noise. */
  if (!rate || rate.sent < 2) return null;

  const pct = Math.round((rate.posted / rate.sent) * 100);
  const tone = pct >= 70 ? 'text-good' : pct >= 40 ? 'text-warn' : 'text-bad';

  return (
    <div className="text-right flex-shrink-0">
      <p className={`text-sm font-bold tabular-nums ${tone}`}>{pct}%</p>
      <p className="text-[11px] text-faint">posted {rate.posted} of {rate.sent}</p>
    </div>
  );
}

export function SampleQueue({ brandId }: { brandId: string }) {
  const [rows, setRows] = useState<SampleRequest[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await listSampleRequests();
    setRows(res.data);
    setError(res.error);
  }, []);

  useEffect(() => { void load(); }, [load, brandId]);

  const decide = async (id: string, status: 'approved' | 'declined' | 'sent') => {
    setBusy(id);
    setError(null);
    const res = await decideSampleRequest(id, status, status === 'declined' ? reason : undefined);
    setBusy(null);
    if (res.error) { setError(res.error); return; }
    setDeclining(null);
    setReason('');
    void load();
  };

  if (rows === null) return <p className="text-sm text-muted">Loading sample requests…</p>;

  const open = rows.filter((r) => r.status === 'requested' || r.status === 'approved');
  const done = rows.filter((r) => r.status === 'sent' || r.status === 'declined');

  if (rows.length === 0) {
    return (
      <div className="bg-surface border border-line rounded-2xl p-5 flex items-center gap-3">
        <Package size={16} className="text-faint flex-shrink-0" />
        <p className="text-sm text-muted">No sample requests yet.</p>
      </div>
    );
  }

  const Row = ({ r }: { r: SampleRequest }) => {
    const tone = STATUS[r.status];
    return (
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-heading truncate">
                @{r.creatorHandle.replace(/^@+/, '')}
              </p>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${tone.cls}`}>
                {tone.label}
              </span>
            </div>
            <p className="text-xs text-muted truncate">{r.campaignName}</p>
            <p className="text-xs text-faint mt-0.5">
              {r.product || 'No product named'}
              {r.note ? ` · ${r.note}` : ''}
            </p>
          </div>
          <Rate creatorId={r.creatorId} />
        </div>

        {(r.status === 'approved' || r.status === 'sent') && (
          <div className="text-xs text-body leading-relaxed border-l-2 border-line pl-3">
            <p className="font-semibold text-heading">{r.shipName}</p>
            <p className="whitespace-pre-wrap">{r.shipAddress}</p>
            <p className="text-faint">{r.shipCountry}</p>
          </div>
        )}

        {declining === r.id && (
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Why not, so they know whether to ask again."
            className="w-full px-3 py-2 bg-surface-2 border border-line rounded-lg text-sm text-heading placeholder-faint focus:outline-none focus:border-purple-500 resize-y"
          />
        )}

        {r.status !== 'sent' && r.status !== 'declined' && (
          <div className="flex flex-wrap gap-2">
            {r.status === 'requested' && (
              <button type="button" disabled={busy === r.id} onClick={() => void decide(r.id, 'approved')}
                className="px-3 py-1.5 rounded-lg bg-gradient-kyro text-white text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1.5">
                <Check size={12} /> Approve
              </button>
            )}
            {r.status === 'approved' && (
              <button type="button" disabled={busy === r.id} onClick={() => void decide(r.id, 'sent')}
                className="px-3 py-1.5 rounded-lg bg-gradient-kyro text-white text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1.5">
                <Package size={12} /> Mark sent
              </button>
            )}
            {declining === r.id ? (
              <>
                <button type="button" disabled={busy === r.id} onClick={() => void decide(r.id, 'declined')}
                  className="px-3 py-1.5 rounded-lg border border-warn/40 bg-warn-soft text-warn text-xs font-semibold disabled:opacity-50">
                  Send decline
                </button>
                <button type="button" onClick={() => { setDeclining(null); setReason(''); }}
                  className="px-3 py-1.5 rounded-lg border border-line text-xs font-semibold text-muted hover:text-heading">
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setDeclining(r.id)}
                className="px-3 py-1.5 rounded-lg border border-line text-xs font-semibold text-muted hover:text-heading inline-flex items-center gap-1.5">
                <X size={12} /> Decline
              </button>
            )}
          </div>
        )}

        {r.status === 'declined' && r.declineReason && (
          <p className="text-xs text-muted border-l-2 border-line pl-3">{r.declineReason}</p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-xs text-bad">{error}</p>}

      {open.length > 0 && (
        <div className="bg-surface border border-line rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-line flex items-center justify-between gap-2">
            <p className="font-semibold text-heading">Waiting on you</p>
            <span className="text-xs text-faint">{open.length}</span>
          </div>
          <div className="divide-y divide-line">
            {open.map((r) => <Row key={r.id} r={r} />)}
          </div>
        </div>
      )}

      {done.length > 0 && (
        <div className="bg-surface border border-line rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-line flex items-center justify-between gap-2">
            <p className="font-semibold text-heading">Settled</p>
            <span className="text-xs text-faint">{done.length}</span>
          </div>
          <div className="divide-y divide-line">
            {done.map((r) => <Row key={r.id} r={r} />)}
          </div>
        </div>
      )}
    </div>
  );
}
