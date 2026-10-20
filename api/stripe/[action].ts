/**
 * /api/stripe/:action
 *
 *   POST /api/stripe/connect   start or resume a creator's Express onboarding
 *   GET  /api/stripe/status    what Stripe currently says about that creator
 *   POST /api/stripe/setup     brand payment method (unchanged, see _lib)
 *
 * One function for three routes, because Vercel's Hobby plan caps a deployment
 * at twelve and the brand setup route already held a slot. The public URLs are
 * unchanged.
 *
 * Nothing here moves money. Onboarding has to finish, and Stripe has to say
 * payouts are enabled, before a transfer is possible at all.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { serviceClient } from '../_lib/supabase.js';
import { stripeConfig } from '../_lib/env.js';
import {
  StripeError,
  createAccountLink,
  createRecipientAccount,
  fetchAccount,
  readReadiness,
  type StripeAccountV2,
} from '../_lib/stripe.js';
import brandSetup from '../_lib/stripe-brand-setup.js';
import { readSavedMethod } from '../_lib/stripe-billing.js';

type Db = ReturnType<typeof serviceClient>;

interface CreatorRow {
  id: string;
  handle: string | null;
  stripe_account_id: string | null;
}

/**
 * The creator making the request, resolved from their own token rather than
 * from anything in the body. A creator id in a request body is a suggestion,
 * not a fact.
 */
