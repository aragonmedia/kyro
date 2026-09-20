-- ═══════════════════════════════════════════════════════════════
-- Point the demo brands at logo files in /public/brand-logos/.
--
-- Run this only after the files are actually in that folder and pushed.
-- A logo_url pointing at nothing is worse than a null one: null renders the
-- gradient initial, a broken path renders the gradient initial only after a
-- failed request.
--
-- Safe to run more than once. Re-run it after adding a file that was missing.
-- ═══════════════════════════════════════════════════════════════

update public.brands
   set logo_url = case handle
                    when 'demo-bold-buns'   then '/brand-logos/bold-buns.png'
                    when 'demo-jaje-health' then '/brand-logos/jaje-health.png'
                    when 'demo-fuel'        then '/brand-logos/fuel.png'
                    when 'demo-lebanta'     then '/brand-logos/lebanta.png'
                  end
 where handle in ('demo-bold-buns', 'demo-jaje-health', 'demo-fuel', 'demo-lebanta');

select name, handle, logo_url from public.brands where handle like 'demo-%' order by name;
