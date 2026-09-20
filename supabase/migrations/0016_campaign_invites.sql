-- ═══════════════════════════════════════════════════════════════
-- KYRO — 0016 — campaign invite links
--
-- Two ways onto a campaign, which is the point:
--
--   · Browse — a creator finds the campaign and applies, brand reviews
--   · Invite link — the brand already knows the creator and sends a link
--
-- The second path skips the queue. A brand who went and found someone has
-- already made the decision an application exists to support, so the invite
-- creates an ACCEPTED application rather than a pending one.
--
-- The landing page has to render for someone who is not signed in yet, and
-- `campaigns` is readable only by signed-in users. So the lookup is a
-- security-definer function that returns the handful of public-facing fields
-- and nothing else — not the brand's id, not its connections, not its other
-- campaigns.
--
-- Run in the Supabase SQL editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════

alter table public.campaigns add column if not exists invite_token text;

create unique index if not exists campaigns_invite_token_uniq
  on public.campaigns(invite_token) where invite_token is not null;

comment on column public.campaigns.invite_token is
  'Opaque token for the off-platform invite link. Null until the brand asks for one. Rotating it invalidates every link already sent.';

/**
 * Mint (or return) a campaign's invite token.
 *
 * Only the brand that owns the campaign may call it. `rotate` issues a new
 * token, which is how a brand kills a link that got forwarded somewhere they
 * did not intend.
 */
create or replace function public.campaign_invite_token(p_campaign_id uuid, p_rotate boolean default false)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if not exists (
    select 1 from public.campaigns c
      join public.brands b on b.id = c.brand_id
     where c.id = p_campaign_id and b.owner_user_id = auth.uid()
  ) and not public.is_admin() then
    raise exception 'That campaign is not yours.';
  end if;

  select invite_token into v_token from public.campaigns where id = p_campaign_id;

  if v_token is null or p_rotate then
    -- url-safe, ~22 chars. base64 then strip the characters that need
    -- escaping in a URL, rather than hand-rolling an alphabet.
    loop
      v_token := replace(replace(replace(encode(gen_random_bytes(16), 'base64'), '+', ''), '/', ''), '=', '');
      v_token := substr(v_token, 1, 22);
      exit when not exists (select 1 from public.campaigns where invite_token = v_token);
    end loop;

    update public.campaigns set invite_token = v_token where id = p_campaign_id;
  end if;

  return v_token;
end;
$$;

/**
 * What an invite link shows before anyone signs in.
 *
 * Deliberately narrow. A token that leaks should expose a campaign pitch and
 * nothing that helps someone act as the brand.
 */
create or replace function public.campaign_by_invite(p_token text)
returns table (
  campaign_id       uuid,
  campaign_name     text,
  brand_name        text,
  brand_logo_url    text,
  cover_url         text,
  brief             text,
  content_style     text,
  deliverable_spec  text,
  commission_bps    integer,
  clearing_days     integer,
  status            text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, b.name, b.logo_url, c.cover_url, c.brief, c.content_style,
         c.deliverable_spec, c.commission_rate_bps, c.clearing_days, c.status::text
    from public.campaigns c
    join public.brands b on b.id = c.brand_id
   where c.invite_token = p_token
     and p_token is not null
     and length(p_token) >= 10;
$$;

/**
 * Take the invite.
 *
 * Creates an accepted application for the calling creator. Upserts, so a
 * creator who opens the same link twice does not get an error, and a creator
 * who had previously been declined is accepted by the invite — the brand has
 * just changed its mind in the most explicit way available.
 */
create or replace function public.accept_campaign_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign uuid;
  v_creator  uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.';
  end if;

  select id into v_campaign from public.campaigns where invite_token = p_token;
  if v_campaign is null then
    raise exception 'That invite link is not valid any more.';
  end if;

  select id into v_creator from public.creators where user_id = auth.uid();
  if v_creator is null then
    raise exception 'Only creator accounts can join a campaign.';
  end if;

  insert into public.applications (campaign_id, creator_id, status, intake_path)
  values (v_campaign, v_creator, 'accepted', 'invite')
  on conflict (campaign_id, creator_id)
  do update set status = 'accepted';

  return v_campaign;
end;
$$;

-- The landing page runs before sign-in, so anon needs the lookup. It does not
-- need, and does not get, either of the others.
grant execute on function public.campaign_by_invite(text)            to anon, authenticated;
grant execute on function public.campaign_invite_token(uuid, boolean) to authenticated;
grant execute on function public.accept_campaign_invite(text)         to authenticated;

-- ── What landed ──────────────────────────────────────────────
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'campaigns' and column_name = 'invite_token') as invite_column,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('campaign_invite_token','campaign_by_invite','accept_campaign_invite')) as functions;
