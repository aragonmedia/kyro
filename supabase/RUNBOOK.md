# SQL runbook — after this push

Four files, in this order, all in the **Supabase SQL editor**. Paste the whole
file, hit Run, check the result panel against "you should see" before moving on.

**Push and let Vercel finish first.** Two of these write image paths like
`/campaign-covers/bold-buns.jpg`. Those are files served from your own domain.
If the deploy hasn't landed, the paths are correct in the database but resolve
to nothing in the browser, and it looks like the SQL failed when it didn't.

Every file is safe to run twice. If you lose your place, start over from 1.

---

## 1. `supabase/migrations/0014_products_and_chat.sql`

Creates the products table, the chat tables, and adds `content_style` to
campaigns. Nothing after this works without it.

**You should see:** one row — `content_style_col 1`, and `products`, `threads`,
`messages` all `0`. Zeros are correct here; this only builds the tables.

---

## 2. `supabase/seed/set_demo_covers.sql`

Points the three campaigns at the product images and fixes the brand taglines.

Skip only if you already ran it in the last batch. Running it again is harmless.

**You should see:** four rows. Bold Buns, Fuel and Jaje Health each with a
`cover_url` starting `/campaign-covers/`. Lebanta's is `null` — that one is
deliberate, it has no product shot yet.

---

## 3. `supabase/seed/seed_products.sql`

Content direction for all four campaigns, plus the product listings.

Must run **after** 1, because it writes to `content_style` and
`campaign_products`, and both are created in step 1.

**You should see:** four rows, one per brand, each with a truncated style
string and a product count — Bold Buns 2, Fuel 2, Jaje Health 2, Lebanta 1.

⚠ The prices and the bundle products in this file are **demo values**. Only
Bold Buns' $49.99 comes from your own graphic. Replace them before anyone reads
this as live data.

---

## 4. `supabase/seed/set_brand_logos.sql`

Points the four brands at the logos now sitting in `public/brand-logos/`.

**You should see:** four rows, every one with a `logo_url` like
`/brand-logos/bold-buns.png`. No nulls.

---

## Then check it in the app

Sign in as the creator and open **Browse Campaigns**:

- Each row shows a logo chip next to the brand name
- Each row shows the commission rate and a line of style direction
- **View campaign** opens products with images and prices

If a logo chip shows a gradient letter instead of the logo, step 4 ran but the
file isn't deployed yet — check the push, not the SQL.
