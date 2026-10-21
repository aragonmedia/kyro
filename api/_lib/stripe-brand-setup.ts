/**
 * POST /api/stripe/setup
 *
 * Starts Stripe setup for a brand's payment method and returns a hosted URL
 * for the browser to follow. Card and bank details are entered on Stripe and
 * never reach KYRO.
 *
 * KYRO charges the brand once per payment run and transfers each creator their
 * share, which is Stripe's separate charges and transfers model. So the brand
 * side is an ordinary Customer plus a SetupIntent. Connect accounts belong to
 * the creators receiving money and are created elsewhere.
 *
 * Nothing is charged here. The brand is storing a method for later, and the
 * result is only believed once the server reads the completed session back
 * from Stripe in the `method` action.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { serviceClient } from './supabase.js';
import { appOrigin } from './env.js';
import { createCustomer, createSetupCheckout } from './stripe-billing.js';
import { StripeError } from './stripe.js';

type Method = 'ach' | 'card';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) ?? {};
  const brandId = typeof body.brandId === 'string' ? body.brandId : '';
  const method = body.method as Method | undefined;
  if (!brandId || (method !== 'ach' && method !== 'card')) {
    return res.status(400).json({ error: 'Missing brand or payment method.' });
  }

  // The caller has to own the brand. Checked against their own token rather
  // than trusting the brandId in the body.
  const auth = req.headers.authorization ?? '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!jwt) return res.status(401).json({ error: 'Not signed in.' });

  const sb = serviceClient();
  const { data: userData, error: userError } = await sb.auth.getUser(jwt);
  const userId = userData?.user?.id;
  if (userError || !userId) return res.status(401).json({ error: 'Not signed in.' });

  const { data: brand, error: brandError } = await sb
    .from('brands')
    .select('id, name, owner_user_id')
    .eq('id', brandId)
    .maybeSingle();

  if (brandError) return res.status(500).json({ error: 'Could not verify the brand.' });
  if (!brand || brand.owner_user_id !== userId) {
    return res.status(403).json({ error: 'That brand is not yours.' });
  }

  try {
    // brand_billing is created on demand elsewhere; make sure a row exists so
    // the customer id has somewhere to live.
    await sb.from('brand_billing').upsert({ brand_id: brandId }, { onConflict: 'brand_id' });

    const { data: billing } = await sb
      .from('brand_billing')
      .select('stripe_customer_id')
      .eq('brand_id', brandId)
      .maybeSingle();

    let customerId = (billing?.stripe_customer_id as string | null) ?? null;
    if (!customerId) {
      const customer = await createCustomer(brandId, brand.name as string, userData.user?.email);
      customerId = customer.id;
      const { error } = await sb
        .from('brand_billing')
        .update({ stripe_customer_id: customerId })
        .eq('brand_id', brandId);
      // Losing this write would create a second Customer on the next click,
      // so it stops rather than carrying on.
      if (error) {
        console.error('[kyro] could not store the stripe customer', error);
        return res.status(500).json({ error: 'Could not start setup. Nothing was charged.' });
      }
    }

    const origin = appOrigin();
    const session = await createSetupCheckout(
      customerId,
      method,
      `${origin}/?stripe=method&session={CHECKOUT_SESSION_ID}`,
      `${origin}/?stripe=method-cancelled`
    );

    if (!session.url) {
      return res.status(502).json({ error: 'Stripe did not return a setup page. Try again shortly.' });
    }
    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error('[kyro] stripe/setup failed', e);
    // The code goes back with the message, as it does on the creator side. A
    // brand cannot act on it, but it names the failing call without a trip to
    // logs that Vercel drops after an hour.
    return res.status(502).json({
      error: 'Stripe could not start setup right now. Try again shortly.',
      code: e instanceof StripeError ? e.code ?? null : null,
    });
  }
}
