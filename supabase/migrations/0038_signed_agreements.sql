-- ═══════════════════════════════════════════════════════════════
-- KYRO, 0038: agreements that produce a document
--
-- `agreements` has recorded that somebody accepted something since 0003:
-- who, which document, which version, when, from what address. What it has
-- never held is the thing you would actually put in front of a person in a
-- dispute, which is a signed copy with their name on it.
--
-- Two documents need that now:
--
--   content_usage_rights  signed once per Brand, by a named representative
--   creator_agreement     signed once per Creator
--
-- How signing works, so the columns below make sense. The blank document is a
-- public asset under /agreements/. The signer reads that exact file in their
-- browser and types their name. The server fetches the same URL, hashes the
-- bytes it got, appends a signature page it generates itself, and stores the
-- result. So template_sha256 is the hash of the document the signer was
-- looking at, not of some copy on a server they never saw, and a changed
-- template produces a different hash rather than quietly re-signing people.
--
-- Nothing here is a qualified electronic signature. It is a typed name, a
-- timestamp, an address and a hash of the exact text accepted, which is the
-- ordinary shape of US e-signature evidence. Counsel should look at the flow
-- once, which is noted in the brief and is not a thing a migration can fix.
--
-- Run in the Supabase SQL editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. What a signature now records ──────────────────────────
alter table public.agreements
  -- Typed by the signer. This IS the signature.
  add column if not exists signer_name       text,
  -- Brand side only: who they are at the company.
  add column if not exists signer_title      text,
  add column if not exists signer_email      text,
  -- The entity being bound, which is not always what the brand is called in
  -- KYRO: "Jaje Health" on the platform may be "Jaje Health LLC" on paper.
  add column if not exists legal_entity_name text,
  -- Hash of the blank document they accepted, lowercase hex.
  add column if not exists template_sha256   text,
  -- Path in the `agreements` bucket. Null means recorded but never rendered,
  -- which is every row written before this migration.
  add column if not exists document_path     text;

comment on column public.agreements.signer_name is
  'The name the signer typed. This is the signature itself, not a label for one.';
comment on column public.agreements.template_sha256 is
  'SHA-256 of the blank document the signer was shown. A new template hashes differently rather than silently inheriting old acceptances.';
comment on column public.agreements.document_path is
  'Object path in the agreements bucket for the signed PDF. Null on rows written before 0038.';

-- One acceptance per subject per document per version. A brand re-signing
-- version 1.0 is a double click; a brand signing version 1.1 is a new row.
create unique index if not exists agreements_subject_doc_version_idx
  on public.agreements (coalesce(brand_id, user_id), doc_type, version);

create index if not exists agreements_doc_type_idx on public.agreements(doc_type);

-- ── 2. A browser cannot fabricate a signed record ────────────
-- Browsers still insert their own plain acceptances here (Terms, privacy),
-- and that stays. What they must not be able to do is write the fields that
-- make a row look like a rendered, hashed, stored document, because the
-- admin portal offers a download against exactly those fields.
create or replace function public.agreements_pin_signature()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.signer_name       := null;
    new.signer_title      := null;
    new.signer_email      := null;
    new.legal_entity_name := null;
    new.template_sha256   := null;
    new.document_path     := null;
    return new;
  end if;

  new.signer_name       := old.signer_name;
  new.signer_title      := old.signer_title;
  new.signer_email      := old.signer_email;
  new.legal_entity_name := old.legal_entity_name;
  new.template_sha256   := old.template_sha256;
  new.document_path     := old.document_path;
  return new;
end;
$$;

drop trigger if exists agreements_pin_signature on public.agreements;
create trigger agreements_pin_signature
  before insert or update on public.agreements
  for each row execute function public.agreements_pin_signature();

-- ── 3. Where the signed PDFs live ────────────────────────────
-- Private. A signed agreement carries a person's name, their title and the
-- entity they bound, and none of that belongs at a guessable public URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('agreements', 'agreements', false, 26214400, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Objects are stored as <brand_id|creator_id>/<doc_type>-<version>-<epoch>.pdf,
-- so the first path segment says whose document it is, the same way the
-- submissions bucket works.
drop policy if exists agreements_read_own on storage.objects;
create policy agreements_read_own on storage.objects
  for select using (
    bucket_id = 'agreements'
    and (
      public.is_admin()
      or public.owns_brand(nullif(split_part(name, '/', 1), '')::uuid)
      or exists (
        select 1 from public.creators c
         where c.id = nullif(split_part(name, '/', 1), '')::uuid
           and c.user_id = auth.uid()
      )
    )
  );

-- Writing is the server's job alone. The service role bypasses RLS, so the
-- absence of an insert policy is the whole control.
drop policy if exists agreements_write_none on storage.objects;

-- ── What landed ──────────────────────────────────────────────
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'agreements'
      and column_name in ('signer_name','signer_title','signer_email',
                          'legal_entity_name','template_sha256','document_path'))  as new_columns,
  (select count(*) from pg_trigger
    where tgname = 'agreements_pin_signature' and not tgisinternal)                as signature_trigger,
  (select count(*) from storage.buckets where id = 'agreements')                   as bucket,
  (select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'agreements_read_own')                                      as read_policy;
