/**
 * Kyro — API Surface
 *
 * Every button-handler in App.tsx routes through here. Currently routes to
 * mock implementations (mockApi). When V1 wiring lands, the same function
 * signatures point to real Supabase + serverless API calls — UI doesn't change.
 *
 * Pattern: optimistic UI, console.log every event, no-throw fallbacks so the
 * demo never breaks.
 */

import { isSupabaseConfigured, getSupabase } from './supabase';
import * as meta from './meta';
import type {
  Role,
  Campaign,
  Submission,
  Application,
  Payout,
  IntakePath,
  Cents,
} from './types';

/* ─────────────────────────────────────────────────────────────
   Event logger — visible in browser console during demo
   ───────────────────────────────────────────────────────────── */
function event(name: string, payload?: unknown) {
  // eslint-disable-next-line no-console
  console.log(`[kyro:event] ${name}`, payload ?? '');
}

/* ─────────────────────────────────────────────────────────────
   Mock API — used in demo mode (no Supabase keys)
   ───────────────────────────────────────────────────────────── */
export const mockApi = {
  logEvent: (name: string, payload?: unknown) => event(name, payload),

  /* ─── Auth ───────────────────────────────────────── */
  signIn: async (email: string, role: Role) => {
    event('auth.sign_in', { email, role });
    return { success: true };
  },
  signOut: async () => {
    event('auth.sign_out');
    return { success: true };
  },

  /* ─── Campaign lifecycle ─────────────────────────── */
  createCampaign: async (campaign: Partial<Campaign>) => {
    event('campaign.create', campaign);
    return { success: true, id: 'demo-campaign-' + Date.now() };
  },
  fundCampaign: async (campaignId: string) => {
    event('campaign.fund_via_square', { campaignId });
    // V1: open Square Hosted Invoice or in-app card flow
    return { success: true, squareInvoiceId: 'inv_demo' };
  },
  pauseCampaign: async (campaignId: string) => {
    event('campaign.pause', { campaignId });
    return { success: true };
  },

  /* ─── Applications + invites ─────────────────────── */
  applyToCampaign: async (campaignId: string) => {
    event('application.create', { campaignId, intakePath: 'marketplace' });
    return { success: true };
  },
  inviteCreatorToCampaign: async (campaignId: string, creatorId: string) => {
    event('application.create', { campaignId, creatorId, intakePath: 'invite' });
    return { success: true };
  },
  proposeMatch: async (curationId: string) => {
    event('curation.propose_match', { curationId });
    return { success: true };
  },

  /* ─── Submissions ────────────────────────────────── */
  openSubmissionUploader: () => {
    event('submission.upload_modal_open');
    // V1: open file picker, upload to Supabase Storage, create submission row
  },
  submitVideo: async (campaignId: string, fileName: string) => {
    event('submission.create', { campaignId, fileName });
    return { success: true, submissionId: 'sub_' + Date.now() };
  },
  approveSubmission: async (submissionId: string) => {
    event('submission.approve', { submissionId });
    // V1: this triggers meta.pushSubmissionToMeta in a serverless function
    return { success: true };
  },
  requestRevision: async (submissionId: string, note: string) => {
    event('submission.request_revision', { submissionId, note });
    return { success: true };
  },
  rejectSubmission: async (submissionId: string, reason: string) => {
    event('submission.reject', { submissionId, reason });
    return { success: true };
  },

  /* ─── Meta integration (delegates to lib/meta.ts) ── */
  pushToMeta: async (submissionId: string, videoUrl: string, campaignName: string) => {
    event('meta.push_submission', { submissionId });
    return meta.pushSubmissionToMeta(
      { accessToken: 'demo', adAccountId: 'demo' },
      { id: submissionId, videoUrl, campaignName }
    );
  },
  fetchInsights: async (metaAdId: string, submissionId: string) => {
    event('meta.fetch_insights', { metaAdId });
    return meta.fetchAdInsights(
      { accessToken: 'demo', adAccountId: 'demo' },
      metaAdId,
      submissionId
    );
  },
  connectMetaAdAccount: () => {
    event('meta.oauth.start');
    const url = meta.buildOAuthUrl(`${window.location.origin}/api/meta/callback`, 'demo-state');
    // V1: window.location.href = url;
    console.log('Would redirect to:', url);
  },

  /* ─── Payouts (Trolley) ───────────────────────────── */
  schedulePayout: async (creatorId: string, amountCents: Cents) => {
    event('payout.schedule', { creatorId, amountCents });
    return { success: true, trolleyBatchId: 'btch_demo_' + Date.now() };
  },

  /* ─── Sharing ─────────────────────────────────────── */
  shareProfile: (profileId: string) => {
    event('profile.share', { profileId });
    if (navigator.clipboard) {
      const url = `${window.location.origin}/profile/${profileId}`;
      navigator.clipboard.writeText(url);
    }
  },
};

/* ─────────────────────────────────────────────────────────────
   Real API (Supabase-backed) — used when keys are configured
   ───────────────────────────────────────────────────────────── */
export const realApi = {
  isConfigured: () => isSupabaseConfigured(),

  createCampaign: async (campaign: Partial<Campaign>) => {
    const sb = getSupabase();
    if (!sb) return mockApi.createCampaign(campaign);
    const { data, error } = await sb.from('campaigns').insert(campaign).select().single();
    return { success: !error, error, data };
  },

  listCampaigns: async (brandId?: string) => {
    const sb = getSupabase();
    if (!sb) return { data: [], error: null };
    let q = sb.from('campaigns').select('*');
    if (brandId) q = q.eq('brand_id', brandId);
    const { data, error } = await q;
    return { data, error };
  },

  listApplications: async (campaignId: string) => {
    const sb = getSupabase();
    if (!sb) return { data: [], error: null };
    const { data, error } = await sb
      .from('applications')
      .select('*, creator:creators(*)')
      .eq('campaign_id', campaignId);
    return { data, error };
  },

  createApplication: async (app: Partial<Application>) => {
    const sb = getSupabase();
    if (!sb) return mockApi.applyToCampaign(app.campaignId || '');
    const { data, error } = await sb.from('applications').insert(app).select().single();
    return { success: !error, error, data };
  },

  createSubmission: async (sub: Partial<Submission>) => {
    const sb = getSupabase();
    if (!sb) return { success: true, error: null };
    const { data, error } = await sb.from('submissions').insert(sub).select().single();
    return { success: !error, error, data };
  },

  listPayouts: async (creatorId: string) => {
    const sb = getSupabase();
    if (!sb) return { data: [], error: null };
    const { data, error } = await sb
      .from('payouts')
      .select('*')
      .eq('creator_id', creatorId)
      .order('created_at', { ascending: false });
    return { data, error };
  },

  insertPayout: async (payout: Partial<Payout>) => {
    const sb = getSupabase();
    if (!sb) return { success: true, error: null };
    const { data, error } = await sb.from('payouts').insert(payout).select().single();
    return { success: !error, error, data };
  },
};

/* ─────────────────────────────────────────────────────────────
   Unified entry point — picks real or mock based on config
   ───────────────────────────────────────────────────────────── */
export const api = {
  ...mockApi,
  // Real implementations override mocks when Supabase is configured.
  // Add overrides here as V1 features land:
  createCampaign: async (c: Partial<Campaign>) =>
    isSupabaseConfigured() ? realApi.createCampaign(c) : mockApi.createCampaign(c),
  applyToCampaign: async (campaignId: string) =>
    isSupabaseConfigured()
      ? realApi.createApplication({ campaignId, intakePath: 'marketplace' as IntakePath })
      : mockApi.applyToCampaign(campaignId),
};
