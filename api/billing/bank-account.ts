/**
 * POST /api/billing/bank-account
 *
 * Stores a brand's ACH billing details.
 *
 * Mirrors /api/payout/bank-account and exists for the same reason: the
 * browser must never write bank numbers to Postgres. Numbers arrive over
 * TLS, are sealed with AES-256-GCM, and land in brand_bank_accounts, which
 * has RLS on with zero policies and no grants to anon or authenticated.
 *
 * Cards are NOT handled here and never will be. A card number has to be
 * tokenised by the payment processor in their own hosted field; routing one
 * through KYRO would pull this codebase into PCI scope for no benefit.
 *
 * Body: { accountHolder, bankName?, routingNumber, accountNumber }
 * Header: Authorization: Bearer <supabase access token>
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { serviceClient } from '../_lib/supabase.js';
import { seal } from '../_lib/crypto.js';

const digitsOnly = (v: unknown): string => String(v ?? '').replace(/\D/g, '');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Not signed in.' });

    const sb = serviceClient();
    const { data: userData, error: userError } = await sb.auth.getUser(token);
    const userId = userData?.user?.id;
    if (userError || !userId) return res.status(401).json({ error: 'Not signed in.' });

    // Brand resolved from the token, never from the body, or any signed-in
    // user could point another brand's billing at their own account.
    const { data: brand, error: brandError } = await sb
      .from('brands')
      .select('id')
      .eq('owner_user_id', userId)
      .maybeSingle();

    if (brandError) return res.status(500).json({ error: 'Could not load your brand.' });
    if (!brand) return res.status(403).json({ error: 'This account does not own a brand.' });

    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) ?? {};
    const accountHolder = String(body.accountHolder ?? '').trim();
    const bankName = String(body.bankName ?? '').trim() || null;
    const routing = digitsOnly(body.routingNumber);
    const account = digitsOnly(body.accountNumber);

    if (!accountHolder) return res.status(400).json({ error: 'Enter the name on the account.' });
    if (routing.length !== 9) return res.status(400).json({ error: 'A US routing number is 9 digits.' });
    if (account.length < 4 || account.length > 17) {
      return res.status(400).json({ error: 'Enter the full account number.' });
    }

    const r = seal(routing);
    const a = seal(account);

    const { error: saveError } = await sb.from('brand_bank_accounts').upsert(
      {
        brand_id: brand.id,
        account_holder: accountHolder,
        bank_name: bankName,
        routing_last4: routing.slice(-4),
        account_last4: account.slice(-4),
        routing_ct: r.ct, routing_iv: r.iv, routing_tag: r.tag,
        account_ct: a.ct, account_iv: a.iv, account_tag: a.tag,
      },
      { onConflict: 'brand_id' }
    );

    if (saveError) {
      console.error('[kyro] could not store brand bank account', saveError);
      return res.status(500).json({ error: 'Could not save your billing account.' });
    }

    const { error: mirrorError } = await sb
      .from('brand_billing')
      .update({
        ach_bank_name: bankName,
        ach_last4: account.slice(-4),
        ach_updated_at: new Date().toISOString(),
      })
      .eq('brand_id', brand.id);

    if (mirrorError) console.error('[kyro] could not mirror brand billing display fields', mirrorError);

    return res.status(200).json({ ok: true, bankName, accountLast4: account.slice(-4) });
  } catch (e) {
    console.error('[kyro] billing/bank-account failed', e);
    return res.status(500).json({ error: 'Something went wrong saving your billing account.' });
  }
}
