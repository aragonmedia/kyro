-- ═══════════════════════════════════════════════════════════════
-- KYRO — 0018 — paying creators
--
-- A brand owes creator commission on attributed orders, plus KYRO's fee. This
-- is the record of that money actually moving.
--
--   payment_runs       one batch: what was owed, what KYRO takes, when
--   payment_run_items  which earnings rows the batch covered
--
-- A run exists so the money is auditable in both directions: a creator can be
-- told which orders a payout covered, and a brand can be told what a debit was
-- for. Marking earnings paid without that record would make both questions
-- unanswerable a month later.
--
-- ⚠ Creating a run does NOT move money. Nothing here talks to a bank or a card
--   processor. The run records an authorised amount; settlement is operational
--   until a processor is connected. The status column says which state a run
--   is in so nothing has to be inferred.
--
-- Run in the Supabase SQL editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════

do $$ begin
  create type public.payment_run_status as enum ('authorized', 'processing', 'settled', 'failed', 'cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.payment_runs (
  id                 uuid primary key default gen_random_uuid(),
  brand_id           uuid not null references public.brands(id) on delete cascade,
  status             public.payment_run_status not null default 'authorized',
  -- Split out rather than derived, so a change to the fee rule later cannot
  -- silently rewrite what a brand was actually charged.
  commission_cents   bigint not null default 0,
  platform_fee_cents bigint not null default 0,
  total_cents        bigint not null default 0,
  order_count        integer not null default 0,
  creator_count      integer not null default 0,
  method             text,
  authorized_at      timestamptz not null default now(),
  settled_at         timestamptz,
  note               text,
  created_at         timestamptz not null default now()
);

create index if not exists payment_runs_brand_idx on public.payment_runs(brand_id, created_at desc);

create table if not exists public.payment_run_items (
  run_id     uuid not null references public.payment_runs(id) on delete cascade,
  earning_id uuid not null references public.earnings(id) on delete cascade,
  primary key (run_id, earning_id)
);

alter table public.payment_runs      enable row level security;
alter table public.payment_run_items enable row level security;

drop policy if exists payment_runs_read on public.payment_runs;
create policy payment_runs_read on public.payment_runs for select
  using (
    public.is_admin()
    or exists (select 1 from public.brands b
                where b.id = payment_runs.brand_id and b.owner_user_id = auth.uid())
  );

drop policy if exists payment_run_items_read on public.payment_run_items;
create policy payment_run_items_read on public.payment_run_items for select
  using (
    public.is_admin()
    or exists (select 1 from public.payment_runs r
                 join public.brands b on b.id = r.brand_id
                where r.id = payment_run_items.run_id and b.owner_user_id = auth.uid())
  );

-- Runs are only ever created by the function below, which does the sums
-- itself. A client that could insert one could invent what it owed.
revoke insert, update, delete on public.payment_runs      from anon, authenticated;
revoke insert, update, delete on public.payment_run_items from anon, authenticated;

/**
 * Authorise payment of everything currently due.
 *
 * Due means `available`: the order was fulfilled and has cleared its window.
 * Pending and clearing earnings are deliberately excluded — a brand should
 * not be asked to pay for an order that could still be refunded.
 *
 * The amounts are summed here, from the rows, inside the transaction that
 * marks them paid. That is what stops a client naming its own total, and what
 * stops the same earning being paid by two concurrent runs.
 */
create or replace function public.authorize_payment_run(p_brand_id uuid, p_method text default null)
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
begin
  if not exists (
    select 1 from public.brands b where b.id = p_brand_id and b.owner_user_id = auth.uid()
  ) and not public.is_admin() then
    raise exception 'That brand is not yours.';
  end if;

  -- Lock the rows we are about to pay so a second click cannot pay them twice.
  create temporary table if not exists _run_earnings (id uuid primary key) on commit drop;
  delete from _run_earnings;

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

grant execute on function public.authorize_payment_run(uuid, text) to authenticated;

-- ── What landed ──────────────────────────────────────────────
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name in ('payment_runs','payment_run_items')) as tables,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'authorize_payment_run') as functions;
