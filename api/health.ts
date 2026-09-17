/**
 * GET /api/health
 *
 * Reports whether each server-side variable is present in the running
 * deployment. Presence only, never values.
 *
 * This exists because environment variables in Vercel apply at BUILD time, not
 * when you save them. Adding a variable and not redeploying leaves the old
 * bundle running without it, and the only symptom is an endpoint throwing a
 * generic error. This turns that into a direct answer.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appOrigin, shopifyConfig } from './_lib/env.js';

const SERVER_VARS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SHOPIFY_CLIENT_SECRET',
  'SHOPIFY_OAUTH_STATE_SECRET',
  'KYRO_ENCRYPTION_KEY',
] as const;

const PUBLIC_VARS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_SHOPIFY_CLIENT_ID',
  'VITE_META_APP_ID',
] as const;

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const present = (name: string) => Boolean(process.env[name]);

  const server = Object.fromEntries(SERVER_VARS.map((n) => [n, present(n)]));
  const pub = Object.fromEntries(PUBLIC_VARS.map((n) => [n, present(n)]));
  const missing = [...SERVER_VARS, ...PUBLIC_VARS].filter((n) => !present(n));

  // KYRO_ENCRYPTION_KEY must decode to exactly 32 bytes. Reporting the length
  // catches a truncated paste without revealing the key.
  const rawKey = process.env.KYRO_ENCRYPTION_KEY || '';
  const keyLooksValid = /^[0-9a-fA-F]{64}$/.test(rawKey.trim());

  // The origin every OAuth redirect_uri is built from. Worth reporting because
  // it is derived, not configured: KYRO_APP_ORIGIN wins, then Vercel's system
  // variable, then a hardcoded fallback. If this does not match the redirect
  // URL registered with Shopify and Meta, installs fail with a mismatch error
  // and nothing in the logs says why. This makes it a one-request check.
  const origin = appOrigin();
  let shopifyRedirect: string | null = null;
  try {
    shopifyRedirect = shopifyConfig().redirectUri;
  } catch {
    shopifyRedirect = null;
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(missing.length === 0 ? 200 : 503).json({
    ok: missing.length === 0 && keyLooksValid,
    deployedAt: process.env.VERCEL_DEPLOYMENT_ID ? 'vercel' : 'local',
    server,
    public: pub,
    missing,
    appOrigin: origin,
    shopifyRedirectUri: shopifyRedirect,
    encryptionKeyFormatValid: keyLooksValid,
    note:
      missing.length > 0
        ? 'Add the missing variables in Vercel, then REDEPLOY. Saving a variable does not apply it to the running deployment.'
        : keyLooksValid
          ? 'All variables present.'
          : 'KYRO_ENCRYPTION_KEY must be exactly 64 hex characters.',
  });
}
