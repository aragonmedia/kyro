/**
 * Connect Shopify — as close to one click as Shopify allows.
 *
 * Shopify has two install paths, and only one of them can start without
 * knowing the store:
 *
 *   · App Store listing. The merchant is already signed in to Shopify, so
 *     Shopify knows the store and handles the pick. Truly one click.
 *   · OAuth from KYRO. The authorize URL is per store —
 *     https://{store}.myshopify.com/admin/oauth/authorize — so there is
 *     nothing to redirect to until the store is named.
 *
 * So: when VITE_SHOPIFY_INSTALL_URL is set to the listing, the button goes
 * straight there. Until then the button reveals a single field, so the step
 * still reads as a button rather than a form. Setting one env var flips it.
 */

import { useState } from 'react';
import { ArrowRight, ExternalLink, RefreshCw } from 'lucide-react';
import { normalizeShopifyDomain } from '../lib/db';
import { startShopifyInstall } from '../lib/platform';

const LISTING_URL = (import.meta.env.VITE_SHOPIFY_INSTALL_URL as string | undefined)?.trim() || '';

export function ShopifyConnectButton({ brandId }: { brandId: string }) {
  const [asking, setAsking] = useState(false);
  const [store, setStore] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    setError(null);

    if (LISTING_URL) {
      // One click. Shopify picks the store because the merchant is signed in.
      window.location.href = LISTING_URL;
      return;
    }

    if (!asking) { setAsking(true); return; }

    const domain = normalizeShopifyDomain(store);
    if (!domain) { setError('Enter your store name, like bold-buns.'); return; }

    setBusy(true);
    // Real OAuth. Writing a brand_connections row here instead would mark the
    // store "connected" without ever obtaining a token, so nothing could
    // actually read orders.
    const res = await startShopifyInstall(brandId, domain);
    setBusy(false);
    if (res.error || !res.url) { setError(res.error ?? 'Could not start the install.'); return; }
    window.location.href = res.url;
  };

  return (
    <div className="space-y-2">
      {asking && !LISTING_URL && (
        <div className="space-y-1.5">
          <div className="flex items-stretch rounded-lg border border-line bg-surface-2 overflow-hidden focus-within:border-purple-500">
            <input
              autoFocus
              value={store}
              onChange={(e) => setStore(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void go(); }}
              placeholder="your-store"
              autoCapitalize="none"
              autoCorrect="off"
              className="flex-1 min-w-0 px-3 py-2.5 bg-transparent text-sm text-heading placeholder-faint focus:outline-none"
            />
            <span className="px-3 flex items-center text-sm text-faint border-l border-line whitespace-nowrap">
              .myshopify.com
            </span>
          </div>
          <p className="text-xs text-faint">
            Shopify asks which store before it shows its approval screen.
          </p>
        </div>
      )}

      {error && <p className="text-xs text-pink-300">{error}</p>}

      <button
        type="button"
        onClick={() => void go()}
        disabled={busy}
        className="px-5 py-2.5 rounded-lg bg-gradient-kyro text-white font-semibold text-sm disabled:opacity-50 inline-flex items-center gap-2"
      >
        {busy ? <RefreshCw size={14} className="animate-spin" /> : LISTING_URL ? <ExternalLink size={14} /> : <ArrowRight size={14} />}
        {asking && !LISTING_URL ? 'Continue to Shopify' : 'Connect Shopify'}
      </button>
    </div>
  );
}
