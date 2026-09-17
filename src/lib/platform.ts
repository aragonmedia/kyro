/**
 * KYRO — starting and finishing a platform OAuth install, from the browser.
 *
 * Deliberately separate from db.ts. That file is the typed Supabase boundary;
 * this one talks to KYRO's own serverless endpoints, which is a different kind
 * of call with a different failure surface.
 *
 * Why a POST and then a manual navigation, rather than just linking to
 * /api/shopify/install: the endpoint has to know who is asking before it will
 * hand out an authorize URL for a brand, and a top-level browser navigation
 * cannot carry an Authorization header. So the app POSTs with the signed-in
 * user's token, the server checks brand ownership, and the app navigates to
 * the URL it gets back.
 */

import { getSupabase } from './supabase';

export interface InstallStart {
  url: string | null;
  error: string | null;
}

/**
 * Ask KYRO for the Shopify authorize URL for this brand and store.
 *
 * Returns the URL rather than navigating, so the caller decides when to leave
 * the page and can surface an error in place if something is wrong.
 */
export async function startShopifyInstall(brandId: string, shop: string): Promise<InstallStart> {
  const sb = getSupabase();
  if (!sb) return { url: null, error: 'This build has no Supabase connection, so installs are disabled.' };

  const { data, error } = await sb.auth.getSession();
  const token = data?.session?.access_token;
  if (error || !token) {
    return { url: null, error: 'Your session has expired. Sign in again and retry.' };
  }

  let res: Response;
  try {
    res = await fetch('/api/shopify/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ brandId, shop }),
    });
  } catch {
    return { url: null, error: 'Could not reach KYRO. Check your connection and try again.' };
  }

  // The endpoint answers JSON on both success and handled failure, but a
  // platform-level error (cold start, crash) can return an HTML page instead.
  let body: { url?: string; error?: string } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    body = {};
  }

  if (!res.ok) {
    return { url: null, error: body.error || `Could not start the install (${res.status}).` };
  }
  if (!body.url) {
    return { url: null, error: 'Could not start the install: no authorize URL was returned.' };
  }
  return { url: body.url, error: null };
}

/* ─────────────────────────────────────────────────────────────
   Coming back from the platform
   ───────────────────────────────────────────────────────────── */

export interface ConnectOutcome {
  provider: 'shopify';
  ok: boolean;
  shop?: string;
  message: string;
}

/**
 * Plain-language versions of the reason codes api/shopify/callback.ts emits.
 *
 * The callback deliberately sends a short code rather than a sentence, so the
 * wording lives here next to the rest of the UI copy. An unrecognised code
 * still produces something a person can act on.
 */
const SHOPIFY_REASONS: Record<string, string> = {
  signature:
    'Shopify could not confirm that request came from them, so the connection was refused. Start again from this page rather than an old link.',
  incomplete: 'Shopify sent an incomplete response. Try connecting again.',
  expired: 'That install link had expired. Install links are valid for 10 minutes, so start again.',
  mismatch:
    'The store that came back is not the one the install started for. Connect again and pick the right store.',
  storage: 'The store approved the install but KYRO could not store the connection. Nothing was saved, so it is safe to retry.',
  unexpected: 'Something went wrong finishing the install. Nothing was saved, so it is safe to retry.',
};

/**
 * Read the result of an install off the URL and strip it from the address bar,
 * so a refresh does not replay a stale banner.
 */
export function takeConnectionOutcome(): ConnectOutcome | null {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);
  const shopify = params.get('shopify');
  if (!shopify) return null;

  const shop = params.get('shop') || undefined;
  const reason = params.get('reason') || '';

  params.delete('shopify');
  params.delete('shop');
  params.delete('reason');
  const query = params.toString();
  window.history.replaceState({}, '', window.location.pathname + (query ? `?${query}` : ''));

  if (shopify === 'connected') {
    return {
      provider: 'shopify',
      ok: true,
      shop,
      message: shop ? `${shop} is connected.` : 'Your Shopify store is connected.',
    };
  }

  return {
    provider: 'shopify',
    ok: false,
    message: SHOPIFY_REASONS[reason] || 'The Shopify connection did not complete. Nothing was saved, so it is safe to retry.',
  };
}
