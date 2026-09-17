/**
 * KYRO — server environment
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
