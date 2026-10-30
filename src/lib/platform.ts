/**
 * KYRO: starting and finishing a platform OAuth install, from the browser.
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

/* ─────────────────────────────────────────────────────────────
   The query string, as it was when the page loaded

   Every redirect back into KYRO carries its answer in the query string, and
   every one of them is read by a component. That is a race the components
   lose. App.tsx restores a Supabase session asynchronously, and when it
   succeeds it calls history.pushState with a bare path to move a signed-in
   visitor off the marketing page. That rewrite happens before the dashboard
   mounts, so by the time anything calls a take* function below, the answer
   has already been thrown away. No error, no banner, nothing: the brand's
   card is saved at Stripe and KYRO never hears about it.

   This module is imported before React renders, so capturing the search here
   captures it before any navigation can touch it. Each take* reads from this
   snapshot and deletes what it consumed, so a remount cannot replay a banner
   the user has already seen.
   ───────────────────────────────────────────────────────────── */

const bootParams = new URLSearchParams(
  typeof window === 'undefined' ? '' : window.location.search
);

/** What arrived on this page load, minus anything already consumed. */
function boot(): URLSearchParams {
  return bootParams;
}

/** Forget a parameter once it has been acted on. */
function consume(...keys: string[]): void {
  for (const key of keys) bootParams.delete(key);
}

/**
 * Strip the consumed parameters from the address bar too, so a refresh does
 * not look like it should replay anything. Best effort: if App.tsx has already
 * navigated, there is nothing left to strip and that is fine.
 */
function tidyUrl(): void {
  if (typeof window === 'undefined') return;
  try {
    const current = new URLSearchParams(window.location.search);
    for (const key of ['meta', 'shopify', 'shop', 'reason', 'claim', 'stripe', 'session']) {
      if (!bootParams.has(key)) current.delete(key);
    }
    const rest = current.toString();
    window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : ''));
  } catch {
    /* noop */
  }
}

export interface InstallStart {
  url: string | null;
  error: string | null;
}

/** What a KYRO endpoint sends back when Stripe refused the call. */
export interface StripeFailure {
  error?: string;
  code?: string | null;
  detail?: string | null;
}

/**
 * One sentence a person can act on, plus what Stripe actually said.
 *
 * The code and message are Stripe's own and name the failing parameter or
 * condition. Neither carries account or key material, and without them the
 * only record is a Vercel runtime log that Hobby discards after an hour,
 * which is how a wrong guess costs a whole round trip.
 */
function stripeFailure(body: StripeFailure, fallback: string): string {
  const base = body.error ?? fallback;
  const code = body.code ? ` (${body.code})` : '';
  const detail = body.detail ? ` ${body.detail}` : '';
  return `${base}${code}${detail}`;
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

export interface MetaAdAccount {
  id: string;
  accountId: string;
  name: string;
  currency: string;
  /** 1 means the account can run ads today. */
  status: number;
  businessName: string | null;
}

/** Send a brand to Meta's approval screen. */
export async function startMetaConnect(brandId: string): Promise<InstallStart> {
  const sb = getSupabase();
  if (!sb) return { url: null, error: 'This build has no Supabase connection.' };
  const { data } = await sb.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) return { url: null, error: 'Your session has expired. Sign in again and retry.' };

  let res: Response;
  try {
    res = await fetch('/api/meta/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ brandId }),
    });
  } catch {
    return { url: null, error: 'Could not reach KYRO. Check your connection and try again.' };
  }
  let body: { url?: string; error?: string } = {};
  try { body = (await res.json()) as typeof body; } catch { body = {}; }
  if (!res.ok || !body.url) return { url: null, error: body.error ?? 'Could not start the Meta connection.' };
  return { url: body.url, error: null };
}

