-- ═══════════════════════════════════════════════════════════════
-- KYRO, 0039: nothing moves without a signature
--
-- 0038 made signing possible. This makes it matter.
--
--   A campaign cannot go live until the brand has signed the current
--   Content Usage Rights. That document is what gives the brand any right
--   at all to run a creator's video, so a campaign that recruits creators
--   before it exists is a campaign collecting work nobody is licensed to use.
--
--   A creator's share is held until they have signed the current Creator
--   Operations and Commission Agreement, alongside the two holds that were
--   already there: a Stripe account that can receive, and tax details KYRO
--   can report against.
--
-- Both are enforced in the database rather than in a screen. The campaign
-- status is updated straight from the browser under row-level security, so a
-- check in React is a check anyone can skip with one API call, and the payout
-- planner is already SQL.
--
-- Which version counts lives in a table rather than in this file, because
-- version 1.1 of a document is a different agreement from version 1.0 and
-- bumping it should not need a migration. Keep public.required_agreements in
-- step with shared/agreements.ts: the table decides what is enforced, the
-- registry decides what is shown, and they describe the same thing.
--
-- Run in the Supabase SQL editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Which version is current ──────────────────────────────
create table if not exists public.required_agreements (
  doc_type   text primary key,
  version    text not null,
  updated_at timestamptz not null default now()
);

comment on table public.required_agreements is
  'The version of each document currently required. Must match shared/agreements.ts. Changing a version here asks everyone to sign again, which is the point: a new version is a new agreement.';

insert into public.required_agreements (doc_type, version) values
  ('content_usage_rights', '1.0'),
  ('creator_agreement',    '1.1')
on conflict (doc_type) do update
  set version = excluded.version, updated_at = now();

alter table public.required_agreements enable row level security;

-- Everyone may read what is required of them. Nobody may edit it from a
-- browser; the service role bypasses RLS and is the only writer.
drop policy if exists required_agreements_read on public.required_agreements;
create policy required_agreements_read on public.required_agreements
  for select using (true);

revoke insert, update, delete on public.required_agreements from anon, authenticated;

/**
 * Has this subject signed the current version of a document?
 *
 * Security definer so the answer does not depend on whether the caller can
 * see the agreements row, which a creator cannot for a brand and a brand
 * cannot for a creator.
 */
create or replace function public.has_current_agreement(p_doc_type text, p_brand_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.agreements a
      join public.required_agreements r
        on r.doc_type = a.doc_type
       and r.version  = a.version
     where a.doc_type = p_doc_type
       and (
         (p_brand_id is not null and a.brand_id = p_brand_id)
         or (p_user_id is not null and a.brand_id is null and a.user_id = p_user_id)
       )
  );
$$;

grant execute on function public.has_current_agreement(text, uuid, uuid) to anon, authenticated, service_role;

-- ── 2. A campaign cannot go live unsigned ────────────────────
create or replace function public.require_brand_agreement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only the moment of going live. Editing a campaign that is already live,
  -- pausing it, or archiving it are not this check's business.
  if new.status = 'live'
     and (tg_op = 'INSERT' or old.status is distinct from 'live')
     and not public.has_current_agreement('content_usage_rights', new.brand_id, null)
  then
    raise exception
      'Sign the KYRO Content Usage Rights in Settings before taking a campaign live.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists require_brand_agreement on public.campaigns;
create trigger require_brand_agreement
  before insert or update on public.campaigns
  for each row execute function public.require_brand_agreement();

-- ── 3. A creator is not paid unsigned ────────────────────────
-- Same function as 0032, with the agreement added to both halves: the
-- re-queue of a held share, and the reason a new share is held.
create or replace function public.plan_payment_run_payouts(p_run_id uuid)
returns setof public.payment_run_payouts
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A creator who has since finished whatever was holding them up gets their
  -- held share queued again. Three conditions now: a payout account Stripe
  -- will accept, tax details KYRO can report against, and their signature on
  -- the current agreement.
  update public.payment_run_payouts p
     set status = 'pending',
         stripe_account_id = c.stripe_account_id,
         failure_reason = null
    from public.creators c
   where p.run_id = p_run_id
     and p.status = 'skipped'
     and c.id = p.creator_id
     and c.stripe_account_id is not null
     and c.tax_form_status = 'complete'
     and public.has_current_agreement('creator_agreement', null, c.user_id);

  insert into public.payment_run_payouts (run_id, creator_id, amount_cents, stripe_account_id, status, failure_reason)
  select p_run_id,
         e.creator_id,
         sum(e.commission_cents)::bigint,
         c.stripe_account_id,
         case
           when c.stripe_account_id is null then 'skipped'
           when c.tax_form_status <> 'complete' then 'skipped'
           when not public.has_current_agreement('creator_agreement', null, c.user_id) then 'skipped'
           else 'pending'
         end,
         case
           when c.stripe_account_id is null
             then 'This creator has not set up payouts yet.'
           when c.tax_form_status <> 'complete'
             then 'This creator has not submitted their tax details yet.'
           when not public.has_current_agreement('creator_agreement', null, c.user_id)
             then 'This creator has not signed the creator agreement yet.'
         end
    from public.payment_run_items i
    join public.earnings e on e.id = i.earning_id
    join public.creators c on c.id = e.creator_id
   where i.run_id = p_run_id
   group by e.creator_id, c.stripe_account_id, c.tax_form_status, c.user_id
  having sum(e.commission_cents) > 0
  on conflict (run_id, creator_id) do nothing;

  return query
    select p.*
      from public.payment_run_payouts p
     where p.run_id = p_run_id
     order by p.amount_cents desc;
end;
$$;

revoke execute on function public.plan_payment_run_payouts(uuid) from public, anon, authenticated;
grant execute on function public.plan_payment_run_payouts(uuid) to service_role;

-- ── What landed ──────────────────────────────────────────────
-- required_rows should be 2, the trigger 1, and the planner should mention
-- the agreement check, which is read back from the stored definition rather
-- than assumed.
select
  (select count(*) from public.required_agreements)                       as required_rows,
  (select count(*) from pg_trigger
    where tgname = 'require_brand_agreement' and not tgisinternal)        as campaign_trigger,
  (select position('has_current_agreement' in pg_get_functiondef(p.oid)) > 0
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'plan_payment_run_payouts') as planner_checks_agreement;
