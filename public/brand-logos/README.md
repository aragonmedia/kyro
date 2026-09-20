# Brand logos

Temporary home for brand logos while KYRO is pre-launch. Once brands onboard
themselves they upload their own logo to their profile and `brands.logo_url`
points at Supabase Storage instead. Nothing here is load-bearing: a brand with
no logo renders a gradient initial, which is deliberate — a missing logo should
look intentional, not broken.

## Adding one

Drop a file in this folder named after the brand's handle without the `demo-`
prefix:

| Brand | File |
|---|---|
| Bold Buns | `bold-buns.png` |
| Jaje Health | `jaje-health.png` |
| Fuel | `fuel.png` |
| Lebanta | `lebanta.png` |

Then run `supabase/seed/set_brand_logos.sql` to point the rows at them.

## What works best

- **Square**, roughly 400×400. They render at 16–48px, so detail is lost anyway.
- **Transparent PNG** if you have it. Logos are drawn with `object-contain` on
  the surface colour, so a white box around the mark will show as a white box in
  dark mode.
- **The mark, not the packaging.** A cropped product photo reads as noise at
  18px next to the campaign's cover image, which is already the product.
