-- ─────────────────────────────────────────────────────────────
-- KYRO — 0012: campaign cover images
--
-- campaigns.cover_url has existed since 0002 and nothing ever wrote to it, so
-- every campaign card on the creator side fell back to a stock photo that had
-- nothing to do with the brand. A creator deciding which campaign to make a
-- video for is looking at the product; a generic image is worse than none.
--
-- This bucket is PUBLIC, unlike `submissions`. A cover is marketing art the
-- brand wants seen, it is shown to every creator browsing, and signing each
-- URL would mean a round trip per card for no benefit. Creator video stays
-- private because it is licensed work; a cover is not.
--
-- Run AFTER 0011_brand_bank_accounts.sql. Idempotent.
-- ─────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'campaign-covers',
  'campaign-covers',
  true,
  5242880, -- 5 MB; this is a card image, not a hero render
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Objects are <brand_id>/<uuid>.<ext>. First path segment is the brand, which
-- is what these policies check.
drop policy if exists covers_write_own on storage.objects;
create policy covers_write_own on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'campaign-covers'
    and exists (
      select 1 from public.brands b
      where b.owner_user_id = auth.uid()
        and b.id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists covers_update_own on storage.objects;
create policy covers_update_own on storage.objects for update
  to authenticated
  using (
    bucket_id = 'campaign-covers'
    and exists (
      select 1 from public.brands b
      where b.owner_user_id = auth.uid()
        and b.id::text = (storage.foldername(name))[1]
    )
  );

-- Public bucket, so reads are open. Stated explicitly rather than relying on
-- the bucket flag alone, because the flag is easy to flip by accident.
drop policy if exists covers_read_public on storage.objects;
create policy covers_read_public on storage.objects for select
  to public
  using (bucket_id = 'campaign-covers');
