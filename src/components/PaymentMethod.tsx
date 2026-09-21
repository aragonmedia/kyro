/**
 * Connecting a way to pay.
 *
 * KYRO charges the brand once per payment run and transfers each creator
 * their share, which is Stripe's "separate charges and transfers" model. That
 * means the brand side is an ordinary Stripe Customer with a payment method —
 * no Connect account needed on this side. Connect accounts are for the
 * creators receiving money, not the brands sending it.
 *
 * Until the Stripe keys are live this sheet explains exactly what will happen
 * and says plainly that it is not connected yet, rather than opening a form
 * that pretends to take card details. A brand who types a card number into
 * something that does not charge it has been misled, and that is worse than a
 * disabled button.
 */

import { useEffect, useState } from 'react';
import { Banknote, CreditCard, ExternalLink, Lock, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { startStripeSetup } from '../lib/platform';

export type PayMethod = 'ach' | 'card';

const COPY: Record<PayMethod, { title: string; icon: typeof Banknote; lines: string[]; cost: string }> = {
  ach: {
    title: 'Bank account',
    icon: Banknote,
    lines: [
      'You authorise KYRO to debit this account when you approve a payment run.',
      'Stripe verifies the account with two small deposits, or instantly if your bank supports it.',
      'Debits take one to three business days to settle.',
    ],
    cost: 'Cheapest to process, so this is what KYRO recommends.',
  },
  card: {
    title: 'Card',
    icon: CreditCard,
    lines: [
      'Your card is charged when you approve a payment run.',
      'Funds are available to creators immediately rather than after a bank transfer clears.',
      'Card details are entered on Stripe, never on KYRO.',
    ],
    cost: 'Costs more to process than a bank debit. KYRO absorbs the difference rather than adding a surcharge.',
  },
};

export function PaymentMethodSheet({
  method,
  brandId,
  onClose,
}: {
  method: PayMethod;
  brandId: string;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = COPY[method];
  const Icon = c.icon;

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const connect = async () => {
    setError(null);
    setBusy(true);
    const res = await startStripeSetup(brandId, method);
    setBusy(false);
    if (res.error || !res.url) {
      setError(res.error ?? 'Could not start the setup.');
      return;
    }
    window.location.href = res.url;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-app/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-line w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-line flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-surface-2 border border-line flex items-center justify-center flex-shrink-0">
              <Icon size={18} className="text-body" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-heading inline-flex items-center gap-2">
                {c.title}
                {method === 'ach' && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold border border-emerald-400/30 bg-emerald-400/10 text-emerald-300">Recommended</span>
                )}
              </h2>
              <p className="text-xs text-muted">Pay creator commission and the KYRO fee</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-heading flex-shrink-0" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <ul className="space-y-2.5">
            {c.lines.map((l) => (
              <li key={l} className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0 mt-[7px]" />
                <span className="text-sm text-body leading-relaxed">{l}</span>
              </li>
            ))}
          </ul>

          <p className="text-xs text-faint leading-relaxed">{c.cost}</p>

          <div className="flex items-start gap-2.5 p-3 rounded-lg border border-line bg-surface-2">
            <Lock size={14} className="text-emerald-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-muted leading-relaxed">
              Details are entered on Stripe and stored by Stripe. KYRO keeps the last four digits
              so you can tell accounts apart, and nothing else.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-400/30 bg-amber-400/10">
              <ShieldCheck size={14} className="text-amber-300 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-200 leading-relaxed">{error}</p>
            </div>
          )}

          <button
            type="button"
            onClick={() => void connect()}
            disabled={busy}
            className="w-full px-5 py-3 rounded-lg bg-gradient-kyro text-white font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {busy ? <RefreshCw size={16} className="animate-spin" /> : <ExternalLink size={16} />}
            Continue to Stripe
          </button>

          <p className="text-xs text-faint text-center leading-relaxed">
            You'll come back here once Stripe confirms.
          </p>
        </div>
      </div>
    </div>
  );
}