/** The ad accounts the brand's Meta login can advertise with. */
export async function listMetaAdAccounts(
  brandId: string
): Promise<{ accounts: MetaAdAccount[]; selected: string | null; error: string | null }> {
  const sb = getSupabase();
  if (!sb) return { accounts: [], selected: null, error: 'This build has no Supabase connection.' };
  const { data } = await sb.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) return { accounts: [], selected: null, error: 'Your session has expired. Sign in again.' };

  let res: Response;
  try {
    res = await fetch(`/api/meta/accounts?brandId=${encodeURIComponent(brandId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return { accounts: [], selected: null, error: 'Could not reach KYRO. Check your connection and try again.' };
  }
  let body: { accounts?: MetaAdAccount[]; selected?: string | null; error?: string } = {};
  try { body = (await res.json()) as typeof body; } catch { body = {}; }
  if (!res.ok) return { accounts: [], selected: null, error: body.error ?? 'Could not read your Meta ad accounts.' };
  return { accounts: body.accounts ?? [], selected: body.selected ?? null, error: null };
}

/** Choose the ad account KYRO publishes this brand's creator videos to. */
export async function selectMetaAdAccount(brandId: string, adAccountId: string): Promise<{ error: string | null }> {
  const sb = getSupabase();
  if (!sb) return { error: 'This build has no Supabase connection.' };
  const { data } = await sb.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) return { error: 'Your session has expired. Sign in again.' };

  let res: Response;
  try {
    res = await fetch('/api/meta/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ brandId, adAccountId }),
    });
  } catch {
    return { error: 'Could not reach KYRO. Check your connection and try again.' };
  }
  let body: { error?: string } = {};
  try { body = (await res.json()) as typeof body; } catch { body = {}; }
  if (!res.ok) return { error: body.error ?? 'Could not save that ad account.' };
  return { error: null };
}

export interface ConnectOutcome {
  provider: 'shopify' | 'meta';
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
/** Plain-language versions of the reason codes api/meta/callback.ts emits. */
const META_REASONS: Record<string, string> = {
  declined: 'You cancelled on Meta before approving KYRO. Nothing was connected.',
  expired: 'That connection link had expired. Start again from this page.',
  incomplete: 'Meta sent an incomplete response. Try connecting again.',
  storage: 'Meta approved the connection but KYRO could not store it. Nothing was saved, so it is safe to retry.',
  unexpected: 'Something went wrong finishing the Meta connection. Nothing was saved, so it is safe to retry.',
};

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

  const params = boot();
  const meta = params.get('meta');
  if (meta) {
    const reason = params.get('reason') || '';
    consume('meta', 'reason');
    tidyUrl();
    if (meta === 'choose-account') {
      return {
        provider: 'meta',
        ok: true,
        message: 'Meta is connected. Choose which ad account KYRO should publish to.',
      };
    }
    return {
      provider: 'meta',
      ok: false,
      message: META_REASONS[reason] || 'The Meta connection did not complete. Nothing was saved, so it is safe to retry.',
    };
  }

  const shopify = params.get('shopify');
  // 'installed' is an App Store install waiting for a brand. takeShopifyInstall
  // owns that one, and needs the claim still in the URL.
  if (!shopify || shopify === 'installed') return null;

  const shop = params.get('shop') || undefined;
  const reason = params.get('reason') || '';

  consume('shopify', 'shop', 'reason');
  tidyUrl();

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

/**
 * A creator's bank account is Stripe's to hold, not KYRO's.
 *
 * The helper that posted one here has been removed along with the form that
 * fed it and the endpoint behind it. The account money lands in is the one
 * given to Stripe during payout onboarding, changed from the creator's own
 * Stripe dashboard. KYRO storing a second copy meant storing account numbers
 * it had no use for, and letting a creator believe they had changed something
 * that no transfer would ever read.
 */

export interface BankAccountSaved {
  accountLast4: string | null;
  error: string | null;
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
 * "separate charges and transfers" model, so the brand side is an ordinary
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

  let body: { url?: string; error?: string; code?: string | null; detail?: string | null } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    return { url: null, error: 'Payments are not switched on for this environment yet.' };
  }

  if (!res.ok || !body.url) {
    return { url: null, error: stripeFailure(body, 'Could not start the setup.') };
  }
  return { url: body.url, error: null };
}

/**
 * A return trip from a Stripe hosted page.
 *
 * `method` is a brand coming back from Checkout and carries the session id
 * that has to be read back server-side. The payout kinds are a creator coming
 * back from onboarding and carry nothing: whether they finished is Stripe's
 * answer to give, not the URL's.
 */
export interface StripeReturn {
  kind: 'method' | 'payouts' | 'payouts-retry';
  session: string | null;
}

/**
 * Where a Checkout session id waits between arriving and being confirmed.
 *
 * Reading the URL destroys it, and the confirm needs a brand id that may not
 * have loaded yet. Anything that remounts the dashboard in that gap - auth
 * settling, a refresh, a stray re-render - would otherwise lose the session
 * forever, and the brand is left looking at a page that says their card did
 * not save when Stripe has it.
 *
 * sessionStorage rather than localStorage: this is one return trip in one tab,
 * and it should not outlive the tab.
 */
const STRIPE_RETURN_KEY = 'kyro.stripeReturn';

function parkReturn(value: StripeReturn): void {
  try { sessionStorage.setItem(STRIPE_RETURN_KEY, JSON.stringify(value)); } catch { /* private window */ }
}

/** Called once the session has been confirmed, or has definitively failed. */
export function clearStripeReturn(): void {
  try { sessionStorage.removeItem(STRIPE_RETURN_KEY); } catch { /* private window */ }
}

function parkedReturn(): StripeReturn | null {
  try {
    const raw = sessionStorage.getItem(STRIPE_RETURN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StripeReturn;
    if (parsed?.kind !== 'method' && parsed?.kind !== 'payouts' && parsed?.kind !== 'payouts-retry') return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Read a Stripe return off the URL and strip it from the address bar, so a
 * refresh does not replay a stale confirmation.
 *
 * The value is parked before the URL is stripped, and survives there until
 * something confirms it. Calling this again after the URL is gone returns the
 * parked value rather than nothing.
 */
export function takeStripeReturn(): StripeReturn | null {
  if (typeof window === 'undefined') return null;

  const params = boot();
  const stripe = params.get('stripe');
  if (stripe !== 'method' && stripe !== 'payouts' && stripe !== 'payouts-retry') {
    return parkedReturn();
  }

  const session = params.get('session');
  // Only Stripe issues cs_ ids. Anything else in that slot is a stale or
  // tampered link, and is dropped rather than sent on to the server.
  const value: StripeReturn = { kind: stripe, session: session?.startsWith('cs_') ? session : null };
  parkReturn(value);
  consume('stripe', 'session');
  tidyUrl();

  return value;
}

/**
 * Confirm the payment method a brand just added on Stripe.
 *
 * The browser is trusted with nothing: it hands over the Checkout session id,
 * and KYRO reads the method back from Stripe itself before storing anything.
 * The reply says only whether something was stored, so the label shown on
 * screen still comes from the database on the next read.
 */
export async function confirmStripeMethod(
  brandId: string,
  sessionId: string
): Promise<{ saved: boolean; error: string | null }> {
  const sb = getSupabase();
  if (!sb) return { saved: false, error: 'This build has no Supabase connection, so billing is disabled.' };

  const { data, error } = await sb.auth.getSession();
  const token = data?.session?.access_token;
  if (error || !token) {
    return { saved: false, error: 'Your session has expired. Sign in again and retry.' };
  }

  let res: Response;
  try {
    const query = new URLSearchParams({ brandId, session: sessionId });
    res = await fetch(`/api/stripe/method?${query.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return { saved: false, error: 'Could not reach KYRO. Check your connection and try again.' };
  }

  let body: StripeFailure & { saved?: boolean } = {};
  try { body = (await res.json()) as typeof body; } catch { body = {}; }

  if (!res.ok) {
    return { saved: false, error: stripeFailure(body, 'Could not confirm your payment method.') };
  }
  if (!body.saved) {
    // Checkout can return before Stripe has attached the method. Nothing is
    // broken and nothing was charged, so say so plainly and let them retry,
    // with what the session actually looked like when we asked.
    const base = 'Stripe has not finished that setup yet. Give it a moment and try again.';
    return { saved: false, error: body.detail ? `${base} (${body.detail})` : base };
  }
  return { saved: true, error: null };
}

/**
 * A one-time link into the creator's own Stripe dashboard.
 *
 * Where they change the bank account their money lands in, and see what
 * Stripe has paid out. KYRO never holds those details, which is the point.
 */
export async function openCreatorDashboard(): Promise<{ url: string | null; error: string | null }> {
  const token = await creatorToken();
  if (!token) return { url: null, error: 'Your session has expired. Sign in again and retry.' };

  try {
    const res = await fetch('/api/stripe/dashboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: '{}',
    });
    const body = (await res.json()) as StripeFailure & { url?: string };
    if (!res.ok || !body.url) {
      return { url: null, error: stripeFailure(body, 'Could not open your Stripe dashboard.') };
    }
    return { url: body.url, error: null };
  } catch {
    return { url: null, error: 'Could not reach KYRO. Check your connection and try again.' };
  }
}

