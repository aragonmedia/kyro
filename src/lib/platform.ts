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
  // 'installed' is an App Store install waiting for a brand. takeShopifyInstall
  // owns that one, and needs the claim still in the URL.
  if (!shopify || shopify === 'installed') return null;

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

/* ─────────────────────────────────────────────────────────────
   Payout account
   ───────────────────────────────────────────────────────────── */

export interface BankAccountInput {
  method: 'ach' | 'wire';
  accountHolder: string;
  bankName?: string;
  routingNumber: string;
  accountNumber: string;
  swiftCode?: string;
  bankAddress?: string;
}

export interface BankAccountSaved {
  accountLast4: string | null;
  error: string | null;
}

/**
 * Send bank details to KYRO's server to be encrypted and stored.
 *
 * Deliberately NOT a Supabase write. The creators table is readable by every
 * signed-in user under RLS, so a full account number written from the browser
 * would be sitting in a table any browser key can reach. This posts to a
 * serverless endpoint which seals the numbers and stores them in a table only
 * the service role can touch.
 *
 * The caller should clear the form state as soon as this resolves. The
 * numbers should not linger in React state after they have been sent.
 */
export async function saveBankAccount(input: BankAccountInput): Promise<BankAccountSaved> {
  const sb = getSupabase();
  if (!sb) return { accountLast4: null, error: 'Payout details are unavailable in this build.' };

  const { data, error } = await sb.auth.getSession();
  const token = data?.session?.access_token;
  if (error || !token) {
    return { accountLast4: null, error: 'Your session has expired. Sign in again and retry.' };
  }

  let res: Response;
  try {
    res = await fetch('/api/payout/bank-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    });
  } catch {
    return { accountLast4: null, error: 'Could not reach KYRO. Check your connection and try again.' };
  }

  let body: { accountLast4?: string; error?: string } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    body = {};
  }

  if (!res.ok) {
    return { accountLast4: null, error: body.error || `Could not save your payout account (${res.status}).` };
  }
  return { accountLast4: body.accountLast4 ?? null, error: null };
}

export interface BrandBankInput {
  accountHolder: string;
  bankName?: string;
  routingNumber: string;
  accountNumber: string;
}

/** Same sealed path as the creator payout account, for brand ACH billing. */
export async function saveBrandBankAccount(input: BrandBankInput): Promise<BankAccountSaved> {
  const sb = getSupabase();
  if (!sb) return { accountLast4: null, error: 'Billing is unavailable in this build.' };

  const { data, error } = await sb.auth.getSession();
  const token = data?.session?.access_token;
  if (error || !token) {
    return { accountLast4: null, error: 'Your session has expired. Sign in again and retry.' };
  }

  let res: Response;
  try {
    res = await fetch('/api/billing/bank-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    });
  } catch {
    return { accountLast4: null, error: 'Could not reach KYRO. Check your connection and try again.' };
  }

  let body: { accountLast4?: string; error?: string } = {};
  try { body = (await res.json()) as typeof body; } catch { body = {}; }

  if (!res.ok) {
    return { accountLast4: null, error: body.error || `Could not save your billing account (${res.status}).` };
  }
  return { accountLast4: body.accountLast4 ?? null, error: null };
}

/**
 * Start Stripe setup for a brand's payment method.
 *
 * KYRO charges the brand and transfers to creators, which is Stripe's
 * "separate charges and transfers" model — so the brand side is an ordinary
 * Customer with a SetupIntent, not a Connect account. Connect accounts belong
 * to the creators receiving money.
 *
 * The endpoint returns a hosted Stripe URL to send the browser to. Card and
 * bank details are never entered on KYRO and never touch this codebase.
 */
export async function startStripeSetup(
  brandId: string,
  method: 'ach' | 'card'
): Promise<InstallStart> {
  const sb = getSupabase();
  if (!sb) return { url: null, error: 'This build has no Supabase connection, so setup is disabled.' };

  const { data, error } = await sb.auth.getSession();
  const token = data?.session?.access_token;
  if (error || !token) {
    return { url: null, error: 'Your session has expired. Sign in again and retry.' };
  }

  let res: Response;
  try {
    res = await fetch('/api/stripe/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ brandId, method }),
    });
  } catch {
    return { url: null, error: 'Could not reach KYRO. Check your connection and try again.' };
  }

  let body: { url?: string; error?: string } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    return { url: null, error: 'Payments are not switched on for this environment yet.' };
  }

  if (!res.ok || !body.url) {
    return { url: null, error: body.error ?? 'Could not start the setup.' };
  }
  return { url: body.url, error: null };
}

/* ─────────────────────────────────────────────────────────────
   Shopify-initiated installs

   index.html sends Shopify's signed ?shop=…&hmac=… launch straight to
   /api/shopify/launch, which runs OAuth before any screen shows. If the store
   has no KYRO brand yet, the callback parks the token and returns here with a
   claim, which is exchanged once the merchant has signed up.
   ───────────────────────────────────────────────────────────── */

/**
 * An App Store install, waiting for the merchant to have a KYRO brand.
 *
 * localStorage rather than sessionStorage: signing up can mean confirming an
 * email in a new tab, and the claim has to survive that. It holds a signed,
 * expiring claim for one shop and no token.
 */
const PENDING_SHOP_KEY = 'kyro.pendingShopify';

interface PendingShop { shop: string; claim: string }

function readPending(): PendingShop | null {
  try {
    const raw = localStorage.getItem(PENDING_SHOP_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<PendingShop>;
    return v && typeof v.shop === 'string' && typeof v.claim === 'string' ? { shop: v.shop, claim: v.claim } : null;
  } catch {
    return null;
  }
}

/**
 * Pick up `?shopify=installed&shop=&claim=` from the callback, remember it,
 * and strip it from the address bar so a refresh cannot replay it.
 */
export function takeShopifyInstall(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get('shopify') !== 'installed') return null;
  const shop = params.get('shop');
  const claim = params.get('claim');
  try {
    window.history.replaceState({}, '', window.location.pathname);
  } catch {
    /* noop */
  }
  if (!shop || !claim) return null;
  try {
    localStorage.setItem(PENDING_SHOP_KEY, JSON.stringify({ shop, claim }));
  } catch {
    /* Blocked storage: the merchant can reopen KYRO from their Shopify admin. */
  }
  return shop;
}

/** The store waiting to be attached, taken once so it cannot loop. */
export function takePendingShop(): PendingShop | null {
  const v = readPending();
  try {
    localStorage.removeItem(PENDING_SHOP_KEY);
  } catch {
    /* noop */
  }
  return v;
}

export function peekPendingShop(): string | null {
  return readPending()?.shop ?? null;
}

/** Attach a parked App Store install to the signed-in merchant's brand. */
export async function claimShopifyInstall(brandId: string, claim: string): Promise<{ shop: string | null; error: string | null }> {
  const sb = getSupabase();
  if (!sb) return { shop: null, error: 'This build has no Supabase connection.' };
  const { data } = await sb.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) return { shop: null, error: 'Your session has expired. Sign in again and retry.' };

  let res: Response;
  try {
    res = await fetch('/api/shopify/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ brandId, claim }),
    });
  } catch {
    return { shop: null, error: 'Could not reach KYRO. Check your connection and try again.' };
  }
  let body: { shop?: string; error?: string } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    body = {};
  }
  if (!res.ok || !body.shop) return { shop: null, error: body.error ?? 'Could not finish connecting Shopify.' };
  return { shop: body.shop, error: null };
}
