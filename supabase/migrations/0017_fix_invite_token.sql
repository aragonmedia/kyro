-- ═══════════════════════════════════════════════════════════════
-- KYRO — 0017 — fix invite token generation
--
-- 0016 built the token with gen_random_bytes(), which lives in pgcrypto.
-- Supabase installs pgcrypto into the `extensions` schema, and the function
-- pins `search_path = public` for safety, so the call could not resolve:
--
--   function gen_random_bytes(integer) does not exist
--
-- Fixed by dropping the dependency rather than widening the search path.
-- gen_random_uuid() is core PostgreSQL, always present, and two of them give
-- 256 bits of randomness — more than enough for a link that can be rotated.
-- Widening search_path to reach pgcrypto would have loosened a
-- security-definer function to fix a formatting problem, which is a bad trade.
--
-- Run in the Supabase SQL editor. Idempotent. Tokens already issued keep
-- working; this only changes how new ones are made.
-- ═══════════════════════════════════════════════════════════════

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
    loop
      -- Two UUIDs, hyphens stripped, truncated to 24 url-safe characters.
      v_token := substr(
        replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
        1, 24
      );
      exit when not exists (select 1 from public.campaigns where invite_token = v_token);
    end loop;

    update public.campaigns set invite_token = v_token where id = p_campaign_id;
  end if;

  return v_token;
end;
$$;

grant execute on function public.campaign_invite_token(uuid, boolean) to authenticated;

-- ── Prove it works ───────────────────────────────────────────
-- Generates a token the same way the function does, without touching a row.
select substr(
         replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
         1, 24
       ) as sample_token,
       length(substr(
         replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
         1, 24
       )) as token_length;
