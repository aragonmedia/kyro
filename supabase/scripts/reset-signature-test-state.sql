-- ═══════════════════════════════════════════════════════════════
-- KYRO: put the signature and tax flows back to the start
--
-- NOT a migration. This is an operational script for rehearsing the brand
-- and creator journeys on real accounts, and it is destructive on purpose.
-- Nothing runs it automatically and nothing depends on it having been run.
--
-- What it does, for every account EXCEPT the one named below:
--
--   · removes their signature records, so both portals ask again
--   · clears their tax details back to not collected
--
-- What it deliberately leaves alone:
--
--   · the Shopify review account, so a reviewer mid-assessment is untouched
--   · every signed PDF already in the agreements bucket. The records go, the
--     documents stay, which is the right way round: a file nobody points at
--     is clutter, a record pointing at a file that was deleted is a lie
--   · Stripe state, campaigns, submissions, earnings and payment runs. If
--     you want the Stripe side reset too, that is migration 0036, and it
--     belongs to the live-key switch rather than to a rehearsal
--
-- Safe to run more than once. Running it when nothing has been signed does
-- nothing at all.
-- ═══════════════════════════════════════════════════════════════

do $$
declare
  -- The one account left untouched. Change this and nothing else.
  v_keep_email text := 'review@itskyro.com';
  v_keep_user  uuid;
  v_agreements int;
  v_creators   int;
begin
  select id into v_keep_user from public.profiles where lower(email) = lower(v_keep_email);

  if v_keep_user is null then
    raise notice 'No account found for %, so nothing is being preserved. Stopping rather than guessing.', v_keep_email;
    return;
  end if;

  -- Signature records. A brand's document is kept if the brand belongs to the
  -- preserved account; a creator's is kept if it is that account's own.
  with gone as (
    delete from public.agreements a
     where a.user_id is distinct from v_keep_user
       and (
         a.brand_id is null
         or a.brand_id not in (
           select b.id from public.brands b where b.owner_user_id = v_keep_user
         )
       )
    returning 1
  )
  select count(*) into v_agreements from gone;

  -- Tax details, back to an empty form.
  with reset as (
    update public.creators c
       set tax_form_status       = 'not_collected',
           tax_legal_name        = null,
           tax_entity_type       = null,
           tax_address           = null,
           tax_country           = null,
           tax_form_submitted_at = null
     where c.user_id is distinct from v_keep_user
       and (c.tax_form_status <> 'not_collected' or c.tax_legal_name is not null)
    returning 1
  )
  select count(*) into v_creators from reset;

  raise notice 'Preserved % (user %).', v_keep_email, v_keep_user;
  raise notice 'Removed % signature record(s). Reset tax details on % creator(s).', v_agreements, v_creators;
end $$;

-- ── Where things stand now ───────────────────────────────────
select
  (select count(*) from public.agreements)                                    as signatures_on_file,
  (select count(*) from public.creators where tax_form_status = 'complete')   as creators_with_tax_accepted,
  (select count(*) from public.creators where tax_form_status = 'pending')    as creators_awaiting_review,
  (select count(*) from public.campaigns where status = 'live')               as live_campaigns;
