/**
 * POST /api/stripe/setup
 *
 * Starts Stripe setup for a brand's payment method and returns a hosted URL
 * for the browser to follow. Card and bank details are entered on Stripe and
 * never reach KYRO.
 *
 * KYRO charges the brand once per payment run and transfers each creator
 * their share — Stripe's "separate charges and transfers" model. So the brand
 * side is an ordinary Customer plus a SetupIntent. Connect accounts belong to
 * the creators receiving money, and are created elsewhere.
 *
 * ⚠ Not wired to Stripe yet. Until STRIPE_SECRET_KEY exists this answers with
 *   a clear explanation rather than a half-built redirect. The contract below
 *   is what the real implementation fills in, and the client already speaks
 *   it, so switching on is a change inside this file only.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

type Method = 'ach' | 'card';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const { brandId, method } = (req.body ?? {}) as { brandId?: string; method?: Method };
  if (!brandId || (method !== 'ach' && method !== 'card')) {
    return res.status(400).json({ error: 'Missing brand or payment method.' });
  }

  // The caller has to be the brand's owner. Checked against their own token
  // rather than trusting the brandId in the body.
  const auth = req.headers.authorization ?? '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!jwt) return res.status(401).json({ error: 'Not signed in.' });

  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return res.status(500).json({ error: 'This environment is not configured.' });
  }

  const db = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });

  const { data: brand, error } = await db
    .from('brands')
    .select('id, name')
    .eq('id', brandId)
    .maybeSingle();

  if (error || !brand) {
    return res.status(403).json({ error: 'That brand is not yours.' });
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    // Honest, specific, and actionable — not a generic failure.
    return res.status(503).json({
      error:
        'Payments are not switched on yet. KYRO is completing Stripe onboarding; ' +
        'until then, approving a payment run records what is owed and the KYRO team settles it directly.',
    });
  }

  /*
   * ── What goes here when the key exists ──────────────────────
   *
   *  1. Find or create the Stripe Customer for this brand, storing
   *     `stripe_customer_id` on `brands` so it is reused rather than
   *     duplicated on every visit.
   *
   *  2. Create a SetupIntent (not a PaymentIntent — nothing is being charged
   *     yet, we are storing a method for later):
   *
   *       payment_method_types: method === 'ach'
   *         ? ['us_bank_account']
   *         : ['card']
   *       usage: 'off_session'
   *
   *     off_session matters: the brand will not be present when a payment run
   *     is charged, so the mandate has to permit that.
   *
   *  3. Create a Checkout Session in setup mode, which gives Stripe-hosted
   *     collection with no card fields in KYRO:
   *
   *       mode: 'setup'
   *       customer: <customer id>
   *       success_url: `${origin}/?stripe=ok`
   *       cancel_url:  `${origin}/?stripe=cancelled`
   *
   *  4. Return { url: session.url }.
   *
   *  5. A webhook on `setup_intent.succeeded` writes the payment method id and
   *     last four onto the brand, so Finance can gate its pay button on a real
   *     stored method rather than on the redirect having happened.
   *
   * Deliberately NOT here: any handling of raw card or bank numbers. If a
   * future change makes this file touch a PAN, the change is wrong.
   */

  return res.status(503).json({ error: 'Stripe is configured but the setup flow is not implemented yet.' });
}