export interface PaymentRunResult {
  runId: string | null;
  /** True when the money is on its way but has not reached creators yet. */
  settling: boolean;
  message: string | null;
  error: string | null;
}

/**
 * Pay everything currently due.
 *
 * One call, deliberately: the server authorises the run, charges the brand and
 * sends the creator transfers in the same request. Splitting it would let a
 * closed tab leave a run authorised, with the orders marked paid and nobody
 * charged for them.
 *
 * A bank debit comes back `settling`: charged, clearing, creators paid when it
 * lands. That is normal and worth saying on screen, because otherwise it reads
 * as nothing having happened.
 */
export async function payNow(brandId: string): Promise<PaymentRunResult> {
  const sb = getSupabase();
  if (!sb) return { runId: null, settling: false, message: null, error: 'This build has no Supabase connection, so payments are disabled.' };

  const { data, error } = await sb.auth.getSession();
  const token = data?.session?.access_token;
  if (error || !token) {
    return { runId: null, settling: false, message: null, error: 'Your session has expired. Sign in again and retry.' };
  }

  let res: Response;
  try {
    res = await fetch('/api/stripe/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ brandId }),
    });
  } catch {
    // A timed-out charge may still have gone through, so this must not invite
    // a blind retry. The run is keyed, so a repeat cannot double-charge.
    return {
      runId: null,
      settling: false,
      message: null,
      error: 'Lost the connection while paying. Reload and check your payment history before trying again.',
    };
  }

  let body: {
    runId?: string;
    settling?: boolean;
    message?: string;
    error?: string;
  } = {};
  try { body = (await res.json()) as typeof body; } catch { body = {}; }

  if (!res.ok) {
    return { runId: body.runId ?? null, settling: false, message: null, error: body.error ?? 'Could not take that payment.' };
  }
  return {
    runId: body.runId ?? null,
    settling: Boolean(body.settling),
    message: body.message ?? null,
    error: null,
  };
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
  const params = boot();
  if (params.get('shopify') !== 'installed') return null;
  const shop = params.get('shop');
  const claim = params.get('claim');
  consume('shopify', 'shop', 'claim');
  tidyUrl();
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

