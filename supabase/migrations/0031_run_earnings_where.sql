-- ═══════════════════════════════════════════════════════════════
-- KYRO, 0031: a WHERE clause for a scratch table
--
-- Pressing Pay returned "DELETE requires a WHERE clause". Supabase runs with
-- a safety guard that refuses an unqualified DELETE, and
-- authorize_payment_run_for clears its temporary scratch table with a bare
-- `delete from _run_earnings`. The guard stops the statement, the function
-- raises, the whole transaction rolls back, and no run is created.
--
-- The line has been there since 0018 and never fired, because until this week
-- nothing ever charged anybody. The first real payment run found it.
--
-- `where true` satisfies the guard and means exactly what the bare form meant.
-- The table is created `on commit drop`, so it is empty anyway on every call;
-- the delete is belt and braces against a session that somehow reuses it.
--
-- Everything else in this function is unchanged from 0029.
--
-- Run in the Supabase SQL editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.authorize_payment_run_for(p_brand_id uuid, p_method text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run        uuid;
  v_commission bigint;
  v_fee        bigint;
  v_orders     integer;
  v_creators   integer;
  v_shopify    boolean;
begin
  select b.billing_origin = 'shopify_app_store' into v_shopify
    from public.brands b where b.id = p_brand_id;

  -- Lock the rows we are about to pay so a second click cannot pay them twice.
  create temporary table if not exists _run_earnings (id uuid primary key) on commit drop;
  delete from _run_earnings where true;

  insert into _run_earnings (id)
  select e.id
    from public.earnings e
   where e.brand_id = p_brand_id
     and e.state = 'available'
   for update;

  select coalesce(sum(e.commission_cents), 0),
         coalesce(sum(e.platform_fee_cents), 0),
         count(*),
         count(distinct e.creator_id)
    into v_commission, v_fee, v_orders, v_creators
    from public.earnings e
    join _run_earnings r on r.id = e.id;

  if v_orders = 0 then
    raise exception 'Nothing is due right now.';
  end if;

  if coalesce(v_shopify, false) then
    v_fee := 0;
  end if;

  insert into public.payment_runs
    (brand_id, status, commission_cents, platform_fee_cents, total_cents,
     order_count, creator_count, method)
  values
    (p_brand_id, 'authorized', v_commission, v_fee, v_commission + v_fee,
     v_orders, v_creators, p_method)
  returning id into v_run;

  insert into public.payment_run_items (run_id, earning_id)
  select v_run, r.id from _run_earnings r;

  update public.earnings e
     set state = 'paid', state_changed_at = now()
    from _run_earnings r
   where e.id = r.id;

  return v_run;
end;
$$;

revoke execute on function public.authorize_payment_run_for(uuid, text) from public, anon, authenticated;
grant execute on function public.authorize_payment_run_for(uuid, text) to service_role;

-- ── What landed ──────────────────────────────────────────────
-- Reads the stored source back, so this reports what the database will
-- actually run rather than what this file hoped to install.
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'authorize_payment_run_for') as function_present,
  (select position('delete from _run_earnings where true' in pg_get_functiondef(p.oid)) > 0
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'authorize_payment_run_for'
    limit 1) as where_clause_present;
