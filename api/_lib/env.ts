/**
 * KYRO: server environment
 *
 * These run in Vercel serverless functions, never in the browser. Anything
 * read here is server-only by definition; nothing in this file may ever be
 * given a VITE_ prefix, because that would compile it into the public bundle.
 */

/** Read a required variable, failing loudly rather than silently misbehaving. */
export function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Set it in Vercel under Project → Settings → Environment Variables, then redeploy.`
    );
  }
  return value;
}

export function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

/** Public origin of the app, used to build redirect URIs. */
export function appOrigin(): string {
  const explicit = optional('KYRO_APP_ORIGIN');
  if (explicit) return explicit.replace(/\/+$/, '');
  const vercel = optional('VERCEL_PROJECT_PRODUCTION_URL') || optional('VERCEL_URL');
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
  return 'https://itskyro.com';
}

export const shopifyConfig = () => ({
  clientId: required('VITE_SHOPIFY_CLIENT_ID'),
  clientSecret: required('SHOPIFY_CLIENT_SECRET'),
  apiVersion: optional('SHOPIFY_API_VERSION') || '2026-07',
  redirectUri: optional('SHOPIFY_REDIRECT_URI') || `${appOrigin()}/api/shopify/callback`,
  scopes: (optional('SHOPIFY_SCOPES') || 'read_orders,read_fulfillments,read_products')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
});

/**
 * Meta.
 *
 * The app id is public (it appears in the login dialog URL), which is why it
 * carries a VITE_ prefix and is read here from the same variable the browser
 * bundle uses. The secret is server-only and must never gain that prefix.
 *
 * The Graph version is pinned rather than floating: Meta breaks fields
 * between versions, and a silent bump on their release day is how an
 * integration stops working on a Tuesday for no visible reason.
 */
/**
 * Stripe.
 *
 * The publishable key is public by design and lives under VITE_. The secret
 * key is read only here and must never gain that prefix: it can move money.
 */
export const stripeConfig = () => ({
  secretKey: required('STRIPE_SECRET_KEY'),
  /**
   * Accounts v2 requires a pinned version header, unlike v1 which tolerated
   * none. Overridable because Stripe moves this string and a hardcoded one
   * becomes a time bomb.
   */
  apiVersion: optional('STRIPE_API_VERSION') || '2026-09-30.endive',
  /** Where Stripe returns a creator after hosted onboarding. */
  returnUrl: optional('STRIPE_RETURN_URL') || `${appOrigin()}/?stripe=payouts`,
  refreshUrl: optional('STRIPE_REFRESH_URL') || `${appOrigin()}/?stripe=payouts-retry`,
});

/**
 * Which Stripe world this deployment is talking to.
 *
 * Every Stripe identifier belongs to the key that made it: an acct_ or cus_
 * created in test does not exist to a live key, and the only answer Stripe
 * gives is "no such account". Storing the mode next to the identifier turns
 * that into something the application can see coming, and stops a preview
 * deployment holding a test key from overwriting a live customer on a real
 * brand. Migration 0036 adds the columns.
 *
 * Read from the key itself rather than from a second variable, because two
 * variables that have to agree eventually will not.
 */
export type StripeMode = 'test' | 'live';

export function stripeMode(): StripeMode {
  // sk_live_… and rk_live_… are the two live forms. Anything else, including
  // every test and sandbox key, is test.
  return /^[a-z]+_live_/.test(process.env.STRIPE_SECRET_KEY ?? '') ? 'live' : 'test';
}

export const metaConfig = () => ({
  appId: required('VITE_META_APP_ID'),
  appSecret: required('META_APP_SECRET'),
  graphVersion: optional('META_GRAPH_API_VERSION') || 'v25.0',
  redirectUri: optional('META_REDIRECT_URI') || `${appOrigin()}/api/meta/callback`,
  /**
   * ads_management writes ads, ads_read reads performance, business_management
   * lets a brand pick from the ad accounts their business owns rather than
   * only those they personally administer.
   */
  scopes: (optional('META_SCOPES') || 'ads_management,ads_read,business_management')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
});
