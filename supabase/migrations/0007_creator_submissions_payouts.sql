-- ─────────────────────────────────────────────────────────────
-- KYRO — 0007: creator video uploads and payout details
--
-- Two things the creator side needs before it can do anything real:
--
--   1. Somewhere to put a video. There was no storage bucket at all, so
--      "Submit New Video" had nowhere to submit to.
--   2. Payout details to display. `trolley_recipient_id` and
--      `tax_form_status` already existed, but nothing recorded WHICH bank
--      account is on file or WHEN the tax form was completed, so a creator
--      could never see what KYRO would pay them into.
--
-- Deliberately NOT added: account and routing numbers. KYRO must never hold
-- them. The payout provider holds the account and gives us a recipient id;
-- we keep the bank name and last four purely so a creator can recognise the
-- account on screen. Storing the full number would turn this table into a
-- target and buy us nothing, since we cannot move money with it anyway.
--
-- Run AFTER 0006_expiring_tokens.sql. Idempotent.
-- ─────────────────────────────────────────────────────────────

-- ── Payout details on the creator ────────────────────────────
alter table public.creators add column if not exists payout_bank_name  text;
alter table public.creators add column if not exists payout_bank_last4 text;
alter table public.creators add column if not exists payout_updated_at timestamptz;
alter table public.creators add column if not exists tax_form_submitted_at timestamptz;

-- Four digits, or nothing. Stops a full account number being pasted in.
do $$ begin
  alter table public.creators
    add constraint creators_payout_last4_chk
    check (payout_bank_last4 is null or payout_bank_last4 ~ '^[0-9]{4}$');
exception when duplicate_object then null; end $$;

comment on column public.creators.payout_bank_last4 is
  'Last four digits only, for display. KYRO never stores a full account or routing number; the payout provider holds those against trolley_recipient_id.';

comment on column public.creators.tax_form_submitted_at is
  'When the creator completed their tax form (W-9 / W-8BEN). Read with tax_form_status.';

-- ── Video storage ────────────────────────────────────────────
-- Private bucket. Videos are licensed work, not public assets, so reading
-- one requires a signed URL rather than a guessable public path.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'submissions',
  'submissions',
  false,
  524288000, -- 500 MB
  array['video/mp4','video/quicktime','video/webm','video/x-m4v']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Objects are stored as <creator_id>/<uuid>.<ext>. The first path segment is
-- the creator, which is what these policies key off.
drop policy if exists submissions_upload_own on storage.objects;
create policy submissions_upload_own on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'submissions'
    and exists (
      select 1 from public.creators c
      where c.user_id = auth.uid()
        and c.id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists submissions_update_own on storage.objects;
create policy submissions_update_own on storage.objects for update
  to authenticated
  using (
    bucket_id = 'submissions'
    and exists (
      select 1 from public.creators c
      where c.user_id = auth.uid()
        and c.id::text = (storage.foldername(name))[1]
    )
  );

-- Reading is open to signed-in users of the app. The bucket is private, so a
-- signed URL is still required; this only decides who may mint one.
-- Narrowing to "the creator who owns it and the brand whose campaign it was
-- submitted to" belongs with the brand review flow, which does not exist yet.
drop policy if exists submissions_read_signed_in on storage.objects;
create policy submissions_read_signed_in on storage.objects for select
  to authenticated
  using (bucket_id = 'submissions');
