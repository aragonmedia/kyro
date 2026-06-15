/**
 * Kyro — Shared Type Definitions
 *
 * These types describe the shape of every entity that flows through Kyro.
 * Used by App UI, lib/api.ts, lib/meta.ts, lib/supabase.ts, and the future
 * Supabase Edge Functions + Vercel API routes.
 *
 * Keep this file the single source of truth for entity shape.
 */

export type Role = 'admin' | 'brand' | 'creator';

export type CampaignStatus = 'draft' | 'pending_fund' | 'live' | 'paused' | 'complete' | 'archived';
export type SubmissionStatus = 'submitted' | 'in_review' | 'approved' | 'revision_requested' | 'live' | 'rejected';
export type PayoutStatus = 'pending' | 'processing' | 'paid' | 'failed';
export type ApplicationStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';
export type IntakePath = 'marketplace' | 'curated' | 'invite';
export type CommissionType = 'percent_spend' | 'per_conversion' | 'hybrid' | 'retainer';

/** Money is always stored as integer cents to avoid float drift. */
export type Cents = number;

export interface UserProfile {
  id: string;            // uuid (Supabase auth.users.id)
  role: Role;
  name: string;
  email: string;
  avatarUrl?: string;
  createdAt: string;     // ISO timestamp
  status: 'active' | 'pending' | 'suspended';
}

export interface Brand {
  id: string;
  ownerUserId: string;
  name: string;
  handle: string;
  logoUrl: string;
  tagline: string;
  category: string;
  metaAdAccountId?: string;     // populated when Meta is connected
  approvalStatus: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export interface Creator {
  id: string;
  userId: string;
  handle: string;
  bio: string;
  location?: string;
  niche: string[];
  social: {
    instagram?: { handle: string; followers: number };
    tiktok?: { handle: string; followers: number };
    youtube?: { handle: string; subscribers: number };
  };
  trolleyRecipientId?: string;  // populated when Trolley onboarding done
  taxFormStatus: 'not_collected' | 'pending' | 'complete';
  stats: {
    campaigns: number;
    totalEarnedCents: Cents;
    avgRoasForBrands: number;
    ordersDriven: number;
  };
}

export interface Campaign {
  id: string;
  brandId: string;
  name: string;
  brief: string;
  status: CampaignStatus;
  intakePaths: IntakePath[];      // which paths the campaign accepts
  commission: {
    type: CommissionType;
    percentSpend?: number;        // 0..1
    perConversionCents?: Cents;
    retainerCents?: Cents;
  };
  poolTargetCents: Cents;
  poolBalanceCents: Cents;          // remaining; auto-decremented as creators accrue
  spentCents: Cents;
  startDate: string;
  endDate?: string;
  deliverableSpec: string;
}

export interface Application {
  id: string;
  campaignId: string;
  creatorId: string;
  status: ApplicationStatus;
  intakePath: IntakePath;
  message?: string;
  createdAt: string;
}

export interface Submission {
  id: string;
  campaignId: string;
  creatorId: string;
  videoUrl: string;             // Supabase Storage path
  thumbnailUrl: string;
  status: SubmissionStatus;
  metaAdId?: string;            // populated once pushed to Meta
  metaCreativeId?: string;
  aiTags: string[];             // angle, persona, creative DNA — populated by AI tagging job
  submittedAt: string;
  approvedAt?: string;
}

/** Source of truth for money + earnings flow. Every credit/debit writes a row. */
export interface LedgerEntry {
  id: string;
  type:
    | 'pool_credit'              // brand funded pool (Square)
    | 'earnings_accrual'         // creator earned from a submission's ad
    | 'payout_debit'             // Trolley paid a creator
    | 'refund'
    | 'adjustment';
  creatorId?: string;
  brandId?: string;
  campaignId?: string;
  submissionId?: string;
  amountCents: Cents;            // positive = credit, negative = debit
  balanceAfterCents: Cents;      // running balance after this entry
  refExternalId?: string;        // Square invoice id, Trolley batch id, etc.
  notes?: string;
  createdAt: string;
}

export interface Payout {
  id: string;
  creatorId: string;
  trolleyBatchId: string;
  amountCents: Cents;
  status: PayoutStatus;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
  completedAt?: string;
}

/** Pulled from Meta Ads Insights API. One row per (submission, snapshot_at). */
export interface MetaInsightsSnapshot {
  id: string;
  submissionId: string;
  metaAdId: string;
  snapshotAt: string;
  impressions: number;
  clicks: number;
  spendCents: Cents;
  conversions: number;
  conversionValueCents: Cents;
  roas: number;                  // conversionValue / spend
  cpa: number;                   // spend / conversions
}

/** Notification surface — both email and in-app. */
export interface Notification {
  id: string;
  userId: string;
  type:
    | 'submission_approved'
    | 'submission_needs_revision'
    | 'video_live'
    | 'earnings_milestone'
    | 'payout_sent'
    | 'pool_low'
    | 'whitelisting_required'
    | 'message_received';
  title: string;
  body: string;
  ctaUrl?: string;
  readAt?: string;
  createdAt: string;
}