async function currentCreator(
  sb: Db,
  req: VercelRequest
): Promise<{ creator?: CreatorRow; email?: string | null; handle?: string | null; error?: string; status?: number }> {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return { error: 'Not signed in.', status: 401 };

  const { data: userData, error: userError } = await sb.auth.getUser(token);
  const userId = userData?.user?.id;
  if (userError || !userId) return { error: 'Not signed in.', status: 401 };

  const { data, error } = await sb
    .from('creators')
    .select('id, handle, stripe_account_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return { error: 'Could not read your creator profile.', status: 500 };
  if (!data) return { error: 'This account does not have a creator profile.', status: 403 };

  const row = data as CreatorRow;
  // Stripe surfaces display_name to the creator during onboarding, so their
  // own handle reads better there than a UUID.
  return { creator: row, email: userData.user?.email ?? null, handle: row.handle };
}

/** Write Stripe's answer onto the creator and hand back the shape the app uses. */
async function recordAccount(sb: Db, creatorId: string, account: StripeAccountV2) {
  const ready = readReadiness(account);

  const state = {
    stripe_account_id: ready.accountId,
    stripe_payouts_enabled: ready.transfersActive,
    // Recipient-only accounts never take payments, so this stays false by
    // design rather than by omission.
    stripe_charges_enabled: false,
    // v2 has no details_submitted flag. Nothing outstanding that blocks a
    // capability is the closest honest equivalent.
    stripe_details_submitted: ready.requirementsDue.length === 0,
    stripe_requirements_due: ready.requirementsDue,
    stripe_checked_at: new Date().toISOString(),
  };

  const { error } = await sb.from('creators').update(state).eq('id', creatorId);
  if (error) console.error('[kyro] could not store the stripe account state', error);

  return {
    connected: true,
    accountId: ready.accountId,
    payoutsEnabled: ready.transfersActive,
    detailsSubmitted: state.stripe_details_submitted,
    requirementsDue: ready.requirementsDue,
  };
}

/**
 * GET /api/stripe/method?brandId=…&session=cs_…
 *
 * Records the payment method a brand just saved, after reading the completed
 * Checkout session back from Stripe. A browser arriving at a success URL
 * proves nothing by itself, so the server asks Stripe what actually happened.
 */
async function brandMethod(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const brandId = typeof req.query.brandId === 'string' ? req.query.brandId : '';
  const sessionId = typeof req.query.session === 'string' ? req.query.session : '';
  if (!brandId || !sessionId) return res.status(400).json({ error: 'Missing brand or session.' });

  const auth = req.headers.authorization || '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!jwt) return res.status(401).json({ error: 'Not signed in.' });

  const sb = serviceClient();
  const { data: userData, error: userError } = await sb.auth.getUser(jwt);
  const userId = userData?.user?.id;
  if (userError || !userId) return res.status(401).json({ error: 'Not signed in.' });

  const { data: brand } = await sb
    .from('brands')
    .select('id, owner_user_id')
    .eq('id', brandId)
    .maybeSingle();
  if (!brand || brand.owner_user_id !== userId) {
    return res.status(403).json({ error: 'That brand is not yours.' });
  }

  try {
    const saved = await readSavedMethod(sessionId);
    if (!saved) {
      return res.status(200).json({ saved: false });
    }

    const update: Record<string, unknown> = {
      stripe_payment_method_id: saved.paymentMethodId,
      stripe_method_type: saved.type,
      stripe_method_brand: saved.brand,
      stripe_method_last4: saved.last4,
      stripe_method_at: new Date().toISOString(),
    };
    // ach_mandate_ref predates Stripe here and still gates paymentReady for
    // bank methods. Keep it in step rather than leaving it lying.
    if (saved.type === 'us_bank_account') update.ach_mandate_ref = saved.paymentMethodId;

    const { error } = await sb.from('brand_billing').update(update).eq('brand_id', brandId);
    if (error) {
      console.error('[kyro] could not store the brand payment method', error);
      return res.status(500).json({ error: 'Stripe saved your method but KYRO could not record it.' });
    }

    return res.status(200).json({
      saved: true,
      type: saved.type,
      brand: saved.brand,
      last4: saved.last4,
    });
  } catch (e) {
    if (e instanceof StripeError) {
      console.error('[kyro] stripe method read failed', e.code, e.message);
      return res.status(502).json({ error: 'Could not confirm that with Stripe. Try again shortly.' });
    }
    console.error('[kyro] stripe/method failed', e);
    return res.status(500).json({ error: 'Could not record your payment method.' });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.query.action;
  const action = Array.isArray(raw) ? raw[0] : raw;

  if (action === 'setup') return brandSetup(req, res);
  if (action === 'method') return brandMethod(req, res);

  if (action !== 'connect' && action !== 'status') {
    return res.status(404).json({ error: 'Not found.' });
  }

  try {
    const sb = serviceClient();
    const who = await currentCreator(sb, req);
    if (who.error || !who.creator) {
      return res.status(who.status ?? 400).json({ error: who.error });
    }
    const creator = who.creator;

    if (action === 'status') {
      if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method not allowed.' });
      }
      if (!creator.stripe_account_id) {
        return res.status(200).json({ connected: false, payoutsEnabled: false, requirementsDue: [] });
      }
      // Read from Stripe rather than trusting the stored copy. Verification
      // finishes on Stripe's clock, not on ours, and a creator refreshing this
      // page is usually asking precisely whether that has happened yet.
      const account = await fetchAccount(creator.stripe_account_id);
      return res.status(200).json(await recordAccount(sb, creator.id, account));
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed.' });
    }

    let accountId = creator.stripe_account_id;
    let alreadyActive = false;

    if (!accountId) {
      const created = await createRecipientAccount(creator.id, who.email, who.handle);
      accountId = created.id;
      const { error } = await sb
        .from('creators')
        .update({ stripe_account_id: accountId, stripe_checked_at: new Date().toISOString() })
        .eq('id', creator.id);
      // Losing this write would orphan a Stripe account and make the next
      // click create a second one, so it fails loudly rather than carrying on.
      if (error) {
        console.error('[kyro] could not store the new stripe account', error);
        return res.status(500).json({ error: 'Could not save your payout account. Nothing was charged.' });
      }
    } else {
      // A creator who is already payable and comes back is editing, not
      // onboarding. Stripe shows a different flow for each.
      const existing = await fetchAccount(accountId);
      alreadyActive = readReadiness(existing).transfersActive;
    }

    const { refreshUrl, returnUrl } = stripeConfig();
    const link = await createAccountLink(
      accountId,
      refreshUrl,
      returnUrl,
      alreadyActive ? 'account_update' : 'account_onboarding'
    );
    return res.status(200).json({ url: link.url });
  } catch (e) {
    if (e instanceof StripeError) {
      console.error('[kyro] stripe error', e.code, e.message);
      return res.status(502).json({ error: 'Stripe could not complete that right now. Try again shortly.' });
    }
    console.error('[kyro] stripe route failed', e);
    return res.status(500).json({ error: 'Something went wrong setting up payouts.' });
  }
}
