-- ═══════════════════════════════════════════════════════════════
-- KYRO, 0048: who may take a creator's video, and a record of who did
--
-- The read policy on the submissions bucket said this, and had said it
-- since migration 0007:
--
--   using (bucket_id = 'submissions')
--
-- Every signed-in account on KYRO could mint a signed URL for every video
-- in it. Not only the brand that never signed the Content Usage Rights: any
-- creator, for any other creator's work, on any brand's campaign. The policy
-- carried a comment saying narrowing it "belongs with the brand review flow,
-- which does not exist yet". That flow exists now.
--
-- Paths are creator-id plus a random UUID, so this was hard to exploit by
-- guessing. It was not hard to exploit by reading a path, and a creator's
-- unreleased video is exactly the asset they are trusting KYRO with.
--
-- After this, a video can be read by:
--
--   · the creator who uploaded it, always, it is theirs
--   · the brand whose campaign it was submitted to, and only while that
--     brand holds a current signature on the Content Usage Rights
--   · admins
--
-- The signature condition is the point. A brand that has not agreed what it
-- may do with a creator's work cannot obtain the work. The agreement stops
-- being a checkbox before launch and becomes the thing that unlocks the
-- asset.
--
-- Note this gates playback as well as download, because at the storage layer
-- they are the same signed URL and there is no honest way to separate them.
-- That is not a loss: migration 0039 already blocks a campaign from going
-- live unsigned, so any brand with submissions to look at has signed.
--
-- Second half: a downloads log. A contract that nobody can show was honoured
-- is an argument, not a protection. This records who took which video and
-- when, which is the thing you actually produce if a creator ever asks where
-- their video ended up.
--
-- Run in the Supabase SQL editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════

/* ─────────────────────────────────────────────────────────────
   1. Only the people entitled to the file
   ───────────────────────────────────────────────────────────── */

drop policy if exists submissions_read_signed_in on storage.objects;
drop policy if exists submissions_read_entitled on storage.objects;

create policy submissions_read_entitled on storage.objects for select
  to authenticated
  using (
    bucket_id = 'submissions'
    and (
      public.is_admin()

      -- The creator who uploaded it. Theirs, unconditionally.
      or exists (
        select 1
          from public.submissions s
          join public.creators c on c.id = s.creator_id
         where s.video_url = storage.objects.name
           and c.user_id = auth.uid())

      -- The brand it was submitted to, while they hold a current signature.
      or exists (
        select 1
          from public.submissions s
          join public.campaigns ca on ca.id = s.campaign_id
          join public.brands b     on b.id = ca.brand_id
         where s.video_url = storage.objects.name
           and b.owner_user_id = auth.uid()
           and public.has_current_agreement('content_usage_rights', b.id, null))
    )
  );

/* ─────────────────────────────────────────────────────────────
   2. A record of who took what
   ───────────────────────────────────────────────────────────── */

create table if not exists public.content_downloads (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  -- Who took it. Kept even if the account is later removed, because the
  -- record of a download is not the downloader's to erase.
  user_id       uuid references auth.users(id) on delete set null,
  user_email    text,
  brand_id      uuid references public.brands(id) on delete set null,
  downloaded_at timestamptz not null default now()
);

create index if not exists content_downloads_submission_idx
  on public.content_downloads(submission_id, downloaded_at desc);

comment on table public.content_downloads is
  'One row per time a video file was taken from KYRO. Append only: a brand cannot edit or delete its own record, and a creator can read the log for their own videos.';

alter table public.content_downloads enable row level security;

-- The creator whose video it is, the brand that took it, and admins.
drop policy if exists content_downloads_read on public.content_downloads;
create policy content_downloads_read on public.content_downloads for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.submissions s
        join public.creators c on c.id = s.creator_id
       where s.id = content_downloads.submission_id and c.user_id = auth.uid())
    or exists (
      select 1 from public.brands b
       where b.id = content_downloads.brand_id and b.owner_user_id = auth.uid())
  );

-- Anyone who can read the file may record that they took it. They cannot
-- record it as somebody else: the trigger below overwrites who.
drop policy if exists content_downloads_log on public.content_downloads;
create policy content_downloads_log on public.content_downloads for insert
  with check (auth.uid() is not null);

-- Append only. A log a brand can quietly edit is not a log.
revoke update, delete on public.content_downloads from anon, authenticated;

/**
 * Stamp the downloader from the session, never from the request body.
 *
 * Same reasoning as the message sender trigger: the client says which video,
 * everything about who comes from the token.
 */
create or replace function public.stamp_content_download()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.user_id := auth.uid();

  select p.email into new.user_email from public.profiles p where p.id = auth.uid();

  select b.id into new.brand_id
    from public.brands b
   where b.owner_user_id = auth.uid()
   limit 1;

  new.downloaded_at := now();
  return new;
end;
$$;

drop trigger if exists content_downloads_stamp on public.content_downloads;
create trigger content_downloads_stamp
  before insert on public.content_downloads
  for each row execute function public.stamp_content_download();

-- ── What landed ──────────────────────────────────────────────
select
  (select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'submissions_read_entitled')                    as new_read_policy,
  (select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'submissions_read_signed_in')                   as old_open_policy_gone,
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'content_downloads') as downloads_table,
  (select count(*) from pg_trigger
    where tgname = 'content_downloads_stamp' and not tgisinternal)      as stamp_trigger;
