-- ─────────────────────────────────────────────────────────────
-- KYRO — 0008: usage signal and brand feedback on submissions
--
-- Changes what a submission means.
--
-- Before: a creator uploaded, then waited. Nothing happened until a brand
-- approved it, and a pass was silent. The creator learned nothing and could
-- not act.
--
-- After: creators upload freely to campaigns they are on. Every video shows
-- whether the brand USED it, and a pass carries a written reason plus what
-- the brand wants to see next. The brand still decides what runs, because
-- the ads run in their ad account and they pay for them. What they no longer
-- control is whether the creator can keep working.
--
-- No new enum values. submission_status already covers the three states a
-- creator cares about, and adding enum labels cannot run inside a
-- transaction, which makes it a poor fit for a dashboard-run migration:
--   submitted / in_review        → awaiting a decision
--   approved  / live             → in use
--   rejected  / revision_requested → not used, see brand_note
--
-- Run AFTER 0007_creator_submissions_payouts.sql. Idempotent.
-- ─────────────────────────────────────────────────────────────

alter table public.submissions add column if not exists brand_note text;
alter table public.submissions add column if not exists decided_at timestamptz;

comment on column public.submissions.brand_note is
  'The brand''s written reason when a video is not used, and what they want to see in the next one. Visible to the creator. This is the whole point of the feedback loop: a pass without a reason teaches the creator nothing.';

comment on column public.submissions.decided_at is
  'When the brand last set a usage decision on this video. Null means they have not looked yet.';

-- Creators open "what changed on my videos" far more often than anything
-- else, so index the order that screen reads in.
create index if not exists submissions_creator_decided_idx
  on public.submissions(creator_id, decided_at desc nulls first);

-- A brand reviewing a campaign wants the undecided ones first.
create index if not exists submissions_campaign_pending_idx
  on public.submissions(campaign_id, submitted_at)
  where decided_at is null;