/**
 * Attach a parked App Store install to the signed-in merchant's brand.
 *
 * `pricingUrl` comes back set when Shopify has no approved subscription for
 * the store yet. Shopify charges for KYRO, so the merchant has to approve a
 * plan on Shopify's own page before anything can be billed, and that is where
 * the link goes.
 */
export async function claimShopifyInstall(
  brandId: string,
  claim: string
): Promise<{ shop: string | null; pricingUrl: string | null; error: string | null }> {
  const fail = (error: string) => ({ shop: null, pricingUrl: null, error });

  const sb = getSupabase();
  if (!sb) return fail('This build has no Supabase connection.');
  const { data } = await sb.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) return fail('Your session has expired. Sign in again and retry.');

  let res: Response;
  try {
    res = await fetch('/api/shopify/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ brandId, claim }),
    });
  } catch {
    return fail('Could not reach KYRO. Check your connection and try again.');
  }
  let body: { shop?: string; pricingUrl?: string | null; error?: string } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    body = {};
  }
  if (!res.ok || !body.shop) return fail(body.error ?? 'Could not finish connecting Shopify.');
  return { shop: body.shop, pricingUrl: body.pricingUrl ?? null, error: null };
}

/* ─────────────────────────────────────────────────────────────
   STRIPE: creator payouts

   Creators are Express connected accounts. Stripe hosts their onboarding and
   is the only thing that decides whether somebody can be paid, so the app asks
   Stripe rather than inferring it from whatever KYRO happens to have stored.
   ───────────────────────────────────────────────────────────── */

export interface CreatorPayoutStatus {
  /** A Stripe account exists. Not the same thing as being payable. */
  connected: boolean;
  /** Stripe will send money to this person. The only gate that counts. */
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  /** What Stripe is still waiting on, in its own words. */
  requirementsDue: string[];
}

async function creatorToken(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data?.session?.access_token ?? null;
}

/** What Stripe currently says about the signed-in creator's payout account. */
export async function fetchPayoutStatus(): Promise<{ data: CreatorPayoutStatus | null; error: string | null }> {
  const token = await creatorToken();
  if (!token) return { data: null, error: null };

  try {
    const res = await fetch('/api/stripe/status', { headers: { Authorization: `Bearer ${token}` } });
    const body = (await res.json()) as Partial<CreatorPayoutStatus> & { error?: string };
    if (!res.ok) return { data: null, error: body.error ?? 'Could not read your payout status.' };
    return {
      data: {
        connected: Boolean(body.connected),
        payoutsEnabled: Boolean(body.payoutsEnabled),
        detailsSubmitted: Boolean(body.detailsSubmitted),
        requirementsDue: body.requirementsDue ?? [],
      },
      error: null,
    };
  } catch {
    return { data: null, error: 'Could not reach KYRO. Check your connection and try again.' };
  }
}

/**
 * Start or resume Stripe's hosted onboarding.
 *
 * The link is single use and expires in minutes, so it is minted per click and
 * followed immediately rather than stored anywhere.
 */
export async function startCreatorPayouts(): Promise<{ url: string | null; error: string | null }> {
  const token = await creatorToken();
  if (!token) return { url: null, error: 'Your session has expired. Sign in again and retry.' };

  try {
    const res = await fetch('/api/stripe/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: '{}',
    });
    const body = (await res.json()) as StripeFailure & { url?: string };
    if (!res.ok || !body.url) {
      return { url: null, error: stripeFailure(body, 'Could not start payout setup.') };
    }
    return { url: body.url, error: null };
  } catch {
    return { url: null, error: 'Could not reach KYRO. Check your connection and try again.' };
  }
}
