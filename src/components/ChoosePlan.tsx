/**
 * Asking a merchant to approve KYRO's plan, without throwing them out of KYRO.
 *
 * App Store rule 1.2.1 says Shopify does the charging, so KYRO creates no
 * subscription of its own: the merchant approves a plan on Shopify's own
 * pricing page. For a while the install redirected there the moment it
 * finished, which made a bad pricing page into a dead end. A reviewer whose
 * page said "No plans are available for your store" was left outside the app
 * with nothing to click and no way back in, and the whole submission failed
 * on it.
 *
 * So the link is a button now, and it sits inside the app next to a sentence
 * saying what the plan is and what it costs. A merchant who cannot approve a
 * plan can still use KYRO, which is the right order of things: nothing is
 * billed until an attributed order exists, so there is nothing to gate.
 *
 * It opens in a new tab rather than navigating away, so whatever the merchant
 * was doing in KYRO survives the detour.
 */

import { ExternalLink, X } from 'lucide-react';

export function ChoosePlan({
  shop,
  planUrl,
  onDismiss,
}: {
  shop?: string;
  planUrl: string;
  onDismiss: () => void;
}) {
  return (
    <div className="p-5 rounded-xl border border-purple-400/30 bg-purple-400/10 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-heading">One step left: approve KYRO's plan</p>
          <p className="text-sm text-body mt-1 leading-relaxed">
            Shopify bills KYRO's fee, not KYRO, so the charge is approved on Shopify's own
            pricing page{shop ? ` for ${shop.replace('.myshopify.com', '')}` : ''}. It is $0 a
            month. KYRO takes 1% of the sales your creators drive, and only once an order is
            attributed.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-muted hover:text-heading flex-shrink-0"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <a
          href={planUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2.5 rounded-lg bg-gradient-kyro text-white text-sm font-semibold inline-flex items-center gap-2"
        >
          Approve the plan on Shopify <ExternalLink size={14} />
        </a>
        <p className="text-xs text-faint">
          You can keep using KYRO while this is pending. Nothing is billed until a creator
          video drives a sale.
        </p>
      </div>
    </div>
  );
}
