-- ═══════════════════════════════════════════════════════════════
-- Which account owns what, and how to move Bold Buns if it landed wrong.
--
-- adopt_bold_buns.sql resolved "the brand test account" as the oldest profile
-- with role = 'brand'. With more than one brand account on the project that is
-- a guess. This shows you the truth, and fixes it if the guess was wrong.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Who owns what ─────────────────────────────────────────
-- Find the row whose email is the account you actually sign in with.

select p.email,
       p.role,
       p.created_at::date as signed_up,
       b.name   as brand,
       b.handle,
       (select count(*) from public.campaigns   c where c.brand_id = b.id) as campaigns,
       (select count(*) from public.submissions s where s.brand_id = b.id) as submissions,
       (select count(*) from public.earnings    e where e.brand_id = b.id) as earnings
  from public.profiles p
  left join public.brands b on b.owner_user_id = p.id
 where p.role = 'brand'
 order by p.created_at;

-- ── 2. Only if Bold Buns is on the wrong account ─────────────
--
-- Put YOUR brand login's email between the quotes, uncomment the block, run
-- it. It moves the Bold Buns brand row itself rather than its children, so
-- every campaign, submission, order, earning and thread comes with it.
--
-- The brand row that account currently owns is left in place but renamed, so
-- nothing is destroyed and getMyBrand() — which takes the OLDEST brand a user
-- owns — still lands on Bold Buns.

/*
do $$
declare
  v_target uuid;
  v_bold   uuid;
  v_old    uuid;
begin
  select id into v_target from public.profiles where email = 'PUT-YOUR-EMAIL-HERE';
  if v_target is null then
    raise exception 'No account with that email.';
  end if;

  select id into v_bold from public.brands where handle = 'bold-buns';
  if v_bold is null then
    raise exception 'No brand with handle bold-buns. Run adopt_bold_buns.sql first.';
  end if;

  -- Anything that account already owns steps aside, keeping its own data.
  select id into v_old
    from public.brands
   where owner_user_id = v_target and id <> v_bold
   order by created_at
   limit 1;

  if v_old is not null then
    update public.brands set owner_user_id = null where id = v_old;
    raise notice 'Released the previous brand row so Bold Buns is the only one.';
  end if;

  -- Backdate so it sorts first for getMyBrand(), which orders by created_at.
  update public.brands
     set owner_user_id = v_target,
         created_at = least(created_at, now() - interval '5 years')
   where id = v_bold;
end $$;

select p.email, b.name, b.handle, b.setup_complete
  from public.brands b join public.profiles p on p.id = b.owner_user_id
 where p.role = 'brand';
*/
