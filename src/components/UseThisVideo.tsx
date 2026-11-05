/**
 * The brand's one move.
 *
 * Everything KYRO does for a video hangs off one string: the tracking code
 * in the ad's destination URL. It is what credits an order to the creator,
 * and it is what lets KYRO find the ad and read its performance. One string,
 * every job.
 *
 * So the brand's step is one button that does both halves at once: puts the
 * link on the clipboard and marks the video as one they are running. Asking
 * someone to copy a code, go elsewhere, come back and then confirm is three
 * chances to do two of the three.
 *
 * Under it, the chain as a strip. Not instructions: a state. Each step is
 * either done or it is not, and a brand wondering why a video is not earning
 * can see which link is missing without reading anything.
 */

import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, DollarSign, Play, Sparkles } from 'lucide-react';
import { getSubmissionDetail, getVideoPerformance, setSubmissionUsage, type UsageState } from '../lib/db';

interface Step {
  icon: typeof Play;
  label: string;
  done: boolean;
  /** Two or three words. Anything longer is a paragraph in disguise. */
  state: string;
}

function Strip({ steps }: { steps: Step[] }) {
  return (
    <div className="flex items-stretch gap-2">
      {steps.map((s, i) => (
        <div key={s.label} className="flex-1 min-w-0">
          <div
            className={`h-1 rounded-full mb-2 ${s.done ? 'bg-gradient-kyro' : 'bg-line'}`}
            aria-hidden="true"
          />
          <div className="flex items-center gap-1.5">
            <s.icon size={13} className={s.done ? 'text-heading' : 'text-faint'} />
            <p className={`text-xs font-semibold truncate ${s.done ? 'text-heading' : 'text-faint'}`}>
              {s.label}
            </p>
            {s.done && <Check size={12} className="text-good flex-shrink-0" />}
          </div>
          <p className="text-[11px] text-faint truncate mt-0.5">{s.state}</p>
          <span className="sr-only">{i + 1} of {steps.length}</span>
        </div>
      ))}
    </div>
  );
}

export function UseThisVideo({
  submissionId,
  trackingToken,
  usage,
  onDecided,
}: {
  submissionId: string;
  trackingToken: string | null;
  usage: UsageState;
  onDecided: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [orders, setOrders] = useState(0);
  const [commissionCents, setCommissionCents] = useState(0);

  const params = trackingToken ? `utm_source=kyro&utm_content=${trackingToken}` : '';
  const inUse = usage === 'in_use';

  const refresh = useCallback(async () => {
    const [perf, detail] = await Promise.all([
      getVideoPerformance(submissionId),
      getSubmissionDetail(submissionId),
    ]);
    setRunning(perf.data.length > 0);
    setOrders(detail.data.orders);
    setCommissionCents(detail.data.commissionCents);
  }, [submissionId]);

  useEffect(() => { void refresh(); }, [refresh]);

  /* Copy and decide together. The copy has to happen first and in the click
     itself: a clipboard write that waits on a network round trip loses the
     user gesture the browser requires, and silently writes nothing. */
  const go = async () => {
    setError(null);
    try {
      await navigator.clipboard.writeText(params);
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    } catch {
      /* Blocked. The code is on screen below to take by hand. */
    }

    if (inUse) return;

    setBusy(true);
    const res = await setSubmissionUsage(submissionId, 'in_use', '');
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    onDecided();
  };

  const money = (cents: number) =>
    (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  const steps: Step[] = [
    {
      icon: Sparkles,
      label: 'Use it',
      done: inUse,
      state: inUse ? 'Done' : 'Not yet',
    },
    {
      icon: Play,
      label: 'Running',
      done: running,
      state: running ? 'Live as an ad' : 'Waiting on the ad',
    },
    {
      icon: DollarSign,
      label: 'Earning',
      done: orders > 0,
      state: orders > 0 ? `${orders} orders · ${money(commissionCents)}` : 'No orders yet',
    },
  ];

  if (!trackingToken) {
    return (
      <div className="p-4 rounded-xl border border-line bg-surface-2">
        <p className="text-sm text-muted">This video has no tracking link yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => void go()}
        disabled={busy}
        className="w-full px-4 py-3.5 rounded-xl bg-gradient-kyro text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-60 transition"
      >
        {copied ? <Check size={16} /> : <Copy size={16} />}
        {copied ? 'Copied, paste it into your ad' : inUse ? 'Copy ad link' : 'Copy link and use this video'}
      </button>

      <p className="text-xs font-mono text-faint break-all text-center">{params}</p>

      {error && <p className="text-xs text-bad text-center">{error}</p>}

      <Strip steps={steps} />
    </div>
  );
}
