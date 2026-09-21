/**
 * KYRO — encryption and signing helpers
 *
 * Two separate jobs, deliberately not sharing a key:
 *   • sealing OAuth tokens before they touch the database (AES-256-GCM)
 *   • signing the OAuth `state` parameter so a callback can't be forged
 */

import crypto from 'node:crypto';
import { required } from './env.js';

export interface Sealed {
  ct: string;
  iv: string;
  tag: string;
}

/** 32-byte key, provided as 64 hex characters. Generate: openssl rand -hex 32 */
function encryptionKey(): Buffer {
  const raw = required('KYRO_ENCRYPTION_KEY').trim();
  const key = Buffer.from(raw, 'hex');
  if (key.length !== 32) {
    throw new Error('KYRO_ENCRYPTION_KEY must be 32 bytes as 64 hex characters (openssl rand -hex 32).');
  }
  return key;
}

/** AES-256-GCM. GCM is authenticated, so tampering is detected on decrypt. */
export function seal(plaintext: string): Sealed {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ct: ct.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

export function unseal(sealed: Sealed): string {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(sealed.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ct, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** Constant-time compare. Never use === on a signature. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/* ─────────────────────────────────────────────────────────────
   OAuth state
   Carries which brand started the flow, signed so the callback can trust it,
   and timestamped so an old link can't be replayed days later.
   ───────────────────────────────────────────────────────────── */

const STATE_TTL_MS = 10 * 60 * 1000;

interface StatePayload {
  /** Empty for an install Shopify started, where no brand exists yet. */
  brandId: string;
  shop?: string;
  /** True when the flow began on Shopify's side (App Store install). */
  launch?: boolean;
  nonce: string;
  ts: number;
}

function stateSecret(): string {
  return required('SHOPIFY_OAUTH_STATE_SECRET');
}

const b64url = (b: Buffer) => b.toString('base64url');

export function signState(brandId: string, shop?: string, launch = false): string {
  const payload: StatePayload = {
    brandId,
    shop,
    ...(launch ? { launch: true } : {}),
    nonce: crypto.randomBytes(16).toString('hex'),
    ts: Date.now(),
  };
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const sig = b64url(crypto.createHmac('sha256', stateSecret()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyState(state: string): StatePayload | null {
  const parts = state.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;

  const expected = b64url(crypto.createHmac('sha256', stateSecret()).update(body).digest());
  if (!safeEqual(sig, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StatePayload & { kind?: string };
    // A claim token is signed with the same secret. It must never pass as a state.
    if (payload.kind) return null;
    // A launch state has no brand yet, but it must name the shop.
    if (payload.launch ? !payload.shop : !payload.brandId) return null;
    if (typeof payload.ts !== 'number') return null;
    if (Date.now() - payload.ts > STATE_TTL_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

/* ─────────────────────────────────────────────────────────────
   Claim tokens

   After an App Store install, the browser that did the install is handed a
   signed claim for that shop. Once the merchant has a KYRO brand, the claim
   is exchanged for the parked token. It proves "this browser just installed
   this shop", nothing more: /api/shopify/claim still checks the signed-in
   user owns the brand, and refuses a shop already attached elsewhere.
   ───────────────────────────────────────────────────────────── */

/** Long enough to sign up and confirm an email, short enough to go stale. */
const CLAIM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function signClaim(shop: string): string {
  const payload = { kind: 'shopify-claim', shop, nonce: crypto.randomBytes(12).toString('hex'), ts: Date.now() };
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const sig = b64url(crypto.createHmac('sha256', stateSecret()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyClaim(claim: string): { shop: string } | null {
  const parts = claim.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = b64url(crypto.createHmac('sha256', stateSecret()).update(body).digest());
  if (!safeEqual(sig, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { kind?: string; shop?: string; ts?: number };
    if (p.kind !== 'shopify-claim' || !p.shop || typeof p.ts !== 'number') return null;
    if (Date.now() - p.ts > CLAIM_TTL_MS) return null;
    return { shop: p.shop };
  } catch {
    return null;
  }
}
