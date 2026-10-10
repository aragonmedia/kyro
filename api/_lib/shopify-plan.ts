/**
 * Keeping KYRO's copy of the merchant's Shopify plan current.
 *
 * Shopify owns the charge. KYRO uses Managed Pricing, so the plan and its
 * usage meter live in the Dev Dashboard and the merchant approves them on
 * Shopify's own page. Nothing here creates a subscription, which is the point:
 * App Store rule 1.2.1 requires that Shopify, not the app, does the charging.
 *
 * This module only records what Shopify reports, so that KYRO can send a
 * merchant who has not chosen a plan to the page where they can choose one.
 */

import { serviceClient } from './supabase.js';
import { fetchPlanState, pricingPlansUrl, type ShopifyPlanState } from './shopify-admin.js';

type Db = ReturnType<typeof serviceClient>;

export interface PlanSync extends ShopifyPlanState {
  /** True once Shopify reports an approved subscription for this store. */
  active: boolean;
  /** Null when Shopify did not return a handle, so no link can be built. */
  pricingUrl: string | null;
}

/**
 * Read the store's subscription, write it to the brand, and say where the
 * merchant should go if they have not approved one.
 *
 * Returns null rather than throwing when Shopify cannot be reached. Every
 * caller is in the middle of something the merchant cares about more than
 * this, such as finishing an install, and none of them should fail over it.
 */
export async function syncPlan(
  sb: Db,
  brandId: string,
  shop: string,
  token: string
): Promise<PlanSync | null> {
  let state: ShopifyPlanState;
  try {
    state = await fetchPlanState(shop, token);
  } catch (e) {
    console.error('[kyro] could not read the shopify plan', e);
    return null;
  }

  const { error } = await sb
    .from('brands')
    .update({
      shopify_app_handle: state.appHandle,
      shopify_plan_name: state.name,
      shopify_plan_status: state.status,
      shopify_plan_test: state.test,
      shopify_trial_ends_at: state.trialEndsAt,
      shopify_plan_checked_at: new Date().toISOString(),
    })
    .eq('id', brandId);

  if (error) console.error('[kyro] could not store the shopify plan', error);

  return {
    ...state,
    active: state.status === 'ACTIVE',
    pricingUrl: state.appHandle ? pricingPlansUrl(shop, state.appHandle) : null,
  };
}
